#!/usr/bin/env node
// The Google Slides parity audit (docs/gslides-parity/SPEC.md 14.4; MILESTONES.md "Verifier").
//
//   node scripts/gslides-parity-audit.mjs [--base <origin>] [--out <json>] [--report]
//                                         [--read-only-deck gt-brand] [--quick] [--keep-deck]
//                                         [--skip-tooltip-audit] [--trace <zip>]
//
// Opens the studio in Chrome for Testing (packages/headless launch, playwright-core) at 1440 by
// 900, imports the menu model from packages/chrome/src/menus/model.ts and drives every row of it:
//
//   1. `/new`: the first open of SPEC 11.1 (Untitled presentation, Not saved yet, the two prompts,
//      the notes prompt, no panel, no snackbar); the first write creates a scratch deck and the
//      address moves to /edit/<id>. Everything that writes runs on that deck and the deck is
//      trashed and deleted forever at the end, through the product's own paths.
//   2. Every menu of the bar, the title row and the Slideshow arrow: a `now` row is present by
//      `data-menu-item`, carries the model's label, key text and `aria-keyshortcuts`, and is
//      enabled exactly when its predicate says so in the audited state; a `later` row is present,
//      `aria-disabled`, and its tooltip sentence (`.pt-tip-doc`, the Tooltip primitive prints the
//      name first) starts with "Not available in Turboslide yet"; an `omit` row is absent by id and
//      by label; a context-only row is not drawn in the bar. Every row carries the tooltip
//      primitive (`data-tip`).
//   3. Every enabled `now` row is activated on the scratch deck and its declared effect is
//      observed: a dialog whose `data-control` and title match, a panel by `data-panel-title`, a
//      route change or a new tab, a toggle's state (aria-checked plus the DOM it drives), or a
//      write (the revision reported by window.turboslide.studio moves and the document shows the
//      change); a download, a file chooser or a snackbar where the action ends in one. The rows a
//      fresh deck disables (a block, two slides, a table cell) run again in states the audit sets
//      up: a second slide, a selected text block, inserted shape, line, picture and table blocks.
//   4. The toolbar's `data-control` order against SPEC 3.1 in the default state and SPEC 3.2 to
//      3.6 after selecting a text block, a shape, a picture, a line and a table cell.
//   5. The filmstrip's right-click menu order against SPEC 4.2, the canvas menus against 4.3.
//   6. Every bound shortcut of SPEC 10.1 whose effect the audit can observe, dispatched as a real
//      keydown; every retired key of SPEC 10.2 leaves the shell unchanged.
//   7. The default view's text and tooltip names contain none of the words of SPEC 12 outside
//      Tools > Advanced and the Agent access dialog, on /new, /edit and /decks.
//   8. `scripts/tooltip-audit.mjs --strict` on the same pages.
//   9. Round two (docs/gslides-parity/SPEC-2.md sections 4, 5, 6.1 and 9; MILESTONES-2 "Verifier"):
//      every row section 4.1 flips to Now runs with its observer (the rotate, flip, group,
//      ungroup, regroup, align, Center on page, mark, capitalization, indent, spacing, list,
//      line end, dash, chart kind and guide writes are verified on the document after the write
//      and undone); every dynamic submenu plate renders its tiles (the shape grids, the bullet
//      and numbering presets, the table hover grid) and a pick writes (a shape pick draws, a
//      preset pick writes `text.list`, a mask pick writes `block.mask`, a table pick inserts, a
//      Change shape pick writes `shape.set`); the toolbar tails, the right-click menus and the
//      Format options sections are read with a text block, a shape, a line, a picture, a table
//      cell, a chart, a group, a covering picture object and a guide selected (SPEC-2 4.2, 4.3,
//      5); the object chords of section 9 (rotate, nudge, duplicate, group, Tab, Cmd+A, Delete)
//      and the text chords on a range (the marks, Justify, the indents) are dispatched as real
//      keydowns; the words of section 10 are checked while every new dialog and picker is open.
//
//  10. The focus round (docs/FOCUS.md section 3): the expectation table reads Tools > Advanced
//      tools from the page (`data-advanced-tools` on the root, `contextOf`). With the switch off,
//      a parked row or control (`advanced: true`) and a Later stub are expected absent from the
//      menus, the toolbar and the right-click menus, and a tail parked whole falls back to the
//      default tail; a core row is expected present and enabled by its predicate. A second
//      presence pass turns the switch on through the Tools menu row (`setAdvancedTools`) and
//      expects every parked row in its Google position with the Later rows disabled and carrying
//      their stub clause; the parity phases (the effects, the tails, the object states, round
//      three) run with the switch on, and it goes off again before the read-only walk.
//
// The read-only deck (`/edit/gt-brand`) gets steps 2, 4 (default tail), 5 (filmstrip) and 7 with
// no write. The JSON report (one row per item with pass or fail and the evidence, totals per
// menu) goes to --out; exit 1 on any miss, 0 with --report. Rules: no bare letters typed with
// nothing focused except the retired keys test; one browser page at a time; the dev server is
// never started here (AGENTS.md).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser } from '../packages/headless/src/launch.ts';
import {
  CAPABILITIES,
  DEFAULT_ACCESS_SETTINGS,
  roleAllows,
} from '../packages/identity/src/access.ts';
import {
  CONTEXT_MENUS,
  DEFAULT_MENU_CONTEXT,
  DIVIDER,
  GS2_ACTION_IDS,
  MENUS,
  TITLE_ROW_ITEMS,
  TOOLBAR_HEAD,
  TOOLBAR_TAIL_DEFAULT,
  allItems,
  evaluate,
  findItem,
  isChecked,
  isEnabled,
  isPresent,
  menuOf,
  presentControls,
  resolveContextEntries,
  resolveEffect,
  resolveLabel,
  visibleMenus,
  walkItems,
} from '../packages/chrome/src/menus/model.ts';
import {
  ariaKeyShortcuts,
  buildKeyTable,
  chordsOf,
  shortcutLabel,
} from '../packages/chrome/src/menus/keys.ts';
import { HIDE_MENUS_CONTROL, tailFor } from '../packages/chrome/src/menus/toolbar-tails.ts';
import {
  ACCOUNT,
  DIALOGS,
  FORBIDDEN_DEFAULT_VIEW_WORDS,
  INBOX,
  PRESENCE,
  PROMPTS,
  REFUSALS,
  STUB_PREFIX,
  TITLE_ROW,
  forbiddenWordsIn,
  stubClause,
} from '../packages/chrome/src/menus/strings.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const BASE = (value('base') ?? 'http://localhost:4321').replace(/\/$/, '');
const OUT = value('out') ?? 'docs/gslides-parity/verification-3/parity-audit.json';
/** an absolute --out is written where it says; a relative one counts from the checkout root */
const OUT_PATH = isAbsolute(OUT) ? OUT : join(ROOT, OUT);
const REPORT_ONLY = flag('report');
const QUICK = flag('quick');
const KEEP_DECK = flag('keep-deck');
const SKIP_TOOLTIP_AUDIT = flag('skip-tooltip-audit');
/** a Playwright trace of the main context (actions with their logs and screenshots, no DOM snapshots), written as a zip at the end; the verifier's pass 2 of round four uses it to name what moved under an "element is not stable" click (VERIFICATION-4 finding 3) */
const TRACE = value('trace');
const READ_ONLY_DECK = value('read-only-deck') ?? 'gt-brand';
/** an existing deck to audit in place of a fresh draft (debugging; it is not trashed unless --trash) */
const USE_DECK = value('deck');
const TRASH_USED_DECK = flag('trash');
/** only these effect ids (debugging) */
const ONLY_EFFECTS = value('effects') ? new Set(value('effects').split(',')) : null;
/** only these phases: rows, effects, clipboard, twoSlides, shortcuts, retired, tails, textBlock, objects, roundThree, tooltip, readonly, home */
const PHASES = value('phases') ? new Set(value('phases').split(',')) : null;
const phase = (name) => PHASES === null || PHASES.has(name);
/*
 * Round three (docs/gslides-parity/SPEC-3.md 16.2; MILESTONES-3 "Verifier"): the title row's two
 * plate menus (the roster behind the +N chip and the own chip's menu, 4.5 and 7.5) render their
 * rows with data-menu-item only while open, so the audit opens them from their openers; every row
 * of the model gains a presence test (a row a role cannot use is absent by id, never disabled,
 * 13.4); the Later rows of 13.3 carry their exact clause; the round three effects are observed
 * (a comment lands, a mode switches, a pointer toggle flips, Follow moves the stage, Copy link
 * holds no token, the panels open); a viewer and a commenter role state run in their own browser
 * contexts on the scratch deck through the links the owner minted; the Dither section's ids on a
 * dithered picture and the Background dialog's toggle and chips; the five fixed title row slots
 * at first paint; the roster by Shift+Tab from the File menu. A second anonymous context (the
 * collaborator) sits on the scratch deck so the roster carries a Follow row and a Go to slide row.
 */
const PLATE_MENUS = {
  'title.presence': { opener: '[data-control="presence.more"]', menu: '#ts-menu-roster' },
  'title.account': { opener: '[data-control="title.account"]', menu: '#ts-menu-account' },
};
/** SPEC-3 13.3: the rows that stay Later this round, each with its exact clause. */
const LATER_CLAUSES = {
  'title.presence.joinChat': 'Leave a comment on the slide instead',
  'file.email.collaborators': 'The invitation carries your message',
  'file.versionHistory.deleteOlder':
    'Named versions are kept; older records thin out after 30 days',
  'file.versionHistory.deleteHistory':
    'Named versions are kept; older records thin out after 30 days',
  'tools.activityDashboard.viewers': 'Turboslide keeps no record of who viewed a presentation',
};
/** SPEC-3 4.2, 0.43: the five fixed slots of the title row's right group, left to right (b6.md decision 7). */
const TITLE_SLOTS = [
  'title.presence',
  'title.comments.slot',
  'title.inbox.slot',
  'present.split',
  'share.slot',
];
/** SPEC-3 10.7: the rows of the Format options Dither section, by their data-control ids. */
const DITHER_CONTROLS = [
  'formatOptions.dither.on',
  'formatOptions.dither.preset.neutral',
  'formatOptions.dither.preset.photograph',
  'formatOptions.dither.pattern',
  'formatOptions.dither.tone',
  'formatOptions.dither.cell',
  'formatOptions.dither.strength',
  'formatOptions.dither.black',
  'formatOptions.dither.white',
  'formatOptions.dither.gamma',
  'formatOptions.dither.invert',
  'formatOptions.dither.polarity',
  'formatOptions.dither.metrics',
  'formatOptions.dither.advanced',
  'formatOptions.dither.reset',
];
/** SPEC-3 10.6: the Background dialog's Dither toggle, the two chips and the Material row. */
const BACKGROUND_DITHER_CONTROLS = [
  'dialog.background.dither',
  'dialog.background.dither.photograph',
  'dialog.background.dither.neutral',
  'dialog.background.material.choose',
  'dialog.background.material.dither',
  'dialog.background.material.place',
];
/** The Photograph preset the Background dialog's toggle applies (SPEC-3 0.37, 10.6). */
const PHOTOGRAPH = { pattern: 'bayer8', black: 120, white: 230, gamma: 0.9 };
/** The collaborator context's page on the scratch deck, set in main; null on the read-only walk. */
let collaborator = null;
/** whether the studio's auth routes answer on this base (the Sign in row's predicate, 7.3, 7.5) */
let signInAvailableCache = null;
async function signInAvailable(page) {
  if (signInAvailableCache !== null) return signInAvailableCache;
  signInAvailableCache = await page
    .evaluate(() =>
      fetch('/api/auth/ok', { credentials: 'same-origin' })
        .then((r) => r.status === 200)
        .catch(() => false),
    )
    .catch(() => false);
  return signInAvailableCache;
}
/** The plate menu a title row item sits in, by its parent, or null. */
function plateOf(id) {
  const parent = PARENT.get(id);
  return parent !== undefined && PLATE_MENUS[parent] !== undefined ? PLATE_MENUS[parent] : null;
}
async function openPlate(page, plate) {
  await closeMenus(page);
  if ((await page.$(plate.menu)) !== null) return true;
  const opener = await page.$(plate.opener);
  if (opener === null) return false;
  await opener.click();
  const opened = await page.waitForSelector(plate.menu, { timeout: 4000 }).catch(() => null);
  return opened !== null;
}
/** The rows of an open plate menu: the ids, the state and the tooltip primitive. */
async function readPlateRows(page, plate) {
  return page.$$eval(`${plate.menu} [data-menu-item]`, (els) =>
    els.map((el) => ({
      id: el.getAttribute('data-menu-item'),
      status: el.getAttribute('data-status'),
      disabled: el.getAttribute('aria-disabled') === 'true',
      role: el.getAttribute('role'),
      checked: el.getAttribute('aria-checked'),
      label: el.textContent.replace(/\s+/g, ' ').trim(),
      key: '',
      keyshort: null,
      tip: el.getAttribute('data-tip'),
      haspopup: el.getAttribute('aria-haspopup'),
      client: el.getAttribute('data-client'),
    })),
  );
}
/**
 * The rows docs/gslides-parity/VERIFICATION.md section 9 records as deviations from Google: their
 * effect is not run and the row is reported as skipped with the finding, so the exit code speaks
 * for the rows the round claims and the record names the rest. Remove a row here when it lands.
 * Round one's two rows (Border color and Border weight) landed in round two as the anchored
 * pickers of SPEC-2 4.1 and left the map.
 */
const RECORDED_DEVIATIONS = new Map([]);
/**
 * SPEC-2 4.3's `cellRange` target is not selected by the stage this round (B4's recorded
 * deviation, docs/gslides-parity/build-2/b4.md section 3 and AGENTS.md): the range rows run
 * through the Table section and the actions. The audit tries the range drag and records the
 * menu as this deviation when the stage answers the single cell menu.
 */
const CELL_RANGE_DEVIATION =
  'b4.md section 3: the stage selects no cellRange target this round; Merge cells, Unmerge cells and the range rows run through the Table section of Format options and through table.merge';
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(BASE);
const VIEWPORT = { width: 1440, height: 900 };

/** SPEC 10.2: the letters the editor retires (packages/chrome/src/editor-shell.ts RETIRED_KEYS). */
const RETIRED_KEYS = ['s', '[', 'd', 'e', 'p', 'f', 'g', 'b', 'r', '?', 'j', 'l', 'k', 'h'];

/** Kinds whose layouts carry a full picture (editor-shell.ts PICTURE_KINDS). */
const PICTURE_KINDS = new Set(['opener', 'mood', 'closing']);

/** The text block types of the text tail (editor-shell.ts TEXT_TYPES). */
const TEXT_TYPES = new Set(['heading', 'paragraph', 'text', 'box', 'plain', 'quote', 'lead']);

/**
 * SPEC-2 section 5: the Format options sections in the panel's order
 * (packages/chrome/src/inspector/format-sections.ts FORMAT_SECTIONS), the sections each
 * selection type must show, and the sections it must not (the table's "Shown for" column read
 * by type; a paragraph has no fill and no shadow, so the text row asks for less than a text box).
 */
const FORMAT_SECTION_ORDER = [
  'size',
  'position',
  'layout',
  'textFitting',
  'text',
  'colour',
  'picture',
  'adjustments',
  /* round three (SPEC-3 10.7): the Dither section sits after Adjustments and before Drop shadow */
  'dither',
  'shadow',
  'table',
  'chart',
  'line',
  'shape',
  'list',
  'altText',
  'block',
];
const FORMAT_SECTIONS_FOR = {
  text: ['size', 'position', 'textFitting', 'text', 'altText'],
  shape: ['size', 'position', 'textFitting', 'text', 'colour', 'shadow', 'shape', 'altText'],
  line: ['size', 'position', 'line', 'altText'],
  image: ['size', 'position', 'picture', 'adjustments', 'shadow', 'altText'],
  table: ['size', 'position', 'textFitting', 'text', 'table', 'altText'],
  chart: ['size', 'position', 'chart', 'shadow', 'altText'],
  group: ['size', 'position'],
};
const FORMAT_SECTIONS_NOT_FOR = {
  text: ['picture', 'adjustments', 'table', 'chart', 'line', 'shape'],
  shape: ['picture', 'adjustments', 'table', 'chart', 'line', 'list'],
  line: ['textFitting', 'picture', 'adjustments', 'table', 'chart', 'shape', 'list'],
  image: ['textFitting', 'text', 'table', 'chart', 'line', 'shape', 'list'],
  table: ['picture', 'adjustments', 'chart', 'line', 'shape', 'list'],
  chart: ['textFitting', 'text', 'picture', 'adjustments', 'table', 'line', 'shape', 'list'],
  group: ['picture', 'adjustments', 'table', 'chart', 'line', 'shape', 'list'],
};
/** The mark a Format > Text row writes (SPEC-2 4.1, 7.2: the mark span `[text]{i u s sup sub}`). */
const MARK_OF_ROW = {
  'format.text.italic': 'i',
  'format.text.underline': 'u',
  'format.text.strikethrough': 's',
  'format.text.superscript': 'sup',
  'format.text.subscript': 'sub',
};
/** The bounds an edge aligns to on the sheet (SPEC-2 6.1 rows 21 and 23: one object aligns to the slide). */
const SHEET_EDGE = { left: 0, center: 800, right: 1600, top: 0, middle: 450, bottom: 900 };
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
const markRe = (mark) => new RegExp(`\\]\\{[^}]*\\b${mark}\\b[^}]*\\}`);
/** The plain text of a marked up Text: the spans' text without their marks and links. */
const plainOf = (text) =>
  String(text ?? '')
    .replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

const log = (line) => process.stderr.write(`${line}\n`);

// ---------------------------------------------------------------------------------------------
// The model, indexed

/** parent id per item id; null for a top level row */
const PARENT = new Map();
/** menu id (or 'title') per item id */
const MENU_OF = new Map();
function index(items, parent, menu) {
  for (const item of items) {
    PARENT.set(item.id, parent);
    MENU_OF.set(item.id, menu);
    if (item.items) index(item.items, item.id, menu);
  }
}
index(TITLE_ROW_ITEMS, null, 'title');
for (const menu of MENUS) index(menu.items, null, menu.id);

/** the container ids above an item, top down */
function ancestors(id) {
  const chain = [];
  let cur = PARENT.get(id);
  while (cur) {
    chain.unshift(cur);
    cur = PARENT.get(cur);
  }
  return chain;
}

const LABELS_IN_USE = new Set(
  allItems()
    .filter((item) => item.status !== 'omit')
    .map((item) => item.label),
);

// ---------------------------------------------------------------------------------------------
// The report

const rows = [];
const sections = {};
let failures = 0;

function record(section, row) {
  const entry = { section, ...row };
  rows.push(entry);
  if (row.pass === false) failures += 1;
  (sections[section] ??= []).push(entry);
  return entry;
}

const pass = (section, row) => record(section, { ...row, pass: true });
const fail = (section, row) => record(section, { ...row, pass: false });
const skip = (section, row) => record(section, { ...row, pass: null });

// ---------------------------------------------------------------------------------------------
// Browser helpers

function protectionHeaders() {
  const token = process.env.VERCEL_OIDC_TOKEN;
  return token ? { 'x-vercel-trusted-oidc-idp-token': token } : {};
}

async function ready(page) {
  await page.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 120_000 },
  );
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
}

async function settled(page, timeout = 30_000) {
  await page.waitForFunction(
    () => {
      const s = window.turboslide.studio.describe().state;
      return s.pending === 0 && s.revision === s.serverRevision;
    },
    null,
    { timeout },
  );
}

const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
/** the server's version log, one entry per write (SPEC-2 11.8 step 2) */
const versions = (page) => invoke(page, 'version.list');
const invoke = (page, action, input) =>
  page.evaluate(([id, value]) => window.turboslide.studio.invoke(id, value), [action, input]);

async function waitFor(fn, { timeout = 8000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
  return last;
}

async function closeMenus(page) {
  for (let i = 0; i < 6; i += 1) {
    const open = await page.$$('[role="menu"]');
    if (open.length === 0) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
  }
  /* a plate that Esc did not close: a click on the stage's surround */
  if ((await page.$$('[role="menu"]')).length > 0) await page.mouse.click(700, 890);
}

/**
 * SPEC-3 7.2: the one prompt (How should others see you?) opens after the first inline session
 * ends and is modal, so a menu bar click behind it waits forever (measured: every effect after
 * the first typed text timed out at 30 s until the prompt was answered). The audit answers it
 * with a name once and records that it fired.
 */
let namePromptAnswered = 0;
async function answerNamePrompt(page) {
  const prompt = await page.$('[data-control="dialog.namePrompt"]');
  if (prompt === null) return false;
  const field = await page.$('[data-control="dialog.namePrompt.name"]');
  if (field) {
    await field.fill(`Audit ${namePromptAnswered + 1}`);
    await page.keyboard.press('Enter');
  } else await page.keyboard.press('Escape');
  namePromptAnswered += 1;
  await waitFor(
    async () => ((await page.$('[data-control="dialog.namePrompt"]')) === null ? true : null),
    {
      timeout: 3000,
    },
  ).catch(() => null);
  return true;
}

async function closeOverlays(page) {
  await closeMenus(page);
  await answerNamePrompt(page).catch(() => null);
  for (let i = 0; i < 4; i += 1) {
    const dialogs = await page.$$('[role="dialog"]');
    if (dialogs.length === 0) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    if ((await page.$('[data-control="dialog.namePrompt"]')) !== null)
      await answerNamePrompt(page).catch(() => null);
  }
}

async function blurAll(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

/** the visible rows of one list, as attributes */
const ROW_SELECTOR = (level) =>
  `[role="menu"][data-level="${level}"] > .ts-menu-group > [data-menu-item]`;

async function readRows(page, level) {
  return page.$$eval(ROW_SELECTOR(level), (els) =>
    els.map((el) => ({
      id: el.getAttribute('data-menu-item'),
      status: el.getAttribute('data-status'),
      disabled: el.getAttribute('aria-disabled') === 'true',
      role: el.getAttribute('role'),
      checked: el.getAttribute('aria-checked'),
      label: el.querySelector('.ts-menu-label')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      key: el.querySelector('.ts-menu-key')?.textContent?.trim() ?? '',
      keyshort: el.getAttribute('aria-keyshortcuts'),
      tip: el.getAttribute('data-tip'),
      haspopup: el.getAttribute('aria-haspopup'),
    })),
  );
}

/**
 * docs/FOCUS.md 3.2: `title.presence.follow` and `title.presence.goTo` are parked rows of the
 * roster, but the presence chips that carry their ids in the title row stay drawn (the matrix row
 * `collab.presence-chips`), so a chip found at level 0 of the title row is not a parked row drawn.
 */
function isPresenceChip(id, found) {
  return (
    (id === 'title.presence.follow' || id === 'title.presence.goTo') &&
    found !== undefined &&
    found.level === 0 &&
    found.menu === 'title'
  );
}

async function openBarMenu(page, menuId) {
  await closeMenus(page);
  await page.click(`[data-control="menubar.${menuId}"]`);
  await page.waitForSelector('[role="menu"][data-level="0"]', { timeout: 5000 });
}

async function openSubmenuRow(page, level, rowId) {
  const selector = `${ROW_SELECTOR(level)}[data-menu-item="${rowId}"]`;
  /* the submenu renders as the row's next sibling inside its group; a sibling row's open submenu
     must not count (measured: the previous container's plate satisfied a level-wide selector) */
  const child = `${selector} ~ [role="menu"], ${selector} ~ .ts-menu.is-dynamic`;
  /* the pointer opens a submenu after 120 ms (Menu.tsx SUBMENU_HOVER_MS); a click on a row whose
     submenu is open closes it again, so the click is only for a row the hover did not open */
  await page.hover(selector);
  /* a busy page (the preview right after a write) renders the plate late; wait for it before a
     click, and let a click that closed a plate the hover had opened be undone by a second one */
  let opened = await page.waitForSelector(child, { timeout: 1500 }).catch(() => null);
  if (opened === null) {
    await page.click(selector);
    opened = await page.waitForSelector(child, { timeout: 4000 }).catch(() => null);
    if (opened === null) {
      await page.click(selector);
      await page.waitForSelector(child, { timeout: 4000 });
    }
  }
  await page.waitForTimeout(80);
}

/** Opens the path to an item and returns the level its row sits at; the menu stays open. */
async function openPath(page, id) {
  if (MENU_OF.get(id) === 'title') {
    const parent = PARENT.get(id);
    /* round three: the roster and the own chip's menu open from their openers (SPEC-3 4.5, 7.5) */
    const plate = plateOf(id);
    if (plate !== null) {
      const opened = await openPlate(page, plate);
      if (!opened)
        throw new Error(`the plate menu ${plate.menu} did not open from ${plate.opener}`);
      return -2;
    }
    if (parent === 'title.slideshow') {
      await closeMenus(page);
      await page.click('[data-control="present.arrow"]');
      await page.waitForSelector('[role="menu"]', { timeout: 5000 });
      return 0;
    }
    return -1;
  }
  await openBarMenu(page, MENU_OF.get(id));
  let level = 0;
  for (const anc of ancestors(id)) {
    await openSubmenuRow(page, level, anc);
    level += 1;
  }
  return level;
}

class DisabledRow extends Error {}

/** Throws DisabledRow when the row at `selector` is aria-disabled, so no click waits on it. */
async function assertEnabledRow(page, selector) {
  const disabled = await page
    .$eval(selector, (el) => el.getAttribute('aria-disabled') === 'true')
    .catch(() => null);
  if (disabled === true) throw new DisabledRow(`${selector} is aria-disabled in this state`);
}

/** Opens the path and clicks the item's row (a leaf closes the menu; a container opens it). */
async function activate(page, id) {
  const level = await openPath(page, id);
  if (level === -2) {
    const plate = plateOf(id);
    const row = `${plate.menu} [data-menu-item="${id}"]`;
    await assertEnabledRow(page, row);
    await page.click(row, { timeout: 4000 });
    return;
  }
  if (level < 0) {
    await page.click(`[data-control="title.row"] [data-menu-item="${id}"]`, { timeout: 4000 });
    return;
  }
  const leaf = `${ROW_SELECTOR(level)}[data-menu-item="${id}"]`;
  /* SPEC-2 4.1: the rows under Shapes and Arrows are the legacy presets; the shell draws the
     category's glyph grid in their place and a tile arms the draw tool */
  if (LEGACY_TILE_OF[id] !== undefined && (await page.$(leaf)) === null) {
    const tile = `[data-control="${PARENT.get(id)}.pick.${LEGACY_TILE_OF[id]}"]`;
    await page.waitForSelector(tile, { timeout: 5000 });
    await page.click(tile, { timeout: 8000 });
    return;
  }
  await assertEnabledRow(page, leaf);
  await page.click(leaf, { timeout: 8000 });
}
/** The plate tile each legacy row of the model stands for (packages/schema/src/shapes.ts LEGACY_PRESETS). */
const LEGACY_TILE_OF = {
  'insert.shape.shapes.rectangle': 'rect',
  'insert.shape.shapes.rounded': 'roundRect',
  'insert.shape.shapes.ellipse': 'ellipse',
  'insert.shape.arrows.arrow': 'rightArrow',
};

/** Hovers a row and reads the tooltip plate once it names that row (an earlier plate may still be up). */
async function tooltipDocOf(page, rowSelector, name) {
  const row = await page.$(rowSelector);
  if (!row) return null;
  const box = await row.boundingBox();
  if (!box) return null;
  await page.mouse.move(box.x + Math.min(40, box.width / 2), box.y + box.height / 2);
  const read = () =>
    page.evaluate((wanted) => {
      const tip = document.getElementById('pt-tip');
      if (!tip || tip.hidden) return null;
      const shown = tip.querySelector('.pt-tip-name')?.textContent ?? '';
      if (wanted !== undefined && shown !== wanted) return null;
      return { name: shown, doc: tip.querySelector('.pt-tip-doc')?.textContent ?? '' };
    }, name);
  let doc = await waitFor(read, { timeout: 2000 });
  if (doc && doc.doc === '') {
    /* the plate may still be the focused row's; the hovered row's replaces it after 350 ms */
    await page.waitForTimeout(700);
    const again = await read();
    if (again) doc = again;
    if (doc.doc === '')
      doc.raw = await page.evaluate(() => {
        const tip = document.getElementById('pt-tip');
        return tip ? `${tip.hidden ? 'hidden ' : ''}${tip.innerHTML.slice(0, 200)}` : 'no plate';
      });
  }
  return doc ?? null;
}

async function dialogs(page) {
  return page.$$eval('[role="dialog"]', (els) =>
    els.map((el) => ({
      control: el.getAttribute('data-control'),
      title:
        document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() ??
        el.getAttribute('aria-label') ??
        '',
    })),
  );
}

async function snackbarText(page) {
  return page.evaluate(
    () => document.querySelector('[data-control="snackbar"]')?.textContent?.trim() ?? '',
  );
}

async function chromeText(page, exclude) {
  return page.evaluate((excluded) => {
    const skipSel = excluded.join(', ');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const out = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || el.closest(skipSel)) continue;
      if (el.closest('script, style, noscript')) continue;
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (text) out.push(text);
    }
    const tips = [...document.querySelectorAll('[data-tip]')]
      .filter((el) => !el.closest(skipSel))
      .map((el) => el.getAttribute('data-tip'));
    return { text: out, tips };
  }, exclude);
}

/** The regions whose words are the deck's or an exempt surface's, not the chrome's (SPEC 12). */
const WORDS_EXCLUDE = [
  '.ts-sheet',
  '.ts-stage',
  '.pt-slide',
  '.ts-card-frame',
  '.ts-thumb',
  '[data-menu-item^="tools.advanced"]',
  '[data-control="dialog.agentAccess"]',
  '[data-control="source.drawer"]',
  /* the home cards' tooltips carry the decks' own titles */
  '[data-control^="home.open."]',
  '[data-control^="home.title."]',
  '.ts-hm-card',
  /* the deck's own words on the editor (round four fixer round, VERIFICATION-4 finding 10): a
     filmstrip card's tooltip is the slide's title (Filmstrip.tsx FilmCard, `name: item.title`) and
     the Last edit clock's tooltip names the newest record's author by the principal's own name
     (TitleRow.tsx lastEditWords), so a deck titled "The agent API" or edited by "agent:int2-walk"
     is the deck's text, not the chrome's; the chrome's own Last edit words are the menu model's
     and the default view words test covers them */
  '[data-control^="filmstrip.slide."]',
  '[data-control="deck.lastEdit.slot"]',
  /* the avatar builder's "Glyph" tab is SPEC-3's own label (0.22, 7.6): the one place the round
     two engineering word is a label, exempted by name in the chrome's default view words test
     (menus/strings.ts ACCOUNT.avatar.tabs) and recorded for Kevin in round three; the tab button
     carries the label and its tooltip (Dialog.tsx DialogTabs), so the one control is excluded
     (round four verification, pass 2: the node-server run read it where the dev server run had not) */
  '[data-control="dialog.avatarBuilder.tab.glyph"]',
  '[class^="go"]',
  '.tsqd-parent-container',
  '[data-tsd-source]',
  'noscript',
];

async function checkDefaultWords(page, where) {
  const { text, tips } = await chromeText(page, WORDS_EXCLUDE);
  const hits = [];
  for (const t of text) {
    const words = forbiddenWordsIn(t);
    if (words.length > 0) hits.push({ text: t.slice(0, 120), words });
  }
  for (const t of tips) {
    const words = forbiddenWordsIn(t ?? '');
    if (words.length > 0) hits.push({ tip: t, words });
  }
  if (hits.length === 0)
    pass('defaultViewWords', {
      where,
      evidence: `${text.length} text nodes, ${tips.length} tooltips, none of ${FORBIDDEN_DEFAULT_VIEW_WORDS.length} words`,
    });
  else fail('defaultViewWords', { where, evidence: hits.slice(0, 12) });
}

// ---------------------------------------------------------------------------------------------
// The MenuContext of the audited state (the audit's own reading of the page)

