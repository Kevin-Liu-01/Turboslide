import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { LiveClone } from '@turboslide/viewer/LiveClone';
import { useTheme } from '@turboslide/viewer/theme';

import { cn } from './lib/cn';
import { useMountEffect } from './lib/useMountEffect';

import './PreviewLayer.css';

/**
 * The one preview layer (directive 8.6; SPEC 2.2: one delegated layer at
 * the shell root, a 320 by 180 capture after 80ms of hover or at once on
 * focus, a 120ms grace before hiding, one eased 160ms move between rows).
 * Ported from Prototemplate/src/components/viewer/PreviewLayer.tsx and
 * adapted for M1: the subject is a live clone of the slide's rendered HTML
 * instead of a decoded capture, so the image cache, the preload observers
 * and the crossfade of the source are gone; the render worker's thumbnails
 * bring them back in M3 (SPEC 5.5). Any element carrying
 * data-preview="<slideId>" opens the card beside it: the sidebar's rows, the
 * grid's captions, the book's page numbers and the toolbar's count all carry
 * the attribute and draw nothing of their own.
 *
 * Mechanics. Four delegated listeners on the document (mouseover, mouseout,
 * focusin, focusout), never one per item. The card is one fixed element in
 * a portal at the end of the body, positioned with translate3d alone and
 * clamped to the viewport. Beside a list it sits 8px outside the list's
 * edge with its top on the row's top; its place is computed once per row.
 * While it is open, a hover on another row moves it there in one eased
 * transition (.is-moving), the name and clone changing at once. Leaving
 * every row starts a 120ms grace before the card hides; re-entering inside
 * the grace cancels the hide. A touch screen never opens a preview from a
 * pointer, only from focus; a pointer press, Escape, a resize or a hidden
 * tab closes it; a scroll with the pointer still resting on the row moves
 * the card with the row, a scroll that leaves no row under the pointer
 * closes it.
 */
export type PreviewSubject = { name: string; html: string };

export type PreviewLayerProps = {
  /** the subject a data-preview id names, or null for none */
  resolve: (id: string) => PreviewSubject | null;
};

/** How long an element is hovered before its preview opens. */
export const PREVIEW_DELAY_MS = 80;

/** how long the card stays after the pointer has left every row */
const GRACE_MS = 120;

/** The card's box: a 1px mat around a 320x180 frame and a 32px title row. */
const CARD_W = 322;
const CARD_H = 214;

/** the card's distance from the element's list and from the viewport edges */
const GAP = 8;

type Place = { x: number; y: number };

/**
 * Where the card goes. Beside a list (the sidebar) it sits 8px outside the
 * list's edge, to the right unless that does not fit, with its top on the
 * row's top; elsewhere (the toolbar count, a grid caption, a book page
 * number) it hangs under the element, or above it when there is no room
 * below. Always inside the viewport.
 */
function placeFor(el: HTMLElement): Place {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const box = el.closest<HTMLElement>('.pt-sb');
  let x: number;
  let y: number;
  if (box) {
    const b = box.getBoundingClientRect();
    x = b.right + GAP;
    if (x + CARD_W > vw - GAP) x = b.left - GAP - CARD_W;
    y = rect.top;
  } else {
    x = rect.left;
    y = rect.bottom + GAP;
    if (y + CARD_H > vh - GAP) y = rect.top - GAP - CARD_H;
  }
  x = Math.max(GAP, Math.min(vw - CARD_W - GAP, x));
  y = Math.max(GAP, Math.min(vh - CARD_H - GAP, y));
  return { x: Math.round(x), y: Math.round(y) };
}

/** True on a device with a hovering, fine pointer. A touch screen previews from focus alone. */
function canHover(): boolean {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
}

function previewTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('[data-preview]');
}

