import type { LiveContext } from './index';
import { installGuards, onceInView, play, reduced } from './motion';

/**
 * K1, the close slide signs the deck (docs/LANDING.md 2.15, 3.5 K1, 3.3): at 35 percent in view,
 * once, the mark's seven pieces arrive from the left, each over 48 sheet units in 600 ms on the
 * arrive curve with its opacity over 120 ms, 55 ms apart from the leftmost (B's
 * `b-strip-mark.png`, A's `close-mark.png`), 930 ms in all. V4's file.
 *
 * The pieces are `[data-mark-piece="0"]` to `"6"`, numbered left to right, split at build from the
 * one path of `packages/theme/brand/mark.svg` (l4.md M5). They move by the individual `translate`
 * property, which composes with any `transform` a piece carries (the mark's skew), and only when
 * the close slide is below the viewport at its first observation; otherwise, and under reduced
 * motion, the mark is drawn still from the first paint.
 */

/** The travel of a piece, in sheet units (1 unit is 1/1,600 of the sheet's width). */
const TRAVEL_UNITS = 48;
/** The stagger of the pieces (3.3: 55 ms for items). */
const STAGGER_MS = 55;

/** 48 sheet units in a piece's own coordinates: SVG user units, or the piece's CSS pixels. */
function travelOf(piece: Element, sheet: Element): number {
  const sheetWidth = sheet.getBoundingClientRect().width;
  const px = (TRAVEL_UNITS * sheetWidth) / 1600;
  if (piece instanceof SVGGraphicsElement) {
    const svg = piece.ownerSVGElement;
    const box = svg?.viewBox.baseVal;
    const rendered = svg?.getBoundingClientRect().width ?? 0;
    return box !== undefined && box.width > 0 && rendered > 0 ? (px * box.width) / rendered : px;
  }
  const html = piece as HTMLElement;
  const rendered = html.getBoundingClientRect().width;
  return rendered > 0 && html.offsetWidth > 0 ? (px * html.offsetWidth) / rendered : px;
}

export function startMark(ctx: LiveContext): void {
  installGuards();
  if (reduced()) return;
  const pieces = [...ctx.band.querySelectorAll<SVGElement | HTMLElement>('[data-mark-piece]')].sort(
    (a, b) => Number(a.dataset['markPiece']) - Number(b.dataset['markPiece']),
  );
  const sheet = pieces[0]?.closest('[data-home-slides]');
  if (pieces.length === 0 || sheet == null) return;
  let travel = 0;
  onceInView(
    sheet,
    () => {
      travel = travelOf(pieces[0]!, sheet);
      for (const piece of pieces) {
        piece.style.setProperty('translate', `${-travel}px 0`);
        piece.style.setProperty('opacity', '0');
      }
    },
    () => {
      pieces.forEach((piece, index) => {
        play(
          piece,
          [{ translate: `${-travel}px 0` }, { translate: '0px 0' }],
          'line',
          'arrive',
          'close',
          index * STAGGER_MS,
        );
        play(piece, [{ opacity: 0 }, { opacity: 1 }], 'fast', 'fade', 'close', index * STAGGER_MS);
      });
    },
    /* Pause Motion when the close arrives: the mark drawn still at once (3.2) */
    () => {
      for (const piece of pieces) {
        piece.style.removeProperty('translate');
        piece.style.removeProperty('opacity');
      }
    },
  );
}