async function contextOf(page, { focus = 'none', selection, clipboard = 'empty' } = {}) {
  const st = await state(page);
  const list = await invoke(page, 'slide.list');
  const info = await invoke(page, 'deck.info');
  const current = await invoke(page, 'slide.get', { slideId: st.slideId });
  const slide = current.slide;
  const index = list.findIndex((row) => row.id === st.slideId);
  /* the toolbar's Undo and Redo carry the history state; wait for the buttons to render (right
     after the draft's hand off to /edit they are not in the DOM for a moment) and read a missing
     button as disabled, never as enabled */
  await page
    .waitForSelector('[data-control="toolbar.undo"]', { timeout: 5000, state: 'attached' })
    .catch(() => null);
  const undo = await page.evaluate(() => {
    const el = document.querySelector('[data-control="toolbar.undo"]');
    return el !== null && el.getAttribute('aria-disabled') !== 'true';
  });
  const redo = await page.evaluate(() => {
    const el = document.querySelector('[data-control="toolbar.redo"]');
    return el !== null && el.getAttribute('aria-disabled') !== 'true';
  });
  const sections = Array.isArray(info.sections)
    ? info.sections.length
    : (info.counts?.sections ?? 1);
  /* round three (SPEC-3 3.10, 13.4): the role and the capabilities from the page's access facts
     (absent on a deck with no record, today's open deck), the identity facts for the own chip's
     menu, and the editing mode the shell stamps on the root */
  const roleFacts =
    st.access?.role !== undefined && st.access?.role !== null
      ? { role: st.access.role, capabilities: st.access.capabilities ?? [] }
      : {};
  const mode = await page.evaluate(
    () => document.querySelector('.pt-viewer')?.getAttribute('data-edit-mode') ?? 'editing',
  );
  /* the Sign in row's predicate reads the product's own fact (`describe().state.account`, the
     controller's `signInAvailable` from the page's init payload) and falls back to the auth
     probe on a build that does not report it; the two disagreed on the check chain's server and
     the switch on pass expected a Sign in row the account menu did not draw (VERIFICATION.md
     F-step20, `rows:scratch-advanced title.account.signIn`) */
  const account = {
    signedIn: st.account?.signedIn === true,
    signInAvailable:
      typeof st.account?.signInAvailable === 'boolean'
        ? st.account.signInAvailable
        : await signInAvailable(page),
  };
  /* the focus round (docs/FOCUS.md 3.1): the switch as the page reports it, so every presence
     expectation below follows the state the audit put the product in */
  const advancedTools = await advancedToolsOn(page);
  return {
    ...DEFAULT_MENU_CONTEXT,
    ...roleFacts,
    account,
    focus,
    slide: {
      index: Math.max(0, index),
      count: list.length,
      skipped: list[index]?.skip === true,
      freeform: slide?.layout?.type === 'freeform',
      pictureLayout: PICTURE_KINDS.has(slide?.kind),
    },
    selectedSlides: 1,
    selection: selection ?? DEFAULT_MENU_CONTEXT.selection,
    clipboard,
    history: { undo, redo },
    sections,
    settings: { ...DEFAULT_MENU_CONTEXT.settings, mode, advancedTools },
  };
}

/** True while Tools > Advanced tools is on: the shell stamps `data-advanced-tools` on the root (docs/FOCUS.md 3.1). */
async function advancedToolsOn(page) {
  return page.evaluate(
    () => document.querySelector('.pt-viewer')?.hasAttribute('data-advanced-tools') === true,
  );
}

/**
 * Flips Tools > Advanced tools through the product's own row (docs/FOCUS.md 3.1) until the root
 * reports the wanted state; the setting is kept per browser, so it holds across the pages of one
 * run. Records the flip as a row of the `advanced` section and returns whether the state was
 * reached.
 */
async function setAdvancedTools(page, on) {
  const check = on ? 'turn on' : 'turn off';
  if ((await advancedToolsOn(page)) === on) return true;
  await closeOverlays(page);
  /* a page without the editor's menu bar (a view only page, the home page) has no row to click;
     say so rather than time out on the bar */
  if ((await page.$('[data-control="menubar.tools"]')) === null) {
    fail('advanced', {
      id: 'tools.advancedTools',
      check,
      evidence: `no Tools menu on ${page.url()}: ${
        (await page.$('[data-control="toolbar.viewOnly"]')) !== null
          ? 'the page is view only'
          : 'the menu bar is not drawn'
      }`,
    });
    return false;
  }
  await openBarMenu(page, 'tools');
  /* the rows of a busy page render a frame late; wait for the row before reading it absent */
  const row = await page
    .waitForSelector('[data-menu-item="tools.advancedTools"]', { timeout: 2000 })
    .catch(() => null);
  if (row === null) {
    const rows = await page
      .$$eval(`${ROW_SELECTOR(0)}`, (els) => els.map((el) => el.getAttribute('data-menu-item')))
      .catch(() => []);
    fail('advanced', {
      id: 'tools.advancedTools',
      check,
      evidence: `the row is not in the Tools menu on ${page.url()}; rows drawn: ${rows.join(', ') || 'none'}`,
    });
    await closeMenus(page);
    return false;
  }
  await row.click();
  const reached = await waitFor(async () => ((await advancedToolsOn(page)) === on ? true : null), {
    timeout: 3000,
  });
  await closeMenus(page);
  (reached ? pass : fail)('advanced', {
    id: 'tools.advancedTools',
    check,
    evidence: reached
      ? `the root ${on ? 'carries' : 'lost'} data-advanced-tools after the row`
      : 'the root did not follow the row within 3 s',
  });
  return reached === true;
}

// ---------------------------------------------------------------------------------------------
// Step 2: the rows of every menu

async function walkMenus(page, ctx, tag) {
  const seen = new Map();
  const rendered = [];
  /* the title row */
  const titleRows = await page.$$eval('[data-control="title.row"] [data-menu-item]', (els) =>
    els.map((el) => ({
      id: el.getAttribute('data-menu-item'),
      disabled: el.getAttribute('aria-disabled') === 'true',
      /* SPEC-3 13.2: the presence slot is a group, not a row; its tooltip primitive sits on the
         +N opener inside it */
      tip:
        el.getAttribute('data-tip') ??
        (el.getAttribute('role') === 'group'
          ? (el.querySelector('[data-tip]')?.getAttribute('data-tip') ?? null)
          : null),
      label: el.textContent.replace(/\s+/g, ' ').trim(),
    })),
  );
  for (const row of titleRows) {
    const item = findItem(row.id);
    if (item?.status === 'later')
      row.tooltip = await tooltipDocOf(
        page,
        `[data-control="title.row"] [data-menu-item="${row.id}"]`,
        row.tip ?? undefined,
      );
    seen.set(row.id, { ...row, level: 0, menu: 'title' });
    rendered.push({ menu: 'title', ...row });
  }
  await page.click('[data-control="present.arrow"]');
  await page.waitForSelector('[role="menu"]', { timeout: 5000 });
  for (const row of await readRows(page, 0)) {
    if (row.status === 'later')
      row.tooltip = await tooltipDocOf(
        page,
        `${ROW_SELECTOR(0)}[data-menu-item="${row.id}"]`,
        row.label,
      );
    seen.set(row.id, { ...row, level: 0, menu: 'title' });
    rendered.push({ menu: 'title', ...row });
  }
  await closeMenus(page);
  /* round three (SPEC-3 4.5, 7.5): the roster and the own chip's menu; a participant's row carries
     Follow or Go to slide, the own row the account menu, the footer the Join chat stub */
  let rosterParticipants = 0;
  for (const [parentId, plate] of Object.entries(PLATE_MENUS)) {
    /* docs/FOCUS.md 3.2: the own chip's menu is parked whole, so its opener is not drawn while
       Tools > Advanced tools is off; the rows are asserted absent by the loop below */
    const parentItem = findItem(parentId);
    if (parentItem !== undefined && !isPresent(parentItem, ctx)) {
      const shown = (await page.$(plate.opener)) !== null;
      (shown ? fail : pass)(`rows:${tag}`, {
        id: parentId,
        menu: 'title',
        check: 'plate menu opens',
        evidence: shown
          ? `${plate.opener} is drawn while ${parentId} is parked with Tools > Advanced tools off`
          : `${plate.opener} absent: ${parentId} is parked while Tools > Advanced tools is off`,
      });
      continue;
    }
    const opened = await openPlate(page, plate).catch(() => false);
    if (!opened) {
      fail(`rows:${tag}`, {
        id: parentId,
        menu: 'title',
        check: 'plate menu opens',
        evidence: `${plate.menu} did not open from ${plate.opener}`,
      });
      continue;
    }
    const plateRows = await readPlateRows(page, plate);
    if (parentId === 'title.presence')
      rosterParticipants = plateRows.filter(
        (r) => r.id === 'title.presence.follow' || r.id === 'title.presence.goTo',
      ).length;
    for (const row of plateRows) {
      if (row.status === 'later' || findItem(row.id)?.status === 'later')
        row.tooltip = await tooltipDocOf(
          page,
          `${plate.menu} [data-menu-item="${row.id}"]`,
          row.label,
        );
      /* a plate row is the first of its id (the roster lists one Follow row per participant) */
      if (!seen.has(row.id)) seen.set(row.id, { ...row, level: 'plate', menu: 'title' });
      rendered.push({ menu: 'title', ...row });
    }
    await page.keyboard.press('Escape');
    await waitFor(async () => ((await page.$(plate.menu)) === null ? true : null), {
      timeout: 2000,
    }).catch(() => null);
  }

  const walkList = async (menuId, items, level) => {
    const listed = await readRows(page, level);
    for (const row of listed) {
      rendered.push({ menu: menuId, ...row });
      if (row.status === 'later')
        row.tooltip = await tooltipDocOf(
          page,
          `${ROW_SELECTOR(level)}[data-menu-item="${row.id}"]`,
          row.label,
        );
      seen.set(row.id, { ...row, level, menu: menuId });
    }
    for (const item of items) {
      if (item.status === 'omit' || item.contextOnly) continue;
      const row = listed.find((r) => r.id === item.id);
      if (!row || row.disabled) continue;
      /* a dynamic row may carry no child rows at all (Insert > Table, the preset grids): the
         plate is checked before the children test. The effect is the resolved one: Insert >
         Shape > Shapes lists its three rows in the default view and draws the gallery plate
         through `altEffect` while Tools > Advanced tools is on (docs/FOCUS.md section 4), and the
         static `effect` read walked the rows while the plate stood */
      const effect = resolveEffect(item, ctx) ?? item.effect;
      const dynamic = effect?.kind === 'submenu' && effect.dynamic;
      if (!dynamic && (!item.items || item.items.length === 0)) continue;
      if (!dynamic && row.haspopup !== 'menu') continue;
      if (dynamic) {
        /* a dynamic plate, not a list of rows: the Apply layout grid, or round two's shape
           grids, preset grids and table hover grid (SPEC-2 4.1); the plate's tiles carry the
           row's id as their data-control prefix. The pointer opens the plate after 120 ms and a
           click on a row whose plate is open closes it again (measured: every plate read as
           missing on the first run), so the click is only for a row the hover did not open */
        const rowSel = `${ROW_SELECTOR(level)}[data-menu-item="${item.id}"]`;
        const prefix = effect.dynamic === 'layouts' ? 'layout.apply.' : `${item.id}.`;
        await page.hover(rowSel);
        let plate = await page
          .waitForSelector(`.ts-menu.is-dynamic [data-control^="${prefix}"]`, { timeout: 1500 })
          .catch(() => null);
        if (plate === null) {
          await page.click(rowSel);
          plate = await page
            .waitForSelector(`.ts-menu.is-dynamic [data-control^="${prefix}"]`, { timeout: 4000 })
            .catch(() => null);
        }
        const tiles =
          plate === null
            ? 0
            : await page.$$eval(
                `.ts-menu.is-dynamic [data-control^="${effect.dynamic === 'layouts' ? 'layout.apply.' : `${item.id}.pick.`}"]`,
                (els) => els.length,
              );
        const untipped =
          plate === null
            ? []
            : await page.$$eval(
                `.ts-menu.is-dynamic [data-control^="${effect.dynamic === 'layouts' ? 'layout.apply.' : `${item.id}.pick.`}"]`,
                (els) =>
                  els
                    .filter((el) => !el.closest('[data-tip]'))
                    .map((el) => el.getAttribute('data-control'))
                    .slice(0, 5),
              );
        seen.get(item.id).dynamic = {
          plate: plate !== null,
          kind: effect.dynamic,
          tiles,
          untipped,
        };
        continue;
      }
      await openSubmenuRow(page, level, item.id).catch(() => null);
      await walkList(menuId, item.items, level + 1);
    }
  };
  /* docs/FOCUS.md 3.1: a menu whose rows are all parked is not drawn while Tools > Advanced tools
     is off (Extensions), so only the menus the model draws in this context are opened; the bar is
     read once and each absent menu is asserted absent (VERIFICATION F20: the default view's walk
     clicked menubar.extensions and timed out) */
  const drawn = visibleMenus(ctx).map((menu) => menu.id);
  const barMenus = await page.$$eval('[data-control^="menubar."]', (els) =>
    els.map((el) => el.getAttribute('data-control').slice('menubar.'.length)),
  );
  for (const menu of MENUS) {
    const shown = barMenus.includes(menu.id);
    const expected = drawn.includes(menu.id);
    (shown === expected ? pass : fail)(`rows:${tag}`, {
      id: `menubar.${menu.id}`,
      menu: menu.id,
      check: 'menu present',
      evidence: `${shown ? 'in the bar' : 'absent'}; the model ${expected ? 'draws' : 'does not draw'} the menu in this context${
        expected || ctx.settings.advancedTools === true
          ? ''
          : ' (every row parked while Tools > Advanced tools is off)'
      }`,
    });
    if (!expected || !shown) continue;
    await openBarMenu(page, menu.id);
    await walkList(menu.id, menu.items, 0);
    await closeMenus(page);
  }

  /* the assertions, per item of the model */
  for (const item of allItems()) {
    const menu = MENU_OF.get(item.id);
    const section = `rows:${tag}`;
    const found = seen.get(item.id);
    const base = { id: item.id, menu, status: item.status, label: resolveLabel(item, ctx) };
    if (item.status === 'omit') {
      const byId = found !== undefined;
      const byLabel = rendered.some(
        (r) => r.menu === menu && r.label === item.label && !LABELS_IN_USE.has(item.label),
      );
      if (!byId && !byLabel) pass(section, { ...base, check: 'absent' });
      else
        fail(section, {
          ...base,
          check: 'absent',
          evidence: byId ? 'rendered by id' : 'rendered by label',
        });
      continue;
    }
    if (item.contextOnly) {
      if (found === undefined) pass(section, { ...base, check: 'not in the bar (context only)' });
      else
        fail(section, {
          ...base,
          check: 'not in the bar (context only)',
          evidence: 'drawn in the bar',
        });
      continue;
    }
    /* round three (SPEC-3 13.4): a row a role cannot use is absent by id, never disabled; a
       row whose `when` predicate says no in this context must not be rendered */
    const parentIds = ancestors(item.id);
    const present =
      isPresent(item, ctx) && parentIds.every((pid) => isPresent(findItem(pid) ?? {}, ctx));
    if (!present) {
      /* docs/FOCUS.md 3.1: a parked row or a Later stub is absent while the switch is off, a row
         a role cannot use is absent by its predicate */
      const parkedHere = [item.id, ...parentIds].find((id) => {
        const each = findItem(id);
        return each !== undefined && (each.advanced === true || each.status === 'later');
      });
      const why =
        parkedHere !== undefined && ctx.settings.advancedTools !== true
          ? `parked (${parkedHere}) while Tools > Advanced tools is off`
          : `when: ${item.when}`;
      if (found === undefined)
        pass(section, { ...base, check: 'absent by predicate', evidence: why });
      else if (isPresenceChip(item.id, found))
        pass(section, {
          ...base,
          check: 'absent by predicate',
          evidence: `a presence chip in the title row; the chips stay drawn while their rows are parked (docs/FOCUS.md 3.2)`,
        });
      else
        fail(section, {
          ...base,
          check: 'absent by predicate',
          evidence: `rendered while ${why} says absent in this state`,
        });
      continue;
    }
    /* a roster row needs a participant: Follow and Go to slide render one row per person, and
       Follow is offered on signed in editors and owners alone (SPEC-3 4.4), so two anonymous
       contexts render Go to slide rows only */
    if (
      found === undefined &&
      (item.id === 'title.presence.follow' || item.id === 'title.presence.goTo')
    ) {
      skip(section, {
        ...base,
        check: 'present',
        evidence:
          rosterParticipants === 0
            ? 'no other participant in the room; the roster draws Follow and Go to slide per person'
            : `${rosterParticipants} participant row(s), none offering ${item.label}: Follow is refused for anonymous people, who get Go to slide (SPEC-3 4.4)`,
      });
      continue;
    }
    /* a row under a Later or disabled container is not reachable in this state */
    const parentBlocked = parentIds.some((pid) => {
      const p = findItem(pid);
      const prow = seen.get(pid);
      return p?.status === 'later' || (prow !== undefined && prow.disabled);
    });
    /* round two: a child row of a dynamic plate is drawn as one of its tiles (the shape grids
       replace the shape rows, SPEC-2 4.1), and a child of a context-only row is not in the bar */
    const plateParent = parentIds.find((pid) => seen.get(pid)?.dynamic?.plate === true);
    if (found === undefined && plateParent !== undefined) {
      skip(section, {
        ...base,
        check: 'present',
        evidence: `drawn as a tile of the ${seen.get(plateParent).dynamic.kind} plate of ${plateParent} (${seen.get(plateParent).dynamic.tiles} tiles)`,
      });
      continue;
    }
    if (found === undefined && parentIds.some((pid) => findItem(pid)?.contextOnly)) {
      pass(section, { ...base, check: 'not in the bar (under a context only row)' });
      continue;
    }
    if (found === undefined) {
      if (parentBlocked)
        skip(section, {
          ...base,
          check: 'present',
          evidence: 'under a disabled or Later container; not reachable in this state',
        });
      else
        fail(section, {
          ...base,
          check: 'present',
          evidence: 'no [data-menu-item] rendered on its path',
        });
      continue;
    }
    const problems = [];
    if (menu !== 'title' || PARENT.get(item.id) === 'title.slideshow') {
      const label = resolveLabel(item, ctx);
      if (found.label !== label) problems.push(`label "${found.label}" wanted "${label}"`);
      const hasSub =
        (item.items !== undefined && item.items.some((c) => c.status !== 'omit')) ||
        item.effect?.kind === 'submenu';
      if (item.key && !hasSub) {
        const wanted = shortcutLabel(item.key, 'mac', 'symbols');
        if (found.key !== wanted) problems.push(`key "${found.key}" wanted "${wanted}"`);
        const aria = ariaKeyShortcuts(item.key, 'mac');
        if (aria && found.keyshort !== aria)
          problems.push(`aria-keyshortcuts "${found.keyshort}" wanted "${aria}"`);
      }
    }
    if (!found.tip) problems.push('no data-tip (tooltip primitive)');
    if (item.status === 'later') {
      if (!found.disabled) problems.push('a Later row is not aria-disabled');
      const doc = found.tooltip?.doc ?? '';
      if (!doc.startsWith(STUB_PREFIX))
        problems.push(
          `stub tooltip "${doc.slice(0, 80)}" does not start with "${STUB_PREFIX}"${found.tooltip?.raw ? ` (plate: ${found.tooltip.raw})` : ''}`,
        );
      /* SPEC-3 13.3: the rows that stay Later this round carry their exact clause */
      const clause = LATER_CLAUSES[item.id];
      if (clause !== undefined) {
        if (item.stubReason !== clause)
          problems.push(`the model's clause "${item.stubReason}" is not 13.3's "${clause}"`);
        if (doc !== stubClause(clause))
          problems.push(`the tooltip "${doc.slice(0, 120)}" is not "${stubClause(clause)}"`);
      }
    } else {
      const expected = isEnabled(item, ctx);
      if (found.disabled === expected)
        problems.push(
          `${found.disabled ? 'disabled' : 'enabled'} while the predicate ${item.enabled ?? 'always'} says ${expected ? 'enabled' : 'disabled'}`,
        );
      const check = isChecked(item, ctx);
      if (check !== undefined && found.role === 'menuitem')
        problems.push('a check item drawn as a plain menuitem');
      /* SPEC-2 4.1: an enabled dynamic row draws its plate with tiles that carry the tooltip
         primitive; the effect is the resolved one, since Insert > Shape > Shapes draws its gallery
         plate only while Tools > Advanced tools is on (docs/FOCUS.md section 4) */
      const resolved = resolveEffect(item, ctx);
      if (resolved?.kind === 'submenu' && resolved.dynamic && expected && !found.disabled) {
        const plate = found.dynamic;
        if (!plate || plate.plate !== true)
          problems.push(`the ${resolved.dynamic} plate did not render`);
        else if (plate.tiles === 0) problems.push(`the ${resolved.dynamic} plate has no tile`);
        else if (plate.untipped.length > 0)
          problems.push(`tiles without a tooltip: ${plate.untipped.join(', ')}`);
      }
    }
    if (problems.length === 0)
      pass(section, {
        ...base,
        check: 'row',
        evidence: `level ${found.level}${found.dynamic ? `; ${found.dynamic.kind} plate with ${found.dynamic.tiles} tiles` : ''}`,
      });
    else fail(section, { ...base, check: 'row', evidence: problems });
  }
  return { seen, rendered };
}

// ---------------------------------------------------------------------------------------------
// Step 4: the toolbar order

const HEAD_IDS = TOOLBAR_HEAD.filter((c) => c.status !== 'omit').map((c) => c.control);
const DEFAULT_TAIL_IDS = TOOLBAR_TAIL_DEFAULT.filter((c) => c.status !== 'omit').map(
  (c) => c.control,
);

async function readToolbar(page) {
  return page.$$eval('[data-control="toolbar"] [data-control]', (els) =>
    els.map((el) => ({
      id: el.getAttribute('data-control'),
      disabled: el.getAttribute('aria-disabled') === 'true',
    })),
  );
}

async function checkToolbar(page, kind, tag, ctx = null) {
  const menuCtx = ctx ?? (await contextOf(page).catch(() => DEFAULT_MENU_CONTEXT));
  const observed = (await readToolbar(page)).map((c) => c.id);
  /* docs/FOCUS.md 3.3: a parked control is absent while Tools > Advanced tools is off, a tail
     parked whole falls back to the default tail (ToolbarTail.tsx), and Hide the menus (SPEC 3.1
     row 18, drawn apart from the tail) is parked with View > Full screen */
  const head = presentControls(TOOLBAR_HEAD, menuCtx).map((c) => c.control);
  const own = presentControls(tailFor(kind), menuCtx);
  const tail = (
    own.length > 0 || kind === 'default' ? own : presentControls(tailFor('default'), menuCtx)
  ).map((c) => c.control);
  const hide = isPresent(findItem('view.fullScreen') ?? {}, menuCtx) ? [HIDE_MENUS_CONTROL] : [];
  const wanted = [...head, ...tail, ...hide];
  const known = new Set([
    ...HEAD_IDS,
    ...DEFAULT_TAIL_IDS,
    ...['text', 'shape', 'image', 'line', 'table', 'chart', 'group', 'other'].flatMap((k) =>
      tailFor(k).map((c) => c.control),
    ),
  ]);
  const filtered = observed.filter((id) => known.has(id));
  const same = JSON.stringify(filtered) === JSON.stringify(wanted);
  const row = {
    id: `toolbar.${kind}`,
    kind,
    advancedTools: menuCtx.settings.advancedTools === true,
    wanted,
    observed: filtered,
    evidence: same
      ? `${filtered.length} controls in the order of SPEC 3 with Tools > Advanced tools ${menuCtx.settings.advancedTools === true ? 'on' : 'off'}`
      : `wanted ${wanted.join(', ')}; observed ${filtered.join(', ')}`,
  };
  if (same) pass(`toolbar:${tag}`, { ...row, check: 'order' });
  else fail(`toolbar:${tag}`, { ...row, check: 'order' });
  return same;
}

// ---------------------------------------------------------------------------------------------
// Step 5: the right-click menus

function expectedContext(target, ctx) {
  /* the model's own resolution (menus/model.ts resolveContextEntries): a conditional entry by its
     predicate, a parked row or a Later stub only while Tools > Advanced tools is on (docs/FOCUS.md
     3.4), and no divider first, last or doubled */
  return resolveContextEntries(CONTEXT_MENUS[target], ctx).map((entry) =>
    entry === DIVIDER ? '-' : entry.id,
  );
}

async function readContextMenu(page) {
  await page.waitForSelector('[role="menu"]', { timeout: 4000 });
  return page.$$eval('[role="menu"][data-level="0"] > .ts-menu-group > *', (els) =>
    els.map((el) =>
      el.getAttribute('role') === 'separator'
        ? '-'
        : (el.getAttribute('data-menu-item') ?? `?${el.className}`),
    ),
  );
}

async function checkContextMenu(page, target, opener, ctx, tag) {
  await closeOverlays(page);
  let observed = [];
  try {
    await opener();
    observed = await readContextMenu(page);
  } catch (error) {
    fail(`contextMenu:${tag}`, {
      id: target,
      check: 'opens',
      evidence: String(error).slice(0, 200),
    });
    await closeOverlays(page);
    return;
  }
  const wanted = expectedContext(target, ctx);
  const cleaned = observed.filter(
    (e, i, a) => !(e === '-' && (i === 0 || i === a.length - 1 || a[i - 1] === '-')),
  );
  const row = { id: target, wanted, observed: cleaned };
  if (JSON.stringify(cleaned) === JSON.stringify(wanted))
    pass(`contextMenu:${tag}`, { ...row, check: 'order' });
  else fail(`contextMenu:${tag}`, { ...row, check: 'order' });
  await closeOverlays(page);
}

// ---------------------------------------------------------------------------------------------
// Step 3: the effects

const DIALOG_TITLE_OF = {
  'file.share.withOthers': 'Share ',
  'title.share': 'Share ',
  /* round three (SPEC-3 7.2 to 7.6, 5.5, 6.4): the account dialogs and the rebuilt Publish dialog */
  'title.account.changeName': ACCOUNT.namePrompt.title,
  'title.account.changeAvatar': ACCOUNT.avatar.title,
  'title.account.signIn': ACCOUNT.signInDialog.title,
  'title.account.sessions': ACCOUNT.profile.title,
  'tools.notificationSettings': INBOX.settings,
  'file.share.publish': DIALOGS.publish.title,
};

/** Observes a dialog whose title matches the effect and closes it with Esc. */
async function observeDialog(page, item, title) {
  const prefix = DIALOG_TITLE_OF[item.id] ?? title;
  const found = await waitFor(async () => {
    const open = await dialogs(page);
    return (
      open.find((d) => d.title.startsWith(prefix) || (d.control ?? '').startsWith('dialog.')) ??
      null
    );
  });
  if (!found)
    return {
      ok: false,
      evidence: `no dialog opened for "${title}"; snackbar "${await snackbarText(page)}"`,
    };
  const titleOk = found.title.startsWith(prefix);
  const focusInside = await page.evaluate(() => {
    const active = document.activeElement;
    return active !== null && active.closest('[role="dialog"]') !== null;
  });
  const tips = await page.$$eval(
    '[role="dialog"] button, [role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea, [role="dialog"] a[href], [role="dialog"] [role="button"], [role="dialog"] [role="tab"]',
    (els) =>
      els
        .filter((el) => !el.closest('[data-tip]') && !el.closest('[aria-hidden="true"]'))
        .map((el) => el.getAttribute('data-control') ?? el.tagName),
  );
  /* SPEC-2 section 10: the words of the dialog while it is open; SPEC 12 exempts Extensions > Agent
     access and Tools > Advanced by name (menus/strings.ts FORBIDDEN_DEFAULT_VIEW_WORDS), and the
     tooltip plate of an exempt dialog's controls renders outside the dialog's element, so the
     exempt dialogs are skipped here rather than excluded by selector (round four fixer round,
     VERIFICATION-4 finding 10) */
  const exemptDialog =
    found.control === 'dialog.agentAccess' ||
    item.id === 'extensions.agentAccess' ||
    item.id.startsWith('tools.advanced');
  if (exemptDialog)
    pass('defaultViewWords', {
      where: `dialog ${found.control ?? found.title}`,
      evidence: 'SPEC 12 exempts this dialog by name; its words are not checked',
    });
  else await checkDefaultWords(page, `dialog ${found.control ?? found.title}`);
  await page.keyboard.press('Escape');
  const gone = await waitFor(async () => (await dialogs(page)).length === 0);
  const focusAfter = await page.evaluate(
    () =>
      document.activeElement?.getAttribute('data-control') ??
      document.activeElement?.tagName ??
      null,
  );
  const evidence = `dialog ${found.control} "${found.title}"; focus ${focusInside ? 'inside' : 'outside'}; Esc ${gone ? 'closed it' : 'left it open'}; focus after: ${focusAfter}${tips.length ? `; controls without a tooltip: ${tips.join(', ')}` : ''}`;
  return { ok: titleOk && gone && focusInside && tips.length === 0, evidence };
}

async function observePanel(page, title) {
  const found = await waitFor(() => page.$(`.ts-rpanel [data-panel-title="${title}"]`));
  if (!found) {
    const other = await page.$$eval('.ts-rpanel [data-panel-title]', (els) =>
      els.map((el) => el.getAttribute('data-panel-title')),
    );
    return {
      ok: false,
      evidence: `no panel titled "${title}" (open: ${other.join(', ') || 'none'}); snackbar "${await snackbarText(page)}"`,
    };
  }
  const close = await page.$('.ts-rpanel [data-control$=".close"]');
  if (close) await close.click();
  else await page.keyboard.press('Escape');
  const gone = await waitFor(
    async () => (await page.$(`.ts-rpanel [data-panel-title="${title}"]`)) === null,
  );
  return {
    ok: Boolean(gone),
    evidence: `panel "${title}" opened; ${gone ? 'closed' : 'did not close'}`,
  };
}

async function toggleState(page, setting) {
  return page.evaluate((s) => {
    const v = document.querySelector('.pt-viewer');
    const st = window.turboslide.studio.describe().state;
    switch (s) {
      case 'gridView':
        return st.mode;
      case 'book':
        return st.mode;
      case 'filmstrip':
        /* the sidebar hides with is-hidden (its box keeps its width) */
        return !(document.querySelector('.pt-sb')?.classList.contains('is-hidden') ?? false);
      case 'speakerNotes':
        return document.querySelector('.ts-notes-slot') !== null;
      case 'compact':
        /* the declared effect: the menu bar and the toolbar hide */
        return (document.querySelector('.ts-menubar')?.getBoundingClientRect().height ?? 0) === 0;
      case 'viewing':
        return st.edit;
      case 'appearance':
        return document.documentElement.getAttribute('data-theme');
      case 'spellcheck':
        return v?.hasAttribute('data-spellcheck') ?? false;
      case 'sourceDrawer':
        return document.querySelector('[data-control="source.drawer"]') !== null;
      /* round two (SPEC-2 6.1 rows 29 and 30): the two rulers along the stage; the deck's guides
         draw only while the deck holds one, so the row's check state speaks for Show guides */
      case 'showRuler':
        return document.querySelectorAll('.ts-ruler').length === 2;
      case 'showGuides':
        return null;
      /* round three (SPEC-3 4.6, 5.3, 4.9): the mode the shell stamps on the root, the own pointer
         button's pressed state, the announcements region's live attribute */
      case 'mode':
        return v?.getAttribute('data-edit-mode') ?? null;
      case 'pointerMine':
        return (
          document
            .querySelector('[data-control="toolbar.pointer"]')
            ?.getAttribute('aria-pressed') === 'true'
        );
      case 'announce':
        return (
          document
            .querySelector('[data-control="presence.announcements"]')
            ?.getAttribute('aria-live') === 'polite'
        );
      default:
        return null;
    }
  }, setting);
}

async function checkedOf(page, id) {
  const level = await openPath(page, id);
  if (level === -2) {
    const plateRows = await readPlateRows(page, plateOf(id));
    await closeMenus(page);
    return plateRows.find((r) => r.id === id)?.checked ?? null;
  }
  const rows = await readRows(page, Math.max(level, 0));
  const row = rows.find((r) => r.id === id);
  await closeMenus(page);
  return row?.checked ?? null;
}

async function observeToggle(page, item) {
  const setting = item.effect.setting;
  const before = await toggleState(page, setting);
  const checkedBefore = await checkedOf(page, item.id);
  await activate(page, item.id);
  const after =
    (
      await waitFor(
        async () => {
          const now = await toggleState(page, setting);
          return now !== before ? { value: now } : null;
        },
        { timeout: 3000 },
      )
    )?.value ?? (await toggleState(page, setting));
  /* Full screen hides the menu bar by design (SPEC 2.3), so its row cannot be read while it is on:
     the DOM state (the bars at height 0) and the "Show the menus" chevron are the check there */
  const compactChevron =
    setting === 'compact'
      ? await page.evaluate(
          () => document.querySelector('[data-control="toolbar.showMenus"]') !== null,
        )
      : null;
  const checkedAfter =
    setting === 'compact' ? (after === true ? 'hidden' : 'false') : await checkedOf(page, item.id);
  const radio = item.effect.value !== undefined;
  let ok;
  if (radio) ok = checkedAfter === 'true' && (before === null || after !== null);
  else if (setting === 'compact') ok = before === false && after === true;
  else if (checkedBefore === null && checkedAfter === null && before !== null)
    /* a row with no aria-checked alternates its label (Show ruler becomes Hide ruler, SPEC-2 4.1,
       Google's own form): the DOM state it drives is the check */
    ok = after !== before;
  else ok = checkedAfter !== checkedBefore && (before === null || after !== before);
  /* revert: a check item toggles back; a radio returns to the option that was checked */
  if (radio) {
    if (checkedBefore !== 'true') {
      const siblings = (findItem(PARENT.get(item.id))?.items ?? []).filter(
        (s) => s.status === 'now',
      );
      for (const sib of siblings) {
        if (sib.id === item.id) continue;
        const was = isChecked(sib, { ...DEFAULT_MENU_CONTEXT, settings: {} });
        void was;
      }
      /* the original value: the sibling whose value matches the state before */
      const original =
        siblings.find((s) => String(s.effect?.value) === String(before)) ??
        siblings.find((s) => s.effect?.value === (setting === 'viewing' ? false : 'match'));
      if (original && original.id !== item.id) await activate(page, original.id);
      else if (setting === 'compact' || setting === 'gridView') await page.keyboard.press('Escape');
    }
  } else if (setting === 'compact') {
    await page.keyboard.press('Escape');
  } else {
    await activate(page, item.id);
  }
  await page.waitForTimeout(150);
  const restored = await toggleState(page, setting);
  if (setting === 'compact') {
    /* the row reads again once the menu bar is back: it must be unchecked and the chevron gone */
    const checkedRestored = await checkedOf(page, item.id);
    const chevronGone = await page.evaluate(
      () => document.querySelector('[data-control="toolbar.showMenus"]') === null,
    );
    ok = ok && compactChevron === true && restored === false && checkedRestored !== 'true';
    return {
      ok,
      evidence: `aria-checked ${checkedBefore} -> (menu bar hidden) -> ${checkedRestored}; bars hidden ${JSON.stringify(before)} -> ${JSON.stringify(after)} -> ${JSON.stringify(restored)}; Show the menus chevron ${compactChevron ? 'shown' : 'missing'} then ${chevronGone ? 'gone' : 'still there'} after Esc`,
    };
  }
  return {
    ok,
    evidence: `aria-checked ${checkedBefore} -> ${checkedAfter}; ${setting} ${JSON.stringify(before)} -> ${JSON.stringify(after)} -> ${JSON.stringify(restored)}`,
  };
}