/** True when the element took focus from the keyboard, not from a click. */
function focusVisible(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * The card's state. It outlives its own closing: `on` false keeps the last
 * place, name and clone through the fade out, so the card never fades out
 * empty or at the viewport origin. `moved` is true once the card has moved
 * between rows while open, which turns the transform transition on.
 */
type Card = PreviewSubject & Place & { id: string; moved: boolean; on: boolean };

export function PreviewLayer({ resolve }: PreviewLayerProps) {
  const theme = useTheme();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  /* the element the card is for (or about to be for), read by the listeners */
  const anchor = useRef<HTMLElement | null>(null);
  /* the element the card is open for; null while closed or still arming */
  const shown = useRef<HTMLElement | null>(null);
  const moved = useRef(false);
  const openTimer = useRef(0);
  const hideTimer = useRef(0);

  useMountEffect(() => {
    setHost(document.body);
    const hover = canHover();

    const cancelArm = () => {
      if (openTimer.current) {
        window.clearTimeout(openTimer.current);
        openTimer.current = 0;
      }
    };

    const clearHide = () => {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = 0;
      }
    };

    /* the card goes off; it keeps its place and content for the fade out */
    const hide = () => {
      shown.current = null;
      moved.current = false;
      setCard((prev) => (prev ? { ...prev, on: false } : null));
    };

    const close = () => {
      cancelArm();
      clearHide();
      anchor.current = null;
      hide();
    };

    /* open the card for `el`, or move it there when it is already open */
    const show = (el: HTMLElement) => {
      if (!el.isConnected) {
        close();
        return;
      }
      const id = el.dataset.preview;
      const subject = id ? resolveRef.current(id) : null;
      if (!id || !subject) {
        close();
        return;
      }
      if (shown.current && shown.current !== el) moved.current = true;
      anchor.current = el;
      shown.current = el;
      const place = placeFor(el);
      setCard({ ...subject, ...place, id, moved: moved.current, on: true });
    };

    const arm = (el: HTMLElement) => {
      cancelArm();
      anchor.current = el;
      openTimer.current = window.setTimeout(() => {
        openTimer.current = 0;
        show(el);
      }, PREVIEW_DELAY_MS);
    };

    /* the pointer has left every row: an open card waits out the grace, an arming one lets go now */
    const leave = () => {
      if (shown.current) {
        if (!hideTimer.current) {
          hideTimer.current = window.setTimeout(() => {
            hideTimer.current = 0;
            close();
          }, GRACE_MS);
        }
        return;
      }
      cancelArm();
      anchor.current = null;
    };

    const onOver = (event: MouseEvent) => {
      if (!hover) return;
      const el = previewTarget(event.target);
      if (el) {
        clearHide();
        if (el === anchor.current) return;
        if (shown.current) {
          cancelArm();
          show(el);
        } else {
          arm(el);
        }
        return;
      }
      if (anchor.current) leave();
    };

    const onOut = (event: MouseEvent) => {
      const current = anchor.current;
      if (!current || !hover) return;
      const to = event.relatedTarget;
      if (to instanceof Node && current.contains(to)) return;
      if (previewTarget(event.target) !== current) return;
      leave();
    };

    const onFocusIn = (event: FocusEvent) => {
      const el = previewTarget(event.target);
      if (el && focusVisible(el)) {
        cancelArm();
        clearHide();
        show(el);
        return;
      }
      if (anchor.current && !el) close();
    };

    const onFocusOut = (event: FocusEvent) => {
      if (anchor.current && previewTarget(event.target) === anchor.current) close();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && anchor.current) close();
    };

    /* the card's row moved under a resting pointer (its list scrolled): the
       open card takes the row's new place at once, without the slide */
    const follow = (el: HTMLElement) => {
      const place = placeFor(el);
      moved.current = false;
      setCard((prev) => (prev && prev.on ? { ...prev, ...place, moved: false } : prev));
    };

    const onScroll = () => {
      const el = anchor.current;
      if (!el) return;
      let resting = false;
      try {
        resting = hover && el.isConnected && el.matches(':hover');
      } catch {
        resting = false;
      }
      if (resting) {
        if (shown.current === el) follow(el);
        return;
      }
      close();
    };

    const onHide = () => {
      if (document.hidden) close();
    };

    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.addEventListener('pointerdown', close, { passive: true, capture: true });
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('resize', close);

    return () => {
      cancelArm();
      clearHide();
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('pointerdown', close, { capture: true });
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('resize', close);
    };
  });

  if (!host) return null;

  return createPortal(
    <div
      className={cn('pt-preview', card?.on && 'is-on', card?.on && card.moved && 'is-moving')}
      style={card ? { transform: `translate3d(${card.x}px, ${card.y}px, 0)` } : undefined}
      aria-hidden="true"
    >
      <div className="pt-preview-frame">
        <span className="pt-preview-plate">{card ? card.name.charAt(0).toUpperCase() : ''}</span>
        {card ? <LiveClone key={card.id} html={card.html} theme={theme} /> : null}
      </div>
      <div className="pt-preview-title">{card?.name ?? ''}</div>
    </div>,
    host,
  );
}
