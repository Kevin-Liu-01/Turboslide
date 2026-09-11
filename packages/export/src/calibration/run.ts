// The calibration run (SPEC 8.5 step 5), executed inside the render worker image where LibreOffice
// and the export fonts are installed:
//
//   node packages/export/src/calibration/run.ts --out .turboslide/calibration [--set exact]
//
// It writes the calibration deck, renders it with the turboslide CLI in both themes, writes two
// PPTX files per theme with the fixture writer (a flatten page per slide with the render as the
// background, and a native page per text slide with one text box per single-line block in the
// export faces), converts them through LibreOffice and poppler, and measures: the flatten mismatch
// per slide, the ink box offset of every native text block by size (the first-baseline constant),
// and the geometry read-back; then the whole verify loop (verifyPptx) runs over an export report
// that lists the two flatten files, the two-slide-per-theme exercise MILESTONES M2 item 4 asks for
// when the exporter is not ready. The result lands in <out>/calibration-measured.json; the numbers
// are copied into calibration.json by hand with the renderer versions, and re-measured when the
// font set or the renderer changes.
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import type { ExportReport } from '@turboslide/schema/export';
import type { RenderRecord, Theme } from '@turboslide/schema/render';
import { fontSetVersion } from '@turboslide/fonts/export';
import type { ExportFontSet } from '@turboslide/fonts/export';

import { diffImages, readPng, writePng } from '../verify/diff.ts';
import { buildFixturePptx } from '../verify/fixture.ts';
import type { FixturePage } from '../verify/fixture.ts';
import { checkGeometry } from '../verify/geometry.ts';
import { renderPptxPages, resolveTools, toolVersions } from '../verify/libreoffice.ts';
import { referenceImage, turboslideCommand } from '../verify/reference.ts';
import { verifyPptx } from '../verify/report.ts';
import { writeCalibrationDeck } from './deck.ts';
import { baselineBySize, calibrationTexts, measureCalibration } from './measure.ts';
import type { BaselineMeasurement } from './measure.ts';

const execFileAsync = promisify(execFile);

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  return value ?? fallback;
}

