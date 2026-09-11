// The verification loop (SPEC 8.5; MILESTONES M2 item 4 verify/): `turboslide export … --verify`
// renders the exported file, not the exporter's intent. verifyPptx(reportPath, options) reads an
// ExportReport the PPTX builder wrote (a per-theme report or the merged one), converts every .pptx
// it lists through LibreOffice to PDF and poppler to page PNGs, diffs each page against the
// Turboslide render of the same slide at the same revision with pixelmatch at threshold 0.1 (native
// at 1600 by 900; flatten at 3200 by 1800, the scale of the sheet raster the slide carries, because
// a 2x raster downsampled by any viewer never reproduces a 1x render's antialiasing, measured on
// the deck at 0.1 to 0.4 percent per text slide),
// measures every block's ink box offset against the per-kind budgets (diff.ts: ink past a third of
// the way from the background to the block's ink color, the search clamped to the block when a
// neighbour overlaps its ring), reads the EMU geometry back (the page bounds, and per raster block
// the box of the shapes named `ts:<slideId>#<blockId>:<n>`, carried in the summary), fills the
// `verify` section of every slide, sets `geometryInBounds`, `passed` and `residual`, writes the
// report back and returns it. Flatten passes under 0.1 percent mismatched pixels per slide; native
// passes when every block of every all-native slide is within budget, and lists the slides with
// raster blocks in the residual (MILESTONES M2 acceptance).
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';