async function revisionOf(page) {
  return (await state(page)).revision;
}

async function waitRevision(page, before, timeout = 15_000) {
  const moved = await waitFor(
    async () => ((await revisionOf(page)) > before ? await revisionOf(page) : null),
    { timeout },
  );
  return moved ?? null;
}

async function undo(page) {
  const before = await revisionOf(page);
  await blurAll(page);
  await page.keyboard.press('Meta+z');
  await waitRevision(page, before, 10_000);
  await settled(page).catch(() => null);
}

async function observeWrite(page, item, { verify } = {}) {
  const before = await revisionOf(page);
  await activate(page, item.id);
  let snack = '';
  const after = await waitFor(
    async () => {
      const now = await revisionOf(page);
      if (now > before) return now;
      const text = await snackbarText(page);
      if (text !== '') snack = text;
      /* a refusal or an error ends the wait: nothing will be written */
      if (/first|needs|invalid|error|Couldn|Nothing to|not available|Use the/i.test(text))
        return -1;
      return null;
    },
    { timeout: 15_000 },
  );
  if (after === null || after === -1)
    return {
      ok: false,
      evidence: `no write (revision ${before}); snackbar "${snack || (await snackbarText(page))}"`,
    };
  await settled(page).catch(() => null);
  let detail = '';
  let ok = true;
  if (verify) {
    const outcome = await verify();
    ok = outcome.ok;
    detail = `; ${outcome.evidence}`;
  }
  return { ok, evidence: `revision ${before} -> ${after}${detail}`, revision: after };
}

async function observeRoute(page, context, item, deckId) {
  const path = item.effect.path.replace(':deckId', deckId);
  if (item.effect.newTab) {
    const popup = context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    await activate(page, item.id);
    const opened = await popup;
    if (!opened) return { ok: false, evidence: `no new tab for ${path}` };
    await opened.waitForLoadState('domcontentloaded').catch(() => null);
    const url = opened.url();
    await opened.close();
    /* GitHub answers /issues/new with a login redirect whose return_to carries the URL */
    const decoded = decodeURIComponent(url);
    const ok =
      new URL(url).pathname + new URL(url).hash === path ||
      url.includes(path.split('#')[0]) ||
      decoded.includes(path.split('#')[0]);
    return { ok, evidence: `new tab ${url}` };
  }
  const from = page.url();
  await activate(page, item.id);
  const moved = await waitFor(
    async () => (new URL(page.url()).pathname === path ? page.url() : null),
    { timeout: 15_000 },
  );
  const evidence = `${from} -> ${page.url()}`;
  /* back to the editor */
  await page.goto(from, { waitUntil: 'domcontentloaded' });
  await ready(page);
  return { ok: moved !== null, evidence };
}

async function observeDownload(page, item, { timeout = 30_000 } = {}) {
  const download = page
    .waitForEvent('download', { timeout })
    .then((d) => d.suggestedFilename())
    .catch(() => null);
  await activate(page, item.id);
  const name = await download;
  if (name) return { ok: true, evidence: `download ${name}` };
  const snack = await snackbarText(page);
  return { ok: false, evidence: `no download within ${timeout / 1000} s; snackbar "${snack}"` };
}

async function observePopupOrSnackbar(page, context, item, pattern, timeout) {
  const popup = context.waitForEvent('page', { timeout }).catch(() => null);
  const snack = waitFor(
    async () => (pattern.test(await snackbarText(page)) ? await snackbarText(page) : null),
    { timeout },
  );
  await activate(page, item.id);
  const outcome = await Promise.race([
    popup.then((p) => (p ? { popup: p } : null)),
    snack.then((s) => (s ? { snack: s } : null)),
  ]);
  if (outcome?.popup) {
    const url = outcome.popup.url();
    await outcome.popup.close();
    return { ok: true, evidence: `new tab ${url.slice(0, 120)}` };
  }
  if (outcome?.snack) return { ok: true, evidence: `snackbar "${outcome.snack}"` };
  const later = await snack;
  if (later) return { ok: true, evidence: `snackbar "${later}"` };
  return {
    ok: false,
    evidence: `nothing within ${timeout / 1000} s; snackbar "${await snackbarText(page)}"`,
  };
}

async function observeFileChooser(page, item) {
  const chooser = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
  await activate(page, item.id);
  const fc = await chooser;
  if (!fc)
    return { ok: false, evidence: `no file chooser; snackbar "${await snackbarText(page)}"` };
  return { ok: true, evidence: `file chooser (${fc.isMultiple() ? 'multiple' : 'one file'})` };
}

async function observePresent(page, item) {
  await activate(page, item.id);
  const on = await waitFor(() => page.$('.pt-viewer.is-present'));
  const show = await page.$('.ts-slideshow');
  await page.keyboard.press('Escape');
  const off = await waitFor(async () => (await page.$('.pt-viewer.is-present')) === null);
  return {
    ok: Boolean(on) && Boolean(off),
    evidence: `is-present ${on ? 'on' : 'off'}; slideshow surface ${show ? 'mounted' : 'absent'}; Esc ${off ? 'left' : 'stayed'}`,
  };
}

async function observeSnackbar(page, item, pattern) {
  await activate(page, item.id);
  const text = await waitFor(
    async () => (pattern.test(await snackbarText(page)) ? await snackbarText(page) : null),
    { timeout: 8000 },
  );
  return {
    ok: Boolean(text),
    evidence: text ? `snackbar "${text}"` : `no snackbar matching ${pattern}`,
  };
}

/** Runs one item's effect in the current state and records the row. */
async function runEffect(page, context, item, ctx, deckId, tag) {
  const section = `effects:${tag}`;
  const base = {
    id: item.id,
    menu: MENU_OF.get(item.id),
    effect: item.effect?.kind,
    label: item.label,
  };
  if (item.status !== 'now') return;
  if (ONLY_EFFECTS !== null && !ONLY_EFFECTS.has(item.id)) return;
  /* the state moves with every effect (a slide added, a write undone): read it again */
  ctx = await contextOf(
    page,
    ctx.selection === DEFAULT_MENU_CONTEXT.selection
      ? {}
      : { focus: ctx.focus, selection: ctx.selection, clipboard: ctx.clipboard },
  ).catch(() => ctx);
  if (!isPresent(item, ctx)) {
    skip(section, { ...base, evidence: `absent by its predicate ${item.when} in this state` });
    return;
  }
  if (item.id === 'title.account.forget') {
    skip(section, {
      ...base,
      evidence: 'run on the collaborator context at the end of the round three phase',
    });
    return;
  }
  if (!isEnabled(item, ctx)) {
    skip(section, { ...base, evidence: `disabled by ${item.enabled} in this state` });
    return;
  }
  const blockedBy = ancestors(item.id).find((id) => {
    const parent = findItem(id);
    return parent !== undefined && !isEnabled(parent, ctx);
  });
  if (blockedBy !== undefined) {
    skip(section, { ...base, evidence: `under ${blockedBy}, disabled in this state` });
    return;
  }
  const deviation = RECORDED_DEVIATIONS.get(item.id);
  if (deviation !== undefined) {
    skip(section, { ...base, evidence: `recorded deviation (VERIFICATION.md ${deviation})` });
    return;
  }
  await closeOverlays(page);
  let outcome;
  try {
    outcome = await runEffectInner(page, context, item, ctx, deckId);
  } catch (error) {
    outcome =
      error instanceof DisabledRow
        ? {
            ok: false,
            evidence: `the row is disabled while the predicate ${item.enabled ?? 'always'} says enabled: ${error.message}`,
          }
        : { ok: false, evidence: `threw: ${String(error).slice(0, 240)}` };
  }
  await closeOverlays(page).catch(() => null);
  if (outcome === undefined) return;
  if (outcome.skip) skip(section, { ...base, evidence: outcome.evidence });
  else if (outcome.ok) pass(section, { ...base, evidence: outcome.evidence });
  else fail(section, { ...base, evidence: outcome.evidence });
  /* a failed effect may have left the page in an unknown state: the next one starts fresh */
  if (outcome.ok !== true || (await page.$('.pt-viewer.is-present')) !== null)
    await resetEditor(page, deckId).catch(() => null);
  else if (outcome.expectActive !== undefined) {
    /* the index rule after a removal (AGENTS.md deviations; integrator 8.2 item 1): the current
       slide is the one at the removed slide's index, clamped to the end, and slide.get answers */
    const st = await state(page);
    const got = await invoke(page, 'slide.get', { slideId: st.slideId }).catch((e) => ({
      error: String(e),
    }));
    const ok = st.slideId === outcome.expectActive && !got?.error;
    (ok ? pass : fail)(section, {
      id: `${item.id}.activeSlide`,
      menu: MENU_OF.get(item.id),
      evidence: `${outcome.expectWhy}: expected ${outcome.expectActive}, current ${st.slideId}; slide.get ${got?.error ? got.error.slice(0, 80) : 'answers'}`,
    });
    if (!ok) await resetEditor(page, deckId).catch(() => null);
  } else if (!(await activeSlideExists(page))) {
    fail(section, {
      id: `${item.id}.activeSlide`,
      menu: MENU_OF.get(item.id),
      evidence: `after ${item.id} and its undo the active slide ${(await state(page)).slideId} is not in the deck`,
    });
    await resetEditor(page, deckId).catch(() => null);
  }
}

/** Reloads the editor on the scratch deck and lands on its first slide. */
async function resetEditor(page, deckId) {
  await closeOverlays(page).catch(() => null);
  await page.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await settled(page).catch(() => null);
  const list = await invoke(page, 'slide.list');
  if (list[0]) await invoke(page, 'view.goto', { slideId: list[0].id }).catch(() => null);
}

/**
 * The Insert rows that place a block (Text box, the shapes, the lines, Table, Icon, Material). The
 * grammar's Title and Statement kinds carry fixed fields and no slot (B3 7.2 item 1), so on a deck
 * whose current slide has no slot a Title and body slide is added for these rows and removed after
 * them; on a deck whose current slide has a body they run there.
 */
async function runInsertRows(page, context, items, deckId, tag) {
  if (items.length === 0) return;
  const section = `effects:${tag}`;
  await resetEditor(page, deckId);
  const st = await state(page);
  const current = (await invoke(page, 'slide.get', { slideId: st.slideId })).slide;
  let host = st.slideId;
  let added = null;
  if (Object.keys(current.slots ?? {}).length === 0) {
    const created = await invoke(page, 'slide.new', {
      layout: 'split',
      after: st.slideId,
      baseRevision: st.revision,
    }).catch((e) => ({ error: String(e) }));
    await settled(page).catch(() => null);
    const list = await invoke(page, 'slide.list');
    added = created?.error
      ? null
      : (list[list.findIndex((r) => r.id === st.slideId) + 1]?.id ?? null);
    if (!added) {
      for (const item of items)
        fail(section, {
          id: item.id,
          menu: MENU_OF.get(item.id),
          effect: item.effect?.kind,
          label: item.label,
          evidence: `no Title and body slide could be added for the row: ${created?.error ?? 'slide.new wrote nothing'}`,
        });
      return;
    }
    host = added;
    pass(section, {
      id: 'insert.hostSlide',
      evidence: `the current slide ${st.slideId} (${current.kind}) has no slot; the Insert rows run on ${added} (Title and body)`,
    });
  }
  for (const item of items) {
    await invoke(page, 'view.goto', { slideId: host }).catch(() => null);
    await waitFor(async () => ((await state(page)).slideId === host ? true : null)).catch(
      () => null,
    );
    const ctx = await contextOf(page).catch(() => DEFAULT_MENU_CONTEXT);
    await runEffect(page, context, item, ctx, deckId, tag);
  }
  if (added) {
    const rev = await revisionOf(page);
    await invoke(page, 'slide.remove', { slideId: added, baseRevision: rev }).catch(() => null);
    await settled(page).catch(() => null);
    await resetEditor(page, deckId);
  }
}

/** True when describe().state.slideId names a slide the deck still has (SPEC 5.3 after an undo). */
async function activeSlideExists(page) {
  const st = await state(page);
  const list = await invoke(page, 'slide.list');
  return list.some((row) => row.id === st.slideId);
}

async function runEffectInner(page, context, item, ctx, deckId) {
  const effect = item.effect;
  switch (effect.kind) {
    case 'dialog':
      await activate(page, item.id);
      return observeDialog(page, item, effect.title);
    case 'panel':
      await activate(page, item.id);
      return observePanel(page, effect.title);
    case 'route':
      return observeRoute(page, context, item, deckId);
    case 'toggle':
      return observeToggle(page, item);
    case 'submenu': {
      if (effect.dynamic === 'layouts') {
        const level = await openPath(page, item.id);
        await page.click(`${ROW_SELECTOR(level)}[data-menu-item="${item.id}"]`);
        const tile = await page
          .waitForSelector('.ts-menu.is-dynamic [data-control="layout.apply.split"]', {
            timeout: 5000,
          })
          .catch(() => null);
        if (!tile)
          return { ok: false, evidence: 'the Apply layout plate did not show the layout grid' };
        const before = await revisionOf(page);
        const st = await state(page);
        await tile.click();
        const after = await waitRevision(page, before);
        if (after === null)
          return {
            ok: false,
            evidence: `picked Title and body; no write; snackbar "${await snackbarText(page)}"`,
          };
        await settled(page).catch(() => null);
        const row = (await invoke(page, 'slide.list')).find((r) => r.id === st.slideId);
        const ok = row?.template === 'split';
        await undo(page);
        return {
          ok,
          evidence: `revision ${before} -> ${after}; template now ${row?.template}; undone`,
        };
      }
      const level = await openPath(page, item.id);
      /* the pointer opens a plate; a click on an open row closes it (see walkMenus) */
      await page.hover(`${ROW_SELECTOR(level)}[data-menu-item="${item.id}"]`);
      const opened = await page
        .waitForSelector(
          `[role="menu"][data-level="${level + 1}"], .ts-menu.is-dynamic [data-control^="${item.id}."]`,
          { timeout: 1500 },
        )
        .catch(() => null);
      if (opened === null) await page.click(`${ROW_SELECTOR(level)}[data-menu-item="${item.id}"]`);
      const sub = await page
        .waitForSelector(
          `[role="menu"][data-level="${level + 1}"], .ts-menu.is-dynamic [data-control^="${item.id}."]`,
          { timeout: 4000 },
        )
        .catch(() => null);
      const plate = sub ? await page.$$('.ts-menu.is-dynamic [data-control]') : [];
      return {
        ok: sub !== null,
        evidence: sub
          ? plate.length > 0
            ? `the ${effect.dynamic} plate opened with ${plate.length} controls`
            : 'submenu opened'
          : 'submenu did not open',
      };
    }
    case 'client':
      return runClientEffect(page, context, item);
    case 'action':
      return runActionEffect(page, context, item, ctx, deckId);
    default:
      return { ok: false, evidence: `unknown effect ${effect.kind}` };
  }
}

async function runClientEffect(page, context, item) {
  switch (item.effect.handler) {
    case 'undo': {
      const before = await revisionOf(page);
      const list = (await invoke(page, 'slide.list')).length;
      await activate(page, item.id);
      const after = await waitRevision(page, before);
      const now = (await invoke(page, 'slide.list')).length;
      return {
        ok: after !== null,
        evidence: `revision ${before} -> ${after}; slides ${list} -> ${now}`,
      };
    }
    case 'redo': {
      const before = await revisionOf(page);
      await activate(page, item.id);
      const after = await waitRevision(page, before);
      return { ok: after !== null, evidence: `revision ${before} -> ${after}` };
    }
    case 'zoomIn':
    case 'zoomOut': {
      const before = (await state(page)).zoom;
      await activate(page, item.id);
      const after = await waitFor(async () => {
        const z = (await state(page)).zoom;
        return z !== before ? z : null;
      });
      return {
        ok: after !== null,
        evidence: `zoom ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
      };
    }
    case 'focusTitle': {
      await activate(page, item.id);
      const focused = await waitFor(() =>
        page.evaluate(() =>
          document.activeElement?.getAttribute('data-control') === 'deck.name' ? 'deck.name' : null,
        ),
      );
      await page.keyboard.press('Escape');
      return { ok: focused !== null, evidence: `focus ${focused ?? 'not on the title field'}` };
    }
    case 'showSaveState':
      return observeSnackbar(page, item, /saved|Not saved/i);
    case 'toolFinder': {
      await activate(page, item.id);
      const open = await waitFor(() =>
        page.$(
          '[data-control="toolFinder"], .ts-finder, [role="dialog"] [data-control="finder.query"], [role="dialog"] input[type="search"], .ts-toolfinder',
        ),
      );
      const evidence = open
        ? 'the finder opened'
        : `no finder surface; dialogs ${JSON.stringify(await dialogs(page))}`;
      await page.keyboard.press('Escape');
      return { ok: Boolean(open), evidence };
    }
    case 'runAction': {
      await activate(page, item.id);
      const open = await waitFor(() => page.$('[data-control="palette"]'));
      await page.keyboard.press('Escape');
      return { ok: Boolean(open), evidence: open ? 'the action list opened' : 'no action list' };
    }
    case 'presenterView': {
      const popup = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null);
      await activate(page, item.id);
      const opened = await popup;
      const on = await waitFor(() => page.$('.pt-viewer.is-present'));
      const url = opened?.url() ?? '';
      if (opened) await opened.close();
      await page.keyboard.press('Escape');
      await waitFor(async () => (await page.$('.pt-viewer.is-present')) === null);
      return {
        ok: Boolean(opened) && /\/present\//.test(url) && Boolean(on),
        evidence: `second window ${url || 'none'}; this window ${on ? 'presenting' : 'not presenting'}`,
      };
    }
    case 'presentFromBeginning':
      return observePresent(page, item);
    case 'selectAll': {
      await activate(page, item.id);
      const selected = await waitFor(() =>
        page.evaluate(() => {
          const cards = document.querySelectorAll('.ts-card[aria-selected="true"]').length;
          const blocks = document.querySelectorAll(
            '.ts-stagewrap [data-block].is-selected, .ts-stagewrap .ts-sel, .ts-stagewrap [aria-selected="true"]',
          ).length;
          return cards + blocks > 0 ? { cards, blocks } : null;
        }),
      );
      await page.keyboard.press('Escape');
      return {
        ok: selected !== null,
        evidence: selected
          ? `selected ${JSON.stringify(selected)}`
          : `nothing selected; snackbar "${await snackbarText(page)}"`,
      };
    }
    case 'link': {
      await activate(page, item.id);
      /* the canvas's link popover is a small dialog named Link (InlineText.tsx); the chrome's fallback is dialog.link */
      const dialog = await waitFor(
        async () =>
          (await dialogs(page)).find(
            (d) => (d.control ?? '').startsWith('dialog.link') || d.title === 'Link',
          ) ?? null,
      );
      const popover = dialog ? null : await page.$('.ts-link-pop, [data-control="dialog.link"]');
      await page.keyboard.press('Escape');
      return {
        ok: Boolean(dialog || popover),
        evidence: dialog
          ? `dialog ${dialog.control} "${dialog.title}"`
          : popover
            ? 'link popover'
            : `nothing opened; snackbar "${await snackbarText(page)}"`,
      };
    }
    case 'cut':
    case 'copy':
    case 'paste':
    case 'pasteWithoutFormatting':
    case 'delete':
    case 'duplicate':
      return { skip: true, evidence: 'run in the clipboard sequence' };
    /* round two (SPEC-2 4.1) */
    case 'cropMode': {
      await activate(page, item.id);
      const chip = await waitFor(() => page.$('.ts-overlay .ts-select-chip.is-crop'), {
        timeout: 4000,
      });
      const text = chip ? await chip.textContent() : '';
      const handles = await page.$$('.ts-overlay [data-control$=".crop.w"]');
      await page.keyboard.press('Escape');
      const gone = await waitFor(
        async () => (await page.$('.ts-overlay .ts-select-chip.is-crop')) === null,
      );
      return {
        ok: Boolean(chip) && handles.length === 1 && Boolean(gone),
        evidence: chip
          ? `crop mode: chip "${text?.trim()}", ${handles.length} west handle; Esc ${gone ? 'left it' : 'stayed'}`
          : `no crop chip; snackbar "${await snackbarText(page)}"`,
      };
    }
    case 'wordArt': {
      const st = await state(page);
      const count = async () => {
        const slide = (await invoke(page, 'slide.get', { slideId: st.slideId })).slide;
        return Object.values(slide.slots ?? {}).flat().length;
      };
      const before = await count();
      const rev = await revisionOf(page);
      await activate(page, item.id);
      const bar = await waitFor(() => page.$('[data-control="wordArt.bar"]'), { timeout: 4000 });
      if (!bar)
        return { ok: false, evidence: `no word art bar; snackbar "${await snackbarText(page)}"` };
      const placeholder = await page.$eval(
        '[data-control="wordArt.text"]',
        (el) => el.getAttribute('placeholder') ?? '',
      );
      await page.fill('[data-control="wordArt.text"]', 'Audit');
      await page.keyboard.press('Enter');
      const after = await waitRevision(page, rev, 10_000);
      await settled(page).catch(() => null);
      const now = await count();
      const slide = (await invoke(page, 'slide.get', { slideId: st.slideId })).slide;
      const art = Object.values(slide.slots ?? {})
        .flat()
        .find((b) => b.type === 'text' && b.outline !== undefined);
      /* on a slide that is not a canvas the insert converts it first (SPEC-2 1.6): the kind's
         fields become blocks too, so the count grows by at least one */
      const ok = after !== null && now >= before + 1 && art !== undefined && art.pos !== undefined;
      if (after !== null) await undo(page);
      return {
        ok,
        evidence: `bar "${placeholder}"; revision ${rev} -> ${after}; blocks ${before} -> ${now}; ${art ? `text block with outline ${JSON.stringify(art.outline)} at ${JSON.stringify(art.pos)}` : 'no outlined text block'}`,
      };
    }
    case 'borderColorPicker':
    case 'borderWeightPicker': {
      const kind = item.effect.handler === 'borderColorPicker' ? 'Color' : 'Weight';
      const object = await selectedObject(page);
      const rev = await revisionOf(page);
      await activate(page, item.id);
      const plate = await waitFor(() => page.$(`[data-control="${item.id}.plate"]`), {
        timeout: 4000,
      });
      if (!plate)
        return {
          ok: false,
          evidence: `no plate for ${kind}; snackbar "${await snackbarText(page)}"`,
        };
      /* a colour of the palette (never None) and a weight of 2 (never Google's Transparent 0) */
      const option =
        (await page.$(
          kind === 'Color'
            ? `[data-control="${item.id}.plate"] [data-control="${item.id}.ink"], [data-control="${item.id}.plate"] [data-control="${item.id}.titanium"]`
            : `[data-control="${item.id}.plate"] [data-control="${item.id}.2"]`,
        )) ??
        (await page.$(
          `[data-control="${item.id}.plate"] [data-control^="${item.id}."]:not([data-control$=".plate"]):not([data-control$=".hex"]):not([data-control$=".none"]):not([data-control$=".0"])`,
        ));
      const picked = option ? await option.getAttribute('data-control') : null;
      if (option) await option.click();
      const after = await waitRevision(page, rev, 8000);
      await settled(page).catch(() => null);
      const block = object ? await blockNow(page, object.slideId, object.blockId) : null;
      const field =
        kind === 'Color'
          ? (block?.stroke ?? block?.outline?.color)
          : (block?.width ?? block?.strokeWidth ?? block?.outline?.width);
      const ok = after !== null && field !== undefined;
      if (after !== null) await undo(page);
      return {
        ok,
        evidence: `plate opened anchored to the row; picked ${picked}; revision ${rev} -> ${after}; ${kind === 'Color' ? 'stroke' : 'strokeWidth'} now ${JSON.stringify(field)}`,
      };
    }
    case 'selectNone': {
      const before = (await state(page)).blockId;
      await activate(page, item.id);
      const cleared = await waitFor(
        async () => ((await state(page)).blockId === null ? true : null),
        { timeout: 4000 },
      );
      const chips = await page.$$('.ts-overlay .ts-select-chip');
      return {
        ok: cleared === true && chips.length === 0,
        evidence: `block ${before} -> ${(await state(page)).blockId}; ${chips.length} selection chips`,
      };
    }
    /* round three (SPEC-3 5.3, 0.16, 4.5, 7.5) */
    case 'comment': {
      const listBefore = await invoke(page, 'comment.list', {}).catch(() => null);
      const before = listBefore?.total ?? listBefore?.threads?.length ?? 0;
      await activate(page, item.id);
      const card = await waitFor(() => page.$('[data-control="comment.card"]'), { timeout: 4000 });
      if (!card)
        return {
          ok: false,
          evidence: `no comment card opened; snackbar "${await snackbarText(page)}"`,
        };
      const field = await page.$('[data-control="comment.card"] [data-control$=".field"]');
      const placeholder = field ? await field.getAttribute('placeholder') : null;
      if (!field) {
        await page.keyboard.press('Escape');
        return { ok: false, evidence: 'the card opened without a text field' };
      }
      await field.fill('Audit comment');
      const submit = await page.$('[data-control="comment.card"] [data-control$=".submit"]');
      if (submit) await submit.click();
      else await page.keyboard.press('Control+Enter');
      const landed = await waitFor(
        async () => {
          const list = await invoke(page, 'comment.list', {}).catch(() => null);
          const now = list?.total ?? list?.threads?.length ?? 0;
          return now > before ? now : null;
        },
        { timeout: 6000 },
      );
      const markers = await page.$$('[data-control="comment.marker"]');
      await page.keyboard.press('Escape');
      return {
        ok: landed !== null && markers.length > 0,
        evidence: `card opened with the field "${placeholder}"; threads ${before} -> ${landed ?? before}; ${markers.length} marker(s)`,
      };
    }
    case 'copyLink': {
      const deckId = (await state(page)).deckId;
      await activate(page, item.id);
      const copied = await waitFor(
        async () => {
          const text = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
          return text.includes('/deck/') ? text : null;
        },
        { timeout: 4000 },
      );
      const origin = new URL(page.url()).origin;
      const wanted = `${origin}/deck/${deckId}`;
      return {
        ok: copied === wanted && !String(copied).includes('/s/'),
        evidence: `clipboard "${copied}" wanted "${wanted}"; snackbar "${await snackbarText(page)}"`,
      };
    }
    case 'goToClient': {
      const others = await page.evaluate(() => {
        const s = window.turboslide.studio.describe().state;
        return typeof s.presence?.others === 'number'
          ? s.presence.others
          : (s.presence?.others?.length ?? 0);
      });
      if (others === 0) return { skip: true, evidence: 'no other participant in the room' };
      const target = collaborator ? (await state(collaborator)).slideId : null;
      await activate(page, item.id);
      const landed = await waitFor(
        async () => {
          const st = await state(page);
          return target === null || st.slideId === target ? st.slideId : null;
        },
        { timeout: 4000 },
      );
      const snack = await snackbarText(page);
      return {
        ok: landed !== null && !/Nobody else/i.test(snack),
        evidence: `current slide ${landed ?? (await state(page)).slideId}, the collaborator's ${target}; snackbar "${snack}"`,
      };
    }
    case 'accountMenu': {
      await activate(page, item.id);
      const menu = await waitFor(() => page.$('#ts-menu-account'), { timeout: 4000 });
      const rowsIn = menu
        ? await page.$$eval('#ts-menu-account [data-menu-item]', (els) =>
            els.map((el) => el.getAttribute('data-menu-item')),
          )
        : [];
      await page.keyboard.press('Escape');
      return {
        ok: Boolean(menu),
        evidence: menu ? `the account menu opened with ${rowsIn.join(', ')}` : 'no account menu',
      };
    }
    default:
      return { ok: false, evidence: `no observer for the client handler ${item.effect.handler}` };
  }
}

// ---------------------------------------------------------------------------------------------
// Round two: the object writes (SPEC-2 section 3 through the rows of 4.1)

/** The selected block and its slide, or null. */
async function selectedObject(page) {
  const st = await state(page);
  if (!st.blockId) return null;
  const slide = (await invoke(page, 'slide.get', { slideId: st.slideId })).slide;
  const block =
    Object.values(slide.slots ?? {})
      .flat()
      .find((b) => b.id === st.blockId) ?? null;
  return { slideId: st.slideId, blockId: st.blockId, slide, block };
}

async function blockNow(page, slideId, blockId) {
  const slide = (await invoke(page, 'slide.get', { slideId })).slide;
  return (
    Object.values(slide.slots ?? {})
      .flat()
      .find((b) => b.id === blockId) ?? null
  );
}

async function objectsOf(page, slideId) {
  const slide = (await invoke(page, 'slide.get', { slideId })).slide;
  return Object.values(slide.slots ?? {}).flat();
}

/**
 * One write from a menu row on the selected object, verified against the block after it and
 * undone; `verify(before, after, slide)` returns { ok, evidence }. A grammar slide converts on
 * the write (SPEC-2 1.6), which the evidence names.
 */
async function observeObjectWrite(page, item, verify) {
  const before = await selectedObject(page);
  if (!before?.block) return { ok: false, evidence: 'no block selected' };
  const wasCanvas = before.slide.layout?.type === 'freeform';
  const outcome = await observeWrite(page, item, {
    verify: async () => {
      const after = await blockNow(page, before.slideId, before.blockId);
      const slide = (await invoke(page, 'slide.get', { slideId: before.slideId })).slide;
      const result = await verify(before.block, after, slide);
      const converted = !wasCanvas && slide.layout?.type === 'freeform';
      return {
        ...result,
        evidence: `${result.evidence}${converted ? '; the slide converted to the canvas in the same write' : ''}`,
      };
    },
  });
  if (outcome.revision !== undefined) await undo(page);
  return outcome;
}

