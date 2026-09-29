// B3's drive of the builder's Picture tab on B3's dev server (docs/PEOPLE.md 4.1, 6.1 rows
// people.avatar-upload, people.avatar-cap-refusal, people.avatar-anonymous-refused,
// people.own-chip-follows-avatar): a signed in browser (the captured code out of the sqlite
// identity database through identity-seed.mts) opens /new, turns Advanced tools on (the own chip
// is parked until the integrator unparks it, PEOPLE.md 3.14), opens Change avatar, loads the
// seed's 1200 by 900 JPEG, drags the crop, applies, reads the own chip and the Profile head,
// reopens the builder on the current picture, then the cap refusal with toBlob stubbed to a 600
// KB blob, Glyph > Apply, and an anonymous browser's Picture tab. Pictures and facts.json land
// beside this file. Run from the repo root while holding .turboslide/e2e.lock:
//   node docs/gslides-parity/people/build/b3/drive.mjs [--base http://localhost:4463]
// Nothing here prints a secret; the server's secrets are minted in its own start script.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:4463';
const OUT = dirname(fileURLToPath(import.meta.url));
const ROOT = join(OUT, '..', '..', '..', '..', '..');
/* Playwright is the workspace's own, as the audit's drive script loads it */
const require = createRequire(import.meta.url);
const { chromium } = require(join(ROOT, 'node_modules/.pnpm/playwright@1.62.1/node_modules/playwright'));
const SEED = join(ROOT, 'apps', 'studio', 'e2e', 'identity-seed.mts');
const AUTH_DB = process.env.TURBOSLIDE_AUTH_DB ?? '.turboslide/auth-b3.sqlite';
mkdirSync(OUT, { recursive: true });

const facts = { base: BASE, at: new Date().toISOString(), load: null };
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};
try {
  facts.load = execFileSync('uptime', { encoding: 'utf8' }).trim();
} catch {}

function seed(mode, ...rest) {
  const out = execFileSync('node', [SEED, mode, ...rest], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT,
  });
  return JSON.parse(out.trim().split('\n').pop() ?? '{}');
}

const ctl = (page, id) => page.locator(`[data-control="${id}"]`).first();

async function waitEditor(page) {
  await page.waitForFunction(() => Boolean(window.turboslide && window.turboslide.studio), null, {
    timeout: 90_000,
  });
  await page
    .locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
    .first()
    .waitFor({ timeout: 60_000 });
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
  return `build/b3/${name}.png`;
}

