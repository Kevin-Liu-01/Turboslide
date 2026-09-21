import type { FocusEvent, KeyboardEvent, MouseEvent, ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';

import './Tooltip.css';

/**
 * The one tooltip of the chrome (Kevin's directive of this round: "have good tooltips in all
 * control surfaces"). A paper plate on the hair edge at 12.5 px carrying the control's name, one
 * sentence on what it does and its key as a kbd chip, 6 px from the control, shown after 350 ms
 * of hover and at once on keyboard focus, hidden on Escape, on a press, on scroll and when the
 * pointer leaves. One tooltip exists at a time: a module-level manager owns one `div.pt-tip` on
 * the body, so a second anchor replaces the first instead of stacking, and while one is up the
 * next anchor shows at once. It is never clipped: the plate sits below the control, moves above
 * it when the viewport ends first, and is clamped 8 px inside both edges. Reduced motion drops
 * the fade (tokens.css also zeroes the duration). The layer is imperative, not a portal, so any
 * component, ported or new, attaches it through `tipProps` without a provider, and the text is
 * written with textContent, never markup.
 *
 * Where a tooltip does not fire (docs/PRODUCT.md 3.1.1; audit-interface 4): on keyboard focus
 * inside a menu, a right click menu or a dialog, because the first row of every menu and the
 * autofocused control of every dialog took focus on open and drew a plate over the rows and the
 * card under them; hover alone shows a tooltip there. The toolbar and the title row keep their
 * focus tooltips, where a keyboard user needs the name.
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

/** The plate stays this far inside the viewport. */
const VIEWPORT_MARGIN = 8;

/** A press on the anchor within this window keeps the focus that follows it from showing the tip. */
const PRESS_GRACE_MS = 400;

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
/* the anchor last pressed by the pointer and when, so the focus a click gives shows no tip */
let pressed: { anchor: HTMLElement; at: number } | null = null;

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
  el.className = 'pt-tip';
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
    kbd.className = 'pt-tip-key';
    kbd.textContent = content.key;
    head.appendChild(kbd);
  }
  el.appendChild(head);
  if (content.doc !== undefined && content.doc !== '') {
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

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** Below the control, centered; above it when the viewport ends first; clamped inside both edges. */
function place(el: HTMLElement, anchor: HTMLElement): void {
  const rect = anchorBox(anchor);
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  let top = rect.bottom + TIP_OFFSET_PX;
  let placement: 'below' | 'above' = 'below';
  if (
    top + height > viewportHeight - VIEWPORT_MARGIN &&
    rect.top - TIP_OFFSET_PX - height >= VIEWPORT_MARGIN
  ) {
    top = rect.top - TIP_OFFSET_PX - height;
    placement = 'above';
  }
  top = clamp(top, VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - height);
  const left = clamp(
    rect.left + rect.width / 2 - width / 2,
    VIEWPORT_MARGIN,
    viewportWidth - VIEWPORT_MARGIN - width,
  );
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.dataset.place = placement;
}

function onDocumentKey(event: globalThis.KeyboardEvent): void {
  if (event.key === 'Escape') hideTooltip();
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
  place(el, anchor);
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
  if (layer !== null) layer.hidden = true;
  unlisten();
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
  onMouseLeave: (event: MouseEvent<HTMLElement>) => void;
  onMouseDown: (event: MouseEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

/**
 * True when the focus came from the keyboard: no pointer press on the anchor inside the grace
 * window. A click fires mousedown before focus, so the press is what tells the two apart; the
 * engine's :focus-visible is not consulted because a synthetic focus (a test, a script) has none.
 */
function keyboardFocus(anchor: HTMLElement): boolean {
  return !(
    pressed !== null &&
    pressed.anchor === anchor &&
    Date.now() - pressed.at < PRESS_GRACE_MS
  );
}

/**
 * The handlers and the `data-tip` mark for one control. Not a hook: the manager holds the state,
 * so a component may call it conditionally and spread the result on any element. A component
 * with handlers of its own for the same events calls both (`mergeHandlers` below does it for the
 * Tooltip wrapper).
 */
export function tipProps(input: TipInput, label?: string): TipAnchorProps {
  const content = tipOf(input, label);
  return {
    'data-tip': content.name,
    onMouseEnter: (event) => scheduleTooltip(event.currentTarget, content),
    onMouseLeave: (event) => hideTooltip(event.currentTarget),
    onMouseDown: (event) => {
      pressed = { anchor: event.currentTarget, at: Date.now() };
      hideTooltip();
    },
    onFocus: (event) => {
      if (quietOnFocus(event.currentTarget)) return;
      if (keyboardFocus(event.currentTarget)) showTooltip(event.currentTarget, content);
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
