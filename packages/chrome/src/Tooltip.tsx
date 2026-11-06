import type { FocusEvent, KeyboardEvent, MouseEvent, ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';

import { tipHandlers, tipOf } from './tip';
import type { TipInput } from './tip';

import './Tooltip.css';

// The manager moved to tip.ts, plain DOM, so a page that runs no React attaches the same tooltip
// (`attachTip`); its names stay importable from this module, where every caller found them.
export {
  QUIET_FOCUS_SURFACES,
  TIP_DELAY_MS,
  TIP_ID,
  TIP_OFFSET_PX,
  hideTooltip,
  hideTooltipUntilInput,
  isKeyLike,
  quietOnFocus,
  resetTooltipTiming,
  scheduleTooltip,
  sentence,
  showTooltip,
  shownTooltipAnchor,
  tipOf,
} from './tip';
export type { TipContent, TipInput } from './tip';

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
  const on = tipHandlers(content);
  return {
    'data-tip': content.name,
    onMouseEnter: (event) => on.enter(event.currentTarget),
    onMouseMove: (event) => on.move(event.currentTarget),
    onMouseLeave: (event) => on.leave(event.currentTarget),
    onMouseDown: () => on.press(),
    onFocus: (event) => on.focus(event.currentTarget),
    onBlur: (event) => on.blur(event.currentTarget),
    onKeyDown: (event) => on.key(event.key),
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
