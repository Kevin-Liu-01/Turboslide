#!/usr/bin/env node
// The layout shift audit (gslides-parity SPEC-3 0.35, 9.4, 16.5; research-3 05 section 5).
//
//   node scripts/layout-shift-audit.mjs [--base http://localhost:4344] [--out <json>] [--report]
//                                       [--deck gt-brand] [--routes <csv>] [--widths <csv>]
//                                       [--appearances light,dark] [--quick] [--states <csv>]
//                                       [--no-network] [--no-variants] [--no-states]
//
// Runs against `vite preview` of the production build (never the dev server, which injects
// component CSS from JavaScript after the module loads and mounts the devtools with a second
// Inter face) in Chrome for Testing through packages/headless launch. Before any page script an
// init script installs a PerformanceObserver on `layout-shift` with `buffered: true` that records
// every entry with `hadRecentInput`, `lastInputTime` and up to five sources as class paths computed
// at record time (the node may be detached later), `performance.mark`s at first paint, fonts ready
// and hydration, `window.__ts.mark(name, phase)` around each driven state, and a frame sampler that
// records `getBoundingClientRect()` (and the print stage's transform) of a fixed anchor list per
// route on every animation frame for the first 4 s and during every state, so sub 3 px moves and
// transform only jumps the API never reports are caught.
//
// The matrix (9.4): the routes /new, /edit/<deck>, /deck/<deck>, /embed/<deck> (and a local host
// page that frames it), /decks, /decks/trash, /present/<deck>, /print/<deck>,
// /deck/<deck>?present=1; the viewports 1440 by 900, 1280 by 800 and 390 by 844 (device scale 3,
// mobile); both appearances through `gt-theme`; a reduced motion pass; the saved state variants
// (listClosed, outline, gridSaved, notesHidden, listView, sortTitle, openedHistory, hash, present);
// the driven states of 05 5.4 plus this round's (join20, follow, commentAdd, inbox, share, signIn,
// avatarBuilder, profile, ditherToggle, ditherDrag, backgroundDialog), each entered with real
// input and left; the network variants F (fonts delayed 1,500 ms), I (images delayed 1,500 ms) and
// B (JavaScript blocked, for the server frame comparison). A driven state whose control the page
// does not carry is recorded as skipped with the reason, never as a pass.
//
// The gate per run: `loadCls === 0` and `loadEntries.length === 0` (every entry, flagged or not,
// from navigation to hydration plus 3 s); every driven state's entries carry only the sources the
// state declares and fit its frame budget; runs F and I report zero entries; the B run's anchors
// match the hydrated run's. The JSON goes to --out (default
// docs/gslides-parity/verification-3/layout-shift.json) with a markdown summary beside it naming
// the failing rows by their audit id (05 section 3); exit 1 on any failure, 0 with --report.
// --quick runs 1440 light with no variants, for a builder's loop. One browser page at a time
// (AGENTS.md); the server is never started here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser } from '../packages/headless/src/launch.ts';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 || argv[i + 1] === undefined ? fallback : argv[i + 1];
};
const list = (name, fallback) => {
  const raw = value(name, null);
  return raw === null
    ? fallback
    : raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = value('base', 'http://localhost:4344').replace(/\/$/, '');
const DECK = value('deck', 'gt-brand');
const OUT = (() => {
  const raw = value('out', 'docs/gslides-parity/verification-3/layout-shift.json');
  return isAbsolute(raw) ? raw : join(ROOT, raw);
})();
const REPORT_ONLY = flag('report');
const QUICK = flag('quick');
const NETWORK = !flag('no-network') && !QUICK;
const VARIANTS = !flag('no-variants') && !QUICK;
const STATES = !flag('no-states');

const VIEWPORTS = {
  1440: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  1280: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false },
  390: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
};
const widths = (QUICK ? ['1440'] : list('widths', ['1440', '1280', '390'])).filter(
  (w) => VIEWPORTS[w] !== undefined,
);
const appearances = QUICK ? ['light'] : list('appearances', ['light', 'dark']);

