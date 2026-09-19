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
import * as charts from './areas/charts.mjs';
import * as chrome from './areas/chrome.mjs';
import * as decks from './areas/decks.mjs';
import * as diagrams from './areas/diagrams.mjs';
import * as exportArea from './areas/export.mjs';
import * as formatting from './areas/formatting.mjs';
import * as help from './areas/help.mjs';
import * as images from './areas/images.mjs';
import * as inbox from './areas/inbox.mjs';
import * as lines from './areas/lines.mjs';
import * as shapes from './areas/shapes.mjs';
import * as share from './areas/share.mjs';
import * as slides from './areas/slides.mjs';
import * as surface from './areas/surface.mjs';
import * as tables from './areas/tables.mjs';
import * as text from './areas/text.mjs';
import * as view from './areas/view.mjs';
import * as wordart from './areas/wordart.mjs';

/**
 * The areas in the order the walk runs them; each declares the rows it drives. The return round
 * (docs/RETURN.md section 5) added the documents (tables, charts, diagrams, word art), the
 * formatting rows, the chrome, the View rows and the inbox; the chrome area runs last among the
 * editor areas because its 900 px reads resize the viewport and put it back.
 */
export const AREAS = [
  decks,
  slides,
  text,
  formatting,
  images,
  arrange,
  shapes,
  lines,
  tables,
  charts,
  diagrams,
  wordart,
  share,
  exportArea,
  help,
  view,
  inbox,
  chrome,
  surface,
];

/** The rows the finally block proves, outside any area. */
export const CLEANUP_IDS = ['decks.editor.move-to-trash', 'surface.cleanup'];

/**
 * The row the whole walk proves (VERIFICATION.md C2-F24): every window API write answered within
 * its bound. Recorded from the toolkit's stall list at the end, outside any section.
 */
export const WALK_IDS = ['decks.save.acknowledged'];

