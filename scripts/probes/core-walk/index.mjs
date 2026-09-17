// The core walk (docs/FOCUS.md 6.1): the walk probe's --core mode. One scratch deck from /new,
// the product driven at human speed through its own controls, and one tagged step per row of the
// matrix whose driver is `probe --core` (289 rows on the day the matrix was written), in the
// order of the areas of section 2. The walk keeps the probe's pace, its helpers, its scratch deck
// and its finally block (File > Move to trash, Delete forever, the 404 on /edit and /deck), which
// here proves `decks.editor.move-to-trash` and `surface.cleanup`.
//
// The rules of 6.1 as this module applies them: a tagged step writes the row id as `id` in the
// JSON row; a setup step that fails turns every later declared row of its section into a not
// driven row with the reason "setup failed: <step>" (toolkit.mjs `section`); a probe row for which
// the run recorded no tagged step is "no step", a failure of the run that exits 1 whatever the
// parked list says; the exit code is 1 when any probe row is failed or not driven unless its
// feature is in the committed parked list (`--parked <ship json>`, 6.2) through `shipVerdict`
// over `probeRows()`. A row with several checks passes only when every check passes.
//
//   node scripts/probes/editor-walk-probe.mjs --core --base <origin> --json <path>
//     [--matrix <path>] [--parked docs/gslides-parity/focus/ship-<commit>.json]
//     [--only decks,slides,...] [--shots <dir>] [--headed]
//
// `--only` runs the named areas alone while a driver is written; the other areas' rows then read
// "no step" and the run exits 1, so a partial run is never mistaken for a gate run.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  CORE_MATRIX_PATH,
  coreRow,
  probeRows,
  readParkedList,
  shipVerdict,
} from '../core-matrix.mjs';
import { createToolkit } from './toolkit.mjs';
import * as arrange from './areas/arrange.mjs';
import * as decks from './areas/decks.mjs';
import * as exportArea from './areas/export.mjs';
import * as help from './areas/help.mjs';
import * as images from './areas/images.mjs';
import * as lines from './areas/lines.mjs';
import * as shapes from './areas/shapes.mjs';
import * as share from './areas/share.mjs';
import * as slides from './areas/slides.mjs';
import * as surface from './areas/surface.mjs';
import * as text from './areas/text.mjs';

/** The areas in the order the walk runs them; each declares the rows it drives. */
export const AREAS = [
  decks,
  slides,
  text,
  images,
  arrange,
  shapes,
  lines,
  share,
  exportArea,
  help,
  surface,
];

/** The rows the finally block proves, outside any area. */
export const CLEANUP_IDS = ['decks.editor.move-to-trash', 'surface.cleanup'];

/** Every id the walk declares, by area, so a test can compare it with `probeRows()`. */
export function declaredIds() {
  const out = new Map();
  for (const area of AREAS) for (const id of area.IDS) out.set(id, area.NAME);
  for (const id of CLEANUP_IDS) out.set(id, 'cleanup');
  return out;
}

const aggregate = (entry) =>
  entry.failed > 0 ? 'failed' : entry.notDriven > 0 ? 'not driven' : 'passed';