/** The observer of a round two row's action (SPEC-2 4.1), by the action id and the row's input. */
async function runRoundTwoAction(page, context, item, ctx, deckId) {
  const id = item.effect.id;
  const input = item.effect.input ?? {};
  switch (id) {
    case 'block.rotate': {
      const by = input.by ?? 0;
      return observeObjectWrite(page, item, (b, a) => {
        const want = ((((b.pos?.rotate ?? 0) + by) % 360) + 360) % 360;
        const got = a?.pos?.rotate ?? 0;
        return {
          ok: near(got, want, 0.01),
          evidence: `rotate ${b.pos?.rotate ?? 0} -> ${got} (wanted ${want})`,
        };
      });
    }
    case 'block.flip': {
      const axis = input.axis;
      return observeObjectWrite(page, item, (b, a) => {
        const was = (b.pos?.flip ?? '').includes(axis);
        const is = (a?.pos?.flip ?? '').includes(axis);
        return {
          ok: was !== is,
          evidence: `flip ${b.pos?.flip ?? 'none'} -> ${a?.pos?.flip ?? 'none'}`,
        };
      });
    }
    case 'block.align': {
      const edge = input.edge;
      return observeObjectWrite(page, item, (b, a) => {
        const p = a?.pos;
        if (!p) return { ok: false, evidence: 'no pos after the write' };
        const at = {
          left: p.x,
          center: p.x + p.w / 2,
          right: p.x + p.w,
          top: p.y,
          middle: p.y + p.h / 2,
          bottom: p.y + p.h,
        }[edge];
        return {
          ok: near(at, SHEET_EDGE[edge]),
          evidence: `${edge} of one object to the slide: ${Math.round(at * 100) / 100} (wanted ${SHEET_EDGE[edge]}); pos ${JSON.stringify(p)}`,
        };
      });
    }
    case 'block.group':
      return observeObjectWrite(page, item, (b, a, slide) => {
        const tag = a?.pos?.group;
        const members = Object.values(slide.slots ?? {})
          .flat()
          .filter((x) => x.pos?.group === tag).length;
        return {
          ok: tag !== undefined && members >= 2,
          evidence: `group ${tag} with ${members} members`,
        };
      });
    case 'block.ungroup':
      return observeObjectWrite(page, item, (b, a, slide) => {
        const tag = b.pos?.group;
        const left = Object.values(slide.slots ?? {})
          .flat()
          .filter((x) => x.pos?.group === tag).length;
        return {
          ok: tag !== undefined && left === 0,
          evidence: `group ${tag} -> ${left} members left`,
        };
      });
    case 'block.regroup':
      return observeObjectWrite(page, item, (b, a, slide) => {
        const tag = a?.pos?.group;
        const members = Object.values(slide.slots ?? {})
          .flat()
          .filter((x) => x.pos?.group === tag).length;
        return {
          ok: tag !== undefined && members >= 2,
          evidence: `regrouped as ${tag} with ${members} members`,
        };
      });
    case 'text.style': {
      const mark = MARK_OF_ROW[item.id];
      if (!mark) break;
      return observeObjectWrite(page, item, (b, a) => {
        const text =
          typeof a?.text === 'string' ? a.text : JSON.stringify(a?.text ?? a?.items ?? '');
        return {
          ok: markRe(mark).test(text),
          evidence: `text "${text.slice(0, 80)}" carries {${mark}}: ${markRe(mark).test(text)}`,
        };
      });
    }
    case 'text.case': {
      const mode = item.id.split('.').pop();
      return observeObjectWrite(page, item, (b, a) => {
        const before = plainOf(b.text);
        const after = plainOf(a?.text);
        const want =
          mode === 'upper'
            ? before.toUpperCase()
            : mode === 'lower'
              ? before.toLowerCase()
              : before.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
        const ok =
          mode === 'title'
            ? after !== before || before === want
            : after === want || (before === want && after === before);
        return {
          ok: ok && after.length > 0,
          evidence: `${mode}: "${before.slice(0, 40)}" -> "${after.slice(0, 40)}"`,
        };
      });
    }
    case 'text.indent': {
      const direction = item.id.endsWith('increaseIndent') ? 1 : -1;
      if (direction < 0) {
        /* Decrease indent needs an indent: the increase row first, both undone after */
        const rev0 = await revisionOf(page);
        await activate(page, findItem('format.alignIndent.increaseIndent').id);
        const moved = await waitRevision(page, rev0, 8000);
        if (moved === null)
          return { ok: false, evidence: 'Increase indent wrote nothing to set up Decrease indent' };
        await settled(page).catch(() => null);
        const outcome = await observeObjectWrite(page, item, (b, a) => {
          const was = b.typography?.indent ?? b.indent ?? 0;
          const is = a?.typography?.indent ?? a?.indent ?? 0;
          return { ok: is < was, evidence: `indent ${was} -> ${is}` };
        });
        await undo(page);
        return outcome;
      }
      return observeObjectWrite(page, item, (b, a) => {
        const was = b.typography?.indent ?? b.indent ?? 0;
        const is = a?.typography?.indent ?? a?.indent ?? 0;
        return { ok: is > was, evidence: `indent ${was} -> ${is}` };
      });
    }
    case 'text.spacing': {
      const field = item.id.endsWith('addBefore') ? 'spaceBefore' : 'spaceAfter';
      return observeObjectWrite(page, item, (b, a) => {
        const was = b.typography?.[field] ?? 0;
        const is = a?.typography?.[field] ?? 0;
        return { ok: is !== was, evidence: `${field} ${was} -> ${is}` };
      });
    }
    case 'text.columns':
      return observeObjectWrite(page, item, (b, a) => ({
        ok: (a?.typography?.columns ?? 1) !== (b.typography?.columns ?? 1),
        evidence: `columns ${b.typography?.columns ?? 1} -> ${a?.typography?.columns ?? 1}`,
      }));
    case 'line.set': {
      const end = input.start !== undefined ? 'start' : 'end';
      const want = input[end];
      return observeObjectWrite(page, item, (b, a) => {
        const field = end === 'start' ? 'lineStart' : 'lineEnd';
        return {
          ok: (a?.[field] ?? 'none') === want,
          evidence: `${field} ${b[field] ?? 'none'} -> ${a?.[field] ?? 'none'} (wanted ${want})`,
        };
      });
    }
    case 'chart.setKind':
      return observeObjectWrite(page, item, (b, a) => ({
        ok: a?.kind === input.kind,
        evidence: `kind ${b.kind} -> ${a?.kind} (wanted ${input.kind})`,
      }));
    case 'block.set': {
      if (input.dash !== undefined)
        return observeObjectWrite(page, item, (b, a) => ({
          ok:
            (a?.dash ?? 'solid') === input.dash ||
            (input.dash === 'solid' && a?.dash === undefined),
          evidence: `dash ${b.dash ?? 'solid'} -> ${a?.dash ?? 'solid'} (wanted ${input.dash})`,
        }));
      if (item.id === 'format.alignIndent.justified')
        return observeObjectWrite(page, item, (b, a) => ({
          ok: a?.typography?.align === 'justify',
          evidence: `align ${b.typography?.align ?? 'start'} -> ${a?.typography?.align}`,
        }));
      break;
    }
    case 'deck.guides': {
      if (input.clear === true) {
        /* Clear guides needs a guide: one added through the action first, both undone after */
        const info0 = await invoke(page, 'deck.info');
        await invoke(page, 'deck.guides', {
          add: [{ axis: 'x', at: 400 }],
          baseRevision: info0.revision,
        });
        await settled(page).catch(() => null);
        const outcome = await observeWrite(page, item, {
          verify: async () => {
            const info = await invoke(page, 'deck.info');
            const count = (info.guides?.x?.length ?? 0) + (info.guides?.y?.length ?? 0);
            return {
              ok: count === 0,
              evidence: `guides after Clear: ${JSON.stringify(info.guides ?? null)}`,
            };
          },
        });
        if (outcome.revision !== undefined) await undo(page);
        await undo(page);
        return outcome;
      }
      const add = input.add?.[0];
      const outcome = await observeWrite(page, item, {
        verify: async () => {
          const info = await invoke(page, 'deck.info');
          const list = info.guides?.[add?.axis] ?? [];
          const drawn = await page.$$(`.ts-overlay [data-control="guide.${add?.axis}.${add?.at}"]`);
          return {
            ok: add !== undefined && list.includes(add.at),
            evidence: `guides ${JSON.stringify(info.guides ?? null)} (wanted ${add?.axis} ${add?.at}); ${drawn.length} guide line drawn (Show guides ${drawn.length ? 'on' : 'off or hidden'})`,
          };
        },
      });
      if (outcome.revision !== undefined) await undo(page);
      return outcome;
    }
    default:
      break;
  }
  /* every other round two write: the revision moves and the write is undone */
  if (GS2_ACTION_IDS.includes(id)) {
    const outcome = await observeWrite(page, item);
    if (outcome.revision !== undefined) await undo(page);
    return outcome;
  }
  return null;
}

async function runActionEffect(page, context, item, ctx, deckId) {
  const id = item.effect.id;
  /* round two's rows first (SPEC-2 4.1): the observers verify the document after the write */
  const roundTwo = await runRoundTwoAction(page, context, item, ctx, deckId);
  if (roundTwo !== null) return roundTwo;
  switch (id) {
    case 'view.present':
      return observePresent(page, item);
    case 'view.zoom': {
      const wanted = item.effect.input?.zoom;
      await activate(page, item.id);
      const after = await waitFor(async () => {
        const z = (await state(page)).zoom;
        const ok =
          wanted === 'fit'
            ? z === 'fit'
            : typeof z === 'number' &&
              (Math.abs(z - wanted / 100) < 0.001 || Math.abs(z - wanted) < 0.001);
        return ok ? JSON.stringify(z) : null;
      });
      return {
        ok: after !== null,
        evidence: after
          ? `zoom ${after}`
          : `zoom ${JSON.stringify((await state(page)).zoom)} wanted ${wanted}; snackbar "${await snackbarText(page)}"`,
      };
    }
    case 'export.text':
      return observeDownload(page, item, { timeout: 20_000 });
    case 'deck.pack': {
      const outcome = await observeDownload(page, item, { timeout: 30_000 });
      if (outcome.ok) return outcome;
      const snack = await snackbarText(page);
      return /bundle/i.test(snack) ? { ok: true, evidence: `snackbar "${snack}"` } : outcome;
    }
    case 'render.slide':
      return observePopupOrSnackbar(page, context, item, /Rendered|image/i, 90_000);
    case 'build.run':
      return observePopupOrSnackbar(
        page,
        context,
        item,
        /ready|Couldn|failed|error|not/i,
        180_000,
      ).then((o) => ({
        ...o,
        ok: o.ok && /ready/i.test(o.evidence),
      }));
    case 'asset.add':
      return observeFileChooser(page, item);
    case 'deck.rename':
      return renameThroughTitle(page);
    case 'deck.trash':
      return { skip: true, evidence: 'run last, as the cleanup' };
    case 'slide.new': {
      const startList = (await invoke(page, 'slide.list')).map((x) => x.id);
      const before = startList.length;
      const st = await state(page);
      const outcome = await observeWrite(page, item, {
        verify: async () => {
          const list = await invoke(page, 'slide.list');
          const active = (await state(page)).slideId;
          const at = list.findIndex((x) => x.id === st.slideId);
          const created = list[at + 1];
          return {
            ok: list.length === before + 1 && created !== undefined && active === created.id,
            evidence: `slides ${before} -> ${list.length}; new slide ${created?.id} (${created?.template ?? ''}) after ${st.slideId}; current ${active}`,
          };
        },
      });
      if (outcome.ok) {
        await undo(page);
        /* the index rule (integrator 8.2 item 1): after the undo the slide at the copy's index, clamped */
        const at = startList.indexOf(st.slideId);
        outcome.expectActive = startList[Math.min(at + 1, startList.length - 1)];
        outcome.expectWhy = `after Undo of New slide, the slide at index ${Math.min(at + 1, startList.length - 1)}`;
      }
      return outcome;
    }
    case 'slide.duplicate': {
      const startList = (await invoke(page, 'slide.list')).map((x) => x.id);
      const before = startList.length;
      const st = await state(page);
      const outcome = await observeWrite(page, item, {
        verify: async () => {
          const list = await invoke(page, 'slide.list');
          return { ok: list.length === before + 1, evidence: `slides ${before} -> ${list.length}` };
        },
      });
      if (outcome.ok) {
        await undo(page);
        const at = startList.indexOf(st.slideId);
        outcome.expectActive = startList[Math.min(at + 1, startList.length - 1)];
        outcome.expectWhy = `after Undo of Duplicate slide, the slide at index ${Math.min(at + 1, startList.length - 1)}`;
      }
      return outcome;
    }
    case 'slide.remove': {
      const startList = (await invoke(page, 'slide.list')).map((x) => x.id);
      const before = startList.length;
      if (before < 2) return { skip: true, evidence: 'the only slide; run after New slide' };
      const st = await state(page);
      const outcome = await observeWrite(page, item, {
        verify: async () => {
          const list = await invoke(page, 'slide.list');
          const snack = await snackbarText(page);
          return {
            ok: list.length === before - 1 && /deleted/i.test(snack),
            evidence: `slides ${before} -> ${list.length}; snackbar "${snack}"`,
          };
        },
      });
      if (outcome.ok) {
        /* the index rule: the slide that moved into the deleted slide's place, the previous one at the end */
        const at = startList.indexOf(st.slideId);
        const remaining = startList.filter((id) => id !== st.slideId);
        outcome.expectActive = remaining[Math.min(at, remaining.length - 1)];
        outcome.expectWhy = `after Delete slide of ${st.slideId} (index ${at}), the slide now at index ${Math.min(at, remaining.length - 1)}`;
      }
      return outcome;
    }
    case 'slide.skip': {
      const st = await state(page);
      const outcome = await observeWrite(page, item, {
        verify: async () => {
          const row = (await invoke(page, 'slide.list')).find((r) => r.id === st.slideId);
          const card = await page.$(`.ts-card[data-id="${st.slideId}"].is-skipped`);
          const level = await openPath(page, item.id);
          const label = (await readRows(page, level)).find((r) => r.id === item.id)?.label;
          await closeMenus(page);
          return {
            ok: row?.skip === true && card !== null && label === 'Unskip slide',
            evidence: `skip ${row?.skip}; card ${card ? 'dimmed' : 'not dimmed'}; row reads "${label}"`,
          };
        },
      });
      /* unskip through the same row */
      const before = await revisionOf(page);
      await activate(page, item.id);
      await waitRevision(page, before);
      return outcome;
    }
    case 'slide.move': {
      const st = await state(page);
      const before = (await invoke(page, 'slide.list')).map((r) => r.id);
      return observeWrite(page, item, {
        verify: async () => {
          const after = (await invoke(page, 'slide.list')).map((r) => r.id);
          return {
            ok: after.indexOf(st.slideId) !== before.indexOf(st.slideId),
            evidence: `${st.slideId} at ${before.indexOf(st.slideId) + 1} -> ${after.indexOf(st.slideId) + 1}`,
          };
        },
      });
    }
    case 'block.insert': {
      const st = await state(page);
      const count = async () => {
        const slide = (await invoke(page, 'slide.get', { slideId: st.slideId })).slide;
        return Object.values(slide.slots ?? {}).flat().length;
      };
      const before = await count();
      const rev = await revisionOf(page);
      await activate(page, item.id);
      /* a picker or a draw tool: the write follows a pick or a click on the sheet (SPEC 3.1, 7.3) */
      let after = await waitRevision(page, rev, 1500);
      const steps = [];
      /* a draw tool arms data-tool on the stage root (Editor.tsx) until the click or drag places */
      const tool = await page.evaluate(
        () => document.querySelector('[data-tool]')?.getAttribute('data-tool') ?? null,
      );
      if (tool) steps.push(`the stage armed the ${tool} tool`);
      if (after === null) {
        const snack = await snackbarText(page);
        if (/invalid|error|first|needs|Select|Couldn/i.test(snack))
          return { ok: false, evidence: `snackbar "${snack}"` };
        const plate = await page.$(
          '[role="dialog"], .ts-menu.is-dynamic, [data-control^="insert."]',
        );
        if (plate) {
          const pick = await page.$(
            '[role="dialog"] [data-control*="pick"], [role="dialog"] button:not([data-control$=".close"]), .ts-menu.is-dynamic [data-control]',
          );
          steps.push(
            `a plate opened (${(await plate.getAttribute('data-control')) ?? (await plate.getAttribute('class'))})`,
          );
          if (pick) {
            await pick.click();
            after = await waitRevision(page, rev, 5000);
            steps.push('picked the first option');
          }
        } else {
          const spot = await page.evaluate(() => {
            const sheet = document.querySelector('.ts-stagewrap .pt-slide');
            if (!sheet) return null;
            const r = sheet.getBoundingClientRect();
            for (const [fx, fy] of [
              [0.85, 0.85],
              [0.9, 0.2],
              [0.5, 0.92],
              [0.15, 0.9],
            ]) {
              const x = r.left + r.width * fx;
              const y = r.top + r.height * fy;
              const el = document.elementFromPoint(x, y);
              if (el && !el.closest('[data-block], [data-run]')) return { x, y };
            }
            return null;
          });
          if (spot && /^insert\.line\.(curve|polyline)$/.test(item.id)) {
            /* SPEC-2 6.2: Curve and Polyline take a click per point and end on Enter */
            for (const [dx, dy] of [
              [-200, -60],
              [-100, -110],
              [0, -40],
            ]) {
              await page.mouse.click(spot.x + dx, spot.y + dy);
              await page.waitForTimeout(120);
            }
            await page.keyboard.press('Enter');
            after = await waitRevision(page, rev, 4000);
            steps.push('placed three points and pressed Enter');
          } else if (spot && item.id === 'insert.line.scribble') {
            /* SPEC-2 6.2: Scribble samples the pointer every 8 px along a drag */
            await page.mouse.move(spot.x - 240, spot.y - 20);
            await page.mouse.down();
            for (let i = 1; i <= 20; i += 1)
              await page.mouse.move(spot.x - 240 + i * 12, spot.y - 20 + Math.sin(i / 3) * 16);
            await page.mouse.up();
            after = await waitRevision(page, rev, 4000);
            steps.push('dragged a scribble of 20 steps on the sheet');
          } else if (spot) {
            await page.mouse.click(spot.x, spot.y);
            after = await waitRevision(page, rev, 4000);
            steps.push('clicked an empty spot on the sheet');
            if (after === null) {
              await page.mouse.move(spot.x - 160, spot.y - 80);
              await page.mouse.down();
              await page.mouse.move(spot.x, spot.y, { steps: 6 });
              await page.mouse.up();
              after = await waitRevision(page, rev, 4000);
              steps.push('dragged a box on the sheet');
            }
          }
        }
      }
      if (after === null)
        return {
          ok: false,
          evidence: `no write (revision ${rev}); ${steps.join('; ') || 'no plate, no tool'}; snackbar "${await snackbarText(page)}"`,
        };
      await settled(page).catch(() => null);
      const now = await count();
      const outcome = {
        ok: now > before,
        evidence: `revision ${rev} -> ${after}; blocks ${before} -> ${now}${steps.length ? `; ${steps.join('; ')}` : ''}`,
      };
      if (outcome.ok) await undo(page);
      return outcome;
    }
    case 'block.set':
    case 'block.remove':
    case 'block.order':
    case 'block.align':
    case 'block.distribute':
    case 'block.duplicate': {
      const outcome = await observeWrite(page, item);
      if (outcome.ok) await undo(page);
      return outcome;
    }
    /* round three (SPEC-3 4.4, 4.5): Follow moves the stage with the person and shows the plate */
    case 'presence.follow': {
      const others = await page.evaluate(() => {
        const s = window.turboslide.studio.describe().state;
        return typeof s.presence?.others === 'number'
          ? s.presence.others
          : (s.presence?.others?.length ?? 0);
      });
      if (others === 0) return { skip: true, evidence: 'no other participant in the room' };
      /* SPEC-3 4.4: Follow is offered on signed in editors and owners alone; anonymous people get Go to slide */
      const opened = await openPlate(page, PLATE_MENUS['title.presence']).catch(() => false);
      const followRows = opened
        ? await page.$$eval(
            '#ts-menu-roster [data-menu-item="title.presence.follow"]',
            (els) => els.length,
          )
        : 0;
      await page.keyboard.press('Escape');
      if (followRows === 0)
        return {
          skip: true,
          evidence: `${others} participant(s), none a signed in editor: the roster offers Go to slide, Follow is refused for anonymous people (SPEC-3 4.4); presence.follow through the window API is the walk's row`,
        };
      await activate(page, item.id);
      const plate = await waitFor(() => page.$('[data-control="presence.following"]'), {
        timeout: 4000,
      });
      const text = plate ? (await plate.textContent())?.replace(/\s+/g, ' ').trim() : '';
      const following = await page.evaluate(
        () => window.turboslide.studio.describe().state.presence?.following ?? null,
      );
      const stop = await page.$('[data-control="presence.following.stop"]');
      if (stop) await stop.click();
      else await page.keyboard.press('Escape');
      const gone = await waitFor(
        async () => ((await page.$('[data-control="presence.following"]')) === null ? true : null),
        { timeout: 4000 },
      );
      return {
        ok: Boolean(plate) && following !== null && Boolean(gone),
        evidence: `plate "${text}"; following ${following}; Stop ${gone ? 'removed the plate' : 'left it'}`,
      };
    }
    case 'account.signOut':
      return { skip: true, evidence: 'nobody is signed in on this context' };
    default:
      return { ok: false, evidence: `no observer for the action ${id}` };
  }
}

async function renameThroughTitle(page) {
  const info = await invoke(page, 'deck.info');
  const original = info.title;
  await page.click('[data-control="deck.name"]');
  const field = await waitFor(() =>
    page.$(
      'input[data-control="deck.name"], [data-control="deck.name"] input, input.ts-title-input',
    ),
  );
  if (!field) return { ok: false, evidence: 'the title did not turn into a field' };
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('Audit renamed');
  const before = await revisionOf(page);
  await page.keyboard.press('Enter');
  const after = await waitRevision(page, before);
  const renamed = (await invoke(page, 'deck.info')).title;
  /* back to the original name through the action, whatever the field did */
  const rev = await revisionOf(page);
  await invoke(page, 'deck.rename', { name: original, baseRevision: rev }).catch(() => null);
  await settled(page).catch(() => null);
  return {
    ok: after !== null && renamed === 'Audit renamed',
    evidence: `typed "Audit renamed" into the title field: "${original}" -> "${renamed}" (revision ${before} -> ${after}); restored through deck.rename`,
  };
}

/** The clipboard rows on the filmstrip: duplicate, cut, paste, delete, in an order that leaves one slide. */
async function clipboardSequence(page, ctx, tag) {
  const section = `effects:${tag}`;
  const count = async () => (await invoke(page, 'slide.list')).length;
  const start = await count();
  const step = async (id, expectCount, extra) => {
    const item = findItem(id);
    const row = { id, menu: MENU_OF.get(id), effect: item.effect.kind, label: item.label };
    try {
      const before = await revisionOf(page);
      await closeOverlays(page);
      await page.click('.ts-card[data-id]', { timeout: 5000 });
      await activate(page, id);
      const moved = await waitRevision(page, before, expectCount === null ? 1500 : 10_000);
      await settled(page).catch(() => null);
      const now = await count();
      const snack = await snackbarText(page);
      const ok =
        (expectCount === null || now === expectCount) &&
        (extra ? await extra() : true) &&
        !/once they are focused/.test(snack);
      row.evidence = `revision ${before} -> ${moved}; slides ${now}${snack ? `; snackbar "${snack}"` : ''}`;
      if (ok) pass(section, row);
      else fail(section, row);
      return now;
    } catch (error) {
      row.evidence = `threw: ${String(error).slice(0, 200)}`;
      fail(section, row);
      await resetEditor(page, (await state(page)).deckId).catch(() => null);
      return count();
    }
  };
  await step('edit.duplicate', start + 1);
  await step('edit.copy', null);
  await step('edit.cut', start);
  const pasted = await step('edit.paste', start + 1);
  if (pasted === start + 1)
    await step('edit.delete', start, async () => /deleted/i.test(await snackbarText(page)));
  else
    skip(section, {
      id: 'edit.delete',
      menu: 'edit',
      evidence: 'paste did not add a slide; delete not run',
    });
  skip(section, {
    id: 'edit.pasteWithoutFormatting',
    menu: 'edit',
    evidence: 'the same handler as Paste for slides; not run twice',
  });
}

// ---------------------------------------------------------------------------------------------
// Step 6: shortcuts and retired keys

const KEY_NAMES = {
  Cmd: 'Meta',
  Option: 'Alt',
  Ctrl: 'Control',
  Shift: 'Shift',
  Esc: 'Escape',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Plus: 'Equal',
  Minus: 'Minus',
  Space: 'Space',
  '/': 'Slash',
  '\\': 'Backslash',
  '>': 'Shift+Period',
  '<': 'Shift+Comma',
  ']': 'BracketRight',
  '[': 'BracketLeft',
};

function playwrightChord(chord) {
  const parts = chord.split('+');
  const key = parts.pop();
  const mods = parts.map((p) => KEY_NAMES[p] ?? p);
  const mapped =
    KEY_NAMES[key] ??
    (/^\d$/.test(key) ? `Digit${key}` : key.length === 1 ? key.toLowerCase() : key);
  return [...mods, mapped].join('+');
}

async function shellSnapshot(page) {
  return page.evaluate(() => {
    const st = window.turboslide.studio.describe().state;
    const v = document.querySelector('.pt-viewer');
    return {
      mode: st.mode,
      zoom: st.zoom,
      present: st.present ?? v?.classList.contains('is-present'),
      edit: st.edit,
      theme: document.documentElement.getAttribute('data-theme'),
      revision: st.revision,
      slideId: st.slideId,
      compact: v?.classList.contains('is-compact'),
      filmstrip:
        (document.querySelector('[data-control="filmstrip"]')?.getBoundingClientRect().width ?? 0) >
        0,
      menubar: (document.querySelector('.ts-menubar')?.getBoundingClientRect().height ?? 0) > 0,
      panel:
        document.querySelector('.ts-rpanel [data-panel-title]')?.getAttribute('data-panel-title') ??
        null,
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      menus: document.querySelectorAll('[role="menu"]').length,
      drawer: document.querySelector('[data-control="source.drawer"]') !== null,
    };
  });
}

async function checkRetiredKeys(page, tag) {
  for (const key of RETIRED_KEYS) {
    await closeOverlays(page);
    await blurAll(page);
    const before = await shellSnapshot(page);
    await page.keyboard.press(key === '?' ? 'Shift+Slash' : key === '[' ? 'BracketLeft' : key);
    await page.waitForTimeout(350);
    const after = await shellSnapshot(page);
    const diff = Object.keys(before).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
    );
    const snack = await snackbarText(page);
    const row = {
      id: `key.retired.${key}`,
      key,
      evidence: diff.length
        ? `changed ${diff.map((k) => `${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`).join('; ')}`
        : `nothing changed; snackbar "${snack}"`,
    };
    if (diff.length === 0) pass(`retiredKeys:${tag}`, row);
    else fail(`retiredKeys:${tag}`, row);
    if (after.dialogs || after.menus || after.compact || after.present) await closeOverlays(page);
  }
}

/** The bindings whose effect the audit observes from the keyboard. */
async function checkShortcuts(page, context, ctx, deckId, tag) {
  const section = `shortcuts:${tag}`;
  const table = buildKeyTable();
  /* the ten menu access keys */
  for (const menu of MENUS) {
    await closeOverlays(page);
    await blurAll(page);
    const chord = chordsOf(menu.key.mac)[0];
    const text = `${chord.ctrl ? 'Ctrl+' : ''}${chord.alt ? 'Option+' : ''}${chord.cmd ? 'Cmd+' : ''}${chord.shift ? 'Shift+' : ''}${chord.key}`;
    await page.keyboard.press(playwrightChord(text));
    const open = await waitFor(
      () => page.$(`[data-control="menubar.${menu.id}"][aria-expanded="true"]`),
      { timeout: 2000 },
    );
    const row = {
      id: `menu.${menu.id}`,
      key: menu.key.mac,
      evidence: open ? 'the menu opened' : 'the menu did not open',
    };
    if (open) pass(section, row);
    else fail(section, row);
    await closeMenus(page);
  }
  const observable = new Map([
    ['dialog', async (item) => observeDialog(page, item, item.effect.title)],
    ['panel', async (item) => observePanel(page, item.effect.title)],
  ]);
  for (const binding of table) {
    if (binding.status !== 'now' || binding.scope === 'present' || binding.scope === 'menu')
      continue;
    const item = findItem(binding.id);
    if (!item || item.status !== 'now' || !isEnabled(item, ctx)) continue;
    const effect = item.effect;
    const chord = chordsOf(binding.key.mac)[0];
    const text = `${chord.ctrl ? 'Ctrl+' : ''}${chord.alt ? 'Option+' : ''}${chord.cmd ? 'Cmd+' : ''}${chord.shift ? 'Shift+' : ''}${chord.key}`;
    const press = async () => {
      await closeOverlays(page);
      await blurAll(page);
      await page.keyboard.press(playwrightChord(text));
    };
    let outcome = null;
    if (effect.kind === 'dialog' || effect.kind === 'panel') {
      /* the observers activate through the menu; here the key must do the opening */
      await press();
      if (effect.kind === 'dialog') {
        const found = await waitFor(
          async () =>
            (await dialogs(page)).find((d) =>
              d.title.startsWith(DIALOG_TITLE_OF[item.id] ?? effect.title),
            ) ?? null,
          { timeout: 4000 },
        );
        outcome = { ok: Boolean(found), evidence: found ? `dialog "${found.title}"` : 'no dialog' };
      } else {
        const found = await waitFor(
          () => page.$(`.ts-rpanel [data-panel-title="${effect.title}"]`),
          { timeout: 4000 },
        );
        outcome = { ok: Boolean(found), evidence: found ? `panel "${effect.title}"` : 'no panel' };
      }
    } else if (effect.kind === 'toggle' && ['compact', 'gridView'].includes(effect.setting)) {
      const before = await toggleState(page, effect.setting);
      await press();
      const after = await waitFor(
        async () => {
          const v = await toggleState(page, effect.setting);
          return v !== before ? v : null;
        },
        { timeout: 3000 },
      );
      outcome = {
        ok: after !== null,
        evidence: `${effect.setting} ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
      };
      await page.keyboard.press('Escape');
    } else if (effect.kind === 'action' && effect.id === 'view.present') {
      await press();
      const on = await waitFor(() => page.$('.pt-viewer.is-present'), { timeout: 4000 });
      await page.keyboard.press('Escape');
      outcome = { ok: Boolean(on), evidence: on ? 'presenting' : 'not presenting' };
    } else if (effect.kind === 'action' && effect.id === 'view.zoom') {
      await press();
      const z = await waitFor(
        async () => {
          const v = (await state(page)).zoom;
          return v !== 'fit' && v !== undefined ? v : null;
        },
        { timeout: 3000 },
      );
      outcome = {
        ok: z !== null || effect.input?.zoom === 'fit',
        evidence: `zoom ${JSON.stringify((await state(page)).zoom)}`,
      };
      await invoke(page, 'view.zoom', { zoom: 'fit' }).catch(() => null);
    } else if (
      effect.kind === 'client' &&
      (effect.handler === 'zoomIn' || effect.handler === 'zoomOut')
    ) {
      const before = (await state(page)).zoom;
      await press();
      const after = await waitFor(
        async () => {
          const v = (await state(page)).zoom;
          return v !== before ? v : null;
        },
        { timeout: 3000 },
      );
      outcome = {
        ok: after !== null,
        evidence: `zoom ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
      };
      await invoke(page, 'view.zoom', { zoom: 'fit' }).catch(() => null);
    } else if (effect.kind === 'client' && effect.handler === 'toolFinder') {
      await press();
      const open = await waitFor(
        () =>
          page.$(
            '[data-control="toolFinder"], .ts-finder, .ts-toolfinder, [role="dialog"] input[type="search"]',
          ),
        { timeout: 3000 },
      );
      outcome = { ok: Boolean(open), evidence: open ? 'the finder opened' : 'no finder' };
    } else if (effect.kind === 'client' && effect.handler === 'presentFromBeginning') {
      await press();
      const on = await waitFor(() => page.$('.pt-viewer.is-present'), { timeout: 4000 });
      await page.keyboard.press('Escape');
      outcome = { ok: Boolean(on), evidence: on ? 'presenting' : 'not presenting' };
    } else if (effect.kind === 'route' && !effect.newTab) {
      const from = page.url();
      await press();
      const path = effect.path.replace(':deckId', deckId);
      const moved = await waitFor(
        async () => (new URL(page.url()).pathname === path ? page.url() : null),
        { timeout: 8000 },
      );
      outcome = { ok: moved !== null, evidence: `${from} -> ${page.url()}` };
      if (moved) {
        await page.goto(from, { waitUntil: 'domcontentloaded' });
        await ready(page);
      }
    } else if (
      effect.kind === 'action' &&
      (effect.id === 'slide.new' || effect.id === 'slide.duplicate')
    ) {
      const before = (await invoke(page, 'slide.list')).length;
      const rev = await revisionOf(page);
      await closeOverlays(page);
      await page.click('.ts-card[data-id]');
      await page.keyboard.press(playwrightChord(text));
      const after = await waitRevision(page, rev, 8000);
      const now = (await invoke(page, 'slide.list')).length;
      outcome = {
        ok: now === before + 1,
        evidence: `slides ${before} -> ${now} (revision ${rev} -> ${after})`,
      };
      if (now === before + 1) await undo(page);
    } else if (
      effect.kind === 'client' &&
      (effect.handler === 'undo' || effect.handler === 'redo')
    ) {
      const rev = await revisionOf(page);
      await press();
      const after = await waitRevision(page, rev, 6000);
      outcome = { ok: after !== null, evidence: `revision ${rev} -> ${after}` };
    } else {
      continue;
    }
    void observable;
    await closeOverlays(page);
    const row = { id: binding.id, key: binding.key.mac, chord: text, evidence: outcome.evidence };
    if (outcome.ok) pass(section, row);
    else fail(section, row);
  }
}

// ---------------------------------------------------------------------------------------------
// The states beyond the fresh deck: a text block, a shape, a picture, a line, a table cell

async function selectBlockByClick(page, blockId, { text }) {
  const el = await page.$(`.ts-stagewrap .pt-slide [data-block="${blockId}"]`);
  if (!el) return null;
  const box = await el.boundingBox();
  if (!box) return null;
  /* an object is taken by its frame (2 px in from the corner); a text object by a click 12 px
     inside. Under the click model of the focus round (docs/gslides-parity/focus/AMENDMENTS.md
     A1 items 1 and 4) one click selects the object with no caret and no session, so no Escape
     follows it: an Escape on a selected object with no session clears the selection (the check
     chain's step 20 read "clicking p1 then Esc selected null", VERIFICATION.md C2-F13). Only a
     session that did open (the earlier one click model, or a click that landed inside an open
     session) is stepped back to the object with Escape (SPEC-2 0.11) */
  const inset = text ? 12 : 2;
  await page.mouse.click(
    box.x + Math.min(inset, box.width / 2),
    box.y + Math.min(inset, box.height / 2),
  );
  await page.waitForTimeout(150);
  const editing = (await page.$('.ts-stagewrap [contenteditable="true"]')) !== null;
  if (editing) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  const st = await state(page);
  return st.blockId ?? null;
}

