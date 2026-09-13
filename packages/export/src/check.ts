// export.check (docs/pptx.md "Verification"): `turboslide export check <file.pptx>` reads a file
// the way a viewer will. The zip walk validates the package against its content types and
// relationships (ooxml/validate.ts); the geometry pass reads the page size, every shape's bounds
// and the checklist counts (verify/geometry.ts); the media parts are classed by their bytes (the
// PNG header's color type and bit depth, the JPEG marker) so the report says which page raster
// formats a flatten file uses; the slide names and title placeholders are read back; python-pptx
// reopens the file when an interpreter with the module exists (TURBOSLIDE_PYTHON, then the
// workspace's .turboslide/venv); QuickLook renders the first page on macOS. `valid` is the zip walk
// plus the page size plus the reopen when it ran; every other number is reported, not gated.
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import type { ExportCheck } from '@turboslide/schema/export';
import { exportCheckSchema } from '@turboslide/schema/export';

import { listParts, openPackage, readPart, readPartBytes, slideParts } from './ooxml/zip.ts';
import { hasTitlePlaceholder, readSlideName } from './ooxml/titles.ts';
import { validatePackage } from './ooxml/validate.ts';
import { checkGeometry } from './verify/geometry.ts';
import { quickLookBinary, quickLookThumbnail } from './verify/quicklook.ts';
import { workspaceRoot } from './verify/reference.ts';

const execFileAsync = promisify(execFile);

export type CheckOptions = {
  /** An interpreter with python-pptx; resolvePython finds one when undefined. */
  python?: string;
  env?: NodeJS.ProcessEnv;
  /** Render the first page through QuickLook when available; default true. */
  quickLook?: boolean;
  /** Where the QuickLook thumbnail lands; default `<file dir>/check`. */
  outDir?: string;
  log?: (line: string) => void;
};

/** TURBOSLIDE_PYTHON, else the workspace's `.turboslide/venv/bin/python` when it exists. */
export function resolvePython(
  env: NodeJS.ProcessEnv = process.env,
  cwd?: string,
): string | undefined {
  if (env.TURBOSLIDE_PYTHON) return env.TURBOSLIDE_PYTHON;
  const root = workspaceRoot(cwd) ?? workspaceRoot();
  if (!root) return undefined;
  const venv = join(root, '.turboslide', 'venv', 'bin', 'python');
  return existsSync(venv) ? venv : undefined;
}

/** The raster format of a media part from its first bytes. */
export function mediaFormatOf(bytes: Uint8Array): string {
  if (
    bytes.length > 25 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const depth = bytes[24] ?? 8;
    const colorType = bytes[25] ?? 6;
    if (colorType === 3) return depth === 1 ? 'png-1bit' : 'png-palette';
    if (colorType === 2 || colorType === 6) return 'png-rgba';
    return 'png-gray';
  }
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  return 'other';
}

const PYTHON_SCRIPT = [
  'import sys, json',
  'from pptx import Presentation',
  'p = Presentation(sys.argv[1])',
  'shapes = sum(len(s.shapes) for s in p.slides)',
  'print(json.dumps({"slides": len(p.slides), "shapes": shapes, "width": p.slide_width, "height": p.slide_height}))',
].join('\n');

