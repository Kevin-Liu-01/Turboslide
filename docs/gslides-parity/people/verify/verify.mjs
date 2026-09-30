// The verifier's hand drive of every people surface (docs/PEOPLE.md 6.3; the verifier's prompt of
// 2026-09-29: two browser contexts in both appearances at 1440 and 1280, the pictures under
// docs/gslides-parity/focus/verification/people-*). Extended from the integrator's shoot
// (build/integrator/shoot.mjs), which extended B2's. Two modes:
//   node docs/gslides-parity/people/verify/verify.mjs --base <preview> --tag preview --width 1440
//     two anonymous browsers on one scratch deck: A named through the name prompt, B a label by
//     the editor link; the title row slot and the own chip, the chip tooltips, the roster, the
//     account menu, the builder's strip and its Picture tab (the anonymous sentence), the version
//     panel (a window expanded, a row hovered, its More menu), the caret flag of B in A, the
//     comment card, the panel row and the marker in B, the Share dialog in A and B, the filmstrip.
//   node .../verify.mjs --base http://localhost:4467 --tag local --width 1440 --accounts --auth-db <sqlite> --overlay <dir>
//     A makes the deck anonymously and types its name, then signs in with the captured code (the
//     alias path: the deck's owner is the anonymous id, the session the account), reloads and is
//     read as one id; the cap refusal with toBlob stubbed to a 600 KB blob; the upload of the
//     seed's 1200 by 900 JPEG; B anonymous by the link reads A's picture with the owner's names
//     switch on; C a viewer by link reads A as the role initial with the switch off; the fallback
//     plate after the key's folder is removed, read by a fresh context with A's cookies; the
//     Profile head. --signin-first signs A in before the deck (the integrator's flow).
// The preview's authentication rides the OIDC header when VERCEL_OIDC_TOKEN is in the environment
// (the token wrapper reads it in and prints nothing); the deck is trashed and deleted forever by
// its id in a finally block; the facts land in <out>/people-<tag>-<width>-facts.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
const WIDTH = Number(argOf('--width', '1440'));
const HEIGHT = 900;
const ONLY = argOf('--only', '').split(',').filter(Boolean);
const want = (section) => ONLY.length === 0 || ONLY.includes(section);
const BASE = argOf('--base', 'http://localhost:4467').replace(/\/$/, '');
const OUT = argOf('--out', `${ROOT}/docs/gslides-parity/focus/verification`);
const ACCOUNTS = args.includes('--accounts');
const SIGNIN_FIRST = args.includes('--signin-first');
const AUTH_DB = argOf('--auth-db', `${ROOT}/.turboslide/auth-verifier.sqlite`);
const OVERLAY = argOf('--overlay', `${ROOT}/.turboslide/overlay-verifier`);
const SEED = `${ROOT}/apps/studio/e2e/identity-seed.mts`;
const PREFIX = `people-${TAG}-${WIDTH}`;
mkdirSync(OUT, { recursive: true });
const TYPE_DELAY = 40;
const facts = {
  base: BASE,
  tag: TAG,
  width: WIDTH,
  accounts: ACCOUNTS,
  signinFirst: SIGNIN_FIRST,
  startedAt: new Date().toISOString(),
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

const shotPath = (name) => join(OUT, `${PREFIX}-${name}.png`);

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
  const path = shotPath(name);
  await page.screenshot({ path, ...(clip ? { clip } : {}) });
  return path;
}

async function shotMenu(page, selector, name) {
  const menu = page.locator(selector).first();
  const mb = await menu.boundingBox();
  const vp = page.viewportSize();
  const path = shotPath(name);
  await page.screenshot({
    path,
    clip: {
      x: Math.max(0, mb.x - 260),
      y: 0,
      width: Math.min(vp.width - Math.max(0, mb.x - 260), mb.width + 300),
      height: Math.min(vp.height, mb.y + mb.height + 16),
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
        hue: chip.getAttribute('data-hue'),
        picture: chip.getAttribute('data-picture'),
        box: { w: r.width, h: r.height },
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        padding: cs.paddingTop,
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
                alt: field.getAttribute('alt'),
                natural: { w: field.naturalWidth, h: field.naturalHeight },
              }
            : null,
        stripe: s
          ? {
              l: s.left - r.left,
              r: r.right - s.right,
              b: r.bottom - s.bottom,
              h: s.height,
              color: getComputedStyle(stripe).backgroundColor,
            }
          : null,
        cells: chip.querySelectorAll('rect').length,
        initials: chip.querySelector('.ts-chip-initials')?.textContent ?? null,
        badgeAfter:
          chip.parentElement?.querySelector('.ts-trust-mark')?.getAttribute('aria-label') ?? null,
      };
    });
  }, rootSelector);
}