/** The routes with their hydration marker and the anchors the sampler watches (05 5.2). */
const ROUTES = {
  new: { path: '/new', hydrated: '.pt-viewer[data-settled]', anchors: EDITOR_ANCHORS() },
  edit: { path: `/edit/${DECK}`, hydrated: '.pt-viewer[data-settled]', anchors: EDITOR_ANCHORS() },
  deck: { path: `/deck/${DECK}`, hydrated: '.pt-viewer[data-settled]', anchors: VIEWER_ANCHORS() },
  embed: {
    path: `/embed/${DECK}`,
    hydrated: '.pt-viewer[data-settled]',
    anchors: VIEWER_ANCHORS(),
  },
  decks: {
    path: '/decks',
    hydrated: '[data-hydrated]',
    anchors: ['.ts-home-page', '.ts-recent', '.ts-recent-head'],
  },
  trash: {
    path: '/decks/trash',
    hydrated: '[data-hydrated]',
    anchors: ['.ts-home-page', '.ts-recent'],
  },
  present: {
    path: `/present/${DECK}`,
    hydrated: '.ts-presenter:not(.ts-skeleton)',
    anchors: [
      '.ts-presenter-head',
      '.ts-presenter-stage',
      '.ts-presenter-side',
      '.ts-presenter-title',
      '.ts-presenter-clock',
    ],
  },
  print: {
    path: `/print/${DECK}`,
    hydrated: 'load',
    anchors: ['.ts-print-pages', '.ts-print-bar', 'transform:.ts-print-sheet .ts-stage'],
  },
  deckPresent: {
    path: `/deck/${DECK}?present=1`,
    hydrated: '.pt-viewer[data-settled]',
    anchors: VIEWER_ANCHORS(),
  },
};
function EDITOR_ANCHORS() {
  return [
    '.ts-title-row',
    '.ts-menubar',
    '.ts-toolbar',
    '.pt-sb',
    '.pt-main',
    '.sheet',
    '.ts-title-clock',
    '.ts-rpanel',
    '.ts-notes',
    '.ts-bottombar',
  ];
}
function VIEWER_ANCHORS() {
  return ['.pt-main', '.pt-sb', '.sheet', '.pt-bar-r', '.pt-toolbar'];
}
const routeKeys = list('routes', Object.keys(ROUTES)).filter((k) => ROUTES[k] !== undefined);

/**
 * The saved state variants (9.4): the localStorage writes the init script makes before
 * navigation, per route.
 */
const SAVED_VARIANTS = {
  deck: {
    listClosed: { 'gt-shell-sb': '0' },
    outline: { 'gt-shell-density': 'outline' },
    listClosedOutline: { 'gt-shell-sb': '0', 'gt-shell-density': 'outline' },
    gridSaved: { [`gt-shell-mode:deck:${DECK}`]: 'grid' },
    hash: { __hash: '#40' },
  },
  edit: {
    notesHidden: { 'ts-editor-settings': JSON.stringify({ speakerNotes: false }) },
    listClosed: { 'gt-shell-sb': '0' },
  },
  decks: {
    listView: { 'turboslide:home': JSON.stringify({ view: 'list', sort: 'opened' }) },
    sortTitle: { 'turboslide:home': JSON.stringify({ view: 'grid', sort: 'title' }) },
    openedHistory: {
      'turboslide:opened': JSON.stringify({
        [DECK]: new Date().toISOString(),
        'e2e-a': new Date(Date.now() - 3600e3).toISOString(),
        'e2e-b': new Date(Date.now() - 7200e3).toISOString(),
      }),
    },
  },
};

/**
 * The driven states (05 5.4 and 9.4): how the state is entered and left, the routes it runs on,
 * the sources it may move (class prefixes) and the frame budget of entries. A missing control is
 * a skip with its reason.
 */
