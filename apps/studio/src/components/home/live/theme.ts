import { bayer8 } from '@turboslide/effects/bayer';

import { ms, sequence, smoothstep } from './motion';
import { applyKit, DERIVED_ALPHAS, KITS, kitProperties as propertiesOf } from './paint';
import type { KitColors } from './paint';
import type { KitId } from './state';

/**
 * The example kits (docs/LANDING.md 2.8, a replica; integrator.md 3 with Kevin's answer 4). The
 * product's Slide > Change theme opens the Brand kit panel, whose six colour fields set the deck's
 * colours (`packages/chrome/src/menus/model.ts` 2244); it has no named presets. Each swatch fills
 * those six fields at once: `paint.ts` sets the six variables `packages/render/src/theme-css.ts`
 * writes (Text, Background, Captions, Hints, Primary, Accent, as `--ink`, `--paper`, `--ink-2`,
 * `--titanium`, `--blue`, `--accent`) with the alpha forms theme-css.ts derives from the text
 * colour, inline on every slide on the page, so every slide, the show and the print follow; GT
 * removes them, and the deck draws its own kit in the page's appearance.
 *
 * A change sets the words, the ground under every text box and the printed inks at once, and the
 * old ground outside the boxes clears in Bayer order over 500 ms on the tone curve (3.6 T3), so no
 * frame shows text under its kit's contrast. Under reduced motion it is a cut. `clearGround` is
 * the clear, which the kits band (`kits.ts`) and the miniature's Slide > Change theme run.
 */

export { applyKit, DERIVED_ALPHAS, KITS };

/** The custom properties a kit sets on a sheet, by name with its `--` (kept for theme.test.ts). */
export function kitProperties(kit: Exclude<KitId, 'gt'>): Record<string, string> {
  return propertiesOf(KITS[kit]);
}

/** A swatch's kit. */
export function kitOfSwatch(el: HTMLElement): KitId {
  return (el.dataset['kit'] ?? 'gt') as KitId;
}

const inView = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
};

/**
 * The box of every element on a slide that holds text of its own: a text box, a row's cell, the
 * counter, read from the text itself so a slide without block attributes is covered too; and the
 * box of every picture (a print, a field, an image, a drawing).
 */
function textBoxes(root: HTMLElement): DOMRect[] {
  const boxes: DOMRect[] = [];
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const el = node.parentElement;
    if (el === null || seen.has(el) || (node.textContent ?? '').trim() === '') continue;
    if (el.closest('[data-live-overlay], svg, script, style') !== null) continue;
    seen.add(el);
    const box = el.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) boxes.push(box);
  }
  // a picture changes its inks at once with the words, so the old ground never hides a print
  for (const el of root.querySelectorAll('.ts-home-print, [data-field], img, svg')) {
    if (el.closest('[data-live-overlay]') !== null) continue;
    if ((el.parentElement?.closest('svg') ?? null) !== null) continue;
    const box = el.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) boxes.push(box);
  }
  return boxes;
}

/**
 * The old ground over one slide, with a hole at every text box and picture, cleared in Bayer order: a cell
 * goes when the tone curve passes its threshold (m + 0.5) / 64. Two screen pixels a cell.
 */
function veil(
  root: HTMLElement,
  paper: string,
): { el: HTMLCanvasElement; draw(p: number): void } | null {
  const r = root.getBoundingClientRect();
  const cols = Math.max(1, Math.round(r.width / 2));
  const rows = Math.max(1, Math.round(r.height / 2));
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('data-live-overlay', '');
  Object.assign(canvas.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    imageRendering: 'pixelated',
    pointerEvents: 'none',
    zIndex: '10',
  });
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 1, 1);
  const [pr, pg, pb] = ctx.getImageData(0, 0, 1, 1).data;
  const sx = cols / r.width;
  const sy = rows / r.height;
  const hole = new Uint8Array(cols * rows);
  for (const t of textBoxes(root)) {
    const x0 = Math.max(0, Math.floor((t.left - r.left) * sx) - 1);
    const x1 = Math.min(cols, Math.ceil((t.right - r.left) * sx) + 1);
    const y0 = Math.max(0, Math.floor((t.top - r.top) * sy) - 1);
    const y1 = Math.min(rows, Math.ceil((t.bottom - r.top) * sy) + 1);
    for (let y = y0; y < y1; y += 1) hole.fill(1, y * cols + x0, y * cols + x1);
  }
  const threshold = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y += 1)
    for (let x = 0; x < cols; x += 1) threshold[y * cols + x] = (bayer8(y, x) + 0.5) / 64;
  const image = ctx.createImageData(cols, rows);
  const px = image.data;
  for (let i = 0; i < cols * rows; i += 1) {
    px[i * 4] = pr ?? 0;
    px[i * 4 + 1] = pg ?? 0;
    px[i * 4 + 2] = pb ?? 0;
  }
  const draw = (p: number): void => {
    for (let i = 0; i < cols * rows; i += 1)
      px[i * 4 + 3] = hole[i] === 1 || p > (threshold[i] ?? 0) ? 0 : 255;
    ctx.putImageData(image, 0, 0);
  };
  draw(0);
  return { el: canvas, draw };
}

/** ends a running clear at its end state: the veils removed, the frames stopped */
let stopClearing: (() => void) | null = null;

/**
 * The kit's clear (3.6 T3): reads the old ground of every slide in view, lets `change` set the new
 * colours at once, then clears the old ground outside the text boxes in Bayer order over 500 ms
 * on the tone curve. With `animate` false, or under reduced motion, it is a cut.
 */
export function clearGround(root: HTMLElement, change: () => void, animate: boolean): void {
  stopClearing?.();
  const slides = [...root.querySelectorAll<HTMLElement>('[data-home-slides]')];
  const duration = animate ? ms('beat') : 0;
  const veils: { el: HTMLCanvasElement; draw(p: number): void; root: HTMLElement; was: string }[] =
    [];
  if (duration > 0)
    for (const slide of slides) {
      if (!inView(slide) || slide.closest('[data-live-overlay]') !== null) continue;
      const paper = getComputedStyle(slide.querySelector('.ts-sheet') ?? slide)
        .getPropertyValue('--paper')
        .trim();
      const v = paper === '' ? null : veil(slide, paper);
      if (v === null) continue;
      const was = slide.style.position;
      if (getComputedStyle(slide).position === 'static') slide.style.position = 'relative';
      slide.append(v.el);
      veils.push({ ...v, root: slide, was });
    }
  change();
  if (veils.length === 0) return;
  let frame = 0;
  const end = (): void => {
    cancelAnimationFrame(frame);
    for (const v of veils) {
      v.el.remove();
      v.root.style.position = v.was;
    }
    run.done();
    if (stopClearing === end) stopClearing = null;
  };
  const run = sequence('kits', end);
  stopClearing = end;
  const t0 = performance.now();
  const tick = (now: number): void => {
    const t = (now - t0) / duration;
    if (t >= 1) {
      end();
      return;
    }
    const p = smoothstep(t);
    for (const v of veils) v.draw(p);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

/** The colours of a kit by id, null for GT. */
export const colorsOfKit = (kit: KitId): KitColors | null => (kit === 'gt' ? null : KITS[kit]);
