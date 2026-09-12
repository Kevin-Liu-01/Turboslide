// Inline text editing on the stage (SPEC 6.4; gslides-parity SPEC 7.2.15, 7.4, 10.2): the run
// element itself is `contenteditable` for the session, the caret lands where the reader clicked,
// typing becomes one `text.replace` per 400 ms pause (a burst), so one Cmd Z removes one burst,
// Enter breaks a paragraph in the four multiline pointers and commits elsewhere, Esc commits and
// hands the block back to the Editor, Tab and Shift Tab hand the next cell of a table to the
// Editor, `BR` and the renderer's `.para` spans read back as `\n`, and `spellcheck` stays on so
// the browser underlines misspellings. The commit rebuilds the four-rule markup from the edited
// DOM through the runs (SPEC 4.2: parseText and serializeRuns are the one parser), one paragraph
// at a time so the stored form is canonical (schema/text.ts canonicalText). A standalone GT typed
// into the text becomes the mark at once and the document keeps the letters. The pure walk
// (runsFromNode, paragraphsFromNode, textFromNode, textDiff, textBurstMutation, the cell and list
// helpers) runs over a structural node type so inline-text.test.ts pins the round trip in Node;
// the component owns the DOM. The run toolbar of the editor depth round is gone: Google's text
// controls sit on the toolbar tail (SPEC 3.2), and the link popover stays on Cmd K.
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';

import { GT_WORD_HTML } from '@turboslide/render/text';
import type { Block } from '@turboslide/schema/blocks';
import type { TableBlock } from '@turboslide/schema/blocks/table';
import type { Slide } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';
import type { Box } from '@turboslide/schema/render';
import { mergeRuns, parseText, serializeRuns } from '@turboslide/schema/text';
import type { Run, Text as Markup } from '@turboslide/schema/text';

import { blockById, cellPointer, listItemPointer } from './Selection';

import './InlineText.css';

/** The shape of a DOM node the walk reads; real Nodes satisfy it, and the tests build plain objects. */
export type RunNode = {
  nodeType: number;
  nodeValue?: string | null;
  nodeName: string;
  childNodes: ArrayLike<RunNode>;
  getAttribute?: (name: string) => string | null;
  classList?: { contains: (name: string) => boolean };
};

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** The class of the mark span the renderer writes (render/text.ts GT_WORD_HTML). */
export const GT_WORD_CLASS = 'gt-word';

/** The class the renderer gives one paragraph of a multiline Text (gslides-parity SPEC 7.2.9). */
export const PARA_CLASS = 'para';

/** The pause after the last keystroke before the typing is one write (gslides-parity SPEC 7.2.15). */
export const TEXT_BURST_MS = 400;

/** The elements the browser or the renderer use as paragraph boxes inside an editable run. */
const PARAGRAPH_ELEMENTS = new Set(['DIV', 'P', 'LI']);

type Flags = { b?: true; link?: string };

/** The one paragraph break marker inside a run list before the split. */
const BREAK = '\n';

/**
 * A plain text as runs with any standalone GT split out as a gt run: the letters are escaped for
 * `*` and `[` only, so parseText applies the boundary rule the renderer uses (SPEC 4.2).
 */
