// The integrator's pictures of the people surfaces on the do tier (docs/CLOUDFLARE.md 2.1; the
// merge pass, build/integrator.md): two anonymous browsers, A on `--a` and B on `--b` (the two
// process run over one Worker, or one deployment twice), at 1440 by 900 in one appearance
// (`--appearance light|dark`), on one scratch deck A makes from /new. Pictures, in order: the title
// row with B's chip, A's roster for B, B's caret and selection outline in A, B's live pointer in A,
// B's chip on the filmstrip card, the Following plate, and the Sign in dialog; then the deck is
// trashed and removed by its id. The window API is the page's own, so no bearer is needed; on a
// protected preview the OIDC token rides as x-vercel-trusted-oidc-idp-token from VERCEL_OIDC_TOKEN
// (a wrapper sets it; nothing here prints it). The helpers are the lanes' (build/r2/drive.mjs,
// build/r3/drive.mjs of the realtime round). Facts land in facts.json beside the pictures.
//   node docs/gslides-parity/cloudflare/build/integrator/pictures.mjs --a http://127.0.0.1:4478 \
//     --b http://127.0.0.1:4488 --out docs/gslides-parity/cloudflare/build/integrator/do-light --appearance light
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

// playwright resolves from the repository's package.json the way the probes resolve it
const require = createRequire('/Users/kevinliu/repos/Turboslide-realtime/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const BASE_A = arg('a', 'http://127.0.0.1:4478');
const BASE_B = arg('b', BASE_A);
const APPEARANCE = arg('appearance', 'light') === 'dark' ? 'dark' : 'light';
const OUT = resolve(arg('out', `docs/gslides-parity/cloudflare/build/integrator/${APPEARANCE}`));
const OIDC = process.env.VERCEL_OIDC_TOKEN ?? '';
mkdirSync(OUT, { recursive: true });

const facts = {
  startedAt: new Date().toISOString(),
  baseA: BASE_A,
  baseB: BASE_B,
  appearance: APPEARANCE,
  pictures: [],
};
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const TYPE_DELAY = 60;

const ctl = (page, id) => page.locator(`[data-control="${id}"]`).first();
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const invoke = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);

async function waitEditor(page) {
  await page.waitForFunction(() => Boolean(window.turboslide && window.turboslide.studio), null, {
    timeout: 90_000,
  });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 60_000 });
}
async function poll(fn, timeout = 30_000, every = 50) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await sleep(every);
  }
  return last;
}
const runsOf = (page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => ({
      run: el.getAttribute('data-run') ?? '',
      text: el.textContent ?? '',
    })),
  );