const DRIVEN_STATES = {
  panel: {
    routes: ['edit'],
    enter: async (page) => page.keyboard.press('Meta+Alt+Shift+H'),
    leave: async (page) => page.keyboard.press('Escape'),
    // the panel column, the stage that refits beside it, the panel's own rows (the versions list
    // fills after the open) and the notes handle the stage carries (VERIFICATION-3 finding 26)
    sources: ['.sheet', '.pt-main', '.ts-rpanel', '.pt-stagewrap', '.ts-panel', '.ts-notes'],
    frames: 1,
    require: '.pt-viewer.is-editor',
  },
  menu: {
    routes: ['edit', 'new'],
    enter: async (page) => page.click('[data-control="menubar.file"]'),
    leave: async (page) => page.keyboard.press('Escape'),
    sources: [],
    frames: 0,
    require: '[data-control="menubar.file"]',
  },
  theme: {
    routes: ['deck', 'edit'],
    enter: async (page) => page.keyboard.press('d'),
    leave: async (page) => page.keyboard.press('d'),
    sources: [],
    frames: 0,
    require: '.pt-viewer',
  },
  notesOpen: {
    routes: ['edit'],
    enter: async (page) => page.keyboard.press('Meta+Alt+Shift+S'),
    leave: async (page) => page.keyboard.press('Meta+Alt+Shift+S'),
    sources: ['.sheet', '.ts-notes', '.pt-main', '.pt-stagewrap', '.ts-notes-slot'],
    frames: 1,
    require: '.pt-viewer.is-editor',
  },
  filmstrip: {
    routes: ['edit'],
    enter: async (page) => {
      await page.click('[data-control="menubar.view"]');
      await page.click('[data-menu-item="view.filmstrip"]');
    },
    leave: async (page) => {
      await page.click('[data-control="menubar.view"]');
      await page.click('[data-menu-item="view.filmstrip"]');
    },
    sources: ['.sheet', '.pt-main', '.pt-sb', '.pt-stagewrap'],
    frames: 14,
    require: '[data-control="menubar.view"]',
  },
  write: {
    routes: ['edit'],
    enter: async (page) =>
      page.evaluate(async () => {
        const studio = window.turboslide?.studio;
        if (!studio) throw new Error('no window API');
        const rows = await studio.invoke('slide.list');
        const first = rows[0];
        const info = await studio.invoke('deck.info');
        await studio.invoke('slide.setNotes', {
          slideId: first.id,
          notes: `audit ${Date.now()}`,
          baseRevision: info.revision,
        });
      }),
    leave: async () => undefined,
    sources: [],
    frames: 0,
    settleMs: 2500,
    require: '.pt-viewer.is-editor',
  },
  selectBlock: {
    routes: ['edit'],
    enter: async (page) => page.keyboard.press('Tab'),
    leave: async (page) => page.keyboard.press('Escape'),
    sources: [],
    frames: 0,
    require: '.pt-viewer.is-editor',
  },
  filter: {
    routes: ['decks'],
    enter: async (page) => page.fill('[data-control="home.search"]', 'zzzz-no-match'),
    leave: async (page) => page.fill('[data-control="home.search"]', ''),
    sources: ['.ts-recent', '.ts-cards', '.ts-rows', '.ts-home-empty'],
    frames: 1,
    require: '[data-control="home.search"]',
  },
  printNotes: {
    routes: ['print'],
    enter: async (page) => page.selectOption('[data-control="print.layout"]', 'notes'),
    leave: async (page) => page.selectOption('[data-control="print.layout"]', 'slides'),
    sources: ['.ts-print'],
    frames: 2,
    require: '[data-control="print.layout"]',
  },
  printSkipped: {
    routes: ['print'],
    enter: async (page) => page.click('[data-control="print.skipped"]'),
    leave: async (page) => page.click('[data-control="print.skipped"]'),
    sources: ['.ts-print'],
    frames: 2,
    require: '[data-control="print.skipped"]',
  },
  presenterNext: {
    routes: ['present'],
    enter: async (page) => page.keyboard.press('ArrowRight'),
    leave: async (page) => page.keyboard.press('ArrowLeft'),
    sources: [],
    frames: 0,
    require: '.ts-presenter',
  },
  timerHour: {
    routes: ['present'],
    enter: async (page) => {
      await page.clock.install();
      await page.clock.fastForward('01:00:00');
    },
    leave: async () => undefined,
    sources: [],
    frames: 0,
    require: '.ts-presenter',
  },
  backgroundDialog: {
    routes: ['edit'],
    enter: async (page) => {
      await page.click('[data-control="menubar.slide"]');
      await page.click('[data-menu-item="slide.changeBackground"]');
      await page.waitForSelector('[data-control="dialog.background"]', { timeout: 5000 });
    },
    leave: async (page) => page.keyboard.press('Escape'),
    sources: [],
    frames: 0,
    require: '[data-control="menubar.slide"]',
  },
  ditherToggle: {
    routes: ['edit'],
    enter: async (page) => {
      await page.click('[data-control="menubar.slide"]');
      await page.click('[data-menu-item="slide.changeBackground"]');
      await page.waitForSelector('[data-control="dialog.background.dither"]', { timeout: 5000 });
      // the DialogCheck's styled box covers its input: the label around it takes the click
      const toggle = page.locator('[data-control="dialog.background.dither"]').locator('xpath=..');
      await toggle.click();
      await page.waitForTimeout(400);
      await toggle.click();
    },
    leave: async (page) => page.keyboard.press('Escape'),
    sources: [],
    frames: 0,
    require: '[data-control="menubar.slide"]',
  },
  ditherDrag: {
    routes: ['edit'],
    enter: async (page) => {
      const slider = await page.$('[data-control="formatOptions.dither.black.slider"]');
      if (!slider) throw new SkipState('the Dither section is not open (Format options at Dither)');
      const box = await slider.boundingBox();
      if (!box) throw new SkipState('the slider has no box');
      await page.mouse.move(box.x + 4, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 20; i += 1)
        await page.mouse.move(box.x + (box.width * i) / 20, box.y + box.height / 2);
      await page.mouse.up();
    },
    leave: async () => undefined,
    sources: [],
    frames: 0,
    require: '[data-control="formatOptions.dither.black.slider"]',
  },
  share: {
    routes: ['edit'],
    enter: async (page) => page.click('[data-control="title.share"]'),
    leave: async (page) => page.keyboard.press('Escape'),
    sources: [],
    frames: 0,
    require: '[data-control="title.share"]',
  },
  inbox: {
    routes: ['edit'],
    enter: async (page) => page.click('[data-control="title.inbox"]'),
    leave: async (page) => page.keyboard.press('Escape'),
    sources: ['.sheet', '.pt-main', '.ts-rpanel', '.pt-stagewrap'],
    frames: 1,
    require: '[data-control="title.inbox"]',
  },
  commentAdd: {
    routes: ['edit'],
    enter: async (page) => {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Meta+Alt+M');
      await page.waitForTimeout(300);
    },
    leave: async (page) => page.keyboard.press('Escape'),
    sources: [],
    frames: 0,
    require: '[data-control="title.comments"]',
  },
  signIn: {
    routes: ['edit'],
    enter: async (page) => {
      await page.click('[data-control="title.account"]');
      await page.click('[data-menu-item="title.account.signIn"]');
    },
    leave: async (page) => page.keyboard.press('Escape'),
    sources: [],
    frames: 0,
    require: '[data-control="title.account"]',
  },
  profile: {
    routes: ['edit'],
    enter: async (page) => {
      await page.click('[data-control="title.account"]');
      await page.click('[data-menu-item="title.account.changeName"]');
    },
    leave: async (page) => page.keyboard.press('Escape'),
    sources: [],
    frames: 0,
    require: '[data-control="title.account"]',
  },
  avatarBuilder: {
    routes: ['edit'],
    enter: async (page) => {
      await page.click('[data-control="title.account"]');
      await page.click('[data-menu-item="title.account.changeAvatar"]');
    },
    leave: async (page) => page.keyboard.press('Escape'),
    sources: [],
    frames: 0,
    require: '[data-control="title.account"]',
  },
  follow: {
    routes: ['edit'],
    enter: async (page) => {
      await page.click('[data-control="title.presence.more"]');
      await page.click('[data-menu-item^="title.presence.follow"]');
    },
    leave: async (page) => page.keyboard.press('Escape'),
    sources: [],
    frames: 0,
    require: '[data-control="title.presence.more"]',
  },
  join20: {
    routes: ['edit'],
    enter: async (page) =>
      page.evaluate(async () => {
        const join = window.__tsPresenceSimulate;
        if (typeof join !== 'function')
          throw new Error('skip:no presence simulation hook (window.__tsPresenceSimulate)');
        for (let i = 0; i < 20; i += 1) {
          join(i);
          await new Promise((r) => setTimeout(r, 200));
        }
      }),
    leave: async (page) =>
      page.evaluate(async () => {
        const leave = window.__tsPresenceLeave;
        if (typeof leave === 'function') for (let i = 19; i >= 0; i -= 1) leave(i);
      }),
    sources: [],
    frames: 0,
    require: '.ts-presence',
  },
};
const stateKeys = list('states', Object.keys(DRIVEN_STATES)).filter(
  (k) => DRIVEN_STATES[k] !== undefined,
);

