import { HOME_DECK } from '../deck.generated';
import { startAgents } from './agents';
import { startCanvasField, startStrip } from './field';
import { renumber } from './filmstrip';
import { startHero } from './hero';
import { startHistory } from './history';
import { startMark } from './mark';
import { hintInView } from './motion';
import { startObjects } from './objects';
import { startPrint } from './print';
import { armHint, hint, startSeam } from './seam';
import { startShow } from './show';
import { createHomeStore, restState } from './state';
import type { Band, HomeStore, UndoBand } from './state';
import { startTailor } from './tailor';

/**
 * The live module's entry (docs/LANDING.md 4.2, 6.1; integrator.md 4.6): the route imports it after
 * `load` and one idle callback and calls `startLive(main)`. It creates the page deck's one store
 * from the rest state (the run's end, its three rows recorded), starts each band's registration in
 * push order, wires the three Undo buttons and Cmd or Ctrl+Z by 2.0's rule, and marks
 * `main[data-live="ready"]`. One registration failing is caught and the others still start.
 * L2 owns this file; L3 (pushes 4 to 6) and L4 (push 7) add their registration lines in push order.
 */

export type LiveContext = {
  /** `main#top` */
  root: HTMLElement;
  /** the `section[data-band]` the registration names */
  band: HTMLElement;
  store: HomeStore;
  /** writes the band's polite live region (`[data-announce]`) */
  announce(text: string): void;
};

export type Registration = {
  band: 'hero' | 'field' | Band | 'close';
  start(ctx: LiveContext): void;
};

/** In push order: hero and canvas (2), tailor (3), agents and history (4), present (5), export (6), fields, mark and motion (7). */
const REGISTRATIONS: readonly Registration[] = [
  { band: 'hero', start: (ctx) => startObjects(ctx, 'hero') },
  { band: 'canvas', start: (ctx) => startObjects(ctx, 'canvas') },
  { band: 'tailor', start: startTailor },
  { band: 'agents', start: startHistory },
  { band: 'agents', start: startAgents },
  { band: 'present', start: startShow },
  { band: 'present', start: startPrint },
  { band: 'export', start: startSeam },
  { band: 'hero', start: startHero },
  { band: 'field', start: startStrip },
  { band: 'canvas', start: startCanvasField },
  { band: 'export', start: (ctx) => hintInView(ctx.band, armHint, hint) },
  { band: 'close', start: startMark },
];

const UNDO_BANDS: readonly UndoBand[] = ['hero', 'tailor', 'canvas'];

const isTextField = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');

/** The band's live region; the text is cleared first so a repeated sentence is read again. */
function announcer(band: HTMLElement): (text: string) => void {
  const region = band.querySelector<HTMLElement>('[data-announce]');
  return (text) => {
    if (region === null) return;
    region.textContent = '';
    window.setTimeout(() => {
      region.textContent = text;
    }, 30);
  };
}

/**
 * The Undo rule of LANDING.md 2.0: a band's Undo button, or Cmd or Ctrl+Z while focus is inside
 * the band and not in a text field, undoes that band's newest change; in the agents, Present and
 * export bands, or with focus outside every band, the key does nothing. Each button carries
 * `aria-disabled` while its band has nothing to undo, so it keeps focus through its last Undo.
 */
function wireUndo(root: HTMLElement, store: HomeStore): void {
  const buttons = UNDO_BANDS.flatMap((band) =>
    [...root.querySelectorAll<HTMLButtonElement>(`[data-undo="${band}"]`)].map((b) => ({
      band,
      b,
    })),
  );
  const paint = (): void => {
    for (const { band, b } of buttons) {
      b.disabled = false;
      b.setAttribute('aria-disabled', String(!store.canUndo(band)));
    }
  };
  for (const { band, b } of buttons)
    b.addEventListener('click', () => {
      store.undo(band);
    });
  root.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
    if (isTextField(e.target)) return;
    const band = (e.target as Element).closest<HTMLElement>('[data-band]')?.dataset['band'];
    if (!UNDO_BANDS.includes(band as UndoBand)) return;
    e.preventDefault();
    store.undo(band as UndoBand);
  });
  store.subscribe(paint);
  paint();
}

/**
 * The recorded run's three Version history rows as the markup draws them at rest, oldest first
 * (each row's third cell holds its words, `HomeAgents.tsx`). Read from the page so the live chunk
 * does not carry `run.generated.ts` for three sentences (l2.md Q9).
 */
const restRows = (root: HTMLElement): string[] =>
  [...root.querySelectorAll<HTMLElement>('[data-history-row]')]
    .map((row) => row.children[2]?.textContent?.trim() ?? '')
    .filter((words) => words !== '')
    .reverse();

/** Creates the store, starts every registration whose band is on the page and marks ready. */
export function startLive(root: HTMLElement): void {
  // The bands are React's until hydration commits (`main[data-hydrated]`, home.tsx): a write to
  // them before it would be thrown away with a tree React regenerates on a mismatch
  if (!root.hasAttribute('data-hydrated')) {
    const wait = new MutationObserver(() => {
      if (!root.hasAttribute('data-hydrated')) return;
      wait.disconnect();
      startLive(root);
    });
    wait.observe(root, {
      attributes: true,
      attributeFilter: ['data-hydrated'],
    });
    return;
  }
  const store = createHomeStore(restState(HOME_DECK, restRows(root)));
  wireUndo(root, store);
  // every counter on the page and the filmstrip follow the deck's order, whichever band moved it
  store.subscribe((state) => renumber(root, state));
  for (const registration of REGISTRATIONS) {
    const band = root.querySelector<HTMLElement>(`[data-band="${registration.band}"]`);
    if (band === null) continue;
    try {
      registration.start({ root, band, store, announce: announcer(band) });
    } catch (error) {
      console.error(`the ${registration.band} band did not start`, error);
    }
  }
  root.dataset['live'] = 'ready';
}
