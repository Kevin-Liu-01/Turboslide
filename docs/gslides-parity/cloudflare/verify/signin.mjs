// The verifier's hand drive of the Sign in surfaces (docs/REALTIME.md 4.1, 4.3; docs/CLOUDFLARE.md
// 4.2, 4.3; the realtime round's pass 1): on a server with mail capture (`--a`) and one with
// TURBOSLIDE_MAIL=off (`--b`), an anonymous person opens the account menu and the Sign in dialog, in
// one appearance and one width; the methods, the email field and the box are recorded with a
// picture; then `/edit/<deck>?error=account_not_linked` is opened and the snackbar's sentence and the
// address are read. The deck is made from /new on `--a` and trashed and removed by its id.
// Pass 4 adds three sections (`--account`, on by default; `--no-account` drops them): Continue with
// Google on each server with the fake client pair, every request to accounts.google.com aborted and
// recorded, read up to the provider redirect (the parameters the button's navigation carries); a
// sign in by email on `--a` with the captured code (read through apps/studio/e2e/identity-seed.mts
// `mail` in this process's environment: `TURBOSLIDE_AUTH_DB` for the sqlite mode, or
// `TURBOSLIDE_ACCOUNTS=d1` with the room host and bearer for the d1 mode, which a wrapper sets and
// nothing here prints), the badge on the account head after it; then the account menu's Sign out,
// a reload, and the account head, the menu rows and /api/auth/get-session read again.
//   node docs/gslides-parity/cloudflare/verify/signin.mjs --a http://localhost:4479 --b http://localhost:4489 \
//     --out <dir> [--width 1440] [--appearance light|dark] [--label sqlite] [--no-account]
import { execFileSync } from 'node:child_process';
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
const ACCOUNT_SECTIONS = !argv.includes('--no-account');
const ROOT = resolve(new URL('../../../../', import.meta.url).pathname);
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

