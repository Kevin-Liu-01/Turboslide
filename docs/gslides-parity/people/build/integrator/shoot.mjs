// The integrator's pictures of every people surface (docs/PEOPLE.md 6.3; the prompt: both
// appearances at 1440, two contexts on the preview, the account surfaces on the local server),
// extended from B2's shoot (build/b2.md). Two modes:
//   node docs/gslides-parity/people/build/integrator/shoot.mjs --base <origin> --tag preview
//     two anonymous browsers on one scratch deck: A named through the prompt or account.setName,
//     B a label by the link; the title row slot and the own chip, the chip tooltips, the roster,
//     the account menu, the version panel (a window expanded, a row hovered, its More menu), the
//     comment card and the panel row, the Share dialog in A and B, the filmstrip marks.
//   node .../shoot.mjs --base http://localhost:4466 --tag local --accounts --auth-db <sqlite>
//     A signs in with the captured code (the seed's mail mode over the server's database), uploads
//     the seed's 1200 by 900 JPEG in the builder, names itself; B is anonymous by the link; C is a
//     viewer by the link with the owner's names switch off and reads A as the role initial, then
//     with the switch on reads A's name and picture; the Profile head and the builder's Picture
//     tab are drawn too.
// The preview's authentication rides the OIDC header when VERCEL_OIDC_TOKEN is in the environment
// (the token wrapper reads it in and prints nothing); the deck is trashed and deleted forever by
// its id in a finally block; the facts land in <out>/<tag>-facts.json.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = '/Users/kevinliu/repos/Turboslide-people';
const { chromium } = require(
  `${ROOT}/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright`,
);

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const TAG = argOf('--tag', 'preview');
const ONLY = argOf('--only', '').split(',').filter(Boolean);
const want = (section) => ONLY.length === 0 || ONLY.includes(section);
const BASE = argOf('--base', 'http://localhost:4466').replace(/\/$/, '');
const OUT = argOf('--out', `${ROOT}/docs/gslides-parity/people/build/integrator`);
const ACCOUNTS = args.includes('--accounts');
const AUTH_DB = argOf('--auth-db', `${ROOT}/.turboslide/auth-integrator.sqlite`);
const SEED = `${ROOT}/apps/studio/e2e/identity-seed.mts`;
mkdirSync(OUT, { recursive: true });
const TYPE_DELAY = 40;
const facts = {
  base: BASE,
  tag: TAG,
  accounts: ACCOUNTS,
  uptime: execFileSync('uptime', { encoding: 'utf8' }).trim(),
};
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const HEADERS = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};

const ctl = (page, id) => page.locator(`[data-control="${id}"]`).first();
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const invoke = (page, action, input) =>
  page.evaluate(([a, i]) => window.turboslide.studio.invoke(a, i), [action, input]);

function seed(mode, ...rest) {
  const out = execFileSync('node', [SEED, mode, ...rest], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out.trim().split('\n').pop() ?? '{}');
}

async function signIn(page, email) {
  const asked = await page.request.post('/api/auth/sign-in/magic-link', {
    data: { email, callbackURL: '/decks' },
    headers: { origin: BASE, 'sec-fetch-site': 'same-origin' },
  });
  if (asked.status() !== 200) throw new Error(`magic link ${asked.status()}`);
  const mail = seed('mail', AUTH_DB, email);
  if (!/^\d{6}$/.test(mail.code ?? '')) throw new Error('no captured code');
  const verified = await page.request.post('/api/auth/sign-in/email-otp', {
    data: { email, otp: mail.code },
    headers: { origin: BASE, 'sec-fetch-site': 'same-origin' },
  });
  return verified.status();
}

