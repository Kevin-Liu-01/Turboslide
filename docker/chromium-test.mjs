#!/usr/bin/env node
// The measurement docker/Dockerfile.test runs (docs/hosting-chromium.md): inside the Linux x64
// image with TURBOSLIDE_CHROME=sparticuz, three steps over the committed GT deck, each timed, and
// one JSON summary on stdout at the end (human lines on stderr):
//
//   1. `turboslide render <slides> --theme dark --json` through the CLI binary, as the render
//      worker's spawn mode runs it: the renderer string, every record's font status and faces, the
//      ready and screenshot times, the PNG sizes.
//   2. `turboslide export pptx <slides> --mode flatten --theme light --json`: the report's
//      `passed`, geometry, embedded fonts, residual lines and the file sizes.
//   3. A document.fonts.check() probe: the deck's render surface for the first slide is loaded in
//      the same binary through @turboslide/headless and the page answers whether Inter (the data
//      URI @turboslide/render/theme-node inlines) is available at the weights and sizes the deck
//      uses, which faces document.fonts holds, and the WebGL renderer string.
//
// Slides default to 1 8 33 (TURBOSLIDE_TEST_SLIDES overrides, space separated). The script imports
// workspace packages through apps/cli's dependency graph (createRequire from its package.json), so
// it runs from the repository root with no dependency of its own.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.TURBOSLIDE_ROOT ?? process.cwd();
const DECK = process.env.TURBOSLIDE_TEST_DECK ?? join(ROOT, 'decks', 'gt-brand');
const SLIDES = (process.env.TURBOSLIDE_TEST_SLIDES ?? '1 8 33').split(/\s+/).filter(Boolean);
const OUT = join(tmpdir(), 'turboslide-chromium-test');
const BIN = join(ROOT, 'apps', 'cli', 'bin', 'turboslide.mjs');

const log = (line) => process.stderr.write(`${line}\n`);