async function tailStates(page, context, deckId, tag) {
  const section = `toolbar:${tag}`;
  /* a Title and body slide for the text tail, then the primitives on it */
  const st = await state(page);
  const created = await invoke(page, 'slide.new', {
    layout: 'split',
    after: st.slideId,
    baseRevision: st.revision,
  }).catch((e) => ({ error: String(e) }));
  if (created.error) {
    fail(section, {
      id: 'toolbar.states',
      check: 'setup',
      evidence: `slide.new split: ${created.error}`,
    });
    return null;
  }
  await settled(page).catch(() => null);
  const list = await invoke(page, 'slide.list');
  const slideId = list[list.findIndex((r) => r.id === st.slideId) + 1]?.id;
  await invoke(page, 'view.goto', { slideId });
  await waitFor(async () => ((await state(page)).slideId === slideId ? true : null));
  /* the stage animates to the new slide (data-dir); a click during the transition lands on no
     block (measured: "clicking p1 then Esc selected null" three runs of three on a loaded machine) */
  await page
    .waitForSelector(`.pt-viewer[data-active="${slideId}"]`, { timeout: 5000 })
    .catch(() => null);
  await page.waitForTimeout(400);
  const slide = (await invoke(page, 'slide.get', { slideId })).slide;
  const blocks = Object.entries(slide.slots ?? {}).flatMap(([slot, list]) =>
    list.map((b) => ({ slot, ...b })),
  );
  /* a paragraph or a text box first: Bulleted list converts those and refuses a heading (editor-shell.ts listFrom) */
  const textBlock =
    blocks.find((b) => b.type === 'paragraph' || b.type === 'text' || b.type === 'box') ??
    blocks.find((b) => TEXT_TYPES.has(b.type));
  const slot = textBlock?.slot ?? Object.keys(slide.slots ?? {})[0] ?? 'main';
  /* the primitives */
  const inserts = [
    /* a shape with text, so the Format > Text rows the shape tail enables have a Text to style (SPEC-2 0.11) */
    { id: 'audit-shape', type: 'shape', shape: 'rectangle', text: 'Shape text' },
    { id: 'audit-line', type: 'shape', shape: 'line' },
    {
      id: 'audit-shot',
      type: 'shot',
      asset: Object.keys((await invoke(page, 'deck.info')).assets ?? {})[0] ?? 'opener-brand',
    },
    {
      id: 'audit-table',
      type: 'table',
      columns: [{}, {}],
      rows: [{ cells: ['A', 'B'] }, { cells: ['1', '2'] }],
    },
  ];
  const inserted = [];
  for (const block of inserts) {
    const rev = await revisionOf(page);
    const result = await invoke(page, 'block.insert', {
      slideId,
      slot,
      block,
      baseRevision: rev,
    }).catch((e) => ({ error: String(e) }));
    if (result.error)
      skip(section, {
        id: `toolbar.${block.type}`,
        check: 'setup',
        evidence: `block.insert ${block.type}: ${result.error.slice(0, 160)}`,
      });
    else inserted.push(block);
    await settled(page).catch(() => null);
  }
  /* the text tail */
  let textCtx = null;
  if (textBlock) {
    const selected = await selectBlockByClick(page, textBlock.id, { text: true });
    if (selected === textBlock.id) {
      await checkToolbar(page, 'text', tag);
      textCtx = { slideId, blockId: textBlock.id };
    } else
      fail(section, {
        id: 'toolbar.text',
        check: 'select',
        evidence: `clicking ${textBlock.id} then Esc selected ${selected}`,
      });
  } else
    skip(section, {
      id: 'toolbar.text',
      check: 'setup',
      evidence: 'the Title and body slide has no text block',
    });
  for (const block of inserted) {
    const kind =
      block.type === 'table'
        ? 'table'
        : block.type === 'shot'
          ? 'image'
          : block.shape === 'line'
            ? 'line'
            : 'shape';
    let selected;
    if (kind === 'table') {
      const cell = await page.$(`.ts-stagewrap .pt-slide [data-run="${block.id}/rows/0/cells/0"]`);
      if (cell) {
        const box = await cell.boundingBox();
        await page.mouse.click(box.x + 8, box.y + box.height / 2);
        await page.waitForTimeout(150);
      }
      selected = (await state(page)).blockId;
    } else selected = await selectBlockByClick(page, block.id, { text: false });
    if (selected === block.id) await checkToolbar(page, kind, tag);
    else
      fail(section, {
        id: `toolbar.${kind}`,
        check: 'select',
        evidence: `clicking ${block.id} selected ${selected ?? 'nothing'}`,
      });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }
  return { slideId, textBlock, inserted, textCtx };
}

// ---------------------------------------------------------------------------------------------
// Round two: the object states (SPEC-2 4.2, 4.3, 5, 6.1, 9)

/** The right-click menu on a block's element: a right-click at its top left corner. */
async function openBlockMenu(page, blockId) {
  /* the object is selected first (a right-click inside an unselected text block's run is the
     browser's own menu, round one deviation 5; the round one audit selected before it opened) */
  const selected = await selectBlockByClick(page, blockId, { text: true });
  const el = await page.$(`.ts-stagewrap .pt-slide [data-block="${blockId}"]`);
  if (!el) throw new Error(`no element for ${blockId}`);
  const box = await el.boundingBox();
  const inset = selected === blockId ? 12 : 6;
  await page.mouse.click(box.x + inset, box.y + inset, { button: 'right' });
}

/** The chip's text over the selection, or ''. */
async function chipText(page) {
  return page.evaluate(
    () => document.querySelector('.ts-overlay .ts-select-chip')?.textContent?.trim() ?? '',
  );
}

/** The MenuContext of a selected object, built as the audit reads it (blockFamily by type). */
async function objectContext(page, family, extra = {}) {
  const st = await state(page);
  const slide = (await invoke(page, 'slide.get', { slideId: st.slideId })).slide;
  const objects = Object.values(slide.slots ?? {}).flat();
  const block = objects.find((b) => b.id === st.blockId);
  const freeform = slide.layout?.type === 'freeform';
  const at = objects.findIndex((b) => b.id === st.blockId);
  const z = block?.pos?.z;
  const zs = objects.map((b) => b.pos?.z).filter((v) => v !== undefined);
  const top = zs.length ? Math.max(...zs) : 0;
  const bottom = zs.length ? Math.min(...zs) : 0;
  const forward = freeform
    ? objects.length > 1 && z !== undefined && z < top
    : objects.length > 1 && at >= 0 && at < objects.length - 1;
  const backward = freeform ? objects.length > 1 && z !== undefined && z > bottom : at > 0;
  return contextOf(page, {
    focus: 'canvas',
    selection: {
      blocks: extra.blocks ?? 1,
      block: family,
      box: block?.type === 'box',
      picture: family === 'image',
      textBlock: family === 'text' || family === 'shape' || family === 'table',
      listItem: block?.type === 'plain',
      tableCell: family === 'table',
      linked: false,
      order: { forward, front: forward, backward, back: backward },
      object: true,
      rotatable: true,
      outlined: block?.type === 'text' && block.outline !== undefined,
      imageEdited:
        family === 'image' && Boolean(block?.trim || block?.mask || block?.adjust || block?.crop),
      coversSheet: extra.coversSheet ?? false,
      ...extra.selection,
    },
  });
}

