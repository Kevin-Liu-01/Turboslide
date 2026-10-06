// The menus band's build module (docs/LANDING.md 2.5, 6.1, 6.4; the second pass). D4 owns this file in the design round (V2 wrote it)
// and the `menus.generated.ts` it writes. `scripts/build-home-assets.ts --slides` calls
// `deriveMenus()` and writes the text it returns, formatted, to
// apps/studio/src/components/home/menus.generated.ts; `--check` compares that text with the file.
// Run alone (`node scripts/home/menus.ts --write` or `--check`) it does the same for this one file.
//
// What it writes, so the page can never drift from the editor (2.5 "Copy"):
// - the menus of `visibleMenus(DEFAULT_MENU_CONTEXT)` (packages/chrome/src/menus/model.ts) in
//   order, each row with its id, label, the alternate label (Skip slide reads Unskip slide), the
//   divider above it, its `doc` sentence, its shortcut as `packages/chrome/src/menus/keys.ts` prints
//   it on a Mac and elsewhere, its check state, its children, and for the rows the page runs (2.5's
//   table, by model id) the binding the page matches and the model's reason when the row needs a
//   selection the default context does not hold;
// - the renderer's markup (`renderSlide`, packages/render/src/slide.ts) of the blocks Insert > Text
//   box, Shape > Rectangle and Shape > Ellipse place, as the editor makes them
//   (packages/chrome/src/editor-shell.ts 1775 to 1782, TOOL_SIZES 1725 to 1732), and of the blank
//   layout's slide (packages/schema/src/layouts.ts 478), which Insert > New slide adds.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

import {
  DEFAULT_MENU_CONTEXT,
  isChecked,
  isEnabled,
  resolveLabel,
  tooltipDoc,
  visibleItems,
  visibleMenus,
} from '../../packages/chrome/src/menus/model.ts';
import type { MenuContext, MenuItem } from '../../packages/chrome/src/menus/model.ts';
import { shortcutLabel } from '../../packages/chrome/src/menus/keys.ts';
import { renderSlide } from '../../packages/render/src/slide.ts';
import { GT_BAND, renderStage } from '../../packages/render/src/stage.ts';
import type { Deck, Slide } from '../../packages/schema/src/deck.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = 'apps/studio/home-deck';
const OUT = 'apps/studio/src/components/home/menus.generated.ts';

/**
 * The rows the page runs (LANDING.md 2.5's table), by model id. Download > Plain text and View >
 * Grid view are parked in the model (`advanced: true`, model.ts 1051 and 1254), so
 * `visibleMenus(DEFAULT_MENU_CONTEXT)` holds neither and the page cannot draw them (v2.md, day 0).
 */
export const RUN_ROWS: readonly string[] = [
  'file.rename',
  'file.download.pdf',
  'file.versionHistory.nameCurrent',
  'file.print',
  'edit.undo',
  'edit.redo',
  'edit.duplicate',
  'edit.delete',
  'view.slideshow',
  'view.showSpeakerNotes',
  'view.showFilmstrip',
  'insert.textBox',
  'insert.shape.shapes.rectangle',
  'insert.shape.shapes.ellipse',
  'insert.newSlide',
  'format.text.bold',
  'format.text.underline',
  'format.alignIndent.left',
  'format.alignIndent.center',
  'format.alignIndent.right',
  'format.clearFormatting',
  'slide.newSlide',
  'slide.duplicateSlide',
  'slide.deleteSlide',
  'slide.skipSlide',
  'slide.moveSlide.up',
  'slide.moveSlide.down',
  'slide.moveSlide.toBeginning',
  'slide.moveSlide.toEnd',
  'slide.changeTheme',
  'arrange.order.bringToFront',
  'arrange.order.sendToBack',
  'arrange.align.left',
  'arrange.align.center',
  'arrange.align.right',
  'arrange.centerOnPage.horizontally',
  'arrange.centerOnPage.vertically',
  'arrange.rotate.clockwise',
  'arrange.rotate.counterClockwise',
  'tools.tailor',
  'help.searchMenus',
  'help.keyboardShortcuts',
];

/** The editor's default boxes in sheet px (editor-shell.ts TOOL_SIZES): text 480 by 64, shapes 240 by 160. */
export const INSERT_SIZES = { text: [480, 64], shape: [240, 160] } as const;

