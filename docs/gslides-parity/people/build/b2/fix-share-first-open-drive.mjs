// The B2 fix round drive (VERIFICATION.md People round pass 1, finding 4): a link editor's first
// Share. Four anonymous contexts on one scratch deck on the B2 dev server (4462, the memory tier,
// a tmp store): A the owner, named through the first edit's prompt; B by the editor link with the
// first edit's prompt closed so it stays a label; C and D by the same link, fresh. Read: B's first
// share.open draws dialog.share within 5 s with the name ask band inside it, Skip leaves the
// dialog standing, the second open asks nothing; A's open asks nothing; C types a name into the
// band and Enter keeps it (the roster in A reads it within 5 s; the dialog stays); D closes the
// dialog with the band up and the second open asks nothing. Every timing row records the load.
//   node <scratchpad>/people/fix/share-first-open-drive.mjs [--base http://localhost:4462]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const {
  chromium,
} = require('/Users/kevinliu/repos/Turboslide-people/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const BASE = argOf('--base', 'http://localhost:4462');
const OUT = argOf(
  '--out',
  '/Users/kevinliu/repos/Turboslide-people/docs/gslides-parity/people/build/b2',
);
mkdirSync(OUT, { recursive: true });
const TYPE_DELAY = 40;
const facts = {};
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};
const load = () =>
  execSync('uptime')
    .toString()
    .replace(/.*load averages?: /, '')
    .trim();

const ctl = (page, id) => page.locator(`[data-control="${id}"]`).first();
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const invoke = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);

async function waitEditor(page, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    const booted = await page
      .waitForFunction(() => Boolean(window.turboslide && window.turboslide.studio), null, {
        timeout: 40_000,
      })
      .then(
        () => true,
        () => false,
      );
    const settledNow =
      booted &&
      (await page
        .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
        .first()
        .waitFor({ timeout: 40_000 })
        .then(
          () => true,
          () => false,
        ));
    if (settledNow) return;
    if (attempt >= attempts) throw new Error(`the editor did not boot in ${attempts} attempts`);
    say(`boot.retry.${attempt}`, page.url());
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => null);
  }
}
async function settled(page, timeout = 20_000) {
  const until = Date.now() + timeout;
  let s = await state(page);
  while (Date.now() < until) {
    s = await state(page);
    const words = await ctl(page, 'deck.saveState')
      .textContent()
      .catch(() => null);
    if (
      (s.sync?.pending ?? s.pending ?? 0) === 0 &&
      (words === null || /All changes saved|Not saved yet/.test(words))
    )
      return s;
    await page.waitForTimeout(150);
  }
  return s;
}
async function headingRun(page) {
  const runs = await page.evaluate(() =>
    [
      ...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]'),
    ].map((el) => el.getAttribute('data-run') ?? ''),
  );
  return runs.find((r) => /heading/.test(r)) ?? runs[0] ?? '';
}
async function typeInto(page, run, text) {
  const el = page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
    .first();
  await el.dblclick();
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(text, { delay: TYPE_DELAY });
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
}
async function poll(fn, timeout = 30_000, every = 300) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, every));
  }
  return last;
}
async function setTheme(page, theme) {
  await page.evaluate((t) => {
    try {
      localStorage.setItem('gt-theme', t);
    } catch {}
    document.documentElement.setAttribute('data-theme', t);
    window.postMessage({ type: 'gt-theme', theme: t }, '*');
  }, theme);
  await page.waitForTimeout(400);
}
async function shotAround(page, locator, name, pad = 12) {
  await page.waitForTimeout(400);
  const box = await locator.boundingBox();
  const vp = page.viewportSize();
  const clip = box
    ? {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(vp.width - Math.max(0, box.x - pad), box.width + pad * 2),
        height: Math.min(vp.height - Math.max(0, box.y - pad), box.height + pad * 2),
      }
    : undefined;
  const path = join(OUT, `fix-${name}.png`);
  await page.screenshot({ path, ...(clip ? { clip } : {}) });
  return path;
}
/** What the Share dialog holds: the band and its parts, the rows, the focus, the dialogs on the page. */
const dialogFacts = (page) =>
  page.evaluate(() => {
    const d = document.querySelector('[data-control="dialog.share"]');
    if (!d) return null;
    const ask = d.querySelector('[data-control="dialog.namePrompt"]');
    const rect = (el) =>
      el
        ? (({ x, y, width, height }) => ({ x, y, w: width, h: height }))(el.getBoundingClientRect())
        : null;
    return {
      title: d.querySelector('.ts-dialog-title')?.textContent ?? null,
      dialogsOnPage: [...document.querySelectorAll('[role="dialog"]')].map((el) =>
        el.getAttribute('data-control'),
      ),
      scrims: document.querySelectorAll('.ts-dialog-scrim').length,
      ask: ask
        ? {
            words: ask.querySelector('.ts-share-name-ask-title')?.textContent ?? null,
            field: ask.querySelector('[data-control="dialog.namePrompt.name"]')?.value ?? null,
            skip: Boolean(ask.querySelector('[data-control="dialog.namePrompt.skip"]')),
            continueDisabled:
              ask.querySelector('[data-control="dialog.namePrompt.continue"]')?.disabled ?? null,
            signIn: Boolean(ask.querySelector('[data-control="dialog.namePrompt.signIn"]')),
            error:
              ask.querySelector('[data-control="dialog.namePrompt.error"]')?.textContent ?? null,
            firstInBody: d.querySelector('.ts-dialog-body')?.firstElementChild === ask,
            box: rect(ask),
            border: getComputedStyle(ask).borderTopColor,
          }
        : null,
      focus:
        document.activeElement?.getAttribute('data-control') ??
        document.activeElement?.tagName ??
        null,
      general: Boolean(d.querySelector('[data-control="dialog.share.general"]')),
      address: d.querySelector('[data-control="dialog.share.address"]')?.value ?? null,
      rows: [...d.querySelectorAll('.ts-share-row')].map((row) => ({
        control: row.getAttribute('data-control'),
        name: row.querySelector('.ts-share-row-name')?.textContent ?? null,
        trust: row.querySelector('.ts-share-row-trust')?.textContent ?? null,
        chip: row.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
      })),
      box: rect(d),
    };
  });