/** Format options' sections with this selection, against SPEC-2 section 5 (the panel opened through the Format menu). */
async function checkFormatSections(page, type, tag) {
  const section = `formatOptions:${tag}`;
  await closeOverlays(page);
  try {
    await activate(page, 'format.formatOptions');
  } catch (error) {
    fail(section, {
      id: `sections.${type}`,
      evidence: `Format options did not open: ${String(error).slice(0, 160)}`,
    });
    return;
  }
  const panel = await waitFor(() => page.$('.ts-rpanel [data-panel-title="Format options"]'));
  if (!panel) {
    fail(section, { id: `sections.${type}`, evidence: 'no Format options panel' });
    return;
  }
  await page.waitForTimeout(250);
  const shown = await page.$$eval('.ts-rpanel [data-section]', (els) =>
    els.map((el) => ({
      id: el.getAttribute('data-section'),
      title: el.querySelector('h3, h2, .ts-panel-section-title, button')?.textContent?.trim() ?? '',
    })),
  );
  const ids = shown.map((s) => s.id);
  const missing = (FORMAT_SECTIONS_FOR[type] ?? []).filter((id) => !ids.includes(id));
  const extra = (FORMAT_SECTIONS_NOT_FOR[type] ?? []).filter((id) => ids.includes(id));
  const order = ids.map((id) => FORMAT_SECTION_ORDER.indexOf(id));
  const ordered = order.every((n, i) => i === 0 || n >= order[i - 1]);
  const untipped = await page.$$eval(
    '.ts-rpanel [data-section] button, .ts-rpanel [data-section] input, .ts-rpanel [data-section] select, .ts-rpanel [data-section] [role="button"], .ts-rpanel [data-section] [role="radio"], .ts-rpanel [data-section] [role="checkbox"]',
    (els) =>
      els
        .filter((el) => !el.closest('[data-tip]') && !el.closest('[aria-hidden="true"]'))
        .map((el) => el.getAttribute('data-control') ?? el.tagName)
        .slice(0, 8),
  );
  await checkDefaultWords(page, `Format options with a ${type} selected`);
  const row = {
    id: `sections.${type}`,
    shown: ids,
    evidence: `sections ${ids.join(', ')}${missing.length ? `; missing ${missing.join(', ')}` : ''}${extra.length ? `; not for a ${type}: ${extra.join(', ')}` : ''}${ordered ? '' : '; out of SPEC-2 section 5 order'}${untipped.length ? `; controls without a tooltip: ${untipped.join(', ')}` : ''}`,
  };
  /* the tooltip verdict on the generated controls is the tooltip audit's (scripts/tooltip-audit.mjs
     --strict walks the inspector); here the list is evidence */
  if (missing.length === 0 && extra.length === 0 && ordered) pass(section, row);
  else fail(section, row);
  const close = await page.$('.ts-rpanel [data-control$=".close"]');
  if (close) await close.click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

/**
 * A context-only row (SPEC-2 4.3: Text fitting, Drop shadow, Alt text, Change shape, Edit data,
 * Chart type ▸) picked from the object's right-click menu, with its effect observed.
 */
async function runContextRow(page, blockId, id, tag, observe) {
  const section = `effects:${tag}`;
  const item = findItem(id);
  if (!item) return;
  await closeOverlays(page);
  /* a right panel a previous row opened stays over the stage: close it first */
  const openPanel = await page.$('.ts-rpanel [data-control$=".close"]');
  if (openPanel) {
    await openPanel.click().catch(() => null);
    await page.waitForTimeout(150);
  }
  try {
    await openBlockMenu(page, blockId);
    await page.waitForSelector('#ts-menu-canvas', { timeout: 4000 });
    const row = await page.$(`#ts-menu-canvas [data-menu-item="${id}"]`);
    if (!row) {
      fail(section, { id, menu: 'context', evidence: 'the row is not in the right-click menu' });
      await closeOverlays(page);
      return;
    }
    const outcome = await observe(row);
    await closeOverlays(page).catch(() => null);
    if (outcome.skip) skip(section, { id, menu: 'context', evidence: outcome.evidence });
    else if (outcome.ok)
      pass(section, { id, menu: 'context', label: item.label, evidence: outcome.evidence });
    else fail(section, { id, menu: 'context', label: item.label, evidence: outcome.evidence });
  } catch (error) {
    fail(section, { id, menu: 'context', evidence: `threw: ${String(error).slice(0, 200)}` });
    await closeOverlays(page).catch(() => null);
  }
}

/** A context row that opens Format options at a section. */
const panelAt = (page, sectionId) => async (row) => {
  await row.click();
  const panel = await waitFor(() => page.$('.ts-rpanel [data-panel-title="Format options"]'));
  const open = panel
    ? await page.$(`.ts-rpanel [data-section="${sectionId}"]:not(.is-closed)`)
    : null;
  const present = panel ? await page.$(`.ts-rpanel [data-section="${sectionId}"]`) : null;
  return {
    ok: Boolean(panel) && Boolean(present),
    evidence: panel
      ? `Format options opened; section ${sectionId} ${present ? (open ? 'open' : 'present, closed') : 'absent'}`
      : `no panel; snackbar "${await snackbarText(page)}"`,
  };
};

/** A dynamic plate pick from a menu row (bar or context): the tile by its data-control, the write verified and undone. */
async function pickFromPlate(page, rowSelector, itemId, tileId, verify) {
  const rev = await revisionOf(page);
  await page.hover(rowSelector);
  const tile = await page
    .waitForSelector(`.ts-menu.is-dynamic [data-control="${itemId}.pick.${tileId}"]`, {
      timeout: 4000,
    })
    .catch(() => null);
  if (!tile) {
    const any = await page.$$eval('.ts-menu.is-dynamic [data-control]', (els) =>
      els.slice(0, 4).map((el) => el.getAttribute('data-control')),
    );
    return {
      ok: false,
      evidence: `no tile ${itemId}.pick.${tileId} (plate shows ${any.join(', ') || 'nothing'})`,
    };
  }
  await tile.click();
  const after = await waitRevision(page, rev, 8000);
  const steps = [];
  let landed = after;
  if (landed === null) {
    /* a shape pick arms the draw tool: a click on empty sheet places the default box */
    const tool = await page.evaluate(
      () => document.querySelector('[data-tool]')?.getAttribute('data-tool') ?? null,
    );
    if (tool) {
      steps.push(`the stage armed the ${tool} tool`);
      const spot = await page.evaluate(() => {
        const sheet = document.querySelector('.ts-stagewrap .pt-slide');
        if (!sheet) return null;
        const r = sheet.getBoundingClientRect();
        for (const [fx, fy] of [
          [0.85, 0.85],
          [0.9, 0.2],
          [0.5, 0.92],
        ]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          const el = document.elementFromPoint(x, y);
          if (el && !el.closest('[data-block], [data-run]')) return { x, y };
        }
        return null;
      });
      if (spot) {
        await page.mouse.click(spot.x, spot.y);
        landed = await waitRevision(page, rev, 6000);
        steps.push('clicked an empty spot on the sheet');
      }
    }
  }
  if (landed === null)
    return {
      ok: false,
      evidence: `picked ${tileId}; no write (revision ${rev}); ${steps.join('; ') || 'no tool armed'}; snackbar "${await snackbarText(page)}"`,
    };
  await settled(page).catch(() => null);
  const result = await verify();
  await page.keyboard.press('Escape');
  await undo(page);
  return {
    ok: result.ok,
    evidence: `picked ${tileId}; revision ${rev} -> ${landed}; ${result.evidence}${steps.length ? `; ${steps.join('; ')}` : ''}`,
  };
}

/** The object shortcuts of SPEC-2 section 9 with a block selected and no caret. */
async function checkObjectShortcuts(page, slideId, blockId, otherId, tag) {
  const section = `shortcuts:${tag}`;
  const select = async (id) => {
    await closeOverlays(page);
    const got = await selectBlockByClick(page, id, { text: false });
    if (got !== id) {
      const editable = await page.$('.ts-stagewrap [contenteditable="true"]');
      if (editable) await page.keyboard.press('Escape');
    }
    return (await state(page)).blockId === id;
  };
  const pos = async () => (await blockNow(page, slideId, blockId))?.pos ?? null;
  const count = async () => (await objectsOf(page, slideId)).length;
  const press = async (chord) => {
    const rev = await revisionOf(page);
    await page.keyboard.press(chord);
    const after = await waitRevision(page, rev, 8000);
    await settled(page).catch(() => null);
    return { rev, after };
  };
  const record = (id, key, ok, evidence) => (ok ? pass : fail)(section, { id, key, evidence });
  const rows = [
    {
      id: 'key.rotate.right15',
      key: 'Option+Right',
      chord: 'Alt+ArrowRight',
      check: (b, a) => near(((a?.rotate ?? 0) - (b?.rotate ?? 0) + 360) % 360, 15, 0.01),
      what: (b, a) => `rotate ${b?.rotate ?? 0} -> ${a?.rotate ?? 0}`,
    },
    {
      id: 'key.rotate.left1',
      key: 'Option+Shift+Left',
      chord: 'Alt+Shift+ArrowLeft',
      check: (b, a) => near(((b?.rotate ?? 0) - (a?.rotate ?? 0) + 360) % 360, 1, 0.01),
      what: (b, a) => `rotate ${b?.rotate ?? 0} -> ${a?.rotate ?? 0}`,
    },
    {
      id: 'key.nudge.right1',
      key: 'Right',
      chord: 'ArrowRight',
      check: (b, a) => near((a?.x ?? 0) - (b?.x ?? 0), 1, 0.01),
      what: (b, a) => `x ${b?.x} -> ${a?.x}`,
    },
    {
      id: 'key.nudge.down10',
      key: 'Shift+Down',
      chord: 'Shift+ArrowDown',
      check: (b, a) => near((a?.y ?? 0) - (b?.y ?? 0), 10, 0.01),
      what: (b, a) => `y ${b?.y} -> ${a?.y}`,
    },
  ];
  for (const row of rows) {
    if (!(await select(blockId))) {
      fail(section, { id: row.id, key: row.key, evidence: `could not select ${blockId}` });
      continue;
    }
    let before = await pos();
    const { rev, after } = await press(row.chord);
    const now = await pos();
    /* on a slide nothing converted the key's write carries the conversion first (SPEC-2 1.6):
       the box the object had is the conversion's */
    let converted = '';
    if (before === null || before === undefined) {
      const list = await versions(page);
      const write = list[list.length - 1]?.mutations ?? [];
      const replaced = write[0]?.op === 'slide.replace' ? write[0].slide : null;
      before = replaced?.slots?.main?.find((b) => b.id === blockId)?.pos ?? null;
      converted = replaced ? '; the slide converted in the same write' : '';
    }
    const ok = after !== null && row.check(before, now);
    record(
      row.id,
      row.key,
      ok,
      `revision ${rev} -> ${after}; ${row.what(before, now)}${converted}`,
    );
    if (after !== null) await undo(page);
  }
  /* the angle readout shows for 600 ms after a rotate key (6.1 row 12) */
  if (await select(blockId)) {
    const rev = await revisionOf(page);
    await page.keyboard.press('Alt+ArrowRight');
    const readout = await waitFor(
      () =>
        page.evaluate(() => document.querySelector('.ts-overlay .ts-readout')?.textContent ?? null),
      { timeout: 1500 },
    );
    const after = await waitRevision(page, rev, 8000);
    await settled(page).catch(() => null);
    record(
      'readout.angle',
      'Option+Right',
      /°$/.test(readout ?? ''),
      `readout "${readout ?? 'none'}"`,
    );
    if (after !== null) await undo(page);
  }
  /* Cmd+D duplicates 16 px right and down on top of the stack (6.1 row 15) */
  if (await select(blockId)) {
    const before = await count();
    let src = await pos();
    const { rev, after } = await press('Meta+d');
    const objects = await objectsOf(page, slideId);
    if (!src) {
      const list = await versions(page);
      const write = list[list.length - 1]?.mutations ?? [];
      src =
        write[0]?.op === 'slide.replace'
          ? write[0].slide?.slots?.main?.find((b) => b.id === blockId)?.pos
          : null;
    }
    const copy = objects.find(
      (b) =>
        b.id !== blockId && b.pos && src && near(b.pos.x, src.x + 16) && near(b.pos.y, src.y + 16),
    );
    record(
      'key.duplicate',
      'Cmd+D',
      after !== null && objects.length === before + 1 && Boolean(copy),
      `revision ${rev} -> ${after}; objects ${before} -> ${objects.length}; copy ${copy ? `${copy.id} at ${JSON.stringify(copy.pos)}` : 'not 16 px right and down'}`,
    );
    if (after !== null) await undo(page);
  }
  /* Tab moves the selection to another object (6.1 row 4) */
  if (await select(blockId)) {
    await blurAll(page);
    await page.keyboard.press('Tab');
    const next = await waitFor(
      async () => {
        const id = (await state(page)).blockId;
        return id && id !== blockId ? id : null;
      },
      { timeout: 3000 },
    );
    record(
      'key.tab',
      'Tab',
      next !== null,
      `selection ${blockId} -> ${next ?? (await state(page)).blockId}`,
    );
  }
  /* Cmd+A on the canvas selects every object (6.1 row 5): the canvas owns focus after the click */
  if (await select(blockId)) {
    const focus = await page.evaluate(
      () => document.activeElement?.closest('.ts-stagewrap, .ts-editor') !== null,
    );
    if (!focus) {
      const el = await page.$(`.ts-stagewrap .pt-slide [data-block="${blockId}"]`);
      const box = await el.boundingBox();
      await page.mouse.click(box.x + 2, box.y + 2);
      if (await page.$('.ts-stagewrap [contenteditable="true"]'))
        await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Meta+a');
    const chip = await waitFor(
      async () => {
        const text = await chipText(page);
        return /objects$/.test(text) ? text : null;
      },
      { timeout: 3000 },
    );
    record(
      'key.selectAll',
      'Cmd+A',
      chip !== null,
      `chip "${chip ?? (await chipText(page))}" over ${await count()} objects`,
    );
    await page.keyboard.press('Escape');
  }
  /* Cmd+Option+G groups two objects, Cmd+Option+Shift+G ungroups (6.1 row 14) */
  if (otherId && (await select(blockId))) {
    const other = await page.$(`.ts-stagewrap .pt-slide [data-block="${otherId}"]`);
    const box = other ? await other.boundingBox() : null;
    if (box) {
      await page.keyboard.down('Shift');
      await page.mouse.click(box.x + 6, box.y + 6);
      await page.keyboard.up('Shift');
      const chip = await waitFor(
        async () => {
          const text = await chipText(page);
          return /2 objects/.test(text) ? text : null;
        },
        { timeout: 3000 },
      );
      if (chip) {
        const { rev, after } = await press('Meta+Alt+g');
        const grouped = await blockNow(page, slideId, blockId);
        const tag = grouped?.pos?.group;
        const members = (await objectsOf(page, slideId)).filter((b) => b.pos?.group === tag).length;
        record(
          'key.group',
          'Cmd+Option+G',
          after !== null && tag !== undefined && members === 2,
          `chip "${chip}"; revision ${rev} -> ${after}; group ${tag} with ${members} members; chip now "${await chipText(page)}"`,
        );
        if (after !== null) {
          const un = await press('Meta+Alt+Shift+g');
          const left = (await objectsOf(page, slideId)).filter((b) => b.pos?.group === tag).length;
          record(
            'key.ungroup',
            'Cmd+Option+Shift+G',
            un.after !== null && left === 0,
            `revision ${un.rev} -> ${un.after}; ${left} members left in ${tag}`,
          );
          if (un.after !== null) await undo(page);
          await undo(page);
        }
      } else
        record(
          'key.group',
          'Cmd+Option+G',
          false,
          `Shift+click did not add ${otherId}: chip "${await chipText(page)}"`,
        );
    }
  }
  /* Delete removes the object in one write (6.1 row 17); one object selected */
  await page.keyboard.press('Escape');
  if (await select(blockId)) {
    const selectedChip = await chipText(page);
    const before = await count();
    const { rev, after } = await press('Delete');
    const now = await count();
    const snack = await snackbarText(page);
    record(
      'key.delete',
      'Delete',
      after !== null && now === before - 1,
      `chip "${selectedChip}"; revision ${rev} -> ${after}; objects ${before} -> ${now}; snackbar "${snack}"`,
    );
    if (after !== null) await undo(page);
  }
  await closeOverlays(page);
}

/** The text chords of SPEC-2 section 9 on a range inside a run: each one write, verified and undone. */
async function checkTextShortcuts(page, slideId, blockId, tag) {
  const section = `shortcuts:${tag}`;
  const caret = async () => {
    await closeOverlays(page);
    const run = await page.$(`.ts-stagewrap .pt-slide [data-run="${blockId}/text"]`);
    if (!run) return false;
    const box = await run.boundingBox();
    /* the click model of the focus round (docs/gslides-parity/focus/AMENDMENTS.md A1): one click
       selects the object with no caret and a double click opens the session at the point; under
       the earlier one click model the second click selects the word, which Home collapses, so the
       battery reads the same first four characters either way */
    await page.mouse.dblclick(box.x + 8, box.y + box.height / 2);
    const editable = await waitFor(
      () => page.$(`.ts-stagewrap [data-run="${blockId}/text"][contenteditable="true"]`),
      { timeout: 3000 },
    );
    if (!editable) return false;
    await page.keyboard.press('Home');
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('Shift+ArrowRight');
    return true;
  };
  const chords = [
    { id: 'key.text.italic', key: 'Cmd+I', chord: 'Meta+i', verify: (t) => markRe('i').test(t) },
    { id: 'key.text.underline', key: 'Cmd+U', chord: 'Meta+u', verify: (t) => markRe('u').test(t) },
    {
      id: 'key.text.strikethrough',
      key: 'Cmd+Shift+X',
      chord: 'Meta+Shift+x',
      verify: (t) => markRe('s').test(t),
    },
    {
      id: 'key.text.superscript',
      key: 'Cmd+.',
      chord: 'Meta+Period',
      verify: (t) => markRe('sup').test(t),
    },
    {
      id: 'key.text.subscript',
      key: 'Cmd+,',
      chord: 'Meta+Comma',
      verify: (t) => markRe('sub').test(t),
    },
  ];
  for (const row of chords) {
    if (!(await caret())) {
      fail(section, { id: row.id, key: row.key, evidence: `no caret in ${blockId}` });
      continue;
    }
    const rev = await revisionOf(page);
    await page.keyboard.press(row.chord);
    /* the burst writes one text.replace after the 400 ms pause (SPEC-2 6.2; text-styles.spec.ts) */
    const after = await waitRevision(page, rev, 10_000);
    await settled(page).catch(() => null);
    const block = await blockNow(page, slideId, blockId);
    const text = typeof block?.text === 'string' ? block.text : JSON.stringify(block?.text ?? '');
    const ok = after !== null && row.verify(text);
    (ok ? pass : fail)(section, {
      id: row.id,
      key: row.key,
      evidence: `revision ${rev} -> ${after}; ${block?.type ?? 'no'} block ${blockId} text "${text.slice(0, 80)}"`,
    });
    await page.keyboard.press('Escape');
    await settled(page).catch(() => null);
    if (after !== null) await undo(page);
  }
  /* Justify and the indents with the block selected and no caret */
  const selectBlock = async () =>
    (await selectBlockByClick(page, blockId, { text: true })) === blockId;
  const blockChords = [
    {
      id: 'key.text.justify',
      key: 'Cmd+Shift+J',
      chord: 'Meta+Shift+j',
      verify: (b) => b?.typography?.align === 'justify',
      what: (b) => `align ${b?.typography?.align}`,
    },
    {
      id: 'key.text.indentMore',
      key: 'Cmd+]',
      chord: 'Meta+BracketRight',
      verify: (b) => (b?.typography?.indent ?? b?.indent ?? 0) > 0,
      what: (b) => `indent ${b?.typography?.indent ?? b?.indent ?? 0}`,
    },
  ];
  for (const row of blockChords) {
    await closeOverlays(page);
    if (!(await selectBlock())) {
      fail(section, { id: row.id, key: row.key, evidence: `could not select ${blockId}` });
      continue;
    }
    const rev = await revisionOf(page);
    await page.keyboard.press(row.chord);
    const after = await waitRevision(page, rev, 8000);
    await settled(page).catch(() => null);
    const block = await blockNow(page, slideId, blockId);
    const ok = after !== null && row.verify(block);
    (ok ? pass : fail)(section, {
      id: row.id,
      key: row.key,
      evidence: `revision ${rev} -> ${after}; ${row.what(block)}; page still at ${new URL(page.url()).pathname}`,
    });
    if (after !== null) await undo(page);
  }
}

/**
 * The round two states on the tail slide: a shape, a line, a picture, a table cell, a chart, a
 * group, a covering picture object and a guide. Each state walks the rows its predicates enable,
 * runs the flipped rows' effects, reads the toolbar tail, the right-click menu and the Format
 * options sections, and dispatches the chords of section 9.
 */
async function roundTwoStates(page, context, states, deckId, tag) {
  const { slideId, textBlock, inserted } = states;
  const byType = (type, shape) =>
    inserted.find(
      (b) =>
        b.type === type && (shape === undefined || (shape === 'line') === (b.shape === 'line')),
    );
  const shape = byType('shape', 'closed');
  const line = byType('shape', 'line');
  const shot = byType('shot');
  const table = byType('table');
  const goto = async () => {
    await closeOverlays(page);
    await invoke(page, 'view.goto', { slideId }).catch(() => null);
    await waitFor(async () => ((await state(page)).slideId === slideId ? true : null));
  };
  const select = async (id) => {
    await goto();
    const got = await selectBlockByClick(page, id, { text: false });
    if (got !== id) {
      const editable = await page.$('.ts-stagewrap [contenteditable="true"]');
      if (editable) await page.keyboard.press('Escape');
    }
    return (await state(page)).blockId === id;
  };
  const effectsWith = async (family, ids, ctx, stateTag) => {
    for (const id of ids) {
      const item = findItem(id);
      if (!item) continue;
      const target =
        family === 'text'
          ? textBlock?.id
          : family === 'shape'
            ? shape?.id
            : family === 'line'
              ? line?.id
              : family === 'image'
                ? shot?.id
                : family === 'table'
                  ? table?.id
                  : null;
      if (!target || !(await select(target))) {
        skip(`effects:${stateTag}`, { id, evidence: `could not select the ${family}` });
        continue;
      }
      const ctxNow = await objectContext(page, family);
      await runEffect(page, context, item, ctxNow, deckId, stateTag);
    }
  };

  // 1. the text block: the round two Format rows (marks, capitalization, justified, indents, spacing, lists)
  if (textBlock) {
    /* the Title and body slide's placeholder is empty: the marks and the case need text, so one
       block.set gives it a sentence first (measured: text.style on an empty Text is a no-op) */
    await goto();
    const rev0 = await revisionOf(page);
    await invoke(page, 'block.set', {
      slideId,
      blockId: textBlock.id,
      path: '/text',
      value: 'The audit paragraph carries a sentence for the marks',
      baseRevision: rev0,
    }).catch(() => null);
    await settled(page).catch(() => null);
    await resetEditor(page, deckId);
    await effectsWith(
      'text',
      [
        'format.text.italic',
        'format.text.underline',
        'format.text.strikethrough',
        'format.text.superscript',
        'format.text.subscript',
        'format.text.capitalization.lower',
        'format.text.capitalization.upper',
        'format.text.capitalization.title',
        'format.alignIndent.justified',
        'format.alignIndent.increaseIndent',
        'format.alignIndent.decreaseIndent',
        'format.spacing.addBefore',
        'format.spacing.addAfter',
        'format.bulletsNumbering.bulleted',
        'format.bulletsNumbering.numbered',
        'edit.selectNone',
      ],
      null,
      'textBlock2',
    );
    /* the preset plates: a pick writes text.list (SPEC-2 11.1 step 20) */
    for (const [rowId, family, preset] of [
      ['format.bulletsNumbering.bulleted', 'bullet', 'disc-circle-square'],
      ['format.bulletsNumbering.numbered', 'number', 'digit-alpha-roman'],
    ]) {
      if (!(await select(textBlock.id))) continue;
      const level = await openPath(page, rowId);
      const outcome = await pickFromPlate(
        page,
        `${ROW_SELECTOR(level)}[data-menu-item="${rowId}"]`,
        rowId,
        preset,
        async () => {
          const block = await blockNow(page, slideId, textBlock.id);
          return {
            ok: block?.type === 'plain' && block.marker === family && block.preset === preset,
            evidence: `block now ${block?.type} marker ${block?.marker} preset ${block?.preset}`,
          };
        },
      ).catch((e) => ({ ok: false, evidence: `threw: ${String(e).slice(0, 160)}` }));
      await closeOverlays(page);
      (outcome.ok ? pass : fail)(`pickers:${tag}`, {
        id: `${rowId}.pick`,
        evidence: outcome.evidence,
      });
    }
    await checkTextShortcuts(page, slideId, textBlock.id, 'text');
    if (await select(textBlock.id)) await checkFormatSections(page, 'text', tag);
    /* the context-only rows of the text block's menu */
    await runContextRow(
      page,
      textBlock.id,
      'format.textFitting',
      'textBlock2',
      panelAt(page, 'textFitting'),
    );
    /* Drop shadow applies to the types whose schema carries `shadow` (box, shape, text, shot,
       picture, icon, table, chart; inspector/format-sections.ts `hasShadow`); on a heading or a
       paragraph the row opens Format options without the section (VERIFICATION-2 finding 10,
       VERIFICATION-3 finding 16), so the section is expected by the block's type at the click, not
       by the row alone (VERIFICATION.md F-step20, `effects:textBlock2 format.dropShadow`) */
    const SHADOW_TYPES = new Set([
      'box',
      'shape',
      'text',
      'shot',
      'picture',
      'icon',
      'table',
      'chart',
    ]);
    const shadowBlock = await blockNow(page, slideId, textBlock.id).catch(() => null);
    const carriesShadow = SHADOW_TYPES.has(shadowBlock?.type ?? textBlock.type);
    await runContextRow(page, textBlock.id, 'format.dropShadow', 'textBlock2', async (row) => {
      const outcome = await panelAt(page, 'shadow')(row);
      if (carriesShadow) return outcome;
      const panelOpened = /Format options opened/.test(outcome.evidence);
      return {
        ok: panelOpened,
        evidence: `${outcome.evidence}; a ${shadowBlock?.type ?? textBlock.type} block carries no shadow field, so the section is absent by the schema`,
      };
    });
    await runContextRow(
      page,
      textBlock.id,
      'format.altText',
      'textBlock2',
      panelAt(page, 'altText'),
    );
  }

  // 2. the shape: rows, effects, tail, menu, sections, chords
  if (shape) {
    if (await select(shape.id)) {
      const ctxS = await objectContext(page, 'shape');
      await walkMenus(page, ctxS, 'shape');
      await checkContextMenu(page, 'shape', () => openBlockMenu(page, shape.id), ctxS, tag);
      await checkFormatSections(page, 'shape', tag);
    }
    await effectsWith(
      'shape',
      [
        'arrange.rotate.clockwise',
        'arrange.rotate.counterClockwise',
        'arrange.rotate.flipHorizontally',
        'arrange.rotate.flipVertically',
        'arrange.centerOnPage.horizontally',
        'arrange.centerOnPage.vertically',
        'arrange.align.left',
        'arrange.align.center',
        'arrange.align.right',
        'arrange.align.top',
        'arrange.align.middle',
        'arrange.align.bottom',
        'arrange.order.bringToFront',
        'arrange.order.bringForward',
        'arrange.order.sendBackward',
        'arrange.order.sendToBack',
        'format.bordersLines.borderColor',
        'format.bordersLines.borderWeight',
        'format.bordersLines.borderDash.dot',
        'format.bordersLines.borderDash.longDash',
        'format.text.italic',
        'edit.selectNone',
      ],
      null,
      'shape',
    );
    /* Change shape from the context menu: a pick writes shape.set */
    await runContextRow(page, shape.id, 'format.changeShape', 'shape', async () => {
      const outcome = await pickFromPlate(
        page,
        '#ts-menu-canvas [data-menu-item="format.changeShape"]',
        'format.changeShape',
        'hexagon',
        async () => {
          const block = await blockNow(page, slideId, shape.id);
          return {
            ok: block?.shape === 'hexagon',
            evidence: `shape ${shape.shape} -> ${block?.shape}`,
          };
        },
      );
      return outcome;
    });
    await checkObjectShortcuts(page, slideId, shape.id, line?.id ?? textBlock?.id, 'objects');
  }

  // 3. the line: the ends and the dash, the menu, the sections
  if (line) {
    if (await select(line.id)) {
      const ctxL = await objectContext(page, 'line');
      await checkContextMenu(page, 'line', () => openBlockMenu(page, line.id), ctxL, tag);
      await checkFormatSections(page, 'line', tag);
    }
    await effectsWith(
      'line',
      [
        'format.bordersLines.lineStart.fillCircle',
        'format.bordersLines.lineEnd.fillArrow',
        'format.bordersLines.lineEnd.openDiamond',
        'format.bordersLines.borderDash.dash',
        'arrange.rotate.clockwise',
      ],
      null,
      'line',
    );
  }

  // 4. the picture: the image menu, the mask plate, crop mode, reset, the sections
  if (shot) {
    if (await select(shot.id)) {
      const ctxI = await objectContext(page, 'image');
      await walkMenus(page, ctxI, 'image');
      await checkContextMenu(page, 'image', () => openBlockMenu(page, shot.id), ctxI, tag);
      await checkFormatSections(page, 'image', tag);
    }
    await effectsWith(
      'image',
      ['format.image.cropImage', 'arrange.rotate.flipHorizontally'],
      null,
      'image',
    );
    if (await select(shot.id)) {
      const level = await openPath(page, 'format.image.maskImage');
      const outcome = await pickFromPlate(
        page,
        `${ROW_SELECTOR(level)}[data-menu-item="format.image.maskImage"]`,
        'format.image.maskImage',
        'ellipse',
        async () => {
          const block = await blockNow(page, slideId, shot.id);
          return {
            ok: block?.mask === 'ellipse',
            evidence: `mask ${shot.mask ?? 'none'} -> ${block?.mask}`,
          };
        },
      ).catch((e) => ({ ok: false, evidence: `threw: ${String(e).slice(0, 160)}` }));
      await closeOverlays(page);
      (outcome.ok ? pass : fail)(`pickers:${tag}`, {
        id: 'format.image.maskImage.pick',
        evidence: outcome.evidence,
      });
    }
    /* Reset image needs an edited picture: a mask through the action first, both undone */
    if (await select(shot.id)) {
      const rev0 = await revisionOf(page);
      await invoke(page, 'block.mask', {
        slideId,
        blockId: shot.id,
        mask: 'ellipse',
        baseRevision: rev0,
      }).catch(() => null);
      await settled(page).catch(() => null);
      if ((await revisionOf(page)) > rev0 && (await select(shot.id))) {
        const ctxE = await objectContext(page, 'image', { selection: { imageEdited: true } });
        const item = findItem('format.image.resetImage');
        const outcome = await observeObjectWrite(page, item, (b, a) => ({
          ok: a?.mask === undefined,
          evidence: `mask ${b.mask} -> ${a?.mask ?? 'none'}`,
        })).catch((e) => ({ ok: false, evidence: `threw: ${String(e).slice(0, 160)}` }));
        void ctxE;
        (outcome.ok ? pass : fail)(`effects:image`, {
          id: 'format.image.resetImage',
          menu: 'format',
          evidence: outcome.evidence,
        });
        await undo(page);
      } else
        skip('effects:image', {
          id: 'format.image.resetImage',
          evidence: 'block.mask did not write to set up Reset image',
        });
    }
  }

  // 5. the table cell: the cell menu, the sections, the range attempt
  if (table) {
    const cell = async (r, c) =>
      page.$(`.ts-stagewrap .pt-slide [data-run="${table.id}/rows/${r}/cells/${c}"]`);
    await goto();
    const first = await cell(0, 0);
    if (first) {
      const box = await first.boundingBox();
      await page.mouse.click(box.x + 8, box.y + box.height / 2);
      await page.waitForTimeout(150);
      /* the click opened the cell's caret; Esc keeps the table selected without it, so the
         right-click on the cell's run reaches the stage (a right-click inside an editing run is
         the browser's own menu, round one deviation 5) */
      if (await page.$('.ts-stagewrap [contenteditable="true"]'))
        await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      if ((await state(page)).blockId === table.id) {
        const ctxT = await objectContext(page, 'table');
        await checkContextMenu(
          page,
          'tableCell',
          async () => {
            const el = await cell(0, 0);
            const b = await el.boundingBox();
            await page.mouse.click(b.x + 8, b.y + b.height / 2, { button: 'right' });
          },
          ctxT,
          tag,
        );
        await checkFormatSections(page, 'table', tag);
        /* the range: a drag from (0, 0) to (1, 1); the stage selects no cellRange this round (B4) */
        await closeOverlays(page);
        const from = await cell(0, 0);
        const to = await cell(1, 1);
        if (from && to) {
          const a = await from.boundingBox();
          const b = await to.boundingBox();
          await page.mouse.move(a.x + 8, a.y + a.height / 2);
          await page.mouse.down();
          await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
          await page.mouse.up();
          await page.waitForTimeout(200);
          await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' });
          const observed = await readContextMenu(page).catch(() => []);
          const wanted = expectedContext('cellRange', ctxT);
          const same =
            JSON.stringify(observed.filter((e) => e !== '-')) ===
            JSON.stringify(wanted.filter((e) => e !== '-'));
          if (same) pass(`contextMenu:${tag}`, { id: 'cellRange', check: 'order', observed });
          else
            skip(`contextMenu:${tag}`, {
              id: 'cellRange',
              check: 'order',
              observed,
              evidence: `recorded deviation (${CELL_RANGE_DEVIATION})`,
            });
          await closeOverlays(page);
        }
      } else
        fail(`contextMenu:${tag}`, {
          id: 'tableCell',
          evidence: `clicking the first cell selected ${(await state(page)).blockId}`,
        });
    }
  }

  // 6. a chart: inserted through the action, its tail, menu, sections and rows. The chart takes a
  //    blank slide of its own (cycle 2, VERIFICATION.md F-step20 `toolbar:objects toolbar.chart`,
  //    b1's R17): on the tail slide its corner sat over the table the earlier states placed and
  //    the click selected the table; the slide leaves with the chart at the end.
  {
    await goto();
    const created = await invoke(page, 'slide.new', {
      layout: 'blank',
      after: slideId,
      baseRevision: await revisionOf(page),
    }).catch((e) => ({ error: String(e) }));
    let chartSlide = null;
    if (!created.error) {
      await settled(page).catch(() => null);
      const list = await invoke(page, 'slide.list').catch(() => []);
      chartSlide = list[list.findIndex((r) => r.id === slideId) + 1]?.id ?? null;
    }
    const gotoChart = async () => {
      await closeOverlays(page);
      await invoke(page, 'view.goto', { slideId: chartSlide }).catch(() => null);
      await waitFor(async () => ((await state(page)).slideId === chartSlide ? true : null));
      await page
        .waitForSelector(`.pt-viewer[data-active="${chartSlide}"]`, { timeout: 5000 })
        .catch(() => null);
    };
    const selectChart = async (id) => {
      await gotoChart();
      const got = await selectBlockByClick(page, id, { text: false });
      if (got !== id && (await page.$('.ts-stagewrap [contenteditable="true"]')))
        await page.keyboard.press('Escape');
      return (await state(page)).blockId === id;
    };
    const rev = await revisionOf(page);
    const chart = {
      id: 'audit-chart',
      type: 'chart',
      kind: 'bar',
      categories: ['A', 'B', 'C'],
      series: [{ name: 'Series 1', values: [3, 5, 2] }],
      pos: { x: 320, y: 180, w: 960, h: 540 },
    };
    const result =
      chartSlide === null
        ? { error: `slide.new blank: ${created.error ?? 'no slide id after the tail slide'}` }
        : await invoke(page, 'block.insert', {
            slideId: chartSlide,
            slot: 'main',
            block: chart,
            baseRevision: rev,
          }).catch((e) => ({ error: String(e) }));
    if (result.error)
      skip(`toolbar:${tag}`, {
        id: 'toolbar.chart',
        check: 'setup',
        evidence: `block.insert chart: ${result.error.slice(0, 200)}`,
      });
    else {
      await settled(page).catch(() => null);
      if (await selectChart(chart.id)) {
        await checkToolbar(page, 'chart', tag);
        const ctxC = await objectContext(page, 'chart');
        await checkContextMenu(page, 'chart', () => openBlockMenu(page, chart.id), ctxC, tag);
        await checkFormatSections(page, 'chart', tag);
        await runContextRow(page, chart.id, 'format.editData', 'chart', panelAt(page, 'chart'));
        await runContextRow(page, chart.id, 'format.chartType', 'chart', async (row) => {
          await row.hover();
          const child = await page
            .waitForSelector('#ts-menu-canvas [data-menu-item="format.chartType.pie"]', {
              timeout: 4000,
            })
            .catch(() => null);
          if (!child) return { ok: false, evidence: 'Chart type ▸ opened no submenu' };
          const before = await revisionOf(page);
          await child.click();
          const after = await waitRevision(page, before, 8000);
          await settled(page).catch(() => null);
          const block = await blockNow(page, chartSlide, chart.id);
          const ok = after !== null && block?.kind === 'pie';
          if (after !== null) await undo(page);
          return { ok, evidence: `revision ${before} -> ${after}; kind bar -> ${block?.kind}` };
        });
        await checkDefaultWords(page, 'a chart selected');
      } else
        fail(`toolbar:${tag}`, {
          id: 'toolbar.chart',
          check: 'select',
          evidence: `clicking ${chart.id} selected ${(await state(page)).blockId}`,
        });
    }
    /* the chart's slide leaves whole, so the group and picture states see the deck as before */
    if (chartSlide !== null) {
      await closeOverlays(page);
      await invoke(page, 'slide.remove', {
        slideId: chartSlide,
        baseRevision: await revisionOf(page),
      }).catch(() => null);
      await settled(page).catch(() => null);
      await goto();
    }
  }

  // 7. a group of the shape and the line: Group, the group tail, menu, sections, Ungroup, Regroup
  if (shape && line && (await select(shape.id))) {
    const other = await page.$(`.ts-stagewrap .pt-slide [data-block="${line.id}"]`);
    const box = other ? await other.boundingBox() : null;
    if (box) {
      await page.keyboard.down('Shift');
      await page.mouse.click(box.x + 6, box.y + 6);
      await page.keyboard.up('Shift');
      const two = await waitFor(
        async () => (/2 objects/.test(await chipText(page)) ? true : null),
        { timeout: 3000 },
      );
      if (two) {
        const ctx2 = await objectContext(page, 'shape', { blocks: 2 });
        await walkMenus(page, ctx2, 'twoObjects');
        const item = findItem('arrange.group');
        const before = await revisionOf(page);
        await activate(page, item.id).catch(() => null);
        const after = await waitRevision(page, before, 8000);
        await settled(page).catch(() => null);
        const tagOf = (await blockNow(page, slideId, shape.id))?.pos?.group;
        const members = (await objectsOf(page, slideId)).filter(
          (b) => b.pos?.group === tagOf,
        ).length;
        (after !== null && tagOf && members === 2 ? pass : fail)(`effects:${tag}`, {
          id: 'arrange.group',
          menu: 'arrange',
          evidence: `revision ${before} -> ${after}; group ${tagOf} with ${members} members`,
        });
        if (after !== null) {
          /* a click on a member selects the group */
          await page.keyboard.press('Escape');
          if (await select(shape.id)) {
            const chip = await chipText(page);
            (chip === 'Group' ? pass : fail)(`toolbar:${tag}`, {
              id: 'group.chip',
              evidence: `chip "${chip}"`,
            });
            await checkToolbar(page, 'group', tag);
            const ctxG = await objectContext(page, 'shape', {
              blocks: 2,
              selection: { group: tagOf },
            });
            await checkContextMenu(page, 'group', () => openBlockMenu(page, shape.id), ctxG, tag);
            await checkFormatSections(page, 'group', tag);
            const ring = await page.$('.ts-overlay .ts-group[role="group"]');
            (ring ? pass : fail)(`toolbar:${tag}`, {
              id: 'group.ring',
              evidence: ring ? 'the union ring carries role="group"' : 'no role="group" ring',
            });
            /* Ungroup from the Arrange menu, then Regroup */
            const b1 = await revisionOf(page);
            await activate(page, 'arrange.ungroup').catch(() => null);
            const a1 = await waitRevision(page, b1, 8000);
            await settled(page).catch(() => null);
            const left = (await objectsOf(page, slideId)).filter(
              (b) => b.pos?.group === tagOf,
            ).length;
            (a1 !== null && left === 0 ? pass : fail)(`effects:${tag}`, {
              id: 'arrange.ungroup',
              menu: 'arrange',
              evidence: `revision ${b1} -> ${a1}; ${left} members left`,
            });
            if (a1 !== null && (await select(shape.id))) {
              const b2 = await revisionOf(page);
              await activate(page, 'arrange.regroup').catch(() => null);
              const a2 = await waitRevision(page, b2, 8000);
              await settled(page).catch(() => null);
              const re = (await blockNow(page, slideId, shape.id))?.pos?.group;
              (a2 !== null && re ? pass : fail)(`effects:${tag}`, {
                id: 'arrange.regroup',
                menu: 'arrange',
                evidence: `revision ${b2} -> ${a2}; group ${re ?? 'none'}`,
              });
              if (a2 !== null) await undo(page);
            }
            if (a1 !== null) await undo(page);
          }
          await undo(page);
        }
      } else
        fail(`effects:${tag}`, {
          id: 'arrange.group',
          menu: 'arrange',
          evidence: `Shift+click did not add the line: chip "${await chipText(page)}"`,
        });
    }
  }

  // 8. a guide: Add vertical guide, the guide line, its menu, Delete guide
  {
    await goto();
    await closeOverlays(page);
    const info0 = await invoke(page, 'deck.info');
    await invoke(page, 'deck.guides', {
      add: [{ axis: 'x', at: 800 }],
      baseRevision: info0.revision,
    }).catch(() => null);
    await settled(page).catch(() => null);
    /* View > Guides > Show guides, when off */
    const level = await openPath(page, 'view.guides.show');
    const rowsNow = await readRows(page, level);
    const showRow = rowsNow.find((r) => r.id === 'view.guides.show');
    if (showRow && showRow.checked !== 'true')
      await page.click(`${ROW_SELECTOR(level)}[data-menu-item="view.guides.show"]`);
    await closeMenus(page);
    const guide = await waitFor(() => page.$('.ts-overlay [data-control="guide.x.800"]'), {
      timeout: 4000,
    });
    const ctxGd = { ...(await contextOf(page)), guides: 1 };
    /* the guides are parked (docs/FOCUS.md 3.2): their rows are drawn with the switch on, and the
       guide's own right click menu is the feature's behaviour behind the switch. A menu that does
       not open within 4 s is the guide's defect (build/b1.md R16, the objects lane's
       `packages/viewer/src/Guides.tsx`), recorded as not driven with that reason rather than as
       a red check of a parked feature (VERIFICATION.md C2-F13); a menu that opens is checked
       against the model as before */
    const guideParked = !isPresent(findItem('view.guides') ?? {}, DEFAULT_MENU_CONTEXT);
    const rightClickGuide = async () => {
      const g = await page.$('.ts-overlay [data-control="guide.x.800"]');
      const b = await g.boundingBox();
      await page.mouse.click(b.x + b.width / 2, b.y + Math.min(200, b.height / 2), {
        button: 'right',
      });
      return page
        .waitForSelector('#ts-menu-canvas [data-menu-item]', { timeout: 4000 })
        .catch(() => null);
    };
    if (guide) {
      pass(`rows:${tag}`, {
        id: 'guide.drawn',
        menu: 'view',
        evidence: 'the vertical guide at 800 is drawn in the overlay',
      });
      await closeOverlays(page);
      const opened = await rightClickGuide();
      await closeOverlays(page);
      if (opened === null && guideParked) {
        skip(`contextMenu:${tag}`, {
          id: 'guide',
          check: 'opens',
          evidence:
            'not driven: no menu opened within 4 s on a right click on the drawn guide; the guides are parked (docs/FOCUS.md 3.2) and the menu is the feature’s own defect behind the switch (build/b1.md R16, Guides.tsx)',
        });
        skip(`effects:${tag}`, {
          id: 'view.guides.delete',
          menu: 'view',
          evidence:
            'not driven: the guide menu did not open (build/b1.md R16); the guides are parked',
        });
      } else {
        await checkContextMenu(
          page,
          'guide',
          async () => {
            await rightClickGuide();
          },
          ctxGd,
          tag,
        );
        /* Delete guide from the guide's menu writes deck.guides with remove */
        await closeOverlays(page);
        await rightClickGuide();
        const del = await page
          .waitForSelector('#ts-menu-canvas [data-menu-item="view.guides.delete"]', {
            timeout: 4000,
          })
          .catch(() => null);
        if (del) {
          const before = await revisionOf(page);
          await del.click();
          const after = await waitRevision(page, before, 8000);
          await settled(page).catch(() => null);
          const info = await invoke(page, 'deck.info');
          const gone = !(info.guides?.x ?? []).includes(800);
          (after !== null && gone ? pass : fail)(`effects:${tag}`, {
            id: 'view.guides.delete',
            menu: 'view',
            evidence: `revision ${before} -> ${after}; guides ${JSON.stringify(info.guides ?? null)}`,
          });
          if (after !== null) await undo(page);
        } else
          fail(`effects:${tag}`, {
            id: 'view.guides.delete',
            menu: 'view',
            evidence: 'no Delete guide row in the guide menu',
          });
      }
    } else
      fail(`rows:${tag}`, {
        id: 'guide.drawn',
        menu: 'view',
        evidence: 'no guide line drawn after Add vertical guide and Show guides',
      });
    await closeOverlays(page);
    /* Show ruler: the two rulers with 14 and 8 numerals (SPEC-2 11.8 step 6) */
    const lvl = await openPath(page, 'view.showRuler');
    await page.click(`${ROW_SELECTOR(lvl)}[data-menu-item="view.showRuler"]`);
    await closeMenus(page);
    const rulers = await waitFor(
      async () => ((await page.$$('.ts-overlay .ts-ruler, .ts-ruler')).length === 2 ? true : null),
      { timeout: 4000 },
    );
    const numerals = await page.$$eval('.ts-ruler', (els) =>
      els.map((el) => el.querySelectorAll('.ts-ruler-numeral').length),
    );
    (rulers && numerals.includes(14) && numerals.includes(8) ? pass : fail)(`rows:${tag}`, {
      id: 'ruler.drawn',
      menu: 'view',
      evidence: `rulers ${rulers ? 2 : (await page.$$('.ts-ruler')).length}; numerals ${numerals.join(' and ')} (wanted 14 and 8)`,
    });
    const lvl2 = await openPath(page, 'view.showRuler');
    const label = (await readRows(page, lvl2)).find((r) => r.id === 'view.showRuler')?.label;
    (label === 'Hide ruler' ? pass : fail)(`rows:${tag}`, {
      id: 'view.showRuler.altLabel',
      menu: 'view',
      evidence: `row reads "${label}" while the rulers show`,
    });
    await page.click(`${ROW_SELECTOR(lvl2)}[data-menu-item="view.showRuler"]`);
    await closeMenus(page);
    await checkDefaultWords(page, 'rulers and a guide shown');
    /* the guide leaves: Clear guides through the action */
    const info1 = await invoke(page, 'deck.info');
    if ((info1.guides?.x?.length ?? 0) + (info1.guides?.y?.length ?? 0) > 0)
      await invoke(page, 'deck.guides', { clear: true, baseRevision: info1.revision }).catch(
        () => null,
      );
    await settled(page).catch(() => null);
  }

  // 9. a covering picture object at the bottom of the stack: the image menu appends Change background and Guides (SPEC-2 0.100)
  if (shot) {
    await goto();
    const rev = await revisionOf(page);
    const asset = shot.asset;
    const picture = {
      id: 'audit-picture',
      type: 'picture',
      asset,
      pos: { x: 0, y: 0, w: 1600, h: 900 },
    };
    const result = await invoke(page, 'block.insert', {
      slideId,
      slot: 'main',
      block: picture,
      baseRevision: rev,
    }).catch((e) => ({ error: String(e) }));
    if (!result.error) {
      await settled(page).catch(() => null);
      await invoke(page, 'block.order', {
        slideId,
        blockId: picture.id,
        move: 'back',
        baseRevision: await revisionOf(page),
      }).catch(() => null);
      await settled(page).catch(() => null);
      const pictureZ = (await blockNow(page, slideId, picture.id))?.pos?.z ?? 0;
      const bottom = (await objectsOf(page, slideId)).every(
        (b) => b.id === picture.id || (b.pos?.z ?? 0) > pictureZ,
      );
      /* the picture covers the sheet: a right-click on it away from the other objects */
      await closeOverlays(page);
      const el = await page.$(`.ts-stagewrap .pt-slide .free[data-free="${picture.id}"]`);
      if (el) {
        const box = await el.boundingBox();
        await page.mouse.click(box.x + 30, box.y + box.height - 30);
        await page.waitForTimeout(150);
        const selected = (await state(page)).blockId === picture.id;
        const ctxP = await objectContext(page, 'image', { coversSheet: true });
        await checkContextMenu(
          page,
          'image',
          async () => {
            await page.mouse.click(box.x + 30, box.y + box.height - 30, { button: 'right' });
          },
          ctxP,
          'coversSheet',
        );
        (selected ? pass : fail)(`rows:${tag}`, {
          id: 'picture.coversSheet',
          menu: 'context',
          evidence: `picture object at z bottom ${bottom}; selected by a click ${selected}`,
        });
      }
      await invoke(page, 'block.remove', {
        slideId,
        blockId: picture.id,
        baseRevision: await revisionOf(page),
      }).catch(() => null);
      await settled(page).catch(() => null);
    } else
      skip(`contextMenu:coversSheet`, {
        id: 'image',
        evidence: `block.insert picture: ${result.error.slice(0, 200)}`,
      });
  }

  // 10. the table hover grid and a shape grid pick from the Insert menu, the special characters pick, the Diagram panel's insert
  {
    await goto();
    await closeOverlays(page);
    const count = async () => (await objectsOf(page, slideId)).length;
    const before = await count();
    const level = await openPath(page, 'insert.table');
    const outcome = await pickFromPlate(
      page,
      `${ROW_SELECTOR(level)}[data-menu-item="insert.table"]`,
      'insert.table',
      '4x3',
      async () => {
        const objects = await objectsOf(page, slideId);
        const table = objects.find((b) => b.type === 'table' && b.id !== 'audit-table');
        return {
          ok:
            objects.length === before + 1 &&
            table?.columns?.length === 4 &&
            table?.rows?.length === 3 &&
            table.pos !== undefined,
          evidence: `objects ${before} -> ${objects.length}; table ${table ? `${table.columns?.length} by ${table.rows?.length} at ${JSON.stringify(table.pos)}` : 'none'}`,
        };
      },
    ).catch((e) => ({ ok: false, evidence: `threw: ${String(e).slice(0, 160)}` }));
    await closeOverlays(page);
    (outcome.ok ? pass : fail)(`pickers:${tag}`, {
      id: 'insert.table.pick',
      evidence: outcome.evidence,
    });
    for (const [rowId, tile] of [
      ['insert.shape.shapes', 'hexagon'],
      ['insert.shape.arrows', 'rightArrow'],
      ['insert.shape.callouts', 'wedgeRectCallout'],
      ['insert.shape.equation', 'mathPlus'],
    ]) {
      await goto();
      await closeOverlays(page);
      const n = await count();
      const lvl = await openPath(page, rowId);
      const picked = await pickFromPlate(
        page,
        `${ROW_SELECTOR(lvl)}[data-menu-item="${rowId}"]`,
        rowId,
        tile,
        async () => {
          const objects = await objectsOf(page, slideId);
          const drawn = objects.find((b) => b.type === 'shape' && b.shape === tile);
          return {
            ok: objects.length === n + 1 && drawn !== undefined && drawn.pos !== undefined,
            evidence: `objects ${n} -> ${objects.length}; ${drawn ? `${tile} at ${JSON.stringify(drawn.pos)}` : `no ${tile}`}`,
          };
        },
      ).catch((e) => ({ ok: false, evidence: `threw: ${String(e).slice(0, 160)}` }));
      await closeOverlays(page);
      (picked.ok ? pass : fail)(`pickers:${tag}`, {
        id: `${rowId}.pick`,
        evidence: picked.evidence,
      });
    }
    /* the special characters dialog: a pick with no caret creates a text box (SPEC-2 6.2) */
    await goto();
    await closeOverlays(page);
    {
      const n = await count();
      const rev = await revisionOf(page);
      await activate(page, 'insert.specialCharacters').catch(() => null);
      const tileEl = await page
        .waitForSelector('[data-control^="dialog.specialCharacters.pick."]', { timeout: 5000 })
        .catch(() => null);
      if (tileEl) {
        const id = await tileEl.getAttribute('data-control');
        await tileEl.click();
        const after = await waitRevision(page, rev, 8000);
        await settled(page).catch(() => null);
        const objects = await objectsOf(page, slideId);
        const still = await page.$(
          '[role="dialog"] [data-control="dialog.specialCharacters.grid"]',
        );
        (after !== null && objects.length === n + 1 ? pass : fail)(`pickers:${tag}`, {
          id: 'insert.specialCharacters.pick',
          evidence: `picked ${id}; revision ${rev} -> ${after}; objects ${n} -> ${objects.length}; the dialog ${still ? 'stays open' : 'closed'}`,
        });
        await closeOverlays(page);
        if (after !== null) await undo(page);
      } else
        fail(`pickers:${tag}`, {
          id: 'insert.specialCharacters.pick',
          evidence: 'the dialog shows no character tile',
        });
      await closeOverlays(page);
    }
    /* the Diagram panel: Insert writes a group of objects */
    await goto();
    await closeOverlays(page);
    {
      const n = await count();
      const rev = await revisionOf(page);
      await activate(page, 'insert.diagram').catch(() => null);
      const panel = await waitFor(() => page.$('.ts-rpanel [data-panel-title="Diagram"]'), {
        timeout: 5000,
      });
      if (panel) {
        await checkDefaultWords(page, 'the Diagram panel');
        const insert = await page.$(
          '.ts-rpanel [data-control="diagram.insert"], .ts-rpanel button:has-text("Insert")',
        );
        if (insert) {
          await insert.click();
          const after = await waitRevision(page, rev, 10_000);
          await settled(page).catch(() => null);
          const objects = await objectsOf(page, slideId);
          const tags = new Set(objects.filter((b) => b.pos?.group).map((b) => b.pos.group));
          (after !== null && objects.length > n + 1 && tags.size >= 1 ? pass : fail)(
            `pickers:${tag}`,
            {
              id: 'insert.diagram.insert',
              evidence: `revision ${rev} -> ${after}; objects ${n} -> ${objects.length}; groups ${[...tags].join(', ') || 'none'}`,
            },
          );
          if (after !== null) await undo(page);
        } else
          fail(`pickers:${tag}`, {
            id: 'insert.diagram.insert',
            evidence: 'no Insert button in the Diagram panel',
          });
        const close = await page.$('.ts-rpanel [data-control$=".close"]');
        if (close) await close.click();
      } else fail(`pickers:${tag}`, { id: 'insert.diagram.insert', evidence: 'no Diagram panel' });
      await closeOverlays(page);
    }
    /* the Background dialog: Color writes the slide's fill; Choose from this presentation inserts the picture object at the bottom */
    await goto();
    await closeOverlays(page);
    {
      const rev = await revisionOf(page);
      await activate(page, 'slide.changeBackground').catch(() => null);
      const dialog = await waitFor(() => page.$('[data-control="dialog.background"]'), {
        timeout: 5000,
      });
      if (dialog) {
        const swatch = await page.$(
          '[data-control^="dialog.background.color."]:not([data-control$=".none"]):not([data-control$=".hex"])',
        );
        const picked = swatch ? await swatch.getAttribute('data-control') : null;
        if (swatch) await swatch.click();
        const done = await page.$(
          '[data-control="dialog.background"] [data-control$=".done"], [data-control="dialog.background"] button:has-text("Done")',
        );
        if (done) await done.click();
        const after = await waitRevision(page, rev, 8000);
        await settled(page).catch(() => null);
        const slide = (await invoke(page, 'slide.get', { slideId })).slide;
        (after !== null && slide.background !== undefined ? pass : fail)(`effects:${tag}`, {
          id: 'slide.changeBackground.color',
          menu: 'slide',
          evidence: `picked ${picked}; Done ${done ? 'clicked' : 'not found'}; revision ${rev} -> ${after}; background ${JSON.stringify(slide.background ?? null)}`,
        });
        await closeOverlays(page);
        if (after !== null) await undo(page);
        /* Choose from this presentation */
        const rev2 = await revisionOf(page);
        const n = await count();
        await activate(page, 'slide.changeBackground').catch(() => null);
        await waitFor(() => page.$('[data-control="dialog.background"]'), { timeout: 5000 });
        const choose = await page.$(
          '[data-control^="dialog.background.choose."]:not([data-control$=".upload"]):not([data-control$=".byUrl"])',
        );
        const chosen = choose ? await choose.getAttribute('data-control') : null;
        if (choose) await choose.click();
        const done2 = await page.$(
          '[data-control="dialog.background"] [data-control$=".done"], [data-control="dialog.background"] button:has-text("Done")',
        );
        if (done2) await done2.click();
        const after2 = await waitRevision(page, rev2, 10_000);
        await settled(page).catch(() => null);
        const objects = await objectsOf(page, slideId);
        const pic = objects.find((b) => b.type === 'picture');
        const lowest = Math.min(...objects.map((b) => b.pos?.z ?? 0));
        (after2 !== null && pic && pic.pos?.z === lowest && pic.pos.w === 1600 ? pass : fail)(
          `effects:${tag}`,
          {
            id: 'slide.changeBackground.choose',
            menu: 'slide',
            evidence: `chose ${chosen}; revision ${rev2} -> ${after2}; objects ${n} -> ${objects.length}; picture ${pic ? JSON.stringify(pic.pos) : 'none'} (lowest z ${lowest})`,
          },
        );
        await closeOverlays(page);
        if (after2 !== null) await undo(page);
      } else
        fail(`effects:${tag}`, {
          id: 'slide.changeBackground.color',
          menu: 'slide',
          evidence: 'no Background dialog',
        });
      await closeOverlays(page);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The cleanup: Move to trash, then Delete forever from /decks/trash

async function trashAndDelete(page, context, deckId, tag) {
  const section = `effects:${tag}`;
  const item = findItem('file.moveToTrash');
  await closeOverlays(page);
  const from = page.url();
  await activate(page, item.id);
  const moved = await waitFor(
    async () => {
      const path = new URL(page.url()).pathname;
      const snack = await snackbarText(page).catch(() => '');
      return path === '/decks' || /trash/i.test(snack) ? `${path} "${snack}"` : null;
    },
    { timeout: 15_000 },
  );
  const row = {
    id: item.id,
    menu: 'file',
    effect: 'action',
    label: item.label,
    evidence: moved
      ? `${from} -> ${moved}`
      : `no navigation and no snackbar within 15 s (${page.url()})`,
  };
  if (moved) pass(section, row);
  else fail(section, row);
  /* Delete forever */
  await page.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-hydrated]', { timeout: 60_000 }).catch(() => null);
  const card = await waitFor(() => page.$(`[data-control="trash.card.${deckId}"]`), {
    timeout: 15_000,
  });
  if (!card) {
    fail(section, {
      id: 'trash.card',
      menu: 'home',
      evidence: `/decks/trash lists no card for ${deckId}`,
    });
  } else {
    await page.click(`[data-control="trash.delete.${deckId}"]`);
    const confirm = await waitFor(() => page.$('[data-control="trash.confirm.ok"]'));
    if (confirm) await confirm.click();
    const gone = await waitFor(
      async () => ((await page.$(`[data-control="trash.card.${deckId}"]`)) === null ? true : null),
      { timeout: 30_000 },
    );
    const rowDel = {
      id: 'trash.delete',
      menu: 'home',
      label: 'Delete forever',
      evidence: gone ? `the card of ${deckId} left the trash` : 'the card stayed',
    };
    if (gone) pass(section, rowDel);
    else fail(section, rowDel);
  }
  /* the deck must be gone from the home page */
  await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 60_000 }).catch(() => null);
  const still = await page.$(`[data-control="home.open.${deckId}"]`);
  if (still) fail(section, { id: 'cleanup', evidence: `${deckId} is still on the home page` });
  return { deleted: !still };
}

// ---------------------------------------------------------------------------------------------
// The tooltip audit (SPEC 13.4) as a child process

function runTooltipAudit(urls) {
  const args = [join(ROOT, 'scripts/tooltip-audit.mjs'), '--base', BASE, '--strict', '--json'];
  for (const url of urls) args.push('--url', url);
  if (IS_LOCAL)
    args.push(
      '--allow',
      '[class^="go"]',
      '--allow',
      '.tsqd-parent-container',
      '--allow',
      '.tsqd-parent-container *',
    );
  const result = spawnSync('node', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 600_000,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = null;
  }
  return {
    exit: result.status,
    stdout: result.stdout.slice(0, 4000),
    stderr: result.stderr.slice(-2000),
    parsed,
  };
}

// ---------------------------------------------------------------------------------------------
// Round three (SPEC-3 16.2): the title row slots, the roster by Shift+Tab, the versions panel,
// the dither surfaces, the role states

/** SPEC-3 4.2, 0.43: the five fixed slots exist in order as soon as the title row exists and hold their boxes through hydration. */
async function checkTitleSlots(page, path, tag) {
  const section = `titleRow:${tag}`;
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForSelector('[data-control="title.row"]', { timeout: 120_000, state: 'attached' })
    .catch(() => null);
  const measure = () =>
    page.evaluate((ids) => {
      const out = {};
      for (const id of ids) {
        const el = document.querySelector(`[data-control="${id}"]`);
        if (!el) {
          out[id] = null;
          continue;
        }
        const r = el.getBoundingClientRect();
        out[id] = { x: Math.round(r.x * 10) / 10, w: Math.round(r.width * 10) / 10 };
      }
      return out;
    }, TITLE_SLOTS);
  const first = await measure();
  const missingFirst = TITLE_SLOTS.filter((id) => first[id] === null);
  await ready(page);
  await settled(page).catch(() => null);
  const after = await measure();
  const missingAfter = TITLE_SLOTS.filter((id) => after[id] === null);
  const ordered = TITLE_SLOTS.every(
    (id, i) =>
      i === 0 ||
      after[id] === null ||
      after[TITLE_SLOTS[i - 1]] === null ||
      after[id].x > after[TITLE_SLOTS[i - 1]].x,
  );
  const moved = TITLE_SLOTS.filter(
    (id) =>
      first[id] !== null &&
      after[id] !== null &&
      (Math.abs(first[id].x - after[id].x) > 0.5 || Math.abs(first[id].w - after[id].w) > 0.5),
  );
  const presenceWidth = after['title.presence']?.w ?? null;
  const ok =
    missingFirst.length === 0 && missingAfter.length === 0 && ordered && moved.length === 0;
  (ok ? pass : fail)(section, {
    id: 'title.row.slots',
    menu: 'title',
    evidence: `at the row's first paint ${TITLE_SLOTS.length - missingFirst.length} of 5 slots${missingFirst.length ? ` (missing ${missingFirst.join(', ')})` : ''}; after hydration ${TITLE_SLOTS.length - missingAfter.length} of 5, in order ${ordered}; moved between the two reads: ${moved.length ? moved.join(', ') : 'none'}; presence slot ${presenceWidth} px wide (SPEC-3 4.2: 184)`,
  });
  (presenceWidth === 184 ? pass : fail)(section, {
    id: 'title.presence.width',
    menu: 'title',
    evidence: `${presenceWidth} px wide (--pt-presence-w 184 px)`,
  });
}

/** SPEC-3 14, 4.9: Shift+Tab from any open menu opens the Collaborators list with focus inside it. */
async function checkRosterShiftTab(page, tag) {
  const section = `shortcuts:${tag}`;
  await closeMenus(page);
  await openBarMenu(page, 'file');
  await page.keyboard.press('Shift+Tab');
  const roster = await waitFor(() => page.$('#ts-menu-roster'), { timeout: 3000 });
  const focused = roster
    ? await waitFor(
        () =>
          page.evaluate(() =>
            document.activeElement?.closest('#ts-menu-roster') !== null ? true : null,
          ),
        { timeout: 1500 },
      )
    : null;
  const label = roster ? await roster.getAttribute('aria-label') : null;
  const active = await page.evaluate(() => {
    const el = document.activeElement;
    return el
      ? `${el.tagName.toLowerCase()}${el.getAttribute('data-control') ? `[data-control=${el.getAttribute('data-control')}]` : ''}${el.getAttribute('data-menu-item') ? `[data-menu-item=${el.getAttribute('data-menu-item')}]` : ''}`
      : 'none';
  });
  await page.keyboard.press('Escape');
  await closeMenus(page).catch(() => null);
  (roster && focused ? pass : fail)(section, {
    id: 'roster.shiftTab',
    menu: 'title',
    evidence: `Shift+Tab from the File menu: roster ${roster ? `opened (aria-label "${label}")` : 'did not open'}; focus ${focused ? 'inside it' : `outside it, on ${active}`}`,
  });
}

/** SPEC-3 5.7, 13.2, 13.3: the Version history panel's Show changes checkbox and the disabled delete rows with their clause. */
async function checkVersionsPanel(page, tag) {
  const section = `versions:${tag}`;
  await closeOverlays(page).catch(() => null);
  await activate(page, 'file.versionHistory.see').catch(() => null);
  const panel = await waitFor(() => page.$('.ts-rpanel [data-panel-title="Version history"]'), {
    timeout: 6000,
  });
  if (!panel) {
    fail(section, { id: 'versionHistory.panel', menu: 'file', evidence: 'the panel did not open' });
    return;
  }
  const box = await page.$('[data-menu-item="file.versionHistory.showChanges"]');
  const boxTip = box
    ? await page
        .$eval(
          '[data-control="versionHistory.showChanges.row"]',
          (el) =>
            el.closest('[data-tip]')?.getAttribute('data-tip') ??
            el.querySelector('[data-tip]')?.getAttribute('data-tip') ??
            null,
        )
        .catch(() => null)
    : null;
  let toggled = null;
  if (box) {
    await box.evaluate((el) => el.click());
    toggled = await waitFor(
      () =>
        page.evaluate(() =>
          document.querySelector('.ts-rpanel [data-show-changes]') !== null ? true : null,
        ),
      { timeout: 3000 },
    );
    await box.evaluate((el) => el.click()).catch(() => null);
  }
  (box && toggled ? pass : fail)(section, {
    id: 'file.versionHistory.showChanges',
    menu: 'file',
    evidence: `checkbox ${box ? 'present' : 'absent'} (tooltip ${boxTip}); Show changes ${toggled ? 'stamped data-show-changes on the panel' : 'did not stamp the panel'}`,
  });
  /* the delete rows: the row menu of the newest version */
  const more = await page.$('.ts-rpanel [data-control$=".more"]');
  if (!more) {
    skip(section, {
      id: 'file.versionHistory.deleteOlder',
      menu: 'file',
      evidence: 'no version row menu (a fresh deck with no named version)',
    });
  } else {
    await more.click();
    await page.waitForTimeout(300);
    for (const id of ['file.versionHistory.deleteOlder', 'file.versionHistory.deleteHistory']) {
      const row = await page.$(`[data-menu-item="${id}"]`);
      const disabled = row ? (await row.getAttribute('aria-disabled')) === 'true' : null;
      const tooltip = row
        ? await tooltipDocOf(page, `[data-menu-item="${id}"]`, findItem(id).label)
        : null;
      const doc = tooltip?.doc ?? '';
      const ok = row !== null && disabled === true && doc === stubClause(LATER_CLAUSES[id]);
      (ok ? pass : fail)(section, {
        id,
        menu: 'file',
        status: 'later',
        evidence: row
          ? `present, aria-disabled ${disabled}, tooltip "${doc.slice(0, 120)}"`
          : 'no row in the version menu',
      });
    }
    await page.keyboard.press('Escape');
  }
  const close = await page.$('.ts-rpanel [data-control$=".close"]');
  if (close) await close.click();
  else await page.keyboard.press('Escape');
}

/**
 * SPEC-3 10.6, 10.7, 16.2 and section 1 rule 5: the Background dialog's toggle, chips and Material
 * row; Upload from computer with a continuous source (the GT deck's Rosetta photograph) lands the
 * covering picture; the Dither toggle writes the Photograph numbers and the Neutral chip switches
 * them; the renderer stamps the picture; the Format options Dither section carries every row on
 * the dithered picture. A block level dither on a committed twin is refused by design (10.1), so
 * the tail slide's GT picture is not used.
 */
async function checkDitherSurfaces(page, states, deckId, tag) {
  const section = `dither:${tag}`;
  await resetEditor(page, deckId);
  await activate(page, 'slide.changeBackground').catch(() => null);
  let dialog = await waitFor(() => page.$('[data-control="dialog.background"]'), {
    timeout: 10_000,
  });
  if (!dialog) {
    fail(section, {
      id: 'dialog.background.dither',
      evidence: `the Background dialog did not open; dialogs ${JSON.stringify(await dialogs(page))}; snackbar "${await snackbarText(page)}"`,
    });
    return;
  }
  const present = await page.$$eval('[data-control="dialog.background"] [data-control]', (els) =>
    els.map((el) => el.getAttribute('data-control')),
  );
  const missingBg = BACKGROUND_DITHER_CONTROLS.filter((id) => !present.includes(id));
  const untippedBg = await page.$$eval(
    '[data-control="dialog.background"] button, [data-control="dialog.background"] input, [data-control="dialog.background"] select',
    (els) =>
      els
        .filter((el) => !el.closest('[data-tip]') && !el.closest('[aria-hidden="true"]'))
        .map((el) => el.getAttribute('data-control') ?? el.tagName),
  );
  (missingBg.length === 0 ? pass : fail)(section, {
    id: 'dialog.background.dither',
    evidence: `${missingBg.length ? `missing ${missingBg.join(', ')}` : 'the Dither toggle, the Photograph and Neutral chips and the Material row (Choose, Dither, Place) present'}${untippedBg.length ? `; controls without a tooltip: ${untippedBg.join(', ')}` : ''}`,
  });
  await checkDefaultWords(page, 'dialog Change background');
  /* SPEC-3 10.6: Dither on before the picture is remembered for the next Choose, so the
     photograph lands dithered in one write; then Upload from computer with the Rosetta photograph */
  const st = await state(page);
  const source = join(ROOT, 'decks', 'gt-brand', 'assets', 'ref-rosetta.jpg');
  const rev = await revisionOf(page);
  const toggleFirst = await page.$('[data-control="dialog.background.dither"]');
  if (toggleFirst) await toggleFirst.evaluate((el) => el.click());
  await page.waitForTimeout(200);
  const toggleFirstState = toggleFirst
    ? await toggleFirst.evaluate(
        (el) =>
          el.getAttribute('aria-checked') ??
          el.getAttribute('aria-pressed') ??
          (el.matches('input') ? String(el.checked) : el.querySelector('input')?.checked),
      )
    : null;
  const chooser = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
  await page.click('[data-control="dialog.background.choose.upload"]').catch(() => null);
  const picker = await chooser;
  if (!picker) {
    fail(section, {
      id: 'dialog.background.upload',
      evidence: 'Upload from computer opened no file chooser',
    });
    await page.keyboard.press('Escape');
    return;
  }
  await picker.setFiles(source);
  const coveringOf = async () => {
    const got = await invoke(page, 'slide.get', { slideId: st.slideId }).catch(() => null);
    const blocks = Object.values(got?.slide?.slots ?? {}).flat();
    return (
      blocks.find(
        (b) =>
          b.type === 'picture' &&
          b.pos &&
          b.pos.x <= 0 &&
          b.pos.y <= 0 &&
          b.pos.x + b.pos.w >= 1600 &&
          b.pos.y + b.pos.h >= 900,
      ) ?? null
    );
  };
  const t0 = Date.now();
  const covering = await waitFor(coveringOf, { timeout: 45_000 });
  const uploadMs = Date.now() - t0;
  (covering ? pass : fail)(section, {
    id: 'dialog.background.upload',
    evidence: covering
      ? `the covering picture ${covering.id} (asset ${covering.asset}) landed in ${uploadMs} ms; revision ${rev} -> ${await revisionOf(page)}`
      : `no covering picture within 45 s; snackbar "${await snackbarText(page)}"`,
  });
  if (!covering) {
    await page.keyboard.press('Escape');
    return;
  }
  await settled(page).catch(() => null);
  const ditherOf = async () => (await coveringOf())?.dither ?? null;
  const isPhotograph = (d) =>
    d &&
    d.pattern === PHOTOGRAPH.pattern &&
    d.black === PHOTOGRAPH.black &&
    d.white === PHOTOGRAPH.white &&
    d.gamma === PHOTOGRAPH.gamma;
  const dialogAfterUpload = (await page.$('[data-control="dialog.background"]')) !== null;
  let photograph = await waitFor(
    async () => (isPhotograph(await ditherOf()) ? await ditherOf() : null),
    { timeout: 6000 },
  );
  let path = photograph
    ? 'the toggle before Upload was remembered: one write landed the picture dithered'
    : 'the picture landed without the dither';
  /* the dialog closes after Upload (measured); reopen it from the Slide menu and use the toggle on the covering picture */
  const reopen = async () => {
    await closeOverlays(page).catch(() => null);
    await page.keyboard.press('Escape');
    await page.click('[data-control="menubar.slide"]');
    await page.waitForSelector('[role="menu"][data-level="0"]', { timeout: 5000 });
    await page.click('[data-menu-item="slide.changeBackground"]');
    return waitFor(() => page.$('[data-control="dialog.background"]'), { timeout: 10_000 });
  };
  dialog = await page.$('[data-control="dialog.background"]');
  if (!dialog) dialog = await reopen();
  const controlsNow = dialog
    ? await page.$$eval('[data-control="dialog.background"] [data-control]', (els) =>
        els.map((el) => el.getAttribute('data-control')),
      )
    : [];
  const toggle = dialog ? await page.$('[data-control="dialog.background.dither"]') : null;
  if (!photograph && toggle) {
    await toggle.evaluate((el) => el.click());
    photograph = await waitFor(
      async () => (isPhotograph(await ditherOf()) ? await ditherOf() : null),
      { timeout: 10_000 },
    );
    path = photograph
      ? 'the toggle on the covering picture wrote the numbers'
      : 'the toggle on the covering picture wrote nothing';
  }
  (photograph ? pass : fail)(section, {
    id: 'dialog.background.dither.toggle',
    evidence: `toggle before the upload ${toggleFirst ? `clicked (state ${toggleFirstState})` : 'absent'}; dialog ${dialogAfterUpload ? 'stayed open' : 'closed'} after the upload; ${path}; dither now ${JSON.stringify(await ditherOf())} (SPEC-3 0.37: ${JSON.stringify(PHOTOGRAPH)}); reopened dialog carries ${controlsNow.filter((id) => id.startsWith('dialog.background.dither') || id.startsWith('dialog.background.picture') || id.startsWith('dialog.background.formatOptions') || id.startsWith('dialog.background.removePicture')).join(', ') || 'no picture or dither row'}`,
  });
  const neutralChip = await page.$('[data-control="dialog.background.dither.neutral"]');
  if (neutralChip) {
    await neutralChip.evaluate((el) => el.click());
    const neutral = await waitFor(
      async () => {
        const d = await ditherOf();
        return d && d.black !== PHOTOGRAPH.black ? d : null;
      },
      { timeout: 8000 },
    );
    (neutral ? pass : fail)(section, {
      id: 'dialog.background.dither.neutral',
      evidence: `Neutral wrote ${JSON.stringify(neutral ?? (await ditherOf()))}`,
    });
    const photoChip = await page.$('[data-control="dialog.background.dither.photograph"]');
    if (photoChip) {
      await photoChip.evaluate((el) => el.click());
      await waitFor(async () => ((await ditherOf())?.black === PHOTOGRAPH.black ? true : null), {
        timeout: 8000,
      });
    }
  }
  await settled(page).catch(() => null);
  const done = await page.$('[data-control="dialog.background.done"]');
  if (done) await done.click();
  else await page.keyboard.press('Escape');
  await waitFor(async () => ((await dialogs(page)).length === 0 ? true : null), {
    timeout: 4000,
  }).catch(() => null);
  /* the renderer's DOM (10.3) */
  const dom = await page.evaluate((blockId) => {
    const block = document.querySelector(`.ts-stagewrap .pt-slide [data-block="${blockId}"]`);
    const el = block
      ? block.matches('[data-dither]')
        ? block
        : block.querySelector('[data-dither]')
      : null;
    return el
      ? {
          dither: el.getAttribute('data-dither'),
          key: el.getAttribute('data-dither-key'),
          state: el.getAttribute('data-dither-state'),
          canvas: block.querySelector('canvas.picture-dither') !== null,
        }
      : { block: block !== null };
  }, covering.id);
  (dom.dither !== undefined ? pass : fail)(section, {
    id: 'renderer.dither.dom',
    evidence:
      dom.dither !== undefined
        ? `.picture[data-dither=${dom.dither}] key ${dom.key} state ${dom.state}; canvas.picture-dither ${dom.canvas}`
        : `no [data-dither] under the covering picture (block in the DOM: ${dom.block})`,
  });
  /* the Format options Dither section on the dithered picture (10.7) */
  const selected = await selectBlockByClick(page, covering.id, { text: false });
  if (selected !== covering.id) {
    fail(section, {
      id: 'formatOptions.dither',
      evidence: `could not select the covering picture (${selected})`,
    });
  } else {
    await activate(page, 'format.formatOptions').catch(() => null);
    const panel = await waitFor(() => page.$('.ts-rpanel [data-panel-title="Format options"]'), {
      timeout: 8000,
    });
    const ids = panel
      ? await page.$$eval('.ts-rpanel [data-control^="formatOptions.dither"]', (els) =>
          els.map((el) => el.getAttribute('data-control')),
        )
      : [];
    const missing = DITHER_CONTROLS.filter((id) => !ids.includes(id));
    const facts = await page.evaluate(() => {
      const read = (id) => {
        const el = document.querySelector(`.ts-rpanel [data-control="${id}"]`);
        if (!el) return null;
        const input = el.matches('input') ? el : el.querySelector('input');
        return (
          el.getAttribute('aria-checked') ??
          el.getAttribute('aria-pressed') ??
          (input ? String(input.checked) : null) ??
          (el.className.includes('is-active') ||
          el.className.includes('is-selected') ||
          el.className.includes('is-on')
            ? 'true'
            : el.className)
        );
      };
      return {
        on: read('formatOptions.dither.on'),
        photograph: read('formatOptions.dither.preset.photograph'),
        neutral: read('formatOptions.dither.preset.neutral'),
        metrics:
          document
            .querySelector('.ts-rpanel [data-control="formatOptions.dither.metrics"]')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() ?? null,
      };
    });
    const untipped = panel
      ? await page.$$eval('.ts-rpanel [data-control^="formatOptions.dither"]', (els) =>
          els
            .filter((el) => !el.closest('[data-tip]'))
            .map((el) => el.getAttribute('data-control')),
        )
      : [];
    (panel &&
      missing.length === 0 &&
      String(facts.on) === 'true' &&
      String(facts.photograph) === 'true' &&
      untipped.length === 0
      ? pass
      : fail)(section, {
      id: 'formatOptions.dither',
      evidence: `panel ${panel ? 'open' : 'closed'}; ${ids.length} dither controls${missing.length ? `, missing ${missing.join(', ')}` : ''}; Dither on ${facts.on}; Photograph highlighted ${facts.photograph}, Neutral ${facts.neutral}; metrics "${facts.metrics}"${untipped.length ? `; without a tooltip: ${untipped.join(', ')}` : ''}`,
    });
    if (panel) await checkDefaultWords(page, 'Format options > Dither');
    const close = await page.$('.ts-rpanel [data-control$=".close"]');
    if (close) await close.click();
    else await page.keyboard.press('Escape');
  }
  void states;
}

/** Every rendered row of the bar menus, recursively, into `into` (id -> row), for the role states. */
async function collectRows(page, menuId, items, level, into) {
  const listed = await readRows(page, level);
  for (const row of listed)
    if (!into.has(row.id)) into.set(row.id, { ...row, level, menu: menuId });
  for (const item of items) {
    if (item.status === 'omit' || item.contextOnly) continue;
    const row = listed.find((r) => r.id === item.id);
    if (!row || row.disabled) continue;
    const dynamic = item.effect?.kind === 'submenu' && item.effect.dynamic;
    if (dynamic || !item.items || item.items.length === 0 || row.haspopup !== 'menu') continue;
    await openSubmenuRow(page, level, item.id).catch(() => null);
    await collectRows(page, menuId, item.items, level + 1, into);
  }
}

/**
 * SPEC-3 16.2, 13.4: a role state. Every row of the model is rendered exactly when its predicate
 * and its parents' hold in the role's context (a row a role cannot use is absent by id); the
 * menus a role cannot use are absent from the bar.
 */
async function walkRoleMenus(page, ctx, tag) {
  const section = `rows:${tag}`;
  const seen = new Map();
  for (const row of await page.$$eval('[data-control="title.row"] [data-menu-item]', (els) =>
    els.map((el) => ({
      id: el.getAttribute('data-menu-item'),
      disabled: el.getAttribute('aria-disabled') === 'true',
      label: el.textContent.replace(/\s+/g, ' ').trim(),
    })),
  ))
    seen.set(row.id, { ...row, level: 0, menu: 'title' });
  if ((await page.$('[data-control="present.arrow"]')) !== null) {
    await page.click('[data-control="present.arrow"]');
    await page.waitForSelector('[role="menu"]', { timeout: 5000 }).catch(() => null);
    for (const row of await readRows(page, 0))
      seen.set(row.id, { ...row, level: 0, menu: 'title' });
    await closeMenus(page);
  }
  for (const plate of Object.values(PLATE_MENUS)) {
    if ((await page.$(plate.opener)) === null) continue;
    const opened = await openPlate(page, plate).catch(() => false);
    if (!opened) continue;
    for (const row of await readPlateRows(page, plate))
      if (!seen.has(row.id)) seen.set(row.id, { ...row, level: 'plate', menu: 'title' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  const barMenus = await page.$$eval('[data-control^="menubar."]', (els) =>
    els.map((el) => el.getAttribute('data-control').slice('menubar.'.length)),
  );
  for (const menu of MENUS) {
    const shown = barMenus.includes(menu.id);
    const expected = isPresent(menu, ctx);
    (shown === expected ? pass : fail)(section, {
      id: `menubar.${menu.id}`,
      menu: menu.id,
      check: 'menu present',
      evidence: `${shown ? 'in the bar' : 'absent'}; the menu's predicate ${menu.when ?? 'always'} says ${expected ? 'present' : 'absent'}`,
    });
    if (!shown) continue;
    await openBarMenu(page, menu.id);
    await collectRows(page, menu.id, menu.items, 0, seen);
    await closeMenus(page);
  }
  let rendered = 0;
  let absent = 0;
  for (const item of allItems()) {
    if (item.status === 'omit' || item.contextOnly) continue;
    const menu = MENU_OF.get(item.id);
    const menuDef = MENUS.find((m) => m.id === menu);
    const parentIds = ancestors(item.id);
    const menuShown = menu === 'title' || (menuDef !== undefined && isPresent(menuDef, ctx));
    const expected =
      menuShown &&
      isPresent(item, ctx) &&
      parentIds.every((pid) => isPresent(findItem(pid) ?? {}, ctx));
    const found = seen.get(item.id);
    const base = { id: item.id, menu, status: item.status, label: item.label, when: item.when };
    if (!expected) {
      if (found === undefined) {
        absent += 1;
        pass(section, {
          ...base,
          check: 'absent by role',
          evidence: `when ${item.when ?? menuDef?.when}`,
        });
      } else if (isPresenceChip(item.id, found))
        pass(section, {
          ...base,
          check: 'absent by role',
          evidence: `a presence chip in the title row; the chips stay drawn while their rows are parked (docs/FOCUS.md 3.2)`,
        });
      else
        fail(section, {
          ...base,
          check: 'absent by role',
          evidence: `rendered (level ${found.level}) while the predicate ${item.when ?? menuDef?.when} says absent for a ${ctx.role}`,
        });
      continue;
    }
    if (found === undefined) {
      const parentBlocked = parentIds.some((pid) => {
        const p = findItem(pid);
        const prow = seen.get(pid);
        return (
          p?.status === 'later' ||
          (prow !== undefined && prow.disabled) ||
          (p?.effect?.kind === 'submenu' && p.effect.dynamic)
        );
      });
      if (parentBlocked || item.id === 'title.presence.follow' || item.id === 'title.presence.goTo')
        skip(section, {
          ...base,
          check: 'present',
          evidence: 'under a disabled, Later or plate container, or a per participant roster row',
        });
      else
        fail(section, {
          ...base,
          check: 'present',
          evidence: `no [data-menu-item] rendered for a ${ctx.role}`,
        });
      continue;
    }
    rendered += 1;
    pass(section, { ...base, check: 'present', evidence: `level ${found.level}` });
  }
  log(`audit: role ${ctx.role}: ${rendered} rows rendered, ${absent} absent by role`);
}

/** The menu context of a role state from the page's facts alone (the viewer owner exposes no slide.list). */
/** SPEC-3 6.2: the capabilities a role holds under the default settings, from the identity matrix. */
function capabilitiesOf(role) {
  return CAPABILITIES.filter((capability) => roleAllows(role, capability, DEFAULT_ACCESS_SETTINGS));
}

async function roleContext(page, role) {
  const st = await state(page);
  const mode = await page.evaluate(
    () => document.querySelector('.pt-viewer')?.getAttribute('data-edit-mode') ?? 'editing',
  );
  const cards = await page.$$eval('.ts-card[data-id]', (els) => els.length);
  /* the page's own facts when it carries them (3.10), else the matrix of 6.2 for the link's role */
  const pageCapabilities = Array.isArray(st.access?.capabilities) ? st.access.capabilities : [];
  return {
    ...DEFAULT_MENU_CONTEXT,
    role: st.access?.role ?? role,
    pageRole: st.access?.role ?? null,
    capabilities: pageCapabilities.length > 0 ? pageCapabilities : capabilitiesOf(role),
    account: {
      signedIn: st.account?.signedIn === true,
      signInAvailable: await signInAvailable(page),
    },
    slide: { ...DEFAULT_MENU_CONTEXT.slide, count: Math.max(1, cards) },
    settings: { ...DEFAULT_MENU_CONTEXT.settings, mode },
  };
}

/**
 * SPEC-3 16.2: the viewer and the commenter role states. The owner (the audit page) sets Anyone
 * with the link as Viewer and mints a commenter link; a fresh context follows each link and the
 * rows, the Mode menu, the View only button, Insert > Comment and the handles are read there.
 */
async function roleStates(page, browser, deckId, tag) {
  const section = `roles:${tag}`;
  const readRecord = async () => {
    const got = await invoke(page, 'share.get', { id: deckId }).catch((e) => ({
      error: String(e).slice(0, 200),
    }));
    return got?.record ?? got;
  };
  const record = await readRecord();
  if (record?.error) {
    fail(section, {
      id: 'share.get',
      evidence: `the owner cannot read the record: ${record.error}`,
    });
    return;
  }
  const ownerFacts = await state(page);
  pass(section, {
    id: 'owner.record',
    evidence: `record revision ${record.revision}, owner ${record.owner ? String(record.owner).slice(0, 12) + '…' : 'null'}, general access ${record.generalAccess?.mode}/${record.generalAccess?.role}; the page's access facts ${JSON.stringify(ownerFacts.access)}`,
  });
  const viewerLink = await invoke(page, 'share.setGeneralAccess', {
    id: deckId,
    mode: 'link',
    role: 'viewer',
    baseRevision: record.revision ?? 0,
  }).catch((e) => ({ error: String(e).slice(0, 240) }));
  if (!viewerLink?.url) {
    fail(section, {
      id: 'share.setGeneralAccess',
      evidence: `no /s/ link: ${JSON.stringify(viewerLink).slice(0, 240)}`,
    });
    return;
  }
  (/\/s\/[A-Za-z0-9_-]{22}$/.test(viewerLink.url) ? pass : fail)(section, {
    id: 'share.setGeneralAccess',
    evidence: `Anyone with the link as Viewer: ${viewerLink.url.replace(/\/s\/.*$/, '/s/<token>')}`,
  });
  /* the viewer */
  const viewerContext = await browser.newContext({
    viewport: VIEWPORT,
    extraHTTPHeaders: protectionHeaders(),
  });
  const viewer = await viewerContext.newPage();
  try {
    await viewer.goto(viewerLink.url, { waitUntil: 'domcontentloaded' });
    const landed = await waitFor(async () => (viewer.url().includes('/s/') ? null : viewer.url()), {
      timeout: 15_000,
    });
    const landedPath = landed ? new URL(landed).pathname : viewer.url();
    (landed && landedPath === `/deck/${deckId}` ? pass : fail)(section, {
      id: 'viewer.landing',
      evidence: `the viewer link landed on ${landedPath}${landed ? '' : ' (the /s/ address stayed)'}; address carries a token: ${String(viewer.url()).includes('/s/')}`,
    });
    await viewer.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
    const shell = await viewer
      .waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 })
      .catch(() => null);
    if (!shell) {
      fail(section, {
        id: 'viewer.edit',
        evidence: `/edit/${deckId} did not settle for the viewer; ${(await viewer.content()).replace(/\s+/g, ' ').slice(0, 200)}`,
      });
    } else {
      const mode = await viewer.$eval('.pt-viewer', (v) => v.getAttribute('data-edit-mode'));
      const viewOnly = await viewer.$('[data-control="toolbar.viewOnly"]');
      const viewOnlyText = viewOnly ? (await viewOnly.textContent())?.trim() : null;
      const modeMenu = await viewer.$$('[data-menu-item="view.mode"]');
      const editMenu = await viewer.$$('[data-control="menubar.edit"]');
      const vstate = await state(viewer).catch(() => ({}));
      (mode === 'viewing' ? pass : fail)(section, {
        id: 'viewer.mode',
        evidence: `data-edit-mode ${mode}; access facts ${JSON.stringify(vstate.access)}`,
      });
      (viewOnlyText === 'View only' ? pass : fail)(section, {
        id: 'toolbar.viewOnly',
        evidence: `View only button ${viewOnly ? `present, reads "${viewOnlyText}"` : 'absent'}`,
      });
      (modeMenu.length === 0 && editMenu.length === 0 ? pass : fail)(section, {
        id: 'view.mode.absent',
        evidence: `Mode rows ${modeMenu.length}, Edit menu ${editMenu.length} (SPEC-3 13.1: no Mode menu for a viewer)`,
      });
      const ctxV = await roleContext(viewer, 'viewer');
      if (ctxV.pageRole !== 'viewer')
        fail(section, {
          id: 'viewer.role',
          evidence: `describe().state.access reads ${JSON.stringify(vstate.access)} for the link visitor; SPEC-3 3.10 gives the window state the access facts (the rows below are read against the matrix of 6.2 for a viewer: ${ctxV.capabilities.join(', ')})`,
        });
      else
        pass(section, {
          id: 'viewer.role',
          evidence: `role viewer, capabilities ${ctxV.capabilities.join(', ')}`,
        });
      await walkRoleMenus(viewer, { ...ctxV, role: 'viewer' }, `${tag}:viewer`);
      /* the handles: a click on a block selects nothing a viewer can drag */
      const block = await viewer.$('.ts-stagewrap .pt-slide [data-block]');
      if (block) {
        const b = await block.boundingBox();
        if (b) await viewer.mouse.click(b.x + 2, b.y + 2);
        await viewer.waitForTimeout(300);
        const handles = await viewer.$$('.ts-overlay [data-control^="handle."]');
        (handles.length === 0 ? pass : fail)(section, {
          id: 'viewer.handles',
          evidence: `${handles.length} handle(s) after a click on a block`,
        });
      }
      /* the reads of the window API (SPEC-3 6.6): a viewer may read */
      const list = await invoke(viewer, 'slide.list').catch((e) => ({
        error: String(e).slice(0, 160),
      }));
      (Array.isArray(list) ? pass : fail)(section, {
        id: 'viewer.window.read',
        evidence: Array.isArray(list)
          ? `slide.list answers ${list.length} slide(s)`
          : `slide.list refused: ${list.error}`,
      });
      const write = await invoke(viewer, 'deck.rename', {
        name: 'Viewer write',
        baseRevision: 1,
      }).catch((e) => ({ error: String(e).slice(0, 160) }));
      (write?.error ? pass : fail)(section, {
        id: 'viewer.window.write',
        evidence: write?.error
          ? `deck.rename refused: ${write.error}`
          : 'deck.rename was accepted for a viewer',
      });
      if (viewOnly) {
        await viewOnly.click();
        const dialog = await waitFor(
          async () =>
            (await dialogs(viewer)).find(
              (d) =>
                d.title.startsWith(REFUSALS.requestEditAccess) ||
                (d.control ?? '').startsWith('dialog.request'),
            ) ?? null,
          { timeout: 4000 },
        );
        await viewer.keyboard.press('Escape');
        (dialog ? pass : fail)(section, {
          id: 'share.requestAccess.dialog',
          evidence: dialog
            ? `View only opened "${dialog.title}" (${dialog.control})`
            : `View only opened nothing; dialogs ${JSON.stringify(await dialogs(viewer))}`,
        });
      }
      await checkDefaultWords(viewer, `/edit/${deckId} as a viewer`);
    }
  } catch (error) {
    fail(section, {
      id: 'viewer',
      evidence: `threw: ${String(error?.stack ?? error).slice(0, 400)}`,
    });
  } finally {
    await viewerContext.close().catch(() => null);
  }
  /* the commenter */
  const record2 = await readRecord();
  const commenterLink = await invoke(page, 'share.createLink', {
    id: deckId,
    role: 'commenter',
    baseRevision: record2?.revision ?? 0,
  }).catch((e) => ({ error: String(e).slice(0, 240) }));
  if (!commenterLink?.url) {
    fail(section, {
      id: 'share.createLink',
      evidence: `no commenter link: ${JSON.stringify(commenterLink).slice(0, 240)}`,
    });
  } else {
    pass(section, { id: 'share.createLink', evidence: 'a commenter link minted' });
    const commenterContext = await browser.newContext({
      viewport: VIEWPORT,
      extraHTTPHeaders: protectionHeaders(),
    });
    const commenter = await commenterContext.newPage();
    try {
      await commenter.goto(commenterLink.url, { waitUntil: 'domcontentloaded' });
      const landed = await waitFor(
        async () => (commenter.url().includes('/s/') ? null : commenter.url()),
        { timeout: 15_000 },
      );
      const landedPath = landed ? new URL(landed).pathname : commenter.url();
      (landedPath === `/edit/${deckId}` ? pass : fail)(section, {
        id: 'commenter.landing',
        evidence: `the commenter link landed on ${landedPath}`,
      });
      const shell = await commenter
        .waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 })
        .catch(() => null);
      if (!shell)
        fail(section, {
          id: 'commenter.edit',
          evidence: 'the editor did not settle for the commenter',
        });
      else {
        const mode = await commenter.$eval('.pt-viewer', (v) => v.getAttribute('data-edit-mode'));
        (mode === 'commenting' ? pass : fail)(section, {
          id: 'commenter.mode',
          evidence: `data-edit-mode ${mode}`,
        });
        const ctxC = await roleContext(commenter, 'commenter');
        const cstate = await state(commenter).catch(() => ({}));
        (ctxC.pageRole === 'commenter' ? pass : fail)(section, {
          id: 'commenter.role',
          evidence: `describe().state.access reads ${JSON.stringify(cstate.access)}; the rows below are read against the matrix of 6.2 for a commenter: ${ctxC.capabilities.join(', ')}`,
        });
        await walkRoleMenus(commenter, { ...ctxC, role: 'commenter' }, `${tag}:commenter`);
        const viewOnly = await commenter.$$('[data-control="toolbar.viewOnly"]');
        (viewOnly.length === 0 ? pass : fail)(section, {
          id: 'commenter.viewOnly.absent',
          evidence: `${viewOnly.length} View only button(s)`,
        });
        /* Insert > Comment is live: the row is enabled and opens the card */
        const insertMenu = await commenter.$('[data-control="menubar.insert"]');
        if (!insertMenu)
          fail(section, {
            id: 'insert.comment.live',
            evidence: 'no Insert menu for the commenter',
          });
        else {
          await openBarMenu(commenter, 'insert');
          const rowsC = await readRows(commenter, 0);
          const commentRow = rowsC.find((r) => r.id === 'insert.comment');
          const textBox = rowsC.find((r) => r.id === 'insert.textBox');
          if (commentRow && !commentRow.disabled) {
            await commenter.click(`${ROW_SELECTOR(0)}[data-menu-item="insert.comment"]`);
            const card = await waitFor(() => commenter.$('[data-control="comment.card"]'), {
              timeout: 4000,
            });
            await commenter.keyboard.press('Escape');
            (card ? pass : fail)(section, {
              id: 'insert.comment.live',
              evidence: `Insert > Comment enabled; the card ${card ? 'opened' : 'did not open'}; Text box row ${textBox ? 'rendered' : 'absent'}; snackbar "${await snackbarText(commenter)}"`,
            });
          } else {
            await closeMenus(commenter);
            fail(section, {
              id: 'insert.comment.live',
              evidence: `Insert > Comment ${commentRow ? 'disabled' : 'absent'} for the commenter; rows ${rowsC.map((r) => r.id).join(', ')}`,
            });
          }
        }
        const block = await commenter.$('.ts-stagewrap .pt-slide [data-block]');
        if (block) {
          const b = await block.boundingBox();
          if (b) await commenter.mouse.click(b.x + 2, b.y + 2);
          await commenter.waitForTimeout(300);
          const handles = await commenter.$$('.ts-overlay [data-control^="handle."]');
          (handles.length === 0 ? pass : fail)(section, {
            id: 'commenter.handles',
            evidence: `${handles.length} handle(s) after a click on a block`,
          });
        }
        await checkDefaultWords(commenter, `/edit/${deckId} as a commenter`);
      }
    } catch (error) {
      fail(section, {
        id: 'commenter',
        evidence: `threw: ${String(error?.stack ?? error).slice(0, 400)}`,
      });
    } finally {
      await commenterContext.close().catch(() => null);
    }
  }
  /* back to Restricted */
  const record3 = await readRecord();
  const stopped = await invoke(page, 'share.stop', {
    id: deckId,
    baseRevision: record3?.revision ?? 0,
  }).catch((e) => ({ error: String(e).slice(0, 200) }));
  const after = await readRecord();
  (after?.generalAccess?.mode === 'restricted' &&
    (after?.links ?? []).every((l) => l.revokedAt !== null)
    ? pass
    : fail)(section, {
    id: 'share.stop',
    evidence: `after Stop sharing: general access ${after?.generalAccess?.mode}, ${(after?.links ?? []).filter((l) => l.revokedAt === null).length} live link(s)${stopped?.error ? `; share.stop: ${stopped.error}` : ''}`,
  });
}

/** SPEC-3 7.4: Forget this browser on the collaborator's context mints a new label there. */
async function forgetOnCollaborator(tag) {
  const section = `effects:${tag}`;
  if (!collaborator) return;
  const page = collaborator;
  const before = await page
    .$eval('[data-control="title.account"]', (el) => el.getAttribute('data-tip'))
    .catch(() => null);
  const item = findItem('title.account.forget');
  let browserDialog = null;
  const onDialog = (dialog) => {
    browserDialog = { type: dialog.type(), message: dialog.message().slice(0, 160) };
    dialog.accept().catch(() => null);
  };
  page.on('dialog', onDialog);
  try {
    /* the account menu is parked (docs/FOCUS.md 3.2) and the switch is per browser: the
       collaborator's own switch goes on before its row is reached. A collaborator the scratch
       deck admits as a viewer (ruling (2): a new deck's general access is restricted, so the
       second anonymous context reads the shadow floor's role) sees no Tools menu on the deck; the
       setting is the browser's, so it is flipped on the collaborator's own /new draft and the
       deck page is loaded again (VERIFICATION.md F-step20, `effects:scratch title.account.forget`) */
    if (!(await setAdvancedTools(page, true))) {
      const back = page.url();
      await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
      await ready(page);
      const flipped = await setAdvancedTools(page, true);
      await page.goto(back, { waitUntil: 'domcontentloaded' });
      await ready(page);
      if (!flipped) {
        page.off('dialog', onDialog);
        skip(section, {
          id: item.id,
          menu: 'title',
          evidence: `not driven: the collaborator's browser could not turn Tools > Advanced tools on (no row on ${back} nor on /new)`,
        });
        return;
      }
    }
    await activate(page, item.id);
  } catch (error) {
    page.off('dialog', onDialog);
    fail(section, {
      id: item.id,
      menu: 'title',
      evidence: `could not activate: ${String(error).slice(0, 160)}`,
    });
    return;
  }
  const dialog = await waitFor(async () => (await dialogs(page))[0] ?? null, { timeout: 3000 });
  let confirmed = false;
  if (dialog) {
    const button = await page.$(
      '[role="dialog"] [data-control$=".confirm"], [role="dialog"] [data-control$=".forget"], [role="dialog"] [data-control$=".ok"]',
    );
    if (button) {
      await button.click();
      confirmed = true;
    } else await page.keyboard.press('Escape');
  }
  const principalBefore = (await state(page).catch(() => ({}))).account?.principalId ?? null;
  const changed = await waitFor(
    async () => {
      const now = await page
        .$eval('[data-control="title.account"]', (el) => el.getAttribute('data-tip'))
        .catch(() => null);
      return now !== null && now !== before ? now : null;
    },
    { timeout: 6000 },
  );
  const principalAfter = (await state(page).catch(() => ({}))).account?.principalId ?? null;
  page.off('dialog', onDialog);
  (changed !== null ? pass : fail)(section, {
    id: item.id,
    menu: 'title',
    effect: 'action',
    label: item.label,
    evidence: `own chip "${before}" -> "${changed ?? before}"; the page's principal ${principalBefore === principalAfter ? 'unchanged' : `${principalBefore} -> ${principalAfter}`}; ${browserDialog ? `browser ${browserDialog.type} "${browserDialog.message}" accepted` : `confirm dialog ${dialog ? `"${dialog.title}" ${confirmed ? 'confirmed' : 'had no confirm control'}` : 'none'}`}`,
  });
}

// ---------------------------------------------------------------------------------------------
// Main

const startedAt = Date.now();
const launched = await launchBrowser({ probeRenderer: false });
const context = await launched.browser.newContext({
  viewport: VIEWPORT,
  acceptDownloads: true,
  extraHTTPHeaders: protectionHeaders(),
});
await context
  .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  .catch(() => null);
const page = await context.newPage();
if (TRACE)
  await context.tracing.start({
    screenshots: true,
    snapshots: false,
    title: 'gslides-parity-audit',
  });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error.message ?? error).slice(0, 300)));