function run(args, label) {
  const t = performance.now();
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => {
      for (const line of d.toString().split('\n')) if (line.trim()) log(`  [${label}] ${line}`);
    });
    child.on('close', (code) =>
      resolveRun({ code: code ?? 1, stdout, ms: Math.round(performance.now() - t) }),
    );
  });
}

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what}: no JSON result on stdout (${text.slice(0, 200)})`);
  }
}

function fileSizes(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => ({ name, bytes: statSync(join(dir, name)).size }));
}

async function renderStep() {
  const outDir = join(OUT, 'render');
  const args = [
    'render',
    ...SLIDES,
    '--deck',
    DECK,
    '--theme',
    'dark',
    '--scale',
    '1',
    '--out',
    outDir,
    '--json',
  ];
  log(`step 1: turboslide ${args.join(' ')}`);
  const result = await run(args, 'render');
  const records = result.code === 2 ? [] : parseJson(result.stdout, 'render');
  return {
    args: args.slice(0, 2 + SLIDES.length),
    exitCode: result.code,
    ms: result.ms,
    renderer: records[0]?.renderer ?? null,
    records: records.map((r) => ({
      slideId: r.slideId,
      theme: r.theme,
      fonts: r.fonts,
      pageErrors: r.pageErrors,
      consoleErrors: r.consoleErrors.length,
      overflow: r.overflow.length,
      timing: r.timing,
    })),
    images: fileSizes(outDir, /\.png$/),
  };
}

async function exportStep() {
  const outDir = join(OUT, 'export');
  const args = [
    'export',
    'pptx',
    ...SLIDES,
    '--deck',
    DECK,
    '--mode',
    'flatten',
    '--theme',
    'light',
    '--out',
    outDir,
    '--json',
  ];
  log(`step 2: turboslide ${args.join(' ')}`);
  const result = await run(args, 'export');
  const report = result.code === 2 ? null : parseJson(result.stdout, 'export');
  return {
    args: args.slice(0, 3 + SLIDES.length),
    exitCode: result.code,
    ms: result.ms,
    passed: report?.passed ?? null,
    geometryInBounds: report?.geometryInBounds ?? null,
    pages: report?.slides.length ?? 0,
    fontsEmbedded: report?.fonts.embedded.length ?? 0,
    residual: report?.residual ?? [],
    files: fileSizes(outDir, /\.pptx$/),
    sheets: fileSizes(join(outDir, 'work', 'sheets', 'light'), /\.png$/),
  };
}

/** Resolves a workspace subpath export the way apps/cli sees it and imports the TypeScript source. */
function importFromCli(specifier) {
  const require = createRequire(join(ROOT, 'apps', 'cli', 'package.json'));
  return import(pathToFileURL(require.resolve(specifier)).href);
}

async function fontsStep() {
  const { launchBrowser } = await importFromCli('@turboslide/headless/launch');
  const { openSheetPage } = await importFromCli('@turboslide/headless/context');
  const { fileUrl, writeTempDocument } = await importFromCli('@turboslide/headless/document');
  const { renderDeck } = await importFromCli('@turboslide/render/deck');
  const { loadThemeBundle } = await importFromCli('@turboslide/render/theme-node');
  const deck = JSON.parse(readFileSync(join(DECK, 'deck.json'), 'utf8'));
  const order = deck.sections.flatMap((s) => s.slideIds);
  const firstId = order[Number(SLIDES[0] ?? '1') - 1] ?? order[0];
  const slides = order.map((id) =>
    JSON.parse(readFileSync(join(DECK, 'slides', `${id}.json`), 'utf8')),
  );
  const rendered = renderDeck(deck, slides, {
    theme: 'dark',
    bundle: loadThemeBundle(),
    chrome: true,
    assetBase: fileUrl(DECK, true),
    blockAttrs: true,
    gtWord: true,
    present: true,
    slideIds: [firstId],
    title: 'fonts probe',
  });
  const dir = join(OUT, 'fonts');
  mkdirSync(dir, { recursive: true });
  const doc = await writeTempDocument(rendered.html, 'probe.html', dir);
  const t = performance.now();
  const launched = await launchBrowser();
  const launchMs = Math.round(performance.now() - t);
  try {
    const sheet = await openSheetPage(launched.browser, { theme: 'dark', scale: 1 });
    try {
      await sheet.page.goto(`${doc.url}#s/${encodeURIComponent(firstId)}`, { waitUntil: 'load' });
      await sheet.page.waitForSelector('html[data-ts-ready="1"]', {
        state: 'attached',
        timeout: 60_000,
      });
      const probe = await sheet.page.evaluate(async () => {
        await document.fonts.ready;
        const specs = ['400 22px Inter', '500 22px Inter', '500 44px Inter', '400 14px Inter'];
        const loaded = {};
        for (const spec of specs) {
          await document.fonts.load(spec).catch(() => []);
          loaded[spec] = document.fonts.check(spec);
        }
        const faces = [...document.fonts].map(
          (f) => `${f.family.replace(/^['"]|['"]$/g, '')} ${f.weight} ${f.style} ${f.status}`,
        );
        // the width of one run in Inter against the same run in a face the page cannot have:
        // equal widths would mean a fallback painted both
        const measure = (family) => {
          const span = document.createElement('span');
          span.textContent = 'General Translation, the GT brand deck';
          span.style.cssText = `position:absolute;left:-9999px;font:500 44px ${family};white-space:nowrap`;
          document.body.append(span);
          const width = span.getBoundingClientRect().width;
          span.remove();
          return width;
        };
        return {
          check: loaded,
          faces,
          widths: {
            inter: measure('Inter'),
            fallback: measure('serif'),
            mono: measure('monospace'),
          },
          textBlocks: document.querySelectorAll('.slide.is-on [data-block]').length,
        };
      });
      const errors = sheet.takeErrors();
      return {
        slideId: firstId,
        launchMs,
        renderer: launched.renderer,
        executableSource: launched.executableSource,
        product: launched.product,
        version: launched.version,
        args: launched.args,
        probe,
        interDistinctFromFallback: probe.widths.inter !== probe.widths.fallback,
        pageErrors: errors.pageErrors,
        consoleErrors: errors.consoleErrors,
      };
    } finally {
      await sheet.close();
    }
  } finally {
    await launched.close();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const facts = {
    arch: process.arch,
    platform: process.platform,
    node: process.version,
    cwd: ROOT,
    env: {
      TURBOSLIDE_CHROME: process.env.TURBOSLIDE_CHROME ?? null,
      TURBOSLIDE_GPU: process.env.TURBOSLIDE_GPU ?? null,
      VERCEL: process.env.VERCEL ?? null,
      FONTCONFIG_PATH: process.env.FONTCONFIG_PATH ?? null,
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH ?? null,
    },
    slides: SLIDES,
    deck: resolve(DECK),
  };
  log(
    `chromium test on ${facts.platform} ${facts.arch}, node ${facts.node}, slides ${SLIDES.join(' ')}`,
  );
  const summary = { facts };
  const t0 = performance.now();
  summary.render = await renderStep();
  log(
    `step 1 done: exit ${summary.render.exitCode}, ${summary.render.ms} ms, renderer ${summary.render.renderer}`,
  );
  summary.export = await exportStep();
  log(
    `step 2 done: exit ${summary.export.exitCode}, ${summary.export.ms} ms, passed ${summary.export.passed}`,
  );
  try {
    summary.fonts = await fontsStep();
    log(`step 3 done: Inter distinct from fallback ${summary.fonts.interDistinctFromFallback}`);
  } catch (error) {
    summary.fonts = {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    };
    log(`step 3 failed: ${summary.fonts.error}`);
  }
  const inflated = join(tmpdir(), 'chromium');
  summary.inflated = existsSync(inflated)
    ? {
        path: inflated,
        bytes: statSync(inflated).size,
        tmp: readdirSync(tmpdir()).filter((n) => /chromium|fonts|swiftshader|al2023|lib/.test(n)),
      }
    : null;
  summary.totalMs = Math.round(performance.now() - t0);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  const ok = summary.render.exitCode === 0 && summary.export.exitCode === 0 && !summary.fonts.error;
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  log(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