const runEl = (page, run) =>
  page.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`).first();
async function beginTyping(page, run, text, { replace = true } = {}) {
  await runEl(page, run).dblclick();
  await sleep(150);
  await page.keyboard.press(replace ? 'Meta+a' : 'Meta+ArrowDown');
  await page.keyboard.type(text, { delay: TYPE_DELAY });
}
const clientIdOf = async (page) => {
  const s = await state(page);
  return s.presence?.clientId ?? s.sync?.clientId ?? null;
};
const remoteDrawings = (page) =>
  page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    };
    const pick = (sel) =>
      [...document.querySelectorAll(sel)].map((el) => ({
        client: el.getAttribute('data-client'),
        box: rect(el),
        offset: el.getAttribute('data-offset'),
        inside: el.getAttribute('data-inside'),
      }));
    return {
      carets: pick('.ts-remote-caret'),
      outlines: pick('.ts-remote-outline:not(.ts-remote-drag)'),
      pointers: pick('.ts-remote-pointer-group'),
      chips: [...document.querySelectorAll('[data-control^="presence.chip."]')].map((el) => ({
        id: el.getAttribute('data-control'),
        box: rect(el),
      })),
    };
  });
async function shot(page, name, clip) {
  // the plates and menus fade in (presence.css `pt-fade-in`, `--pt-dur-fast`): the picture waits
  // past the fade, so a menu is drawn at full opacity (the 01:48 roster pictures caught it mid fade)
  await page.waitForTimeout(400);
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, ...(clip ? { clip } : {}) });
  facts.pictures.push(`${name}.png`);
  console.log(`picture: ${name}.png`);
  return `${name}.png`;
}
async function stageClip(page) {
  const box = await page.locator('.ts-stagewrap.ts-editor').first().boundingBox();
  if (!box) return undefined;
  const vp = page.viewportSize();
  return {
    x: Math.max(0, box.x - 8),
    y: Math.max(0, box.y - 56),
    width: Math.min(vp.width - Math.max(0, box.x - 8), box.width + 16),
    height: Math.min(vp.height - Math.max(0, box.y - 56), box.height + 64),
  };
}
async function slideOrder(page) {
  const list = await invoke(page, 'slide.list', {});
  const arr = Array.isArray(list) ? list : (list.slides ?? list.items ?? []);
  return arr.map((s) => (typeof s === 'string' ? s : s.id));
}
async function clickCard(page, slideId) {
  await ctl(page, `filmstrip.slide.${slideId}`).click();
  await poll(async () => (await state(page)).slideId === slideId, 8000);
}
const following = async (page) => (await state(page)).presence?.following ?? null;
async function openRoster(page, clientId) {
  const more = ctl(page, 'presence.more');
  const takesPointer = await more
    .evaluate(
      (el) =>
        !el.classList.contains('is-empty') &&
        getComputedStyle(el).pointerEvents !== 'none' &&
        getComputedStyle(el).opacity !== '0',
    )
    .catch(() => false);
  if (takesPointer) await more.click({ timeout: 5000 });
  else await ctl(page, `presence.chip.${clientId}`).click();
  const rowEl = page.locator(`[data-control="presence.roster.${clientId}"]`).first();
  await rowEl.waitFor({ timeout: 5000 }).catch(() => undefined);
  const shown = await rowEl.isVisible().catch(() => false);
  return {
    row: rowEl,
    shown,
    item: shown ? await rowEl.getAttribute('data-menu-item') : null,
    text: shown ? ((await rowEl.textContent()) ?? '').trim() : '',
  };
}
const pad = (box, m, vp) => ({
  x: Math.max(0, box.x - m),
  y: Math.max(0, box.y - m),
  width: Math.min(vp.width - Math.max(0, box.x - m), box.width + 2 * m),
  height: Math.min(vp.height - Math.max(0, box.y - m), box.height + 2 * m),
});

const browser = await chromium.launch({ headless: true });
// The editor's chrome does not follow prefers-color-scheme: its appearance is the View row the
// browser keeps under `ts-chrome-appearance` (light when nothing is stored, EditorShell.tsx
// readAppearance), and the home pages read `gt-theme`. Both are stored before every page opens,
// so the dark run draws the dark chrome (the first pictures of 20:08 drew light in both folders).
const mk = async (baseURL) => {
  const ctx = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: APPEARANCE,
    ...(OIDC ? { extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': OIDC } } : {}),
  });
  await ctx.addInitScript((value) => {
    try {
      localStorage.setItem('ts-chrome-appearance', value);
      localStorage.setItem('gt-theme', value);
    } catch {
      // storage refused: the picture records what the page drew
    }
  }, APPEARANCE);
  return ctx;
};
const ctxA = await mk(BASE_A);
const ctxB = await mk(BASE_B);
const A = await ctxA.newPage();
const B = await ctxB.newPage();
let deckId = null;
try {
  // ---- A makes the deck from /new and gives it a title (the first write creates it)
  await A.goto('/new');
  await waitEditor(A);
  const runs0 = await runsOf(A);
  const heading = runs0.find((r) => /heading/.test(r.run))?.run ?? runs0[0]?.run;
  const subtitle = runs0.find((r) => r.run !== heading)?.run ?? null;
  await beginTyping(A, heading, 'People surfaces');
  await A.keyboard.press('Escape');
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  await A.mouse.click(20, 500);
  deckId = (await invoke(A, 'deck.info')).id;
  say('deck.id', deckId);
  say('sync.A', (await state(A)).sync ?? null);

  // ---- the editor link, B joins on its origin
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  const linkB = opened.url
    ? opened.url.replace(/^https?:\/\/[^/]+/, BASE_B)
    : `${BASE_B}/edit/${deckId}`;
  await B.goto(linkB);
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(B);
  await B.mouse.click(20, 500);
  const bId = await poll(async () => await clientIdOf(B), 10_000, 100);
  const aId = await clientIdOf(A);
  say('clients', { a: aId, b: bId });
  say('sync.B', (await state(B)).sync ?? null);
  say('drawnTheme', {
    a: await A.evaluate(() => document.documentElement.dataset.theme ?? null),
    b: await B.evaluate(() => document.documentElement.dataset.theme ?? null),
  });

  // ---- 1. the title row with B's chip in A
  const chip = await poll(
    async () => (await remoteDrawings(A)).chips.find((c) => c.id === `presence.chip.${bId}`),
    10_000,
    100,
  );
  say('chip.inA', chip ?? null);
  const vp = A.viewportSize();
  const band = chip
    ? { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, chip.box[1] + chip.box[3] + 16) }
    : undefined;
  await shot(A, '01-title-row-chips-a', band);

  // ---- 2. A's roster for B
  const roster = await openRoster(A, bId);
  say('roster.forB', { shown: roster.shown, item: roster.item, text: roster.text });
  await shot(A, '02-roster-a');
  await A.keyboard.press('Escape');
  await sleep(200);

  // ---- 3. B's caret and selection outline in A (B keeps its session open while the picture is taken)
  if (subtitle) {
    await beginTyping(B, subtitle, 'Written by B', { replace: false });
    const caret = await poll(
      async () => (await remoteDrawings(A)).carets.find((c) => c.client === bId),
      8000,
      100,
    );
    const outline = (await remoteDrawings(A)).outlines.find((o) => o.client === bId) ?? null;
    say('caret.inA', caret ?? null);
    say('outline.inA', outline);
    await shot(A, '03-caret-outline-a', await stageClip(A));
    await B.keyboard.press('Escape');
    await sleep(200);
  } else say('caret.inA', 'no second run on the slide');

  // ---- 4. B's live pointer in A
  let pointerOn = null;
  try {
    pointerOn = await invoke(B, 'presence.pointer', { on: true });
  } catch (error) {
    pointerOn = { error: String(error).slice(0, 160) };
  }
  say('pointer.on', pointerOn);
  const sheet = await B.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)')
    .first()
    .boundingBox();
  if (sheet) {
    for (let i = 0; i <= 12; i += 1) {
      await B.mouse.move(
        sheet.x + sheet.width * (0.3 + 0.03 * i),
        sheet.y + sheet.height * (0.35 + 0.02 * i),
        { steps: 2 },
      );
      await sleep(60);
    }
  }
  const pointer = await poll(
    async () => (await remoteDrawings(A)).pointers.find((p) => p.client === bId),
    6000,
    100,
  );
  say('pointer.inA', pointer ?? null);
  await shot(A, '04-pointer-a', await stageClip(A));

  // ---- 5. B on slide 2: its chip on A's filmstrip card (a /new deck has one slide, so A adds one first)
  if ((await slideOrder(A)).length < 2) {
    const st = await state(A);
    await invoke(A, 'slide.new', { baseRevision: st.revision }).catch(async () => {
      await A.keyboard.press('Control+m');
    });
    await poll(async () => (await slideOrder(A)).length >= 2, 8000, 200);
    await sleep(500);
  }
  const slides = await slideOrder(A);
  say('slides', slides.length);
  if (slides.length >= 2) {
    await clickCard(B, slides[1]);
    const card = ctl(A, `filmstrip.slide.${slides[1]}`);
    const marks = await poll(
      async () =>
        await card
          .locator('.ts-card-marks')
          .evaluate((el) => Number(el.getAttribute('data-count') ?? '0') > 0)
          .catch(() => false),
      8000,
      100,
    );
    say('card.chip', { slide: slides[1], drawn: Boolean(marks) });
    const cardBox = await card.boundingBox();
    await shot(A, '05-card-chip-a', cardBox ? pad(cardBox, 16, vp) : undefined);

    // ---- 6. A follows B: the plate, then A's own click ends it
    const r = await openRoster(A, bId);
    const offered = r.item === 'title.presence.follow' || /^Follow/.test(r.text);
    if (r.shown && offered) await r.row.click();
    else await A.keyboard.press('Escape');
    const took = offered
      ? Boolean(await poll(async () => (await following(A)) === bId, 4000))
      : false;
    say('follow', { offered, took, stageSlide: (await state(A)).slideId });
    if (took) {
      await ctl(A, 'presence.following')
        .waitFor({ timeout: 4000 })
        .catch(() => undefined);
      await sleep(300);
    }
    await shot(A, '06-following-plate-a');
    await clickCard(A, slides[0]);
    say('follow.endedByClick', (await following(A)) === null);
  }

  // ---- 7. the Sign in dialog in A
  await A.keyboard.press('Escape');
  const own = ctl(A, 'title.account');
  if ((await own.count()) > 0) {
    await own.click();
    await A.locator('#ts-menu-account').waitFor({ timeout: 8000 });
    const signIn = A.locator('#ts-menu-account [data-control="account.signIn"]').first();
    if ((await signIn.count()) > 0) {
      await signIn.click();
      const card = A.locator('[data-control="dialog.signIn"]');
      await card.waitFor({ timeout: 10_000 });
      await sleep(300);
      const box = await card.boundingBox();
      const methods = await card.evaluate((el) =>
        [...el.querySelectorAll('.ts-sign-in-methods [data-control]')].map((e) =>
          e.getAttribute('data-control'),
        ),
      );
      say('signIn.dialog', {
        methods,
        emailField: (await A.locator('[data-control="dialog.signIn.email"]').count()) > 0,
      });
      await shot(A, '07-sign-in-dialog-a', box ? pad(box, 24, vp) : undefined);
      await A.keyboard.press('Escape');
    } else {
      say('signIn.dialog', 'no Sign in row (no identity runtime on this deployment)');
      await shot(A, '07-account-menu-a');
      await A.keyboard.press('Escape');
    }
  } else say('signIn.dialog', 'no title.account control');
  say('transport.A', (await state(A)).sync ?? null);
} catch (error) {
  say('error', { message: String(error?.stack ?? error).slice(0, 2000) });
  await A.screenshot({ path: join(OUT, 'A-error.png') }).catch(() => {});
  await B.screenshot({ path: join(OUT, 'B-error.png') }).catch(() => {});
} finally {
  await ctxB.close().catch(() => {});
  if (deckId) {
    try {
      const info = await invoke(A, 'deck.info');
      await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision });
      const trashed = await invoke(A, 'deck.info').catch(() => info);
      await invoke(A, 'deck.remove', { id: deckId, confirm: true, baseRevision: trashed.revision });
      const gone = await fetch(`${BASE_A}/edit/${deckId}`, {
        redirect: 'manual',
        headers: OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {},
      });
      say('teardown', { id: deckId, editStatus: gone.status });
    } catch (error) {
      say('teardown.error', String(error).slice(0, 300));
    }
  }
  facts.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  await browser.close();
}