/** One share.open with the clock on it: the dialog's arrival in ms against the 5 s bound. */
async function openShare(page, key) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const t0 = Date.now();
  await ctl(page, 'share.open').click({ timeout: 8000 });
  const shown = await ctl(page, 'dialog.share')
    .waitFor({ timeout: 5000 })
    .then(
      () => true,
      () => false,
    );
  const ms = Date.now() - t0;
  say(`${key}.open`, { shown, ms, bound: 5000, ok: shown && ms <= 5000, load: load() });
  await page.waitForTimeout(500);
  return shown;
}

const browser = await chromium.launch({ headless: true });
const mk = () =>
  browser.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
const ctxA = await mk();
const ctxB = await mk();
const ctxC = await mk();
const ctxD = await mk();
for (const ctx of [ctxA, ctxB, ctxC, ctxD]) await ctx.routeWebSocket('**', () => {});
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const C = await ctxC.newPage();
const D = await ctxD.newPage();
const consoleErrors = { A: [], B: [], C: [], D: [] };
for (const [page, tag] of [
  [A, 'A'],
  [B, 'B'],
  [C, 'C'],
  [D, 'D'],
]) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors[tag].push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => consoleErrors[tag].push(`pageerror: ${String(e).slice(0, 200)}`));
}
let deckId = null;
say('load.start', load());

