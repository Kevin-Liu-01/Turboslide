import { EXPORT } from '../copy';
import { homeAssets } from '../assets';
import type { LiveContext } from './index';
import { countDiffering } from './loupe-delta';

/**
 * The export band's loupe (docs/LANDING.md 2.12, 3.6 U1; row home.export.loupe). V3's file. It
 * compares the CLI's browser render of slide 7 (`turboslide render --scale 2`, the reference the
 * exporter's `--verify` compares a flatten page with) with the Perfect file's picture of it, the
 * same 14 by 14 pixel window of each 3200 by 1800 raster drawn at ten times, and counts the
 * pixels whose colour delta exceeds pixelmatch's threshold 0.1 (`colorDelta`, a copy of
 * pixelmatch's YIQ measure that `loupe.test.ts` pins to the exporter's). The page never claims the
 * two are the same; it counts.
 *
 * A fine pointer held still on the slide for 350 ms shows it, and it follows the pointer until the
 * pointer leaves the slide or a drag of the seam starts; a finger held 350 ms shows it and moving
 * the held finger moves it; with focus on the comparison target (`[data-loupe]`) it shows at the
 * slide's centre, the arrows move the window by 14 pixels (Shift by 140) and Escape hides it. The
 * window is the same place in both rasters whichever side of the cut the pointer is on. Both
 * rasters are decoded on the first hold, hover or focus, and nothing is requested before: the
 * Perfect picture is the seam's own `img` (no second request), the browser raster one fetch.
 * It appears, follows and leaves by cuts (U1), the same under reduced motion.
 */

/** The window's side in raster pixels and its scale on the page (2.12). */
export const WINDOW = 14;
const SCALE = 10;
/** A held pointer or finger shows the loupe after this long (2.12): an input window, not a motion. */
const HOLD_MS = 350;
/** The loupe sits this far above and to the left of the pointer (2.12). */
const OFFSET = 24;
/** The loupe's words (2.12, V1's copy table). */
const WORDS = EXPORT.loupe;