/** Opens the account menu and returns its rows and the head's words and badge. */
async function accountHead(page) {
  await page.keyboard.press('Escape');
  const own = ctl(page, 'title.account');
  if ((await own.count()) === 0) return { account: false };
  await own.click();
  await page.locator('#ts-menu-account').waitFor({ timeout: 8000 });
  await sleep(250);
  const head = await page.locator('#ts-menu-account').evaluate((menu) => {
    const h = menu.querySelector('.ts-account-head');
    const badge = h?.querySelector('.ts-trust-mark, [data-trust-mark], [data-badge="check-badge"]');
    return {
      words: (h?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
      badge: badge
        ? {
            label: badge.getAttribute('aria-label') ?? badge.getAttribute('data-trust-mark'),
            size: Math.round(badge.getBoundingClientRect().width),
          }
        : null,
      rows: [...menu.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')),
    };
  });
  return { account: true, ...head };
}
async function openSignIn(page) {
  await page.keyboard.press('Escape');
  await ctl(page, 'title.account').click();
  await page.locator('#ts-menu-account').waitFor({ timeout: 8000 });
  await page.locator('#ts-menu-account [data-control="account.signIn"]').first().click();
  await page.locator('[data-control="dialog.signIn"]').waitFor({ timeout: 10_000 });
  await sleep(300);
}
/** Continue with Google up to the provider redirect: the request to accounts.google.com is aborted and read. */
async function googleLeaves(page, deckPath, label) {
  const seen = [];
  const pattern = /^https:\/\/accounts\.google\.com\//;
  await page.context().route(pattern, (route) => {
    seen.push(route.request().url());
    return route.abort();
  });
  try {
    await page.goto(deckPath);
    await waitEditor(page);
    await openSignIn(page);
    const social = page
      .waitForResponse((r) => /\/api\/auth\/sign-in\/social/.test(r.url()), { timeout: 20_000 })
      .catch(() => null);
    const t0 = Date.now();
    await ctl(page, 'dialog.signIn.google').click();
    const answer = await social;
    const until = Date.now() + 20_000;
    while (seen.length === 0 && Date.now() < until) await sleep(50);
    const url = seen[0] ? new URL(seen[0]) : null;
    const q = (k) => url?.searchParams.get(k) ?? null;
    const reading = {
      socialStatus: answer?.status() ?? null,
      leftAfterMs: seen.length > 0 ? Date.now() - t0 : null,
      host: url?.host ?? null,
      path: url?.pathname ?? null,
      redirectUri: q('redirect_uri'),
      scope: q('scope'),
      prompt: q('prompt'),
      responseType: q('response_type'),
      codeChallenge: q('code_challenge') !== null,
      codeChallengeMethod: q('code_challenge_method'),
      accessType: q('access_type'),
      state: q('state') !== null,
      clientIdPrefix: (q('client_id') ?? '').split('-')[0] || null,
    };
    await page.screenshot({ path: join(OUT, `${label}-google-left.png`) }).catch(() => {});
    return reading;
  } finally {
    await page.context().unroute(pattern);
  }
}
/** A sign in by email with the captured code, then the account head; the code is read and never printed. */
async function emailSignIn(page, deckPath, email) {
  await page.goto(deckPath);
  await waitEditor(page);
  const before = await accountHead(page);
  await page.keyboard.press('Escape');
  await openSignIn(page);
  await ctl(page, 'dialog.signIn.email').fill(email);
  await ctl(page, 'dialog.signIn.continue').click();
  await ctl(page, 'dialog.signIn.code').waitFor({ timeout: 20_000 });
  const out = execFileSync(
    'node',
    ['apps/studio/e2e/identity-seed.mts', 'mail', process.env.TURBOSLIDE_AUTH_DB ?? '-', email],
    { cwd: ROOT, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const mail = JSON.parse(out.trim().split('\n').pop() ?? '{}');
  const codeShape = /^\d{6}$/.test(mail.code ?? '');
  await ctl(page, 'dialog.signIn.code').fill(mail.code ?? '');
  const t0 = Date.now();
  const reloaded = page.waitForEvent('load', { timeout: 30_000 }).catch(() => null);
  await ctl(page, 'dialog.signIn.verify').click();
  await reloaded;
  await waitEditor(page);
  const reloadMs = Date.now() - t0;
  const after = await accountHead(page);
  await page.screenshot({ path: join(OUT, 'a-signed-in-account-menu.png') });
  await page.keyboard.press('Escape');
  const session = await page.evaluate(() =>
    fetch('/api/auth/get-session', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => ({ user: Boolean(j?.user), email: j?.user?.email ?? null }))
      .catch((e) => ({ error: String(e) })),
  );
  return { before, codeShape, reloadMs, after, session };
}
/** The account menu's Sign out, the reload, and what the browser reads after it. */
async function signOut(page) {
  await page.keyboard.press('Escape');
  await ctl(page, 'title.account').click();
  await page.locator('#ts-menu-account').waitFor({ timeout: 8000 });
  const row = page.locator('#ts-menu-account [data-control="account.signOut"]').first();
  if ((await row.count()) === 0) return { signOutRow: false };
  const calls = [];
  const listen = (r) => {
    if (/\/api\/auth\/sign-out|account\.signOut|_serverFn|\/api\/actions\//.test(r.url()))
      calls.push({ url: r.url().replace(/\?.*$/, '').slice(-80), status: r.status() });
  };
  page.on('response', listen);
  const reload = page.waitForEvent('load', { timeout: 15_000 }).catch(() => null);
  const t0 = Date.now();
  await row.click();
  const reloadedAt = await reload;
  page.off('response', listen);
  const reloadedMs = reloadedAt === null ? null : Date.now() - t0;
  await sleep(1500);
  if (reloadedAt === null) {
    await page.reload();
  }
  await waitEditor(page);
  const head = await accountHead(page);
  await page.screenshot({ path: join(OUT, 'a-after-sign-out-account-menu.png') });
  await page.keyboard.press('Escape');
  const session = await page.evaluate(() =>
    fetch('/api/auth/get-session', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => ({ user: Boolean(j?.user), email: j?.user?.email ?? null }))
      .catch((e) => ({ error: String(e) })),
  );
  const identity = await page.evaluate(() => {
    const d = window.turboslide?.studio?.describe?.();
    const me = d?.identity ?? d?.state?.identity ?? null;
    return me ? { kind: me.kind ?? null, trust: me.trust ?? null } : null;
  });
  return {
    signOutRow: true,
    reloadedByItself: reloadedAt !== null,
    reloadedMs,
    calls,
    head,
    session,
    identity,
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
  if (ACCOUNT_SECTIONS) {
    try {
      say('google.capture', await googleLeaves(A, `/edit/${deckId}`, 'a-capture'));
    } catch (error) {
      say('google.capture.error', String(error?.stack ?? error).slice(0, 600));
    }
    try {
      say('google.mailOff', await googleLeaves(B, '/new', 'b-mail-off'));
    } catch (error) {
      say('google.mailOff.error', String(error?.stack ?? error).slice(0, 600));
    }
    const email = `verifier4-${Date.now().toString(36)}@example.test`;
    try {
      say('email.signIn', await emailSignIn(A, `/edit/${deckId}`, email));
      say('signOut', await signOut(A));
    } catch (error) {
      say('account.error', String(error?.stack ?? error).slice(0, 900));
      await A.screenshot({ path: join(OUT, 'A-account-error.png') }).catch(() => {});
    }
  }
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
