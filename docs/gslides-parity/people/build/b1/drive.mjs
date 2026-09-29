// The B1 drive of the people round (docs/PEOPLE.md 3.6 to 3.9, 3.11, 3.15 to 3.18, 3.27; the
// rows of 6.1 that read the seam): three browser contexts on the B1 dev server (4461, the file
// store in a tmp folder, the memory channel, a sqlite identity database, the capture mailer).
// A signs in through the captured code, B and C are anonymous. The facts and the pictures land
// beside this file. Run from the repository root with the server up:
//   node docs/gslides-parity/people/build/b1/drive.mjs
// Playwright is the workspace's own. No secret is printed: the sign in code is read from the
// identity database by the e2e seed script and used at once.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/Users/kevinliu/repos/Turboslide-people/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const BASE = process.env.B1_BASE ?? 'http://localhost:4461';
const ROOT = '/Users/kevinliu/repos/Turboslide-people';
const AUTH_DB = process.env.TURBOSLIDE_AUTH_DB ?? join(ROOT, '.turboslide/auth-b1.sqlite');
const SEED = join(ROOT, 'apps/studio/e2e/identity-seed.mts');
const OUT = dirname(fileURLToPath(import.meta.url));
mkdirSync(OUT, { recursive: true });
const TYPE_DELAY = 40;
const SAME_ORIGIN = { origin: BASE, 'sec-fetch-site': 'same-origin' };
const facts = {};
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};

/** The localhost agent surface (TURBOSLIDE_LOCAL_OPEN=1): a cookieless call is the checkout holder. */
async function post(action, deckId, body) {
  const response = await fetch(`${BASE}/api/actions/${action}?deck=${encodeURIComponent(deckId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...SAME_ORIGIN },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { text: text.slice(0, 200) };
  }
  return { status: response.status, json };
}

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

async function settled(page, timeout = 20_000) {
  const until = Date.now() + timeout;
  let s = await state(page);
  while (Date.now() < until) {
    s = await state(page);
    const words = await ctl(page, 'deck.saveState')
      .textContent()
      .catch(() => null);
    if ((s.sync?.pending ?? s.pending ?? 0) === 0 && (words === null || /All changes saved|Not saved yet/.test(words)))
      return s;
    await page.waitForTimeout(150);
  }
  return s;
}

async function headingRun(page) {
  // the editing stage mounts its text runs after the viewer settles: wait for one
  await page.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]').first().waitFor({ timeout: 20_000 }).catch(() => {});
  const runs = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run]')].map(
      (el) => el.getAttribute('data-run') ?? '',
    ),
  );
  return runs.find((r) => /heading/.test(r)) ?? runs[0] ?? '';
}

async function typeInto(page, run, text) {
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`).first();
  await el.dblclick();
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(text, { delay: TYPE_DELAY });
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
}