/** The map from a source class to the audit id of 05 section 3, for the markdown summary. */
const SOURCE_IDS = [
  ['.ts-title-clock', 'E5'],
  ['.ts-title-save', 'E5'],
  ['.ts-title-l', 'E5'],
  ['.ts-tb-tail', 'E3'],
  ['.ts-toolbar', 'E3'],
  ['.pt-stagewrap', 'E2'],
  ['.ts-notes', 'E7'],
  ['.ts-rpanel', 'E6'],
  ['.ts-card', 'E10'],
  ['.pt-thumb', 'E10'],
  ['.ts-dialog', 'E15'],
  ['.pt-main', 'D1'],
  ['.pt-sb', 'D1'],
  ['.pt-bar-l', 'D2'],
  ['.pt-bar-r', 'D2'],
  ['.pt-toolbar', 'D2'],
  ['.ts-cards', 'L1'],
  ['.ts-rows', 'L1'],
  ['.ts-recent', 'L1'],
  ['.ts-hm-card-when', 'L2'],
  ['.ts-hm-card-rename', 'L6'],
  ['.ts-hm-card-title', 'L6'],
  ['.ts-home-page', 'L5'],
  ['.ts-presenter-elapsed', 'P2'],
  ['.ts-presenter-clock', 'P3'],
  ['.ts-presenter-link', 'P3'],
  ['.ts-print-sheet', 'R1'],
  ['.ts-stage', 'R1'],
  ['.pt-slide', 'E12'],
  ['.shot', 'E12'],
  ['.picture', 'E12'],
  ['.ts-presence', 'P1'],
  ['.ts-flag', 'P2'],
  ['.ts-comment', 'P3'],
  ['.ts-following', 'P4'],
  ['.ts-snackbar', 'P5'],
  ['.ts-menubar-title', 'G1'],
  ['.pt-lb', 'G1'],
  ['.ts-card-n', 'G1'],
  ['.ts-hm-card-title', 'G1'],
];