/** Every id the walk declares, by area, so a test can compare it with `probeRows()`. */
export function declaredIds() {
  const out = new Map();
  for (const area of AREAS) for (const id of area.IDS) out.set(id, area.NAME);
  for (const id of CLEANUP_IDS) out.set(id, 'cleanup');
  for (const id of WALK_IDS) out.set(id, 'walk');
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
  const parked = PARKED
    ? readParkedList(PARKED)
    : { commit: null, parkedFeatures: [], parkedRows: [] };
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
  /**
   * The shared state of the walk: the deck and the slides the areas made. `retired` holds the
   * decks a stall left behind (VERIFICATION.md C2-F24), trashed and removed by the finally block.
   */
  t.deck = { id: '', titleSlide: '', head: null, body: null, build: null, retired: [] };
  /** The areas this run drives, in order (a partial run keeps the decks area, which makes the deck). */
  const planned = AREAS.filter((area) => !only || only.has(area.NAME) || area.NAME === 'decks');
  /** How many stalls the walk had answered with a fresh deck. */
  let rotated = 0;

  try {
    for (const [index, area] of planned.entries()) {
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
      /* the stall (C2-F24): a window API write of this area did not answer within its bound, so
         the deck's later setups would each run to the bound as well (the cycle 2 run of record
         lost 162 rows to five `slide.new` calls of 60 s); the next area gets a fresh deck and the
         stuck one is retired for the cleanup. The stall itself is judged at the end. */
      const next = planned[index + 1];
      if (t.stalls.length > rotated && next) {
        const last = t.stalls[t.stalls.length - 1];
        rotated = t.stalls.length;
        console.log(
          `\n==== the window API stalled on ${t.deck.id} (${last.action} in ${last.area ?? 'no area'}, ${last.step ?? 'no step'}); a fresh deck for ${next.NAME}`,
        );
        const made = await t.freshDeck(
          `${last.action} did not answer in ${last.area ?? 'the walk'}`,
        );
        if (!made) {
          report.rows.push({
            n: report.rows.length + 1,
            step: 'the walk has a deck',
            expected: 'a fresh deck after the stall',
            observed: `no fresh deck could be made after ${last.action} stalled; the walk stops`,
            ok: false,
          });
          for (const later of planned.slice(index + 1))
            for (const id of later.IDS)
              t.recordRow(
                id,
                `${later.NAME}: ${id}`,
                'driven',
                `not driven: no fresh deck could be made after the stall (${last.action} did not answer within ${last.ms / 1000} s)`,
                null,
              );
          break;
        }
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
    // ---- the stall row (C2-F24): every window API call answered within its bound, or the list
    if (t.deck.build)
      t.recordRow(
        WALK_IDS[0],
        'every window API write of the walk is acknowledged within 60 s',
        'no call runs to its bound; the title row leaves Saving',
        t.stalls.length === 0
          ? `${report.rows.filter((r) => r.ok !== null).length} steps, no window API call ran to its ${t.INVOKE_TIMEOUT_MS / 1000} s bound`
          : `${t.fakeStall ? `a fake stall was set (TURBOSLIDE_WALK_FAKE_STALL=${t.fakeStall}), the driver's own test; ` : ''}${t.stalls.length} unanswered call(s): ${t.stalls
              .map(
                (x) =>
                  `${x.action} at ${x.at} on ${x.deck ?? 'no deck'} in ${x.area ?? 'no area'} (${x.step ?? 'no step'})`,
              )
              .join('; ')}; ${rotated} fresh deck(s) made for the areas after`,
        t.stalls.length === 0,
      );
    // ---- the trash path: File > Move to trash, Delete forever, the 404 on /edit and /deck
    if (t.deck.id && (!only || only.has('cleanup') || only.has('decks'))) {
      /* `surface.cleanup` covers the decks a stall retired as well */
      await t.section('cleanup', CLEANUP_IDS, () => cleanup(t));
    } else if (t.deck.id) {
      await cleanupQuiet(t, t.deck.id);
      /* the decks a stall retired: each trashed and removed through the window API, its 404 read */
      for (const retired of t.deck.retired) await cleanupQuiet(t, retired);
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
    const verdict = shipVerdict(results, parked, rowsOfProbe);
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
      retiredDecks: t.deck.retired,
      stalls: t.stalls,
      fakeStall: t.fakeStall,
      invokeTimeoutMs: t.INVOKE_TIMEOUT_MS,
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
      /* the decks a stall retired (C2-F24) are this walk's too: each is trashed and removed
         through the window API and has to answer 404 as well, so nothing the walk made stays */
      const retired = [];
      for (const id of t.deck.retired) {
        const gone = await cleanupQuiet(t, id);
        retired.push(`${id} /edit ${gone.edit}, /deck ${gone.deck}`);
      }
      const retiredGone =
        t.deck.retired.length === retired.filter((x) => /\/edit 404, \/deck 404$/.test(x)).length;
      return {
        ok: status.edit === 404 && status.deck === 404 && retiredGone,
        observed: `${how}; /edit ${status.edit}, /deck ${status.deck}${retired.length > 0 ? `; retired by the stall: ${retired.join('; ')}` : ''}`,
      };
    },
  );
}

/**
 * The trash path without rows: for a partial run (--only) that made a deck, and for every deck a
 * stall retired. Trash and remove through the window API, then the status of /edit and /deck.
 */
async function cleanupQuiet(t, deckId) {
  const { page, BASE } = t;
  const status = { edit: 0, deck: 0 };
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
    const until = Date.now() + 20_000;
    for (;;) {
      for (const route of ['edit', 'deck']) {
        const res = await page.request.get(`${BASE}/${route}/${deckId}`, {
          headers: t.headers,
          maxRedirects: 0,
        });
        status[route] = res.status();
      }
      if ((status.edit === 404 && status.deck === 404) || Date.now() > until) break;
      await t.sleep(2000);
    }
    console.log(`cleanup (quiet): /edit/${deckId} answers ${status.edit}, /deck ${status.deck}`);
  } catch (error) {
    console.log(
      `cleanup (quiet) of ${deckId} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return status;
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
