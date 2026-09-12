#!/usr/bin/env node
// The Google Slides parity audit (docs/gslides-parity/SPEC.md 14.4; MILESTONES.md "Verifier").
//
//   node scripts/gslides-parity-audit.mjs [--base <origin>] [--out <json>] [--report]
//                                         [--read-only-deck gt-brand] [--quick] [--keep-deck]
//                                         [--skip-tooltip-audit]
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
  CONTEXT_MENUS,
  DEFAULT_MENU_CONTEXT,
  DIVIDER,
  MENUS,
  TITLE_ROW_ITEMS,
  TOOLBAR_HEAD,
  TOOLBAR_TAIL_DEFAULT,
  allItems,
  evaluate,
  findItem,
  isChecked,
  isEnabled,
  menuOf,
  resolveLabel,
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
  FORBIDDEN_DEFAULT_VIEW_WORDS,
  PROMPTS,
  STUB_PREFIX,
  TITLE_ROW,
  forbiddenWordsIn,
} from '../packages/chrome/src/menus/strings.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const BASE = (value('base') ?? 'http://localhost:4321').replace(/\/$/, '');
const OUT = value('out') ?? 'docs/gslides-parity/verification/parity-audit.json';
/** an absolute --out is written where it says; a relative one counts from the checkout root */
const OUT_PATH = isAbsolute(OUT) ? OUT : join(ROOT, OUT);
const REPORT_ONLY = flag('report');
const QUICK = flag('quick');
const KEEP_DECK = flag('keep-deck');
const SKIP_TOOLTIP_AUDIT = flag('skip-tooltip-audit');
const READ_ONLY_DECK = value('read-only-deck') ?? 'gt-brand';
/** an existing deck to audit in place of a fresh draft (debugging; it is not trashed unless --trash) */
const USE_DECK = value('deck');
const TRASH_USED_DECK = flag('trash');
/** only these effect ids (debugging) */
const ONLY_EFFECTS = value('effects') ? new Set(value('effects').split(',')) : null;
/** only these phases: rows, effects, clipboard, twoSlides, shortcuts, retired, tails, textBlock, tooltip, readonly, home */
const PHASES = value('phases') ? new Set(value('phases').split(',')) : null;
const phase = (name) => PHASES === null || PHASES.has(name);
/**
 * The rows docs/gslides-parity/VERIFICATION.md section 9 records as deviations from Google: their
 * effect is not run and the row is reported as skipped with the finding, so the exit code speaks
 * for the rows the round claims and the record names the rest. Remove a row here when it lands.
 */
const RECORDED_DEVIATIONS = new Map([
  [
    'format.bordersLines.borderColor',
    'finding 3: the row answers the sentence naming the toolbar control and opens no picker',
  ],
  [
    'format.bordersLines.borderWeight',
    'finding 3: the row answers the sentence naming the toolbar control and opens no picker',
  ],
]);
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(BASE);
const VIEWPORT = { width: 1440, height: 900 };

/** SPEC 10.2: the letters the editor retires (packages/chrome/src/editor-shell.ts RETIRED_KEYS). */
const RETIRED_KEYS = ['s', '[', 'd', 'e', 'p', 'f', 'g', 'b', 'r', '?', 'j', 'l', 'k', 'h'];

/** Kinds whose layouts carry a full picture (editor-shell.ts PICTURE_KINDS). */
const PICTURE_KINDS = new Set(['opener', 'mood', 'closing']);

/** The text block types of the text tail (editor-shell.ts TEXT_TYPES). */
const TEXT_TYPES = new Set(['heading', 'paragraph', 'text', 'box', 'plain', 'quote', 'lead']);

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

async function closeOverlays(page) {
  await closeMenus(page);
  for (let i = 0; i < 4; i += 1) {
    const dialogs = await page.$$('[role="dialog"]');
    if (dialogs.length === 0) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
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
  if (level < 0) {
    await page.click(`[data-control="title.row"] [data-menu-item="${id}"]`, { timeout: 4000 });
    return;
  }
  const leaf = `${ROW_SELECTOR(level)}[data-menu-item="${id}"]`;
  await assertEnabledRow(page, leaf);
  await page.click(leaf, { timeout: 8000 });
}

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
  return {
    ...DEFAULT_MENU_CONTEXT,
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
    settings: { ...DEFAULT_MENU_CONTEXT.settings },
  };
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
      tip: el.getAttribute('data-tip'),
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
      if (!row || !item.items || item.items.length === 0) continue;
      if (row.disabled || row.haspopup !== 'menu') continue;
      if (item.effect?.kind === 'submenu' && item.effect.dynamic) {
        /* the Apply layout grid: a dynamic plate, not a list of rows */
        await page.click(`${ROW_SELECTOR(level)}[data-menu-item="${item.id}"]`);
        const plate = await page
          .waitForSelector('.ts-menu.is-dynamic [data-control^="layout.apply."]', { timeout: 5000 })
          .catch(() => null);
        seen.get(item.id).dynamic = plate !== null;
        continue;
      }
      await openSubmenuRow(page, level, item.id).catch(() => null);
      await walkList(menuId, item.items, level + 1);
    }
  };
  for (const menu of MENUS) {
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
    /* a row under a Later or disabled container is not reachable in this state */
    const parentIds = ancestors(item.id);
    const parentBlocked = parentIds.some((pid) => {
      const p = findItem(pid);
      const prow = seen.get(pid);
      return p?.status === 'later' || (prow !== undefined && prow.disabled);
    });
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
    } else {
      const expected = isEnabled(item, ctx);
      if (found.disabled === expected)
        problems.push(
          `${found.disabled ? 'disabled' : 'enabled'} while the predicate ${item.enabled ?? 'always'} says ${expected ? 'enabled' : 'disabled'}`,
        );
      const check = isChecked(item, ctx);
      if (check !== undefined && found.role === 'menuitem')
        problems.push('a check item drawn as a plain menuitem');
    }
    if (problems.length === 0)
      pass(section, { ...base, check: 'row', evidence: `level ${found.level}` });
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