/** One row of the miniature's menus, as menus.generated.ts holds it. */
export type GeneratedRow = {
  id: string;
  label: string;
  /** the label while the slide is skipped (Unskip slide) */
  alt?: string;
  /** a 1 px rule above the row */
  rule?: true;
  /** the row's own sentence of the model, with a full stop */
  doc?: string;
  /** the shortcut as keys.ts prints it on a Mac (symbols) and elsewhere (words) */
  mac?: string;
  win?: string;
  /** the binding the page matches (a run row's), Mac form then the other */
  bind?: [string, string];
  /** the page runs the row */
  run?: true;
  /** the model's sentence while nothing is selected, for a run row that needs a selection */
  needs?: string;
  /** a row the page does not run that the editor disables in the default context (greyed) */
  off?: true;
  /** a check row and its state in the default context */
  check?: boolean;
  items?: GeneratedRow[];
};

const sentence = (text: string | undefined): string | undefined => {
  if (text === undefined || text.trim() === '') return undefined;
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

function rowOf(item: MenuItem, ctx: MenuContext): GeneratedRow {
  const row: GeneratedRow = { id: item.id, label: resolveLabel(item, ctx) };
  if (item.altLabel !== undefined) row.alt = item.altLabel.label;
  if (item.dividerBefore === true) row.rule = true;
  const doc = sentence(item.doc);
  if (doc !== undefined) row.doc = doc;
  if (item.key !== undefined) {
    row.mac = shortcutLabel(item.key, 'mac', 'symbols');
    row.win = shortcutLabel(item.key, 'win', 'words');
  }
  if (RUN_ROWS.includes(item.id)) {
    row.run = true;
    if (item.key !== undefined) row.bind = [item.key.mac, item.key.win];
    if (!isEnabled(item, ctx)) {
      const reason = sentence(tooltipDoc(item, ctx));
      if (reason !== undefined) row.needs = reason;
    }
  } else if (!isEnabled(item, ctx)) row.off = true;
  const checked = isChecked(item, ctx);
  if (checked !== undefined) row.check = checked;
  if (item.items !== undefined) {
    const children = visibleItems(item.items, { context: ctx, collapseSingles: true });
    if (children.length > 0) row.items = children.map((child) => rowOf(child, ctx));
  }
  return row;
}

/** The nine menus the miniature draws, generated from the model in Google's order. */
export function menusOf(
  ctx: MenuContext = DEFAULT_MENU_CONTEXT,
): { id: string; label: string; rows: GeneratedRow[] }[] {
  return visibleMenus(ctx).map((menu) => ({
    id: menu.id,
    label: menu.label,
    rows: visibleItems(menu.items, { context: ctx, collapseSingles: true }).map((item) =>
      rowOf(item, ctx),
    ),
  }));
}

function fail(message: string): never {
  throw new Error(`scripts/home/menus.ts: ${message}`);
}

const RENDER_BASE = {
  chrome: true,
  assetBase: '',
  blockAttrs: true,
  gtWord: true,
  active: true,
} as const;

/** The inner markup of one `.free` wrapper of a rendered freeform slide (the block's own HTML). */
function freeInner(html: string, id: string): string {
  const open = `<div class="free" data-free="${id}"`;
  const at = html.indexOf(open);
  if (at < 0) fail(`no .free wrapper for ${id}`);
  const start = html.indexOf('>', at) + 1;
  let depth = 1;
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = start;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return fail(`the .free wrapper of ${id} does not close`);
}

/** The renderer's markup of the inserted blocks and of the blank slide (2.5 "The rows"). */
export function insertMarkup(): { text: string; rect: string; oval: string; blank: string } {
  const deck = JSON.parse(readFileSync(resolve(ROOT, FIXTURE, 'deck.json'), 'utf8')) as Deck;
  const [tw, th] = INSERT_SIZES.text;
  const [sw, sh] = INSERT_SIZES.shape;
  const centred = (w: number, h: number) => ({ x: (1600 - w) / 2, y: (900 - h) / 2, w, h });
  const slide = {
    schemaVersion: 1,
    id: 'ins',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        { id: 'ins-text', type: 'text', text: '', autofit: 'grow', pos: centred(tw, th) },
        { id: 'ins-rect', type: 'shape', shape: 'rectangle', pos: centred(sw, sh) },
        { id: 'ins-oval', type: 'shape', shape: 'ellipse', pos: centred(sw, sh) },
      ],
    },
  } as unknown as Slide;
  const both = (s: Slide): string => {
    const light = renderSlide(deck, s, { ...RENDER_BASE, theme: 'light' });
    const dark = renderSlide(deck, s, { ...RENDER_BASE, theme: 'dark' });
    for (const r of [light, dark])
      if (r.warnings.length > 0) fail(`${s.id}: ${r.warnings.join('; ')}`);
    if (light.html !== dark.html) fail(`${s.id}: the light and dark renders differ`);
    return light.html;
  };
  const blocks = both(slide);
  const blankSlide = {
    schemaVersion: 1,
    id: 'blank',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {},
  } as unknown as Slide;
  let blank = renderStage(both(blankSlide), {
    theme: 'light',
    counter: '1 / 9',
    band: GT_BAND,
    titleSlide: false,
  });
  // the page's slide root, as the build writes every instance (build-home-assets.ts instanceHtml):
  // the appearance from the page, the root's hooks, the page's mark, the counter's hook
  blank = blank.replace(
    /^<div class="ts-sheet sheet" data-theme="light">/,
    '<div class="ts-sheet sheet ts-home-slide" data-home-slides data-slide="blank" data-instance="mini-blank" data-counter="1 / 9">',
  );
  if (!blank.startsWith('<div class="ts-sheet sheet ts-home-slide"'))
    fail("renderStage's root changed");
  blank = blank.replace(/href="#gt-mark"/g, 'href="#ts-mark"');
  blank = blank.replace('<div class="counter">', '<div class="counter" data-counter-text>');
  return {
    text: freeInner(blocks, 'ins-text'),
    rect: freeInner(blocks, 'ins-rect'),
    oval: freeInner(blocks, 'ins-oval'),
    blank,
  };
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** A row as the packed tuple of menus.generated.ts (its `Packed` type). */
function pack(r: GeneratedRow): unknown[] {
  const flags =
    (r.rule === true ? 1 : 0) |
    (r.run === true ? 2 : 0) |
    (r.check !== undefined ? 4 : 0) |
    (r.check === true ? 8 : 0) |
    (r.off === true ? 16 : 0);
  const extra: Record<string, unknown> = {};
  if (r.alt !== undefined) extra['a'] = r.alt;
  if (r.bind !== undefined) extra['b'] = r.bind;
  if (r.needs !== undefined) extra['n'] = r.needs;
  // a row the page does not run is found by its label alone, so only a run row keeps its id
  const t: unknown[] = [
    r.run === true ? r.id : '',
    r.label,
    flags,
    r.mac ?? '',
    r.win ?? '',
    r.doc ?? '',
    r.items === undefined ? 0 : r.items.map(pack),
  ];
  if (Object.keys(extra).length > 0) t.push(extra);
  while (t.length > 2 && (t[t.length - 1] === '' || t[t.length - 1] === 0)) t.pop();
  return t;
}