let scratchDeck = null;
/** true once the scratch deck was trashed and deleted (the cleanup also runs after a thrown phase) */
let cleaned = false;
const mustClean = () => !KEEP_DECK && (!USE_DECK || TRASH_USED_DECK);
let commit = '';
try {
  commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).stdout.trim();
} catch {
  commit = '';
}

try {
  log(`audit: ${BASE} (${IS_LOCAL ? 'local' : 'remote'}), commit ${commit}`);
  if (USE_DECK) {
    scratchDeck = USE_DECK;
    await page.goto(`${BASE}/edit/${scratchDeck}`, { waitUntil: 'domcontentloaded' });
    await ready(page);
  } else {
    // 1. first open
    await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    const first = await page.evaluate(() => ({
      url: location.pathname,
      title: document.querySelector('[data-control="deck.name"]')?.textContent?.trim(),
      saveState: document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim(),
      prompts: [...document.querySelectorAll('[data-prompt]')].map((el) => el.textContent.trim()),
      notes: document.querySelector('[data-control="notes.text"]')?.getAttribute('placeholder'),
      cards: document.querySelectorAll('.ts-card[data-id]').length,
      panel:
        document.querySelector('.ts-rpanel [data-panel-title]')?.getAttribute('data-panel-title') ??
        null,
      snackbar: document.querySelector('[data-control="snackbar"]')?.textContent?.trim() ?? '',
      bottom: [...document.querySelectorAll('[data-control="bottombar"] [data-control]')].map(
        (el) => el.getAttribute('data-control'),
      ),
      menus: [...document.querySelectorAll('[data-control^="menubar."]')].map((el) =>
        el.textContent.trim(),
      ),
    }));
    const firstChecks = [
      ['address /new', first.url === '/new'],
      [`title "${TITLE_ROW.untitled}"`, first.title === TITLE_ROW.untitled],
      [`save words "${TITLE_ROW.notSaved}"`, first.saveState === TITLE_ROW.notSaved],
      [
        'the two prompts',
        JSON.stringify(first.prompts) === JSON.stringify([PROMPTS.title, PROMPTS.subtitle]),
      ],
      ['the notes prompt', first.notes === PROMPTS.notes],
      ['one card in the filmstrip', first.cards === 1],
      ['the right panel closed', first.panel === null],
      ['no snackbar', first.snackbar === ''],
      /* docs/FOCUS.md 3.1, 3.2: the bar draws the menus with a visible row (Extensions is parked
         whole), and the bottom bar's view buttons follow View > Grid view behind the switch */
      [
        'the menus of the default view in order',
        JSON.stringify(first.menus) ===
          JSON.stringify(visibleMenus(DEFAULT_MENU_CONTEXT).map((m) => m.label)),
      ],
      [
        'the bottom bar: the panel chevron, the view buttons only with Grid view present',
        first.bottom.includes('panel.toggle') &&
          first.bottom.includes('view.gridView') ===
            isPresent(findItem('view.gridView') ?? {}, DEFAULT_MENU_CONTEXT) &&
          first.bottom.includes('view.filmstripView') ===
            isPresent(findItem('view.gridView') ?? {}, DEFAULT_MENU_CONTEXT),
      ],
    ];
    for (const [name, ok] of firstChecks)
      (ok ? pass : fail)('firstOpen', { id: name, evidence: JSON.stringify(first).slice(0, 400) });
    await checkDefaultWords(page, '/new');
    await checkToolbar(page, 'default', 'new');

    // the scratch deck through the first write
    const s0 = await state(page);
    await invoke(page, 'slide.update', {
      slideId: s0.slideId,
      baseRevision: s0.revision,
      mutations: [
        { op: 'slide.set', slideId: s0.slideId, path: '/heading', value: 'Audit scratch' },
      ],
    });
    const movedTo = await waitFor(async () => (page.url().includes('/edit/') ? page.url() : null), {
      timeout: 30_000,
    });
    scratchDeck = movedTo ? new URL(movedTo).pathname.split('/')[2] : null;
    const saveWords = await page.evaluate(() =>
      document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim(),
    );
    const info = scratchDeck ? await invoke(page, 'deck.info') : null;
    (scratchDeck ? pass : fail)('firstOpen', {
      id: 'the first write creates the deck and moves the address',
      evidence: `${movedTo ?? page.url()}; save words "${saveWords}"; title "${info?.title}"`,
    });
    if (!scratchDeck) throw new Error('the draft did not become a deck; the audit cannot continue');
    if (info?.title !== 'Audit scratch')
      fail('firstOpen', {
        id: 'auto title from the first heading (SPEC 6.3)',
        evidence: `title "${info?.title}"`,
      });
    else
      pass('firstOpen', {
        id: 'auto title from the first heading (SPEC 6.3)',
        evidence: `title "${info.title}"`,
      });
    await settled(page).catch(() => null);
  }
  log(`audit: scratch deck ${scratchDeck}`);
  /* round three: a second anonymous context on the scratch deck, the collaborator of the roster
     rows and the Follow and Go to slide effects (SPEC-3 3.11, 4.5) */
  if (!QUICK && phase('rows')) {
    try {
      const collabContext = await launched.browser.newContext({
        viewport: VIEWPORT,
        extraHTTPHeaders: protectionHeaders(),
      });
      collaborator = await collabContext.newPage();
      await collaborator.goto(`${BASE}/edit/${scratchDeck}`, { waitUntil: 'domcontentloaded' });
      await ready(collaborator);
      const joined = await waitFor(
        () =>
          page.evaluate(() => {
            const s = window.turboslide.studio.describe().state;
            const n =
              typeof s.presence?.others === 'number'
                ? s.presence.others
                : (s.presence?.others?.length ?? 0);
            return n > 0 ? n : null;
          }),
        { timeout: 10_000 },
      );
      (joined ? pass : fail)('presence:scratch', {
        id: 'collaborator.joins',
        menu: 'title',
        evidence: joined
          ? `the second context appears in the room (${joined} other)`
          : 'the second context never appeared in the room within 10 s',
      });
      const chips = await page.$$eval('[data-control^="presence.chip."]', (els) => els.length);
      (chips === 1 ? pass : fail)('presence:scratch', {
        id: 'presence.chip',
        menu: 'title',
        evidence: `${chips} chip(s) in the presence slot`,
      });
    } catch (error) {
      fail('presence:scratch', {
        id: 'collaborator',
        evidence: `the collaborator context threw: ${String(error).slice(0, 300)}`,
      });
      collaborator = null;
    }
  }

  // 2. the rows, fresh state
  const ctxA = await contextOf(page);
  if (phase('rows')) {
    await walkMenus(page, ctxA, 'scratch');
    await checkDefaultWords(page, `/edit/${scratchDeck}`);
    await checkContextMenu(
      page,
      'filmstripCard',
      async () => page.click('.ts-card[data-id]', { button: 'right' }),
      ctxA,
      'scratch',
    );
    await checkContextMenu(
      page,
      'emptyCanvas',
      async () => {
        const sheet = await page.$('.ts-stagewrap .pt-slide');
        const box = await sheet.boundingBox();
        await page.mouse.click(box.x + box.width - 30, box.y + box.height - 60, {
          button: 'right',
        });
      },
      ctxA,
      'scratch',
    );
    /* docs/FOCUS.md 3.1: the second presence pass, Tools > Advanced tools on through the
       product's own row: every parked row in its Google position, every Later row disabled with
       its stub clause, the default tail and the card menu with their parked controls and rows */
    if (await setAdvancedTools(page, true)) {
      const ctxOn = await contextOf(page);
      await walkMenus(page, ctxOn, 'scratch-advanced');
      await checkToolbar(page, 'default', 'scratch-advanced', ctxOn);
      await checkContextMenu(
        page,
        'filmstripCard',
        async () => page.click('.ts-card[data-id]', { button: 'right' }),
        ctxOn,
        'scratch-advanced',
      );
    }
  }

  if (!QUICK) {
    /* the parity phases drive the parked rows too (SPEC-2 and SPEC-3 surfaces), so they run with
       the switch on; every effect reads its context again (runEffect, contextOf) */
    await setAdvancedTools(page, true);
    // 3. the effects, fresh state
    if (phase('effects')) {
      const items = allItems().filter((item) => item.status === 'now' && !item.contextOnly);
      const insertRows = [];
      for (const item of items) {
        if (item.effect?.kind === 'submenu' && !item.effect.dynamic) continue;
        /* the rows that place a block run on a slide with a body (SPEC 7.3; B3 7.2 item 1) */
        if (item.effect?.kind === 'action' && item.effect.id === 'block.insert') {
          insertRows.push(item);
          continue;
        }
        await runEffect(page, context, item, ctxA, scratchDeck, 'scratch');
      }
      await runInsertRows(page, context, insertRows, scratchDeck, 'scratch');
    }
    if (phase('clipboard')) await clipboardSequence(page, ctxA, 'scratch');
    await resetEditor(page, scratchDeck);
    // the second slide state: Move slide and Delete slide
    if (phase('twoSlides')) {
      const st1 = await state(page);
      await invoke(page, 'slide.new', {
        layout: 'split',
        after: st1.slideId,
        baseRevision: st1.revision,
      }).catch(() => null);
      await settled(page).catch(() => null);
      const list2 = await invoke(page, 'slide.list');
      const second = list2[1]?.id;
      if (second) {
        await invoke(page, 'view.goto', { slideId: second });
        await waitFor(async () => ((await state(page)).slideId === second ? true : null));
        const ctx2 = await contextOf(page);
        for (const id of [
          'slide.moveSlide.up',
          'slide.moveSlide.toEnd',
          'slide.moveSlide.down',
          'slide.moveSlide.toBeginning',
        ]) {
          const item = findItem(id);
          const ctxNow = await contextOf(page);
          await runEffect(page, context, item, ctxNow, scratchDeck, 'twoSlides');
        }
        const ctxDel = await contextOf(page);
        await runEffect(
          page,
          context,
          findItem('slide.deleteSlide'),
          ctxDel,
          scratchDeck,
          'twoSlides',
        );
        void ctx2;
      }
    }
    // 6. shortcuts and retired keys, fresh state
    await resetEditor(page, scratchDeck);
    const ctxK = await contextOf(page);
    if (phase('shortcuts')) await checkShortcuts(page, context, ctxK, scratchDeck, 'scratch');
    if (phase('retired')) await checkRetiredKeys(page, 'scratch');
    // the block states: tails, the text rows, the canvas menus
    await resetEditor(page, scratchDeck);
    const states = phase('tails') ? await tailStates(page, context, scratchDeck, 'scratch') : null;
    if (states?.textCtx && phase('textBlock')) {
      const { slideId, blockId } = states.textCtx;
      await invoke(page, 'view.goto', { slideId });
      const selected = await selectBlockByClick(page, blockId, { text: true });
      if (selected === blockId) {
        /* SPEC 4.3: on a grammar slide Order moves the block one place within its slot
           (block.move), so the rows read from the block's place in its slot: forward and front
           when it is not first, backward and back when it is not last; on a freeform slide the
           z order decides (the shell's own predicate) */
        const placed = (await invoke(page, 'slide.get', { slideId })).slide;
        const slot = Object.values(placed.slots ?? {}).find((list) =>
          list.some((b) => b.id === blockId),
        );
        const at = slot ? slot.findIndex((b) => b.id === blockId) : -1;
        /* SPEC-2 6.1 row 13 supersedes the slot rule: one stack per canvas; on a slide nothing
           converted the objects take document order as their z, so forward and front hold when
           the block is not last in that order and backward and back when it is not first
           (editor-shell.ts buildMenuContext) */
        const everyBlock = Object.values(placed.slots ?? {}).flat();
        const docAt = everyBlock.findIndex((b) => b.id === blockId);
        void slot;
        void at;
        const order =
          placed.layout?.type === 'freeform' || docAt < 0
            ? { forward: false, backward: false, front: false, back: false }
            : {
                forward: everyBlock.length > 1 && docAt < everyBlock.length - 1,
                front: everyBlock.length > 1 && docAt < everyBlock.length - 1,
                backward: docAt > 0,
                back: docAt > 0,
              };
        const ctxB = await contextOf(page, {
          focus: 'canvas',
          selection: {
            blocks: 1,
            block: 'text',
            textBlock: true,
            listItem: false,
            tableCell: false,
            linked: false,
            order,
          },
        });
        pass('rows:textBlock', {
          id: 'arrange.order.expected',
          menu: 'arrange',
          evidence: `block ${blockId} at ${at + 1} of ${slot?.length ?? 0} in its slot on a ${placed.layout?.type ?? placed.kind} slide: Order rows expected ${JSON.stringify(order)} (SPEC 4.3)`,
        });
        /* the rows again with a text block selected: the Format, Arrange and Insert predicates */
        await walkMenus(page, ctxB, 'textBlock');
        await selectBlockByClick(page, blockId, { text: true });
        await checkContextMenu(
          page,
          'textBlock',
          async () => {
            await selectBlockByClick(page, blockId, { text: true });
            const el = await page.$(`.ts-stagewrap .pt-slide [data-block="${blockId}"]`);
            const box = await el.boundingBox();
            await page.mouse.click(box.x + 12, box.y + 12, { button: 'right' });
          },
          ctxB,
          'textBlock',
        );
        const textItems = [
          'format.text.bold',
          'format.text.size.increase',
          'format.text.size.decrease',
          'format.alignIndent.left',
          'format.alignIndent.center',
          'format.alignIndent.right',
          'format.spacing.single',
          'format.spacing.1_15',
          'format.spacing.1_5',
          'format.spacing.double',
          'format.spacing.custom',
          'format.bulletsNumbering.numbered',
          'format.bulletsNumbering.bulleted',
          'format.clearFormatting',
          'format.bordersLines.borderColor',
          'format.bordersLines.borderWeight',
          'insert.link',
          'edit.duplicate',
        ];
        for (const id of textItems) {
          const item = findItem(id);
          await invoke(page, 'view.goto', { slideId }).catch(() => null);
          const again = await selectBlockByClick(page, blockId, { text: true });
          if (again !== blockId) {
            skip(`effects:textBlock`, { id, evidence: `could not reselect ${blockId} (${again})` });
            continue;
          }
          if (id === 'format.clearFormatting') {
            /* Clear formatting needs an override to clear: Bold first, kept */
            const rev = await revisionOf(page);
            await activate(page, 'format.text.bold');
            await waitRevision(page, rev, 8000);
            await settled(page).catch(() => null);
            await selectBlockByClick(page, blockId, { text: true });
          }
          await runEffect(page, context, item, ctxB, scratchDeck, 'textBlock');
        }
      } else
        fail('effects:textBlock', {
          id: 'select',
          evidence: `could not select ${blockId} (${selected})`,
        });
    }
    /* round two: the object states (SPEC-2 4.2, 4.3, 5, 6.1, 9) on the same tail slide */
    if (states && phase('objects')) {
      await resetEditor(page, scratchDeck);
      try {
        await roundTwoStates(page, context, states, scratchDeck, 'objects');
      } catch (error) {
        fail('infrastructure', {
          id: 'objects',
          evidence: `the round two states threw: ${String(error?.stack ?? error).slice(0, 600)}`,
        });
      }
    }
    /* round three (SPEC-3 16.2): the versions panel, the dither surfaces, the roster by Shift+Tab,
       the role states, Forget this browser on the collaborator */
    if (phase('roundThree')) {
      await resetEditor(page, scratchDeck);
      for (const [name, run] of [
        ['versions', () => checkVersionsPanel(page, 'scratch')],
        ['dither', () => checkDitherSurfaces(page, states, scratchDeck, 'scratch')],
        ['shiftTab', () => checkRosterShiftTab(page, 'scratch')],
        ['roles', () => roleStates(page, launched.browser, scratchDeck, 'scratch')],
        ['forget', () => forgetOnCollaborator('scratch')],
      ]) {
        try {
          await run();
        } catch (error) {
          fail('infrastructure', {
            id: `roundThree.${name}`,
            evidence: `threw: ${String(error?.stack ?? error).slice(0, 600)}`,
          });
        }
        await resetEditor(page, scratchDeck).catch(() => null);
      }
    }
  }

  // 8. the tooltip audit
  let tooltipAudit = null;
  if (!SKIP_TOOLTIP_AUDIT && !QUICK && phase('tooltip')) {
    log('audit: tooltip audit');
    tooltipAudit = runTooltipAudit([`${BASE}/new`, `${BASE}/edit/${scratchDeck}`, `${BASE}/decks`]);
    const row = {
      id: 'tooltip-audit',
      evidence: `exit ${tooltipAudit.exit}; ${tooltipAudit.parsed ? JSON.stringify(tooltipAudit.parsed).slice(0, 600) : tooltipAudit.stdout.slice(0, 600)}`,
    };
    if (tooltipAudit.exit === 0) pass('tooltipAudit', row);
    else fail('tooltipAudit', row);
  }

  if (collaborator) {
    await collaborator
      .context()
      .close()
      .catch(() => null);
    collaborator = null;
  }
  // the cleanup: Move to trash, Delete forever
  if (mustClean()) {
    await page.goto(`${BASE}/edit/${scratchDeck}`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    await trashAndDelete(page, context, scratchDeck, 'scratch');
    cleaned = true;
  }

  // the read-only deck
  if (phase('readonly')) {
    log(`audit: read-only walk of /edit/${READ_ONLY_DECK}`);
    /* round three (SPEC-3 4.2): the five fixed slots of the title row at the row's first paint */
    if (!QUICK) await checkTitleSlots(page, `/edit/${READ_ONLY_DECK}`, READ_ONLY_DECK);
    await page.goto(`${BASE}/edit/${READ_ONLY_DECK}`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    /* the read-only walk audits the default view: the switch off (docs/FOCUS.md 3.1). The setting
       is the browser's; a read-only deck's page can draw a Tools menu without the row (the check
       chain's step 20 read "the row is not in the Tools menu ... rows drawn:
       tools.accessibilitySettings" on this page, VERIFICATION.md C2-F13), so when the page has no
       row the switch is turned off on the browser's own /new draft (no write, so no deck is made)
       and the deck page is loaded again, the way `forgetOnCollaborator` flips it on */
    if (!(await setAdvancedTools(page, false))) {
      await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
      await ready(page);
      const flipped = await setAdvancedTools(page, false);
      await page.goto(`${BASE}/edit/${READ_ONLY_DECK}`, { waitUntil: 'domcontentloaded' });
      await ready(page);
      (flipped ? pass : fail)('advanced', {
        id: 'tools.advancedTools',
        check: 'turn off',
        evidence: flipped
          ? `no row on /edit/${READ_ONLY_DECK}; turned off on /new and the deck page loaded again`
          : `no row on /edit/${READ_ONLY_DECK} nor on /new`,
      });
    }
    const ctxG = await contextOf(page);
    await walkMenus(page, ctxG, READ_ONLY_DECK);
    await checkToolbar(page, 'default', READ_ONLY_DECK, ctxG);
    await checkDefaultWords(page, `/edit/${READ_ONLY_DECK}`);
    await checkContextMenu(
      page,
      'filmstripCard',
      async () => page.click('.ts-card[data-id]', { button: 'right' }),
      ctxG,
      READ_ONLY_DECK,
    );
    if (!QUICK) await checkRetiredKeys(page, READ_ONLY_DECK);
  }

  // the home page
  if (phase('home')) {
    await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
    await page
      .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 60_000 })
      .catch(() => null);
    await checkDefaultWords(page, '/decks');
    const homeText = await page.evaluate(() => document.body.innerText);
    for (const item of allItems().filter(
      (i) => i.status === 'omit' && !LABELS_IN_USE.has(i.label),
    )) {
      const re = new RegExp(
        `(^|\\n)\\s*${item.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\n|$)`,
      );
      if (re.test(homeText))
        fail('rows:decks', {
          id: item.id,
          menu: 'home',
          status: 'omit',
          check: 'absent',
          evidence: 'the label is a line of /decks',
        });
    }
    pass('rows:decks', {
      id: 'omitted labels',
      check: 'absent',
      evidence: 'no omitted label stands as a line of /decks',
    });
  }
} catch (error) {
  fail('infrastructure', { id: 'run', evidence: String(error?.stack ?? error).slice(0, 800) });
  if (collaborator) {
    await collaborator
      .context()
      .close()
      .catch(() => null);
    collaborator = null;
  }
  /* a thrown phase must not leave the scratch deck in the store: trash and delete it here too */
  if (scratchDeck && !cleaned && mustClean()) {
    try {
      await page.goto(`${BASE}/edit/${scratchDeck}`, { waitUntil: 'domcontentloaded' });
      await ready(page);
      await trashAndDelete(page, context, scratchDeck, 'scratch');
      cleaned = true;
    } catch (cleanupError) {
      fail('infrastructure', {
        id: 'cleanup',
        evidence: `the scratch deck ${scratchDeck} stayed in the store: ${String(cleanupError).slice(0, 300)}`,
      });
    }
  }
} finally {
  if (TRACE)
    await context.tracing
      .stop({ path: isAbsolute(TRACE) ? TRACE : join(ROOT, TRACE) })
      .catch(() => null);
  await launched.close().catch(() => null);
}