/** Types without closing the inline session, so the caret stays for the other browsers to draw. */
async function typeOpen(page, run, text) {
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`).first();
  await el.dblclick();
  await page.waitForTimeout(200);
  await page.keyboard.press('End');
  await page.keyboard.type(text, { delay: TYPE_DELAY });
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

async function shotAround(page, locator, name, pad = 12) {
  await page.waitForTimeout(500);
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
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, ...(clip ? { clip } : {}) });
  return `${name}.png`;
}

async function shotMenu(page, selector, name) {
  const mb = await page.locator(selector).boundingBox();
  const path = join(OUT, `${name}.png`);
  await page.screenshot({
    path,
    clip: {
      x: Math.max(0, mb.x - 260),
      y: 0,
      width: Math.min(1440 - Math.max(0, mb.x - 260), mb.width + 300),
      height: mb.y + mb.height + 16,
    },
  });
  return `${name}.png`;
}

function presenceState(s) {
  const strip = (p) =>
    p === undefined || p === null
      ? p
      : {
          clientId: p.clientId,
          principalId: p.principalId,
          label: p.label,
          name: p.name,
          trust: p.trust,
          kind: p.kind,
          role: p.role,
          hue: p.hue,
          email: p.email,
          slideId: p.slideId,
          markVariant: p.mark?.variant,
          markInitials: p.mark?.initials,
          markLabel: p.mark?.label,
          markHueSlot: p.mark?.hue?.slot ?? null,
          markPicture: p.mark?.pictureUrl ?? null,
        };
  return { self: strip(s.presence?.self), others: (s.presence?.others ?? []).map(strip), count: s.presence?.count };
}

function slotFacts(page) {
  return page.evaluate(() => {
    const slot = document.querySelector('[data-control="title.presence"]');
    if (!slot) return null;
    return {
      count: slot.getAttribute('data-count'),
      chips: [...slot.querySelectorAll('.ts-chip')].map((chip) => ({
        holder: chip.closest('[data-control]')?.getAttribute('data-control') ?? null,
        ariaLabel: chip.getAttribute('aria-label'),
        variant: chip.getAttribute('data-variant'),
        trust: chip.getAttribute('data-trust'),
        hue: chip.getAttribute('data-hue'),
        hueVar: chip.style.getPropertyValue('--ts-hue'),
        initials: chip.querySelector('.ts-chip-initials')?.textContent ?? null,
        picture: chip.querySelector('.ts-chip-picture') !== null,
        stripe: chip.querySelector('.ts-chip-stripe') !== null,
      })),
      ownChip: slot.querySelector('[data-control="title.account"]') !== null,
    };
  });
}

function rosterFacts(page) {
  return page.evaluate(() => {
    const menu = document.querySelector('#ts-menu-roster');
    if (!menu) return null;
    return {
      rows: [...menu.querySelectorAll('.ts-roster-row')].map((row) => ({
        control: row.getAttribute('data-control'),
        name: row.querySelector('.ts-roster-name')?.textContent ?? null,
        meta: row.querySelector('.ts-roster-meta')?.textContent ?? null,
        act: row.querySelector('.ts-roster-act')?.textContent ?? null,
        chip: row.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
        chipTrust: row.querySelector('.ts-chip')?.getAttribute('data-trust') ?? null,
        chipVariant: row.querySelector('.ts-chip')?.getAttribute('data-variant') ?? null,
        initials: row.querySelector('.ts-chip-initials')?.textContent ?? null,
        hue: row.querySelector('.ts-chip')?.getAttribute('data-hue') ?? null,
      })),
    };
  });
}

async function openRoster(page) {
  await page.keyboard.press('Escape');
  await page.mouse.move(600, 500);
  await ctl(page, 'presence.more').click();
  await page.locator('#ts-menu-roster').waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
  return rosterFacts(page);
}

async function advancedOn(page) {
  await page.keyboard.press('Escape');
  await ctl(page, 'menubar.tools').click();
  const row = page.locator('[data-control="menu.tools.advancedTools"]').first();
  await row.waitFor({ timeout: 8000 });
  const checked = await row.getAttribute('aria-checked');
  if (checked !== 'true') await row.click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

async function openAccountMenu(page) {
  await page.keyboard.press('Escape');
  await ctl(page, 'title.account').click();
  await page.locator('#ts-menu-account').waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const menu = document.querySelector('#ts-menu-account');
    return {
      name: menu.querySelector('.ts-account-name')?.textContent ?? null,
      sentence: menu.querySelector('.ts-account-sentence')?.textContent ?? null,
      chip: menu.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
      chipTrust: menu.querySelector('.ts-chip')?.getAttribute('data-trust') ?? null,
      chipVariant: menu.querySelector('.ts-chip')?.getAttribute('data-variant') ?? null,
      rows: [...menu.querySelectorAll('[role="menuitem"]')].map((r) => r.getAttribute('data-control')),
    };
  });
}

async function chipTip(page, index = 0) {
  await page.keyboard.press('Escape');
  const chip = page.locator('[data-control^="presence.chip."]').nth(index);
  await chip.hover();
  await page.waitForTimeout(900);
  return page.evaluate(() => document.querySelector('.pt-tip:not([hidden])')?.textContent ?? null);
}

/** Signs a context in through the library's routes: the magic link request, the captured code, the code sign in, a reload. */
async function signIn(page, email) {
  const asked = await page.request.post('/api/auth/sign-in/magic-link', {
    data: { email, callbackURL: '/decks' },
    headers: SAME_ORIGIN,
  });
  if (asked.status() !== 200) throw new Error(`magic link ${asked.status()}`);
  const out = execFileSync('node', [SEED, 'mail', AUTH_DB, email], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const { code } = JSON.parse(out.trim().split('\n').pop() ?? '{}');
  if (typeof code !== 'string' || code.length !== 6) throw new Error('no captured code');
  const verified = await page.request.post('/api/auth/sign-in/email-otp', {
    data: { email, otp: code },
    headers: SAME_ORIGIN,
  });
  if (verified.status() !== 200) throw new Error(`otp ${verified.status()}`);
  const body = await verified.json();
  return body.user?.id ?? null;
}

async function principalOf(page) {
  const cookies = await page.context().cookies();
  const cookie = cookies.find((c) => c.name === '__Host-ts_id' || c.name === 'ts_id');
  if (cookie === undefined) return null;
  const payload = cookie.value.split('.')[1] ?? '';
  const text = Buffer.from(payload, 'base64url').toString('utf8');
  return text.slice(0, text.lastIndexOf('.'));
}

const identityOf = (s, id) => {
  const v = s.identities?.[id];
  if (!v) return null;
  return {
    principalId: v.principalId,
    label: v.label,
    name: v.name,
    trust: v.trust,
    kind: v.kind,
    email: v.email,
    deleted: v.deleted,
    markVariant: v.mark?.variant,
    markInitials: v.mark?.initials,
    markSelf: v.mark?.self,
    markHue: v.mark?.hue ?? null,
  };
};

const browser = await chromium.launch({ headless: true });
/* the shared worktree's other lanes edit chrome files while this runs and Vite's HMR then
   reloads every open page mid drive (the rosters emptied, the client ids changed). The dev
   client itself must load (every CSS import in dev goes through its updateStyle), so the HMR
   websocket alone is routed to nowhere: the page's socket opens and never receives a message,
   so nothing hot updates and nothing reloads. The room's stream is a fetch, not a socket. */
const mk = async () => {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
  await ctx.routeWebSocket(/.*/, () => {});
  return ctx;
};
const ctxA = await mk();
const ctxB = await mk();
const ctxC = await mk();
const ctxD = await mk();
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const C = await ctxC.newPage();
const D = await ctxD.newPage();
const decks = [];
const stamp = Date.now().toString(36);
const EMAIL_A = `b1-a-${stamp}@example.test`;
const EMAIL_B = `b1-b-${stamp}@example.test`;
const EMAIL_D = `b1-d-${stamp}@example.test`;

try {
  say('uptime', execFileSync('uptime', { encoding: 'utf8' }).trim());
  // ---- before: A anonymous on /new; the draft carries the person now (3.11)
  await A.goto('/new');
  await waitEditor(A);
  const anonA = await principalOf(A);
  const before = await state(A);
  say('before.A.account', before.account);
  say('before.A.presence', presenceState(before));
  say('before.A.cookiePrincipal', anonA);
  await advancedOn(A);
  say('before.A.slot', await slotFacts(A));
  say('before.A.accountMenu', await openAccountMenu(A));
  say('shot.before.A.accountMenu', await shotMenu(A, '#ts-menu-account', 'A-account-menu-before-anonymous'));
  await A.keyboard.press('Escape');

  // ---- A signs in (the room routes read the session before the cookie, 3.6)
  const userA = await signIn(A, EMAIL_A);
  say('signIn.A.userId', userA !== null);
  await A.reload();
  await waitEditor(A);
  const after = await state(A);
  say('after.A.account', after.account);
  say('after.A.presence', presenceState(after));
  say('after.A.identities.self', identityOf(after, after.account.principalId));
  say('after.A.alias', JSON.parse(execFileSync('node', [SEED, 'alias', AUTH_DB, anonA ?? ''], { encoding: 'utf8' }).trim().split('\n').pop() ?? '{}').userId === userA);
  say('after.A.slot', await slotFacts(A));
  say('after.A.accountMenu', await openAccountMenu(A));
  say('shot.after.A.accountMenu', await shotMenu(A, '#ts-menu-account', 'A-account-menu-after-signed-in'));
  await A.keyboard.press('Escape');

  // ---- A's first edit creates the deck as the account (the owner is usr_)
  await typeInto(A, await headingRun(A), 'People round B1 deck');
  await poll(async () => (await state(A)).revision >= 1, 30_000);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  await settled(A);
  const info = await invoke(A, 'deck.info');
  const deckId = info.id;
  decks.push(deckId);
  say('deck.id', deckId);
  say('after.A.namePromptFired', await ctl(A, 'dialog.namePrompt').isVisible().catch(() => false));
  const sA = await state(A);
  say('after.A.access', { role: sA.access?.role, via: sA.access?.via, owner: sA.access?.owner });
  const v1 = await invoke(A, 'version.list', {});
  say('versions.A.afterSignIn', (v1.versions ?? v1).map((v) => ({ n: v.n, author: v.author })));

  // ---- A opens the deck to anyone with the link as an editor; B follows
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  const linkUrl = opened.url;
  say('share.link', typeof linkUrl === 'string');
  await B.goto(linkUrl ?? `/edit/${deckId}`);
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(B);
  say('B.access', { role: (await state(B)).access?.role, via: (await state(B)).access?.via });
  await poll(async () => ((await state(A)).presence?.others?.length ?? 0) >= 1, 40_000);
  await poll(async () => ((await state(B)).presence?.others?.length ?? 0) >= 1, 40_000);
  await A.waitForTimeout(1500);
  // B by link, names off: A is the role word on the role's plate (3.27, default 6)
  say('linkVisitor.B.presence', presenceState(await state(B)));
  say('linkVisitor.B.identities.A', identityOf(await state(B), sA.account.principalId));
  say('linkVisitor.B.slot', await slotFacts(B));
  say('linkVisitor.B.tip', await chipTip(B));
  say('shot.linkVisitor.B.tip', await B.screenshot({ path: join(OUT, 'B-chip-tooltip-link-visitor.png'), clip: { x: 560, y: 0, width: 880, height: 150 } }).then(() => 'B-chip-tooltip-link-visitor.png'));
  say('linkVisitor.B.roster', await openRoster(B));
  say('shot.linkVisitor.B.roster', await shotMenu(B, '#ts-menu-roster', 'B-roster-link-visitor'));
  await B.keyboard.press('Escape');
  // A (the owner) sees B as its label with the hue; A's own entry carries A's address (3.7)
  say('owner.A.presence', presenceState(await state(A)));
  say('owner.A.slot', await slotFacts(A));

  // ---- the owner's names switch on: B reloads and reads A's label with the verified trust
  const share2 = await invoke(A, 'share.get', { id: deckId });
  const switched = await invoke(A, 'share.settings', {
    id: deckId,
    showNamesToLinkVisitors: true,
    baseRevision: share2.record?.revision ?? share2.revision,
  });
  say('share.settings', { showNames: switched.record?.settings?.showNamesToLinkVisitors ?? switched.settings?.showNamesToLinkVisitors ?? null });
  await B.reload();
  await waitEditor(B);
  await poll(async () => (await state(B)).presence?.others?.some((p) => p.trust === 'verified'), 40_000);
  await B.waitForTimeout(800);
  say('namesOn.B.presence', presenceState(await state(B)));
  say('namesOn.B.identities.A', identityOf(await state(B), sA.account.principalId));
  say('namesOn.B.tip', await chipTip(B));
  say('namesOn.B.roster', await openRoster(B));
  say('shot.namesOn.B.roster', await shotMenu(B, '#ts-menu-roster', 'B-roster-names-on-account-label'));
  await B.keyboard.press('Escape');

  // ---- A types a name: the account's name reaches B within the poll, still verified (3.18)
  say('A.accountMenu.beforeName', await openAccountMenu(A));
  await ctl(A, 'account.changeName').click();
  await ctl(A, 'dialog.namePrompt').waitFor({ timeout: 8000 });
  await ctl(A, 'dialog.namePrompt.name').fill('');
  await ctl(A, 'dialog.namePrompt.name').type('Kevin B1', { delay: TYPE_DELAY });
  await ctl(A, 'dialog.namePrompt.continue').click();
  await A.waitForTimeout(800);
  say('changeName.error', await ctl(A, 'dialog.namePrompt.error').textContent().catch(() => null));
  await poll(async () => (await state(B)).presence?.others?.some((p) => p.name === 'Kevin B1'), 40_000);
  await B.waitForTimeout(500);
  say('named.B.presence', presenceState(await state(B)));
  say('named.A.presence', presenceState(await state(A)));
  say('named.A.account', (await state(A)).account);
  say('named.B.tip', await chipTip(B));
  say('shot.named.B.tip', await B.screenshot({ path: join(OUT, 'B-chip-tooltip-account-named.png'), clip: { x: 560, y: 0, width: 880, height: 150 } }).then(() => 'B-chip-tooltip-account-named.png'));
  say('named.B.roster', await openRoster(B));
  say('shot.named.B.roster', await shotMenu(B, '#ts-menu-roster', 'B-roster-account-named'));
  await B.keyboard.press('Escape');
  say('named.A.accountMenu', await openAccountMenu(A));
  say('shot.named.A.accountMenu', await shotMenu(A, '#ts-menu-account', 'A-account-menu-after-named'));
  await A.keyboard.press('Escape');

  // ---- the hue (3.15): B types in the heading; A reads B's caret, chip and roster hue
  await typeOpen(B, await headingRun(B), ' by B');
  const caretDrawn = await poll(async () => (await A.locator('.ts-remote-caret, .ts-remote-outline').count()) > 0, 20_000);
  await A.waitForTimeout(400);
  say('hue.A.caretDrawn', Boolean(caretDrawn));
  say('hue.A.selectionOfB', (await state(A)).presence.others.map((p) => ({ name: p.name ?? p.label, selection: p.selection ?? null, slideId: p.slideId })));
  const hueFacts = await A.evaluate(() => {
    const caret = document.querySelector('.ts-remote-caret') ?? document.querySelector('.ts-remote-outline');
    const chip = document.querySelector('[data-control^="presence.chip."] .ts-chip');
    const stripe = chip?.querySelector('.ts-chip-stripe');
    return {
      caret: caret ? getComputedStyle(caret).backgroundColor : null,
      caretHueVar: caret?.style.getPropertyValue('--ts-hue') ?? caret?.closest('[style]')?.style.getPropertyValue('--ts-hue') ?? null,
      chipHue: chip?.getAttribute('data-hue') ?? null,
      chipHueVar: chip?.style.getPropertyValue('--ts-hue') ?? null,
      stripe: stripe ? getComputedStyle(stripe).backgroundColor : null,
      flag: document.querySelector('.ts-flag')?.textContent ?? null,
    };
  });
  const bRow = (await state(A)).presence.others.find((p) => p.name !== 'Kevin B1');
  say('hue.A.readsB', { ...hueFacts, hue: bRow?.hue, markHueSlot: bRow?.mark?.hue?.slot, markHueHex: bRow?.mark?.hue?.hex });
  if (caretDrawn) say('shot.hue.A.caret', await shotAround(A, A.locator('.ts-remote-caret, .ts-remote-outline').first(), 'A-caret-of-B-hue', 80));
  else say('shot.hue.A.slot', await shotAround(A, ctl(A, 'title.presence'), 'A-slot-hue-of-B', 20));
  await B.keyboard.press('Escape');
  await settled(B);

  // ---- join order (3.16): C joins; C moves its caret, then B; A's others keep [B, C]
  // C by the same link (the deck is in link mode: a bare /edit address is a stranger's)
  await C.goto(linkUrl ?? `/edit/${deckId}`);
  await C.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(C);
  await poll(async () => ((await state(A)).presence?.others?.length ?? 0) >= 2, 40_000);
  await A.waitForTimeout(800);
  const order0 = (await state(A)).presence.others.map((p) => p.clientId);
  await typeOpen(C, await headingRun(C), ' C');
  await C.waitForTimeout(1200);
  const order1 = (await state(A)).presence.others.map((p) => p.clientId);
  await C.keyboard.press('Escape');
  await typeOpen(B, await headingRun(B), ' B');
  await B.waitForTimeout(1200);
  const order2 = (await state(A)).presence.others.map((p) => p.clientId);
  await B.keyboard.press('Escape');
  say('order.A', { before: order0, afterC: order1, afterB: order2, held: JSON.stringify(order0) === JSON.stringify(order1) && JSON.stringify(order1) === JSON.stringify(order2) });
  say('shot.order.A.slot', await shotAround(A, ctl(A, 'title.presence'), 'A-slot-two-others', 20));
  await settled(B);
  await settled(C);

  // ---- the departed guest's comment (3.9): C types a name, comments, leaves; A reloads
  const stC = await state(C);
  const anonC = stC.account.principalId;
  await advancedOn(C);
  await openAccountMenu(C);
  await ctl(C, 'account.changeName').click();
  await ctl(C, 'dialog.namePrompt').waitFor({ timeout: 8000 });
  await ctl(C, 'dialog.namePrompt.name').fill('');
  await ctl(C, 'dialog.namePrompt.name').type('Maya Guest', { delay: TYPE_DELAY });
  await ctl(C, 'dialog.namePrompt.continue').click();
  await C.waitForTimeout(800);
  const slideId = stC.activeSlide ?? stC.document?.deck?.sections?.[0]?.slideIds?.[0] ?? null;
  const added = await invoke(C, 'comment.add', { anchor: slideId ? { kind: 'slide', slideId } : { kind: 'deck' }, body: { text: 'A comment from a guest who leaves', mentions: [] } }).catch((e) => ({ error: String(e) }));
  say('comment.C.added', { ok: added?.thread !== undefined || added?.id !== undefined, error: added?.error ?? null, author: added?.thread?.comment?.author ?? null });
  await C.waitForTimeout(600);
  await ctxC.close();
  await poll(async () => ((await state(A)).presence?.others?.length ?? 0) <= 1, 40_000);

  // ---- B edits anonymously, then signs in: the old record renders as the account (3.6, the alias)
  const anonB = (await state(B)).account.principalId;
  await typeInto(B, await headingRun(B), 'People round B1 deck, edited by B');
  await settled(B);
  const userB = await signIn(B, EMAIL_B);
  say('signIn.B.userId', userB !== null);
  await B.reload();
  await waitEditor(B);
  await typeInto(B, await headingRun(B), 'People round B1 deck, edited by B signed in');
  await settled(B);
  const sB = await state(B);
  say('aliased.B.account', sB.account);
  say('aliased.B.identities.anonB', identityOf(sB, anonB));
  say('aliased.B.identities.usrB', identityOf(sB, sB.account.principalId));

  // ---- A reloads: the payload's identities carry the departed guest, the aliased B, the owner
  await A.reload();
  await waitEditor(A);
  await poll(async () => (await state(A)).comments?.loaded === true, 30_000);
  const sA2 = await state(A);
  say('reload.A.identities.guestC', identityOf(sA2, anonC));
  say('reload.A.identities.anonB', identityOf(sA2, anonB));
  say('reload.A.identities.usrB', identityOf(sA2, sB.account.principalId));
  say('reload.A.identities.self', identityOf(sA2, sA2.account.principalId));
  say('reload.A.identities.keys', Object.keys(sA2.identities ?? {}).length);
  say('reload.A.comment.author', sA2.comments?.threads?.[0]?.comment?.author ? (({ principalId, label, name, trust, kind }) => ({ principalId, label, name, trust, kind }))(sA2.comments.threads[0].comment.author) : null);
  const v2 = await invoke(A, 'version.list', {});
  say('versions.A.final', (v2.versions ?? v2).map((v) => ({ n: v.n, author: v.author })));
  await ctl(A, 'title.comments').click().catch(() => {});
  await A.waitForTimeout(800);
  say('shot.reload.A.comments', await A.screenshot({ path: join(OUT, 'A-comments-departed-guest.png') }).then(() => 'A-comments-departed-guest.png'));
  await A.keyboard.press('Escape');

  // ---- the anonymous creator who signs in later (the gap named in b1.md): D creates, signs in, reloads
  await D.goto('/new');
  await waitEditor(D);
  await typeInto(D, await headingRun(D), 'D deck before sign in');
  await poll(async () => (await state(D)).revision >= 1, 30_000);
  await D.waitForURL(/\/edit\//, { timeout: 30_000 });
  await settled(D);
  const dInfo = await invoke(D, 'deck.info');
  decks.push(dInfo.id);
  const dBefore = await state(D);
  say('creator.D.before', { role: dBefore.access?.role, via: dBefore.access?.via, owner: dBefore.access?.owner, principalId: dBefore.account.principalId });
  await signIn(D, EMAIL_D);
  await D.reload();
  await waitEditor(D);
  const dAfter = await state(D);
  say('creator.D.afterSignIn', { role: dAfter.access?.role, via: dAfter.access?.via, owner: dAfter.access?.owner, principalId: dAfter.account.principalId, ownerView: identityOf(dAfter, dAfter.access?.owner) });
  say('uptime.end', execFileSync('uptime', { encoding: 'utf8' }).trim());
} catch (error) {
  say('error', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  await A.screenshot({ path: join(OUT, 'A-error.png') }).catch(() => {});
  await B.screenshot({ path: join(OUT, 'B-error.png') }).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  for (const deckId of decks) {
    const info = await post('deck.info', deckId, {});
    let rev = info.json?.revision;
    const trash = await post('deck.trash', deckId, { id: deckId, baseRevision: rev });
    const info2 = await post('deck.info', deckId, {});
    rev = info2.json?.revision ?? rev;
    const remove = await post('deck.remove', deckId, { id: deckId, confirm: true, baseRevision: rev });
    say(`teardown.${deckId}`, { trash: trash.status, remove: remove.status, error: remove.json?.error ?? null });
  }
  writeFileSync(join(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
}