async function checkToolbar(page, kind, tag) {
  const observed = (await readToolbar(page)).map((c) => c.id);
  /* Hide the menus (SPEC 3.1 row 18) closes every tail; tailFor() leaves it out because the bar draws it apart */
  const wanted =
    kind === 'default'
      ? [...HEAD_IDS, ...DEFAULT_TAIL_IDS]
      : [...HEAD_IDS, ...tailFor(kind).map((c) => c.control), HIDE_MENUS_CONTROL];
  const known = new Set([
    ...HEAD_IDS,
    ...DEFAULT_TAIL_IDS,
    ...['text', 'shape', 'image', 'line', 'table', 'other'].flatMap((k) =>
      tailFor(k).map((c) => c.control),
    ),
  ]);
  const filtered = observed.filter((id) => known.has(id));
  const same = JSON.stringify(filtered) === JSON.stringify(wanted);
  const row = {
    id: `toolbar.${kind}`,
    kind,
    wanted,
    observed: filtered,
    evidence: same
      ? `${filtered.length} controls in the order of SPEC 3`
      : `wanted ${wanted.join(', ')}; observed ${filtered.join(', ')}`,
  };
  if (same) pass(`toolbar:${tag}`, { ...row, check: 'order' });
  else fail(`toolbar:${tag}`, { ...row, check: 'order' });
  return same;
}

// ---------------------------------------------------------------------------------------------
// Step 5: the right-click menus

function expectedContext(target, ctx) {
  const out = [];
  for (const entry of CONTEXT_MENUS[target]) {
    if (entry === DIVIDER) {
      out.push('-');
      continue;
    }
    const id = typeof entry === 'string' ? entry : evaluate(entry.when, ctx) ? entry.id : null;
    if (id === null) continue;
    const item = findItem(id);
    if (item && item.status !== 'omit') out.push(id);
  }
  /* no divider first, last or doubled */
  return out.filter(
    (e, i, a) => !(e === '-' && (i === 0 || i === a.length - 1 || a[i - 1] === '-')),
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
      default:
        return null;
    }
  }, setting);
}

async function checkedOf(page, id) {
  const level = await openPath(page, id);
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
    const ok =
      new URL(url).pathname + new URL(url).hash === path || url.includes(path.split('#')[0]);
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
      await page.click(`${ROW_SELECTOR(level)}[data-menu-item="${item.id}"]`);
      const sub = await page
        .waitForSelector(`[role="menu"][data-level="${level + 1}"]`, { timeout: 4000 })
        .catch(() => null);
      return { ok: sub !== null, evidence: sub ? 'submenu opened' : 'submenu did not open' };
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
    default:
      return { ok: false, evidence: `no observer for the client handler ${item.effect.handler}` };
  }
}

async function runActionEffect(page, context, item, ctx, deckId) {
  const id = item.effect.id;
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
        () => document.querySelector('.ts-editor')?.getAttribute('data-tool') ?? null,
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
          if (spot) {
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
  await page.mouse.click(box.x + Math.min(12, box.width / 2), box.y + Math.min(12, box.height / 2));
  await page.waitForTimeout(150);
  if (text) {
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
    { id: 'audit-shape', type: 'shape', shape: 'rectangle' },
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
      [
        'the ten menus in order',
        JSON.stringify(first.menus) === JSON.stringify(MENUS.map((m) => m.label)),
      ],
      [
        'the bottom bar: filmstrip, grid, the panel chevron',
        first.bottom.includes('view.filmstripView') &&
          first.bottom.includes('view.gridView') &&
          first.bottom.includes('panel.toggle'),
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
  }

  if (!QUICK) {
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
        const order =
          placed.layout?.type === 'freeform' || !slot
            ? { forward: false, backward: false, front: false, back: false }
            : {
                forward: at > 0,
                front: at > 0,
                backward: at >= 0 && at < slot.length - 1,
                back: at >= 0 && at < slot.length - 1,
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
    await page.goto(`${BASE}/edit/${READ_ONLY_DECK}`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    const ctxG = await contextOf(page);
    await walkMenus(page, ctxG, READ_ONLY_DECK);
    await checkToolbar(page, 'default', READ_ONLY_DECK);
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
for (const row of rows.filter((r) => r.pass === false).slice(0, 60))
  log(
    `  FAIL ${row.section} ${row.id}: ${typeof row.evidence === 'string' ? row.evidence.slice(0, 200) : JSON.stringify(row.evidence).slice(0, 200)}`,
  );
process.exit(failures > 0 && !REPORT_ONLY ? 1 : 0);
