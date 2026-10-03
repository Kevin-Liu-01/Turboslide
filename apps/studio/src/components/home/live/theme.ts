import { bayer8 } from '@turboslide/effects/bayer';

import { HISTORY, TAILOR } from '../copy';
import type { LiveContext } from './index';
import { ms, sequence, smoothstep } from './motion';
import type { HomeDeckState, KitId } from './state';
import type { Snackbar } from './tailor';

/**
 * The example kits (docs/LANDING.md 2.5 "Kits", a replica; integrator.md 3 with Kevin's answer 4).
 * The product's Slide > Change theme opens the Brand kit panel, whose six colour fields set the
 * deck's colours (`packages/chrome/src/menus/model.ts` 2244); it has no named presets. Each swatch
 * fills those six fields at once: it sets the six variables `packages/render/src/theme-css.ts`
 * writes (Text, Background, Captions, Hints, Primary, Accent, as `--ink`, `--paper`, `--ink-2`,
 * `--titanium`, `--blue`, `--accent`) with the alpha forms theme-css.ts derives from the text
 * colour, inline on every slide on the page, so every slide, the show and the print follow; GT
 * removes them, and the deck draws its own kit in the page's appearance. Primary and Accent take
 * the kit's text colour, so no third hue enters a slide; Kestrel and Fenwick are example
 * customers' kits and fix their colours in both appearances, as a customer theme does.
 *
 * A change sets the words, the ground under every text box and the printed inks at once, and the
 * old ground outside the boxes clears in Bayer order over 500 ms on the tone curve (3.2 T3), so no
 * frame shows text under its kit's contrast. Under reduced motion it is a cut.
 */

type Kit = { paper: string; ink: string; ink2: string; titanium: string };

/** integrator.md 3: Kestrel (C's values) and Fenwick (C's navy, one step darker). */
export const KITS: Readonly<Record<Exclude<KitId, 'gt'>, Kit>> = {
  kestrel: { paper: '#f3efe6', ink: '#1f1b16', ink2: '#4d463c', titanium: '#6e665a' },
  fenwick: { paper: '#0a1b38', ink: '#f4f1ea', ink2: '#c9cbd3', titanium: '#8d97ab' },
};

/**
 * The alphas of the ink's derived tokens (`packages/theme/src/tokens.ts` TOKENS, the light set
 * for a light ground and the dark set for a dark one; theme-css.ts THEME_DERIVED_TOKENS and the
 * plate), which `theme.test.ts` holds equal to the theme's.
 */
export const DERIVED_ALPHAS: Readonly<Record<'light' | 'dark', Readonly<Record<string, number>>>> =
  {
    light: { hair: 0.18, 'hair-soft': 0.09, plate: 0.035, cross: 0.38, edge: 0.62, thumb: 0.32 },
    dark: { hair: 0.22, 'hair-soft': 0.1, plate: 0.05, cross: 0.34, edge: 0.55, thumb: 0.32 },
  };

const hexRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luminance = (hex: string): number =>
  hexRgb(hex).reduce((sum, c, i) => {
    const v = c / 255;
    const lin = v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    return sum + lin * ([0.2126, 0.7152, 0.0722][i] ?? 0);
  }, 0);

/** The custom properties a kit sets on a sheet, by name with its `--`. */
export function kitProperties(kit: Exclude<KitId, 'gt'>): Record<string, string> {
  const k = KITS[kit];
  const dark = luminance(k.paper) < luminance(k.ink);
  const [r, g, b] = hexRgb(k.ink);
  const props: Record<string, string> = {
    '--ink': k.ink,
    '--paper': k.paper,
    '--ink-2': k.ink2,
    '--titanium': k.titanium,
    '--blue': k.ink,
    '--accent': k.ink,
  };
  for (const [name, alpha] of Object.entries(DERIVED_ALPHAS[dark ? 'dark' : 'light']))
    props[`--${name}`] = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  return props;
}

const PROPERTY_NAMES = Object.keys(kitProperties('kestrel'));

/** The elements a kit writes on: the slide root and the renderer's sheets inside it. */
const sheetsOf = (el: HTMLElement): HTMLElement[] => [
  el,
  ...el.querySelectorAll<HTMLElement>('.ts-sheet'),
];

/** Sets a kit on a slide root and its sheets; GT removes the properties (l3.md R13). */
export function applyKit(el: HTMLElement, kit: KitId): void {
  const props = kit === 'gt' ? null : kitProperties(kit);
  for (const sheet of sheetsOf(el))
    for (const name of PROPERTY_NAMES) {
      const value = props?.[name];
      if (value === undefined) sheet.style.removeProperty(name);
      else sheet.style.setProperty(name, value);
    }
}

const inView = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
};

/**
 * The box of every element on a slide that holds text of its own: a text box, a row's cell, the
 * counter. Most of the page's slides carry no `data-block` (only the bands that edit their blocks
 * do), so the boxes are read from the text itself.
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
  return boxes;
}

/**
 * The old ground over one slide, with a hole at every text box, cleared in Bayer order: a cell
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

/** Starts the three swatches; the status sentence takes the snackbar's row. */
export function startTheme(ctx: LiveContext, snack: Snackbar): void {
  const { band, root, store } = ctx;
  const swatches = [...band.querySelectorAll<HTMLElement>('[data-kit]')];
  let shown: KitId = store.get().kit;

  const paint = (kit: KitId): void => {
    for (const s of swatches) s.setAttribute('aria-pressed', String(s.dataset['kit'] === kit));
    if (kit === 'gt') delete root.dataset['pageKit'];
    else root.dataset['pageKit'] = kit;
  };

  /** ends a running clear at its end state: the veils removed, the frames stopped */
  let stopClearing: (() => void) | null = null;
  const change = (kit: KitId, animate: boolean): void => {
    stopClearing?.();
    const slides = [...root.querySelectorAll<HTMLElement>('[data-home-slides]')];
    const duration = animate ? ms('beat') : 0;
    const veils: {
      el: HTMLCanvasElement;
      draw(p: number): void;
      root: HTMLElement;
      was: string;
    }[] = [];
    if (duration > 0)
      for (const slide of slides) {
        if (!inView(slide)) continue;
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
    for (const slide of slides) applyKit(slide, kit);
    paint(kit);
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
    const run = sequence('tailor', end);
    stopClearing = end;
    const t0 = performance.now();
    const tick = (now: number): void => {
      const t = (now - t0) / duration;
      if (t >= 1) return end();
      const p = smoothstep(t);
      for (const v of veils) v.draw(p);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };

  for (const swatch of swatches)
    swatch.addEventListener('click', () => {
      const kit = swatch.dataset['kit'] as KitId;
      const before = store.get().kit;
      if (kit === before) return;
      store.commit({
        band: 'tailor',
        author: 'you',
        words: HISTORY.kit(TAILOR.kits[kit].name),
        next: (s) => ({ ...s, kit }),
        undo: (s) => ({ ...s, kit: before }),
      });
    });

  store.subscribe((state: HomeDeckState, event) => {
    if (state.kit === shown) return;
    shown = state.kit;
    change(state.kit, event.kind === 'commit');
    if (event.kind === 'commit' && event.change.band === 'tailor')
      snack.show(TAILOR.kitStatus(state.kit, state.order.length));
  });
  paint(shown);
}
