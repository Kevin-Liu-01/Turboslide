// The verifier's hand drive of the Sign in surfaces (docs/REALTIME.md 4.1, 4.3; docs/CLOUDFLARE.md
// 4.2, 4.3; the realtime round's pass 1): on a server with mail capture (`--a`) and one with
// TURBOSLIDE_MAIL=off (`--b`), an anonymous person opens the account menu and the Sign in dialog, in
// one appearance and one width; the methods, the email field and the box are recorded with a
// picture; then `/edit/<deck>?error=account_not_linked` is opened and the snackbar's sentence and the
// address are read. The deck is made from /new on `--a` and trashed and removed by its id.
//   node docs/gslides-parity/cloudflare/verify/signin.mjs --a http://localhost:4479 --b http://localhost:4489 \
//     --out <dir> [--width 1440] [--appearance light|dark] [--label sqlite]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const BASE_A = arg('a', 'http://localhost:4479');
const BASE_B = arg('b', 'http://localhost:4489');
const WIDTH = Number(arg('width', '1440'));
const APPEARANCE = arg('appearance', 'light') === 'dark' ? 'dark' : 'light';
const LABEL = arg('label', 'local');
const OUT = resolve(arg('out', `signin-${LABEL}-${WIDTH}-${APPEARANCE}`));
mkdirSync(OUT, { recursive: true });
const facts = {
  startedAt: new Date().toISOString(),
  baseA: BASE_A,
  baseB: BASE_B,
  width: WIDTH,
  appearance: APPEARANCE,
  label: LABEL,
};
const say = (k, v) => {
  facts[k] = v;
  console.log(`${k}: ${JSON.stringify(v)?.slice(0, 500)}`);
};
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const ctl = (page, id) => page.locator(`[data-control="${id}"]`).first();
const invoke = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i ?? {}), [action, input]);
async function waitEditor(page) {
  await page.waitForFunction(() => Boolean(window.turboslide && window.turboslide.studio), null, {
    timeout: 90_000,
  });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 60_000 });
}
const browser = await chromium.launch({ headless: true });
const mk = async (baseURL) => {
  const ctx = await browser.newContext({
    baseURL,
    viewport: { width: WIDTH, height: WIDTH >= 1440 ? 900 : 800 },
    deviceScaleFactor: 1,
    colorScheme: APPEARANCE,
  });
  await ctx.addInitScript((value) => {
    try {
      localStorage.setItem('ts-chrome-appearance', value);
      localStorage.setItem('gt-theme', value);
    } catch {}
  }, APPEARANCE);
  return ctx;
};
async function dialog(page, name) {
  await page.keyboard.press('Escape');
  const own = ctl(page, 'title.account');
  if ((await own.count()) === 0) return { account: false };
  await own.click();
  await page.locator('#ts-menu-account').waitFor({ timeout: 8000 });
  const rows = await page
    .locator('#ts-menu-account [data-control]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-control')));
  const signIn = page.locator('#ts-menu-account [data-control="account.signIn"]').first();
  if ((await signIn.count()) === 0) {
    await page.screenshot({ path: join(OUT, `${name}-account-menu.png`) });
    await page.keyboard.press('Escape');
    return { account: true, rows, signIn: false };
  }
  await signIn.click();
  const card = page.locator('[data-control="dialog.signIn"]');
  await card.waitFor({ timeout: 10_000 });
  await sleep(450);
  const box = await card.boundingBox();
  const methods = await card.evaluate((el) =>
    [...el.querySelectorAll('[data-control]')].map((e) => ({
      id: e.getAttribute('data-control'),
      text: (e.textContent ?? '').trim().slice(0, 40),
      disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true',
    })),
  );
  const text = ((await card.textContent()) ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
  const vp = page.viewportSize();
  await page.screenshot({
    path: join(OUT, `${name}-sign-in-dialog.png`),
    clip: box
      ? {
          x: Math.max(0, box.x - 24),
          y: Math.max(0, box.y - 24),
          width: Math.min(vp.width, box.width + 48),
          height: Math.min(vp.height, box.height + 48),
        }
      : undefined,
  });
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
  await page.keyboard.press('Escape');
  return {
    account: true,
    rows,
    signIn: true,
    box: box && [Math.round(box.width), Math.round(box.height)],
    methods,
    text,
    emailField: methods.some((m) => m.id === 'dialog.signIn.email'),
    theme,
  };
}
const ctxA = await mk(BASE_A);
const ctxB = await mk(BASE_B);
const A = await ctxA.newPage();
const B = await ctxB.newPage();
let deckId = null;
try {
  await A.goto('/new');
  await waitEditor(A);
  const run = await A.evaluate(() =>
    document
      .querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]')
      ?.getAttribute('data-run'),
  );
  await A.locator(`.ts-stagewrap.ts-editor [data-run="${run}"]`).first().dblclick();
  await sleep(150);
  await A.keyboard.press('Meta+a');
  await A.keyboard.type('Sign in drive', { delay: 60 });
  await A.keyboard.press('Escape');
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  deckId = (await invoke(A, 'deck.info')).id;
  say('deck.id', deckId);
  say('dialog.capture', await dialog(A, 'a-capture'));
  // the mail off server: the same deck exists only in the shared overlay; a fresh /new there
  await B.goto('/new');
  await waitEditor(B);
  say('dialog.mailOff', await dialog(B, 'b-mail-off'));
  // the error sentence
  await A.goto(`/edit/${deckId}?error=account_not_linked`);
  await waitEditor(A);
  const sentence = await (async () => {
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      const t = (
        (await ctl(A, 'snackbar')
          .textContent()
          .catch(() => '')) ?? ''
      ).trim();
      if (t) return t;
      await sleep(50);
    }
    return null;
  })();
  await A.screenshot({ path: join(OUT, 'a-error-sentence.png') });
  say('errorSentence', { sentence, url: A.url(), paramGone: !/error=/.test(A.url()) });
} catch (error) {
  say('error', String(error?.stack ?? error).slice(0, 1500));
  await A.screenshot({ path: join(OUT, 'A-error.png') }).catch(() => {});
} finally {
  if (deckId) {
    try {
      const info = await invoke(A, 'deck.info');
      await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision });
      const trashed = await invoke(A, 'deck.info').catch(() => info);
      await invoke(A, 'deck.remove', { id: deckId, confirm: true, baseRevision: trashed.revision });
      const gone = await fetch(`${BASE_A}/edit/${deckId}`, { redirect: 'manual' });
      say('teardown', { id: deckId, editStatus: gone.status });
    } catch (error) {
      say('teardown.error', String(error).slice(0, 300));
    }
  }
  facts.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
  await browser.close();
}
