import { TAILOR as PRODUCT } from '@turboslide/chrome/panels/assist-strings';

import { HISTORY, TAILOR } from '../copy';
import { startFilmstrip } from './filmstrip';
import type { LiveContext } from './index';
import { ms, play, reduced, sequence, slowFactor } from './motion';
import { applyCustomer, customerText, markCustomer, noteCustomer } from './paint';
import type { AgentStep, HomeDeckState, SlideKey } from './state';

/**
 * Tools > Tailor for a customer on the page (docs/LANDING.md 2.5; the product's words are
 * `packages/chrome/src/panels/assist-strings.ts` TAILOR): a name typed in With and Apply or Enter
 * replaces every "Northwind" in the deck's text and notes, on every slide, as one change, in
 * reading order; the stage, the thumbnails and every other slide on the page show it; Undo puts
 * every name back. The count is the product's `TAILOR.count` with the figures the CLI recorded for
 * the deck the page holds (`run.generated.ts` `tailorCounts`: the fixture without slide 5 and the
 * page deck with it). The names are set 55 ms apart in reading order and lit as selected text for
 * 900 ms (3.2 T1); the snackbar reads `TAILOR.result` with Undo and leaves by a cut on the band's
 * next change, its Undo or Escape, never on a timer (T2, T7).
 *
 * The store's `customer` is the one source: a rename from any band (the agents panel's typed
 * `tailor --replace`, l3.md R12) is drawn here, and the show, the print and the agents band's
 * inserted markup call `applyCustomer` and `customerText` (exported for them).
 */

/** The stagger between names and the hold of the lit names (3.2 T1, 3.3): holds, not tokens. */
const NAME_STAGGER_MS = 55;
const NAME_GROUP = 7;
const LIT_MS = 900;

/** The product's maximum (the field's `maxlength`, LANDING.md 2.4). */
const NAME_MAX = 24;

/* the customer's name on any slide is drawn by paint.ts; these are kept here for the bands that
   imported them from Tailor in the first pass (l3.md R12) */
export { applyCustomer, customerText, markCustomer };

/**
 * The CLI's answer to `tailor --replace=Northwind=Globex` on each deck the page can hold: slide 5
 * absent, with its placeholders, titled and filled, which are the agents run's steps 0 to 3. The
 * figures are the recording's (`run.generated.ts`: the typed `tailor` answers and `tailorCounts`),
 * copied here so the live chunk carries no recording (row home.budget.live-module: push 3's chunk
 * reads 54 KB decoded and 15.9 KB gzip with `run.generated.ts` in it, 34.5 KB and 13.0 KB without)
 * and held equal to it by tailor.test.ts. `HOME_DECK.tailorCounts` replaces this copy once the
 * build writes it (l2.md Q9).
 */
const PLACES: Readonly<Record<AgentStep, { places: number; slides: number }>> = {
  0: { places: 11, slides: 5 },
  1: { places: 11, slides: 5 },
  2: { places: 12, slides: 6 },
  3: { places: 13, slides: 6 },
};

/** The places and slides of the customer's name in the deck the page holds (LANDING.md 2.5). */
export function tailorPlaces(step: AgentStep): { places: number; slides: number } {
  return PLACES[step];
}

export type Snackbar = { show(text: string): void; hide(): void };

function snackbar(ctx: LiveContext): Snackbar {
  const bar = ctx.band.querySelector<HTMLElement>('[data-snackbar]');
  const text = bar?.querySelector<HTMLElement>('[data-snackbar-text]') ?? bar;
  // a snackbar Undo that is also `[data-undo="tailor"]` is wired by index.ts with the band's
  const undo = bar?.querySelector<HTMLElement>('[data-snackbar-undo]:not([data-undo])');
  undo?.addEventListener('click', () => {
    ctx.store.undo('tailor');
  });
  /** the running entrance (T2), ended at once when the bar leaves */
  let entering: Animation | null = null;
  return {
    show(words) {
      if (bar === null || text === null || text === undefined) return;
      entering?.cancel();
      text.textContent = words;
      bar.setAttribute('data-on', '');
      // T2: the bar enters over the state duration with an 8 px rise; at once under reduced motion
      entering = play(
        bar,
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'none' },
        ],
        'state',
        'arrive',
        'tailor',
      );
      ctx.announce(words);
    },
    hide() {
      // the bar at rest is its end state, so a cancelled entrance leaves it whole
      entering?.cancel();
      entering = null;
      if (bar === null || !bar.hasAttribute('data-on')) return;
      // T7: the bar leaves by a cut
      bar.removeAttribute('data-on');
      if (text !== null && text !== undefined && text !== bar) text.textContent = '';
    },
  };
}

