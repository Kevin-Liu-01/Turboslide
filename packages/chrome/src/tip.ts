import { motionReduced } from '@turboslide/viewer/reduce-motion';

import { tooltipsHidden } from './chrome-preferences';
import { closeLayer, openLayer } from './top-layer';
import { place } from './place';

/**
 * The tooltip manager of the chrome, plain DOM (Tooltip.tsx says what the tooltip is and where it
 * shows; its sheet, Tooltip.css, comes with that module): the content, the one layer, the input
 * record and the handlers an anchor runs. React components spread `tipProps` (Tooltip.tsx); a page
 * whose markup came from the server and runs no React attaches the same handlers with `attachTip`
 * (/home's static script, apps/studio/src/components/site/home-entry.ts).
 */
export type TipContent = {
  /** the control's name, in the display face */
  name: string;
  /** one sentence on what the control does */
  doc?: string;
  /** the key, as words: `D`, `Cmd K`, `Shift D`, `left arrow` */
  key?: string;
};

/** A title-like string (`'Dark or light (D)'`) or the content spelled out. */
export type TipInput = string | TipContent;

/** How long the pointer rests on a control before its tooltip shows. */
export const TIP_DELAY_MS = 350;

/** The gap between the control and the plate. */
export const TIP_OFFSET_PX = 6;

/** The id the one layer carries; anchors point at it with aria-describedby. */
export const TIP_ID = 'pt-tip';

/**
 * A pointer that entered a control without moving within this window is a resting pointer: the
 * control moved under it (a menu closed, a panel opened), and no tip shows until it moves
 * (docs/archive/rounds/POLISH.md 2.6 item 61; audit-media item 15: the toolbar's Image tip opened under the
 * resting pointer when the Insert menu closed and stayed through the upload).
 */
const REST_MS = 500;

/**
 * Inside these surfaces a tooltip shows on hover alone, never on keyboard focus (3.1.1). A menu
 * is named by its role as well as by the two classes: the Insert menu, the collaborators and
 * account menus (presence/PlateMenu.tsx) and the outline's row menu carry `role="menu"` and
 * neither class, and each arrow key drew the focused row's plate over the rows under it.
 */
export const QUIET_FOCUS_SURFACES =
  '.ts-menu, .ts-context-menu, [role="menu"], [role="dialog"], [role="alertdialog"]';

/** True when a focus on the anchor must not show its tooltip: the anchor sits in a menu or a dialog. */
export function quietOnFocus(anchor: HTMLElement): boolean {
  return anchor.closest(QUIET_FOCUS_SURFACES) !== null;
}

/* the words a key chip may be made of, beyond single characters and F keys */
const KEY_WORDS = new Set([
  'cmd',
  'ctrl',
  'shift',
  'alt',
  'option',
  'enter',
  'esc',
  'escape',
  'tab',
  'space',
  'delete',
  'backspace',
  'home',
  'end',
  'up',
  'down',
  'left',
  'right',
  'arrow',
  'arrows',
  'page',
  'or',
  'and',
  'then',
  'digits',
  'click',
]);

/** True for a parenthetical that names a key (`D`, `Cmd K or Ctrl K`, `left arrow`), not a note. */
export function isKeyLike(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.length > 24 || trimmed.includes(',')) return false;
  return trimmed.split(/\s+/).every((token) => {
    const word = token.toLowerCase();
    return word.length <= 2 || KEY_WORDS.has(word) || /^f\d{1,2}$/.test(word);
  });
}

/** One sentence: a capital first letter and a period at the end. */
export function sentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

/**
 * The tooltip content of a title-like string. `'Dark or light (D)'` reads the trailing
 * parenthetical as the key when it looks like one; with a label (the button's word or its
 * accessible name) the label is the name and the title's body the sentence, so
 * `label="Twin" title="Light and dark side by side (Shift D)"` reads Twin, the sentence, Shift D.
 */
export function tipOf(input: TipInput, label?: string): TipContent {
  if (typeof input !== 'string') return input;
  const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(input);
  const tail = match?.[2]?.trim();
  const key = match !== null && tail !== undefined && isKeyLike(tail) ? tail : undefined;
  const body = (key !== undefined && match !== null ? (match[1] ?? '') : input).trim();
  const name = label !== undefined && label.trim() !== '' ? label.trim() : body;
  const content: TipContent = { name };
  if (body !== '' && body.toLowerCase() !== name.toLowerCase()) content.doc = sentence(body);
  if (key !== undefined) content.key = key;
  return content;
}