export async function runCoreWalk({
  chromium,
  BASE,
  JSON_OUT,
  MATRIX_OUT,
  SHOTS,
  HEADED,
  extraHTTPHeaders,
  PARKED,
  ONLY,
  lib,
}) {
  const startedAt = Date.now();
  const rowsOfProbe = probeRows();
  const probeIds = new Set(rowsOfProbe.map((row) => row.id));
  const parked = PARKED ? readParkedList(PARKED) : { commit: null, parkedFeatures: [] };
  const only = ONLY ? new Set(ONLY.split(',').map((s) => s.trim())) : null;
  if (only)
    for (const name of only)
      if (!AREAS.some((a) => a.NAME === name) && name !== 'cleanup')
        throw new RangeError(`--only names no area: ${name}`);
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  const report = {
    rows: [],
    results: new Map(),
    consoleErrors: [],
    shots: SHOTS,
    isProbeId: (id) => probeIds.has(id),
  };

  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    extraHTTPHeaders,
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('%c[Server]'))
      report.consoleErrors.push(`console: ${m.text().slice(0, 200)}`);
  });
  /** The downloads the page starts: the export rows of this walk read their URLs, never the files. */
  const downloads = [];
  page.on('download', (d) => {
    downloads.push({ url: d.url(), name: d.suggestedFilename() });
    d.cancel().catch(() => undefined);
  });
  /** Popups (a new tab from a card menu, Presenter view) are closed; the two window rows live in the specs. */
  const popups = [];
  context.on('page', (p) => {
    popups.push(p.url());
    p.close().catch(() => undefined);
  });

  const t = createToolkit({
    page,
    context,
    browser,
    BASE,
    headers: extraHTTPHeaders,
    lib,
    report,
    options: { downloads, popups, headed: HEADED },
  });
  /** The shared state of the walk: the deck and the slides the areas made. */
  t.deck = { id: '', titleSlide: '', head: null, body: null, build: null };

  try {
    for (const area of AREAS) {
      // the decks area creates the scratch deck, so a partial run always starts with it
      if (only && !only.has(area.NAME) && area.NAME !== 'decks') continue;
      await t.section(area.NAME, area.IDS, () => area.run(t));
      if (!t.deck.id) {
        report.rows.push({
          n: report.rows.length + 1,
          step: 'the walk has a deck',
          expected: 'the decks area created the scratch deck',
          observed: 'no deck id after the decks area; the walk stops',
          ok: false,
        });
        break;
      }
    }
  } catch (error) {
    report.rows.push({
      n: report.rows.length + 1,
      step: 'the walk ran to completion',
      expected: 'no exception outside a step',
      observed: error instanceof Error ? (error.stack ?? error.message) : String(error),
      ok: false,
    });
  } finally {
    // ---- the trash path: File > Move to trash, Delete forever, the 404 on /edit and /deck
    if (t.deck.id && (!only || only.has('cleanup') || only.has('decks'))) {
      await t.section('cleanup', CLEANUP_IDS, () => cleanup(t));
    } else if (t.deck.id) {
      await cleanupQuiet(t);
    }
    await browser.close().catch(() => undefined);

    const results = {};
    const table = [];
    for (const row of rowsOfProbe) {
      const entry = report.results.get(row.id);
      const result = entry ? aggregate(entry) : 'no step';
      if (entry) results[row.id] = result;
      table.push({
        id: row.id,
        feature: row.feature,
        today: row.today,
        result,
        reason: entry
          ? result === 'passed'
            ? ''
            : (entry.reason ?? '')
          : only
            ? 'the area was not run (--only)'
            : 'the walk recorded no tagged step for this row',
        steps: entry?.steps ?? [],
      });
    }
    const noStep = table.filter((r) => r.result === 'no step').map((r) => r.id);
    const verdict = shipVerdict(results, parked.parkedFeatures, rowsOfProbe);
    const tallyOf = (word) => table.filter((r) => r.result === word).length;
    const untaggedFailures = report.rows.filter(
      (r) => r.ok === false && r.id === undefined && !r.step.startsWith('setup:'),
    );
    const exitCode = verdict.ok && noStep.length === 0 && untaggedFailures.length === 0 ? 0 : 1;
    const summary = {
      mode: 'core',
      base: BASE,
      matrix: CORE_MATRIX_PATH,
      build: t.deck.build,
      deckId: t.deck.id,
      startedAt: new Date(startedAt).toISOString(),
      ms: Date.now() - startedAt,
      steps: report.rows.length,
      passed: report.rows.filter((r) => r.ok === true).length,
      failed: report.rows.filter((r) => r.ok === false).length,
      notDriven: report.rows.filter((r) => r.ok === null).length,
      consoleErrors: report.consoleErrors,
      parked,
      core: {
        rows: table.length,
        passed: tallyOf('passed'),
        failed: tallyOf('failed'),
        notDriven: tallyOf('not driven'),
        noStep: noStep.length,
        results,
        table,
        verdict,
        untaggedFailures: untaggedFailures.map((r) => ({
          n: r.n,
          step: r.step,
          observed: r.observed,
        })),
        exitCode,
      },
      rows: report.rows,
    };
    if (JSON_OUT) {
      mkdirSync(path.dirname(JSON_OUT), { recursive: true });
      writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
    }
    if (MATRIX_OUT) {
      mkdirSync(path.dirname(MATRIX_OUT), { recursive: true });
      writeFileSync(MATRIX_OUT, renderMatrix(summary));
    }
    console.log(
      `\ncore walk: ${table.length} matrix rows: ${summary.core.passed} passed, ${summary.core.failed} failed, ${summary.core.notDriven} not driven, ${noStep.length} no step; ${report.rows.length} steps (${summary.passed} ok, ${summary.failed} failed, ${summary.notDriven} not driven), ${report.consoleErrors.length} console errors, ${Math.round(summary.ms / 1000)} s against ${BASE}${JSON_OUT ? `; table ${JSON_OUT}` : ''}${MATRIX_OUT ? `; matrix ${MATRIX_OUT}` : ''}; exit ${exitCode}`,
    );
    if (!verdict.ok)
      console.log(
        `  failing the gate: ${verdict.failures.map((f) => `${f.id} (${f.result})`).join(', ')}`,
      );
    if (noStep.length > 0) console.log(`  no step: ${noStep.join(', ')}`);
    summary.exitCode = exitCode;
    return exitCode;
  }
}