async function waitEditor(page, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    const booted = await page
      .waitForFunction(() => Boolean(window.turboslide && window.turboslide.studio), null, {
        timeout: 60_000,
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
        .waitFor({ timeout: 60_000 })
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

async function settled(page, timeout = 30_000) {
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

async function shotAround(page, locator, name, pad = 12) {
  await page.waitForTimeout(500);
  const box = await locator.boundingBox().catch(() => null);
  const vp = page.viewportSize();
  const clip = box
    ? {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(vp.width - Math.max(0, box.x - pad), box.width + pad * 2),
        height: Math.min(vp.height - Math.max(0, box.y - pad), box.height + pad * 2),
      }
    : undefined;
  const path = join(OUT, `${TAG}-${name}.png`);
  await page.screenshot({ path, ...(clip ? { clip } : {}) });
  return path;
}

async function shotMenu(page, selector, name) {
  const menu = page.locator(selector).first();
  const mb = await menu.boundingBox();
  const path = join(OUT, `${TAG}-${name}.png`);
  await page.screenshot({
    path,
    clip: {
      x: Math.max(0, mb.x - 260),
      y: 0,
      width: Math.min(1440 - Math.max(0, mb.x - 260), mb.width + 300),
      height: mb.y + mb.height + 16,
    },
  });
  return path;
}

/** Every chip inside a root: box, border, field inset, stripe inset, the picture, the initials. */
function chipFacts(page, rootSelector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    return [...root.querySelectorAll('.ts-chip')].map((chip) => {
      const r = chip.getBoundingClientRect();
      const field = chip.querySelector('.ts-chip-plate, .ts-chip-picture');
      const f = field?.getBoundingClientRect();
      const stripe = chip.querySelector('.ts-chip-stripe');
      const s = stripe?.getBoundingClientRect();
      const cs = getComputedStyle(chip);
      return {
        holder: chip.closest('[data-control]')?.getAttribute('data-control') ?? null,
        ariaLabel: chip.getAttribute('aria-label'),
        variant: chip.getAttribute('data-variant'),
        trust: chip.getAttribute('data-trust'),
        size: chip.getAttribute('data-size'),
        box: { w: r.width, h: r.height },
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        field: f
          ? {
              w: f.width,
              h: f.height,
              l: f.left - r.left,
              t: f.top - r.top,
              r: r.right - f.right,
              b: r.bottom - f.bottom,
            }
          : null,
        fieldTag: field?.tagName ?? null,
        img:
          field?.tagName === 'IMG'
            ? {
                src: field.getAttribute('src'),
                srcset: field.getAttribute('srcset'),
                decoding: field.getAttribute('decoding'),
              }
            : null,
        stripe: s
          ? { l: s.left - r.left, r: r.right - s.right, b: r.bottom - s.bottom, h: s.height }
          : null,
        cells: chip.querySelectorAll('rect').length,
        initials: chip.querySelector('.ts-chip-initials')?.textContent ?? null,
        badgeAfter:
          chip.parentElement?.querySelector('.ts-trust-mark')?.getAttribute('aria-label') ?? null,
      };
    });
  }, rootSelector);
}

function rosterFacts(page) {
  return page.evaluate(() => {
    const menu = document.querySelector('#ts-menu-roster');
    if (!menu) return null;
    return [...menu.querySelectorAll('.ts-roster-row')].map((row) => ({
      control: row.getAttribute('data-control'),
      name: row.querySelector('.ts-roster-name')?.textContent ?? null,
      meta: row.querySelector('.ts-roster-meta')?.textContent ?? null,
      chip: row.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
      variant: row.querySelector('.ts-chip')?.getAttribute('data-variant') ?? null,
      initials: row.querySelector('.ts-chip-initials')?.textContent ?? null,
      picture: row.querySelector('img.ts-chip-picture')?.getAttribute('src') ?? null,
      badge: row.querySelector('.ts-trust-mark')?.getAttribute('aria-label') ?? null,
    }));
  });
}

function versionsFacts(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.ts-versions.is-history');
    if (!panel) return null;
    const panelBox =
      panel.closest('.ts-panel, [data-control="panel.versionHistory"]')?.getBoundingClientRect() ??
      panel.getBoundingClientRect();
    const x = (el) => (el ? el.getBoundingClientRect().left - panelBox.left : null);
    return {
      rows: [...panel.querySelectorAll('.ts-version')].map((row) => {
        const meta = row.querySelector('.ts-version-meta');
        const restore = row.querySelector('.ts-version-restore');
        return {
          author: row.getAttribute('data-author'),
          inWindow: row.classList.contains('is-in-window'),
          word: row.querySelector('.ts-version-author')?.textContent ?? null,
          meta: meta?.textContent ?? null,
          metaClipped: meta ? meta.scrollWidth > meta.clientWidth : null,
          chipX: x(row.querySelector('.ts-chip')),
          textX: x(row.querySelector('.ts-version-note')),
          restore: restore ? { display: getComputedStyle(restore).display } : null,
          badge: row.querySelector('.ts-trust-mark')?.getAttribute('aria-label') ?? null,
        };
      }),
      windows: [...panel.querySelectorAll('.ts-version-window-row')].map((row) => ({
        text: (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
        firstMarkX: x(row.querySelector('.ts-chip')),
        textX: x(row.querySelector('.ts-version-note')),
        more: row.querySelector('.ts-version-marks-more')?.textContent ?? null,
      })),
      nested: (() => {
        const nested = panel.querySelector('.ts-versions-list.is-window');
        return nested
          ? {
              ruleX: nested.getBoundingClientRect().left - panelBox.left,
              marginLeft: getComputedStyle(nested).marginLeft,
            }
          : null;
      })(),
      dayHeadX: x(panel.querySelector('.ts-versions-day-head')),
    };
  });
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

async function advancedOn(page) {
  await page.keyboard.press('Escape');
  await ctl(page, 'menubar.tools').click();
  const row = page.locator('[data-control="menu.tools.advancedTools"]').first();
  await row.waitFor({ timeout: 8000 });
  if ((await row.getAttribute('aria-checked')) !== 'true') await row.click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

async function openRoster(page) {
  await page.keyboard.press('Escape');
  await page.mouse.move(600, 500);
  await ctl(page, 'presence.more').click();
  await page.locator('#ts-menu-roster').waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
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
      badge: menu.querySelector('.ts-trust-mark')?.getAttribute('aria-label') ?? null,
      rows: [...menu.querySelectorAll('[role="menuitem"]')].map((r) =>
        r.getAttribute('data-control'),
      ),
    };
  });
}