// ---------------------------------------------------------------------------------------------
// The manager: one layer, one shown anchor, one pending timer.

type Shown = { anchor: HTMLElement; content: TipContent };

let layer: HTMLDivElement | null = null;
let shown: Shown | null = null;
let pending: { anchor: HTMLElement; timer: number } | null = null;
let listening = false;
let watching = false;

/* The last input of each kind anywhere in the document (item 61), ordered by one counter (two
   inputs in the same millisecond keep their order, which a clock would not give them). A
   mouseenter shows a tooltip only when the pointer's own movement to a new point is the newest of
   them and the pointer moved recently; a focus unless a press or a return is newer than the last
   navigation key. */
let inputSeq = 0;
function nextInput(): number {
  inputSeq += 1;
  return inputSeq;
}
/* when the pointer last moved at all, for the rest window */
let lastMoveAt = -Infinity;
/* the pointer's last point and the input at which it last reached a new one: a mousemove at the
   same point is the browser's own after a layout change (a seam re-drawn under the pointer), not
   the person's */
let lastPoint: { x: number; y: number } | null = null;
let lastNewPointSeq = 0;
/* the last mousedown anywhere: the focus a click gives, and a control that lands under the
   pointer after a click (the edge "+" moves a seam under it), show no tip */
let lastPressSeq = 0;
/* the last key other than Escape and Enter: Tab and the arrows move the focus by hand */
let lastNavKeySeq = 0;
/* the last return: Escape or Enter (the palette or a dialog closed), or a menu opening or a
   dialog closing through hideTooltipUntilInput; a focus or an enter after it shows nothing */
let lastReturnSeq = 0;

/** The always on document listeners that record the last input of each kind. */
function watch(): void {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  document.addEventListener(
    'mousemove',
    (event) => {
      lastMoveAt = Date.now();
      if (lastPoint !== null && lastPoint.x === event.clientX && lastPoint.y === event.clientY)
        return;
      lastPoint = { x: event.clientX, y: event.clientY };
      lastNewPointSeq = nextInput();
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    'mousedown',
    () => {
      lastPressSeq = nextInput();
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' || event.key === 'Enter') lastReturnSeq = nextInput();
      else lastNavKeySeq = nextInput();
    },
    true,
  );
}

/** Forgets the recorded inputs, for tests that share the module between cases. */
export function resetTooltipTiming(): void {
  lastMoveAt = -Infinity;
  lastPoint = null;
  lastNewPointSeq = 0;
  lastPressSeq = 0;
  lastNavKeySeq = 0;
  lastReturnSeq = 0;
}

/**
 * True when a mouseenter or a mousemove on a control is the pointer's own arrival: the pointer
 * moved within the rest window, and its last movement to a new point is newer than every press,
 * key and return. False for a control that moved under a resting pointer, or that landed under
 * it after a click or a key while only the browser's own mousemove followed.
 */
function pointerArrived(): boolean {
  if (Date.now() - lastMoveAt > REST_MS) return false;
  return (
    lastNewPointSeq > lastPressSeq &&
    lastNewPointSeq > lastNavKeySeq &&
    lastNewPointSeq > lastReturnSeq
  );
}

/**
 * True when a focus on a control may show its tooltip: no press and no return is newer than the
 * last navigation key. The focus a click gives (the press is newer) and the focus a close returns
 * (the return is newer) show no tooltip; a Tab or an arrow, or a focus with no input recorded at
 * all, shows it. The engine's :focus-visible is not consulted because a synthetic focus (a test, a
 * script) has none.
 */
function keyboardFocus(): boolean {
  return lastPressSeq <= lastNavKeySeq && lastReturnSeq <= lastNavKeySeq;
}

function ensureLayer(): HTMLDivElement {
  if (layer !== null && layer.isConnected) return layer;
  const el = document.createElement('div');
  /* the small floating plate of tokens.css: paper, the --pt-edge frame, the 6 px corner and the
     ring (docs/DESIGN.md 3.2) */
  el.className = 'pt-tip pt-float';
  el.id = TIP_ID;
  el.setAttribute('role', 'tooltip');
  el.hidden = true;
  document.body.appendChild(el);
  layer = el;
  return el;
}

function renderContent(el: HTMLElement, content: TipContent): void {
  el.replaceChildren();
  const head = document.createElement('span');
  head.className = 'pt-tip-head';
  const name = document.createElement('b');
  name.className = 'pt-tip-name';
  name.textContent = content.name;
  head.appendChild(name);
  if (content.key !== undefined && content.key !== '') {
    const kbd = document.createElement('kbd');
    kbd.className = 'pt-tip-key pt-kbd';
    kbd.textContent = content.key;
    head.appendChild(kbd);
  }
  el.appendChild(head);
  if (content.doc !== undefined && content.doc !== '') {
    /* a space between the head and the sentence, so the plate's text and its accessible
       description read "Column seam 2 Drag to resize the column", not "Column seam 2Drag" (the
       walk's tooltip reads match the name at a word boundary); the span draws on its own line */
    el.appendChild(document.createTextNode(' '));
    const doc = document.createElement('span');
    doc.className = 'pt-tip-doc';
    doc.textContent = content.doc;
    el.appendChild(doc);
  }
}

/** The box the plate is placed against: the anchor's, or its first child's when the anchor draws none (display: contents). */
function anchorBox(anchor: HTMLElement): DOMRect {
  const rect = anchor.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) return rect;
  const child = anchor.firstElementChild;
  return child instanceof HTMLElement ? child.getBoundingClientRect() : rect;
}

