// The people audit drive (docs/gslides-parity/people/audit-production.md): two anonymous browsers
// on one scratch deck on production, the pictures of what each sees of the other, then the deck
// removed by its id through the bearer. Run from the repo root:
//   node docs/gslides-parity/people/drive/people.mjs
// Playwright is the workspace's own (node_modules/.pnpm/playwright@<v>/node_modules/playwright).
// No secret is printed: the bearer is read from ~/.config/turboslide/hosts.json into a variable.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  chromium,
} = require('/Users/kevinliu/repos/Turboslide-people/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const BASE = 'https://www.turboslide.com';
const OUT = dirname(fileURLToPath(import.meta.url));
mkdirSync(OUT, { recursive: true });
const TYPE_DELAY = 60;
const facts = {};
const say = (key, value) => {
  facts[key] = value;
  console.log(`${key}: ${JSON.stringify(value)}`);
};

const hosts = JSON.parse(readFileSync(join(homedir(), '.config/turboslide/hosts.json'), 'utf8'));
const TOKEN = hosts.hosts[BASE].token;
if (typeof TOKEN !== 'string' || TOKEN.length === 0) throw new Error('no bearer for production');

async function post(action, deckId, body) {
  const response = await fetch(`${BASE}/api/actions/${action}?deck=${encodeURIComponent(deckId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
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

/** A screenshot of the page clipped around an element, with `pad` px of air. */
async function shotAround(page, locator, name, pad = 12) {
  await page.waitForTimeout(700);
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
  return path;
}

async function shotFull(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path });
  return path;
}

/** The presence slot as the DOM shows it: every chip's attributes, the own chip, the more button. */
function slotFacts(page) {
  return page.evaluate(() => {
    const slot = document.querySelector('[data-control="title.presence"]');
    if (!slot) return null;
    const chips = [...slot.querySelectorAll('.ts-chip')].map((chip) => {
      const r = chip.getBoundingClientRect();
      const plate = chip.querySelector('.ts-chip-plate, .ts-chip-picture');
      const p = plate?.getBoundingClientRect();
      const cs = getComputedStyle(chip);
      return {
        holder: chip.closest('[data-control]')?.getAttribute('data-control') ?? null,
        ariaLabel: chip.getAttribute('aria-label'),
        variant: chip.getAttribute('data-variant'),
        trust: chip.getAttribute('data-trust'),
        hue: chip.getAttribute('data-hue'),
        hueVar: chip.style.getPropertyValue('--ts-hue'),
        classes: chip.className,
        box: { w: r.width, h: r.height },
        border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
        plateInset: p
          ? { l: p.left - r.left, t: p.top - r.top, r: r.right - p.right, b: r.bottom - p.bottom }
          : null,
        initials: chip.querySelector('.ts-chip-initials')?.textContent ?? null,
        stripe: chip.querySelector('.ts-chip-stripe') !== null,
        cells: chip.querySelectorAll('rect').length,
        svg: plate
          ? {
              w: plate.clientWidth,
              h: plate.clientHeight,
              attrW: plate.getAttribute('width'),
              cssW: getComputedStyle(plate).width,
            }
          : null,
        cellsExtent: (() => {
          const rects = [...chip.querySelectorAll('rect')].map((e) => e.getBoundingClientRect());
          if (rects.length === 0) return null;
          const l = Math.min(...rects.map((b) => b.left)),
            t = Math.min(...rects.map((b) => b.top));
          const rr = Math.max(...rects.map((b) => b.right)),
            bb = Math.max(...rects.map((b) => b.bottom));
          return {
            fromLeft: l - r.left,
            fromTop: t - r.top,
            fromRight: r.right - rr,
            fromBottom: r.bottom - bb,
          };
        })(),
        initialsBox: (() => {
          const t = chip.querySelector('.ts-chip-initials');
          if (!t) return null;
          const b = t.getBoundingClientRect();
          return {
            w: b.width,
            h: b.height,
            fontSize: getComputedStyle(t).fontSize,
            fill: getComputedStyle(t).fill,
            stroke: getComputedStyle(t).stroke,
          };
        })(),
      };
    });
    const more = slot.querySelector('[data-control="presence.more"]');
    return {
      count: slot.getAttribute('data-count'),
      tip: slot.getAttribute('data-tip') ?? slot.getAttribute('aria-description') ?? null,
      chips,
      more: more
        ? {
            classes: more.className,
            label: more.getAttribute('aria-label'),
            text: more.textContent,
          }
        : null,
      ownChip: slot.querySelector('[data-control="title.account"]') !== null,
      rule: slot.querySelector('.ts-presence-rule') !== null,
    };
  });
}

function rosterFacts(page) {
  return page.evaluate(() => {
    const menu = document.querySelector('#ts-menu-roster');
    if (!menu) return null;
    return {
      label: menu.getAttribute('aria-label'),
      rows: [...menu.querySelectorAll('.ts-roster-row')].map((row) => ({
        control: row.getAttribute('data-control'),
        classes: row.className,
        name: row.querySelector('.ts-roster-name')?.textContent ?? null,
        meta: row.querySelector('.ts-roster-meta')?.textContent ?? null,
        act: row.querySelector('.ts-roster-act')?.textContent ?? null,
        chip: row.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
        chipVariant: row.querySelector('.ts-chip')?.getAttribute('data-variant') ?? null,
        hue: row.querySelector('.ts-chip')?.getAttribute('data-hue') ?? null,
      })),
      width: menu.getBoundingClientRect().width,
    };
  });
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
          slideId: p.slideId,
          markVariant: p.mark?.variant,
          markInitials: p.mark?.initials,
          markLabel: p.mark?.label,
        };
  return {
    self: strip(s.presence?.self),
    others: (s.presence?.others ?? []).map(strip),
    count: s.presence?.count,
  };
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

async function openVersions(page) {
  await page.keyboard.press('Escape');
  await ctl(page, 'deck.lastEdit').click();
  await page.locator('.ts-versions.is-history').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
}

function versionsFacts(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.ts-versions.is-history');
    if (!panel) return null;
    return {
      rows: [...panel.querySelectorAll('.ts-version')].map((row) => ({
        author: row.getAttribute('data-author'),
        word: row.querySelector('.ts-version-author')?.textContent ?? null,
        meta: row.querySelector('.ts-version-meta')?.textContent ?? null,
        chip: row.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
        chipClasses: row.querySelector('.ts-chip')?.className ?? null,
        chipSize: row.querySelector('.ts-chip')?.getAttribute('data-size') ?? null,
      })),
      windows: [...panel.querySelectorAll('.ts-version-window-row')].map((row) => ({
        text: row.textContent,
        marks: [...row.querySelectorAll('.ts-chip')].map((c) => c.getAttribute('aria-label')),
      })),
    };
  });
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
  return page.evaluate(
    () =>
      document.documentElement.hasAttribute('data-advanced-tools') ||
      document.querySelector('[data-advanced-tools]') !== null,
  );
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
      rows: [...menu.querySelectorAll('[role="menuitem"]')].map((r) =>
        r.getAttribute('data-control'),
      ),
    };
  });
}

function dialogFacts(page, control) {
  return page.evaluate((id) => {
    const d = document.querySelector(`[data-control="${id}"]`);
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return {
      title: d.querySelector('.ts-dialog-title')?.textContent ?? null,
      size: { w: r.width, h: r.height },
      text: (d.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
      controls: [...d.querySelectorAll('[data-control]')].map((e) =>
        e.getAttribute('data-control'),
      ),
      chips: [...d.querySelectorAll('.ts-chip')].map((chip) => {
        const cr = chip.getBoundingClientRect();
        const plate = chip.querySelector('.ts-chip-plate, img');
        const p = plate?.getBoundingClientRect();
        return {
          size: { w: cr.width, h: cr.height },
          label: chip.getAttribute('aria-label'),
          plateInset: p
            ? {
                l: p.left - cr.left,
                t: p.top - cr.top,
                r: cr.right - p.right,
                b: cr.bottom - p.bottom,
              }
            : null,
        };
      }),
    };
  }, control);
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
const A = await ctxA.newPage();
const B = await ctxB.newPage();
let deckId = null;

try {
  // ---- A creates the deck from /new
  await A.goto('/new');
  await waitEditor(A);
  const info = await invoke(A, 'deck.info');
  deckId = info.id;
  say('deck.id', deckId);
  say(
    'build',
    await A.evaluate(() => ({
      title: document.title,
      build:
        document.documentElement.dataset.build ??
        document.querySelector('meta[name="turboslide-build"]')?.content ??
        null,
      theme: document.documentElement.dataset.theme ?? null,
    })),
  );
  await typeInto(A, await headingRun(A), 'People audit deck');
  await poll(async () => (await state(A)).revision >= 1, 30_000);
  await A.waitForURL(/\/edit\//, { timeout: 30_000 });
  await settled(A);
  const s0 = await state(A);
  say('state.deckId', { deckId: s0.deckId ?? null, keys: Object.keys(s0) });

  // the name prompt of the first edit
  const prompt = ctl(A, 'dialog.namePrompt');
  const prompted = await prompt.isVisible().catch(() => false);
  say('namePrompt.firstEdit', prompted);
  if (prompted) {
    say('namePrompt.A', await dialogFacts(A, 'dialog.namePrompt'));
    say('shot.namePrompt.A', await shotAround(A, prompt, 'A-name-prompt-first-edit', 16));
    if ((await ctl(A, 'dialog.namePrompt.close').count()) > 0)
      await ctl(A, 'dialog.namePrompt.close').click();
    else await ctl(A, 'dialog.namePrompt.skip').click();
    await A.waitForTimeout(300);
  }

  // A opens the deck to anyone with the link as an editor: a setup write through the window API
  const share = await invoke(A, 'share.get', { id: deckId });
  const opened = await invoke(A, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'editor',
    baseRevision: share.record?.revision ?? share.revision,
  });
  const linkUrl = opened.url;
  say('share.link', linkUrl ? linkUrl.replace(/\/s\/.*$/, '/s/<token>') : null);

  // ---- B follows the link
  await B.goto(linkUrl ?? `/edit/${deckId}`);
  await B.waitForURL(new RegExp(`/edit/${deckId}`), { timeout: 30_000 });
  await waitEditor(B);
  say('B.access', (await state(B)).access);

  await poll(async () => ((await state(A)).presence?.others?.length ?? 0) >= 1, 40_000);
  await poll(async () => ((await state(B)).presence?.others?.length ?? 0) >= 1, 40_000);
  await A.waitForTimeout(1500);
  say('presence.A.anon', presenceState(await state(A)));
  say('presence.B.anon', presenceState(await state(B)));

  // ---- both anonymous, no names: the slot and the roster in each
  await A.keyboard.press('Escape');
  say('slot.A.anon', await slotFacts(A));
  say('slot.B.anon', await slotFacts(B));
  say('shot.slot.A.anon', await shotAround(A, ctl(A, 'title.presence'), 'A-slot-anonymous', 20));
  say('shot.slot.B.anon', await shotAround(B, ctl(B, 'title.presence'), 'B-slot-anonymous', 20));
  say(
    'shot.titlerow.A.anon',
    await A.screenshot({
      path: join(OUT, 'A-title-row-anonymous.png'),
      clip: { x: 0, y: 0, width: 1440, height: 96 },
    }).then(() => join(OUT, 'A-title-row-anonymous.png')),
  );
  // the other chip's tooltip
  const chipA = A.locator('[data-control^="presence.chip."]').first();
  await chipA.hover();
  await A.waitForTimeout(900);
  say(
    'tooltip.A.anon',
    await A.evaluate(() => document.querySelector('.pt-tip:not([hidden])')?.textContent ?? null),
  );
  say(
    'shot.tooltip.A.anon',
    await A.screenshot({
      path: join(OUT, 'A-chip-tooltip-anonymous.png'),
      clip: { x: 560, y: 0, width: 880, height: 150 },
    }).then(() => join(OUT, 'A-chip-tooltip-anonymous.png')),
  );
  for (const [page, tag] of [
    [A, 'A'],
    [B, 'B'],
  ]) {
    await page.keyboard.press('Escape');
    await page.mouse.move(600, 500);
    await ctl(page, 'presence.more').click();
    await page.locator('#ts-menu-roster').waitFor({ timeout: 8000 });
    await page.waitForTimeout(300);
    say(`roster.${tag}.anon`, await rosterFacts(page));
    const menu = page.locator('#ts-menu-roster');
    const mb = await menu.boundingBox();
    say(
      `shot.roster.${tag}.anon`,
      await page
        .screenshot({
          path: join(OUT, `${tag}-roster-anonymous.png`),
          clip: {
            x: Math.max(0, mb.x - 260),
            y: 0,
            width: Math.min(1440 - Math.max(0, mb.x - 260), mb.width + 300),
            height: mb.y + mb.height + 16,
          },
        })
        .then(() => join(OUT, `${tag}-roster-anonymous.png`)),
    );
    await page.keyboard.press('Escape');
  }

  // ---- A turns Advanced tools on: the own chip and the account menu appear
  say('advanced.A', await advancedOn(A));
  await A.waitForTimeout(400);
  say('slot.A.advanced', await slotFacts(A));
  say(
    'shot.slot.A.advanced',
    await shotAround(A, ctl(A, 'title.presence'), 'A-slot-advanced-own-chip', 20),
  );
  say('accountMenu.A.anon', await openAccountMenu(A));
  {
    const mb = await A.locator('#ts-menu-account').boundingBox();
    say(
      'shot.accountMenu.A.anon',
      await A.screenshot({
        path: join(OUT, 'A-account-menu-anonymous.png'),
        clip: {
          x: Math.max(0, mb.x - 260),
          y: 0,
          width: Math.min(1440 - Math.max(0, mb.x - 260), mb.width + 300),
          height: mb.y + mb.height + 16,
        },
      }).then(() => join(OUT, 'A-account-menu-anonymous.png')),
    );
  }
  // Change name from the account menu
  await ctl(A, 'account.changeName').click();
  await ctl(A, 'dialog.namePrompt').waitFor({ timeout: 8000 });
  say('changeName.dialog', await dialogFacts(A, 'dialog.namePrompt'));
  say(
    'shot.changeName',
    await shotAround(A, ctl(A, 'dialog.namePrompt'), 'A-change-name-dialog', 24),
  );
  await ctl(A, 'dialog.namePrompt.name').fill('');
  await ctl(A, 'dialog.namePrompt.name').type('Ada Lovelace', { delay: TYPE_DELAY });
  await ctl(A, 'dialog.namePrompt.continue').click();
  await A.waitForTimeout(800);
  say(
    'changeName.error',
    await ctl(A, 'dialog.namePrompt.error')
      .textContent()
      .catch(() => null),
  );
  await poll(
    async () =>
      (await state(B)).presence?.others?.some(
        (p) => p.name === 'Ada Lovelace' || p.label === 'Ada Lovelace',
      ),
    40_000,
  );
  await A.waitForTimeout(800);
  say('presence.A.named', presenceState(await state(A)));
  say('presence.B.named', presenceState(await state(B)));
  say('account.A.named', (await state(A)).account ?? null);

  // ---- after the name: the slot, the roster and the tooltip in each
  say('slot.A.named', await slotFacts(A));
  say('slot.B.named', await slotFacts(B));
  say('shot.slot.A.named', await shotAround(A, ctl(A, 'title.presence'), 'A-slot-named', 20));
  say('shot.slot.B.named', await shotAround(B, ctl(B, 'title.presence'), 'B-slot-named', 20));
  const chipB = B.locator('[data-control^="presence.chip."]').first();
  await chipB.hover();
  await B.waitForTimeout(900);
  say(
    'tooltip.B.named',
    await B.evaluate(() => document.querySelector('.pt-tip:not([hidden])')?.textContent ?? null),
  );
  say(
    'shot.tooltip.B.named',
    await B.screenshot({
      path: join(OUT, 'B-chip-tooltip-named.png'),
      clip: { x: 560, y: 0, width: 880, height: 150 },
    }).then(() => join(OUT, 'B-chip-tooltip-named.png')),
  );
  for (const [page, tag] of [
    [A, 'A'],
    [B, 'B'],
  ]) {
    await page.keyboard.press('Escape');
    await page.mouse.move(600, 500);
    await ctl(page, 'presence.more').click();
    await page.locator('#ts-menu-roster').waitFor({ timeout: 8000 });
    await page.waitForTimeout(300);
    say(`roster.${tag}.named`, await rosterFacts(page));
    const mb = await page.locator('#ts-menu-roster').boundingBox();
    say(
      `shot.roster.${tag}.named`,
      await page
        .screenshot({
          path: join(OUT, `${tag}-roster-named.png`),
          clip: {
            x: Math.max(0, mb.x - 260),
            y: 0,
            width: Math.min(1440 - Math.max(0, mb.x - 260), mb.width + 300),
            height: mb.y + mb.height + 16,
          },
        })
        .then(() => join(OUT, `${tag}-roster-named.png`)),
    );
    await page.keyboard.press('Escape');
  }
  // the account menu head with the name
  say('accountMenu.A.named', await openAccountMenu(A));
  {
    const mb = await A.locator('#ts-menu-account').boundingBox();
    say(
      'shot.accountMenu.A.named',
      await A.screenshot({
        path: join(OUT, 'A-account-menu-named.png'),
        clip: {
          x: Math.max(0, mb.x - 260),
          y: 0,
          width: Math.min(1440 - Math.max(0, mb.x - 260), mb.width + 300),
          height: mb.y + mb.height + 16,
        },
      }).then(() => join(OUT, 'A-account-menu-named.png')),
    );
  }
  await A.keyboard.press('Escape');

  // ---- a second edit by A after the name, so version history holds a named author too
  await typeInto(A, await headingRun(A), 'People audit deck, renamed');
  await settled(A);

  // ---- version history: A and B, light and dark
  for (const [page, tag] of [
    [A, 'A'],
    [B, 'B'],
  ]) {
    await openVersions(page);
    const win = page.locator('.ts-version-window-row').first();
    if ((await win.count()) > 0) {
      await win.click();
      await page.waitForTimeout(500);
    }
    say(`versions.${tag}.light`, await versionsFacts(page));
    say(
      `versions.${tag}.markEdge`,
      await page.evaluate(() => {
        const panel = document.querySelector('.ts-versions.is-history');
        const pr = panel.getBoundingClientRect();
        const host = panel.closest('.ts-panel-body, .ts-panel, aside') ?? panel.parentElement;
        const hr = host.getBoundingClientRect();
        return [...panel.querySelectorAll('.ts-chip')].map((chip) => {
          const r = chip.getBoundingClientRect();
          return {
            label: chip.getAttribute('aria-label'),
            size: chip.getAttribute('data-size'),
            w: r.width,
            h: r.height,
            leftOfPanel: r.left - pr.left,
            leftOfHost: r.left - hr.left,
            hostClass: host.className,
            hostOverflow: getComputedStyle(host).overflowX,
            panelPaddingLeft: getComputedStyle(panel).paddingLeft,
          };
        });
      }),
    );
    const panel = page.locator('.ts-versions.is-history').first();
    say(
      `shot.versions.${tag}.light`,
      await shotAround(page, panel, `${tag}-version-history-light`, 8),
    );
    await setTheme(page, 'dark');
    await page.waitForTimeout(500);
    say(
      `shot.versions.${tag}.dark`,
      await shotAround(page, panel, `${tag}-version-history-dark`, 8),
    );
    say(
      `shot.slot.${tag}.dark`,
      await shotAround(page, ctl(page, 'title.presence'), `${tag}-slot-dark`, 20),
    );
    await ctl(page, 'presence.more').click();
    await page.locator('#ts-menu-roster').waitFor({ timeout: 8000 });
    await page.waitForTimeout(300);
    const mb = await page.locator('#ts-menu-roster').boundingBox();
    say(
      `shot.roster.${tag}.dark`,
      await page
        .screenshot({
          path: join(OUT, `${tag}-roster-dark.png`),
          clip: {
            x: Math.max(0, mb.x - 260),
            y: 0,
            width: Math.min(1440 - Math.max(0, mb.x - 260), mb.width + 300),
            height: mb.y + mb.height + 16,
          },
        })
        .then(() => join(OUT, `${tag}-roster-dark.png`)),
    );
    await page.keyboard.press('Escape');
    await setTheme(page, 'light');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
  }
  // close the panel in both (the clock toggles it)
  for (const page of [A, B]) {
    if ((await page.locator('.ts-versions.is-history').count()) > 0)
      await ctl(page, 'deck.lastEdit')
        .click()
        .catch(() => {});
    await page.waitForTimeout(300);
  }

  // ---- a comment by A, seen by B
  await A.keyboard.press('Escape');
  const heading = A.locator(
    '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="heading/text"]',
  ).first();
  await heading.click();
  await A.keyboard.press('ControlOrMeta+Alt+m');
  const card = A.locator('[data-control="comment.card"]');
  await card.waitFor({ timeout: 10_000 });
  await card
    .locator('[data-control="comment.card.new.field"]')
    .fill('Can you check the title on this slide?');
  say('shot.comment.A.compose', await shotAround(A, card, 'A-comment-compose', 12));
  await card.locator('[data-control="comment.card.new.submit"]').click();
  await poll(async () => ((await state(A)).comments?.threads?.length ?? 0) >= 1, 20_000);
  const threadsB = await poll(async () => {
    const t = (await state(B)).comments?.threads ?? [];
    return t.length >= 1 ? t : null;
  }, 40_000);
  say(
    'comments.B.threads',
    threadsB
      ? threadsB.map((t) => ({ id: t.id, author: t.comment?.author ?? t.author ?? null }))
      : null,
  );
  say('comments.B.state', (await state(B)).comments);
  await A.waitForTimeout(500);
  say(
    'comment.A.card',
    await A.evaluate(() => {
      const c = document.querySelector('[data-control="comment.card"]');
      return c
        ? {
            name: c.querySelector('.ts-comment-name')?.textContent,
            trust: c.querySelector('.ts-comment-trust')?.textContent ?? null,
            chip: c.querySelector('.ts-chip')?.getAttribute('aria-label'),
          }
        : null;
    }),
  );
  if ((await card.count()) > 0)
    say('shot.comment.A.posted', await shotAround(A, card, 'A-comment-posted', 12));
  else say('comment.A.cardAfterPost', 'the card closed after Comment');
  say(
    'shot.comment.A.marker',
    await A.screenshot({ path: join(OUT, 'A-comment-marker.png') }).then(() =>
      join(OUT, 'A-comment-marker.png'),
    ),
  );
  await B.keyboard.press('Escape');
  await ctl(B, 'title.comments').click();
  await B.waitForTimeout(600);
  const firstId = threadsB?.[0]?.id;
  if (firstId) {
    await ctl(B, `panel.comments.open.${firstId}`)
      .click()
      .catch(() => {});
    await B.waitForTimeout(600);
  }
  say(
    'comment.B.panel',
    await B.evaluate(() => {
      const panel = document.querySelector(
        '[data-control="panel.comments"], .ts-comments-panel, .ts-comments',
      );
      const card = document.querySelector('[data-control="comment.card"]');
      return {
        panelText: (panel?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
        card: card
          ? {
              name: card.querySelector('.ts-comment-name')?.textContent,
              trust: card.querySelector('.ts-comment-trust')?.textContent ?? null,
              chip: card.querySelector('.ts-chip')?.getAttribute('aria-label'),
              chipVariant: card.querySelector('.ts-chip')?.getAttribute('data-variant'),
            }
          : null,
        rows: [...document.querySelectorAll('[data-control^="panel.comments.open."]')].map((r) => ({
          text: (r.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
          chip: r.querySelector('.ts-chip')?.getAttribute('aria-label') ?? null,
        })),
      };
    }),
  );
  say('shot.comment.B', await shotFull(B, 'B-comment-by-A'));
  {
    const panel = B.locator('[data-control="panel.comments"]').first();
    if ((await panel.count()) > 0)
      say('shot.comment.B.panel', await shotAround(B, panel, 'B-comments-panel', 8));
    const marker = B.locator('[data-control="comment.marker"]').first();
    if ((await marker.count()) > 0) {
      await marker.click().catch(() => {});
      await B.waitForTimeout(600);
      say(
        'comment.B.afterMarker',
        await B.evaluate(() => {
          const card = document.querySelector('[data-control="comment.card"]');
          return card
            ? {
                name: card.querySelector('.ts-comment-name')?.textContent,
                trust: card.querySelector('.ts-comment-trust')?.textContent ?? null,
                chip: card.querySelector('.ts-chip')?.getAttribute('aria-label'),
                chipVariant: card.querySelector('.ts-chip')?.getAttribute('data-variant'),
                chipHue: card.querySelector('.ts-chip')?.getAttribute('data-hue'),
                classes: card.querySelector('.ts-chip')?.className,
              }
            : null;
        }),
      );
    }
  }
  const cardB = B.locator('[data-control="comment.card"]');
  if ((await cardB.count()) > 0)
    say('shot.comment.B.card', await shotAround(B, cardB, 'B-comment-card', 12));

  // ---- the profile dialog and the avatar builder in A (Advanced tools on)
  await A.keyboard.press('Escape');
  await openAccountMenu(A);
  await ctl(A, 'account.sessions').click();
  await ctl(A, 'dialog.profile').waitFor({ timeout: 8000 });
  await A.waitForTimeout(300);
  say('profile.A', await dialogFacts(A, 'dialog.profile'));
  say('shot.profile.A', await shotAround(A, ctl(A, 'dialog.profile'), 'A-profile-dialog', 24));
  say(
    'shot.profile.A.head',
    await shotAround(A, ctl(A, 'dialog.profile.head'), 'A-profile-head', 8),
  );
  await setTheme(A, 'dark');
  say(
    'shot.profile.A.dark',
    await shotAround(A, ctl(A, 'dialog.profile'), 'A-profile-dialog-dark', 24),
  );
  await setTheme(A, 'light');
  await ctl(A, 'dialog.profile.done').click();
  await A.waitForTimeout(300);

  await openAccountMenu(A);
  await ctl(A, 'account.changeAvatar').click();
  await ctl(A, 'dialog.avatarBuilder').waitFor({ timeout: 8000 });
  await A.waitForTimeout(400);
  for (const tab of ['initials', 'glyph', 'dither', 'picture']) {
    await ctl(A, `dialog.avatarBuilder.tab.${tab}`).click();
    await A.waitForTimeout(400);
    say(`avatar.A.${tab}`, await dialogFacts(A, 'dialog.avatarBuilder'));
    say(
      `shot.avatar.A.${tab}`,
      await shotAround(A, ctl(A, 'dialog.avatarBuilder'), `A-avatar-builder-${tab}`, 24),
    );
  }
  say(
    'avatar.A.picture.upload',
    await A.evaluate(() => ({
      file: document.querySelectorAll('[data-control="dialog.avatarBuilder.file"]').length,
      uploadLabel: document.querySelector('.ts-avatar-upload')?.textContent ?? null,
      sentence: document.querySelector('.ts-avatar-sentence')?.textContent ?? null,
      signIn:
        document.querySelector('[data-control="dialog.avatarBuilder.signInSentence"]')
          ?.textContent ?? null,
      apply:
        document
          .querySelector('[data-control="dialog.avatarBuilder.apply"]')
          ?.getAttribute('aria-disabled') ??
        document.querySelector('[data-control="dialog.avatarBuilder.apply"]')?.disabled ??
        null,
    })),
  );
  say(
    'shot.avatar.A.strip',
    await shotAround(A, ctl(A, 'dialog.avatarBuilder.strip'), 'A-avatar-builder-strip', 8),
  );
  await setTheme(A, 'dark');
  say(
    'shot.avatar.A.picture.dark',
    await shotAround(A, ctl(A, 'dialog.avatarBuilder'), 'A-avatar-builder-picture-dark', 24),
  );
  await setTheme(A, 'light');
  // Glyph applied: does B see the new mark?
  await ctl(A, 'dialog.avatarBuilder.tab.glyph').click();
  await A.waitForTimeout(300);
  await ctl(A, 'dialog.avatarBuilder.apply').click();
  await A.waitForTimeout(1500);
  say(
    'avatar.A.applyError',
    await ctl(A, 'dialog.avatarBuilder.error')
      .textContent()
      .catch(() => null),
  );
  if ((await ctl(A, 'dialog.avatarBuilder').count()) > 0)
    await ctl(A, 'dialog.avatarBuilder.close')
      .click()
      .catch(() => {});
  await poll(
    async () => (await state(B)).presence?.others?.some((p) => p.mark?.variant === 'glyph'),
    30_000,
  );
  say('presence.B.afterAvatar', presenceState(await state(B)));
  say('slot.B.afterAvatar', await slotFacts(B));
  say('slot.A.afterAvatar', await slotFacts(A));
  say(
    'shot.slot.B.afterAvatar',
    await shotAround(B, ctl(B, 'title.presence'), 'B-slot-after-glyph-avatar', 20),
  );
  say(
    'shot.slot.A.afterAvatar',
    await shotAround(A, ctl(A, 'title.presence'), 'A-slot-after-glyph-avatar', 20),
  );

  // B without Advanced tools: what account surface does B have?
  say(
    'B.ownChip',
    await B.evaluate(() => ({
      account: document.querySelectorAll('[data-control="title.account"]').length,
      rule: document.querySelectorAll('.ts-presence-rule').length,
    })),
  );
} catch (error) {
  say('error', error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
  await A.screenshot({ path: join(OUT, 'A-error.png') }).catch(() => {});
  await B.screenshot({ path: join(OUT, 'B-error.png') }).catch(() => {});
} finally {
  await browser.close().catch(() => {});
  if (deckId) {
    const info = await post('deck.info', deckId, {});
    say('teardown.info', { status: info.status, revision: info.json?.revision ?? null });
    let rev = info.json?.revision;
    const trash = await post('deck.trash', deckId, { id: deckId, baseRevision: rev });
    say('teardown.trash', {
      status: trash.status,
      revision: trash.json?.revision ?? null,
      error: trash.json?.error ?? null,
    });
    const info2 = await post('deck.info', deckId, {});
    rev = info2.json?.revision ?? rev;
    const remove = await post('deck.remove', deckId, {
      id: deckId,
      confirm: true,
      baseRevision: rev,
    });
    say('teardown.remove', { status: remove.status, body: remove.json });
    const gone = await fetch(`${BASE}/edit/${deckId}`, { redirect: 'manual' });
    say('teardown.editStatus', gone.status);
  }
  writeFileSync(join(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
}