import type { ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import type { Box, RenderRecord, Theme } from '@turboslide/schema/render';

import { readGeometry } from '../ooxml/geometry.ts';
import type { ShapeBounds } from '../ooxml/geometry.ts';
import { openPackage } from '../ooxml/zip.ts';
import { emuToPx } from '../units.ts';
import { DEFAULT_BUDGETS, DIA_EDGE_TOLERANCE, blockKind, mergeBudgets } from './budgets.ts';
import type { Budgets } from './budgets.ts';
import { compareBlock, cropPng, diffImages, diffImagesOutside, readPng, writePng } from './diff.ts';
import type { BlockDelta, BlockToCompare, MaskedImageDiff, Png } from './diff.ts';
import { checkGeometry, geometryResidual } from './geometry.ts';
import type { GeometryCheck } from './geometry.ts';
import { renderPptxPages, resolveTools } from './libreoffice.ts';
import type { RenderPagesResult, ToolPaths } from './libreoffice.ts';
import {
  ensureReference,
  readReference,
  referenceImage,
  referenceRecord,
  workspaceRoot,
} from './reference.ts';
import type { ReferenceScale, ReferenceSet } from './reference.ts';

/**
 * Flatten pages are compared at the scale of the sheet raster they carry (SPEC 8.2: one 2x PNG
 * per slide), so the PDF is rasterized at 3200 by 1800 and the reference is `render --scale 2`.
 * Native pages are compared at 1x, where the text budgets of SPEC 8.5 are stated.
 */
export const FLATTEN_REFERENCE_SCALE: ReferenceScale = 2;

export type VerifyOptions = {
  /** The deck directory; defaults to decks/<deckId> under the workspace root or TURBOSLIDE_DECK. */
  deckDir?: string;
  /**
   * A render directory (render.json plus PNGs) to use as the reference for every theme; when
   * absent the loop renders `<outDir>/reference-<theme>` through the turboslide CLI.
   */
  referenceDir?: string;
  /** Where PDFs, pages and diffs land; default `<report dir>/verify`. */
  outDir?: string;
  budgets?: Partial<Budgets>;
  tools?: ToolPaths;
  timeoutMs?: number;
  /** Only these slide ids; the rest keep no verify section and do not count. */
  slideIds?: readonly string[];
  /** Replaces LibreOffice and poppler: returns page PNG paths for a .pptx (tests, calibration). */
  renderPages?: (pptxPath: string, outDir: string) => Promise<RenderPagesResult>;
  log?: (line: string) => void;
  onSlide?: (slide: SlideVerification) => void;
  env?: NodeJS.ProcessEnv;
  /** Write the report back to reportPath (default true). */
  write?: boolean;
};

export type SlideVerification = {
  file: string;
  theme: Theme;
  n: number;
  slideId: string;
  mismatch: number;
  /** Outside regenerated picture regions. */
  fraction: number;
  /** The reference scale the diff ran at. */
  scale: ReferenceScale;
  /** Regenerated picture regions against the embedded sheet shot, when the slide carries one. */
  pictureMismatch?: number;
  pictureFraction?: number;
  /** Block deltas in sheet px (divided by the scale). */
  blocks: BlockDelta[];
  ref: string;
  got: string;
  diff: string;
  /** In flatten mode the slide budget; in native mode every block of an all-native slide. */
  ok: boolean;
  allNative: boolean;
};

export type FileVerification = {
  file: string;
  theme: Theme;
  pdf: string;
  pages: number;
  slides: SlideVerification[];
  geometry: GeometryCheck;
  versions: RenderPagesResult['versions'];
  convertMs: number;
  rasterMs: number;
  diffMs: number;
  referenceDir: string;
};

export type VerifySummary = {
  reportPath: string;
  mode: ExportReport['mode'];
  revision: number;
  budgets: Budgets;
  files: FileVerification[];
  passed: boolean;
  geometryInBounds: boolean;
  residual: string[];
  ms: number;
};

export const VERIFY_SUMMARY = 'verify-summary.json';

function themeOfFile(path: string, fallback: Theme): Theme {
  const m = /-(light|dark)\.pptx$/i.exec(basename(path));
  return m?.[1] === 'dark' ? 'dark' : m?.[1] === 'light' ? 'light' : fallback;
}

function defaultDeckDir(deckId: string, env: NodeJS.ProcessEnv): string {
  if (env.TURBOSLIDE_DECK) return resolve(env.TURBOSLIDE_DECK);
  const root = workspaceRoot();
  const candidate = root ? join(root, 'decks', deckId) : join(process.cwd(), 'decks', deckId);
  return candidate;
}

/**
 * Top-level blocks of a record (row sub-entries `<blockId>/<i>` are folded into their block), with
 * the boxes multiplied by `scale` so they address a reference image at that scale, and the
 * recorded text color when the record carries one.
 */
export function blocksOfRecord(record: RenderRecord, scale: ReferenceScale = 1): BlockToCompare[] {
  return (
    Object.entries(record.blocks)
      // a composite is a grid with no ink of its own; its cells' blocks are records too and are
      // compared as themselves (M5), and its union box would only re-measure their edges
      .filter(([id, block]) => !id.includes('/') && block.type !== 'composite')
      .map(([blockId, block]) => ({
        blockId,
        type: block.type,
        box: [
          block.box[0] * scale,
          block.box[1] * scale,
          block.box[2] * scale,
          block.box[3] * scale,
        ],
        ...(block.color === undefined ? {} : { color: block.color }),
      }))
  );
}

/** Every shape of the package by slide part (`ppt/slides/slide<n>.xml`, n the page number). */
export async function shapesByPart(pptx: string): Promise<Map<string, ShapeBounds[]>> {
  const shapes = await readGeometry(await openPackage(new Uint8Array(await readFile(pptx))));
  const out = new Map<string, ShapeBounds[]>();
  for (const shape of shapes) {
    const list = out.get(shape.part) ?? [];
    list.push(shape);
    out.set(shape.part, list);
  }
  return out;
}

/**
 * The union box, in image pixels at `scale`, of the shapes the exporter named after a block: the
 * exact name `ts:<slideId>#<blockId>` or a raster part `ts:<slideId>#<blockId>:<n>`
 * (pptx/images.ts). Text runs (`#<blockId>/<pointer>`) are not shapes of the block's box and are
 * left out. Null when the part holds no such shape. Read back so the summary shows where the file
 * put a raster; the placement delta stays an ink measurement, because the exporter's box is the
 * element rect the extractor measured and the record's box is the same rect rounded, which differ
 * by up to 1.5 px on the deck while the painted raster lands within 1 px of the reference.
 */
export function shapeBoxFor(
  shapes: readonly ShapeBounds[],
  slideId: string,
  blockId: string,
  scale: ReferenceScale = 1,
): Box | null {
  const name = `ts:${slideId}#${blockId}`;
  const own = shapes.filter((s) => s.name === name || s.name.startsWith(`${name}:`));
  if (own.length === 0) return null;
  const x0 = Math.min(...own.map((s) => s.off[0]));
  const y0 = Math.min(...own.map((s) => s.off[1]));
  const x1 = Math.max(...own.map((s) => s.off[0] + s.ext[0]));
  const y1 = Math.max(...own.map((s) => s.off[1] + s.ext[1]));
  const px = (emu: number): number => Math.round(emuToPx(emu) * scale * 100) / 100;
  return [px(x0), px(y0), px(x1 - x0), px(y1 - y0)];
}

/**
 * The blocks of a slide compared against a page: every block sees the others as neighbours, a
 * block whose record lists an opaque raster (a shot or html picture, `alpha` false) is measured
 * on its edge, and in native mode a line or raster block carries the box of its exported shapes.
 */
export function compareBlocks(
  ref: Png,
  got: Png,
  record: RenderRecord,
  options: {
    scale: ReferenceScale;
    budgets: Budgets;
    shapes?: readonly ShapeBounds[];
    slideId: string;
  },
): BlockDelta[] {
  const blocks = blocksOfRecord(record, options.scale);
  return blocks.map((block) => {
    const neighbours = blocks.filter((other) => other !== block).map((other) => other.box);
    // a diagram raster is measured on its edge like an opaque picture: its hairlines are its
    // structure and it arrives unresampled at 1x (M5), while the cut at a third left a two-stroke
    // junction 0.006 past the threshold in the reference and 0.006 short in the page
    // (diagrams#dia3, round four)
    const dia = block.type === 'dia';
    const opaque = record.rasters.some((r) => r.blockId === block.blockId && !r.alpha) || dia;
    const shape =
      options.shapes && blockKind(block.type) !== 'text'
        ? shapeBoxFor(options.shapes, options.slideId, block.blockId, options.scale)
        : undefined;
    return compareBlock(
      ref,
      got,
      {
        ...block,
        neighbours,
        opaque,
        shape,
        ...(dia ? { edgeTolerance: DIA_EDGE_TOLERANCE } : {}),
      },
      options.budgets,
    );
  });
}

/** The regenerated picture regions of a page, in image px, against the sheet shot the page embeds. */
export function comparePictureRegions(
  sheet: Png,
  got: Png,
  regions: readonly Box[],
  threshold: number,
): { mismatch: number; fraction: number } {
  let mismatch = 0;
  let total = 0;
  for (const box of regions) {
    const a = cropPng(sheet, box);
    const b = cropPng(got, box);
    if (!a || !b) continue;
    const d = diffImages(a, b, threshold);
    mismatch += d.mismatch;
    total += d.total;
  }
  return { mismatch, fraction: total === 0 ? 0 : mismatch / total };
}

function relativeTo(dir: string, path: string): string {
  const rel = relative(dir, path);
  return rel.startsWith('..') || isAbsolute(rel) ? path : rel;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Verifies every .pptx an export report lists and writes the verified report back. Each file takes
 * the report's `slides` of its theme when every entry names one (the reports the exporter writes
 * since the M2 review); a report without themes is consumed in order, one run of pages per file,
 * which fits both the per-theme report (one file, the deck's slides) and the merged report (every
 * file, the slides of every theme in file order). Every verified entry leaves with its `theme`.
 */
export async function verifyPptx(
  reportPath: string,
  options: VerifyOptions = {},
): Promise<ExportReport> {
  const started = performance.now();
  const env = options.env ?? process.env;
  const log = options.log ?? (() => {});
  const budgets = mergeBudgets(options.budgets);
  const reportDir = dirname(resolve(reportPath));
  const report = exportReportSchema.parse(JSON.parse(readFileSync(reportPath, 'utf8')));
  const outDir = options.outDir ?? join(reportDir, 'verify');
  await mkdir(outDir, { recursive: true });
  const deckDir = options.deckDir ?? defaultDeckDir(report.deckId, env);
  const tools = options.tools ?? resolveTools(env);
  const scale: ReferenceScale = report.mode === 'flatten' ? FLATTEN_REFERENCE_SCALE : 1;
  const renderPages =
    options.renderPages ??
    ((pptx: string, dir: string) =>
      renderPptxPages(pptx, dir, {
        tools,
        timeoutMs: options.timeoutMs,
        log,
        width: 1600 * scale,
        height: 900 * scale,
      }));

  const pptxFiles = report.files
    .map((f) => (isAbsolute(f.path) ? f.path : resolve(reportDir, f.path)))
    .filter((p) => extname(p).toLowerCase() === '.pptx');
  if (pptxFiles.length === 0) throw new RangeError(`verify: ${reportPath} lists no .pptx file`);

  const residual = report.residual.filter((line) => !line.startsWith('verify:'));
  const files: FileVerification[] = [];
  const slides = report.slides.map((s) => ({ ...s }));
  const themed = slides.every((s) => s.theme !== undefined);
  let cursor = 0;
  let geometryInBounds = true;
  let allOk = true;
  const wanted = options.slideIds ? new Set(options.slideIds) : null;

  for (const pptx of pptxFiles) {
    const theme = themeOfFile(pptx, report.theme);
    const fileOut = join(outDir, basename(pptx, '.pptx'));
    await mkdir(fileOut, { recursive: true });
    if (!existsSync(pptx)) {
      residual.push(`verify: ${pptx} is missing`);
      allOk = false;
      continue;
    }
    log(`verify: ${basename(pptx)} (${theme})`);
    const geometry = await checkGeometry(pptx);
    if (!geometry.inBounds) geometryInBounds = false;
    for (const line of geometryResidual(geometry))
      residual.push(`verify: ${basename(pptx)}: ${line}`);
    // native mode: the shapes per part, so a raster block's summary names the box the file holds
    const partShapes = report.mode === 'native' ? await shapesByPart(pptx) : null;

    const rendered = await renderPages(pptx, fileOut);
    const count = rendered.pages.length;
    // the file's slides: the entries of its theme, or one run of slides per file when the report
    // predates the theme field (the merged report lists every theme's slides in file order)
    const slice = themed
      ? slides.filter((s) => s.theme === theme)
      : slides.slice(cursor, cursor + Math.floor(slides.length / pptxFiles.length));
    const expected = slice.length;
    if (count !== expected) {
      residual.push(`verify: ${basename(pptx)} rendered ${count} page(s) for ${expected} slide(s)`);
      allOk = false;
    }
    const slideIds = slice.map((s) => s.slideId);
    cursor += expected;

    // the reference: the caller's render directory, or a render of this theme on demand
    let reference: ReferenceSet;
    const referenceDir = options.referenceDir ?? join(outDir, `reference-${theme}`);
    if (options.referenceDir) {
      const existing = readReference(options.referenceDir);
      const missing = slideIds.filter(
        (id) => !existing || !referenceRecord(existing, id, theme, scale),
      );
      reference =
        existing && missing.length === 0
          ? existing
          : await ensureReference({
              dir: referenceDir,
              deckDir,
              theme,
              slideIds,
              scale,
              revision: report.revision,
              env,
              log,
            });
    } else {
      reference = await ensureReference({
        dir: referenceDir,
        deckDir,
        theme,
        slideIds,
        scale,
        revision: report.revision,
        env,
        log,
      });
    }

    const t = performance.now();
    const verified: SlideVerification[] = [];
    for (const [i, page] of rendered.pages.entries()) {
      const entry = slice[i];
      if (!entry) break;
      if (wanted && !wanted.has(entry.slideId)) continue;
      const record = referenceRecord(reference, entry.slideId, theme, scale);
      const n = i + 1;
      if (!record) {
        residual.push(`verify: no reference render for ${entry.slideId} (${theme})`);
        allOk = false;
        continue;
      }
      if (record.revision !== report.revision) {
        residual.push(
          `verify: reference for ${entry.slideId} (${theme}) is revision ${record.revision}, the export is ${report.revision}`,
        );
      }
      const refPath = referenceImage(reference, record);
      const ref = await readPng(refPath);
      const got = await readPng(page);
      // A regenerated two-tone picture (flatten, SPEC 8.2) is a crisp 2x dither where the browser
      // shows a bilinear upscale of the 1x twin, so its region is compared with the sheet shot the
      // page embeds and kept out of the render comparison; every other pixel is gated on the render.
      const regions: Box[] =
        report.mode === 'flatten'
          ? (entry.pictures ?? [])
              .filter((p) => p.regenerated)
              .map((p) => [p.box[0] * scale, p.box[1] * scale, p.box[2] * scale, p.box[3] * scale])
          : [];
      let result: MaskedImageDiff;
      try {
        result = diffImagesOutside(ref, got, regions, budgets.threshold);
      } catch (error) {
        residual.push(
          `verify: ${entry.slideId} (${theme}): ${error instanceof Error ? error.message : String(error)}`,
        );
        allOk = false;
        continue;
      }
      const diffPath = join(fileOut, `${pad(n)}-${entry.slideId}.diff.png`);
      await writePng(diffPath, result.diff);
      const blocks = compareBlocks(ref, got, record, {
        scale,
        budgets,
        slideId: entry.slideId,
        ...(partShapes ? { shapes: partShapes.get(`ppt/slides/slide${n}.xml`) ?? [] } : {}),
      }).map((b) => ({ ...b, dx: b.dx / scale, dy: b.dy / scale, dw: b.dw / scale }));
      const allNative = entry.raster.length === 0;
      let picture: { mismatch: number; fraction: number } | undefined;
      if (regions.length > 0) {
        const sheetPath = entry.sheet ? resolve(reportDir, entry.sheet) : undefined;
        const embedded = sheetPath && existsSync(sheetPath) ? await readPng(sheetPath) : undefined;
        if (embedded && embedded.width === got.width && embedded.height === got.height) {
          picture = comparePictureRegions(embedded, got, regions, budgets.threshold);
        } else {
          picture = {
            mismatch: result.inside.mismatch,
            fraction: result.inside.total === 0 ? 0 : result.inside.mismatch / result.inside.total,
          };
          residual.push(
            `verify: ${entry.slideId} (${theme}): no sheet shot beside the report; the regenerated picture was compared with the render's bilinear upscale`,
          );
        }
      }
      const ok =
        report.mode === 'flatten'
          ? result.fraction <= budgets.flattenFraction &&
            (picture === undefined || picture.fraction <= budgets.flattenFraction)
          : !allNative || blocks.every((b) => b.ok);
      const slide: SlideVerification = {
        file: pptx,
        theme,
        n,
        slideId: entry.slideId,
        mismatch: result.mismatch,
        fraction: result.fraction,
        scale,
        ...(picture
          ? { pictureMismatch: picture.mismatch, pictureFraction: picture.fraction }
          : {}),
        blocks,
        ref: relativeTo(reportDir, refPath),
        got: relativeTo(reportDir, page),
        diff: relativeTo(reportDir, diffPath),
        ok,
        allNative,
      };
      verified.push(slide);
      options.onSlide?.(slide);
      entry.theme = theme;
      entry.verify = {
        mismatch: result.mismatch,
        fraction: result.fraction,
        scale,
        ...(picture
          ? { pictureMismatch: picture.mismatch, pictureFraction: picture.fraction }
          : {}),
        blocks: blocks.map((b) => ({ blockId: b.blockId, dx: b.dx, dy: b.dy, dw: b.dw, ok: b.ok })),
        ref: slide.ref,
        got: slide.got,
        diff: slide.diff,
      };
      if (!ok) {
        allOk = false;
        const failing = blocks
          .filter((b) => !b.ok)
          .map((b) => `${b.blockId} dx ${b.dx} dy ${b.dy} dw ${b.dw}`);
        residual.push(
          report.mode === 'flatten'
            ? `verify: ${entry.slideId} (${theme}) mismatches ${(result.fraction * 100).toFixed(3)} percent${picture ? ` outside the picture, ${(picture.fraction * 100).toFixed(3)} percent in the regenerated picture` : ''}, budget ${(budgets.flattenFraction * 100).toFixed(2)}`
            : `verify: ${entry.slideId} (${theme}) blocks out of budget: ${failing.join('; ')}`,
        );
      } else if (report.mode === 'native' && !allNative) {
        residual.push(
          `verify: ${entry.slideId} (${theme}) has raster blocks ${entry.raster.join(', ')}; per-block budgets not gated`,
        );
      }
      log(
        `  ${pad(n)} ${entry.slideId} ${theme} ${(result.fraction * 100).toFixed(3)} percent${picture ? `, picture ${(picture.fraction * 100).toFixed(3)} percent` : ''}, ${blocks.filter((b) => !b.ok).length} block(s) out of budget${ok ? '' : ' FAIL'}`,
      );
    }
    const withPictures = verified.filter((v) => v.pictureFraction !== undefined);
    if (withPictures.length > 0) {
      const worst = Math.max(...withPictures.map((v) => v.pictureFraction ?? 0));
      residual.push(
        `verify: ${basename(pptx)}: ${withPictures.length} slide(s) carry a regenerated two-tone picture; those regions were compared with the embedded 2x sheet shot (worst ${(worst * 100).toFixed(3)} percent) and excluded from the render comparison (SPEC 8.2)`,
      );
    }
    files.push({
      file: pptx,
      theme,
      pdf: rendered.pdf,
      pages: count,
      slides: verified,
      geometry,
      versions: rendered.versions,
      convertMs: rendered.convertMs,
      rasterMs: rendered.rasterMs,
      diffMs: Math.round(performance.now() - t),
      referenceDir: reference.dir,
    });
    residual.push(
      `verify: ${basename(pptx)} rendered by ${rendered.versions.soffice ?? 'an injected renderer'}${rendered.rasterizer ? `, ${rendered.rasterizer === 'pdftocairo' ? (rendered.versions.pdftocairo ?? 'pdftocairo') : (rendered.versions.pdftoppm ?? 'pdftoppm')}` : ''}; ${count} page(s), ${geometry.shapes} shapes, ${geometry.custGeomCount} custGeom, ${geometry.normAutofitCount} normAutofit, ${geometry.embeddedFonts.length} embedded font(s)`,
    );
  }

  const passed = report.passed && allOk && geometryInBounds;
  const verified: ExportReport = exportReportSchema.parse({
    ...report,
    slides,
    geometryInBounds: report.geometryInBounds && geometryInBounds,
    passed,
    residual,
  });
  const summary: VerifySummary = {
    reportPath,
    mode: report.mode,
    revision: report.revision,
    budgets,
    files,
    passed,
    geometryInBounds: verified.geometryInBounds,
    residual: residual.filter((line) => line.startsWith('verify:')),
    ms: Math.round(performance.now() - started),
  };
  await writeFile(join(outDir, VERIFY_SUMMARY), `${JSON.stringify(summary, null, 2)}\n`);
  if (options.write !== false)
    await writeFile(reportPath, `${JSON.stringify(verified, null, 2)}\n`);
  log(
    `verify: ${passed ? 'passed' : 'FAILED'}; ${files.reduce((n, f) => n + f.slides.length, 0)} slide(s) in ${summary.ms} ms; geometry ${verified.geometryInBounds ? 'in bounds' : 'OUT OF BOUNDS'}`,
  );
  return verified;
}

export { DEFAULT_BUDGETS };