function plainRuns(text: string, flags: Flags): Run[] {
  if (flags.link !== undefined) {
    // link text is literal: the parser never flags GT inside a link (text.ts)
    const run: Run = { t: text, link: flags.link };
    if (flags.b) run.b = true;
    return [run];
  }
  const escaped = text.replace(/[*[]/g, '\\$&');
  return parseText(escaped).map((run) => {
    const out: Run = { t: run.t };
    if (run.gt) out.gt = true;
    if (flags.b) out.b = true;
    if (flags.link !== undefined) out.link = flags.link;
    return out;
  });
}

function endsWithBreak(out: Run[]): boolean {
  const last = out[out.length - 1];
  return last === undefined || last.t.endsWith(BREAK);
}

function isParagraphBox(node: RunNode, name: string): boolean {
  return PARAGRAPH_ELEMENTS.has(name) || node.classList?.contains(PARA_CLASS) === true;
}

function walk(node: RunNode, flags: Flags, out: Run[]): void {
  if (node.nodeType === TEXT_NODE) {
    // contenteditable writes a non-breaking space where a text node starts or ends in a space,
    // at the run's end and on both sides of the non-editable GT mark (measured: "with " + the
    // mark + "\u00a0now" after typing "with GT now"); the nowrap device (SPEC 4.2) is never the
    // first or the last character of a text node, so only the two edges are turned back
    const value = (node.nodeValue ?? '')
      .replace(/^\u00a0/, ' ')
      .replace(/\u00a0$/, ' ')
      .replace(/\r\n?/g, BREAK);
    if (value !== '') out.push(...plainRuns(value, flags));
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const name = node.nodeName.toUpperCase();
  if (name === 'SVG' || name === 'USE') return;
  // the prompt of an empty placeholder is never content (gslides-parity SPEC 5.4)
  const prompt = node.getAttribute?.('data-prompt');
  if (prompt !== null && prompt !== undefined) return;
  if (name === 'BR') {
    out.push({ t: BREAK });
    return;
  }
  if (node.classList?.contains(GT_WORD_CLASS)) {
    const run: Run = { t: 'GT', gt: true };
    if (flags.b) run.b = true;
    out.push(run);
    return;
  }
  const next: Flags = { ...flags };
  if (name === 'B' || name === 'STRONG') next.b = true;
  if (name === 'A') {
    const href = node.getAttribute?.('href');
    if (href) next.link = href;
  }
  // a paragraph box starts a new paragraph unless it is the first thing in the run
  const paragraph = isParagraphBox(node, name);
  if (paragraph && out.length > 0 && !endsWithBreak(out)) out.push({ t: BREAK });
  for (const child of Array.from(node.childNodes)) walk(child, next, out);
}

/**
 * The runs of an edited run element: text, `<b>`, `<a href>`, the mark span and, when the pointer
 * is multiline, one `\n` per paragraph break (a `BR`, a `.para` span, a `DIV` the browser made);
 * on a one line pointer every break reads as a space (SPEC 4.2: no line breaks in a Text).
 */
export function runsFromNode(node: RunNode, options: { multiline?: boolean } = {}): Run[] {
  const out: Run[] = [];
  walk(node, {}, out);
  const merged = mergeRuns(out);
  if (options.multiline === true) return merged;
  return mergeRuns(merged.map((run) => ({ ...run, t: run.t.replace(/[\n\r]+/g, ' ') })));
}

/** The paragraphs of an edited multiline run: the runs split at every `\n`, trailing empty paragraphs dropped. */
export function paragraphsFromNode(node: RunNode): Run[][] {
  const paragraphs: Run[][] = [[]];
  for (const run of runsFromNode(node, { multiline: true })) {
    const parts = run.t.split(BREAK);
    parts.forEach((part, index) => {
      if (index > 0) paragraphs.push([]);
      if (part === '') return;
      const current = paragraphs[paragraphs.length - 1];
      if (current) current.push({ ...run, t: part });
    });
  }
  while (paragraphs.length > 1) {
    const last = paragraphs[paragraphs.length - 1];
    if (last === undefined || last.some((run) => run.t.trim() !== '')) break;
    paragraphs.pop();
  }
  return paragraphs.map((runs) => mergeRuns(runs));
}

/**
 * The canonical markup of an edited run element: what the commit writes (SPEC 4.4). A multiline
 * pointer joins its paragraphs with `\n`, each serialized on its own so a bold run never crosses
 * a paragraph (schema/text.ts canonicalText); a one line pointer is one trimmed paragraph.
 */
export function textFromNode(node: RunNode, options: { multiline?: boolean } = {}): Markup {
  if (options.multiline !== true) return serializeRuns(runsFromNode(node)).trim();
  return paragraphsFromNode(node)
    .map((runs) => serializeRuns(runs).trim())
    .join(BREAK);
}

/** The slide field a title or statement pseudo block renders (slide.ts: heading, lead, big). */
function slideTextPath(slide: Slide, blockId: string): string {
  if (slide.kind === 'title') return blockId === 'lead' ? '/lead' : '/heading';
  return '/big';
}

/** True for the text of a title or statement slide, which is a slide field rather than a block. */
export function isSlideField(slide: Slide, blockId: string): boolean {
  return (
    (slide.kind === 'title' && (blockId === 'heading' || blockId === 'lead')) ||
    (slide.kind === 'statement' && blockId === 'big')
  );
}

/** The markup a run currently holds in the document, read at the data-run pointer. */
export function readRunText(slide: Slide, blockId: string, pointer: string): Markup | undefined {
  let value: unknown;
  if (isSlideField(slide, blockId)) {
    value = getAt(slide, slideTextPath(slide, blockId));
  } else {
    const block = blockById(slide, blockId);
    value = block ? getAt(block, `/${pointer}`) : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

/**
 * The one write a whole text commit is (M3 plan, item 3): `block.set` of the whole markup at the
 * run's pointer, or `slide.set` for the text of a title or statement slide, which is a slide
 * field. Null when the markup equals what the document holds.
 */
export function textCommitMutation(
  slide: Slide,
  blockId: string,
  pointer: string,
  text: Markup,
): Mutation | null {
  const current = readRunText(slide, blockId, pointer);
  if (current === text) return null;
  if (isSlideField(slide, blockId)) {
    return { op: 'slide.set', slideId: slide.id, path: slideTextPath(slide, blockId), value: text };
  }
  return { op: 'block.set', slideId: slide.id, blockId, path: `/${pointer}`, value: text };
}

// ---------------------------------------------------------------------------------------------
// Bursts (gslides-parity SPEC 7.2.15)

/** A surrogate pair is never split by a diff boundary. */
function backOffSurrogate(text: string, at: number): number {
  const code = text.charCodeAt(at - 1);
  return code >= 0xd800 && code <= 0xdbff ? at - 1 : at;
}

/**
 * The changed span between two texts: the common prefix and suffix are kept, so a burst of
 * typing travels as the characters it added or replaced and the version log reads as typing.
 */
export function textDiff(from: string, to: string): { start: number; end: number; text: string } {
  let start = 0;
  const max = Math.min(from.length, to.length);
  while (start < max && from.charCodeAt(start) === to.charCodeAt(start)) start += 1;
  start = backOffSurrogate(from, start);
  let endFrom = from.length;
  let endTo = to.length;
  while (
    endFrom > start &&
    endTo > start &&
    from.charCodeAt(endFrom - 1) === to.charCodeAt(endTo - 1)
  ) {
    endFrom -= 1;
    endTo -= 1;
  }
  if (endFrom < from.length) {
    const adjusted = backOffSurrogate(from, endFrom);
    endTo += endFrom - adjusted;
    endFrom = adjusted;
  }
  return { start, end: endFrom, text: to.slice(start, endTo) };
}

/**
 * One burst of typing as a write (gslides-parity SPEC 7.2.15): `text.replace` of the changed span
 * at the run's pointer, so one Cmd Z removes one burst; the text of a title or statement slide is
 * a field and travels as `slide.set`. Null when nothing changed.
 */
export function textBurstMutation(
  slide: Slide,
  blockId: string,
  pointer: string,
  from: Markup,
  to: Markup,
): Mutation | null {
  if (from === to) return null;
  if (isSlideField(slide, blockId) || blockById(slide, blockId) === undefined) {
    return textCommitMutation(slide, blockId, pointer, to);
  }
  const diff = textDiff(from, to);
  return {
    op: 'text.replace',
    slideId: slide.id,
    blockId,
    path: `/${pointer}`,
    range: [diff.start, diff.end],
    text: diff.text,
  };
}

// ---------------------------------------------------------------------------------------------
// Table cells and list items (gslides-parity SPEC 7.3, 7.4)

/**
 * The cell Tab or Shift Tab moves to from a cell pointer: the next cell in reading order, `append`
 * past the last cell (the Editor adds a row), null before the first cell or off a table.
 */
export function nextCellPointer(
  block: TableBlock,
  pointer: string,
  delta: 1 | -1,
): { pointer: string } | 'append' | null {
  const cell = cellPointer(pointer);
  if (cell === null) return null;
  const columns = block.columns.length;
  const flat = cell.row * columns + cell.col + delta;
  if (flat < 0) return null;
  if (flat >= block.rows.length * columns) return 'append';
  return { pointer: `rows/${Math.floor(flat / columns)}/cells/${flat % columns}` };
}

/** The `block.set /rows` that appends an empty row to a table, and the pointer of its first cell. */
export function tableRowAppendMutation(
  slide: Slide,
  block: TableBlock,
): { mutation: Mutation; pointer: string } {
  const rows = [...block.rows, { cells: block.columns.map(() => '') }];
  return {
    mutation: { op: 'block.set', slideId: slide.id, blockId: block.id, path: '/rows', value: rows },
    pointer: `rows/${rows.length - 1}/cells/0`,
  };
}

/**
 * Enter at the end of a list item (gslides-parity SPEC 7.4): the `block.set /items` that appends an
 * empty item after the one being edited on a plain, rows or refs block, and the pointer of the run
 * to edit next. Null for any other block or pointer.
 */
export function listAppendMutation(
  slide: Slide,
  block: Block,
  pointer: string,
): { mutation: Mutation; pointer: string } | null {
  const item = listItemPointer(pointer);
  if (item === null) return null;
  const at = item.index + 1;
  const set = (items: unknown[], next: string): { mutation: Mutation; pointer: string } => ({
    mutation: {
      op: 'block.set',
      slideId: slide.id,
      blockId: block.id,
      path: '/items',
      value: items,
    },
    pointer: next,
  });
  switch (block.type) {
    case 'plain': {
      const items = [...block.items];
      items.splice(at, 0, { text: '' });
      return set(items, `items/${at}/text`);
    }
    case 'rows': {
      const items = [...block.items];
      items.splice(at, 0, { key: '', value: '' });
      return set(items, `items/${at}/${item.field === 'value' ? 'value' : 'key'}`);
    }
    case 'refs': {
      const items = [...block.items];
      items.splice(at, 0, '');
      return set(items, `items/${at}`);
    }
    default:
      return null;
  }
}

/**
 * Backspace on an empty list item (gslides-parity SPEC 7.4): the `block.set /items` that removes
 * it, and the pointer of the item before it to edit next (null when it was the first). Null for a
 * block with one item, so a list never empties from the keyboard.
 */
export function listRemoveMutation(
  slide: Slide,
  block: Block,
  pointer: string,
): { mutation: Mutation; pointer: string | null } | null {
  const item = listItemPointer(pointer);
  if (item === null) return null;
  if (block.type !== 'plain' && block.type !== 'rows' && block.type !== 'refs') return null;
  if (block.items.length <= 1) return null;
  const items = [...block.items] as unknown[];
  items.splice(item.index, 1);
  const previous = item.index - 1;
  const field = block.type === 'plain' ? '/text' : block.type === 'rows' ? '/value' : '';
  return {
    mutation: {
      op: 'block.set',
      slideId: slide.id,
      blockId: block.id,
      path: '/items',
      value: items,
    },
    pointer: previous < 0 ? null : `items/${previous}${field}`,
  };
}

// ---------------------------------------------------------------------------------------------
// The at-once mark (SPEC 6.4: a typed standalone GT renders as the mark at once)

const WORD_CHARACTER = /[A-Za-z0-9_\-./]/;

function isBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true;
  return !WORD_CHARACTER.test(text.charAt(index));
}

function markSpan(): HTMLElement | null {
  const template = document.createElement('template');
  template.innerHTML = GT_WORD_HTML;
  const mark = template.content.firstElementChild;
  if (!(mark instanceof HTMLElement)) return null;
  // the mark moves as one character
  mark.contentEditable = 'false';
  return mark;
}

/**
 * Replaces every standalone `GT` in the text nodes under `root` with the mark span, except one the
 * caret still touches (the reader may be typing `GTX`), and puts the caret back where it was.
 * Text inside a link or an existing mark is left alone.
 */
export function markGtInEditable(root: HTMLElement): void {
  const selection = window.getSelection();
  const caret =
    selection && selection.rangeCount > 0 && selection.isCollapsed ? selection.getRangeAt(0) : null;
  const texts: globalThis.Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest(`.${GT_WORD_CLASS}, a`)) continue;
    texts.push(node as globalThis.Text);
  }
  for (const node of texts) {
    const value = node.nodeValue ?? '';
    let at = value.indexOf('GT');
    while (at >= 0) {
      const standalone = isBoundary(value, at - 1) && isBoundary(value, at + 2);
      const caretTouches =
        caret !== null &&
        caret.startContainer === node &&
        caret.startOffset >= at &&
        caret.startOffset <= at + 2;
      if (standalone && !caretTouches) {
        const mark = markSpan();
        if (!mark) return;
        const caretInTail =
          caret !== null && caret.startContainer === node && caret.startOffset > at + 2
            ? caret.startOffset - (at + 2)
            : null;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 2);
        range.deleteContents();
        range.insertNode(mark);
        if (caretInTail !== null && selection) {
          const tail = mark.nextSibling;
          if (tail && tail.nodeType === TEXT_NODE) {
            const restored = document.createRange();
            restored.setStart(tail, Math.min(caretInTail, tail.nodeValue?.length ?? 0));
            restored.collapse(true);
            selection.removeAllRanges();
            selection.addRange(restored);
          }
        }
        // the node list changed under us: start over, one standalone GT fewer
        markGtInEditable(root);
        return;
      }
      at = value.indexOf('GT', at + 2);
    }
  }
}

