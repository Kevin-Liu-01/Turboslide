// Does a name set by a link editor reach the owner's roster, and by which path? A the owner
// (named through the API), C by the editor link names itself through the API's account.setName,
// E by the same link names itself through the Share dialog's band. A's presence entries and
// roster chips are read for each, and the state's account shape is printed once.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const {
  chromium,
} = require('/Users/kevinliu/repos/Turboslide-people/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const BASE = 'http://localhost:4462';
const say = (k, v) => console.log(`${k}: ${JSON.stringify(v)}`);
const load = () =>
  execSync('uptime')
    .toString()
    .replace(/.*load averages?: /, '')
    .trim();
const ctl = (page, id) => page.locator(`[data-control="${id}"]`).first();
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const invoke = (page, a, i) =>
  page.evaluate(([x, y]) => window.turboslide.studio.invoke(x, y), [a, i]);
async function waitEditor(page) {
  await page.waitForFunction(() => Boolean(window.turboslide && window.turboslide.studio), null, {
    timeout: 40_000,
  });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 40_000 });
}
async function poll(fn, timeout = 10_000, every = 250) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, every));
  }
  return last;
}
const rosterOf = (page) =>
  page.evaluate(() => {
    const s = window.turboslide.studio.describe().state;
    return {
      others: (s.presence?.others ?? []).map((p) => ({
        label: p.label ?? null,
        name: p.name ?? null,
      })),
      chips: [...document.querySelectorAll('[data-control^="presence.chip."]')].map((el) =>
        el.getAttribute('aria-label'),
      ),
    };
  });
const browser = await chromium.launch({ headless: true });
const mk = () => browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const ctxA = await mk();
const ctxC = await mk();
const ctxE = await mk();
for (const ctx of [ctxA, ctxC, ctxE]) await ctx.routeWebSocket('**', () => {});
const A = await ctxA.newPage();
const C = await ctxC.newPage();
const E = await ctxE.newPage();
let deckId = null;
try {
  await A.goto('/new');
  await waitEditor(A);
  deckId = (await invoke(A, 'deck.info')).id;
  say('deck.id', deckId);
  const s0 = await state(A);
  say('state.account.keys', Object.keys(s0.account ?? {}));
  say('state.account', s0.account ?? null);
  // the deck of /new is a draft until its first write: one edit saves it
  const run = await A.evaluate(
    () =>
      [
        ...document.querySelectorAll(
          '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]',
        ),
      ]
        .map((el) => el.getAttribute('data-run') ?? '')
        .find((r) => /heading/.test(r)) ?? '',
  );
  const el = A.locator(
    `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`,
  ).first();
  await el.dblclick();
  await A.waitForTimeout(200);
  await A.keyboard.press('Meta+a');
  await A.keyboard.type('Name reach drive', { delay: 30 });
  await A.keyboard.press('Escape');
  await poll(async () => (await state(A)).revision >= 1, 30_000);
  if (
    await ctl(A, 'dialog.namePrompt')
      .isVisible()
      .catch(() => false)
  )
    await ctl(A, 'dialog.namePrompt.close')
      .click()
      .catch(() => null);
  await invoke(A, 'account.setName', { name: 'Ada Lovelace' });
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  const link = opened.url ?? `/edit/${deckId}`;
  // C by the API
  await C.goto(link);
  await C.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(C);
  await poll(async () => ((await state(A)).presence?.others?.length ?? 0) >= 1, 20_000);
  say('A.roster.beforeC', await rosterOf(A));
  const t0 = Date.now();
  say(
    'C.setName.api',
    await invoke(C, 'account.setName', { name: 'Copper Lane' }).then(
      (r) => ({ name: r?.name ?? null, label: r?.label ?? null }),
      (e) => ({ error: String(e) }),
    ),
  );
  const seenC = await poll(
    async () =>
      (await rosterOf(A)).others.some((p) => p.name === 'Copper Lane' || p.label === 'Copper Lane'),
    10_000,
  );
  say('C.name.reachesA.api', { seen: Boolean(seenC), ms: Date.now() - t0, load: load() });
  say('A.roster.afterC', await rosterOf(A));
  say('C.state.account', (await state(C)).account ?? null);
  // E by the band
  await E.goto(link);
  await E.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(E);
  await poll(async () => ((await state(A)).presence?.others?.length ?? 0) >= 2, 20_000);
  await ctl(E, 'share.open').click();
  await ctl(E, 'dialog.share').waitFor({ timeout: 5000 });
  await ctl(E, 'dialog.namePrompt.name').click();
  await E.keyboard.press('Meta+a');
  await E.keyboard.type('Iron Gate', { delay: 30 });
  const t1 = Date.now();
  await E.keyboard.press('Enter');
  const gone = await ctl(E, 'dialog.namePrompt')
    .waitFor({ state: 'detached', timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  say('E.band.enter', { gone, ms: Date.now() - t1 });
  const seenE = await poll(
    async () =>
      (await rosterOf(A)).others.some((p) => p.name === 'Iron Gate' || p.label === 'Iron Gate'),
    10_000,
  );
  say('E.name.reachesA.band', { seen: Boolean(seenE), ms: Date.now() - t1, load: load() });
  say('A.roster.afterE', await rosterOf(A));
  say('E.state.account', (await state(E)).account ?? null);
  await E.keyboard.press('Escape');
} catch (e) {
  say('error', e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
  process.exitCode = 1;
} finally {
  if (deckId !== null) {
    await invoke(A, 'deck.trash', { id: deckId }).catch(() => null);
    await invoke(A, 'deck.remove', { id: deckId }).catch(() => null);
    say('deck.removed', deckId);
  }
  await browser.close();
}