async function main(): Promise<void> {
  const out = resolve(arg('out', '.turboslide/calibration'));
  const set = arg('set', 'exact') as ExportFontSet;
  const themes: Theme[] = ['light', 'dark'];
  await mkdir(out, { recursive: true });
  const written = await writeCalibrationDeck(join(out, 'deck'));
  const [bin, ...lead] = turboslideCommand();
  const renderDir = join(out, 'render');
  const renderArgs = [
    ...lead,
    'render',
    'all',
    '--deck',
    written.dir,
    '--theme',
    themes.join(','),
    '--scale',
    '1',
    '--out',
    renderDir,
    '--json',
  ];
  process.stderr.write(`calibration: ${bin} ${renderArgs.join(' ')}\n`);
  const rendered = await execFileAsync(bin ?? 'turboslide', renderArgs, {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 600_000,
  });
  const records = JSON.parse(rendered.stdout) as RenderRecord[];
  // flatten pages carry a 2x sheet raster and are verified at 2x (verify/report.ts
  // FLATTEN_REFERENCE_SCALE), so the flatten fixture's backgrounds and references are 2x renders
  const renderDir2x = join(out, 'render2x');
  const renderArgs2x = [
    ...lead,
    'render',
    'all',
    '--deck',
    written.dir,
    '--theme',
    themes.join(','),
    '--scale',
    '2',
    '--out',
    renderDir2x,
    '--json',
  ];
  process.stderr.write(`calibration: ${bin} ${renderArgs2x.join(' ')}\n`);
  const rendered2x = await execFileAsync(bin ?? 'turboslide', renderArgs2x, {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 600_000,
  });
  const records2x = JSON.parse(rendered2x.stdout) as RenderRecord[];
  const renderer = records[0]?.renderer ?? 'unknown';
  const tools = resolveTools();
  const versions = await toolVersions(tools);

  const measured: {
    renderer: string;
    versions: typeof versions;
    fontSet: ExportFontSet;
    fontSetVersion: string;
    flatten: { theme: Theme; slideId: string; fraction: number; mismatch: number }[];
    native: BaselineMeasurement[];
    baselineBySize: Record<string, ReturnType<typeof baselineBySize>>;
    geometry: Record<
      string,
      { shapes: number; inBounds: boolean; custGeomCount: number; normAutofitCount: number }
    >;
    verify?: {
      passed: boolean;
      geometryInBounds: boolean;
      slides: { slideId: string; fraction: number | null }[];
    };
  } = {
    renderer,
    versions,
    fontSet: set,
    fontSetVersion: fontSetVersion(set),
    flatten: [],
    native: [],
    baselineBySize: {},
    geometry: {},
  };

  for (const theme of themes) {
    const themeRecords = records.filter((r) => r.theme === theme);
    const themeRecords2x = records2x.filter((r) => r.theme === theme);
    const set0 = { dir: renderDir, records };
    const set2 = { dir: renderDir2x, records: records2x };
    // flatten: the 2x render as the page background, rasterized and compared at 2x
    const flattenPages: FixturePage[] = themeRecords2x.map((r) => ({
      background: referenceImage(set2, r),
    }));
    const flattenPptx = join(out, `calibration-flatten-${theme}.pptx`);
    await buildFixturePptx({
      out: flattenPptx,
      pages: flattenPages,
      title: `calibration flatten ${theme}`,
    });
    const flattenPages2 = await renderPptxPages(flattenPptx, join(out, 'lo'), {
      tools,
      width: 3200,
      height: 1800,
      log: (l) => process.stderr.write(`${l}\n`),
    });
    for (const [i, r] of themeRecords2x.entries()) {
      const page = flattenPages2.pages[i];
      if (!page) continue;
      const ref = await readPng(referenceImage(set2, r));
      const got = await readPng(page);
      const d = diffImages(ref, got);
      await writePng(join(out, 'lo', `flatten-${theme}-${r.slideId}.diff.png`), d.diff);
      measured.flatten.push({
        theme,
        slideId: r.slideId,
        fraction: d.fraction,
        mismatch: d.mismatch,
      });
    }
    const flatGeometry = await checkGeometry(flattenPptx);
    measured.geometry[`flatten-${theme}`] = {
      shapes: flatGeometry.shapes,
      inBounds: flatGeometry.inBounds,
      custGeomCount: flatGeometry.custGeomCount,
      normAutofitCount: flatGeometry.normAutofitCount,
    };

    // native: one text box per single-line text block on paper, no background
    const paper = theme === 'light' ? 'FFFFFF' : '070707';
    const nativeRecords = themeRecords.filter(
      (r) => calibrationTexts(written.document, r, set).length > 0,
    );
    const nativePages: FixturePage[] = nativeRecords.map((r) => ({
      paper,
      texts: calibrationTexts(written.document, r, set),
    }));
    const nativePptx = join(out, `calibration-native-${theme}.pptx`);
    await buildFixturePptx({
      out: nativePptx,
      pages: nativePages,
      title: `calibration native ${theme}`,
    });
    const nativeOut = await renderPptxPages(nativePptx, join(out, 'lo'), { tools });
    const all: BaselineMeasurement[] = [];
    for (const [i, r] of nativeRecords.entries()) {
      const page = nativeOut.pages[i];
      if (!page) continue;
      const ref = await readPng(referenceImage(set0, r));
      const got = await readPng(page);
      const texts = calibrationTexts(written.document, r, set);
      const rows = measureCalibration(ref, got, texts, theme);
      all.push(...rows);
      await writePng(
        join(out, 'lo', `native-${theme}-${r.slideId}.diff.png`),
        diffImages(ref, got).diff,
      );
    }
    measured.native.push(...all);
    measured.baselineBySize[theme] = baselineBySize(all);
    const nativeGeometry = await checkGeometry(nativePptx);
    measured.geometry[`native-${theme}`] = {
      shapes: nativeGeometry.shapes,
      inBounds: nativeGeometry.inBounds,
      custGeomCount: nativeGeometry.custGeomCount,
      normAutofitCount: nativeGeometry.normAutofitCount,
    };
  }
  // the verify loop itself over the flatten files: an ExportReport as the PPTX builder writes it
  const flattenFiles = themes.map((theme) => join(out, `calibration-flatten-${theme}.pptx`));
  const report: ExportReport = {
    deckId: written.document.deck.id,
    revision: written.document.deck.revision,
    format: 'pptx',
    mode: 'flatten',
    theme: 'light',
    fontSet: set,
    fontSetVersion: fontSetVersion(set),
    files: flattenFiles.map((path) => ({ path, bytes: 0, sha256: '' })),
    fonts: { embedded: [], requiredOnViewer: [], substitutedIn: [] },
    slides: themes.flatMap((theme) =>
      records
        .filter((r) => r.theme === theme)
        .map((r) => ({
          slideId: r.slideId,
          native: [],
          raster: Object.keys(r.blocks).filter((k) => !k.includes('/')),
        })),
    ),
    geometryInBounds: true,
    perfect: false,
    passed: true,
    residual: [],
  };
  const reportPath = join(out, 'export-report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const verified = await verifyPptx(reportPath, {
    deckDir: written.dir,
    referenceDir: renderDir2x,
    log: (l) => process.stderr.write(`${l}\n`),
  });
  process.stderr.write(
    `calibration: verifyPptx ${verified.passed ? 'passed' : 'FAILED'}, geometry ${verified.geometryInBounds}\n`,
  );

  measured.verify = {
    passed: verified.passed,
    geometryInBounds: verified.geometryInBounds,
    slides: verified.slides.map((sl) => ({
      slideId: sl.slideId,
      fraction: sl.verify?.fraction ?? null,
    })),
  };
  const path = join(out, 'calibration-measured.json');
  await writeFile(path, `${JSON.stringify(measured, null, 2)}\n`);
  process.stderr.write(`calibration: wrote ${path}\n`);
  for (const f of measured.flatten)
    process.stderr.write(
      `  flatten ${f.theme} ${f.slideId}: ${(f.fraction * 100).toFixed(3)} percent\n`,
    );
  for (const [theme, table] of Object.entries(measured.baselineBySize))
    for (const [size, row] of Object.entries(table))
      process.stderr.write(
        `  native ${theme} ${size} px: dy ${row.dy} dx ${row.dx} dw ${row.dw} (${row.samples})\n`,
      );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `calibration: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
