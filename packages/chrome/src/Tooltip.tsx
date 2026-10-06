import type { FocusEvent, KeyboardEvent, MouseEvent, ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';

import { closeLayer, openLayer } from './Layer';
import { place } from './place';

import './Tooltip.css';

/**
 * The one tooltip of the chrome (Kevin's directive of this round: "have good tooltips in all
 * control surfaces"). A paper plate (`.pt-float`: the --pt-edge frame, the 6 px corner and the
 * ring of docs/DESIGN.md 3.2) at 12.5 px carrying the control's name, one
 * sentence on what it does and its key as a kbd chip, 6 px from the control, shown after 350 ms
 * of hover and at once on keyboard focus, hidden on Escape, on a press, on scroll and when the
 * pointer leaves. One tooltip exists at a time: a module-level manager owns one `div.pt-tip` on
 * the body, so a second anchor replaces the first instead of stacking, and while one is up the
 * next anchor shows at once. It is never clipped: the plate sits in the tooltip layer of the
 * stacking scale, in the browser's top layer (Layer.ts; docs/DESIGN.md 2.3), below the control,
 * moves above it when the viewport ends first, and is kept 8 px inside both edges (place.ts). Reduced motion drops
 * the fade (tokens.css also zeroes the duration). The layer is imperative, not a portal, so any
 * component, ported or new, attaches it through `tipProps` without a provider, and the text is
 * written with textContent, never markup.
 *
 * Where a tooltip does not fire (docs/archive/rounds/PRODUCT.md 3.1.1; audit-interface 4): on keyboard focus
 * inside a menu, a right click menu or a dialog, because the first row of every menu and the
 * autofocused control of every dialog took focus on open and drew a plate over the rows and the
 * card under them; hover alone shows a tooltip there. The toolbar and the title row keep their
 * focus tooltips, where a keyboard user needs the name.
 *
 * A tooltip is shown only where a person asked for it (docs/archive/rounds/POLISH.md 2.6 item 61). The manager
 * records the last input of each kind anywhere in the document: the pointer's last movement and
 * its last movement to a new point, the last press, the last navigation key and the last return
 * (Escape, Enter, or a menu opening or a dialog closing, which call `hideTooltipUntilInput`). A
 * mouseenter shows a tooltip only when the pointer moved recently and its last movement to a new
 * point is newer than every press, key and return: a control that moved under a resting pointer
 * (a menu closed over the toolbar, the edge "+" of a table moved a seam under the pointer) shows
 * nothing until the pointer moves again, and a mousemove at the pointer's last point (the
 * browser's own after a layout change) does not arm it. A focus shows a tooltip unless a press or
 * a return is newer than the last navigation key: the focus a click gives and the focus a dialog
 * or a menu returns to its opener show nothing; a Tab or an arrow shows the name at once.
 *
 * Contract for every control surface: the anchor carries `data-tip` (the name), which
 * scripts/tooltip-audit.mjs reads to find interactive elements that have none; the anchor also
 * carries `aria-describedby="pt-tip"` while its tooltip is up. New in Turboslide (no Prototemplate
 * source).
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

/** Inside these surfaces a tooltip shows on hover alone, never on keyboard focus (3.1.1). */
export const QUIET_FOCUS_SURFACES = '.ts-menu, .ts-context-menu, [role="dialog"]';

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

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
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

/** Shows the tooltip for an anchor now, replacing whatever is up. */
export function showTooltip(anchor: HTMLElement, content: TipContent): void {
  cancelPending();
  if (!anchor.isConnected) return;
  const el = ensureLayer();
  if (shown !== null && shown.anchor !== anchor) shown.anchor.removeAttribute('aria-describedby');
  shown = { anchor, content };
  renderContent(el, content);
  el.dataset.motion = reducedMotion() ? 'none' : 'fade';
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
// Attaching: the props an anchor spreads.

export type TipAnchorProps = {
  'data-tip': string;
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  onMouseMove: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave: (event: MouseEvent<HTMLElement>) => void;
  onMouseDown: (event: MouseEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

/**
 * The handlers and the `data-tip` mark for one control. Not a hook: the manager holds the state,
 * so a component may call it conditionally and spread the result on any element. A component
 * with handlers of its own for the same events calls both (`mergeHandlers` below does it for the
 * Tooltip wrapper).
 */
export function tipProps(input: TipInput, label?: string): TipAnchorProps {
  const content = tipOf(input, label);
  watch();
  return {
    'data-tip': content.name,
    /* a tip after the pointer's own arrival; a control that moved under a resting pointer, or
       landed under it after a click or a key, waits for the next movement over it (item 61) */
    onMouseEnter: (event) => {
      if (pointerArrived()) scheduleTooltip(event.currentTarget, content);
    },
    onMouseMove: (event) => {
      const anchor = event.currentTarget;
      if (shown?.anchor === anchor || pending?.anchor === anchor) return;
      if (pointerArrived()) scheduleTooltip(anchor, content);
    },
    onMouseLeave: (event) => hideTooltip(event.currentTarget),
    /* the document listener above records the press; the plate hides at once */
    onMouseDown: () => hideTooltip(),
    onFocus: (event) => {
      if (quietOnFocus(event.currentTarget)) return;
      if (keyboardFocus()) showTooltip(event.currentTarget, content);
    },
    onBlur: (event) => hideTooltip(event.currentTarget),
    onKeyDown: (event) => {
      if (event.key === 'Escape') hideTooltip();
    },
  };
}

type Handler<TEvent> = ((event: TEvent) => void) | undefined;

function both<TEvent>(first: Handler<TEvent>, second: Handler<TEvent>): (event: TEvent) => void {
  return (event) => {
    first?.(event);
    second?.(event);
  };
}

type AnchorLike = Partial<TipAnchorProps> & Record<string, unknown>;

/** The tip props merged over an element's own: both handlers run, the element's first. */
export function mergeTipProps(own: AnchorLike, tip: TipAnchorProps): AnchorLike {
  return {
    ...own,
    'data-tip': tip['data-tip'],
    onMouseEnter: both(own.onMouseEnter, tip.onMouseEnter),
    onMouseMove: both(own.onMouseMove, tip.onMouseMove),
    onMouseLeave: both(own.onMouseLeave, tip.onMouseLeave),
    onMouseDown: both(own.onMouseDown, tip.onMouseDown),
    onFocus: both(own.onFocus, tip.onFocus),
    onBlur: both(own.onBlur, tip.onBlur),
    onKeyDown: both(own.onKeyDown, tip.onKeyDown),
  };
}

export type TooltipProps = {
  content: TipInput;
  /** the control's word, used as the name when `content` is a title-like string */
  label?: string;
  children: ReactNode;
};

/**
 * Attaches the tooltip to one child. A DOM element child (a `<button>`, an `<input>`, a
 * `<label>`) receives the handlers directly, its own handlers kept; a component child is wrapped
 * in a `span.pt-tip-anchor` with `display: contents`, which takes part in the DOM tree but draws
 * no box, so mouseenter and focus events from the child reach it and the plate is placed against
 * the child's box.
 */
export function Tooltip({ content, label, children }: TooltipProps) {
  const props = tipProps(content, label);
  if (isValidElement(children) && typeof children.type === 'string') {
    const child = children as ReactElement<AnchorLike>;
    return cloneElement(child, mergeTipProps(child.props, props));
  }
  return (
    <span className="pt-tip-anchor" {...props}>
      {children}
    </span>
  );
}