/* the placement of the shown plate: below the control, centred, flipped above when the window
   ends first and kept 8 px inside both edges, through the one place() of the chrome
   (docs/DESIGN.md 2.4); the plate hides on a scroll or a resize, so it is placed once */
let stopPlacing: (() => void) | null = null;

function placeTip(el: HTMLElement, anchor: HTMLElement): void {
  stopPlacing?.();
  stopPlacing = place(
    { getBoundingClientRect: () => anchorBox(anchor), contextElement: anchor },
    el,
    { side: 'below', align: 'center', gap: TIP_OFFSET_PX, follow: false },
  );
}

/* any key hides the tip (item 61): the seller has moved on from the control under the pointer */
function onDocumentKey(_event: globalThis.KeyboardEvent): void {
  hideTooltip();
}

function onDocumentPress(): void {
  hideTooltip();
}

function listen(): void {
  if (listening) return;
  listening = true;
  document.addEventListener('keydown', onDocumentKey, true);
  document.addEventListener('mousedown', onDocumentPress, true);
  document.addEventListener('scroll', onDocumentPress, { capture: true, passive: true });
  window.addEventListener('resize', onDocumentPress);
  window.addEventListener('blur', onDocumentPress);
}

function unlisten(): void {
  if (!listening) return;
  listening = false;
  document.removeEventListener('keydown', onDocumentKey, true);
  document.removeEventListener('mousedown', onDocumentPress, true);
  document.removeEventListener('scroll', onDocumentPress, true);
  window.removeEventListener('resize', onDocumentPress);
  window.removeEventListener('blur', onDocumentPress);
}

function cancelPending(): void {
  if (pending === null) return;
  window.clearTimeout(pending.timer);
  pending = null;
}

/*
 * Tools > Preferences > Show tooltips (the Glyphfield port, PLAN.md wave 1 item 7): while it is
 * off the root carries `data-hide-tooltips` (chrome-preferences.ts; the studio root's boot script
 * stamps it on every route, the editor on its toggle) and the manager shows no plate. `data-tip`,
 * the accessible names and the tooltip audit stay.
 */

/** Shows the tooltip for an anchor now, replacing whatever is up. */
export function showTooltip(anchor: HTMLElement, content: TipContent): void {
  cancelPending();
  if (tooltipsHidden() || !anchor.isConnected) return;
  const el = ensureLayer();
  if (shown !== null && shown.anchor !== anchor) shown.anchor.removeAttribute('aria-describedby');
  shown = { anchor, content };
  renderContent(el, content);
  el.dataset.motion = motionReduced() ? 'none' : 'fade';
  el.hidden = false;
  /* the tooltip layer of the stacking scale, in the top layer over every other surface but the
     hover preview (docs/DESIGN.md 2.2, 2.3) */
  openLayer(el, 'tooltip');
  placeTip(el, anchor);
  anchor.setAttribute('aria-describedby', TIP_ID);
  listen();
}

/** Hides the tooltip; with an anchor, only when that anchor's tooltip is the one up or pending. */
export function hideTooltip(anchor?: HTMLElement): void {
  if (pending !== null && (anchor === undefined || pending.anchor === anchor)) cancelPending();
  if (shown === null) return;
  if (anchor !== undefined && shown.anchor !== anchor) return;
  shown.anchor.removeAttribute('aria-describedby');
  shown = null;
  stopPlacing?.();
  stopPlacing = null;
  if (layer !== null) {
    closeLayer(layer);
    layer.hidden = true;
  }
  unlisten();
}