/** Inserts the mark span at the caret inside `root` and moves the caret after it. */
export function insertGtMark(root: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return;
  const mark = markSpan();
  if (!mark) return;
  range.deleteContents();
  range.insertNode(mark);
  const after = document.createRange();
  after.setStartAfter(mark);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
}

/** The link around the caret inside `root`, or null. */
function linkAtCaret(root: HTMLElement): HTMLAnchorElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const node = selection.getRangeAt(0).startContainer;
  const el = node instanceof Element ? node : node.parentElement;
  const link = el?.closest('a') ?? null;
  return link && root.contains(link) ? link : null;
}

// ---------------------------------------------------------------------------------------------
// The caret

/** Where the caret lands on mount: at the client point of the click, at the end, or over everything. */
export type CaretPlacement = { x: number; y: number } | 'end' | 'all';

type CaretDocument = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

/** The collapsed range at a client point inside `element`, through either browser API; null when neither answers inside it. */
function caretRangeAt(x: number, y: number, element: HTMLElement): Range | null {
  const doc = document as CaretDocument;
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);
    if (position && element.contains(position.offsetNode)) {
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    if (range && element.contains(range.startContainer)) return range;
  }
  return null;
}

/** Places the selection inside `element`: at the point when it lands inside, else at the end (or over everything). */
export function placeCaret(element: HTMLElement, caret: CaretPlacement): void {
  const selection = window.getSelection();
  if (!selection) return;
  let range = typeof caret === 'object' ? caretRangeAt(caret.x, caret.y, element) : null;
  if (range === null) {
    range = document.createRange();
    range.selectNodeContents(element);
    if (caret !== 'all') range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/** True when the editable holds no text (the prompt does not count). */
function isEmptyEditable(element: HTMLElement): boolean {
  return textFromNode(element, { multiline: true }).trim() === '';
}

// ---------------------------------------------------------------------------------------------
// The component

/** Why a session ended; the Editor decides what follows (select the block, move to a cell, undo). */
export type InlineTextEndReason =
  | 'escape'
  | 'enter'
  | 'blur'
  | 'tab'
  | 'shift-tab'
  | 'undo'
  | 'redo'
  | 'list-enter'
  | 'list-backspace'
  | 'unmount';

export type InlineTextProps = {
  /** the run element inside the rendered slide; the component makes it editable for its lifetime */
  element: HTMLElement;
  /** the run's box in sheet pixels, for the link popover's place */
  box: Box;
  /** the stage scale */
  k: number;
  /** the pointer takes paragraph breaks (the four multiline pointers, gslides-parity SPEC 7.4) */
  multiline?: boolean;
  /** where the caret lands on mount; the end when absent */
  caret?: CaretPlacement;
  /** open the link popover once the session is up (Cmd K on a selected block) */
  autoLink?: boolean;
  /** one burst: the canonical markup after a 400 ms pause since the last keystroke, when it changed */
  onBurst?: (text: Markup) => void;
  /** the session ended with the final markup (unchanged included) and the key that ended it */
  onEnd: (text: Markup, reason: InlineTextEndReason) => void;
  /** Enter at the end of a one line list item: true when the Editor appends an item and takes over */
  onListEnter?: () => boolean;
  /** Backspace on an empty list item: true when the Editor removes it and takes over */
  onListBackspace?: () => boolean;
  /** called on every input so the Editor can re-measure the run's box */
  onInput?: () => void;
  /** Cmd Z and Cmd Shift Z end the session and run the page's history */
  onUndo?: () => void;
  onRedo?: () => void;
};

/** The link popover sits this many CSS pixels above the run; below it when the run is at the sheet's top. */
const POPOVER_H = 32;
const POPOVER_GAP = 6;

/**
 * The editing session on one run (SPEC 6.4; gslides-parity SPEC 10.2). Mounting makes the
 * element editable, strips the prompt and places the caret; every keystroke restarts the 400 ms
 * burst timer whose tick hands the markup to `onBurst`; Enter breaks a paragraph on a multiline
 * pointer and ends the session elsewhere (a list item asks the Editor to append first); Esc, Tab,
 * a blur outside the popover and Cmd Z end it too, each with its reason; an unmount before the
 * end (the slide changed under the edit) ends it as `unmount`. When the final markup equals the
 * original the run's markup is restored, so no browser artifact survives. One element is one
 * session: the Editor keys the component by the run it edits.
 */
export function InlineText({
  element,
  box,
  k,
  multiline = false,
  caret = 'end',
  autoLink = false,
  onBurst,
  onEnd,
  onListEnter,
  onListBackspace,
  onInput,
  onUndo,
  onRedo,
}: InlineTextProps) {
  const originalHtml = useRef('');
  const originalText = useRef('');
  const lastBurst = useRef('');
  const done = useRef(false);
  const burstTimer = useRef(0);
  const popover = useRef<HTMLDivElement>(null);
  const linkField = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  /* the latest callbacks, so the listeners bound once see them */
  const callbacks = useRef({
    onBurst,
    onEnd,
    onListEnter,
    onListBackspace,
    onInput,
    onUndo,
    onRedo,
  });
  callbacks.current = { onBurst, onEnd, onListEnter, onListBackspace, onInput, onUndo, onRedo };
  const options = useRef({ multiline, caret, autoLink });
  options.current = { multiline, caret, autoLink };

  const readText = (): Markup => textFromNode(element, { multiline: options.current.multiline });

  const flushBurst = () => {
    window.clearTimeout(burstTimer.current);
    burstTimer.current = 0;
    if (done.current) return;
    const text = readText();
    if (text === lastBurst.current) return;
    lastBurst.current = text;
    callbacks.current.onBurst?.(text);
  };

  const scheduleBurst = () => {
    window.clearTimeout(burstTimer.current);
    burstTimer.current = window.setTimeout(flushBurst, TEXT_BURST_MS);
  };

  const finish = (reason: InlineTextEndReason) => {
    if (done.current) return;
    done.current = true;
    window.clearTimeout(burstTimer.current);
    burstTimer.current = 0;
    const text = readText();
    element.removeAttribute('contenteditable');
    element.removeAttribute('spellcheck');
    element.classList.remove('ts-editing');
    /* nothing changed since the render: the rendered markup comes back, browser artifacts gone;
       the prompt of an empty placeholder comes back the same way */
    if (text === originalText.current) element.innerHTML = originalHtml.current;
    callbacks.current.onEnd(text, reason);
  };

  const openLink = () => {
    const link = linkAtCaret(element);
    setLinkValue(link?.getAttribute('href') ?? '');
    setLinkOpen(true);
    window.setTimeout(() => linkField.current?.focus(), 0);
  };

  /* the deferred teardown (see below) and the listener removal it runs */
  const pending = useRef(0);
  const listeners = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    /* React's StrictMode simulates an unmount right after mount (chrome/lib/useMountEffect.ts
       explains the device): the teardown waits one tick, and a re-run inside that tick keeps the
       session instead of restoring the run and starting over. Measured during the M3 integration:
       under the dev server's StrictMode the synchronous cleanup ended every inline edit at once,
       leaving the run editable with no listeners. */
    const later = () => {
      pending.current = window.setTimeout(() => {
        pending.current = 0;
        listeners.current?.();
        listeners.current = null;
        if (!done.current) finish('unmount');
      }, 0);
    };
    if (pending.current) {
      window.clearTimeout(pending.current);
      pending.current = 0;
      return later;
    }
    originalHtml.current = element.innerHTML;
    originalText.current = readText();
    lastBurst.current = originalText.current;
    // the prompt of an empty placeholder is not content: it leaves for the session (SPEC 5.4)
    element.querySelectorAll('[data-prompt]').forEach((prompt) => prompt.remove());
    element.querySelectorAll<HTMLElement>(`.${GT_WORD_CLASS}`).forEach((mark) => {
      mark.contentEditable = 'false';
    });
    element.contentEditable = 'true';
    // the browser's spelling marks stay on (gslides-parity SPEC 7.2.11)
    element.spellcheck = true;
    element.classList.add('ts-editing');
    element.focus({ preventScroll: true });
    placeCaret(element, options.current.caret);
    if (options.current.autoLink) openLink();
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (meta) return;
        // Shift Enter is the same break as Enter (gslides-parity SPEC 0.10)
        if (options.current.multiline) {
          document.execCommand('insertLineBreak');
          scheduleBurst();
          return;
        }
        if (callbacks.current.onListEnter?.() === true) {
          finish('list-enter');
          return;
        }
        finish('enter');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish('escape');
      } else if (e.key === 'Tab' && !meta && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        finish(e.shiftKey ? 'shift-tab' : 'tab');
      } else if (e.key === 'Backspace' && !meta && callbacks.current.onListBackspace) {
        if (isEmptyEditable(element) && callbacks.current.onListBackspace() === true) {
          e.preventDefault();
          finish('list-backspace');
        }
      } else if (meta && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        finish(e.shiftKey ? 'redo' : 'undo');
        if (e.shiftKey) callbacks.current.onRedo?.();
        else callbacks.current.onUndo?.();
      } else if (meta && !e.altKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        e.stopPropagation();
        finish('redo');
        callbacks.current.onRedo?.();
      } else if (meta && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        document.execCommand('bold');
        scheduleBurst();
      } else if (meta && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        openLink();
      }
      /* every key without Cmd, Ctrl or Alt is the run's own (a letter, Backspace, Delete, the
         arrows, Home, End): the browser edits the text and the page's key owners never see it
         (measured on the dev server: the shell's document listener prevented Backspace) */
      if (!meta && !e.altKey) e.stopPropagation();
    };
    const onInputEvent = () => {
      markGtInEditable(element);
      callbacks.current.onInput?.();
      scheduleBurst();
    };
    const onBlur = (e: FocusEvent) => {
      const to = e.relatedTarget;
      if (to instanceof Node && popover.current?.contains(to)) return;
      finish('blur');
    };
    const onPaste = (e: ClipboardEvent) => {
      // pasted text lands as plain text; a line break is a paragraph break on a multiline
      // pointer and a space elsewhere (SPEC 4.2; gslides-parity SPEC 7.4)
      e.preventDefault();
      const raw = e.clipboardData?.getData('text/plain') ?? '';
      const text = options.current.multiline
        ? raw.replace(/\r\n?/g, '\n')
        : raw.replace(/\s*[\n\r]+\s*/g, ' ');
      document.execCommand('insertText', false, text);
    };
    element.addEventListener('keydown', onKey);
    element.addEventListener('input', onInputEvent);
    element.addEventListener('blur', onBlur);
    element.addEventListener('paste', onPaste);
    listeners.current = () => {
      element.removeEventListener('keydown', onKey);
      element.removeEventListener('input', onInputEvent);
      element.removeEventListener('blur', onBlur);
      element.removeEventListener('paste', onPaste);
    };
    return later;
    // one element is one session; finish and openLink read refs and state setters only
  }, [element]);

  const applyLink = () => {
    setLinkOpen(false);
    element.focus();
    const url = linkValue.trim();
    const existing = linkAtCaret(element);
    if (url === '') {
      if (existing) {
        const parent = existing.parentNode;
        while (existing.firstChild) parent?.insertBefore(existing.firstChild, existing);
        existing.remove();
      }
    } else if (existing) {
      existing.setAttribute('href', url);
    } else {
      document.execCommand('createLink', false, url);
    }
    callbacks.current.onInput?.();
    scheduleBurst();
  };

  const onLinkKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyLink();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setLinkOpen(false);
      element.focus();
    }
  };

  if (!linkOpen) return null;
  const above = box[1] * k - POPOVER_H - POPOVER_GAP;
  const style = {
    left: Math.max(0, box[0] * k),
    top: above >= 0 ? above : (box[1] + box[3]) * k + POPOVER_GAP,
  };
  return (
    <div ref={popover} className="ts-link-pop" role="dialog" aria-label="Link" style={style}>
      <input
        ref={linkField}
        className="ts-run-link"
        type="url"
        value={linkValue}
        placeholder="https://"
        aria-label="Link"
        data-tip="Link"
        data-control="run.link.href"
        onChange={(e) => setLinkValue(e.target.value)}
        onKeyDown={onLinkKey}
        onBlur={applyLink}
      />
    </div>
  );
}