try {
  await A.goto('/new');
  await waitEditor(A);
  deckId = (await invoke(A, 'deck.info')).id;
  say('deck.id', deckId);

  // A names itself through the first edit's prompt
  await typeInto(A, await headingRun(A), 'People fix round, the first Share by link');
  const prompted = await ctl(A, 'dialog.namePrompt')
    .waitFor({ timeout: 6000 })
    .then(
      () => true,
      () => false,
    );
  say('namePrompt.A.firstEdit', prompted);
  if (prompted) {
    await ctl(A, 'dialog.namePrompt.name').fill('');
    await ctl(A, 'dialog.namePrompt.name').type('Ada Lovelace', { delay: TYPE_DELAY });
    await ctl(A, 'dialog.namePrompt.continue').click();
    await A.waitForTimeout(800);
  } else {
    say(
      'setName.A',
      await invoke(A, 'account.setName', { name: 'Ada Lovelace' }).then(
        (r) => r,
        (e) => ({ error: String(e) }),
      ),
    );
  }
  await settled(A);

  // the deck opens to anyone with the link as an editor
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  const linkUrl = opened.url ?? `/edit/${deckId}`;
  say('link', linkUrl.replace(BASE, ''));

  // B follows the link and makes one edit; the first edit's prompt is closed by its X, so B stays a label
  await B.goto(linkUrl);
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(B);
  await poll(async () => ((await state(B)).presence?.others?.length ?? 0) >= 1, 40_000);
  await typeInto(B, await headingRun(B), 'People fix round, the first Share by link, B wrote');
  const promptedB = await ctl(B, 'dialog.namePrompt')
    .waitFor({ timeout: 6000 })
    .then(
      () => true,
      () => false,
    );
  say('namePrompt.B.firstEdit', promptedB);
  if (promptedB) {
    await ctl(B, 'dialog.namePrompt.close')
      .click({ timeout: 4000 })
      .catch(() => null);
    await B.waitForTimeout(400);
  }
  await settled(B);
  say(
    'B.principal',
    await B.evaluate(() => {
      const s = window.turboslide.studio.describe().state;
      return {
        label: s.account?.label ?? null,
        markLabel: s.account?.mark?.label ?? null,
        asked: localStorage.getItem('ts-share-name-asked'),
      };
    }),
  );

  // ---- B's first Share: the dialog at once, the ask band inside it, in both appearances
  const shownB = await openShare(B, 'B.first');
  if (shownB) {
    say('B.first.dialog', await dialogFacts(B));
    say('shot.B.first.light', await shotAround(B, ctl(B, 'dialog.share'), 'share-ask-B-light', 12));
    await setTheme(B, 'dark');
    say('shot.B.first.dark', await shotAround(B, ctl(B, 'dialog.share'), 'share-ask-B-dark', 12));
    say(
      'B.first.dialog.dark.border',
      await B.evaluate(
        () =>
          getComputedStyle(document.querySelector('[data-control="dialog.namePrompt"]'))
            .borderTopColor,
      ),
    );
    await setTheme(B, 'light');
    // Skip: the band leaves, the dialog stands, the focus goes to Done
    const t1 = Date.now();
    await ctl(B, 'dialog.namePrompt.skip').click({ timeout: 4000 });
    const gone = await ctl(B, 'dialog.namePrompt')
      .waitFor({ state: 'detached', timeout: 2000 })
      .then(
        () => true,
        () => false,
      );
    say('B.first.skip', { gone, ms: Date.now() - t1 });
    await B.waitForTimeout(300);
    say('B.first.afterSkip', await dialogFacts(B));
    say('B.first.asked', await B.evaluate(() => localStorage.getItem('ts-share-name-asked')));
    say(
      'shot.B.afterSkip.light',
      await shotAround(B, ctl(B, 'dialog.share'), 'share-after-skip-B-light', 12),
    );
    // Escape closes the dialog
    await B.keyboard.press('Escape');
    const closed = await ctl(B, 'dialog.share')
      .waitFor({ state: 'detached', timeout: 2000 })
      .then(
        () => true,
        () => false,
      );
    say('B.first.escapeCloses', closed);
  }
  // ---- B's second Share: no band
  const shownB2 = await openShare(B, 'B.second');
  if (shownB2) {
    const f = await dialogFacts(B);
    say('B.second.dialog', { ask: f.ask, rows: f.rows, focus: f.focus });
    await B.keyboard.press('Escape');
    await B.waitForTimeout(300);
  }

  // ---- A, the owner with a name: no band, the own row reads You
  const shownA = await openShare(A, 'A.owner');
  if (shownA) {
    const f = await dialogFacts(A);
    say('A.owner.dialog', {
      ask: f.ask,
      rows: f.rows,
      focus: f.focus,
      dialogsOnPage: f.dialogsOnPage,
    });
    await A.keyboard.press('Escape');
    await A.waitForTimeout(300);
  }

  // ---- C, fresh by the link: types a name into the band and Enter keeps it; the roster in A reads it
  await C.goto(linkUrl);
  await C.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(C);
  const shownC = await openShare(C, 'C.first');
  if (shownC) {
    const before = await dialogFacts(C);
    say('C.first.dialog', { ask: before.ask, focus: before.focus, rows: before.rows });
    await ctl(C, 'dialog.namePrompt.name').click();
    await C.keyboard.press('Meta+a');
    await C.keyboard.type('Copper Lane', { delay: TYPE_DELAY });
    const t2 = Date.now();
    await C.keyboard.press('Enter');
    const gone = await ctl(C, 'dialog.namePrompt')
      .waitFor({ state: 'detached', timeout: 5000 })
      .then(
        () => true,
        () => false,
      );
    say('C.first.enter', {
      bandGone: gone,
      ms: Date.now() - t2,
      dialogStill: await ctl(C, 'dialog.share')
        .isVisible()
        .catch(() => false),
    });
    await C.waitForTimeout(300);
    const after = await dialogFacts(C);
    say('C.first.afterEnter', {
      ask: after.ask,
      focus: after.focus,
      rows: after.rows,
      dialogsOnPage: after.dialogsOnPage,
    });
    say(
      'C.account',
      await C.evaluate(() => {
        const a = window.turboslide.studio.describe().state.account;
        return { label: a?.label ?? null, markLabel: a?.mark?.label ?? null };
      }),
    );
    const t3 = Date.now();
    const seen = await poll(
      async () =>
        (await state(A)).presence?.others?.some(
          (p) => p.name === 'Copper Lane' || p.label === 'Copper Lane',
        ),
      10_000,
    );
    say('C.name.reachesA', { seen: Boolean(seen), ms: Date.now() - t3, bound: 5000, load: load() });
    say(
      'shot.C.afterEnter.light',
      await shotAround(C, ctl(C, 'dialog.share'), 'share-after-name-C-light', 12),
    );
    await C.keyboard.press('Escape');
    await C.waitForTimeout(300);
  }

  // ---- D, fresh by the link: closes the dialog with the band up; the second open asks nothing
  await D.goto(linkUrl);
  await D.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(D);
  const shownD = await openShare(D, 'D.first');
  if (shownD) {
    const f = await dialogFacts(D);
    say('D.first.dialog', { ask: f.ask !== null, focus: f.focus });
    await D.keyboard.press('Escape');
    const closed = await ctl(D, 'dialog.share')
      .waitFor({ state: 'detached', timeout: 2000 })
      .then(
        () => true,
        () => false,
      );
    say('D.first.escape', {
      closed,
      asked: await D.evaluate(() => localStorage.getItem('ts-share-name-asked')),
    });
    const shownD2 = await openShare(D, 'D.second');
    if (shownD2) {
      const g = await dialogFacts(D);
      say('D.second.dialog', { ask: g.ask, focus: g.focus });
      await D.keyboard.press('Escape');
    }
  }
  say(
    'console.errors',
    Object.fromEntries(
      Object.entries(consoleErrors).map(([k, v]) => [k, { count: v.length, first: v.slice(0, 3) }]),
    ),
  );
} catch (error) {
  say('error', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  process.exitCode = 1;
} finally {
  if (deckId !== null) {
    try {
      await invoke(A, 'deck.trash', { id: deckId }).catch(() => null);
      await invoke(A, 'deck.remove', { id: deckId }).catch(() => null);
      say('deck.removed', deckId);
    } catch (error) {
      say('deck.removeError', String(error));
    }
  }
  say('load.end', load());
  writeFileSync(join(OUT, 'fix-facts.json'), JSON.stringify(facts, null, 2));
  await browser.close();
}