function appearance(): 'light' | 'dark' {
  const theme = document.documentElement.dataset['theme'];
  if (theme === 'dark' || theme === 'light') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

type Rasters = { browser: ImageBitmap; perfect: ImageBitmap; width: number; height: number };

/** The browser raster's URL in the shown appearance (`assets.json` role `export-browser`). */
function browserUrl(theme: 'light' | 'dark'): string | null {
  return homeAssets('export-browser', theme)[0]?.path ?? null;
}

export function startLoupe(ctx: LiveContext): void {
  const { band } = ctx;
  const slide =
    band.querySelector<HTMLElement>('[data-loupe]') ??
    band.querySelector<HTMLElement>('.ts-seam-box') ??
    band.querySelector<HTMLElement>('[data-seam-root]');
  if (slide === null) return;
  /* the comparison target: focusable and named (2.12), on the slide's box the shell marks */
  if (!slide.hasAttribute('data-loupe')) slide.setAttribute('data-loupe', '');
  if (!slide.hasAttribute('tabindex')) slide.tabIndex = 0;
  if (!slide.hasAttribute('aria-label')) slide.setAttribute('aria-label', WORDS.target);
  const host = band.querySelector<HTMLElement>('[data-seam-root]') ?? slide.parentElement ?? band;

  /* ---------- the rasters, decoded once per appearance on the first use ---------- */
  const decoded = new Map<string, Promise<Rasters | null>>();
  const rasters = (): Promise<Rasters | null> => {
    const theme = appearance();
    let found = decoded.get(theme);
    if (found === undefined) {
      found = (async (): Promise<Rasters | null> => {
        /* the picture of the shown appearance first: a selector list would return the first in
           document order, the light one, which the dark appearance hides and never loads */
        const img =
          band.querySelector<HTMLImageElement>(`.ts-seam-perfect img.ts-only-${theme}`) ??
          band.querySelector<HTMLImageElement>('.ts-seam-perfect img');
        const url = browserUrl(theme);
        if (img === null || url === null) return null;
        try {
          if (!img.complete) await img.decode();
          const options: ImageBitmapOptions = {
            colorSpaceConversion: 'none',
            premultiplyAlpha: 'none',
          };
          const [perfect, browser] = await Promise.all([
            createImageBitmap(img, options),
            fetch(url)
              .then((r) => r.blob())
              .then((blob) => createImageBitmap(blob, options)),
          ]);
          if (perfect.width !== browser.width || perfect.height !== browser.height) return null;
          return { browser, perfect, width: perfect.width, height: perfect.height };
        } catch {
          return null;
        }
      })();
      decoded.set(theme, found);
    }
    return found;
  };

  /* ---------- the loupe's markup: two windows, their labels, the readout ---------- */
  const loupe = document.createElement('div');
  loupe.className = 'ts-loupe';
  loupe.setAttribute('aria-hidden', 'true');
  loupe.setAttribute('data-live-overlay', '');
  loupe.hidden = true;
  const windows = (['browser', 'perfect'] as const).map((key) => {
    const figure = document.createElement('div');
    figure.className = 'ts-loupe-window';
    figure.dataset['loupeWindow'] = key;
    const label = document.createElement('span');
    label.className = 'ts-loupe-label';
    label.textContent = key === 'browser' ? WORDS.browser : WORDS.perfect;
    const canvas = document.createElement('canvas');
    canvas.width = WINDOW * SCALE;
    canvas.height = WINDOW * SCALE;
    figure.append(canvas, label);
    return { key, figure, canvas };
  });
  const readout = document.createElement('p');
  readout.className = 'ts-loupe-readout';
  readout.dataset['loupeReadout'] = '';
  const pair = document.createElement('div');
  pair.className = 'ts-loupe-pair';
  pair.append(...windows.map((w) => w.figure));
  loupe.append(pair, readout);
  host.append(loupe);
  /* a 14 by 14 scratch for reading each window's pixels */
  const scratch = document.createElement('canvas');
  scratch.width = WINDOW;
  scratch.height = WINDOW;
  const read = scratch.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });

  /* the window's top left corner in raster pixels */
  let at: { x: number; y: number } | null = null;
  let token = 0;

  const draw = async (x: number, y: number, keyboard: boolean): Promise<void> => {
    const mine = (token += 1);
    const r = await rasters();
    if (r === null || mine !== token || read === null) return;
    const x0 = Math.max(0, Math.min(r.width - WINDOW, Math.round(x)));
    const y0 = Math.max(0, Math.min(r.height - WINDOW, Math.round(y)));
    at = { x: x0, y: y0 };
    const pixels: Uint8ClampedArray[] = [];
    for (const w of windows) {
      const bitmap = w.key === 'browser' ? r.browser : r.perfect;
      read.clearRect(0, 0, WINDOW, WINDOW);
      read.drawImage(bitmap, x0, y0, WINDOW, WINDOW, 0, 0, WINDOW, WINDOW);
      pixels.push(read.getImageData(0, 0, WINDOW, WINDOW).data);
      const out = w.canvas.getContext('2d');
      if (out === null) continue;
      out.imageSmoothingEnabled = false;
      out.clearRect(0, 0, w.canvas.width, w.canvas.height);
      out.drawImage(bitmap, x0, y0, WINDOW, WINDOW, 0, 0, w.canvas.width, w.canvas.height);
    }
    const differ = countDiffering(pixels[0] as Uint8ClampedArray, pixels[1] as Uint8ClampedArray);
    const text = WORDS.readout(differ, WINDOW * WINDOW, x0 + WINDOW / 2, y0 + WINDOW / 2);
    readout.textContent = text;
    loupe.dataset['differ'] = String(differ);
    loupe.dataset['x'] = String(x0);
    loupe.dataset['y'] = String(y0);
    loupe.hidden = false;
    if (keyboard) ctx.announce(text);
  };

  /** Places the loupe 24 px above and to the left of a point in the host, flipped near the sides. */
  const place = (clientX: number, clientY: number, below = false): void => {
    const h = host.getBoundingClientRect();
    const w = loupe.offsetWidth || 312;
    const ht = loupe.offsetHeight || 190;
    let left = clientX - h.left - OFFSET - w;
    if (left < 0) left = clientX - h.left + OFFSET;
    left = Math.max(0, Math.min(h.width - w, left));
    let top = below ? clientY - h.top + OFFSET : clientY - h.top - OFFSET - ht;
    if (top < 0) top = clientY - h.top + OFFSET;
    loupe.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };

  /** The raster point under a point on the slide. */
  const rasterOf = async (
    clientX: number,
    clientY: number,
  ): Promise<{ x: number; y: number } | null> => {
    const r = await rasters();
    if (r === null) return null;
    const box = slide.getBoundingClientRect();
    if (box.width === 0) return null;
    return {
      x: ((clientX - box.left) / box.width) * r.width - WINDOW / 2,
      y: ((clientY - box.top) / box.height) * r.height - WINDOW / 2,
    };
  };

  const show = async (clientX: number, clientY: number, touch: boolean): Promise<void> => {
    const p = await rasterOf(clientX, clientY);
    if (p === null) return;
    loupe.hidden = false;
    place(clientX, clientY, false);
    if (touch) place(clientX, clientY, false);
    await draw(p.x, p.y, false);
  };
  const hide = (): void => {
    token += 1;
    loupe.hidden = true;
    at = null;
  };

  /* ---------- a held pointer: 350 ms still, then it follows ---------- */
  let timer = 0;
  let following = false;
  let held: { id: number; touch: boolean } | null = null;
  const cancelHold = (): void => {
    window.clearTimeout(timer);
    timer = 0;
  };
  slide.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') {
      if (following && held?.id === event.pointerId) void show(event.clientX, event.clientY, true);
      return;
    }
    if (dragging) return;
    if (following) {
      void show(event.clientX, event.clientY, false);
      return;
    }
    cancelHold();
    const { clientX, clientY } = event;
    timer = window.setTimeout(() => {
      following = true;
      void show(clientX, clientY, false);
    }, HOLD_MS);
  });
  slide.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'touch') return;
    cancelHold();
    following = false;
    hide();
  });
  /* a drag of the seam starts: the loupe leaves */
  let dragging = false;
  slide.addEventListener('pointerdown', (event) => {
    cancelHold();
    if (event.pointerType === 'touch') {
      held = { id: event.pointerId, touch: true };
      const { clientX, clientY } = event;
      timer = window.setTimeout(() => {
        following = true;
        void show(clientX, clientY, true);
      }, HOLD_MS);
      return;
    }
    dragging = true;
    following = false;
    hide();
  });
  const release = (event: PointerEvent): void => {
    dragging = false;
    if (event.pointerType === 'touch') {
      cancelHold();
      held = null;
      following = false;
      hide();
    }
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  /* a finger that held the loupe moves it, not the page */
  slide.addEventListener(
    'touchmove',
    (event) => {
      if (following) event.preventDefault();
      else cancelHold();
    },
    { passive: false },
  );

  /* ---------- the keys on the comparison target ---------- */
  const center = (): { x: number; y: number } => {
    const box = slide.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };
  slide.addEventListener('focus', () => {
    /* a keyboard focus shows it at the centre; a press that focuses the slide is the seam's */
    if (!slide.matches(':focus-visible')) return;
    void (async () => {
      const c = center();
      const p = await rasterOf(c.x, c.y);
      if (p === null) return;
      place(c.x, c.y, false);
      await draw(p.x, p.y, false);
    })();
  });
  slide.addEventListener('blur', () => {
    if (!following) hide();
  });
  slide.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? WINDOW * 10 : WINDOW;
    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowLeft') dx = -step;
    else if (event.key === 'ArrowRight') dx = step;
    else if (event.key === 'ArrowUp') dy = -step;
    else if (event.key === 'ArrowDown') dy = step;
    else if (event.key === 'Escape') {
      event.preventDefault();
      hide();
      return;
    } else return;
    event.preventDefault();
    void (async () => {
      const r = await rasters();
      if (r === null) return;
      const from = at ?? { x: r.width / 2 - WINDOW / 2, y: r.height / 2 - WINDOW / 2 };
      const c = center();
      place(c.x, c.y, false);
      await draw(from.x + dx, from.y + dy, true);
    })();
  });
}