async function advancedOn(page) {
  await page.keyboard.press('Escape');
  await ctl(page, 'menubar.tools').click();
  const row = page.locator('[data-control="menu.tools.advancedTools"]').first();
  await row.waitFor({ timeout: 8000 });
  if ((await row.getAttribute('aria-checked')) !== 'true') await row.click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

async function openBuilder(page) {
  await page.keyboard.press('Escape');
  if ((await ctl(page, 'title.account').count()) === 0) await advancedOn(page);
  await ctl(page, 'title.account').click();
  await page.locator('#ts-menu-account').waitFor({ timeout: 8000 });
  await page.getByRole('menuitem', { name: 'Change avatar' }).click();
  await ctl(page, 'dialog.avatarBuilder').waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
}

async function closeDialog(page) {
  if ((await ctl(page, 'dialog.avatarBuilder').count()) > 0) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

function ownChipFacts(page) {
  return page.evaluate(() => {
    const chip = document.querySelector('[data-control="title.account"] .ts-chip');
    if (!chip) return null;
    const img = chip.querySelector('img.ts-chip-picture');
    const plate = chip.querySelector('svg.ts-chip-plate');
    const r = chip.getBoundingClientRect();
    const inner = (img ?? plate)?.getBoundingClientRect();
    return {
      variant: chip.getAttribute('data-variant'),
      label: chip.getAttribute('aria-label'),
      size: { w: r.width, h: r.height },
      img: img
        ? {
            src: img.getAttribute('src'),
            srcset: img.getAttribute('srcset'),
            decoding: img.getAttribute('decoding'),
            complete: img.complete,
            naturalWidth: img.naturalWidth,
          }
        : null,
      plate: plate ? 'svg' : null,
      inset: inner
        ? { l: inner.left - r.left, t: inner.top - r.top, r: r.right - inner.right, b: r.bottom - inner.bottom }
        : null,
    };
  });
}

async function signIn(page, email) {
  const asked = await page.request.post('/api/auth/sign-in/magic-link', {
    data: { email, callbackURL: '/decks' },
    headers: { origin: BASE },
  });
  if (asked.status() !== 200) throw new Error(`magic link ${asked.status()}`);
  const mail = seed('mail', AUTH_DB, email);
  if (!/^\d{6}$/.test(mail.code ?? '')) throw new Error('no captured code');
  const verified = await page.request.post('/api/auth/sign-in/email-otp', {
    data: { email, otp: mail.code },
    headers: { origin: BASE },
  });
  return verified.status();
}

const picture = seed('picture', 'jpeg', '1200', '900', 'gradient');
const jpeg = Buffer.from(picture.base64, 'base64');
say('fixture', { mime: picture.mime, bytes: picture.bytes });

const browser = await chromium.launch({ headless: true });
const mk = () =>
  browser.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
const ctxA = await mk();
const A = await ctxA.newPage();
/* the account.setAvatar requests: runDeckAction server function calls whose input names the action
   (the session attach also names every action id in its manifest, so the function name is read
   out of the /_serverFn/<base64> segment) */
const requests = [];
const isSetAvatar = (request) => {
  const body = request.postData();
  if (typeof body !== 'string' || !body.includes('account.setAvatar')) return false;
  const segment = /\/_serverFn\/([A-Za-z0-9_-]+)/.exec(request.url())?.[1] ?? '';
  try {
    return Buffer.from(segment, 'base64').toString('utf8').includes('runDeckActionFn');
  } catch {
    return false;
  }
};
A.on('request', (request) => {
  if (isSetAvatar(request)) requests.push({ url: request.url().slice(0, 60), bytes: request.postData().length });
});
const invoke = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);
/* a draft of /new holds no deck until its first write, and the account actions run through the
   deck's dispatcher, so the drive writes the title first */
async function createDeck(page, title) {
  const revision = await page.evaluate(() => window.turboslide.studio.describe().state.revision ?? 0);
  const renamed = await invoke(page, 'deck.rename', { name: title, baseRevision: revision });
  await page.waitForTimeout(800);
  return renamed;
}

try {
  const email = `b3-${Date.now()}@example.test`;
  say('signIn.status', await signIn(A, email));
  await A.goto('/new');
  await waitEditor(A);
  say('deck', await createDeck(A, 'B3 avatar drive'));
  say('identity', await A.evaluate(() => {
    const s = window.turboslide.studio.describe().state;
    return { self: s.presence?.self ?? null, account: s.account ?? null };
  }));

  // ---- the builder before: the Initials tab, then the empty Picture tab
  await openBuilder(A);
  say('shot.before.initials', await shotAround(A, ctl(A, 'dialog.avatarBuilder'), '01-builder-before-initials', 24));
  await ctl(A, 'dialog.avatarBuilder.tab.picture').click();
  await ctl(A, 'dialog.avatarBuilder.panel.picture').waitFor({ timeout: 5000 });
  say('picture.empty', await A.evaluate(() => ({
    cap: document.querySelector('[data-control="dialog.avatarBuilder.capSentence"]')?.textContent ?? null,
    privacy: document.querySelector('[data-control="dialog.avatarBuilder.privacySentence"]')?.textContent ?? null,
    cache: document.querySelector('[data-control="dialog.avatarBuilder.cacheSentence"]')?.textContent ?? null,
    loaded: document.querySelector('[data-control="dialog.avatarBuilder.crop"]')?.getAttribute('data-loaded') ?? null,
    applyDisabled: document.querySelector('[data-control="dialog.avatarBuilder.apply"]')?.disabled ?? null,
    panelHeight: document.querySelector('.ts-avatar-panel')?.getBoundingClientRect().height ?? null,
    panelScroll: document.querySelector('.ts-avatar-panel')?.scrollHeight ?? null,
  })));
  say('shot.before.picture', await shotAround(A, ctl(A, 'dialog.avatarBuilder'), '02-builder-before-picture', 24));

  // ---- the file: decoded, drawn in the box, the crop dragged
  await ctl(A, 'dialog.avatarBuilder.file').setInputFiles({ name: 'seed-1200x900.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await A.locator('[data-control="dialog.avatarBuilder.crop"][data-loaded="true"]').waitFor({ timeout: 10_000 });
  say('picture.loaded', await A.evaluate(() => ({
    cropSentence: document.querySelector('[data-control="dialog.avatarBuilder.cropSentence"]')?.textContent ?? null,
    applyDisabled: document.querySelector('[data-control="dialog.avatarBuilder.apply"]')?.disabled ?? null,
    stripPictures: document.querySelectorAll('[data-control="dialog.avatarBuilder.strip"] img.ts-chip-picture').length,
    objectPosition: document.querySelector('[data-control="dialog.avatarBuilder.strip"] img.ts-chip-picture')?.style.objectPosition ?? null,
    error: document.querySelector('[data-control="dialog.avatarBuilder.error"]')?.textContent ?? null,
  })));
  say('shot.loaded', await shotAround(A, ctl(A, 'dialog.avatarBuilder'), '03-builder-picture-loaded', 24));
  const box = await ctl(A, 'dialog.avatarBuilder.crop').boundingBox();
  await A.mouse.move(box.x + 128, box.y + 128);
  await A.mouse.down();
  await A.mouse.move(box.x + 88, box.y + 128, { steps: 8 });
  await A.mouse.move(box.x + 48, box.y + 128, { steps: 8 });
  await A.mouse.up();
  await A.waitForTimeout(300);
  say('picture.dragged', await A.evaluate(() => ({
    objectPosition: document.querySelector('[data-control="dialog.avatarBuilder.strip"] img.ts-chip-picture')?.style.objectPosition ?? null,
  })));
  say('shot.dragged', await shotAround(A, ctl(A, 'dialog.avatarBuilder'), '04-builder-picture-dragged', 24));

  // ---- Apply: the request, the dialog closing, the own chip
  const chipBefore = await ownChipFacts(A);
  say('ownChip.before', chipBefore);
  const t0 = Date.now();
  await ctl(A, 'dialog.avatarBuilder.apply').click();
  let applyError = null;
  const closed = await ctl(A, 'dialog.avatarBuilder')
    .waitFor({ state: 'detached', timeout: 15_000 })
    .then(() => true)
    .catch(async () => {
      applyError = await ctl(A, 'dialog.avatarBuilder.error').textContent().catch(() => null);
      return false;
    });
  say('apply', { closed, error: applyError, ms: Date.now() - t0, requests });
  if (!closed) {
    say('shot.applyError', await shotAround(A, ctl(A, 'dialog.avatarBuilder'), '05-builder-apply-error', 24));
    await closeDialog(A);
  }
  let chipAfter = null;
  for (let i = 0; i < 25; i += 1) {
    chipAfter = await ownChipFacts(A);
    if (chipAfter?.img?.src) break;
    await A.waitForTimeout(200);
  }
  say('ownChip.after', { ...chipAfter, ms: Date.now() - t0 });
  say('ownChip.urlGrammar', typeof chipAfter?.img?.src === 'string' && /\/u\/[A-Za-z0-9_-]{22}\/[0-9a-f]{64}-64\.webp$/.test(chipAfter.img.src));
  say('shot.ownChip.after', await shotAround(A, ctl(A, 'title.presence'), '05-own-chip-after', 20));
  if (chipAfter?.img?.src) {
    const served = await A.request.get(chipAfter.img.src, { headers: { origin: BASE, 'sec-fetch-site': 'same-origin' } });
    say('picture.served', { status: served.status(), type: served.headers()['content-type'] ?? null, cache: served.headers()['cache-control'] ?? null, bytes: (await served.body()).length });
  }
  say('me', await A.evaluate(() => window.turboslide.studio.invoke('account.me', {})).catch((error) => String(error)));

  // ---- the Profile head at 128, and the account menu head
  await A.keyboard.press('Escape');
  await ctl(A, 'title.account').click();
  await A.locator('#ts-menu-account').waitFor({ timeout: 8000 });
  say('shot.accountMenu', await A.screenshot({ path: join(OUT, '06-account-menu-after.png'), clip: { x: 900, y: 0, width: 540, height: 260 } }).then(() => 'build/b3/06-account-menu-after.png'));
  say('accountMenu.chip', await A.evaluate(() => {
    const img = document.querySelector('#ts-menu-account img.ts-chip-picture');
    return img ? { src: img.getAttribute('src'), srcset: img.getAttribute('srcset') } : null;
  }));
  const sessions = A.getByRole('menuitem', { name: 'Sessions' });
  if ((await sessions.count()) > 0) {
    await sessions.click();
    await ctl(A, 'dialog.profile').waitFor({ timeout: 8000 });
    say('profile.head', await A.evaluate(() => {
      const img = document.querySelector('[data-control="dialog.profile.head"] img.ts-chip-picture');
      return { src: img?.getAttribute('src') ?? null, srcset: img?.getAttribute('srcset') ?? null, trust: document.querySelector('[data-control="dialog.profile.trust"]')?.textContent ?? null };
    }));
    say('shot.profile', await shotAround(A, ctl(A, 'dialog.profile.head'), '07-profile-head', 24));
    await A.keyboard.press('Escape');
    await A.waitForTimeout(300);
  } else say('profile.head', 'no Sessions row');

  // ---- the builder reopened on the current picture
  await openBuilder(A);
  say('reopened', await A.evaluate(() => ({
    panel: document.querySelector('.ts-avatar-panel')?.getAttribute('data-control') ?? null,
    strip: [...document.querySelectorAll('[data-control="dialog.avatarBuilder.strip"] img.ts-chip-picture')].map((img) => ({ size: img.closest('.ts-avatar-cell')?.getAttribute('data-size'), src: img.getAttribute('src')?.replace(/^.*\//, ''), srcset: (img.getAttribute('srcset') ?? '').replace(/[^ ,]*\//g, ''), naturalWidth: img.naturalWidth })),
    applyDisabled: document.querySelector('[data-control="dialog.avatarBuilder.apply"]')?.disabled ?? null,
  })));
  say('shot.reopened', await shotAround(A, ctl(A, 'dialog.avatarBuilder'), '08-builder-reopened-current-picture', 24));
  await closeDialog(A);

  // ---- the cap refusal: toBlob stubbed to a 600 KB blob on the next load
  await ctxA.addInitScript(() => {
    HTMLCanvasElement.prototype.toBlob = function stub(cb) {
      cb(new Blob([new Uint8Array(600 * 1024)], { type: 'image/webp' }));
    };
  });
  requests.length = 0;
  await A.reload();
  await waitEditor(A);
  say('ownChip.afterReload', await ownChipFacts(A));
  await openBuilder(A);
  await ctl(A, 'dialog.avatarBuilder.tab.picture').click();
  await ctl(A, 'dialog.avatarBuilder.file').setInputFiles({ name: 'seed-1200x900.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await A.locator('[data-control="dialog.avatarBuilder.crop"][data-loaded="true"]').waitFor({ timeout: 10_000 });
  await ctl(A, 'dialog.avatarBuilder.apply').click();
  await A.waitForTimeout(1200);
  say('capRefusal', {
    error: await ctl(A, 'dialog.avatarBuilder.error').textContent().catch(() => null),
    dialogOpen: (await ctl(A, 'dialog.avatarBuilder').count()) > 0,
    requests: requests.length,
  });
  say('shot.capRefusal', await shotAround(A, ctl(A, 'dialog.avatarBuilder'), '09-builder-cap-refusal', 24));
  await closeDialog(A);

  // ---- Glyph > Apply: the own chip's variant within 2 s, the builder reopened on Glyph
  await openBuilder(A);
  await ctl(A, 'dialog.avatarBuilder.tab.glyph').click();
  await ctl(A, 'dialog.avatarBuilder.another').click();
  const g0 = Date.now();
  await ctl(A, 'dialog.avatarBuilder.apply').click();
  let glyph = null;
  for (let i = 0; i < 20; i += 1) {
    glyph = await ownChipFacts(A);
    if (glyph?.variant === 'glyph') break;
    await A.waitForTimeout(100);
  }
  say('glyph.ownChip', { variant: glyph?.variant ?? null, ms: Date.now() - g0 });
  say('shot.glyph', await shotAround(A, ctl(A, 'title.presence'), '10-own-chip-glyph', 20));
  await openBuilder(A);
  say('glyph.reopened', await A.evaluate(() => ({
    panel: document.querySelector('.ts-avatar-panel')?.getAttribute('data-control') ?? null,
    tab: document.querySelector('[data-control="dialog.avatarBuilder.tab.glyph"]')?.getAttribute('aria-selected') ?? null,
  })));
  await closeDialog(A);

  // ---- Change name: the same write back path; the own chip's accessible name within 2 s
  await A.keyboard.press('Escape');
  await ctl(A, 'title.account').click();
  await A.locator('#ts-menu-account').waitFor({ timeout: 8000 });
  await A.getByRole('menuitem', { name: 'Change name' }).click();
  await ctl(A, 'dialog.namePrompt.name').waitFor({ timeout: 8000 });
  await ctl(A, 'dialog.namePrompt.name').fill('Ada B3');
  const n0 = Date.now();
  await ctl(A, 'dialog.namePrompt.continue').click();
  let named = null;
  for (let i = 0; i < 20; i += 1) {
    named = await ownChipFacts(A);
    if ((named?.label ?? '').startsWith('Ada B3')) break;
    await A.waitForTimeout(100);
  }
  say('name.ownChip', { label: named?.label ?? null, variant: named?.variant ?? null, ms: Date.now() - n0 });
  await closeDialog(A);
  if ((await ctl(A, 'dialog.namePrompt').count()) > 0) await A.keyboard.press('Escape');

  // ---- dark chrome: the Picture tab with a file loaded
  await A.evaluate(() => {
    try { localStorage.setItem('gt-theme', 'dark'); } catch {}
    document.documentElement.setAttribute('data-theme', 'dark');
    window.postMessage({ type: 'gt-theme', theme: 'dark' }, '*');
  });
  await A.waitForTimeout(400);
  await openBuilder(A);
  await ctl(A, 'dialog.avatarBuilder.tab.picture').click();
  await ctl(A, 'dialog.avatarBuilder.file').setInputFiles({ name: 'seed-1200x900.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await A.locator('[data-control="dialog.avatarBuilder.crop"][data-loaded="true"]').waitFor({ timeout: 10_000 });
  say('shot.dark', await shotAround(A, ctl(A, 'dialog.avatarBuilder'), '11-builder-picture-dark', 24));
  await closeDialog(A);

  // ---- an anonymous browser: the sentence and Apply disabled
  const ctxB = await mk();
  const B = await ctxB.newPage();
  await B.goto('/new');
  await waitEditor(B);
  say('deck.B', await createDeck(B, 'B3 anonymous drive'));
  await openBuilder(B);
  await ctl(B, 'dialog.avatarBuilder.tab.picture').click();
  await ctl(B, 'dialog.avatarBuilder.panel.picture').waitFor({ timeout: 5000 });
  say('anonymous', await B.evaluate(() => ({
    sentence: document.querySelector('[data-control="dialog.avatarBuilder.signInSentence"]')?.textContent ?? null,
    file: document.querySelectorAll('[data-control="dialog.avatarBuilder.file"]').length,
    applyDisabled: document.querySelector('[data-control="dialog.avatarBuilder.apply"]')?.disabled ?? null,
  })));
  say('shot.anonymous', await shotAround(B, ctl(B, 'dialog.avatarBuilder'), '12-builder-anonymous-picture', 24));
  say('anonymous.api', await B.evaluate(() =>
    window.turboslide.studio
      .invoke('account.setAvatar', { variant: 'picture', picture: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=' })
      .then((answer) => ({ ok: true, answer }))
      .catch((error) => ({ ok: false, message: String(error?.message ?? error) })),
  ));
  await ctxB.close();
} catch (error) {
  say('error', String(error?.stack ?? error));
  await A.screenshot({ path: join(OUT, 'error.png') }).catch(() => {});
} finally {
  await browser.close();
  facts.loadAfter = (() => {
    try {
      return execFileSync('uptime', { encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  })();
  writeFileSync(join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`);
}