/**
 * Hides the tooltip and shows none until the person's next input: the surface under the pointer
 * or the focus is about to change without them (a menu opens, a dialog closes and returns the
 * focus to its opener), so the mouseenter and the focus that follow are not theirs (item 61: the
 * "Format menu" plate over the toolbar after a dialog closed on a click). The next pointer
 * movement to a new point or the next navigation key arms the tooltip again.
 */
export function hideTooltipUntilInput(): void {
  hideTooltip();
  lastReturnSeq = nextInput();
}

/**
 * Shows after the hover delay, or at once while another tooltip is already up (one at a time:
 * the reader is walking a toolbar and the second plate should not make them wait again).
 */
export function scheduleTooltip(anchor: HTMLElement, content: TipContent): void {
  if (tooltipsHidden()) return;
  if (shown !== null && shown.anchor === anchor) return;
  if (shown !== null) {
    showTooltip(anchor, content);
    return;
  }
  cancelPending();
  pending = {
    anchor,
    timer: window.setTimeout(() => {
      pending = null;
      showTooltip(anchor, content);
    }, TIP_DELAY_MS),
  };
}

/** The anchor whose tooltip is up, for tests and the audit. */
export function shownTooltipAnchor(): HTMLElement | null {
  return shown?.anchor ?? null;
}

// ---------------------------------------------------------------------------------------------
// The handlers an anchor runs, for `tipProps` and `attachTip`.

/** What an anchor does on each event; `tipProps` spreads them as React props, `attachTip` listens. */
type TipHandlers = {
  enter: (anchor: HTMLElement) => void;
  move: (anchor: HTMLElement) => void;
  leave: (anchor: HTMLElement) => void;
  press: () => void;
  focus: (anchor: HTMLElement) => void;
  blur: (anchor: HTMLElement) => void;
  key: (key: string) => void;
};

/** The handlers of one anchor's content; the document's input record starts listening here. */
export function tipHandlers(content: TipContent): TipHandlers {
  watch();
  return {
    /* a tip after the pointer's own arrival; a control that moved under a resting pointer, or
       landed under it after a click or a key, waits for the next movement over it (item 61) */
    enter: (anchor) => {
      if (pointerArrived()) scheduleTooltip(anchor, content);
    },
    move: (anchor) => {
      if (shown?.anchor === anchor || pending?.anchor === anchor) return;
      if (pointerArrived()) scheduleTooltip(anchor, content);
    },
    leave: (anchor) => hideTooltip(anchor),
    /* the document listener above records the press; the plate hides at once */
    press: () => hideTooltip(),
    focus: (anchor) => {
      if (quietOnFocus(anchor)) return;
      if (keyboardFocus()) showTooltip(anchor, content);
    },
    blur: (anchor) => hideTooltip(anchor),
    key: (key) => {
      if (key === 'Escape') hideTooltip();
    },
  };
}

/**
 * The tooltip of an element the server drew, for a page that runs no React: writes `data-tip` and
 * listens for what `tipProps` handles, and returns what stops it.
 */
export function attachTip(anchor: HTMLElement, input: TipInput, label?: string): () => void {
  const content = tipOf(input, label);
  const on = tipHandlers(content);
  anchor.dataset.tip = content.name;
  const enter = (): void => on.enter(anchor);
  const move = (): void => on.move(anchor);
  const leave = (): void => on.leave(anchor);
  const press = (): void => on.press();
  const focus = (): void => on.focus(anchor);
  const blur = (): void => on.blur(anchor);
  const key = (event: KeyboardEvent): void => on.key(event.key);
  anchor.addEventListener('mouseenter', enter);
  anchor.addEventListener('mousemove', move);
  anchor.addEventListener('mouseleave', leave);
  anchor.addEventListener('mousedown', press);
  anchor.addEventListener('focus', focus);
  anchor.addEventListener('blur', blur);
  anchor.addEventListener('keydown', key);
  return () => {
    anchor.removeEventListener('mouseenter', enter);
    anchor.removeEventListener('mousemove', move);
    anchor.removeEventListener('mouseleave', leave);
    anchor.removeEventListener('mousedown', press);
    anchor.removeEventListener('focus', focus);
    anchor.removeEventListener('blur', blur);
    anchor.removeEventListener('keydown', key);
    hideTooltip(anchor);
  };
}