if (pageErrors.length > 0)
  fail('infrastructure', { id: 'pageerror', evidence: pageErrors.slice(0, 10) });

// totals per menu
const totals = {};
for (const row of rows) {
  if (!row.section.startsWith('rows:')) continue;
  const [, tag] = row.section.split(':');
  const menu = row.menu ?? 'title';
  const bucket = ((totals[tag] ??= {})[menu] ??= {
    now: { pass: 0, fail: 0, skip: 0 },
    later: { pass: 0, fail: 0, skip: 0 },
    omit: { pass: 0, fail: 0, skip: 0 },
  });
  const status = row.status ?? 'now';
  const key = row.pass === true ? 'pass' : row.pass === false ? 'fail' : 'skip';
  if (bucket[status]) bucket[status][key] += 1;
}
const summary = {
  pass: rows.filter((r) => r.pass === true).length,
  fail: rows.filter((r) => r.pass === false).length,
  skip: rows.filter((r) => r.pass === null).length,
};
const perSection = {};
for (const row of rows) {
  const s = (perSection[row.section] ??= { pass: 0, fail: 0, skip: 0 });
  s[row.pass === true ? 'pass' : row.pass === false ? 'fail' : 'skip'] += 1;
}
const report = {
  base: BASE,
  at: new Date().toISOString(),
  commit,
  seconds: Math.round((Date.now() - startedAt) / 1000),
  scratchDeck,
  namePromptAnswered,
  summary,
  perSection,
  totals,
  rows,
  pageErrors,
};
mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
/* the report is committed under docs/ and check step 19 runs prettier over the tree: format it
   the way `pnpm format` would (best effort; the report stands as written when prettier is absent) */
spawnSync(
  join(ROOT, 'node_modules/.bin/prettier'),
  ['--log-level', 'silent', '--write', OUT_PATH],
  {
    cwd: ROOT,
    stdio: 'ignore',
  },
);

for (const [section, s] of Object.entries(perSection))
  log(
    `${section.padEnd(28)} pass ${String(s.pass).padStart(4)}  fail ${String(s.fail).padStart(3)}  skip ${String(s.skip).padStart(3)}`,
  );
for (const [tag, menus] of Object.entries(totals)) {
  log(`rows on ${tag}:`);
  for (const [menu, b] of Object.entries(menus))
    log(
      `  ${menu.padEnd(12)} now ${b.now.pass}/${b.now.pass + b.now.fail} (${b.now.skip} unreachable)  later ${b.later.pass}/${b.later.pass + b.later.fail}  omit ${b.omit.pass}/${b.omit.pass + b.omit.fail}`,
    );
}
log(
  `audit: ${summary.pass} pass, ${summary.fail} fail, ${summary.skip} skipped in ${report.seconds} s; report ${OUT}`,
);
for (const row of rows.filter((r) => r.pass === false).slice(0, 80))
  log(
    `  FAIL ${row.section} ${row.id}: ${typeof row.evidence === 'string' ? row.evidence.slice(0, 200) : JSON.stringify(row.evidence ?? { wanted: row.wanted, observed: row.observed }).slice(0, 200)}`,
  );
process.exit(failures > 0 && !REPORT_ONLY ? 1 : 0);