class SkipState extends Error {}

/** Runs inside the page before any script: the observer, the marks, the sampler (05 5.2). */
const INIT_SCRIPT = ({ storage, hash, anchors, theme }) => {
  try {
    localStorage.setItem('gt-theme', theme);
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
  } catch {
    // storage refused: the default frame stands
  }
  if (hash) history.replaceState(null, '', location.pathname + location.search + hash);
  const ts = {
    shifts: [],
    marks: {},
    samples: [],
    sampling: true,
    mark(name, phase) {
      const key = phase ? `state:${name}:${phase}` : name;
      ts.marks[key] = performance.now();
      performance.mark(`ts:${key}`);
    },
    sample(on) {
      ts.sampling = on;
    },
  };
  window.__ts = ts;
  const path = (node) => {
    const parts = [];
    let el = node;
    for (let i = 0; i < 5 && el && el.nodeType === 1; i += 1) {
      const cls =
        typeof el.className === 'string' && el.className
          ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
          : '';
      const id = el.id ? `#${el.id}` : '';
      parts.unshift(`${el.tagName.toLowerCase()}${id}${cls}`);
      el = el.parentElement;
    }
    return parts.join(' > ');
  };
  try {
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        const sources = (entry.sources || []).slice(0, 5).map((s) => ({
          path: s.node ? path(s.node) : '(detached)',
          previousRect: s.previousRect
            ? [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height]
            : null,
          currentRect: s.currentRect
            ? [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height]
            : null,
        }));
        ts.shifts.push({
          startTime: entry.startTime,
          value: entry.value,
          hadRecentInput: entry.hadRecentInput,
          lastInputTime: entry.lastInputTime,
          sources,
        });
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch {
    ts.unsupported = true;
  }
  requestAnimationFrame(() => ts.mark('first-paint'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ts.mark('fonts'));
  const start = performance.now();
  const readRect = (selector) => {
    if (selector.startsWith('transform:')) {
      const el = document.querySelector(selector.slice('transform:'.length));
      return el ? getComputedStyle(el).transform : null;
    }
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [
      Math.round(r.x * 100) / 100,
      Math.round(r.y * 100) / 100,
      Math.round(r.width * 100) / 100,
      Math.round(r.height * 100) / 100,
    ];
  };
  const tick = () => {
    if (ts.sampling && (performance.now() - start < 4000 || ts.stateActive)) {
      const anchorsNow = {};
      for (const selector of anchors) anchorsNow[selector] = readRect(selector);
      ts.samples.push({ t: performance.now(), state: ts.stateActive || null, anchors: anchorsNow });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

function classify(entry) {
  for (const source of entry.sources) {
    for (const [cls, id] of SOURCE_IDS) if (source.path.includes(cls)) return id;
  }
  return '?';
}

/** The web-vitals session window (05 5.3): unflagged entries grouped within 1 s of the last and 5 s of the first. */
function sessionCls(entries) {
  let best = 0;
  let sum = 0;
  let first = -Infinity;
  let last = -Infinity;
  for (const entry of entries) {
    if (entry.hadRecentInput) continue;
    if (entry.startTime - last < 1000 && entry.startTime - first < 5000) sum += entry.value;
    else {
      sum = entry.value;
      first = entry.startTime;
    }
    last = entry.startTime;
    best = Math.max(best, sum);
  }
  return best;
}

async function settle(page, ms) {
  await page.waitForTimeout(ms);
}

async function waitHydrated(page, route) {
  if (route.hydrated === 'load') {
    await page.waitForLoadState('load');
    await settle(page, 500);
    await page.evaluate(() => window.__ts?.mark('hydrated'));
    return;
  }
  try {
    await page.waitForSelector(route.hydrated, { timeout: 30000, state: 'attached' });
  } catch {
    // no marker: the run records the blank
  }
  await page.evaluate(() => window.__ts?.mark('hydrated'));
}

/**
 * A preview deployment sits behind Vercel Authentication; with VERCEL_OIDC_TOKEN in the
 * environment (`vercel env pull`) every request the browser makes carries the Trusted Sources
 * header, as the parity audit and hosted-smoke.mjs send it (SPEC-3 16.5, the hosted run;
 * VERIFICATION-3 finding 22). Absent, the header is absent and a local base is unchanged.
 */
function protectionHeaders() {
  const token = process.env.VERCEL_OIDC_TOKEN;
  return token ? { 'x-vercel-trusted-oidc-idp-token': token } : {};
}

/** One load of one cell: the page, the marks, the load window's entries and the sampler's frames. */
async function loadCell(browser, cell) {
  const viewport = VIEWPORTS[cell.width];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    reducedMotion: cell.reducedMotion ? 'reduce' : 'no-preference',
    extraHTTPHeaders: protectionHeaders(),
  });
  const storage = { ...(cell.storage ?? {}) };
  const hash = storage.__hash ?? '';
  delete storage.__hash;
  await context.addInitScript(INIT_SCRIPT, {
    storage,
    hash,
    anchors: cell.route.anchors,
    theme: cell.appearance,
  });
  if (cell.network === 'F')
    await context.route(/\.woff2(\?|$)/, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
  if (cell.network === 'I')
    await context.route(/\/decks\/[^/]+\/assets\/|\/api\/render\//, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
  if (cell.network === 'B') await context.route(/\.js(\?|$)/, (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const target = cell.url ?? `${BASE}${cell.route.path}`;
  const t0 = Date.now();
  const response = await page.goto(target, { waitUntil: 'load', timeout: 60000 }).catch((error) => {
    errors.push(`goto: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  if (cell.network !== 'B') await waitHydrated(page, cell.route);
  else await settle(page, 1500);
  await settle(page, 3000);
  const load = await page.evaluate(() => {
    const ts = window.__ts;
    if (!ts) return { shifts: [], marks: {}, samples: [], unsupported: true };
    return {
      shifts: ts.shifts.slice(),
      marks: { ...ts.marks },
      samples: ts.samples.slice(),
      unsupported: Boolean(ts.unsupported),
    };
  });
  return { context, page, response: response?.status() ?? null, errors, load, ms: Date.now() - t0 };
}

/** The frames in which an anchor's rect changed, from the sampler's samples of one window. */
function anchorMoves(samples, options = {}) {
  const moves = [];
  const scoped = options.state
    ? samples.filter((s) => s.state === options.state)
    : samples.filter((s) => s.state === null);
  let previous = null;
  for (const sample of scoped) {
    if (previous !== null) {
      for (const [selector, rect] of Object.entries(sample.anchors)) {
        const before = previous.anchors[selector];
        if (before === null || rect === null) continue;
        const same = JSON.stringify(before) === JSON.stringify(rect);
        if (!same) moves.push({ selector, t: Math.round(sample.t), from: before, to: rect });
      }
    }
    previous = sample;
  }
  return moves;
}

async function driveState(page, name, spec, cell) {
  const result = { name, skipped: null, entries: [], frames: 0, unexpected: [], anchorMoves: [] };
  if (!spec.routes.includes(cell.routeKey)) return null;
  const present = spec.require ? await page.$(spec.require) : true;
  if (!present) {
    result.skipped = `control absent: ${spec.require}`;
    return result;
  }
  const before = await page.evaluate(() => window.__ts.shifts.length);
  await page.evaluate((n) => {
    window.__ts.stateActive = n;
    window.__ts.mark(n, 'start');
  }, name);
  try {
    await spec.enter(page);
    await settle(page, spec.settleMs ?? 900);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.skipped = message.startsWith('skip:')
      ? message.slice(5)
      : error instanceof SkipState
        ? message
        : `enter failed: ${message}`;
  }
  try {
    await spec.leave(page);
    await settle(page, 600);
  } catch {
    // leaving a state that never opened
  }
  const after = await page.evaluate((n) => {
    window.__ts.mark(n, 'end');
    window.__ts.stateActive = null;
    return { shifts: window.__ts.shifts.slice(), samples: window.__ts.samples.slice() };
  }, name);
  if (result.skipped !== null) return result;
  const entries = after.shifts.slice(before);
  result.entries = entries.map((e) => ({ ...e, id: classify(e) }));
  const frameTimes = new Set(entries.map((e) => Math.round(e.startTime / 16.7)));
  result.frames = frameTimes.size;
  result.unexpected = result.entries.filter(
    (e) => !e.sources.every((s) => spec.sources.some((allowed) => s.path.includes(allowed))),
  );
  result.overBudget = result.frames > spec.frames;
  result.anchorMoves = anchorMoves(after.samples, { state: name });
  return result;
}

function cellName(cell) {
  return [
    cell.routeKey,
    cell.width,
    cell.appearance,
    cell.variant ?? '',
    cell.network ?? '',
    cell.reducedMotion ? 'reduced' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

async function main() {
  const launched = await launchBrowser({ probeRenderer: false });
  const runs = [];
  const started = Date.now();
  const cells = [];
  for (const routeKey of routeKeys)
    for (const width of widths)
      for (const appearance of appearances) {
        const route = ROUTES[routeKey];
        cells.push({
          routeKey,
          route,
          width,
          appearance,
          states: STATES && width === '1440' && appearance === appearances[0],
        });
        if (VARIANTS) {
          for (const [variant, storage] of Object.entries(SAVED_VARIANTS[routeKey] ?? {}))
            if (width !== '390')
              cells.push({ routeKey, route, width, appearance, variant, storage });
        }
      }
  if (NETWORK) {
    for (const routeKey of ['deck', 'edit', 'decks', 'print', 'present'].filter((k) =>
      routeKeys.includes(k),
    )) {
      const route = ROUTES[routeKey];
      cells.push({ routeKey, route, width: '1440', appearance: appearances[0], network: 'F' });
      cells.push({ routeKey, route, width: '1440', appearance: appearances[0], network: 'I' });
      if (routeKey === 'deck' || routeKey === 'decks' || routeKey === 'print')
        cells.push({ routeKey, route, width: '1440', appearance: appearances[0], network: 'B' });
    }
    if (routeKeys.includes('deck'))
      cells.push({
        routeKey: 'deck',
        route: ROUTES.deck,
        width: '1440',
        appearance: appearances[0],
        reducedMotion: true,
      });
  }
  if (routeKeys.includes('embed')) {
    // a local host page framing /embed (05 5.4): the observer installs in the frame through the init script
    const host = `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="margin:0"><iframe src="${BASE}/embed/${DECK}" style="border:0;width:100vw;height:100vh"></iframe></body></html>`)}`;
    cells.push({
      routeKey: 'embed',
      route: { ...ROUTES.embed, hydrated: 'load' },
      width: '1440',
      appearance: appearances[0],
      variant: 'framed',
      url: host,
    });
  }
  process.stderr.write(`layout shift audit: ${cells.length} cells against ${BASE}\n`);
  try {
    for (const cell of cells) {
      const name = cellName(cell);
      let run;
      try {
        const loaded = await loadCell(launched.browser, cell);
        const loadEntries = loaded.load.shifts.filter(
          (e) => e.startTime <= (loaded.load.marks.hydrated ?? Infinity) + 3000,
        );
        run = {
          cell: name,
          route: cell.route.path,
          width: Number(cell.width),
          appearance: cell.appearance,
          variant: cell.variant ?? null,
          network: cell.network ?? null,
          reducedMotion: Boolean(cell.reducedMotion),
          status: loaded.response,
          ms: loaded.ms,
          unsupported: loaded.load.unsupported,
          marks: loaded.load.marks,
          loadCls: sessionCls(loadEntries),
          loadEntries: loadEntries.map((e) => ({ ...e, id: classify(e) })),
          loadAnchorMoves: anchorMoves(loaded.load.samples),
          errors: loaded.errors,
          states: [],
        };
        if (cell.states) {
          for (const stateKey of stateKeys) {
            const spec = DRIVEN_STATES[stateKey];
            const state = await driveState(loaded.page, stateKey, spec, cell);
            if (state !== null) run.states.push(state);
          }
        }
        await loaded.context.close();
      } catch (error) {
        run = {
          cell: name,
          route: cell.route.path,
          error: error instanceof Error ? error.message : String(error),
          loadEntries: [],
          states: [],
        };
      }
      const failing =
        (run.loadEntries?.length ?? 0) > 0 ||
        run.error !== undefined ||
        run.states.some((s) => s.skipped === null && (s.unexpected.length > 0 || s.overBudget));
      process.stderr.write(
        `  ${failing ? 'FAIL' : 'ok  '} ${name}${run.error ? `: ${run.error}` : ''}${run.loadEntries?.length ? ` (${run.loadEntries.length} load entries)` : ''}\n`,
      );
      runs.push(run);
    }
  } finally {
    await launched.close();
  }
  const failures = [];
  for (const run of runs) {
    if (run.error) failures.push({ cell: run.cell, id: '?', why: run.error });
    for (const entry of run.loadEntries ?? [])
      failures.push({
        cell: run.cell,
        id: entry.id,
        why: `load entry ${entry.value.toFixed(4)} from ${entry.sources.map((s) => s.path).join(' | ') || '(no source)'}`,
      });
    if (run.network === 'B' && run.loadAnchorMoves?.length)
      failures.push({
        cell: run.cell,
        id: 'D2',
        why: `anchors moved with scripts blocked: ${run.loadAnchorMoves.map((m) => m.selector).join(', ')}`,
      });
    for (const state of run.states ?? []) {
      if (state.skipped !== null) continue;
      for (const entry of state.unexpected)
        failures.push({
          cell: run.cell,
          id: entry.id,
          why: `state ${state.name}: ${entry.sources.map((s) => s.path).join(' | ') || '(no source)'}`,
        });
      if (state.overBudget)
        failures.push({
          cell: run.cell,
          id: '?',
          why: `state ${state.name}: entries in ${state.frames} frames`,
        });
    }
  }
  const skipped = runs.flatMap((run) =>
    (run.states ?? [])
      .filter((s) => s.skipped !== null)
      .map((s) => `${run.cell}: ${s.name} (${s.skipped})`),
  );
  const summary = {
    base: BASE,
    deck: DECK,
    startedAt: new Date(started).toISOString(),
    ms: Date.now() - started,
    renderer: launched.renderer,
    version: launched.version,
    cells: runs.length,
    failures,
    skipped,
    runs,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(OUT.replace(/\.json$/, '.md'), markdown(summary));
  process.stderr.write(
    `${failures.length} failure(s), ${skipped.length} skipped state(s); ${OUT}\n`,
  );
  process.exit(failures.length > 0 && !REPORT_ONLY ? 1 : 0);
}

function markdown(summary) {
  const lines = [
    '# Layout shift audit',
    '',
    `Base ${summary.base}, deck ${summary.deck}, ${summary.cells} cells in ${Math.round(summary.ms / 1000)} s, Chromium ${summary.version} (${summary.renderer}), ${summary.startedAt}.`,
    '',
    '| Cell | Status | Load CLS | Load entries | States run | States skipped |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const run of summary.runs) {
    const states = run.states ?? [];
    lines.push(
      `| ${run.cell} | ${run.error ? 'error' : (run.status ?? '')} | ${run.loadCls === undefined ? '' : run.loadCls.toFixed(4)} | ${run.loadEntries?.length ?? ''} | ${states.filter((s) => s.skipped === null).length} | ${states.filter((s) => s.skipped !== null).length} |`,
    );
  }
  lines.push('', '## Failures', '');
  if (summary.failures.length === 0)
    lines.push(
      'None: every cell loaded with zero entries and every driven state moved only its declared sources.',
    );
  else {
    lines.push('| Cell | Audit id | Why |', '| --- | --- | --- |');
    for (const failure of summary.failures)
      lines.push(`| ${failure.cell} | ${failure.id} | ${failure.why.replace(/\|/g, '/')} |`);
  }
  lines.push('', '## Skipped states', '');
  if (summary.skipped.length === 0) lines.push('None.');
  else for (const line of summary.skipped) lines.push(`- ${line}`);
  lines.push('');
  return lines.join('\n');
}

main().catch((error) => {
  process.stderr.write(
    `layout shift audit: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(2);
});