async function reopenWithPython(python: string, file: string): Promise<ExportCheck['pythonPptx']> {
  try {
    const { stdout } = await execFileAsync(python, ['-c', PYTHON_SCRIPT, file], {
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as { slides: number; shapes: number };
    return { ran: true, python, slides: parsed.slides, shapes: parsed.shapes };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const tail = message.trim().split('\n').slice(-2).join(' | ');
    return { ran: false, python, error: tail };
  }
}

export async function checkPptx(file: string, options: CheckOptions = {}): Promise<ExportCheck> {
  const env = options.env ?? process.env;
  const path = resolve(file);
  if (!existsSync(path)) throw new RangeError(`export check: ${file} does not exist`);
  const bytes = new Uint8Array(await readFile(path));
  const zip = await openPackage(bytes);
  const validation = await validatePackage(zip);
  const geometry = await checkGeometry(bytes);
  const parts = listParts(zip);

  const slideNames: string[] = [];
  let titledSlides = 0;
  // the parity round two counts (gslides-parity SPEC-2 11.3): italic runs, rotated shapes, groups,
  // attached connectors, text boxes with columns, adjust values on a preset (a rounded rectangle's
  // own `adj` is the generator's), tables and merged cells; the chart parts are counted below
  const counts = {
    italicRuns: 0,
    rotated: 0,
    groups: 0,
    connectors: 0,
    numCol: 0,
    avLst: 0,
    tables: 0,
    mergedCells: 0,
  };
  for (const part of slideParts(zip)) {
    const xml = await readPart(zip, part);
    slideNames.push(readSlideName(xml) ?? '');
    if (hasTitlePlaceholder(xml)) titledSlides += 1;
    counts.italicRuns += (xml.match(/<a:rPr\b[^>]*\si="1"/g) ?? []).length;
    counts.rotated += (xml.match(/<a:xfrm\b[^>]*\srot="-?\d+"/g) ?? []).length;
    counts.groups += (xml.match(/<p:grpSp>/g) ?? []).length;
    counts.connectors += (xml.match(/<p:cxnSp>[\s\S]*?<a:(?:stCxn|endCxn)\b/g) ?? []).length;
    counts.numCol += (xml.match(/<a:bodyPr\b[^>]*\snumCol="/g) ?? []).length;
    counts.avLst += (
      xml.match(/<a:prstGeom prst="(?!roundRect")[^"]*"><a:avLst><a:gd\b/g) ?? []
    ).length;
    counts.tables += (xml.match(/<a:tbl>/g) ?? []).length;
    counts.mergedCells += (xml.match(/<a:tc\b[^>]*\s(?:rowSpan|gridSpan)="/g) ?? []).length;
  }
  const notes = parts.filter((p) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p)).length;
  const charts = parts.filter((p) => /^ppt\/charts\/chart\d+\.xml$/.test(p)).length;

  const formats: Record<string, number> = {};
  let mediaBytes = 0;
  for (const part of parts.filter((p) => /^ppt\/media\//.test(p))) {
    const media = await readPartBytes(zip, part);
    mediaBytes += media.byteLength;
    const format = mediaFormatOf(media);
    formats[format] = (formats[format] ?? 0) + 1;
  }

  const python = options.python ?? resolvePython(env, dirname(path));
  const pythonPptx: ExportCheck['pythonPptx'] = python
    ? await reopenWithPython(python, path)
    : {
        ran: false,
        error: 'no interpreter with python-pptx (TURBOSLIDE_PYTHON or .turboslide/venv)',
      };

  let quickLook: ExportCheck['quickLook'] = { ran: false };
  if (options.quickLook !== false) {
    const bin = quickLookBinary(env);
    if (!bin) quickLook = { ran: false, error: 'qlmanage unavailable' };
    else {
      const outDir = options.outDir ?? join(dirname(path), 'check');
      try {
        const thumb = await quickLookThumbnail(path, outDir, { bin, env, log: options.log });
        quickLook = thumb
          ? { ran: true, png: thumb.png, width: thumb.width, height: thumb.height, ms: thumb.ms }
          : { ran: false, error: 'qlmanage produced no thumbnail' };
      } catch (error) {
        quickLook = { ran: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  }

  const issues = [...validation.issues];
  if (!geometry.pageSizeOk)
    issues.push(
      `page size ${geometry.pageSize.cx} by ${geometry.pageSize.cy} EMU, expected 12192000 by 6858000`,
    );
  if (pythonPptx.python && !pythonPptx.ran)
    issues.push(`python-pptx could not open the file: ${pythonPptx.error ?? ''}`);
  if (pythonPptx.ran && pythonPptx.slides !== geometry.slideParts)
    issues.push(
      `python-pptx counts ${pythonPptx.slides} slides, the package holds ${geometry.slideParts}`,
    );
  for (const shape of geometry.outOfBounds)
    issues.push(`${shape.part}: shape "${shape.name}" leaves the page`);

  const check: ExportCheck = {
    file: basename(path),
    bytes: statSync(path).size,
    parts: parts.length,
    slides: geometry.slideParts,
    notes,
    pageSize: geometry.pageSize,
    pageSizeOk: geometry.pageSizeOk,
    slideNames,
    titledSlides,
    formats,
    mediaBytes,
    embeddedFonts: geometry.embeddedFonts,
    custGeom: geometry.custGeomCount,
    normAutofit: geometry.normAutofitCount,
    kernZero: geometry.kernZeroCount,
    shapes: geometry.shapes,
    outOfBounds: geometry.outOfBounds.length,
    ...counts,
    charts,
    relationships: { checked: validation.relationships, invalid: validation.invalidRelationships },
    contentTypes: {
      undeclared: validation.undeclaredParts,
      missingOverrides: validation.missingOverrides,
    },
    pythonPptx,
    quickLook,
    issues,
    valid: issues.length === 0,
  };
  return exportCheckSchema.parse(check);
}

/** The human lines of a check, in order, for the CLI. */
export function describeCheck(check: ExportCheck): string[] {
  const formats = Object.entries(check.formats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([format, count]) => `${count} ${format}`)
    .join(', ');
  const lines = [
    `${check.file}: ${(check.bytes / (1024 * 1024)).toFixed(2)} MiB, ${check.parts} parts, ${check.slides} slide(s), ${check.notes} notes part(s)`,
    `page: ${check.pageSize.cx} by ${check.pageSize.cy} EMU ${check.pageSizeOk ? '(13.333 by 7.5 in)' : 'UNEXPECTED'}; ${check.shapes} shapes, ${check.outOfBounds} out of bounds`,
    `media: ${formats === '' ? 'none' : formats}; ${(check.mediaBytes / (1024 * 1024)).toFixed(2)} MiB`,
    `fonts embedded: ${check.embeddedFonts.length === 0 ? 'none' : check.embeddedFonts.join(', ')}`,
    `titles: ${check.titledSlides} of ${check.slides} slide(s) carry a title placeholder; slide names ${check.slideNames.filter((n) => n !== '').length} set`,
    `checklist: ${check.custGeom} custGeom, ${check.normAutofit} normAutofit, ${check.kernZero} kern="0"`,
    `round two: ${check.italicRuns ?? 0} italic run(s), ${check.rotated ?? 0} rotated, ${check.groups ?? 0} group(s), ${check.charts ?? 0} chart part(s), ${check.connectors ?? 0} attached connector(s), ${check.numCol ?? 0} numCol, ${check.avLst ?? 0} avLst, ${check.tables ?? 0} table(s) with ${check.mergedCells ?? 0} merged cell(s)`,
    `relationships: ${check.relationships.checked} checked, ${check.relationships.invalid.length} invalid; content types: ${check.contentTypes.undeclared.length} undeclared part(s), ${check.contentTypes.missingOverrides.length} override(s) for missing parts`,
    check.pythonPptx.ran
      ? `python-pptx: reopened, ${check.pythonPptx.slides} slide(s), ${check.pythonPptx.shapes} shape(s) (${check.pythonPptx.python ?? ''})`
      : `python-pptx: not run (${check.pythonPptx.error ?? 'unavailable'})`,
    check.quickLook.ran
      ? `quicklook: first page rendered at ${check.quickLook.width} by ${check.quickLook.height} in ${check.quickLook.ms} ms (${check.quickLook.png ?? ''})`
      : `quicklook: not run (${check.quickLook.error ?? 'off'})`,
  ];
  for (const issue of check.issues) lines.push(`issue: ${issue}`);
  lines.push(check.valid ? 'valid' : 'INVALID');
  return lines;
}
