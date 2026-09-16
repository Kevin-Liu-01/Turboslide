#!/usr/bin/env node
// The verifier's preview walk of round five (gslides-parity SPEC-5 16.2, 16.5, 16.8; the seven
// sales scenarios S1 to S7; SPEC-5-amendments A1 Kevin's three reports re-walked, A7): drives the
// preview deployment with headless Chromium the way a person would, takes one screenshot per step
// under verification-5/<shots dir>/ and writes a table (step, expected, observed, ok) to stdout
// and to --json. A step the walk cannot drive is recorded as "not driven" with the reason, never
// as passed. Every deck the walk creates is trashed and deleted forever in a finally block through
// the actions API with the agent bearer from the environment (TURBOSLIDE_TOKEN; never printed).
//
//   node docs/gslides-parity/verification-5/scripts/preview-walk.mjs --base <origin> \
//     --json <path> --shots <dir> [--only S1,S3,K1]
//
// VERCEL_OIDC_TOKEN, when set, rides as x-vercel-trusted-oidc-idp-token. The caller holds
// .turboslide/e2e.lock.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser } from '../../../../packages/headless/src/launch.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = (value('base') ?? 'http://localhost:4357').replace(/\/$/, '');
const JSON_OUT = value('json', null);
const SHOTS = value('shots', 'docs/gslides-parity/verification-5/preview-walk-shots');
const ONLY = value('only', null)?.split(',') ?? null;
const only = (id) => ONLY === null || ONLY.includes(id);
const SHOTS_DIR = resolve(ROOT, SHOTS);
mkdirSync(SHOTS_DIR, { recursive: true });

const OIDC = process.env.VERCEL_OIDC_TOKEN;
const BEARER = process.env.TURBOSLIDE_TOKEN;
const protection = () => (OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {});
const bearer = () => (BEARER ? { authorization: `Bearer ${BEARER}` } : {});

// ---------------------------------------------------------------------------------------------
// the table
const rows = [];
const started = Date.now();
let shotIndex = 0;
const log = (line) => process.stderr.write(`${line}\n`);
const record = (id, name, expected, observed, ok, shot) => {
  rows.push({ n: rows.length + 1, id, name, expected, observed, ok, shot: shot ?? null });
  const mark = ok === null ? 'skip' : ok ? 'ok  ' : 'FAIL';
  log(`${mark} ${id} ${name}\n       expected: ${expected}\n       observed: ${observed}`);
};
const okRow = (id, name, expected, observed, shot) =>
  record(id, name, expected, observed, true, shot);
const failRow = (id, name, expected, observed, shot) =>
  record(id, name, expected, observed, false, shot);
const skipRow = (id, name, expected, why, shot) =>
  record(id, name, expected, `not driven: ${why}`, null, shot);
const shoot = async (page, id, label) => {
  shotIndex += 1;
  const file = `${String(shotIndex).padStart(2, '0')}-${id}-${label}.png`.replace(
    /[^A-Za-z0-9._-]+/g,
    '-',
  );
  await page.screenshot({ path: join(SHOTS_DIR, file), fullPage: false }).catch(() => null);
  return join(SHOTS, file);
};

// ---------------------------------------------------------------------------------------------
// the product
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const typeHuman = async (page, text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(45 + Math.floor(Math.random() * 40));
  }
};
const invoke = (page, action, input = {}) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const settled = async (page, timeout = 20_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page).catch(() => ({}));
    if ((s.sync?.pending ?? s.pending ?? 0) === 0) return s;
    if (Date.now() > until) return s;
    await sleep(150);
  }
};
const waitRevision = async (page, want, timeout = 25_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page).catch(() => ({ revision: -1 }));
    if (s.revision >= want) return s.revision;
    if (Date.now() > until) return s.revision;
    await sleep(150);
  }
};
const pollUntil = async (read, test, timeout = 15_000, every = 200) => {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await read().catch(() => undefined);
    if (test(v)) return v;
    if (Date.now() > until) return v;
    await sleep(every);
  }
};
/** A write through the window API with the tab's revision as the base. */
const act = async (page, action, input) => {
  const s = await state(page);
  return invoke(page, action, { ...input, baseRevision: s.revision });
};
const closeNamePrompt = async (page) => {
  const dismiss = page
    .locator(
      '[data-control="namePrompt.skip"], [data-control="namePrompt.close"], [data-control="namePrompt.later"]',
    )
    .first();
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click().catch(() => null);
};
const closeOverlays = async (page) => {
  for (let i = 0; i < 3; i += 1) {
    const open = await page.$$('[role="dialog"], [role="menu"]');
    if (open.length === 0) break;
    await page.keyboard.press('Escape');
    await sleep(120);
  }
};
const openEditor = async (page, deckId) => {
  await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(page);
  await closeNamePrompt(page);
};
const gotoSlide = async (page, slideId) => {
  await invoke(page, 'view.goto', { slideId }).catch(() => null);
  await pollUntil(
    () => state(page).then((s) => s.slideId),
    (a) => a === slideId,
    8000,
  );
  await sleep(300);
};
const openMenuRow = async (page, menu, itemId, parentId) => {
  await closeOverlays(page);
  await page.click(`[data-control="menubar.${menu}"]`);
  await page.waitForSelector('[role="menu"][data-level="0"]', { timeout: 5000 });
  if (parentId) {
    const parent = page.locator(`[role="menu"] [data-menu-item="${parentId}"]`).first();
    await parent.waitFor({ timeout: 5000 });
    await parent.hover();
    await sleep(300);
    const child = page.locator(`[role="menu"] [data-menu-item="${itemId}"]`).first();
    if (!(await child.isVisible().catch(() => false))) await parent.click();
  }
  const row = page.locator(`[role="menu"] [data-menu-item="${itemId}"]`).first();
  await row.waitFor({ timeout: 5000 });
  await row.click();
  await sleep(200);
};
const openPanel = async (page, title, opener) => {
  await opener();
  const found = await page
    .waitForSelector(`.ts-rpanel [data-panel-title="${title}"]`, { timeout: 8000 })
    .catch(() => null);
  return found !== null;
};

// ---------------------------------------------------------------------------------------------
// the actions API with the bearer (deck.create, deck.info, deck.trash, deck.remove)
const postJson = async (path, body, extra = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...protection(), ...bearer(), ...extra },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
};
const created = [];
/** Decks no run of this walk may ever trash or remove: the seed deck of every store. */
const PROTECTED = new Set(['gt-brand', 'gt-brand-mu05h5vq']);
const createFrom = async (from, name) => {
  const id = `v5-${from.slice(0, 8)}-${Math.random().toString(36).slice(2, 7)}`;
  const answer = await postJson('/api/actions/deck.create', { name, id, from });
  if (answer.status !== 200)
    throw new Error(`deck.create ${answer.status}: ${answer.text.slice(0, 200)}`);
  created.push(id);
  return id;
};
const removeDeck = async (id) => {
  if (PROTECTED.has(id)) throw new Error(`${id} is protected`);
  const info = await postJson(`/api/actions/deck.info?deck=${id}`, {});
  const revision = info.json?.deck?.revision ?? info.json?.revision ?? 1;
  const trashed = await postJson(`/api/actions/deck.trash?deck=${id}`, {
    id,
    baseRevision: revision,
  });
  const after = trashed.json?.revision ?? revision;
  const removed = await postJson(`/api/actions/deck.remove?deck=${id}`, {
    id,
    confirm: true,
    baseRevision: after,
  });
  return `deck.info ${info.status} (revision ${revision}); deck.trash ${trashed.status}; deck.remove ${removed.status}`;
};