/** The text of `menus.generated.ts`, unformatted (the entry formats it with the repository's Prettier). */
export function deriveMenus(): string {
  const menus = menusOf();
  const ids = new Set<string>();
  const walk = (rows: readonly GeneratedRow[]): void => {
    for (const r of rows) {
      ids.add(r.id);
      if (r.items !== undefined) walk(r.items);
    }
  };
  for (const m of menus) walk(m.rows);
  for (const id of RUN_ROWS) if (!ids.has(id)) fail(`the run row ${id} is not in the menus`);
  if (menus.length !== 9) fail(`the model draws ${menus.length} menus, not 9`);
  const markup = insertMarkup();
  const model = readFileSync(resolve(ROOT, 'packages/chrome/src/menus/model.ts'), 'utf8');
  const keys = readFileSync(resolve(ROOT, 'packages/chrome/src/menus/keys.ts'), 'utf8');
  return `// Generated by scripts/build-home-assets.ts --slides with scripts/home/menus.ts (docs/LANDING.md 2.5, 6.1); never edited by hand.
// node scripts/build-home-assets.ts --check compares this file with its sources.
//
// The menus band's data, imported by live/menus.ts alone (the menus chunk): the editor's nine
// menus as \`visibleMenus(DEFAULT_MENU_CONTEXT)\` draws them, and the renderer's markup of the blocks
// and the slide the Insert rows add.

/** One row: its id, label and model sentence; its shortcut as keys.ts prints it; run rows marked. */
export type MiniRow = {
  readonly id: string;
  readonly label: string;
  /** the label while the slide is skipped */
  readonly alt?: string;
  /** a 1 px rule above the row */
  readonly rule?: true;
  readonly doc?: string;
  /** the shortcut on a Mac (symbols) and elsewhere (words) */
  readonly mac?: string;
  readonly win?: string;
  /** the binding the page matches, Mac form then the other */
  readonly bind?: readonly [string, string];
  /** the page runs the row */
  readonly run?: true;
  /** the model's sentence while nothing is selected */
  readonly needs?: string;
  /** the editor disables the row in the default context (a row the page does not run) */
  readonly off?: true;
  /** a check row's state in the default context */
  readonly check?: boolean;
  readonly items?: readonly MiniRow[];
};

export type MiniMenu = { readonly id: string; readonly label: string; readonly rows: readonly MiniRow[] };

/** sha256 of packages/chrome/src/menus/model.ts and keys.ts the menus were read from */
export const MINI_SOURCES = { model: '${sha256(model)}', keys: '${sha256(keys)}' } as const;

/**
 * A row packed as a tuple, so the menus chunk carries no key names (LANDING.md 4.1: a band chunk at
 * most 16 KB gzip): id (a run row's; '' for the others), label, flags (1 a rule above, 2 the page runs it, 4 a check row, 8
 * checked, 16 the editor disables it), the Mac and the other shortcut, the sentence, the children, then a the alternate
 * label, b the binding and n the sentence while nothing is selected; trailing empties dropped.
 */
type Packed = readonly [
  string,
  string,
  number?,
  string?,
  string?,
  string?,
  (readonly Packed[] | 0)?,
  { readonly a?: string; readonly b?: readonly [string, string]; readonly n?: string }?,
];

const PACKED: readonly (readonly [string, string, readonly Packed[]])[] = ${JSON.stringify(
    menus.map((m) => [m.id, m.label, m.rows.map(pack)]),
  )};

function unpack(p: Packed): MiniRow {
  const [id, label, flags = 0, mac = '', win = '', doc = '', items = 0, x = {}] = p;
  const row: {
    -readonly [K in keyof MiniRow]: MiniRow[K];
  } = { id, label };
  if ((flags & 1) !== 0) row.rule = true;
  if ((flags & 2) !== 0) row.run = true;
  if ((flags & 4) !== 0) row.check = (flags & 8) !== 0;
  if ((flags & 16) !== 0) row.off = true;
  if (mac !== '') row.mac = mac;
  if (win !== '') row.win = win;
  if (doc !== '') row.doc = doc;
  if (items !== 0) row.items = items.map(unpack);
  if (x.a !== undefined) row.alt = x.a;
  if (x.b !== undefined) row.bind = x.b;
  if (x.n !== undefined) row.needs = x.n;
  return row;
}

export const MINI_MENUS: readonly MiniMenu[] = PACKED.map(([id, label, rows]) => ({
  id,
  label,
  rows: rows.map(unpack),
}));

/** The renderer's markup of a text box, a rectangle and an ellipse (the inner block of each \`.free\` wrapper). */
export const MINI_BLOCKS = ${JSON.stringify({ text: markup.text, rect: markup.rect, oval: markup.oval }, null, 2)} as const;

/** The editor's default boxes in sheet px (editor-shell.ts TOOL_SIZES). */
export const MINI_SIZES = ${JSON.stringify(INSERT_SIZES)} as const;

/** The blank layout's slide (Insert > New slide), as the build writes every slide root. */
export const MINI_BLANK = ${JSON.stringify(markup.blank)};
`;
}

async function formatTs(path: string, source: string): Promise<string> {
  const options = (await prettier.resolveConfig(resolve(ROOT, path))) ?? {};
  return prettier.format(source, { ...options, filepath: resolve(ROOT, path) });
}

/** Run alone: `--write` writes menus.generated.ts, `--check` compares it with its sources. */
async function main(argv: readonly string[]): Promise<void> {
  const text = await formatTs(OUT, deriveMenus());
  const file = resolve(ROOT, OUT);
  if (argv.includes('--check')) {
    let now = '';
    try {
      now = readFileSync(file, 'utf8');
    } catch {
      fail(`${OUT} is missing; run --write`);
    }
    if (now !== text) fail(`${OUT} differs from its sources; run --write`);
    console.log(`scripts/home/menus.ts --check: ${OUT} matches its sources`);
    return;
  }
  if (argv.includes('--write')) {
    writeFileSync(file, text);
    console.log(`scripts/home/menus.ts: wrote ${OUT} (${Buffer.byteLength(text)} B)`);
    return;
  }
  fail('name a mode: --write or --check');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