async function openVersions(page) {
  await page.keyboard.press('Escape');
  await ctl(page, 'deck.lastEdit').click();
  await page.locator('.ts-versions.is-history').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
}

async function inBothThemes(page, fn) {
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    await fn(theme);
  }
  await setTheme(page, 'light');
}

async function chipTip(page, locator) {
  await locator.hover();
  await page.waitForTimeout(900);
  const tip = await page.evaluate(() => {
    const t = document.querySelector('.pt-tip:not([hidden])');
    return t
      ? {
          name: t.querySelector('.pt-tip-name, .pt-tip-title')?.textContent ?? null,
          text: (t.textContent ?? '').replace(/\s+/g, ' ').trim(),
        }
      : null;
  });
  return tip;
}

async function namesSwitch(page, deckId, on) {
  const share = await invoke(page, 'share.get', { id: deckId });
  const revision = share.record?.revision ?? share.revision;
  const out = await invoke(page, 'share.settings', {
    id: deckId,
    showNamesToLinkVisitors: on,
    baseRevision: revision,
  }).then(
    (r) => ({ ok: true, revision: r.record?.revision ?? r.revision ?? null }),
    (e) => ({ ok: false, error: String(e) }),
  );
  await page.waitForTimeout(600);
  return out;
}

const browser = await chromium.launch({ headless: true });
const mk = (theme = 'light') =>
  browser.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    extraHTTPHeaders: HEADERS,
  });
const ctxA = await mk();
const ctxB = await mk();
const ctxC = ACCOUNTS ? await mk() : null;
for (const ctx of [ctxA, ctxB, ctxC]) if (ctx) await ctx.routeWebSocket('**', () => {});
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const C = ctxC ? await ctxC.newPage() : null;
let deckId = null;
const NAME_A = ACCOUNTS ? 'Ada Integrator' : 'Ada Lovelace';