/** The geometry rule of PEOPLE.md 3.4 over a chipFacts list: the field 2 px inside on every side, the stripe 2 px from the outer edge. */
function geometryOf(chips) {
  if (!chips) return null;
  return chips.map((c) => {
    const size = Number(c.box?.w ?? 0);
    const want = size >= 12 ? 2 : null;
    const fieldOk =
      c.field && want !== null
        ? [c.field.l, c.field.t, c.field.r, c.field.b].every((v) => Math.abs(v - want) < 0.6) &&
          Math.abs(c.field.w - (size - 4)) < 0.6 &&
          Math.abs(c.field.h - (size - 4)) < 0.6
        : null;
    const stripeOk = c.stripe
      ? [c.stripe.l, c.stripe.r, c.stripe.b].every((v) => Math.abs(v - 2) < 0.6)
      : null;
    return { holder: c.holder, size, fieldOk, stripeOk, border: c.border };
  });
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
      title:
        row.getAttribute('title') ?? row.querySelector('[title]')?.getAttribute('title') ?? null,
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
      panelWidth: panelBox.width,
      rows: [...panel.querySelectorAll('.ts-version')].map((row) => {
        const meta = row.querySelector('.ts-version-meta');
        const restore = row.querySelector('.ts-version-restore');
        return {
          author: row.getAttribute('data-author'),
          inWindow: row.classList.contains('is-in-window'),
          current: row.classList.contains('is-current'),
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
        marksWidth: row.querySelector('.ts-version-marks')?.getBoundingClientRect().width ?? null,
        more: row.querySelector('.ts-version-marks-more')?.textContent ?? null,
        moreFont: (() => {
          const m = row.querySelector('.ts-version-marks-more');
          return m ? getComputedStyle(m).fontSize : null;
        })(),
        hoverBackground: getComputedStyle(row).backgroundColor,
      })),
      nested: (() => {
        const nested = panel.querySelector('.ts-versions-list.is-window');
        return nested
          ? {
              ruleX: nested.getBoundingClientRect().left - panelBox.left,
              marginLeft: getComputedStyle(nested).marginLeft,
              paddingLeft: getComputedStyle(nested).paddingLeft,
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

async function openBuilder(page) {
  await page.keyboard.press('Escape');
  await ctl(page, 'title.account').click();
  await page.locator('#ts-menu-account').waitFor({ timeout: 8000 });
  await page.getByRole('menuitem', { name: 'Change avatar' }).click();
  await ctl(page, 'dialog.avatarBuilder').waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
}

function builderFacts(page) {
  return page.evaluate(() => {
    const d = document.querySelector('[data-control="dialog.avatarBuilder"]');
    if (!d) return null;
    const text = (sel) => d.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    return {
      tabs: [...d.querySelectorAll('[data-control^="dialog.avatarBuilder.tab."]')].map((t) => ({
        id: t.getAttribute('data-control'),
        selected: t.getAttribute('aria-selected') ?? t.getAttribute('aria-pressed'),
      })),
      panel:
        [...d.querySelectorAll('[data-control^="dialog.avatarBuilder.panel."]')]
          .map((p) => p.getAttribute('data-control'))
          .join(',') || null,
      cap: text('[data-control="dialog.avatarBuilder.capSentence"]'),
      privacy: text('[data-control="dialog.avatarBuilder.privacySentence"]'),
      cache: text('[data-control="dialog.avatarBuilder.cacheSentence"]'),
      error: text('[data-control="dialog.avatarBuilder.error"]'),
      applyDisabled:
        d.querySelector('[data-control="dialog.avatarBuilder.apply"]')?.disabled ?? null,
      cropLoaded:
        d
          .querySelector('[data-control="dialog.avatarBuilder.crop"]')
          ?.getAttribute('data-loaded') ?? null,
      cropSentence: text(
        '.ts-avatar-crop-sentence, [data-control="dialog.avatarBuilder.cropSentence"]',
      ),
      signInSentence: text('[data-control="dialog.avatarBuilder.panel.picture"] p'),
      previewSizes: [
        ...d.querySelectorAll('.ts-avatar-strip .ts-chip, .ts-avatar-preview .ts-chip'),
      ].map((c) => c.getAttribute('data-size')),
    };
  });
}

async function openVersions(page) {
  await page.keyboard.press('Escape');
  await ctl(page, 'deck.lastEdit').click();
  await page.locator('.ts-versions.is-history').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
}

/** Whatever dialog stands open on the page (its scrim intercepts every click): recorded by id, then dismissed. */
async function closeDialogs(page, key) {
  const open = await page.evaluate(() => {
    const scrim = document.querySelector('.ts-dialog-scrim');
    const dialogs = [...document.querySelectorAll('[data-control^="dialog."]')]
      .filter((d) => !d.hidden && d.getBoundingClientRect().width > 0)
      .map((d) => d.getAttribute('data-control'));
    return { scrim: Boolean(scrim), dialogs };
  });
  const visible = () =>
    page.evaluate(() => ({
      scrim: Boolean(document.querySelector('.ts-dialog-scrim')),
      dialogs: [...document.querySelectorAll('[data-control^="dialog."]')]
        .filter((d) => !d.hidden && d.getBoundingClientRect().width > 0)
        .map((d) => d.getAttribute('data-control'))
        .filter((id) => id !== null && id.split('.').length === 2),
    }));
  if (open.scrim || open.dialogs.length > 0) {
    say(key, open);
    for (let i = 0; i < 3; i += 1) {
      const close = page.locator('[data-control="dialog.namePrompt.close"]').first();
      if ((await close.count()) > 0 && (await close.isVisible().catch(() => false)))
        await close.click({ timeout: 2000 }).catch(() => null);
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const now = await visible();
      if (!now.scrim && now.dialogs.length === 0) {
        say(`${key}.closed`, { after: i + 1 });
        return open;
      }
    }
    const scrim = page.locator('.ts-dialog-scrim').first();
    if ((await scrim.count()) > 0)
      await scrim.click({ position: { x: 4, y: 4 } }).catch(() => null);
    await page.waitForTimeout(300);
    say(`${key}.afterEscape`, await visible());
  }
  return open;
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

function accountFacts(page) {
  return page.evaluate(() => {
    const s = window.turboslide.studio.describe().state;
    const a = s.account ?? null;
    return {
      account: a
        ? {
            signedIn: a.signedIn ?? null,
            principalId: a.principalId ?? a.principal?.principalId ?? null,
            trust: a.trust ?? a.principal?.trust ?? null,
            label: a.label ?? a.principal?.label ?? null,
            name: a.name ?? a.principal?.name ?? null,
            email: a.email ?? a.principal?.email ?? null,
            markVariant: a.mark?.variant ?? null,
            pictureUrl: a.mark?.pictureUrl ?? a.pictureUrl ?? null,
          }
        : null,
      self: s.presence?.self
        ? {
            principalId: s.presence.self.principalId ?? null,
            trust: s.presence.self.trust ?? null,
            label: s.presence.self.label ?? null,
            name: s.presence.self.name ?? null,
            markVariant: s.presence.self.mark?.variant ?? null,
          }
        : null,
      access: s.access ? { role: s.access.role, via: s.access.via } : null,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const mk = (theme = 'light', storageState) =>
  browser.newContext({
    baseURL: BASE,
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    colorScheme: theme,
    extraHTTPHeaders: HEADERS,
    ...(storageState ? { storageState } : {}),
  });
const ctxA = await mk();
const ctxB = await mk();
const ctxC = ACCOUNTS ? await mk() : null;
for (const ctx of [ctxA, ctxB, ctxC]) if (ctx) await ctx.routeWebSocket('**', () => {});
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const C = ctxC ? await ctxC.newPage() : null;
let deckId = null;
const NAME_A = ACCOUNTS ? 'Ada Verifier' : 'Ada Lovelace';
let pictureKey = null;

try {
  if (ACCOUNTS && SIGNIN_FIRST) {
    const email = `people-verifier-${Date.now()}@example.test`;
    say('signIn.A.first', await signIn(A, email));
    facts.emailA = email;
  }
  await A.goto('/new');
  await waitEditor(A);
  /* a draft holds no deck until its first write: the title first */
  const revision0 = await A.evaluate(() => window.turboslide.studio.describe().state.revision ?? 0);
  await invoke(A, 'deck.rename', {
    name: `People verify ${TAG} ${WIDTH}`,
    baseRevision: revision0,
  }).catch(() => null);
  await A.waitForTimeout(800);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => null);
  await waitEditor(A);
  deckId = (await invoke(A, 'deck.info')).id;
  say('deck.id', deckId);
  say('account.A.boot', await accountFacts(A));

  // the first edit and the name prompt (an anonymous person), else the account menu's Change name
  await typeInto(A, await headingRun(A), `People verify, the surfaces (${TAG} ${WIDTH})`);
  const prompt = ctl(A, 'dialog.namePrompt');
  const prompted = await prompt.waitFor({ timeout: 6000 }).then(
    () => true,
    () => false,
  );
  say('namePrompt.firstEdit', prompted);
  if (prompted) {
    await inBothThemes(A, async (theme) => {
      say(`shot.namePrompt.${theme}`, await shotAround(A, prompt, `name-prompt-A-${theme}`, 16));
    });
    await ctl(A, 'dialog.namePrompt.name').fill('');
    await ctl(A, 'dialog.namePrompt.name').type(NAME_A, { delay: TYPE_DELAY });
    const t0 = Date.now();
    await ctl(A, 'dialog.namePrompt.continue').click();
    const chipNamed = await poll(async () => {
      const f = await chipFacts(A, '[data-control="title.account"]');
      return f?.[0]?.ariaLabel?.includes(NAME_A) ? f : null;
    }, 5000);
    say('ownChip.A.afterContinue', { ms: Date.now() - t0, chip: chipNamed?.[0] ?? null });
    await A.waitForTimeout(400);
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
  say('account.A.afterName', await accountFacts(A));
  say('ownChip.A.afterName', await chipFacts(A, '[data-control="title.presence"]'));

  // the alias path (accounts): A signs in after the deck and the name, reloads and is one id
  if (ACCOUNTS && !SIGNIN_FIRST) {
    const email = `people-verifier-${Date.now()}@example.test`;
    facts.emailA = email;
    say('signIn.A.afterDeck', await signIn(A, email));
    await A.reload({ waitUntil: 'domcontentloaded' });
    await waitEditor(A);
    await settled(A);
    const after = await accountFacts(A);
    say('account.A.afterSignIn', after);
    say('ownChip.A.afterSignIn', await chipFacts(A, '[data-control="title.presence"]'));
    if (after.account && !after.account.name) {
      say(
        'setName.A.afterSignIn',
        await invoke(A, 'account.setName', { name: NAME_A }).then(
          (r) => ({ ok: true, name: r.name, trust: r.trust }),
          (e) => ({ error: String(e) }),
        ),
      );
      await A.waitForTimeout(800);
      say('account.A.afterSignInName', await accountFacts(A));
    }
    await openVersions(A);
    say('versions.A.afterSignIn', await versionsFacts(A));
    say('versionChips.A.afterSignIn', await chipFacts(A, '.ts-versions.is-history'));
    await A.keyboard.press('Escape');
  }

  // the builder (anonymous on a preview: the strip and the Picture tab's sentence; accounts: the
  // cap refusal with toBlob stubbed, then the seed's 1200 by 900 JPEG)
  if (want('builder')) {
    await openBuilder(A);
    say('builder.A.open', await builderFacts(A));
    await inBothThemes(A, async (theme) => {
      say(
        `shot.builder.strip.${theme}`,
        await shotAround(A, ctl(A, 'dialog.avatarBuilder'), `builder-strip-A-${theme}`, 24),
      );
    });
    await ctl(A, 'dialog.avatarBuilder.tab.picture').click();
    await ctl(A, 'dialog.avatarBuilder.panel.picture')
      .waitFor({ timeout: 5000 })
      .catch(() => null);
    say('builder.A.picture', await builderFacts(A));
    await inBothThemes(A, async (theme) => {
      say(
        `shot.builder.picture.${theme}`,
        await shotAround(A, ctl(A, 'dialog.avatarBuilder'), `builder-picture-A-${theme}`, 24),
      );
    });
    if (ACCOUNTS) {
      const picture = seed('picture', 'jpeg', '1200', '900', 'gradient');
      const jpeg = Buffer.from(picture.base64, 'base64');
      // the cap refusal: toBlob answers a 600 KB blob, the dialog refuses before a request leaves
      await A.evaluate(() => {
        window.__tsToBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (cb, type) {
          cb(new Blob([new Uint8Array(600 * 1024)], { type: type || 'image/webp' }));
        };
      });
      let setAvatarRequests = 0;
      const onRequest = (req) => {
        if (/account\.setAvatar/.test(req.url())) setAvatarRequests += 1;
      };
      A.on('request', onRequest);
      await ctl(A, 'dialog.avatarBuilder.file').setInputFiles({
        name: 'seed-1200x900.jpg',
        mimeType: 'image/jpeg',
        buffer: jpeg,
      });
      await A.locator('[data-control="dialog.avatarBuilder.crop"][data-loaded="true"]').waitFor({
        timeout: 10_000,
      });
      await ctl(A, 'dialog.avatarBuilder.apply').click();
      const errorText = await poll(async () => {
        const f = await builderFacts(A);
        return f?.error ? f.error : null;
      }, 8000);
      await A.waitForTimeout(500);
      say('capRefusal.A', {
        error: errorText,
        setAvatarRequests,
        dialogOpen: (await ctl(A, 'dialog.avatarBuilder').count()) > 0,
      });
      await inBothThemes(A, async (theme) => {
        say(
          `shot.capRefusal.${theme}`,
          await shotAround(A, ctl(A, 'dialog.avatarBuilder'), `builder-cap-refusal-A-${theme}`, 24),
        );
      });
      A.off('request', onRequest);
      await A.evaluate(() => {
        if (window.__tsToBlob) HTMLCanvasElement.prototype.toBlob = window.__tsToBlob;
      });
      // the real upload: drag the picture 64 px under the box, Apply
      const box = await ctl(A, 'dialog.avatarBuilder.crop').boundingBox();
      await A.mouse.move(box.x + 128, box.y + 128);
      await A.mouse.down();
      await A.mouse.move(box.x + 64, box.y + 128, { steps: 10 });
      await A.mouse.up();
      await A.waitForTimeout(300);
      say('builder.A.loaded', await builderFacts(A));
      await inBothThemes(A, async (theme) => {
        say(
          `shot.builder.loaded.${theme}`,
          await shotAround(
            A,
            ctl(A, 'dialog.avatarBuilder'),
            `builder-picture-loaded-A-${theme}`,
            24,
          ),
        );
      });
      let requestBytes = null;
      const onUpload = (req) => {
        if (/account\.setAvatar/.test(req.url())) requestBytes = (req.postData() ?? '').length;
      };
      A.on('request', onUpload);
      const t0 = Date.now();
      await ctl(A, 'dialog.avatarBuilder.apply').click();
      await ctl(A, 'dialog.avatarBuilder')
        .waitFor({ state: 'detached', timeout: 20_000 })
        .catch(() => null);
      const chip = await poll(async () => {
        const f = await chipFacts(A, '[data-control="title.account"]');
        return f?.[0]?.img?.src ? f : null;
      }, 10_000);
      A.off('request', onUpload);
      const src = chip?.[0]?.img?.src ?? null;
      const m = src ? /\/u\/([A-Za-z0-9_-]{22})\/([0-9a-f]{64})-64\.webp$/.exec(src) : null;
      pictureKey = m ? m[1] : null;
      say('upload.A', {
        ms: Date.now() - t0,
        requestBytes,
        chip: chip?.[0] ?? null,
        grammar: Boolean(m),
        key: pictureKey,
      });
      say('account.A.afterUpload', await accountFacts(A));
    } else {
      await A.keyboard.press('Escape');
      await ctl(A, 'dialog.avatarBuilder')
        .waitFor({ state: 'detached', timeout: 5000 })
        .catch(() => null);
    }
  }

  // the deck opens to anyone with the link as an editor; B follows it
  const share = await invoke(A, 'share.get', { id: deckId }).catch((e) => ({ error: String(e) }));
  say(
    'share.get.A',
    share.error
      ? share
      : { revision: share.record?.revision ?? share.revision, owner: share.record?.owner ?? null },
  );
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  }).catch((e) => ({ error: String(e) }));
  const linkUrl = opened.url ?? null;
  say('link', opened.error ? opened : linkUrl ? 'minted' : 'none');
  if (ACCOUNTS) say('namesSwitch.off', await namesSwitch(A, deckId, false));
  await B.goto(linkUrl ?? `/edit/${deckId}`);
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 40_000 }).catch(() => null);
  await waitEditor(B);
  say('account.B.boot', await accountFacts(B));
  await poll(async () => ((await state(A)).presence?.others?.length ?? 0) >= 1, 40_000);
  await poll(async () => ((await state(B)).presence?.others?.length ?? 0) >= 1, 40_000);
  await A.waitForTimeout(1200);

  // C, a viewer by link (accounts): A as the role initial with the switch off, A's name and picture with it on
  if (ACCOUNTS && C && want('linkVisitor')) {
    await C.goto(linkUrl ?? `/edit/${deckId}`);
    await C.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 40_000 }).catch(() => null);
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
    await inBothThemes(C, async (theme) => {
      const chips = await chipFacts(C, '[data-control="title.presence"]');
      say(`linkVisitor.C.off.chips.${theme}`, chips);
      say(
        `shot.linkVisitor.off.${theme}`,
        await shotAround(C, ctl(C, 'title.presence'), `link-visitor-role-initial-C-${theme}`, 20),
      );
      say(
        `linkVisitor.C.off.tip.${theme}`,
        await chipTip(C, C.locator('[data-control^="presence.chip."]').first()),
      );
      await C.mouse.move(600, 500);
    });
    // B (an editor by link) with the switch off reads A the same way
    say('linkEditor.B.off.chips', await chipFacts(B, '[data-control="title.presence"]'));
    say('namesSwitch.on', await namesSwitch(A, deckId, true));
    await C.reload({ waitUntil: 'domcontentloaded' });
    await waitEditor(C);
    await poll(
      async () => ((await state(C)).presence?.others ?? []).some((p) => p.name === NAME_A),
      40_000,
    );
    await C.waitForTimeout(800);
    await inBothThemes(C, async (theme) => {
      say(`linkVisitor.C.on.chips.${theme}`, await chipFacts(C, '[data-control="title.presence"]'));
      say(
        `shot.linkVisitor.on.${theme}`,
        await shotAround(C, ctl(C, 'title.presence'), `link-visitor-names-on-C-${theme}`, 20),
      );
      say(
        `linkVisitor.C.on.tip.${theme}`,
        await chipTip(C, C.locator('[data-control^="presence.chip."]').first()),
      );
      await C.mouse.move(600, 500);
    });
    await B.reload({ waitUntil: 'domcontentloaded' });
    await waitEditor(B);
    await poll(
      async () => ((await state(B)).presence?.others ?? []).some((p) => p.name === NAME_A),
      40_000,
    );
    const t1 = Date.now();
    const otherChipB = await poll(async () => {
      const f = await chipFacts(B, '[data-control="title.presence"]');
      const a = (f ?? []).find((c) => c.holder?.startsWith('presence.chip.'));
      return a?.img?.src ? a : null;
    }, 10_000);
    say('otherChip.B.pictureOfA', {
      ms: Date.now() - t1,
      chip: otherChipB ?? null,
      sameKey: otherChipB?.img?.src?.includes(pictureKey ?? '@@') ?? false,
    });
  }

  await poll(async () => (await state(B)).presence?.others?.some((p) => p.name === NAME_A), 40_000);
  // two more edits by A so the version panel holds a window
  await typeInto(
    A,
    await headingRun(A),
    `People verify, the surfaces (${TAG} ${WIDTH}), second edit`,
  );
  await settled(A);
  await typeInto(
    A,
    await headingRun(A),
    `People verify, the surfaces (${TAG} ${WIDTH}), third edit`,
  );
  await settled(A);
  await A.keyboard.press('Escape');

  // ---- the title row slot and the own chip (the default view: no switch)
  if (want('slot')) {
    await inBothThemes(A, async (theme) => {
      const chips = await chipFacts(A, '[data-control="title.presence"]');
      say(`slot.A.${theme}`, chips);
      say(`geometry.slot.A.${theme}`, geometryOf(chips));
      say(
        `shot.slot.A.${theme}`,
        await shotAround(A, ctl(A, 'title.presence'), `slot-A-${theme}`, 20),
      );
      say(
        `shot.zoom.own.${theme}`,
        await shotAround(A, ctl(A, 'title.account'), `zoom-own-chip-A-${theme}`, 6),
      );
      const other = A.locator('[data-control^="presence.chip."]').first();
      say(`shot.zoom.other.${theme}`, await shotAround(A, other, `zoom-other-chip-A-${theme}`, 6));
      say(`tooltip.A.${theme}`, await chipTip(A, other));
      const clip = { x: Math.max(0, WIDTH - 880), y: 0, width: 880, height: 150 };
      await A.screenshot({ path: shotPath(`tooltip-A-${theme}`), clip });
      say(`shot.tooltip.A.${theme}`, shotPath(`tooltip-A-${theme}`));
      await A.mouse.move(600, 500);
      await A.waitForTimeout(300);
      say(`tooltip.own.A.${theme}`, await chipTip(A, ctl(A, 'title.account')));
      await A.mouse.move(600, 500);
    });
    await inBothThemes(B, async (theme) => {
      const chips = await chipFacts(B, '[data-control="title.presence"]');
      say(`slot.B.${theme}`, chips);
      say(`geometry.slot.B.${theme}`, geometryOf(chips));
      say(
        `shot.slot.B.${theme}`,
        await shotAround(B, ctl(B, 'title.presence'), `slot-B-${theme}`, 20),
      );
      say(
        `tooltip.B.${theme}`,
        await chipTip(B, B.locator('[data-control^="presence.chip."]').first()),
      );
      const clip = { x: Math.max(0, WIDTH - 880), y: 0, width: 880, height: 150 };
      await B.screenshot({ path: shotPath(`tooltip-B-${theme}`), clip });
      say(`shot.tooltip.B.${theme}`, shotPath(`tooltip-B-${theme}`));
      await B.mouse.move(600, 500);
    });
  }

  // ---- the caret flag: B types in the heading, A reads B's caret and flag
  if (want('flag')) {
    const clientB = (await state(B)).presence?.clientId ?? null;
    const run = await headingRun(B);
    const el = B.locator(
      `.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`,
    ).first();
    await el.dblclick();
    await B.waitForTimeout(200);
    await B.keyboard.press('End');
    await B.keyboard.type(' flag', { delay: 60 });
    const caret = A.locator(`.ts-remote-caret[data-client="${clientB}"]`).first();
    const drawn = await caret.waitFor({ timeout: 10_000 }).then(
      () => true,
      () => false,
    );
    await inBothThemes(A, async (theme) => {
      say(
        `flag.A.${theme}`,
        await A.evaluate((id) => {
          const caret = document.querySelector(`.ts-remote-caret[data-client="${id}"]`);
          const flag = document.querySelector(
            `.ts-flag[data-client="${id}"], .ts-remote-caret-group .ts-flag`,
          );
          const chip = document.querySelector(`[data-control="presence.chip.${id}"] .ts-chip`);
          return {
            caret: caret ? getComputedStyle(caret).backgroundColor : null,
            flagText: flag ? (flag.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
            flagBackground: flag ? getComputedStyle(flag).backgroundColor : null,
            flagChip: flag?.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
            flagChipSize: flag?.querySelector('.ts-chip')?.getAttribute('data-size') ?? null,
            flagBadge: flag?.querySelector('.ts-trust-mark') ? 'badge in flag' : null,
            chipHue: chip?.getAttribute('data-hue') ?? null,
            stripe: chip?.querySelector('.ts-chip-stripe')
              ? getComputedStyle(chip.querySelector('.ts-chip-stripe')).backgroundColor
              : null,
          };
        }, clientB),
      );
      const stage = A.locator('.ts-stagewrap.ts-editor').first();
      say(`shot.flag.A.${theme}`, await shotAround(A, stage, `caret-flag-A-${theme}`, 0));
    });
    await B.keyboard.press('Escape');
    await settled(B);
    say('flag.drawn', drawn);
    // B's first edit: the name prompt fires for a label (recorded, then dismissed so B stays a label)
    const promptB = await ctl(B, 'dialog.namePrompt')
      .waitFor({ timeout: 4000 })
      .then(
        () => true,
        () => false,
      );
    say('namePrompt.B.afterFlagEdit', promptB);
    if (promptB) {
      await inBothThemes(B, async (theme) => {
        say(
          `shot.namePrompt.B.${theme}`,
          await shotAround(B, ctl(B, 'dialog.namePrompt'), `name-prompt-B-${theme}`, 16),
        );
      });
      await closeDialogs(B, 'namePrompt.B.dismiss');
    }
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
        const chips = await chipFacts(page, '#ts-menu-roster');
        say(`rosterChips.${tag}.${theme}`, chips);
        say(`geometry.roster.${tag}.${theme}`, geometryOf(chips));
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
      const chips = await chipFacts(A, '.ts-versions.is-history');
      say(`versionChips.A.${theme}`, chips);
      say(`geometry.versions.A.${theme}`, geometryOf(chips));
      const panel = A.locator('[data-control="panel.versionHistory"]').first();
      say(`shot.versions.A.${theme}`, await shotAround(A, panel, `versions-A-${theme}`, 4));
      if ((await windowRow.count()) > 0) {
        await windowRow.hover();
        await A.waitForTimeout(300);
        say(
          `versions.windowHover.A.${theme}`,
          await windowRow.evaluate((el) => getComputedStyle(el).backgroundColor),
        );
        await A.mouse.move(600, 500);
      }
      const older = A.locator('.ts-versions.is-history .ts-version:not(.is-current)').first();
      if ((await older.count()) > 0) {
        await older.hover();
        await A.waitForTimeout(400);
        say(
          `versions.hovered.A.${theme}`,
          await older.evaluate((el) => {
            const restore = el.querySelector('.ts-version-restore');
            const meta = el.querySelector('.ts-version-meta');
            return {
              restore: restore ? getComputedStyle(restore).display : null,
              metaClipped: meta ? meta.scrollWidth > meta.clientWidth : null,
              meta: meta?.textContent ?? null,
            };
          }),
        );
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
              id: r.getAttribute('data-menu-item') ?? r.getAttribute('data-control'),
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

  // ---- a comment by A on the heading; B reads the marker, the panel row and the card
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
    await inBothThemes(A, async (theme) => {
      say(
        `commentCard.A.${theme}`,
        await A.evaluate(() => {
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
      if ((await card.count()) > 0)
        say(
          `shot.commentCard.A.${theme}`,
          await shotAround(A, card, `comment-card-A-${theme}`, 12),
        );
    });
    await A.keyboard.press('Escape');
    const threadsB = await poll(async () => {
      const t = (await state(B)).comments?.threads ?? [];
      return t.length >= 1 ? t : null;
    }, 30_000);
    const firstId = threadsB?.[0]?.id;
    await inBothThemes(B, async (theme) => {
      await B.keyboard.press('Escape');
      const marker = B.locator('[data-control="comment.marker"]').first();
      const markers = await B.locator('[data-control="comment.marker"]').count();
      say(`marker.B.${theme}`, {
        count: markers,
        plate: markers
          ? await marker.evaluate((el) => ({
              text: (el.textContent ?? '').trim(),
              chip: el.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
              plate: Boolean(el.querySelector('.ts-comment-marker-plate')),
            }))
          : null,
      });
      if (markers)
        say(`shot.marker.B.${theme}`, await shotAround(B, marker, `comment-marker-B-${theme}`, 16));
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
        `commentsPanelChips.B.${theme}`,
        geometryOf(await chipFacts(B, '[data-control="panel.comments"]')),
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
                  title: c.querySelector('[title]')?.getAttribute('title') ?? null,
                }
              : null;
          }),
        );
        say(
          `commentCardChips.B.${theme}`,
          geometryOf(await chipFacts(B, '[data-control="comment.card"]')),
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
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      say(
        `section.${name}.error`,
        error instanceof Error
          ? {
              message: error.message.split('\n')[0],
              at: (error.stack ?? '')
                .split('\n')
                .filter((l) => /verify\.mjs/.test(l))
                .slice(0, 3)
                .map((l) => l.trim()),
            }
          : String(error),
      );
    }
  };
  // ---- the fix round (build/b4.md, pass 1 finding 3): Change avatar > Glyph > Apply, a reload,
  // the own chip polled to the row's 10 s bound, the builder reopened, the roster's own row
  if (ONLY.includes('avatarReload'))
    await section('avatarReload', async () => {
      await A.keyboard.press('Escape');
      const chipOf = async () =>
        (await chipFacts(A, '[data-control="title.account"]'))?.[0] ?? null;
      const brief = (c) =>
        c ? { variant: c.variant, cells: c.cells, ariaLabel: c.ariaLabel } : null;
      say('avatarReload.chip.before', brief(await chipOf()));
      await openAccountMenu(A);
      await A.locator('#ts-menu-account [data-control="account.changeAvatar"]').first().click();
      await ctl(A, 'dialog.avatarBuilder').waitFor({ timeout: 8000 });
      await ctl(A, 'dialog.avatarBuilder.tab.glyph').click();
      await A.waitForTimeout(400);
      const tApply = Date.now();
      await ctl(A, 'dialog.avatarBuilder.apply').click();
      const applied = await poll(
        async () => {
          const c = await chipOf();
          return c?.variant === 'glyph' ? c : null;
        },
        5000,
        100,
      );
      say('avatarReload.chip.afterApply', {
        ms: Date.now() - tApply,
        chip: brief(applied ?? (await chipOf())),
        dialogOpen: (await ctl(A, 'dialog.avatarBuilder').count()) > 0,
      });
      await closeDialogs(A, 'avatarReload.closeAfterApply');
      await settled(A);
      const glyphCells = applied?.cells ?? null;
      const t0 = Date.now();
      await A.reload({ waitUntil: 'domcontentloaded' });
      await waitEditor(A);
      say('avatarReload.chip.atBoot', {
        msAfterReload: Date.now() - t0,
        chip: brief(await chipOf()),
      });
      const after = await poll(
        async () => {
          const c = await chipOf();
          return c?.variant === 'glyph' ? c : null;
        },
        10_000,
        100,
      );
      say('avatarReload.chip.afterReload', {
        msAfterReload: Date.now() - t0,
        chip: brief(after ?? (await chipOf())),
        sameCellsAsApplied: after ? after.cells === glyphCells : null,
      });
      say(
        'avatarReload.instance',
        await A.evaluate(() => {
          const s = window.turboslide.studio.describe().state;
          return s.sync?.instance ?? s.sync?.status?.instance ?? null;
        }).catch(() => null),
      );
      await openAccountMenu(A);
      await A.locator('#ts-menu-account [data-control="account.changeAvatar"]').first().click();
      await ctl(A, 'dialog.avatarBuilder').waitFor({ timeout: 8000 });
      await A.waitForTimeout(400);
      say(
        'avatarReload.builder.tabs',
        await A.evaluate(() =>
          [...document.querySelectorAll('[data-control^="dialog.avatarBuilder.tab."]')].map(
            (t) => ({
              id: t.getAttribute('data-control'),
              selected: t.getAttribute('aria-selected'),
            }),
          ),
        ),
      );
      await inBothThemes(A, async (theme) => {
        say(
          `shot.avatarReload.builder.A.${theme}`,
          await shotAround(
            A,
            ctl(A, 'dialog.avatarBuilder'),
            `avatar-reload-builder-A-${theme}`,
            24,
          ),
        );
      });
      await closeDialogs(A, 'avatarReload.closeBuilder');
      await openRoster(A);
      const own = await chipOf();
      const rowChips = (await chipFacts(A, '#ts-menu-roster')) ?? [];
      const ownRow =
        rowChips.find((c) => c.holder === 'title.presence.me') ??
        rowChips.find((c) => (c.ariaLabel ?? '').startsWith(NAME_A)) ??
        rowChips[0] ??
        rowChips.find((c) => (c.ariaLabel ?? '').includes('(you)')) ??
        null;
      say('avatarReload.roster.ownRow', {
        chip: brief(own),
        row: brief(ownRow),
        equal: own && ownRow ? own.cells === ownRow.cells : null,
      });
      await A.keyboard.press('Escape');
      await A.waitForTimeout(300);
      await inBothThemes(A, async (theme) => {
        say(
          `shot.avatarReload.slot.A.${theme}`,
          await shotAround(A, ctl(A, 'title.presence'), `avatar-reload-slot-A-${theme}`, 12),
        );
      });
    });

  // ---- the fix round (build/b1.md, pass 1 finding 2): B types a name, comments on slide 1 and
  // closes its context; A reloads and the Comments panel row is polled to the row's 10 s bound
  // (the first reading kept), then the opened card; pictures in both appearances
  if (ONLY.includes('departed'))
    await section('departed', async () => {
      const NAME_B = 'Noor Verifier';
      say(
        'departed.setName.B',
        await invoke(B, 'account.setName', { name: NAME_B }).then(
          (r) => ({ ok: true, name: r.name, trust: r.trust }),
          (e) => ({ error: String(e).slice(0, 160) }),
        ),
      );
      await B.waitForTimeout(500);
      await B.keyboard.press('Escape');
      await B.locator(
        '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="heading/text"]',
      )
        .first()
        .click();
      await B.keyboard.press('ControlOrMeta+Alt+m');
      const card = B.locator('[data-control="comment.card"]');
      await card.waitFor({ timeout: 10_000 });
      await card
        .locator('[data-control="comment.card.new.field"]')
        .fill('A note from the departed guest');
      await card.locator('[data-control="comment.card.new.submit"]').click();
      const threads = await poll(async () => {
        const t = (await state(B)).comments?.threads ?? [];
        return t.length >= 1 ? t : null;
      }, 20_000);
      const threadId = threads?.[0]?.id ?? null;
      const bChip = (await chipFacts(B, '[data-control="title.account"]'))?.[0] ?? null;
      say('departed.comment.B', {
        threadId,
        count: threads?.length ?? 0,
        ownChip: bChip && {
          ariaLabel: bChip.ariaLabel,
          cells: bChip.cells,
          initials: bChip.initials,
        },
      });
      await settled(B);
      await B.waitForTimeout(800);
      await ctxB.close();
      say('departed.B.closed', new Date().toISOString());
      const t0 = Date.now();
      await A.reload({ waitUntil: 'domcontentloaded' });
      await waitEditor(A);
      const boot = Date.now() - t0;
      await A.keyboard.press('Escape');
      await ctl(A, 'title.comments').click();
      await A.locator('[data-control="panel.comments"]').first().waitFor({ timeout: 10_000 });
      const readRows = () =>
        A.evaluate(() =>
          [...document.querySelectorAll('[data-control^="panel.comments.open."]')].map((r) => ({
            control: r.getAttribute('data-control'),
            text: (r.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
            chip: r.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
            cells: r.querySelector('.ts-chip')?.querySelectorAll('rect').length ?? 0,
          })),
        );
      say('departed.panel.A.first', {
        msAfterReload: Date.now() - t0,
        boot,
        rows: await readRows(),
      });
      const named = await poll(
        async () => {
          const rows = await readRows();
          return rows.some((r) => r.text.includes(NAME_B) || (r.chip ?? '').includes(NAME_B))
            ? rows
            : null;
        },
        10_000,
        250,
      );
      say('departed.panel.A.named', {
        msAfterReload: Date.now() - t0,
        found: named !== null,
        rows: named ?? (await readRows()),
      });
      await inBothThemes(A, async (theme) => {
        say(
          `shot.departed.panel.A.${theme}`,
          await shotAround(
            A,
            A.locator('[data-control="panel.comments"]').first(),
            `departed-panel-A-${theme}`,
            4,
          ),
        );
        if (threadId)
          await ctl(A, `panel.comments.open.${threadId}`)
            .click()
            .catch(() => {});
        await A.waitForTimeout(500);
        const cardA = A.locator('[data-control="comment.card"]');
        if ((await cardA.count()) > 0) {
          say(
            `departed.card.A.${theme}`,
            await A.evaluate(() => {
              const c = document.querySelector('[data-control="comment.card"]');
              return c
                ? {
                    name: c.querySelector('.ts-comment-name')?.textContent,
                    trust: c.querySelector('.ts-comment-trust')?.textContent ?? null,
                    badge: c.querySelector('.ts-trust-mark')?.getAttribute('aria-label') ?? null,
                    chip: c.querySelector('.ts-chip')?.getAttribute('aria-label'),
                    cells: c.querySelector('.ts-chip')?.querySelectorAll('rect').length ?? 0,
                  }
                : null;
            }),
          );
          say(
            `shot.departed.card.A.${theme}`,
            await shotAround(A, cardA, `departed-card-A-${theme}`, 12),
          );
        }
        await A.keyboard.press('Escape');
      });
      await ctl(A, 'title.comments')
        .click()
        .catch(() => {});
    });

  if (want('share'))
    await section('share', async () => {
      for (const [page, tag] of [
        [A, 'A'],
        [B, 'B'],
      ]) {
        await inBothThemes(page, async (theme) => {
          say(`share.step.${tag}.${theme}`, 'start');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          await closeDialogs(page, `share.beforeOpen.${tag}.${theme}`);
          const t0 = Date.now();
          const clickOpen = () => ctl(page, 'share.open').click({ timeout: 8000 });
          const blocked = await clickOpen().then(
            () => null,
            (e) => String(e).split('\n')[0],
          );
          if (blocked !== null) {
            const dialogs = await page.evaluate(() =>
              [...document.querySelectorAll('[data-control^="dialog."]')]
                .filter((d) => !d.hidden && d.getBoundingClientRect().width > 0)
                .map((d) => d.getAttribute('data-control'))
                .filter((id) => id !== null && id.split('.').length === 2),
            );
            say(`share.blocked.${tag}.${theme}`, { blocked, dialogs });
            say(
              `shot.share.blocked.${tag}.${theme}`,
              await shotAround(page, page.locator('body'), `share-blocked-${tag}-${theme}`, 0),
            );
            await closeDialogs(page, `share.blocked.close.${tag}.${theme}`);
            await clickOpen().catch((e) =>
              say(`share.blocked.again.${tag}.${theme}`, String(e).split('\n')[0]),
            );
          }
          /* the row's bound is 10 s; a late dialog is measured to 40 s before a second click */
          let shown = await ctl(page, 'dialog.share')
            .waitFor({ timeout: 10_000 })
            .then(
              () => true,
              () => false,
            );
          let attempts = 1;
          let late = null;
          if (!shown) {
            shown = await ctl(page, 'dialog.share')
              .waitFor({ timeout: 30_000 })
              .then(
                () => true,
                () => false,
              );
            if (shown) late = Date.now() - t0;
          }
          if (!shown) {
            attempts = 2;
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            await clickOpen().catch((e) =>
              say(`share.secondClick.${tag}.${theme}`, String(e).split('\n')[0]),
            );
            shown = await ctl(page, 'dialog.share')
              .waitFor({ timeout: 10_000 })
              .then(
                () => true,
                () => false,
              );
          }
          say(`share.open.${tag}.${theme}`, { shown, attempts, late, ms: Date.now() - t0 });
          if (!shown) {
            say(
              `share.${tag}.${theme}`,
              'not driven: the Share dialog did not open within 10 s of share.open, twice',
            );
            await page.keyboard.press('Escape');
            return;
          }
          await page.waitForTimeout(600);
          /* the fix round (build/b2.md): a person with no typed name meets the name ask as a band at
             the head of the dialog's body (dialog.namePrompt inside dialog.share); read it, picture
             it, pass it with Skip and read the dialog standing with the focus on Done */
          const band = await page.evaluate(() => {
            const d = document.querySelector('[data-control="dialog.share"]');
            const ask = d?.querySelector('[data-control="dialog.namePrompt"]') ?? null;
            const active = () =>
              document.activeElement?.getAttribute('data-control') ??
              document.activeElement?.tagName ??
              null;
            const dialogs = document.querySelectorAll('[role="dialog"]').length;
            if (!ask) return { present: false, dialogs, focus: active() };
            const body = ask.parentElement;
            return {
              present: true,
              firstInBody: body ? body.firstElementChild === ask : null,
              words: (ask.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
              field: ask.querySelector('[data-control="dialog.namePrompt.name"]')?.value ?? null,
              skip: Boolean(ask.querySelector('[data-control="dialog.namePrompt.skip"]')),
              continueDisabled:
                ask.querySelector('[data-control="dialog.namePrompt.continue"]')?.disabled ?? null,
              signIn: Boolean(ask.querySelector('[data-control="dialog.namePrompt.signIn"]')),
              error:
                ask.querySelector('[data-control="dialog.namePrompt.error"]')?.textContent ?? null,
              frame: getComputedStyle(ask).borderTopColor,
              focus: active(),
              dialogs,
            };
          });
          say(`share.band.${tag}.${theme}`, band);
          if (band.present) {
            say(
              `shot.share.band.${tag}.${theme}`,
              await shotAround(page, ctl(page, 'dialog.share'), `share-band-${tag}-${theme}`, 12),
            );
            const t1 = Date.now();
            await ctl(page, 'dialog.namePrompt.skip').click({ timeout: 4000 });
            const gone = await ctl(page, 'dialog.namePrompt')
              .waitFor({ state: 'detached', timeout: 3000 })
              .then(
                () => true,
                () => false,
              );
            say(`share.band.skip.${tag}.${theme}`, {
              gone,
              ms: Date.now() - t1,
              dialogStill: await ctl(page, 'dialog.share')
                .isVisible()
                .catch(() => false),
              focus: await page.evaluate(
                () =>
                  document.activeElement?.getAttribute('data-control') ??
                  document.activeElement?.tagName ??
                  null,
              ),
            });
            await page.waitForTimeout(300);
          }
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
                  variant: row.querySelector('.ts-chip')?.getAttribute('data-variant') ?? null,
                  picture: row.querySelector('img.ts-chip-picture')?.getAttribute('src') ?? null,
                }),
              ),
            ),
          );
          say(
            `shareChips.${tag}.${theme}`,
            geometryOf(await chipFacts(page, '[data-control="dialog.share"]')),
          );
          say(
            `shot.share.${tag}.${theme}`,
            await shotAround(page, ctl(page, 'dialog.share'), `share-${tag}-${theme}`, 12),
          );
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        });
      }
    });

  // ---- the Profile head in A (an account: Sessions opens it)
  if (want('profile'))
    await section('profile', () =>
      inBothThemes(A, async (theme) => {
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
                  srcset: h.querySelector('img.ts-chip-picture')?.getAttribute('srcset') ?? null,
                }
              : null;
          }),
        );
        say(
          `shot.profileHead.A.${theme}`,
          await shotAround(A, ctl(A, 'dialog.profile.head'), `profile-head-A-${theme}`, 8),
        );
        say(
          `shot.profile.A.${theme}`,
          await shotAround(A, ctl(A, 'dialog.profile'), `profile-A-${theme}`, 12),
        );
        await A.keyboard.press('Escape');
        await A.waitForTimeout(300);
      }),
    );

  // ---- the filmstrip's 16 px chips in A
  await A.keyboard.press('Escape');
  if (want('filmstrip')) {
    const chips = await chipFacts(A, '.ts-card-marks');
    say('filmstripChips.A', chips);
    say('geometry.filmstrip.A', geometryOf(chips));
    const marks = A.locator('.ts-card-marks').first();
    if ((await marks.count()) > 0) {
      await inBothThemes(A, async (theme) => {
        say(
          `shot.filmstrip.A.${theme}`,
          await shotAround(A, marks, `filmstrip-marks-A-${theme}`, 8),
        );
      });
    }
  }

  // ---- the fallback plate (accounts): the key's folder removed, a fresh context with A's cookies
  if (ACCOUNTS && want('fallback') && pictureKey) {
    const candidates = [
      join(OVERLAY, '.turboslide', 'users', 'u', pictureKey),
      join(OVERLAY, 'users', 'u', pictureKey),
    ];
    const folder = candidates.find((p) => existsSync(p)) ?? null;
    say('fallback.folder', { folder, candidates });
    if (folder) {
      rmSync(folder, { recursive: true, force: true });
      const storage = await ctxA.storageState();
      const ctxA2 = await mk('light', storage);
      await ctxA2.routeWebSocket('**', () => {});
      const A2 = await ctxA2.newPage();
      const t0 = Date.now();
      await A2.goto(`/edit/${deckId}`);
      await waitEditor(A2);
      const chip = await poll(async () => {
        const f = await chipFacts(A2, '[data-control="title.account"]');
        const c = f?.[0];
        return c && !c.img && (c.cells > 0 || c.initials)
          ? f
          : c && c.picture === 'failed'
            ? f
            : null;
      }, 10_000);
      say('fallback.A2', {
        ms: Date.now() - t0,
        chip: chip?.[0] ?? (await chipFacts(A2, '[data-control="title.account"]'))?.[0] ?? null,
      });
      await inBothThemes(A2, async (theme) => {
        say(
          `shot.fallback.${theme}`,
          await shotAround(A2, ctl(A2, 'title.account'), `fallback-plate-A2-${theme}`, 6),
        );
      });
      // A's own reload keeps the cached picture (the route serves the files immutable for a year), recorded beside it
      await A.reload({ waitUntil: 'domcontentloaded' });
      await waitEditor(A);
      await A.waitForTimeout(1500);
      say(
        'fallback.A.ownReload',
        (await chipFacts(A, '[data-control="title.account"]'))?.[0] ?? null,
      );
      await ctxA2.close();
    }
  }
  say('uptime.end', execFileSync('uptime', { encoding: 'utf8' }).trim());
  facts.endedAt = new Date().toISOString();
} catch (error) {
  say('error', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  process.exitCode = 1;
} finally {
  if (deckId !== null) {
    /* by the id, never a sweep: the trash and the delete forever each base on the revision read a
       moment before (deck.trash and deck.remove want baseRevision; deck.remove wants confirm) */
    try {
      const revision = async () => (await invoke(A, 'deck.info', {})).revision ?? 0;
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
  writeFileSync(join(OUT, `${PREFIX}-facts.json`), JSON.stringify(facts, null, 2));
  await browser.close();
}