// ---------------------------------------------------------------------------------------------
// the walk
const launched = await launchBrowser({ probeRenderer: false });
const browser = launched.browser;
const newContext = (extra = {}) =>
  browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: protection(),
    acceptDownloads: true,
    ...extra,
  });
const consoleErrors = [];
const watch = (page, tag) =>
  page.on('console', (m) => {
    if (m.type() === 'error' && !/%c\[Server\]|favicon|ERR_BLOCKED_BY_CLIENT/.test(m.text()))
      consoleErrors.push(`${tag}: ${m.text().slice(0, 200)}`);
  });

const ctxA = await newContext();
const A = await ctxA.newPage();
watch(A, 'A');
let salesId = null;
let importId = null;
let scratchId = null;

try {
  // ---- S1 a rep's .pptx opened from File > Open in one step, told in one sentence
  if (only('S1')) {
    try {
      await openEditor(A, 'gt-brand');
      await openMenuRow(A, 'file', 'file.open');
      await A.waitForSelector('[role="dialog"]', { timeout: 8000 });
      const uploadTab = A.locator('[role="dialog"] [role="tab"]')
        .filter({ hasText: /upload/i })
        .first();
      await uploadTab.click();
      const input = A.locator('[data-control="dialog.open.file"]');
      const accept = await input.getAttribute('accept');
      const shot1 = await shoot(A, 'S1', 'open-dialog-upload-tab');
      const fixture = resolve(
        ROOT,
        'packages/import/src/__fixtures__/pptx/03-pictures-tables.pptx',
      );
      await input.setInputFiles(fixture);
      await sleep(400);
      const okButton = A.locator('[data-control="dialog.open.ok"]');
      const okEnabled = await okButton.isEnabled().catch(() => false);
      if (okEnabled) await okButton.click();
      const startUrl = A.url();
      const moved = await pollUntil(
        () => Promise.resolve(A.url()),
        (u) => /\/edit\/(?!gt-brand)/.test(u ?? ''),
        90_000,
        300,
      );
      const movedId = /\/edit\/([^/?#]+)/.exec(moved ?? '')?.[1] ?? null;
      // only a deck the upload made is this run's to remove: the address must have left the
      // source deck (a run that stays on /edit/gt-brand created nothing; PROTECTED never joins)
      importId = moved !== startUrl && movedId !== null && !PROTECTED.has(movedId) ? movedId : null;
      if (importId) created.push(importId);
      await editorReady(A).catch(() => null);
      const dialog = await A.waitForSelector('[data-control="dialog.importReport.summary"]', {
        timeout: 30_000,
      }).catch(() => null);
      const summary = dialog ? await dialog.textContent() : null;
      const shot2 = await shoot(A, 'S1', 'import-report');
      const info = importId ? await invoke(A, 'deck.info').catch(() => null) : null;
      const pageOf = info?.page ?? info?.deck?.page ?? null;
      const ok = Boolean(importId) && typeof summary === 'string' && /imported/.test(summary);
      (ok ? okRow : failRow)(
        'S1',
        'a .pptx opens from File > Open in one step with the report sentence',
        'the Upload tab accepts .pptx, the editor moves to the new deck, the Import report says what changed',
        `accept "${accept}"; Open button ${okEnabled ? 'clicked' : 'not enabled'}; address ${moved ?? A.url()}; report sentence ${JSON.stringify(summary)}; deck page ${JSON.stringify(pageOf)}; title ${JSON.stringify(info?.title)}`,
        [shot1, shot2].join(', '),
      );
      await closeOverlays(A);
    } catch (error) {
      failRow(
        'S1',
        'a .pptx opens from File > Open',
        'the import lands',
        `threw: ${String(error).slice(0, 300)}`,
        await shoot(A, 'S1', 'error'),
      );
    }
  }

  // ---- the Sales pitch copy every later scenario uses
  if (
    only('S2') ||
    only('S3') ||
    only('S4') ||
    only('S5') ||
    only('S6') ||
    only('S7') ||
    only('M1')
  ) {
    try {
      salesId = await createFrom('sales-pitch', 'Verifier sales pitch');
      okRow('S0', 'deck.create --from sales-pitch', 'a fifteen slide copy', `created ${salesId}`);
    } catch (error) {
      failRow('S0', 'deck.create --from sales-pitch', 'a copy', String(error).slice(0, 300));
    }
  }

  // ---- S2 the demo video: Insert > Video, the poster, the show plays it on the next click
  if (only('S2') && salesId) {
    try {
      await openEditor(A, salesId);
      await gotoSlide(A, 'product-demo');
      const poster = await A.$('.ts-stagewrap.ts-editor [data-media]');
      const posterFacts = poster
        ? await poster.evaluate((el) => ({
            kind: el.getAttribute('data-kind'),
            start: el.getAttribute('data-start'),
            attrs: [...el.attributes]
              .filter((a) => a.name.startsWith('data-'))
              .map((a) => `${a.name}=${a.value.slice(0, 30)}`),
          }))
        : null;
      const shot1 = await shoot(A, 'S2', 'demo-slide-poster');
      await openMenuRow(A, 'insert', 'insert.video');
      const dlg = await A.waitForSelector('[role="dialog"]', { timeout: 8000 }).catch(() => null);
      const tabs = dlg
        ? await A.$$eval('[role="dialog"] [role="tab"]', (els) =>
            els.map((el) => el.textContent.trim()),
          )
        : [];
      const shot2 = await shoot(A, 'S2', 'insert-video-dialog');
      await closeOverlays(A);
      // the hosted media rows of 16.8 on the copy's demo clip: a Range request answers 206 and the
      // media grant answers its form (the public store refuses with its sentence on this project)
      try {
        const asset = `${BASE}/decks/${salesId}/assets/demo.cc0aef83.webm`;
        const ranged = await fetch(asset, { headers: { ...protection(), Range: 'bytes=0-99' } });
        const head = await fetch(asset, { method: 'HEAD', headers: protection() });
        const grant = await fetch(`${BASE}/api/x/upload/media`, {
          headers: { ...protection(), ...bearer(), 'x-turboslide-fetch': '1' },
        });
        const grantText = (await grant.text()).slice(0, 200);
        (ranged.status === 206 && /bytes 0-99\//.test(ranged.headers.get('content-range') ?? '')
          ? okRow
          : failRow)(
          'S2r',
          'a Range request on the demo clip answers 206 with Content-Range; the media grant answers its form',
          '206 bytes 0-99/<size>; the grant JSON',
          `GET Range: ${ranged.status} content-range ${ranged.headers.get('content-range')} accept-ranges ${ranged.headers.get('accept-ranges')} type ${ranged.headers.get('content-type')} cache ${ranged.headers.get('cache-control')}; HEAD ${head.status} length ${head.headers.get('content-length')}; grant ${grant.status} ${grantText}`,
        );
      } catch (error) {
        failRow('S2r', 'the media Range row', '206', `threw: ${String(error).slice(0, 200)}`);
      }
      const compiled = await invoke(A, 'motion.compile', { slideId: 'product-demo' }).catch(
        (e) => ({ error: String(e) }),
      );
      const listed = await invoke(A, 'media.list').catch((e) => ({ error: String(e) }));
      const srcAttr =
        posterFacts?.attrs?.find((a) => a.startsWith('data-src=')) ?? 'data-src absent';
      (poster && tabs.length === 3 && srcAttr !== 'data-src=' ? okRow : failRow)(
        'S2a',
        'Insert > Video has three tabs; the demo clip is a poster root that names its stored file',
        'a .ts-media root with data-src naming the webm; three tabs',
        `poster ${poster ? 'drawn' : 'absent'} ${JSON.stringify(posterFacts?.attrs?.slice(0, 12))}; tabs ${JSON.stringify(tabs)}; media.list ${JSON.stringify(listed).slice(0, 200)}; motion.compile product-demo steps ${JSON.stringify(compiled?.steps?.length ?? compiled)}`,
        [shot1, shot2].join(', '),
      );
      // the show: the clip plays on the next click; the presenter console shows what is playing
      // (the presenter channel is BroadcastChannel plus localStorage, so the console is a second
      // page of the same context, as motion.spec.ts opens it)
      const B = await ctxA.newPage();
      watch(B, 'B');
      await A.goto(`${BASE}/deck/${salesId}?present=1`, { waitUntil: 'domcontentloaded' });
      await A.waitForSelector('.pt-viewer:not(.ts-skeleton)[data-settled]', { timeout: 60_000 });
      await A.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 60_000 });
      await invoke(A, 'view.goto', { slideId: 'product-demo' }).catch(() => null);
      const show = A.locator('.ts-slideshow');
      await pollUntil(
        () => show.getAttribute('data-slide-id'),
        (v) => v === 'product-demo',
        10_000,
      );
      const steps = await show.getAttribute('data-steps');
      const shot3 = await shoot(A, 'S2', 'show-before-click');
      await B.goto(`${BASE}/present/${salesId}`, { waitUntil: 'domcontentloaded' });
      await B.waitForSelector('[data-control="presenter"]', { timeout: 60_000 });
      await pollUntil(
        () => B.locator('[data-control="presenter.connection"]').getAttribute('data-connected'),
        (v) => v === 'true',
        20_000,
      );
      await A.locator('body').press('ArrowRight');
      const playing = await pollUntil(
        () =>
          A.evaluate(() => {
            const el = document.querySelector('.ts-slideshow [data-media]');
            const video = el?.querySelector('video, iframe');
            return el
              ? {
                  state: el.getAttribute('data-state') ?? el.getAttribute('data-playing'),
                  classes: el.className,
                  element: video ? video.tagName : null,
                  paused: video && 'paused' in video ? video.paused : null,
                }
              : null;
          }),
        (v) => v && v.element !== null,
        10_000,
      );
      const mediaRow = await pollUntil(
        () => B.locator('[data-control="presenter.media"]').count(),
        (n) => n > 0,
        8000,
      );
      const stepText = await B.locator('[data-control="presenter.step"]')
        .textContent()
        .catch(() => null);
      const shot4 = await shoot(A, 'S2', 'show-after-click');
      const shot5 = await shoot(B, 'S2', 'presenter-console');
      (playing?.element && mediaRow > 0 ? okRow : failRow)(
        'S2b',
        'the show plays the clip on the next click and the presenter console shows what is playing',
        'a media element mounted after ArrowRight; a presenter.media row',
        `steps on the slide ${steps}; after the click ${JSON.stringify(playing)}; presenter media rows ${mediaRow}; ${stepText}`,
        [shot3, shot4, shot5].join(', '),
      );
      await A.keyboard.press('Escape');
      await B.close();
    } catch (error) {
      failRow(
        'S2',
        'the demo video',
        'plays on the next click',
        `threw: ${String(error).slice(0, 300)}`,
        await shoot(A, 'S2', 'error'),
      );
    }
  }

  // ---- S3 the pricing rows one per click; Fade on every slide; the PPTX carries the builds
  if (only('S3') && salesId) {
    try {
      await openEditor(A, salesId);
      await gotoSlide(A, 'pricing');
      const opened = await openPanel(A, 'Motion', () =>
        A.click('[data-control="toolbar.transition"]'),
      );
      const shot1 = await shoot(A, 'S3', 'motion-panel-pricing');
      const rowsBefore = await A.$$eval(
        '[data-control="motion.list"] [data-control^="motion.row."][data-control$=".byParagraph"]',
        (els) => els.map((el) => el.checked),
      );
      const rowsListed = await A.$$eval(
        '[data-control="motion.list"] [data-control^="motion.row."]',
        (els) =>
          els
            .map((el) => el.getAttribute('data-control'))
            .filter((c) => /^motion\.row\.[^.]+$/.test(c)),
      );
      const pricingAnimations =
        (await invoke(A, 'slide.get', { slideId: 'pricing' })).slide?.animations ?? [];
      const rev0 = (await state(A)).revision;
      await A.selectOption('[data-control="motion.transition.kind"]', 'fade');
      await waitRevision(A, rev0 + 1, 10_000);
      const selectValue = await A.locator('[data-control="motion.transition.kind"]')
        .inputValue()
        .catch(() => null);
      const rev1 = (await state(A)).revision;
      let panelPath = `select -> ${selectValue}, revision ${rev0} -> ${rev1}`;
      if (rev1 === rev0) {
        // the panel's select did not write: the action the panel dispatches, through the window API,
        // so the row reads which half fails
        const byAction = await act(A, 'motion.transition', {
          slideId: 'pricing',
          kind: 'fade',
          durationMs: 500,
        }).catch((e) => ({ error: String(e).slice(0, 160) }));
        await settled(A);
        panelPath += `; motion.transition by action ${JSON.stringify(byAction).slice(0, 120)}`;
      }
      const rev2 = (await state(A)).revision;
      await A.click('[data-control="motion.transition.applyAll"]');
      await waitRevision(A, rev2 + 1, 10_000);
      const rev3 = (await state(A)).revision;
      if (rev3 === rev2) {
        const byAction = await act(A, 'motion.transition', {
          slideId: 'pricing',
          kind: 'fade',
          applyToAll: true,
        }).catch((e) => ({ error: String(e).slice(0, 160) }));
        await settled(A);
        panelPath += `; Apply to all by action ${JSON.stringify(byAction).slice(0, 120)}`;
      }
      await settled(A);
      const list = await invoke(A, 'slide.list');
      const kinds = [];
      for (const row of list) {
        const got = await invoke(A, 'slide.get', { slideId: row.id });
        kinds.push(got.slide?.transition?.kind ?? null);
      }
      const shot2 = await shoot(A, 'S3', 'apply-to-all');
      (opened &&
        rowsListed.length >= 1 &&
        pricingAnimations.some((a) => a.byParagraph === true) &&
        kinds.length === 15 &&
        kinds.every((k) => k === 'fade')
        ? okRow
        : failRow)(
        'S3a',
        'the pricing rows carry By paragraph; Fade applied to all slides writes every slide',
        'the rows animation listed with byParagraph true in the document; 15 slides at fade',
        `panel ${opened ? 'opened' : 'absent'}; By paragraph controls ${JSON.stringify(rowsBefore)} (the row collapsed lists none), rows listed ${JSON.stringify(rowsListed)}, document animations ${JSON.stringify(pricingAnimations).slice(0, 160)}; ${panelPath}; kinds ${JSON.stringify(kinds)}`,
        [shot1, shot2].join(', '),
      );
      // the show: one row per click
      await A.goto(`${BASE}/deck/${salesId}?present=1`, { waitUntil: 'domcontentloaded' });
      await A.waitForSelector('.pt-viewer:not(.ts-skeleton)[data-settled]', { timeout: 60_000 });
      await A.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 60_000 });
      await invoke(A, 'view.goto', { slideId: 'pricing' }).catch(() => null);
      const show = A.locator('.ts-slideshow');
      await pollUntil(
        () => show.getAttribute('data-slide-id'),
        (v) => v === 'pricing',
        10_000,
      );
      const hiddenOf = () =>
        A.evaluate(() => {
          const root = document.querySelector('.ts-slideshow') ?? document;
          const hidden = root.querySelectorAll('.is-hidden');
          const paras = root.querySelectorAll('[data-para]');
          const hiddenParas = [...paras].filter(
            (el) =>
              el.classList.contains('is-hidden') || getComputedStyle(el).visibility === 'hidden',
          );
          return (
            hidden.length + hiddenParas.filter((el) => !el.classList.contains('is-hidden')).length
          );
        });
      const steps = Number(await show.getAttribute('data-steps'));
      const sequence = [{ step: await show.getAttribute('data-step'), hidden: await hiddenOf() }];
      const shots = [await shoot(A, 'S3', 'show-step0')];
      for (let k = 1; k <= steps; k += 1) {
        await A.locator('body').press('ArrowRight');
        await pollUntil(
          () => show.getAttribute('data-step'),
          (v) => v === String(k),
          5000,
        );
        await sleep(600);
        sequence.push({ step: await show.getAttribute('data-step'), hidden: await hiddenOf() });
        shots.push(await shoot(A, 'S3', `show-step${k}`));
      }
      const decreasing = sequence.every((s, i) => i === 0 || s.hidden <= sequence[i - 1].hidden);
      (steps === 3 && decreasing && sequence[0].hidden > sequence[steps]?.hidden ? okRow : failRow)(
        'S3b',
        'the show advances one pricing row per click',
        'three steps, the hidden count falling by one per click',
        `data-steps ${steps}; ${JSON.stringify(sequence)}`,
        shots.join(', '),
      );
      await A.locator('body').press('ArrowLeft');
      await sleep(600);
      const back = { step: await show.getAttribute('data-step'), hidden: await hiddenOf() };
      (back.step === String(steps - 1) ? okRow : failRow)(
        'S3c',
        'Left arrow reverses one step',
        `step ${steps - 1}`,
        JSON.stringify(back),
        await shoot(A, 'S3', 'show-left'),
      );
      await A.keyboard.press('Escape');
    } catch (error) {
      failRow(
        'S3',
        'the pricing rows',
        'one per click',
        `threw: ${String(error).slice(0, 300)}`,
        await shoot(A, 'S3', 'error'),
      );
    }
  }

  // ---- M1 the motion walk in two browsers: the audience and the presenter
  if (only('M1') && salesId) {
    const B = await ctxA.newPage();
    watch(B, 'B');
    try {
      await A.goto(`${BASE}/deck/${salesId}?present=1`, { waitUntil: 'domcontentloaded' });
      await A.waitForSelector('.pt-viewer:not(.ts-skeleton)[data-settled]', { timeout: 60_000 });
      await A.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 60_000 });
      await invoke(A, 'view.goto', { slideId: 'the-problem' }).catch(() => null);
      const show = A.locator('.ts-slideshow');
      await pollUntil(
        () => show.getAttribute('data-slide-id'),
        (v) => v === 'the-problem',
        10_000,
      );
      await B.goto(`${BASE}/present/${salesId}`, { waitUntil: 'domcontentloaded' });
      await B.waitForSelector('[data-control="presenter"]', { timeout: 60_000 });
      const connected = await pollUntil(
        () => B.locator('[data-control="presenter.connection"]').getAttribute('data-connected'),
        (v) => v === 'true',
        20_000,
      );
      const stepsA = await show.getAttribute('data-steps');
      const text0 = await pollUntil(
        () => B.locator('[data-control="presenter.step"]').textContent(),
        (t) => /Step 0 of/.test(t ?? ''),
        10_000,
      );
      const shots = [
        await shoot(A, 'M1', 'audience-step0'),
        await shoot(B, 'M1', 'presenter-step0'),
      ];
      await B.locator('[data-control="presenter.next"]').click();
      const stepA1 = await pollUntil(
        () => show.getAttribute('data-step'),
        (v) => v === '1',
        8000,
      );
      const text1 = await B.locator('[data-control="presenter.step"]')
        .textContent()
        .catch(() => null);
      shots.push(await shoot(A, 'M1', 'audience-step1'), await shoot(B, 'M1', 'presenter-step1'));
      await A.locator('body').press('ArrowRight');
      const text2 = await pollUntil(
        () => B.locator('[data-control="presenter.step"]').textContent(),
        (t) => /Step 2 of/.test(t ?? ''),
        8000,
      );
      const preview = await B.locator('.ts-presenter-preview .ts-presenter-frame')
        .nth(1)
        .getAttribute('data-step')
        .catch(() => null);
      shots.push(await shoot(B, 'M1', 'presenter-step2'));
      (connected === 'true' &&
        stepA1 === '1' &&
        /Step 1 of/.test(text1 ?? '') &&
        /Step 2 of/.test(text2 ?? '')
        ? okRow
        : failRow)(
        'M1',
        'the presenter and the audience share the steps through the channel',
        'connected; Next in the console advances the audience; the audience click reaches the console',
        `connected ${connected}; audience data-steps ${stepsA}; console ${JSON.stringify([text0, text1, text2])}; audience step after Next ${stepA1}; next preview data-step ${preview}`,
        shots.join(', '),
      );
      // the pen
      await A.locator('body').press('p');
      const box = await A.locator('.ts-stagewrap.is-present .sheet').boundingBox();
      if (box) {
        await A.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
        await A.mouse.down();
        await A.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3, { steps: 6 });
        await A.mouse.up();
      }
      const strokes = await pollUntil(
        () => B.locator('[data-control="present.penLayer"]').getAttribute('data-strokes'),
        (v) => v === '1',
        8000,
      );
      (strokes === '1' ? okRow : failRow)(
        'M1b',
        'the pen stroke reaches the console',
        'data-strokes 1',
        `data-strokes ${strokes}`,
        await shoot(B, 'M1', 'presenter-stroke'),
      );
      await A.keyboard.press('Escape');
    } catch (error) {
      failRow(
        'M1',
        'the motion walk in two browsers',
        'the channel carries the steps',
        `threw: ${String(error).slice(0, 300)}`,
        await shoot(A, 'M1', 'error'),
      );
    } finally {
      await B.close().catch(() => null);
    }
  }

  // ---- S4 Edit theme: colours, rename, every slide follows
  if (only('S4') && salesId) {
    try {
      await openEditor(A, salesId);
      await gotoSlide(A, 'title');
      await openMenuRow(A, 'slide', 'slide.editTheme');
      const root = await A.waitForSelector('[data-control="themeMode"]', { timeout: 10_000 }).catch(
        () => null,
      );
      const shot1 = await shoot(A, 'S4', 'theme-mode');
      const controls = root
        ? await A.$$eval('[data-control="themeMode.toolbar"] [data-control]', (els) =>
            els.map((el) => el.getAttribute('data-control')),
          )
        : [];
      const exit = await A.$('[data-control="themeMode.exit"]');
      if (exit) await exit.click();
      else await A.keyboard.press('Escape');
      await sleep(400);
      const appearance = await A.evaluate(
        () =>
          document.querySelector('.ts-sheet, [data-appearance]')?.getAttribute('data-appearance') ??
          document.documentElement.getAttribute('data-theme') ??
          'light',
      );
      const mode = /dark/.test(String(appearance)) ? 'dark' : 'light';
      const set = await act(A, 'theme.set', {
        path: `/colors/${mode}/ink`,
        value: '#1a3d8f',
      }).catch((e) => ({ error: String(e) }));
      await settled(A);
      await waitRevision(A, set?.revision ?? 0, 10_000);
      const set2 = await act(A, 'theme.set', {
        path: `/colors/${mode}/ok`,
        value: '#c2410c',
      }).catch((e) => ({ error: String(e) }));
      await settled(A);
      await waitRevision(A, set2?.revision ?? 0, 10_000);
      const renamed = await act(A, 'theme.rename', { name: 'Verifier colours' }).catch((e) => ({
        error: String(e),
      }));
      await settled(A);
      await waitRevision(A, renamed?.revision ?? 0, 10_000);
      const colour = async (slideId) => {
        await gotoSlide(A, slideId);
        return A.evaluate(() => {
          const h = document.querySelector(
            '.ts-stagewrap.ts-editor .pt-slide h1, .ts-stagewrap.ts-editor .pt-slide h2, .ts-stagewrap.ts-editor .pt-slide [data-block]',
          );
          return h ? getComputedStyle(h).color : null;
        });
      };
      const c1 = await colour('title');
      const shot2 = await shoot(A, 'S4', 'title-after-theme-set');
      const c2 = await colour('pricing');
      const shot3 = await shoot(A, 'S4', 'pricing-after-theme-set');
      const opened = await openPanel(A, 'Themes', () =>
        openMenuRow(A, 'slide', 'slide.changeTheme'),
      );
      const edited = opened
        ? await A.locator('[data-control="themes.inThis.edited"]')
            .textContent()
            .catch(() => null)
        : null;
      const shot4 = await shoot(A, 'S4', 'themes-panel');
      const ok =
        root !== null && !set?.error && !renamed?.error && /Verifier colours/.test(edited ?? '');
      (ok ? okRow : failRow)(
        'S4',
        'Edit theme: the mode, Text and background 1 and Accent 1 set, renamed, every slide follows, the panel lists it',
        'the mode with its toolbar; theme.set and theme.rename answer; the panel names the edited theme',
        `mode ${root ? 'entered' : 'absent'} toolbar ${JSON.stringify(controls)}; appearance ${mode}; theme.set ink ${JSON.stringify(set).slice(0, 120)}; theme.set ok (Accent 1) ${JSON.stringify(set2).slice(0, 80)}; rename ${JSON.stringify(renamed).slice(0, 100)}; heading colour title ${c1}, pricing ${c2}; panel edited row ${JSON.stringify(edited)}`,
        [shot1, shot2, shot3, shot4].join(', '),
      );
      skipRow(
        'S4b',
        'a picture in the corner slot and the deck saved as a template of the organisation',
        'the mark slot takes a picture; a template save',
        'no template save action exists in SPEC-5 13; the corner picture needs an asset in the copy (the walk plants none)',
      );
      await closeOverlays(A);
    } catch (error) {
      failRow(
        'S4',
        'Edit theme',
        'the mode',
        `threw: ${String(error).slice(0, 300)}`,
        await shoot(A, 'S4', 'error'),
      );
    }
  }

  // ---- S5 print settings and preview; Download as PowerPoint
  if (only('S5') && salesId) {
    try {
      await A.goto(`${BASE}/print/${salesId}`, { waitUntil: 'domcontentloaded' });
      await A.waitForSelector('[data-control="print.layout"]', { timeout: 30_000 });
      const options = await A.$$eval('[data-control="print.layout"] option', (els) =>
        els.map((el) => ({ label: el.textContent.trim(), disabled: el.disabled, value: el.value })),
      );
      const shot1 = await shoot(A, 'S5', 'print-layout-dropdown');
      const handout3 = options.find((o) => /3/.test(o.label) && /page|handout/i.test(o.label));
      (handout3 && !handout3.disabled ? okRow : failRow)(
        'S5a',
        'File > Print settings and preview offers 3 slides per page with note lines on Letter',
        'a "3 slides per page" row enabled and a paper dropdown',
        `layout rows ${JSON.stringify(options)}; paper dropdown ${(await A.$('[data-control="print.paper"]')) ? 'drawn' : 'absent'}`,
        shot1,
      );
      await openEditor(A, salesId);
      await openMenuRow(A, 'file', 'file.download');
      const pptxRow = A.locator('[role="menu"] [data-menu-item="file.download.pptx"]').first();
      await pptxRow.waitFor({ timeout: 5000 });
      await pptxRow.click();
      const dlg = await A.waitForSelector('[role="dialog"]', { timeout: 8000 }).catch(() => null);
      const modes = dlg
        ? await A.$$eval('[data-control^="dialog.download.mode."]', (els) =>
            els.map((el) => el.getAttribute('data-control')),
          )
        : [];
      const shot2 = await shoot(A, 'S5', 'download-dialog');
      await closeOverlays(A);
      (modes.length === 2 ? okRow : failRow)(
        'S5b',
        'Download as PowerPoint offers Editable text and Perfect',
        'two mode rows',
        `modes ${JSON.stringify(modes)}`,
        shot2,
      );
      skipRow(
        'S5c',
        'the Editable text file keeps the animations and the embedded video; the Perfect file shows every object at rest',
        'bldP and a:videoFile in the native file; perfect: true',
        'read on the checkout with the CLI (VERIFICATION-5.md section 6, the sales-pitch export of check step 34); the preview export writes a download the walk does not fetch',
      );
    } catch (error) {
      failRow(
        'S5',
        'print and download',
        'the dropdowns',
        `threw: ${String(error).slice(0, 300)}`,
        await shoot(A, 'S5', 'error'),
      );
    }
  }

  // ---- S6 chat between two browsers
  if (only('S6') && salesId) {
    const ctxB = await newContext();
    const B = await ctxB.newPage();
    watch(B, 'B');
    try {
      await openEditor(A, salesId);
      await openEditor(B, salesId);
      const others = await pollUntil(
        () =>
          state(A).then((s) =>
            typeof s.presence?.others === 'number'
              ? s.presence.others
              : (s.presence?.others?.length ?? 0),
          ),
        (n) => n > 0,
        45_000,
        500,
      );
      const openChat = async (page) => {
        await page.locator('[data-control="presence.more"]').click();
        await page.locator('#ts-menu-roster').waitFor({ timeout: 5000 });
        await page.locator('#ts-menu-roster [data-menu-item="title.presence.joinChat"]').click();
        return (
          (await page
            .waitForSelector('.ts-rpanel [data-panel-title="Chat"]', { timeout: 8000 })
            .catch(() => null)) !== null
        );
      };
      const openedA = await openChat(A);
      const openedB = await openChat(B);
      const firstLine = await A.locator('[data-control="panel.chat.notSaved"]')
        .textContent()
        .catch(() => null);
      const text = `verifier ${Date.now().toString(36)}`;
      await A.locator('[data-control="panel.chat.composer"]').click();
      await typeHuman(A, text);
      const t0 = Date.now();
      await A.locator('[data-control="panel.chat.send"]').click();
      const inA = await pollUntil(
        () =>
          A.evaluate(
            (t) =>
              [...document.querySelectorAll('[data-control^="panel.chat.message."]')].some((el) =>
                el.textContent.includes(t),
              ),
            text,
          ),
        (v) => v === true,
        8000,
      );
      const inB = await pollUntil(
        () =>
          B.evaluate(
            (t) =>
              [...document.querySelectorAll('[data-control^="panel.chat.message."]')].some((el) =>
                el.textContent.includes(t),
              ),
            text,
          ),
        (v) => v === true,
        10_000,
      );
      const ms = Date.now() - t0;
      const errA = await A.locator('[data-control="panel.chat.error"]')
        .textContent()
        .catch(() => null);
      const shots = [await shoot(A, 'S6', 'chat-A'), await shoot(B, 'S6', 'chat-B')];
      (openedA && openedB && inA === true && inB === true ? okRow : failRow)(
        'S6',
        'Join chat opens from the title row; a message reaches the second browser within a second; the panel says nothing is saved',
        'both panels open; the message in A and in B',
        `others seen by A before opening ${others}; panels ${openedA}/${openedB}; first line ${JSON.stringify(firstLine)}; in A ${inA}; in B ${inB} after ${ms} ms; error ${JSON.stringify(errA)}`,
        shots.join(', '),
      );
    } catch (error) {
      failRow(
        'S6',
        'chat',
        'the message reaches B',
        `threw: ${String(error).slice(0, 300)}`,
        await shoot(A, 'S6', 'error'),
      );
    } finally {
      await ctxB.close().catch(() => null);
    }
  }

  // ---- S7 the 4:3 page
  if (only('S7') && salesId) {
    try {
      await openEditor(A, salesId);
      await gotoSlide(A, 'pricing');
      const before = await invoke(A, 'slide.get', { slideId: 'title' });
      const pageBefore = await A.evaluate(() =>
        document.querySelector('[data-page]')?.getAttribute('data-page'),
      );
      const set = await act(A, 'deck.setPageSize', {
        preset: 'standard-4-3',
        objects: 'keep',
      }).catch((e) => ({ error: String(e) }));
      await settled(A);
      await sleep(800);
      const pageAfter = await A.evaluate(() =>
        document.querySelector('[data-page]')?.getAttribute('data-page'),
      );
      const aspect = await A.evaluate(() => {
        const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide');
        const r = sheet?.getBoundingClientRect();
        return r ? Math.round((r.width / r.height) * 1000) / 1000 : null;
      });
      const after = await invoke(A, 'slide.get', { slideId: 'title' });
      const shot1 = await shoot(A, 'S7', 'editor-4-3');
      const info = await invoke(A, 'deck.info').catch(() => null);
      const samePos = JSON.stringify(before.slide?.slots) === JSON.stringify(after.slide?.slots);
      (!set?.error && pageAfter === '1200x900' && Math.abs((aspect ?? 0) - 1.333) < 0.02 && samePos
        ? okRow
        : failRow)(
        'S7a',
        'deck.setPageSize standard-4-3 keeps every object and the stage turns 4:3',
        "data-page 1200x900, the sheet at 4:3, the title slide's blocks unchanged",
        `deck.setPageSize ${JSON.stringify(set).slice(0, 160)}; data-page ${pageBefore} -> ${pageAfter}; sheet aspect ${aspect}; blocks unchanged ${samePos}; deck.info page ${JSON.stringify(info?.page ?? info?.deck?.page)}`,
        shot1,
      );
      await openMenuRow(A, 'file', 'file.pageSetup').catch(() => null);
      const row = await A.evaluate(() => {
        const el = document.querySelector('[role="menu"] [data-menu-item="file.pageSetup"]');
        return el
          ? { disabled: el.getAttribute('aria-disabled'), tip: el.getAttribute('data-tip') }
          : null;
      });
      const dialog = await A.$('[role="dialog"]');
      const shot2 = await shoot(A, 'S7', 'file-menu-page-setup');
      await closeOverlays(A);
      (dialog !== null ? okRow : failRow)(
        'S7b',
        'File > Page setup opens the dialog',
        'a Page setup dialog',
        `row ${JSON.stringify(row)}; dialog ${dialog ? 'opened' : 'none'}`,
        shot2,
      );
      skipRow(
        'S7c',
        'an imported 4:3 .pptx is 4:3 in the editor and in every export',
        'a 4:3 source page',
        'none of the five fixtures is 4:3 (every source page is 1600 by 900); the export of the 4:3 fixture deck is read on the checkout (VERIFICATION-5.md section 6)',
      );
    } catch (error) {
      failRow(
        'S7',
        'the 4:3 page',
        'the page changes',
        `threw: ${String(error).slice(0, 300)}`,
        await shoot(A, 'S7', 'error'),
      );
    }
  }

  // ---- K1 Kevin's report 1: the revision and the self presence on a fresh deck
  if (only('K1')) {
    try {
      await A.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
      await editorReady(A);
      const title = A.locator(
        '.ts-stagewrap.ts-editor .pt-slide [data-run="heading/text"]',
      ).first();
      await title.waitFor({ timeout: 20_000 });
      const tb = await title.boundingBox();
      await A.mouse.dblclick(tb.x + tb.width / 2, tb.y + tb.height / 2);
      await sleep(300);
      const words = 'Quarterly review';
      const observed = [];
      for (const ch of words) {
        await A.keyboard.type(ch);
        await sleep(160);
        const s = await state(A).catch(() => ({}));
        const chip = await A.locator('[data-control="deck.saveState"]')
          .textContent()
          .catch(() => null);
        observed.push({
          revision: s.revision,
          server: s.sync?.serverRevision ?? s.serverRevision ?? null,
          chip,
        });
      }
      await A.keyboard.press('Escape');
      await settled(A, 30_000);
      const moved = await pollUntil(
        () => Promise.resolve(A.url()),
        (u) => /\/edit\//.test(u ?? ''),
        30_000,
        300,
      );
      scratchId = /\/edit\/([^/?#]+)/.exec(moved ?? '')?.[1] ?? null;
      if (scratchId) created.push(scratchId);
      await closeNamePrompt(A);
      const final = await state(A);
      const body = await A.evaluate(() => document.body.innerText);
      const stale = /is stale|baseRevision|moved to revision|out of date/i.test(body);
      const presence = await A.evaluate(() => ({
        chips: document.querySelectorAll('[data-control^="presence.chip."]').length,
        outlines: document.querySelectorAll('.ts-remote-outline').length,
        carets: document.querySelectorAll('.ts-remote-caret').length,
        pointers: document.querySelectorAll('.ts-remote-pointer-group').length,
      }));
      const chipFinal = await A.locator('[data-control="deck.saveState"]')
        .textContent()
        .catch(() => null);
      const shot = await shoot(A, 'K1', 'fresh-deck-after-typing');
      const behind = observed.filter((o) => o.server !== null && o.revision > o.server).length;
      const ok =
        Boolean(scratchId) &&
        !stale &&
        presence.chips === 0 &&
        presence.carets === 0 &&
        presence.outlines === 0 &&
        behind === 0;
      (ok ? okRow : failRow)(
        'K1',
        "Kevin's report 1: typing on a fresh deck never shows a stale revision, and the tab never sees itself as a collaborator",
        "no stale words; no remote chip, outline or caret; the reported revision never ahead of the server's",
        `deck ${scratchId}; final revision ${final.revision}, server ${final.sync?.serverRevision ?? 'n/a'}, chip ${JSON.stringify(chipFinal)}; stale words ${stale}; remote presence ${JSON.stringify(presence)}; ${observed.length} keystrokes, ${behind} with the revision ahead of the server`,
        shot,
      );
    } catch (error) {
      failRow(
        'K1',
        "Kevin's report 1",
        'no stale revision',
        `threw: ${String(error).slice(0, 300)}`,
        await shoot(A, 'K1', 'error'),
      );
    }
  }

  // ---- K2 Kevin's report 2: resizing scales the content
  if (only('K2') && scratchId) {
    try {
      await openEditor(A, scratchId);
      const s0 = await state(A);
      await act(A, 'slide.new', { layout: 'blank', id: 'v5-canvas', after: s0.slideId }).catch(
        () => null,
      );
      await gotoSlide(A, 'v5-canvas');
      await act(A, 'block.insert', {
        slideId: 'v5-canvas',
        slot: 'main',
        block: {
          id: 'v5-rect',
          type: 'shape',
          shape: 'ellipse',
          stroke: 'hair',
          fill: 'plate',
          text: 'Resize me',
        },
        pos: { x: 200, y: 160, w: 300, h: 200 },
      }).catch(() => null);
      await settled(A);
      await A.locator('.ts-stagewrap.ts-editor [data-block="v5-rect"]').first().click();
      await sleep(300);
      const before = await A.evaluate(() => {
        const el = document.querySelector('.ts-stagewrap.ts-editor [data-block="v5-rect"]');
        const svg = el?.querySelector('svg');
        const r = el?.getBoundingClientRect();
        const rs = svg?.getBoundingClientRect();
        return {
          box: r ? [r.width, r.height].map(Math.round) : null,
          svg: rs ? [rs.width, rs.height].map(Math.round) : null,
        };
      });
      const shot1 = await shoot(A, 'K2', 'shape-before-resize');
      const handle = A.locator('.ts-overlay [data-control="handle.v5-rect.resize.se"]');
      const hb = await handle.boundingBox();
      if (!hb) throw new Error('no se handle');
      await A.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await A.mouse.down();
      await A.mouse.move(hb.x + hb.width / 2 + 150, hb.y + hb.height / 2 + 100, { steps: 14 });
      const readout = await A.locator('[data-control="canvas.readout"], .ts-readout')
        .first()
        .textContent()
        .catch(() => null);
      await A.mouse.up();
      await sleep(600);
      await settled(A);
      const after = await A.evaluate(() => {
        const el = document.querySelector('.ts-stagewrap.ts-editor [data-block="v5-rect"]');
        const svg = el?.querySelector('svg');
        const r = el?.getBoundingClientRect();
        const rs = svg?.getBoundingClientRect();
        return {
          box: r ? [r.width, r.height].map(Math.round) : null,
          svg: rs ? [rs.width, rs.height].map(Math.round) : null,
        };
      });
      const pos = (await invoke(A, 'slide.get', { slideId: 'v5-canvas' })).slide.slots.main.find(
        (b) => b.id === 'v5-rect',
      )?.pos;
      const shot2 = await shoot(A, 'K2', 'shape-after-resize');
      const grew =
        after.box &&
        before.box &&
        after.box[0] > before.box[0] + 60 &&
        after.box[1] > before.box[1] + 40;
      const svgFollows =
        after.svg &&
        after.box &&
        Math.abs(after.svg[0] - after.box[0]) <= 8 &&
        Math.abs(after.svg[1] - after.box[1]) <= 8;
      (grew && svgFollows && pos && pos.w > 300 ? okRow : failRow)(
        'K2',
        "Kevin's report 2: a shape resized by its bottom right handle grows with its content",
        'the box and its svg grow together; pos.w over 300',
        `box ${JSON.stringify(before)} -> ${JSON.stringify(after)}; pos ${JSON.stringify(pos)}; readout during the drag ${JSON.stringify(readout)}`,
        [shot1, shot2].join(', '),
      );
    } catch (error) {
      failRow(
        'K2',
        "Kevin's report 2",
        'the resize scales',
        `threw: ${String(error).slice(0, 300)}`,
        await shoot(A, 'K2', 'error'),
      );
    }
  }

  // ---- K3 Kevin's report 3: more font options
  if (only('K3') && scratchId) {
    try {
      await openEditor(A, scratchId);
      await gotoSlide(A, 'v5-canvas');
      await A.locator('.ts-stagewrap.ts-editor [data-block="v5-rect"]').first().click();
      await sleep(300);
      const font = await A.waitForSelector('[data-control="toolbar.font"]', {
        timeout: 8000,
      }).catch(() => null);
      if (!font) throw new Error('no toolbar.font control with the shape selected');
      await font.click();
      await A.waitForSelector('[data-control="toolbar.font.list"]', { timeout: 8000 });
      const rowsN = await A.$$eval('[data-control^="toolbar.font.pick."]', (els) => els.length);
      const faces = await A.$$eval('[data-control^="toolbar.font.pick."]', (els) =>
        els
          .slice(0, 6)
          .map(
            (el) =>
              `${el.textContent.trim()}: ${getComputedStyle(el.querySelector('.ts-font-label') ?? el).fontFamily.slice(0, 40)}`,
          ),
      );
      const shot1 = await shoot(A, 'K3', 'font-dropdown');
      const listed = await invoke(A, 'font.list').catch(() => null);
      const catalog = Array.isArray(listed)
        ? listed.length
        : Array.isArray(listed?.fonts)
          ? listed.fonts.length
          : null;
      const pick = A.locator('[data-control="toolbar.font.pick.playfair-display"]');
      const rev = (await state(A)).revision;
      await pick.click();
      await waitRevision(A, rev + 1, 10_000);
      await settled(A);
      const computed = await A.evaluate(() => {
        const el = document.querySelector(
          '.ts-stagewrap.ts-editor [data-block="v5-rect"] [data-run], .ts-stagewrap.ts-editor [data-block="v5-rect"]',
        );
        return el ? getComputedStyle(el).fontFamily : null;
      });
      const links = await A.$$eval('link[rel="stylesheet"]', (els) =>
        els.map((el) => el.getAttribute('href')).filter((h) => /\/fonts\//.test(h ?? '')),
      );
      const shot2 = await shoot(A, 'K3', 'playfair-applied');
      (rowsN >= 20 && catalog !== null && rowsN === catalog && /Playfair/i.test(computed ?? '')
        ? okRow
        : failRow)(
        'K3',
        "Kevin's report 3: the Font dropdown offers the catalog and a pick changes the face",
        'about twenty five families in the dropdown, equal to font.list; Playfair Display applied',
        `${rowsN} row(s) against font.list ${catalog}; first rows ${JSON.stringify(faces)}; computed font-family ${JSON.stringify(computed)}; font stylesheets ${JSON.stringify(links)}`,
        [shot1, shot2].join(', '),
      );
    } catch (error) {
      failRow(
        'K3',
        "Kevin's report 3",
        'the font catalog',
        `threw: ${String(error).slice(0, 300)}`,
        await shoot(A, 'K3', 'error'),
      );
    }
  }

  // ---- T1 the tooltip and layout shift cells of the new panels (16.5, the verifier's rows)
  if (only('T1') && (scratchId || salesId)) {
    const deck = salesId ?? scratchId;
    const states = [
      [
        'motion',
        'Motion panel',
        async (p) => openPanel(p, 'Motion', () => p.click('[data-control="toolbar.transition"]')),
      ],
      [
        'spellCheck',
        'Spell check card',
        async (p) =>
          openPanel(p, 'Spell check', () =>
            openMenuRow(p, 'tools', 'tools.spelling.spellCheck', 'tools.spelling'),
          ),
      ],
      [
        'chat',
        'Chat panel',
        async (p) => {
          const more = p.locator('[data-control="presence.more"]');
          if (!(await more.isVisible().catch(() => false))) {
            const openedByAction = await invoke(p, 'client', { id: 'panel', title: 'Chat' }).catch(
              () => null,
            );
            void openedByAction;
            return (
              (await p
                .waitForSelector('.ts-rpanel [data-panel-title="Chat"]', { timeout: 3000 })
                .catch(() => null)) !== null
            );
          }
          await more.click();
          await p.locator('#ts-menu-roster').waitFor({ timeout: 5000 });
          await p.locator('#ts-menu-roster [data-menu-item="title.presence.joinChat"]').click();
          return (
            (await p
              .waitForSelector('.ts-rpanel [data-panel-title="Chat"]', { timeout: 8000 })
              .catch(() => null)) !== null
          );
        },
      ],
      [
        'dictionary',
        'Dictionary panel',
        async (p) => openPanel(p, 'Dictionary', () => openMenuRow(p, 'tools', 'tools.dictionary')),
      ],
      [
        'equation',
        'equation toolbar',
        async (p) => {
          await openMenuRow(p, 'insert', 'insert.equation');
          return (
            (await p
              .waitForSelector('[data-control="equationToolbar"]', { timeout: 10_000 })
              .catch(() => null)) !== null
          );
        },
      ],
      [
        'themeMode',
        'theme mode',
        async (p) => {
          await openMenuRow(p, 'slide', 'slide.editTheme');
          return (
            (await p
              .waitForSelector('[data-control="themeMode"]', { timeout: 10_000 })
              .catch(() => null)) !== null
          );
        },
      ],
    ];
    const rootOf = {
      motion: '.ts-rpanel [data-panel-title="Motion"]',
      spellCheck: '.ts-rpanel [data-panel-title="Spell check"]',
      chat: '.ts-rpanel [data-panel-title="Chat"]',
      dictionary: '.ts-rpanel [data-panel-title="Dictionary"]',
      equation: '[data-control="equationToolbar"]',
      themeMode: '[data-control="themeMode"]',
    };
    for (const width of [1440, 1280, 390]) {
      for (const appearance of ['light', 'dark']) {
        const ctx = await newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        const page = await ctx.newPage();
        await page.addInitScript((theme) => {
          try {
            localStorage.setItem('gt-theme', theme);
          } catch {}
          window.__v5Shifts = [];
          try {
            new PerformanceObserver((list) => {
              for (const e of list.getEntries())
                if (!e.hadRecentInput)
                  window.__v5Shifts.push({
                    value: e.value,
                    sources: (e.sources ?? []).map(
                      (s) => s.node?.className ?? s.node?.tagName ?? '?',
                    ),
                  });
            }).observe({ type: 'layout-shift', buffered: true });
          } catch {}
        }, appearance);
        for (const [id, label, open] of states) {
          try {
            await openEditor(page, deck);
            await gotoSlide(page, salesId ? 'pricing' : 'v5-canvas').catch(() => null);
            await sleep(500);
            await page.evaluate(() => {
              window.__v5Shifts = [];
            });
            const opened = await open(page);
            await sleep(700);
            const facts = await page.evaluate((root) => {
              const el = document.querySelector(root);
              const interactive = el
                ? [
                    ...el.querySelectorAll(
                      'button, input, select, textarea, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="radio"], [role="checkbox"]',
                    ),
                  ]
                : [];
              const visible = interactive.filter(
                (n) =>
                  !n.closest('[aria-hidden="true"]') &&
                  n.tagName !== 'OPTION' &&
                  !n.classList.contains('ts-native-mirror'),
              );
              const missing = visible
                .filter((n) => !n.closest('[data-tip]') && !n.hasAttribute('title'))
                .map((n) => n.getAttribute('data-control') ?? n.tagName);
              const titleOnly = visible
                .filter((n) => !n.closest('[data-tip]') && n.hasAttribute('title'))
                .map((n) => n.getAttribute('data-control') ?? n.tagName);
              const shifts = window.__v5Shifts ?? [];
              return {
                interactive: visible.length,
                missing,
                titleOnly,
                shifts: shifts.length,
                shiftValue: Math.round(shifts.reduce((a, s) => a + s.value, 0) * 10000) / 10000,
                sources: shifts.slice(0, 3).map((s) => s.sources.join('>')),
              };
            }, rootOf[id]);
            const shot =
              width === 1440 ? await shoot(page, 'T1', `${id}-${width}-${appearance}`) : null;
            const ok = opened && facts.missing.length === 0 && facts.shifts === 0;
            (ok ? okRow : failRow)(
              `T1 ${id} ${width} ${appearance}`,
              `${label} open: every control has a tooltip and the opening shifts nothing`,
              '0 controls without data-tip; 0 layout shift entries',
              `${opened ? 'opened' : 'DID NOT OPEN'}; ${facts.interactive} interactive, ${facts.missing.length} without a tooltip ${JSON.stringify(facts.missing.slice(0, 8))}, ${facts.titleOnly.length} title only; layout shift entries ${facts.shifts} (value ${facts.shiftValue}) ${JSON.stringify(facts.sources)}`,
              shot,
            );
            if (id === 'themeMode') {
              const exit = await page.$('[data-control="themeMode.exit"]');
              if (exit) await exit.click().catch(() => null);
            }
          } catch (error) {
            failRow(
              `T1 ${id} ${width} ${appearance}`,
              label,
              'the cell',
              `threw: ${String(error).slice(0, 200)}`,
            );
          }
        }
        await ctx.close();
      }
    }
  }
} catch (error) {
  failRow(
    'run',
    'the walk',
    'to completion',
    `threw: ${String(error?.stack ?? error).slice(0, 600)}`,
  );
} finally {
  // every deck the walk created is trashed and deleted forever through the actions API
  for (const id of created) {
    if (PROTECTED.has(id) || !/^(v5-|untitled-|smoke-|e2e-)/.test(id)) {
      rows.push({
        n: rows.length + 1,
        id: 'cleanup',
        name: id,
        expected: 'left alone',
        observed: 'not a deck this walk creates (the guard refuses it)',
        ok: null,
        shot: null,
      });
      continue;
    }
    try {
      const result = await removeDeck(id);
      log(`cleanup ${id}: ${result}`);
      rows.push({
        n: rows.length + 1,
        id: 'cleanup',
        name: id,
        expected: 'trashed and deleted forever',
        observed: result,
        ok: /deck\.remove 200/.test(result),
        shot: null,
      });
    } catch (error) {
      rows.push({
        n: rows.length + 1,
        id: 'cleanup',
        name: id,
        expected: 'trashed and deleted forever',
        observed: `threw: ${String(error).slice(0, 200)}`,
        ok: false,
        shot: null,
      });
    }
  }
  await launched.close().catch(() => null);
}

const summary = {
  base: BASE,
  at: new Date().toISOString(),
  ms: Date.now() - started,
  passed: rows.filter((r) => r.ok === true).length,
  failed: rows.filter((r) => r.ok === false).length,
  notDriven: rows.filter((r) => r.ok === null).length,
  consoleErrors,
  created,
};
if (JSON_OUT) {
  mkdirSync(dirname(resolve(ROOT, JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ROOT, JSON_OUT), `${JSON.stringify({ summary, rows }, null, 2)}\n`);
}
log(
  `\npreview-walk: ${rows.length} rows, ${summary.passed} ok, ${summary.failed} failed, ${summary.notDriven} not driven, ${consoleErrors.length} console errors, ${Math.round(summary.ms / 1000)} s against ${BASE}${JSON_OUT ? `; table ${JSON_OUT}` : ''}`,
);
process.exit(summary.failed > 0 ? 1 : 0);
