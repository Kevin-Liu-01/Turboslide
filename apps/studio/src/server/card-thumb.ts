import { deckAppearance } from '@turboslide/schema/deck';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { isUnsavedDraft, openDeckStore } from './root';
import { DEFAULT_THUMB_WIDTH, afterResponse, warmThumbs } from './thumbs';

/**
 * The card's capture on save (the product round, docs/PRODUCT.md 3.6 and section 7 B7 "thumbs.ts
 * (the capture on save for the cards)"; the row `decks.card.thumbnail-slide-1`: a card shows slide
 * 1's render within 10 s of the first edit). The home cards ask the render route for slide 1 at
 * 320 px under the deck's revision; before this round nothing rendered that picture until a card
 * asked for it, so `/decks` queued one Chromium render per card per load and 47 of 48 cards on
 * production were plates (audit-interface 2). Now every admitted write of a deck notes it here,
 * and this instance renders slide 1 in the deck's appearance once the writes have settled for
 * `CARD_THUMB_SETTLE_MS`, at most once per `CARD_THUMB_FLOOR_MS` per deck, through `warmThumbs`
 * (a cache hit costs one head; a render costs one render job and one put under the slide's
 * content stamp, which the card's request then reads, thumbs.ts step 2b). The work runs behind
 * the response (`afterResponse`, Vercel's `waitUntil`).
 *
 * The blob tier budget (docs/sessions-polling.md; VERIFICATION.md C3S.2a) is untouched: no timer
 * polls anything; the render is an event of the write, floored so a typing burst renders once,
 * and a deck no one edits costs nothing. The scheduler is pure over injected clocks so its floor
 * and settle are unit tested (card-thumb.test.ts); the runtime binding at the foot renders.
 *
 * The sync and costs round (docs/SYNC.md 3.10, 4.4 rank 2; audit-costs item 6): the card renders
 * once when the deck has rested CARD_THUMB_SETTLE_MS (30 s, from 2 s), once when the tab hides
 * and once when the stream closes (`flush`, called by the stream's closer and the presence route
 * on the client's hide), with the floor kept for a burst that never rests. Before this a person
 * typing into slide 1 rendered it in Chromium every 8 s (885 renders and 824 CPU s in seven days
 * of production for the title alone); a typing hour is now at most two renders plus the one at
 * the end. The row `decks.card.thumbnail-slide-1` reads its bound from the flush at the stream's
 * close, not from the settle: a seller who edits and leaves has the card within seconds.
 */

/**
 * How long the writes of a deck rest before its card renders: a typing burst renders once, and
 * a seller mid edit is not rendered every few seconds (docs/SYNC.md 3.10).
 */
export const CARD_THUMB_SETTLE_MS = 30_000;
/** At most one card render per deck per instance in this window. */
export const CARD_THUMB_FLOOR_MS = 8_000;

export type CardThumbScheduler = {
  /** A write landed on the deck: schedule its card's render (nothing when one is pending). */
  note: (deckId: string) => void;
  /**
   * The tab hid or the stream closed: a pending render runs now instead of at the settle, at
   * the floor when the last render is younger than it; nothing when no render is pending (the
   * deck's card is current already). Answers true when a render was moved up.
   */
  flush: (deckId: string) => boolean;
  /** The decks with a render pending on this instance. */
  pending: () => string[];
  /** Cancels every pending render (tests, a closing process). */
  stop: () => void;
};

export type CardThumbClock = {
  now: () => number;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

/**
 * The scheduler: one pending render per deck at most, fired `settleMs` after the note unless the
 * deck rendered inside the last `floorMs`, in which case at the floor. A note while a render is
 * pending changes nothing: the pending render reads the deck as it stands when it runs. `run`
 * never throws into the caller; a failure is logged and the next write schedules again.
 */
export function createCardThumbScheduler(
  run: (deckId: string) => Promise<void>,
  options: {
    settleMs?: number;
    floorMs?: number;
    clock?: CardThumbClock;
    log?: (line: string) => void;
  } = {},
): CardThumbScheduler {
  const settleMs = options.settleMs ?? CARD_THUMB_SETTLE_MS;
  const floorMs = options.floorMs ?? CARD_THUMB_FLOOR_MS;
  const clock: CardThumbClock = options.clock ?? {
    now: () => Date.now(),
    setTimeout: (fn, ms) => {
      const handle = setTimeout(fn, ms);
      handle.unref?.();
      return handle;
    },
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const log = options.log ?? ((line: string) => console.error(`turboslide card thumb: ${line}`));
  const timers = new Map<string, unknown>();
  const lastRunAt = new Map<string, number>();
  /** Arms the deck's one render `delay` from now (the caller cleared any earlier timer). */
  const arm = (deckId: string, delay: number): void => {
    const handle = clock.setTimeout(() => {
      timers.delete(deckId);
      lastRunAt.set(deckId, clock.now());
      run(deckId).catch((error: unknown) => {
        log(`${deckId}: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, delay);
    timers.set(deckId, handle);
  };
  /** How long the floor still holds the deck's next render, 0 when it does not. */
  const floorLeft = (deckId: string, t: number): number => {
    const last = lastRunAt.get(deckId);
    return last === undefined ? 0 : Math.max(0, last + floorMs - t);
  };
  return {
    note(deckId) {
      if (!SLUG_PATTERN.test(deckId) || timers.has(deckId)) return;
      const t = clock.now();
      arm(deckId, Math.max(settleMs, floorLeft(deckId, t)));
    },
    flush(deckId) {
      const handle = timers.get(deckId);
      if (handle === undefined) return false;
      clock.clearTimeout(handle);
      timers.delete(deckId);
      arm(deckId, floorLeft(deckId, clock.now()));
      return true;
    },
    pending: () => [...timers.keys()],
    stop() {
      for (const handle of timers.values()) clock.clearTimeout(handle);
      timers.clear();
    },
  };
}

/**
 * Renders the card's picture of one deck: slide 1 at 320 px in the deck's appearance, under its
 * content stamp, on this instance's disk and in the store (thumbs.ts warmThumbs). An unsaved
 * draft and a deck with no slide render nothing.
 */
export async function renderCardThumb(deckId: string): Promise<void> {
  if (await isUnsavedDraft(deckId)) return;
  const { document } = await (await openDeckStore(deckId)).read();
  const first = document.deck.sections.flatMap((section) => section.slideIds)[0];
  if (first === undefined) return;
  await warmThumbs({
    deckId,
    theme: deckAppearance(document.deck),
    width: DEFAULT_THUMB_WIDTH,
    slideIds: [first],
  });
}

const SCHEDULER = Symbol.for('turboslide.studio.cardThumbs');

function scheduler(): CardThumbScheduler {
  const store = globalThis as unknown as Record<symbol, CardThumbScheduler | undefined>;
  return (store[SCHEDULER] ??= createCardThumbScheduler(
    (deckId) =>
      new Promise<void>((resolve) => {
        afterResponse(renderCardThumb(deckId).finally(resolve), `card ${deckId}`);
      }),
  ));
}

/** A write landed on the deck: its card renders once the writes settle (the runtime binding). */
export function scheduleCardThumb(deckId: string): void {
  scheduler().note(deckId);
}

/**
 * The tab hid or the deck's stream closed on this instance (docs/SYNC.md 3.10): a render that
 * waits for the settle runs now, at the floor when one ran inside it; nothing when none waits.
 * The stream's closer and the presence route call it (the realtime core and the client own
 * those two calls; build/b3.md names the requests).
 */
export function flushCardThumb(deckId: string): boolean {
  return scheduler().flush(deckId);
}
