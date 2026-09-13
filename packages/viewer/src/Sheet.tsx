import type { MouseEvent, ReactNode, RefObject, TouchEvent, UIEvent } from 'react';
import { useRef } from 'react';

import { SHEET_H, SHEET_W } from './model';

import './Sheet.css';

/** The plate left around the sheet: 28px, 12px at or below 900px, 0 in present mode (SPEC 5.5; tail.html fit). */
export const SHEET_PAD = { wide: 28, narrow: 12, present: 0 } as const;

/** A touch has to travel this far to count as a swipe (tail.html touchend). */
const SWIPE_PX = 40;

export type SheetFit = {
  /** the stage transform, W / w */
  scale: number;
  /** the sheet's content box, round(w s) by round(h s) */
  width: number;
  height: number;
  /** where the sheet's 1px border box sits inside the stage box */
  left: number;
  top: number;
};

export type SheetFitInput = {
  /** the stage box */
  aw: number;
  ah: number;
  w?: number;
  h?: number;
  pad: number;
};

/** The stage scale the editor asked for (gslides-parity SPEC 7.2.16): a factor of the sheet size, or the fit. */
export type SheetZoom = number | 'fit';

/**
 * The fit math from the deck viewer (tail.html fit(); Prototemplate
 * Sheet.tsx fitSheet). The 1600 by 900 stage scales to the space left after
 * the pad and the sheet is centered in it; `left` and `top` place the
 * sheet's border box one pixel out so the border sits around, not over, the
 * scaled content. Pure, so the sheet can compute it in render from the stage
 * size the shell publishes, and the CLI's sheet command can reuse it.
 */
export function fitSheet({ aw, ah, w = SHEET_W, h = SHEET_H, pad }: SheetFitInput): SheetFit {
  const s = Math.max(0.05, Math.min((aw - pad * 2) / w, (ah - pad * 2) / h));
  const width = Math.round(w * s);
  const height = Math.round(h * s);
  return {
    scale: width / w,
    width,
    height,
    left: Math.round((aw - width) / 2) - 1,
    top: Math.round((ah - height) / 2) - 1,
  };
}

/**
 * The fit at a zoom factor (gslides-parity SPEC 2.3, 7.2.16; the editor's View > Zoom): the
 * sheet at `zoom` times its 1600 by 900 size, centred in the stage while it fits and pinned to
 * the pad's top left corner while it does not, so the stage scrolls to the rest. `'fit'` is the
 * plain fit above. Pure; sheet.test.ts pins it.
 */
export function fitSheetAt(input: SheetFitInput & { zoom: SheetZoom }): SheetFit {
  if (input.zoom === 'fit') return fitSheet(input);
  const { aw, ah, w = SHEET_W, h = SHEET_H, pad } = input;
  const scale = Math.max(0.05, input.zoom);
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  return {
    scale: width / w,
    width,
    height,
    left: Math.max(pad, Math.round((aw - width) / 2)) - 1,
    top: Math.max(pad, Math.round((ah - height) / 2)) - 1,
  };
}

export type SheetProps = {
  /** the stage box, measured by the shell's ResizeObserver */
  stageSize: { width: number; height: number };
  /** the editor's zoom (gslides-parity SPEC 7.2.16); the fit when absent */
  zoom?: SheetZoom;
  present: boolean;
  /** window.innerWidth at or below 900: a 12px pad, the sheet under the toolbar */
  narrow: boolean;
  /** which way the last move went; the slide change animation reads it */
  dir: 'next' | 'prev';
  /** a click on a half of the sheet, or a swipe: pages by one (tail.html wrap click) */
  onStep?: (delta: number) => void;
  /** the paging chevrons at the edges on hover; off while presenting */
  edges?: boolean;
  /** hidden while another mode is up */
  hidden?: boolean;
  /** the scrolling stage box, for the editor's zoom and pan (gslides-parity SPEC-2 6.1 rows 27, 28) */
  scrollerRef?: RefObject<HTMLDivElement | null>;
  /** the stage scrolled while zoomed: the overlay follows */
  onScroll?: (scroll: { left: number; top: number }) => void;
  children?: ReactNode;
};

/**
 * The stage frame in slide mode (SPEC 5.5): the `.sheet` box (the theme's
 * stage.css draws its --edge ring and the two spread shadows, head:255),
 * sized and placed by the fit, holding `.ts-stage.stage`, the 1600 by 900
 * stage scaled by transform: scale(k) with origin 0 0. The theme's tokens
 * root (`.ts-sheet[data-theme]`) is the Stage around it. The children are
 * the frame and the slide (SlideView). A click on the left or
 * right half pages, a swipe pages, and both ignore links and controls inside
 * the slide.
 */
export function Sheet({
  stageSize,
  zoom = 'fit',
  present,
  narrow,
  dir,
  onStep,
  edges = true,
  hidden = false,
  scrollerRef,
  onScroll,
  children,
}: SheetProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const pad = present ? SHEET_PAD.present : narrow ? SHEET_PAD.narrow : SHEET_PAD.wide;
  const fitted = fitSheetAt({ aw: stageSize.width, ah: stageSize.height, pad, zoom });
  /* on a narrow viewport the sheet sits under the toolbar instead of centered, so the plate below it can hold the title */
  const fit: SheetFit = narrow && !present && zoom === 'fit' ? { ...fitted, top: pad } : fitted;
  /* a zoomed sheet larger than the stage: the stage scrolls to the rest (Editor.css [data-zoom]) */
  const zoomed = zoom !== 'fit';

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!onStep) return;
    const target = e.target as Element;
    if (target.closest('a, button, input, textarea, select')) return;
    /* presenting: a click anywhere on the slide advances (gslides-parity SPEC 9.2, R04 A2) */
    if (present) {
      onStep(1);
      return;
    }
    const box = sheet.current?.getBoundingClientRect();
    if (!box) return;
    onStep(e.clientX > box.left + box.width / 2 ? 1 : -1);
  };

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.changedTouches[0];
    touchX.current = touch ? touch.clientX : null;
  };

  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const start = touchX.current;
    touchX.current = null;
    const touch = e.changedTouches[0];
    if (start === null || !touch || !onStep) return;
    const dx = touch.clientX - start;
    if (Math.abs(dx) > SWIPE_PX) onStep(dx < 0 ? 1 : -1);
  };

  return (
    <div
      ref={scrollerRef}
      className="pt-sheet-stage"
      data-dir={dir}
      data-zoom={zoomed ? String(fit.scale) : undefined}
      hidden={hidden}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onScroll={
        onScroll
          ? (e: UIEvent<HTMLDivElement>) =>
              onScroll({ left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop })
          : undefined
      }
    >
      <div
        ref={sheet}
        className={present ? 'sheet is-present' : 'sheet'}
        style={{
          left: fit.left,
          top: fit.top,
          width: fit.width,
          height: fit.height,
          /* a zoomed sheet keeps the pad past its far edges so the scroll region reaches them */
          marginRight: zoomed ? pad : undefined,
          marginBottom: zoomed ? pad : undefined,
          visibility: stageSize.width > 0 ? undefined : 'hidden',
        }}
      >
        <div className="ts-stage stage" style={{ transform: `scale(${fit.scale})` }}>
          {children}
        </div>
        {edges && !present ? (
          <>
            <span className="pt-sheet-edge is-prev" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                />
              </svg>
            </span>
            <span className="pt-sheet-edge is-next" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
                />
              </svg>
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