/** The finally block's two rows, through the product; the actions API is the fallback for the record. */
async function cleanup(t) {
  const { page, BASE, headers } = t;
  const deckId = t.deck.id;
  let trashed = false;
  await t.step(
    'decks.editor.move-to-trash',
    'File > Move to trash',
    'the address moves to /decks and the deck is not listed',
    async () => {
      await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
      await t.editorReady();
      await t.pollUntil(t.state, (s) => s.sync?.connected === true, 30_000);
      await t.settled();
      await t.press('Escape', 2);
      await t.clickControl('menubar.file');
      await page.locator('[data-control="menu.file.moveToTrash"]').waitFor({ timeout: 8000 });
      await t.clickControl('menu.file.moveToTrash');
      await page.waitForURL(/\/decks(\?.*)?$/, { timeout: 20_000 });
      await page
        .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 })
        .catch(() => undefined);
      const listed = await t.has(`[data-control="home.card.${deckId}"]`);
      trashed = true;
      return {
        ok: /\/decks/.test(page.url()) && !listed,
        observed: `${t.url()}; card listed ${listed}`,
      };
    },
  );
  if (!trashed) {
    try {
      await page
        .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
        .catch(() => undefined);
      await t.editorReady().catch(() => undefined);
      const info = await t.invoke('deck.info').catch(() => null);
      if (info)
        await t
          .invoke('deck.trash', { id: deckId, baseRevision: info.revision })
          .catch(() => undefined);
    } catch {
      // the 404 row below tells the truth
    }
  }
  await t.step(
    'surface.cleanup',
    'Delete forever on /decks/trash, then GET /edit/<id> and /deck/<id>',
    'the card leaves the trash and both addresses answer 404 within 20 s',
    async () => {
      let how = 'the trash page';
      try {
        await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.ts-trash-page[data-hydrated], .ts-home-page[data-hydrated]', {
          timeout: 30_000,
        });
        const card = page.locator(`[data-control="trash.card.${deckId}"]`);
        await card.waitFor({ timeout: 30_000 });
        await t.clickControl(`trash.delete.${deckId}`);
        await t.clickControl('trash.confirm.ok');
        await card.waitFor({ state: 'detached', timeout: 30_000 });
      } catch (error) {
        how = `the trash page failed (${error instanceof Error ? error.message.split('\n')[0] : String(error)}); the actions API`;
        await page
          .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
          .catch(() => undefined);
        await t.editorReady().catch(() => undefined);
        const info = await t.invoke('deck.info').catch(() => null);
        if (info) {
          await t
            .invoke('deck.trash', { id: deckId, baseRevision: info.revision })
            .catch(() => undefined);
          const again = await t.invoke('deck.info').catch(() => null);
          await t
            .invoke('deck.remove', {
              id: deckId,
              baseRevision: again?.revision ?? info.revision,
              confirm: true,
            })
            .catch(() => undefined);
        }
      }
      const status = { edit: 0, deck: 0 };
      const until = Date.now() + 20_000;
      for (;;) {
        for (const route of ['edit', 'deck']) {
          const res = await page.request.get(`${BASE}/${route}/${deckId}`, {
            headers,
            maxRedirects: 0,
          });
          status[route] = res.status();
        }
        if ((status.edit === 404 && status.deck === 404) || Date.now() > until) break;
        await t.sleep(2000);
      }
      return {
        ok: status.edit === 404 && status.deck === 404,
        observed: `${how}; /edit ${status.edit}, /deck ${status.deck}`,
      };
    },
  );
}

