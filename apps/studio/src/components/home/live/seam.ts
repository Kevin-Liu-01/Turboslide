import { EXPORT } from '../copy';
import type { LiveContext } from './index';
import { finishBand, play } from './motion';

/**
 * The export seam (docs/LANDING.md 2.8, 3.2 E1 and E2; rows home.export.seam and
 * home.export.figure). L3's file. The band's markup draws slide 7 twice under one cut: the Perfect
 * file's picture left of it and the Editable text file's text boxes right of it, both read at build
 * from the files the CLI writes. The cut is one CSS variable, `--seam-cut`, on the seam's root, so
 * moving it re-renders nothing. A drag on the slide follows the pointer 1:1 with no inertia and a
 * click sets the cut (the single pointer path, SC 2.5.7); a drag that starts on an Editable text box
 * selects its text instead, because those boxes are text. On touch only the handle drags, so a
 * swipe over the slide scrolls the page. The handle is the slider: arrows move the cut 2, Shift
 * with an arrow or Page Up and Page Down 10, Home and End to the ends.
 *
 * E1 is L4's to start (`armHint` when the band is below the viewport at its first observation,
 * then `hint` one beat after it is 35 percent in view): the cut travels from 82 to 50 percent over
 * 600 ms on the move curve, once. Any input on the seam finishes it at 50 first.
 */

type Seam = { arm(): void; hint(): void };
let seam: Seam | null = null;

/** E1's first pose: the cut at 82 percent at once (l4.md M10). */
export function armHint(): void {
  seam?.arm();
}

/** E1: the cut travels from 82 to 50 percent over 600 ms on the move curve, once. */
export function hint(): void {
  seam?.hint();
}

/** `--seam-cut` interpolates as a percentage, so a Web Animation can move it (E1). */
function registerCut(): void {
  try {
    CSS.registerProperty({
      name: '--seam-cut',
      syntax: '<percentage>',
      inherits: true,
      initialValue: '50%',
    });
  } catch {
    /* registered already, by the stylesheet's @property or an earlier start */
  }
}

function appearance(): 'light' | 'dark' {
  const theme = document.documentElement.dataset['theme'];
  if (theme === 'dark' || theme === 'light') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function startSeam(ctx: LiveContext): void {
  const { band } = ctx;
  const handle = band.querySelector<HTMLElement>('[data-seam]');
  if (handle === null) return;
  /* the element whose style carries the cut: the seam's root (integrator.md 4.1) */
  let root: HTMLElement = handle.parentElement ?? handle;
  for (let el: HTMLElement | null = handle; el !== null && el !== band; el = el.parentElement)
    if (el.hasAttribute('data-seam-root') || el.style.getPropertyValue('--seam-cut') !== '') {
      root = el;
      break;
    }
  registerCut();
  /* the slide itself, under the labels: a drag's x on it maps to the cut 1:1 */
  const box = handle.parentElement ?? root;

  let touched = false;
  let hinted = false;
  const percentOf = (): number => {
    const value = parseFloat(
      root.style.getPropertyValue('--seam-cut') ||
        getComputedStyle(root).getPropertyValue('--seam-cut'),
    );
    return Number.isFinite(value) ? value : 50;
  };
  const label = (percent: number): void => {
    const p = Math.round(percent);
    handle.setAttribute('aria-valuenow', String(p));
    handle.setAttribute('aria-valuetext', EXPORT.slider(p));
  };
  const setCut = (percent: number): void => {
    const p = Math.max(0, Math.min(100, percent));
    root.style.setProperty('--seam-cut', `${Math.round(p * 100) / 100}%`);
    label(p);
  };
  const input = (): void => {
    touched = true;
    finishBand('export');
  };

  seam = {
    arm() {
      if (touched || hinted) return;
      setCut(82);
    },
    hint() {
      if (touched || hinted) return;
      hinted = true;
      label(50);
      play(root, [{ '--seam-cut': '82%' }, { '--seam-cut': '50%' }], 'line', 'move', 'export');
    },
  };

  /* E2: a drag follows the pointer 1:1, a click sets the cut */
  const xOf = (event: PointerEvent | MouseEvent): number => {
    const rect = box.getBoundingClientRect();
    return rect.width === 0 ? 50 : ((event.clientX - rect.left) / rect.width) * 100;
  };
  let dragging = false;
  box.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const onHandle = handle.contains(event.target as Node);
    if (!onHandle && event.pointerType === 'touch') return;
    if (!onHandle && (event.target as Element).closest('[data-seam-text]') !== null) return;
    event.preventDefault();
    input();
    dragging = true;
    /* the handle takes focus for the keys that follow; a pointer drag draws no focus ring */
    handle.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    box.setPointerCapture(event.pointerId);
    setCut(xOf(event));
  });
  box.addEventListener('pointermove', (event) => {
    if (dragging) setCut(xOf(event));
  });
  const stop = (): void => {
    dragging = false;
  };
  box.addEventListener('pointerup', stop);
  box.addEventListener('pointercancel', stop);
  box.addEventListener('click', (event) => {
    /* a click on a text box sets the cut unless it selected words */
    if ((event.target as Element).closest('[data-seam-text]') === null) return;
    const selection = window.getSelection();
    if (selection !== null && !selection.isCollapsed) return;
    input();
    setCut(xOf(event));
  });

  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 10 : 2;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = percentOf() - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = percentOf() + step;
        break;
      case 'PageDown':
        next = percentOf() - 10;
        break;
      case 'PageUp':
        next = percentOf() + 10;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = 100;
        break;
      default:
        return;
    }
    event.preventDefault();
    input();
    setCut(next);
  });

  /* Download the PDF: the file in the shown appearance, requested only on the click (l3.md R8) */
  const pdf = band.querySelector<HTMLAnchorElement>('a[data-pdf]');
  if (pdf !== null && pdf.dataset['hrefDark'] !== undefined)
    pdf.addEventListener('click', () => {
      const href = appearance() === 'dark' ? pdf.dataset['hrefDark'] : pdf.dataset['hrefLight'];
      if (href !== undefined) pdf.href = href;
    });
}