/** Starts Tailor and the filmstrip on the Tailor band. */
export function startTailor(ctx: LiveContext): void {
  const { band, root, store } = ctx;
  const field = band.querySelector<HTMLInputElement>('[data-tailor-to]');
  const apply = band.querySelector<HTMLElement>('[data-tailor-apply]');
  const count = band.querySelector<HTMLElement>('[data-tailor-count]');
  const snack = snackbar(ctx);
  let shown = store.get().customer;

  /** the count of the deck the page holds, as the markup draws it at rest (HomeTailor.tsx) */
  const paintCount = (): void => {
    if (count === null) return;
    const { places, slides } = tailorPlaces(store.get().agentStep);
    const text = PRODUCT.count(places, slides);
    if (count.textContent !== text) count.textContent = text;
  };

  const submit = (): void => {
    if (field === null) return;
    const to = field.value.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
    if (to === '') {
      if (count !== null) count.textContent = TAILOR.empty;
      ctx.announce(TAILOR.empty);
      field.focus();
      return;
    }
    const from = store.get().customer;
    field.value = '';
    if (to === from) return paintCount();
    store.commit({
      band: 'tailor',
      author: 'you',
      words: HISTORY.tailored(to),
      next: (s) => ({ ...s, customer: to }),
      undo: (s) => ({ ...s, customer: from }),
    });
    paintCount();
  };

  field?.setAttribute('maxlength', String(NAME_MAX));
  field?.addEventListener('input', paintCount);
  field?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submit();
  });
  apply?.addEventListener('click', (e) => {
    e.preventDefault();
    submit();
  });
  apply?.closest('form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  // Cancel is the form's reset (DESIGN.md 8.6): With empties itself; the count reads the deck again
  apply?.closest('form')?.addEventListener('reset', () => {
    paintCount();
    field?.focus();
  });
  band.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') snack.hide();
  });

  /** The page's elements that spell the customer: every slide and the Present list's titles. */
  const holders = (): Element[] => [
    ...root.querySelectorAll('[data-home-slides], [data-slide-row]'),
  ];

  /** ends a running rename at its end state: its names set, unlit, its timers cleared */
  let stopLighting: (() => void) | null = null;
  const rename = (from: string, to: string, animate: boolean): void => {
    stopLighting?.();
    for (const el of band.querySelectorAll('[data-tailor-from]')) el.textContent = to;
    for (const thumb of root.querySelectorAll('[data-thumb][aria-label]')) {
      const label = thumb.getAttribute('aria-label') ?? '';
      thumb.setAttribute('aria-label', label.split(from).join(to));
    }
    const order = store.get().order;
    const offsets = new Map<SlideKey, number>();
    const marked: { span: HTMLElement; at: number }[] = [];
    for (const el of holders()) {
      if (el instanceof HTMLElement && el.matches('[data-home-slides]')) noteCustomer(el, to);
      const spans = markCustomer(el, from);
      const slide = (el as HTMLElement).dataset['slide'] as SlideKey | undefined;
      if (!animate || slide === undefined) {
        for (const span of spans) span.textContent = to;
        continue;
      }
      if (!offsets.has(slide)) offsets.set(slide, spans.length);
      for (const [i, span] of spans.entries()) marked.push({ span, at: i });
    }
    if (!animate) return;
    // reading order: the slide's place in the deck, then the name's place on the slide
    const before = new Map<SlideKey, number>();
    let sum = 0;
    for (const id of order) {
      before.set(id, sum);
      sum += offsets.get(id) ?? 0;
    }
    const k = slowFactor();
    const fade = ms('state');
    const timers: number[] = [];
    // lit: selection.css's `.ts-home-lit`, the selected text's ground in --pt-select; it goes over
    // the state duration (T1, 160 ms), a cut under reduced motion
    const light = (span: HTMLElement, on: boolean): void => {
      span.style.transition = on || fade === 0 ? 'none' : `background-color ${fade}ms ease-out`;
      span.classList.toggle('ts-home-lit', on);
    };
    const end = (): void => {
      for (const t of timers) window.clearTimeout(t);
      for (const { span } of marked) {
        span.textContent = to;
        light(span, false);
        span.style.removeProperty('transition');
      }
      run.done();
      if (stopLighting === end) stopLighting = null;
    };
    const run = sequence('tailor', end);
    stopLighting = end;
    let last = 0;
    for (const { span, at } of marked) {
      const slide = (span.closest<HTMLElement>('[data-home-slides]')?.dataset['slide'] ??
        'title') as SlideKey;
      const place = (before.get(slide) ?? 0) + at;
      // under reduced motion the names are set at once and lit and unlit by cuts (2.5, 3.6)
      const delay = reduced() ? 0 : Math.min(place, NAME_GROUP - 1) * NAME_STAGGER_MS * k;
      last = Math.max(last, delay);
      timers.push(
        window.setTimeout(() => {
          span.textContent = to;
          light(span, true);
        }, delay),
        window.setTimeout(() => light(span, false), delay + LIT_MS * k),
      );
    }
    timers.push(window.setTimeout(end, last + LIT_MS * k + fade + 20));
  };

  store.subscribe((state: HomeDeckState, event) => {
    const renamed = state.customer !== shown;
    if (renamed) {
      const from = shown;
      shown = state.customer;
      // a restore sets the version's names by a cut, as every other band takes the version (2.9)
      rename(
        from,
        state.customer,
        event.kind === 'commit' && event.change.restoredFrom === undefined,
      );
    }
    paintCount();
    if (event.change.band !== 'tailor') return;
    if (event.kind === 'commit' && renamed) {
      const { places, slides } = tailorPlaces(state.agentStep);
      snack.show(PRODUCT.result(state.customer, places, slides, 0));
    } else snack.hide();
  });

  startFilmstrip(ctx, snack);
}

/** The band entry the loader starts (LANDING.md 6.3 "The band loader"). */
export const start = startTailor;