/** The trash path without rows, for a partial run (--only) that made a deck. */
async function cleanupQuiet(t) {
  const { page, BASE } = t;
  const deckId = t.deck.id;
  try {
    await page
      .goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' })
      .catch(() => undefined);
    await t.editorReady().catch(() => undefined);
    const info = await t.invoke('deck.info').catch(() => null);
    if (info) {
      await t
        .invoke('deck.trash', { id: deckId, baseRevision: info.revision })
        .catch(() => undefined);
      const again = await t.invoke('deck.info').catch(() => null);
      await t
        .invoke('deck.remove', {
          id: deckId,
          baseRevision: again?.revision ?? info.revision,
          confirm: true,
        })
        .catch(() => undefined);
    }
    const res = await page.request.get(`${BASE}/edit/${deckId}`, {
      headers: t.headers,
      maxRedirects: 0,
    });
    console.log(`cleanup (quiet): /edit/${deckId} answers ${res.status()}`);
  } catch (error) {
    console.log(
      `cleanup (quiet) failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** The matrix table of the run: every probe row with its result and reason. */
export function renderMatrix(summary) {
  const { core } = summary;
  const lines = [
    `# Core walk matrix`,
    '',
    `Base ${summary.base}, started ${summary.startedAt}, ${Math.round(summary.ms / 1000)} s, deck ${summary.deckId || 'none'}. ${core.rows} probe rows: ${core.passed} passed, ${core.failed} failed, ${core.notDriven} not driven, ${core.noStep} no step. Verdict ${core.verdict.ok ? 'ok' : 'failed'}${summary.parked.parkedFeatures.length > 0 ? ` with the parked list ${summary.parked.parkedFeatures.join(', ')}` : ''}; exit ${core.exitCode}. A row passes only when every tagged step of it passed; a not driven row is never counted as passed.`,
    '',
    '| Row | Feature | Today | Result | Reason | Steps |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of core.table)
    lines.push(
      `| \`${r.id}\` | ${r.feature} | ${r.today} | ${r.result} | ${escapeCell(r.reason)} | ${r.steps.join(', ')} |`,
    );
  if (core.untaggedFailures.length > 0) {
    lines.push('', '## Failed steps outside a row', '');
    for (const f of core.untaggedFailures)
      lines.push(`- ${f.n} ${f.step}: ${escapeCell(f.observed)}`);
  }
  if (summary.consoleErrors.length > 0) {
    lines.push('', `## Console errors (${summary.consoleErrors.length})`, '');
    for (const e of summary.consoleErrors.slice(0, 40)) lines.push(`- ${escapeCell(e)}`);
  }
  return `${lines.join('\n')}\n`;
}

const escapeCell = (s) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .slice(0, 400);

/* the row texts, for a driver that wants to print what it proves */
export const interactionOf = (id) => coreRow(id).interaction;