try {
  if (ACCOUNTS) {
    const email = `people-integrator-${Date.now()}@example.test`;
    say('signIn.A', await signIn(A, email));
    facts.emailA = email;
  }
  await A.goto('/new');
  await waitEditor(A);
  /* a draft holds no deck until its first write: the title first */
  const revision0 = await A.evaluate(() => window.turboslide.studio.describe().state.revision ?? 0);
  await invoke(A, 'deck.rename', {
    name: `People round pictures ${TAG}`,
    baseRevision: revision0,
  }).catch(() => null);
  await A.waitForTimeout(800);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => null);
  await waitEditor(A);
  deckId = (await invoke(A, 'deck.info')).id;
  say('deck.id', deckId);
  say(
    'account.A.boot',
    await A.evaluate(() => {
      const s = window.turboslide.studio.describe().state;
      return { account: s.account ?? null, self: s.presence?.self ?? null };
    }),
  );

  // the first edit and the name prompt (an anonymous person), else the account menu's Change name
  await typeInto(A, await headingRun(A), `People round, the surfaces (${TAG})`);
  const prompt = ctl(A, 'dialog.namePrompt');
  const prompted = await prompt.waitFor({ timeout: 6000 }).then(
    () => true,
    () => false,
  );
  say('namePrompt.firstEdit', prompted);
  if (prompted) {
    await ctl(A, 'dialog.namePrompt.name').fill('');
    await ctl(A, 'dialog.namePrompt.name').type(NAME_A, { delay: TYPE_DELAY });
    await ctl(A, 'dialog.namePrompt.continue').click();
    await A.waitForTimeout(800);
  }
  await settled(A);
  if (!prompted) {
    say(
      'setName.A',
      await invoke(A, 'account.setName', { name: NAME_A }).then(
        (r) => ({ ok: true, name: r.name, trust: r.trust }),
        (e) => ({ error: String(e) }),
      ),
    );
    await A.waitForTimeout(800);
  }
  say('ownChip.A.afterName', await chipFacts(A, '[data-control="title.presence"]'));

  // the picture (accounts): the seed's 1200 by 900 JPEG through the builder's Picture tab
  if (ACCOUNTS && want('builder')) {
    const picture = seed('picture', 'jpeg', '1200', '900', 'gradient');
    const jpeg = Buffer.from(picture.base64, 'base64');
    await A.keyboard.press('Escape');
    await ctl(A, 'title.account').click();
    await A.locator('#ts-menu-account').waitFor({ timeout: 8000 });
    await A.getByRole('menuitem', { name: 'Change avatar' }).click();
    await ctl(A, 'dialog.avatarBuilder').waitFor({ timeout: 8000 });
    await ctl(A, 'dialog.avatarBuilder.tab.picture').click();
    await ctl(A, 'dialog.avatarBuilder.panel.picture').waitFor({ timeout: 5000 });
    await inBothThemes(A, async (theme) => {
      say(
        `shot.builder.empty.${theme}`,
        await shotAround(A, ctl(A, 'dialog.avatarBuilder'), `builder-picture-empty-${theme}`, 24),
      );
    });
    await ctl(A, 'dialog.avatarBuilder.file').setInputFiles({
      name: 'seed-1200x900.jpg',
      mimeType: 'image/jpeg',
      buffer: jpeg,
    });
    await A.locator('[data-control="dialog.avatarBuilder.crop"][data-loaded="true"]').waitFor({
      timeout: 10_000,
    });
    const box = await ctl(A, 'dialog.avatarBuilder.crop').boundingBox();
    await A.mouse.move(box.x + 128, box.y + 128);
    await A.mouse.down();
    await A.mouse.move(box.x + 64, box.y + 128, { steps: 10 });
    await A.mouse.up();
    await A.waitForTimeout(300);
    await inBothThemes(A, async (theme) => {
      say(
        `shot.builder.loaded.${theme}`,
        await shotAround(A, ctl(A, 'dialog.avatarBuilder'), `builder-picture-loaded-${theme}`, 24),
      );
    });
    say(
      'builder.sentences',
      await A.evaluate(() => ({
        cap:
          document.querySelector('[data-control="dialog.avatarBuilder.capSentence"]')
            ?.textContent ?? null,
        privacy:
          document.querySelector('[data-control="dialog.avatarBuilder.privacySentence"]')
            ?.textContent ?? null,
        cache:
          document.querySelector('[data-control="dialog.avatarBuilder.cacheSentence"]')
            ?.textContent ?? null,
      })),
    );
    const t0 = Date.now();
    await ctl(A, 'dialog.avatarBuilder.apply').click();
    await ctl(A, 'dialog.avatarBuilder')
      .waitFor({ state: 'detached', timeout: 20_000 })
      .catch(() => null);
    const chip = await poll(async () => {
      const f = await chipFacts(A, '[data-control="title.account"]');
      return f?.[0]?.img?.src ? f : null;
    }, 10_000);
    say('upload.A', { ms: Date.now() - t0, chip: chip?.[0] ?? null });
  }

  // the deck opens to anyone with the link as an editor; B follows it
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  const linkUrl = opened.url;
  say('link', linkUrl ? 'minted' : 'none');
  if (ACCOUNTS) say('namesSwitch.off', await namesSwitch(A, deckId, false));
  await B.goto(linkUrl ?? `/edit/${deckId}`);
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 40_000 });
  await waitEditor(B);
  await poll(async () => ((await state(A)).presence?.others?.length ?? 0) >= 1, 40_000);
  await poll(async () => ((await state(B)).presence?.others?.length ?? 0) >= 1, 40_000);
  await A.waitForTimeout(1200);

  // C, a viewer by link (accounts): A as the role initial with the switch off, A's name and picture with it on
  if (ACCOUNTS && C && want('linkVisitor')) {
    await C.goto(linkUrl ?? `/edit/${deckId}`);
    await C.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 40_000 });
    await waitEditor(C);
    await poll(async () => ((await state(C)).presence?.others?.length ?? 0) >= 2, 40_000);
    await C.waitForTimeout(1000);
    say(
      'linkVisitor.C.off.presence',
      await C.evaluate(() =>
        (window.turboslide.studio.describe().state.presence?.others ?? []).map((p) => ({
          label: p.label,
          name: p.name ?? null,
          trust: p.trust,
          initials: p.mark?.initials ?? null,
          variant: p.mark?.variant ?? null,
          picture: p.mark?.pictureUrl ?? null,
        })),
      ),
    );
    say(
      'linkVisitor.C.off.identities',
      await C.evaluate(() =>
        Object.fromEntries(
          Object.entries(window.turboslide.studio.describe().state.identities ?? {}).map(
            ([k, v]) => [
              k,
              { label: v.label, name: v.name ?? null, trust: v.trust, email: v.email ?? null },
            ],
          ),
        ),
      ),
    );
    await inBothThemes(C, async (theme) => {
      say(
        `linkVisitor.C.off.chips.${theme}`,
        await chipFacts(C, '[data-control="title.presence"]'),
      );
      say(
        `shot.linkVisitor.off.${theme}`,
        await shotAround(C, ctl(C, 'title.presence'), `link-visitor-role-initial-${theme}`, 20),
      );
      say(
        `linkVisitor.C.off.tip.${theme}`,
        await chipTip(C, C.locator('[data-control^="presence.chip."]').first()),
      );
      await C.mouse.move(600, 500);
    });
    say('namesSwitch.on', await namesSwitch(A, deckId, true));
    await C.reload({ waitUntil: 'domcontentloaded' });
    await waitEditor(C);
    await poll(
      async () => ((await state(C)).presence?.others ?? []).some((p) => p.name === NAME_A),
      40_000,
    );
    await C.waitForTimeout(800);
    say(
      'linkVisitor.C.on.presence',
      await C.evaluate(() =>
        (window.turboslide.studio.describe().state.presence?.others ?? []).map((p) => ({
          label: p.label,
          name: p.name ?? null,
          trust: p.trust,
          picture: p.mark?.pictureUrl ?? null,
        })),
      ),
    );
    await inBothThemes(C, async (theme) => {
      say(`linkVisitor.C.on.chips.${theme}`, await chipFacts(C, '[data-control="title.presence"]'));
      say(
        `shot.linkVisitor.on.${theme}`,
        await shotAround(C, ctl(C, 'title.presence'), `link-visitor-names-on-${theme}`, 20),
      );
      say(
        `linkVisitor.C.on.tip.${theme}`,
        await chipTip(C, C.locator('[data-control^="presence.chip."]').first()),
      );
      await C.mouse.move(600, 500);
    });
  }

  await poll(async () => (await state(B)).presence?.others?.some((p) => p.name === NAME_A), 40_000);
  // two more edits by A so the version panel holds a window
  await typeInto(A, await headingRun(A), `People round, the surfaces (${TAG}), second edit`);
  await settled(A);
  await typeInto(A, await headingRun(A), `People round, the surfaces (${TAG}), third edit`);
  await settled(A);
  await A.keyboard.press('Escape');

  // ---- the title row slot and the own chip (the default view: no switch)
  if (want('slot')) {
    await inBothThemes(A, async (theme) => {
      say(`slot.A.${theme}`, await chipFacts(A, '[data-control="title.presence"]'));
      say(
        `shot.slot.A.${theme}`,
        await shotAround(A, ctl(A, 'title.presence'), `slot-A-${theme}`, 20),
      );
      say(
        `shot.zoom.own.${theme}`,
        await shotAround(A, ctl(A, 'title.account'), `zoom-own-chip-${theme}`, 6),
      );
      const other = A.locator('[data-control^="presence.chip."]').first();
      say(`shot.zoom.other.${theme}`, await shotAround(A, other, `zoom-other-chip-${theme}`, 6));
      say(`tooltip.A.${theme}`, await chipTip(A, other));
      say(
        `shot.tooltip.A.${theme}`,
        await A.screenshot({
          path: join(OUT, `${TAG}-tooltip-A-${theme}.png`),
          clip: { x: 560, y: 0, width: 880, height: 150 },
        }).then(() => join(OUT, `${TAG}-tooltip-A-${theme}.png`)),
      );
      await A.mouse.move(600, 500);
    });
    await inBothThemes(B, async (theme) => {
      say(`slot.B.${theme}`, await chipFacts(B, '[data-control="title.presence"]'));
      say(
        `shot.slot.B.${theme}`,
        await shotAround(B, ctl(B, 'title.presence'), `slot-B-${theme}`, 20),
      );
      say(
        `tooltip.B.${theme}`,
        await chipTip(B, B.locator('[data-control^="presence.chip."]').first()),
      );
      say(
        `shot.tooltip.B.${theme}`,
        await B.screenshot({
          path: join(OUT, `${TAG}-tooltip-B-${theme}.png`),
          clip: { x: 560, y: 0, width: 880, height: 150 },
        }).then(() => join(OUT, `${TAG}-tooltip-B-${theme}.png`)),
      );
      await B.mouse.move(600, 500);
    });
  }

  // ---- the roster in A (the own row and B's row) and in B
  if (want('roster')) {
    for (const [page, tag] of [
      [A, 'A'],
      [B, 'B'],
    ]) {
      await inBothThemes(page, async (theme) => {
        await openRoster(page);
        say(`roster.${tag}.${theme}`, await rosterFacts(page));
        say(`rosterChips.${tag}.${theme}`, await chipFacts(page, '#ts-menu-roster'));
        say(
          `shot.roster.${tag}.${theme}`,
          await shotMenu(page, '#ts-menu-roster', `roster-${tag}-${theme}`),
        );
        await page.keyboard.press('Escape');
      });
    }
  }

  // ---- the account menu head in A
  if (want('account'))
    await inBothThemes(A, async (theme) => {
      say(`accountMenu.A.${theme}`, await openAccountMenu(A));
      say(`accountChips.A.${theme}`, await chipFacts(A, '#ts-menu-account'));
      say(
        `shot.account.A.${theme}`,
        await shotMenu(A, '#ts-menu-account', `account-menu-A-${theme}`),
      );
      await A.keyboard.press('Escape');
    });

  // ---- the version panel in A with the window expanded, a row hovered and its More menu
  if (want('versions'))
    await inBothThemes(A, async (theme) => {
      await openVersions(A);
      const windowRow = A.locator('.ts-version-window-row').first();
      if ((await windowRow.count()) > 0) {
        if ((await windowRow.getAttribute('aria-expanded')) !== 'true') await windowRow.click();
        await A.waitForTimeout(400);
      }
      await A.mouse.move(600, 500);
      say(`versions.A.${theme}`, await versionsFacts(A));
      say(`versionChips.A.${theme}`, await chipFacts(A, '.ts-versions.is-history'));
      const panel = A.locator('[data-control="panel.versionHistory"]').first();
      say(`shot.versions.A.${theme}`, await shotAround(A, panel, `versions-A-${theme}`, 4));
      const older = A.locator('.ts-versions.is-history .ts-version:not(.is-current)').first();
      if ((await older.count()) > 0) {
        await older.hover();
        await A.waitForTimeout(400);
        say(
          `shot.versionsHover.A.${theme}`,
          await shotAround(A, panel, `versions-hover-A-${theme}`, 4),
        );
        await older.locator('.ts-version-more').first().click();
        await A.locator('#ts-menu-version-more')
          .waitFor({ timeout: 8000 })
          .catch(() => {});
        await A.waitForTimeout(300);
        say(
          `versionsMore.A.${theme}`,
          await A.evaluate(() =>
            [...document.querySelectorAll('#ts-menu-version-more [role="menuitem"]')].map((r) => ({
              id: r.getAttribute('data-menu-item'),
              text: (r.textContent ?? '').trim(),
            })),
          ),
        );
        say(
          `shot.versionsMore.A.${theme}`,
          await shotAround(A, panel, `versions-more-A-${theme}`, 4),
        );
        await A.keyboard.press('Escape');
        await A.waitForTimeout(200);
      }
      await A.keyboard.press('Escape');
      await A.mouse.move(600, 500);
    });

  // ---- a comment by A on the heading; B reads the panel row and the card
  if (want('comments')) {
    await A.keyboard.press('Escape');
    await A.locator('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="heading/text"]')
      .first()
      .click();
    await A.keyboard.press('ControlOrMeta+Alt+m');
    const card = A.locator('[data-control="comment.card"]');
    await card.waitFor({ timeout: 10_000 });
    await card
      .locator('[data-control="comment.card.new.field"]')
      .fill('Can you check the title on this slide?');
    await card.locator('[data-control="comment.card.new.submit"]').click();
    await poll(async () => ((await state(A)).comments?.threads?.length ?? 0) >= 1, 20_000);
    await A.keyboard.press('Escape');
    const threadsB = await poll(async () => {
      const t = (await state(B)).comments?.threads ?? [];
      return t.length >= 1 ? t : null;
    }, 30_000);
    const firstId = threadsB?.[0]?.id;
    await inBothThemes(B, async (theme) => {
      await B.keyboard.press('Escape');
      await ctl(B, 'title.comments').click();
      await B.locator('[data-control="panel.comments"]').first().waitFor({ timeout: 10_000 });
      await B.waitForTimeout(400);
      say(
        `commentsPanel.B.${theme}`,
        await B.evaluate(() =>
          [...document.querySelectorAll('[data-control^="panel.comments.open."]')].map((r) => ({
            text: (r.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
            chip: r.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
            badge: r.querySelector('.ts-trust-mark')?.getAttribute('aria-label') ?? null,
          })),
        ),
      );
      say(
        `shot.commentsPanel.B.${theme}`,
        await shotAround(
          B,
          B.locator('[data-control="panel.comments"]').first(),
          `comments-panel-B-${theme}`,
          4,
        ),
      );
      if (firstId)
        await ctl(B, `panel.comments.open.${firstId}`)
          .click()
          .catch(() => {});
      await B.waitForTimeout(500);
      const cardB = B.locator('[data-control="comment.card"]');
      if ((await cardB.count()) > 0) {
        say(
          `commentCard.B.${theme}`,
          await B.evaluate(() => {
            const c = document.querySelector('[data-control="comment.card"]');
            return c
              ? {
                  name: c.querySelector('.ts-comment-name')?.textContent,
                  trust: c.querySelector('.ts-comment-trust')?.textContent ?? null,
                  badge: c.querySelector('.ts-trust-mark')?.getAttribute('aria-label') ?? null,
                  chip: c.querySelector('.ts-chip')?.getAttribute('aria-label'),
                }
              : null;
          }),
        );
        say(
          `shot.commentCard.B.${theme}`,
          await shotAround(B, cardB, `comment-card-B-${theme}`, 12),
        );
      }
      await B.keyboard.press('Escape');
      await ctl(B, 'title.comments')
        .click()
        .catch(() => {});
      await B.waitForTimeout(300);
    });
  }

  // ---- the Share dialog: in A (You), then in B (the owner row reads A)
  if (want('share'))
    for (const [page, tag] of [
      [A, 'A'],
      [B, 'B'],
    ]) {
      await inBothThemes(page, async (theme) => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        await ctl(page, 'share.open').click();
        const shown = await ctl(page, 'dialog.share')
          .waitFor({ timeout: 10_000 })
          .then(
            () => true,
            () => false,
          );
        if (!shown) {
          say(
            `share.${tag}.${theme}`,
            'not driven: the Share dialog did not open within 10 s of share.open',
          );
          await page.keyboard.press('Escape');
          return;
        }
        await page.waitForTimeout(600);
        say(
          `share.${tag}.${theme}`,
          await page.evaluate(() =>
            [...document.querySelectorAll('[data-control="dialog.share"] .ts-share-row')].map(
              (row) => ({
                control: row.getAttribute('data-control'),
                name: row.querySelector('.ts-share-row-name')?.textContent ?? null,
                title: row.querySelector('[title]')?.getAttribute('title') ?? null,
                email: row.querySelector('.ts-share-row-email')?.textContent ?? null,
                trust: row.querySelector('.ts-share-row-trust')?.textContent ?? null,
                badge: row.querySelector('.ts-trust-mark')?.getAttribute('aria-label') ?? null,
                chip: row.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
              }),
            ),
          ),
        );
        say(`shareChips.${tag}.${theme}`, await chipFacts(page, '[data-control="dialog.share"]'));
        say(
          `shot.share.${tag}.${theme}`,
          await shotAround(page, ctl(page, 'dialog.share'), `share-${tag}-${theme}`, 12),
        );
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      });
    }

  // ---- the Profile head in A (an account: Sessions opens it)
  if (want('profile'))
    await inBothThemes(A, async (theme) => {
      await A.keyboard.press('Escape');
      await openAccountMenu(A);
      const sessions = ctl(A, 'account.sessions');
      if ((await sessions.count()) === 0) {
        say(
          `profile.A.${theme}`,
          'no Sessions row (anonymous): the Profile head is an account surface',
        );
        await A.keyboard.press('Escape');
        return;
      }
      await sessions.click();
      await ctl(A, 'dialog.profile').waitFor({ timeout: 8000 });
      await A.waitForTimeout(300);
      say(
        `profileHead.A.${theme}`,
        await A.evaluate(() => {
          const h = document.querySelector('[data-control="dialog.profile.head"]');
          return h
            ? {
                text: (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
                badge: h.querySelector('.ts-trust-mark')?.getAttribute('aria-label') ?? null,
                img: h.querySelector('img.ts-chip-picture')?.getAttribute('src') ?? null,
              }
            : null;
        }),
      );
      say(
        `shot.profileHead.A.${theme}`,
        await shotAround(A, ctl(A, 'dialog.profile.head'), `profile-head-A-${theme}`, 8),
      );
      await A.keyboard.press('Escape');
      await A.waitForTimeout(300);
    });

  // ---- the filmstrip's 16 px chips in A
  await A.keyboard.press('Escape');
  if (want('filmstrip')) {
    say('filmstripChips.A', await chipFacts(A, '.ts-card-marks'));
    const marks = A.locator('.ts-card-marks').first();
    if ((await marks.count()) > 0)
      say('shot.filmstrip.A', await shotAround(A, marks, 'filmstrip-marks-A-light', 8));
  }
  say('uptime.end', execFileSync('uptime', { encoding: 'utf8' }).trim());
} catch (error) {
  say('error', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  process.exitCode = 1;
} finally {
  if (deckId !== null) {
    /* by the id, never a sweep: the trash and the delete forever each base on the revision read a
       moment before (deck.trash and deck.remove want baseRevision; deck.remove wants confirm) */
    try {
      const revision = async () => (await invoke(A, 'deck.info', {})).revision ?? 0;
      /* on the blob tier the window API's revision can lag the store's ("baseRevision 4 is stale;
         <id> is at revision 6", preview 7's shoot, the deck then removed by hand through the agent
         surface): a stale refusal names the store's revision and the write is retried once with it */
      const write = async (action, input) => {
        const attempt = (base) =>
          invoke(A, action, { ...input, baseRevision: base }).then(
            () => `${action} ok at ${base}`,
            (e) => {
              const stale = /is at revision (\d+)/.exec(String(e));
              return stale ? { retry: Number(stale[1]) } : `${action}: ${String(e).slice(0, 160)}`;
            },
          );
        const first = await attempt(await revision());
        return typeof first === 'string' ? first : attempt(first.retry);
      };
      const trashed = await write('deck.trash', { id: deckId });
      const removed = await write('deck.remove', { id: deckId, confirm: true });
      const after = await invoke(A, 'deck.info', {}).then(
        () => 'still answers',
        (e) => `gone: ${String(e).slice(0, 80)}`,
      );
      say('deck.teardown', { deckId, trashed, removed, after });
    } catch (error) {
      say('deck.removeError', String(error));
    }
  }
  writeFileSync(join(OUT, `${TAG}-facts.json`), JSON.stringify(facts, null, 2));
  await browser.close();
}
