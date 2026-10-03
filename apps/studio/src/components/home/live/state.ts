import type { HomeDeckFacts, HomeObjectId, HomeSlideId, SheetBox } from '../deck.generated';

/**
 * The page deck's one store (docs/LANDING.md 2.0 "Undo", 6.3 "State"). L2 owns this file; its
 * exported names and types were fixed on day 0 by the integrator
 * (docs/gslides-parity/landing/build/integrator.md "Landing, day 0", section 4.4) and change only
 * by a request in the build folder. Every band writes through `commit`; Version history, the
 * counters, the show and the print read `get` and `subscribe`.
 *
 * Undo is per band: `undo(band)` takes the newest change of that band only, so a key never
 * changes a band the visitor cannot see. The hero, Tailor (names, kit and filmstrip order, one
 * stack in that order of time) and the canvas have an Undo; the agents, Present and export bands
 * do not. An undo takes the change's Version history row away with it (a cut). The page has no
 * redo. A change's `undo` restores the values it read before it applied, never a relative step,
 * so changes merged by `coalesce` (nudges within 700 ms, 2.2) undo to the state before the first.
 */

/** A band of the page (the `data-band` values that hold a slide). */
export type Band = 'hero' | 'agents' | 'tailor' | 'canvas' | 'present' | 'export';

/** The bands with an Undo button and Cmd or Ctrl+Z (2.0). */
export type UndoBand = 'hero' | 'tailor' | 'canvas';

export type Author = 'you' | 'agent';

/** The example kits (2.5, Kevin's answer 4): GT is the deck's own. */
export type KitId = 'gt' | 'kestrel' | 'fenwick';

/** The recorded run's steps that have landed: 3 at rest, 0 after Run Again's cut (A8). */
export type AgentStep = 0 | 1 | 2 | 3;

export type HistoryRow = {
  id: number;
  author: Author;
  /** the change in words: "Moved the title on slide 1" */
  words: string;
  /** epoch ms; the row prints it in "6:45 PM" form */
  at: number;
  band: Band;
  /** a row of the recorded run, which Run Again removes */
  run: boolean;
  /** a row in the markup at rest, whose time cell reads "Recorded" */
  recorded: boolean;
};

export type HomeDeckState = {
  /** the deck's order; `next-steps` is absent while `agentStep` is 0 */
  order: readonly HomeSlideId[];
  /** the objects moved, resized or turned; an absent object sits at its rendered box */
  poses: Readonly<Partial<Record<HomeObjectId, SheetBox>>>;
  /** the objects whose words the visitor typed; an absent object keeps its rendered text */
  texts: Readonly<Partial<Record<HomeObjectId, string>>>;
  /** the slides turned into a canvas by a first gesture (the Layout row reads Canvas) */
  canvas: Readonly<Partial<Record<HomeSlideId, true>>>;
  /** the customer name in every slide's text and notes */
  customer: string;
  kit: KitId;
  agentStep: AgentStep;
  /** Version history, oldest first */
  history: readonly HistoryRow[];
};

export type Change = {
  band: Band;
  author: Author;
  /** the Version history row's words; null for a change that adds no row (Run Again's cut) */
  words: string | null;
  /** epoch ms; the store stamps the time when absent */
  at?: number;
  /** the state after the change */
  next: (state: HomeDeckState) => HomeDeckState;
  /** the state with this change taken back; null for one Undo never takes (the agent's, the cut) */
  undo: ((state: HomeDeckState) => HomeDeckState) | null;
  /** changes of one band with this key within COALESCE_MS of the last are one step and one row */
  coalesce?: string;
  /** a row of the recorded run, which Run Again removes */
  run?: boolean;
};

export type StoreEvent = {
  kind: 'commit' | 'coalesce' | 'undo';
  change: Change;
  /** the row the event added, updated or removed; null when none */
  row: HistoryRow | null;
};

export type HomeStore = {
  get(): HomeDeckState;
  commit(change: Change): void;
  /** takes back the band's newest change; false when the band has none */
  undo(band: UndoBand): boolean;
  canUndo(band: UndoBand): boolean;
  /** called after every commit and undo; returns the unsubscribe */
  subscribe(fn: (state: HomeDeckState, event: StoreEvent) => void): () => void;
};

/** Nudges within this window are one undo step (2.2, row home.objects.keyboard). */
export const COALESCE_MS = 700;

const UNDO_BANDS: readonly UndoBand[] = ['hero', 'tailor', 'canvas'];

function isUndoBand(band: Band): band is UndoBand {
  return (UNDO_BANDS as readonly Band[]).includes(band);
}

type Entry = { change: Change; rowId: number | null; lastAt: number };

/** The page deck at rest: the run's end, its three rows recorded (2.4 "At rest"). */
export function restState(deck: HomeDeckFacts, runRowWords: readonly string[]): HomeDeckState {
  return {
    order: deck.order,
    poses: {},
    texts: {},
    canvas: {},
    customer: deck.customer,
    kit: 'gt',
    agentStep: 3,
    history: runRowWords.map((words, i) => ({
      id: i + 1,
      author: 'agent',
      words,
      at: 0,
      band: 'agents',
      run: true,
      recorded: true,
    })),
  };
}

export function createHomeStore(initial: HomeDeckState, now: () => number = Date.now): HomeStore {
  let state = initial;
  let nextRowId = initial.history.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const stacks: Record<UndoBand, Entry[]> = { hero: [], tailor: [], canvas: [] };
  const listeners = new Set<(state: HomeDeckState, event: StoreEvent) => void>();

  const emit = (event: StoreEvent): void => {
    for (const fn of [...listeners]) fn(state, event);
  };

  const withRow = (s: HomeDeckState, row: HistoryRow): HomeDeckState => ({
    ...s,
    history: [...s.history, row],
  });

  return {
    get: () => state,

    commit(change) {
      const at = change.at ?? now();
      const stack = isUndoBand(change.band) ? stacks[change.band] : null;
      const last = stack?.[stack.length - 1];
      if (
        change.coalesce !== undefined &&
        last !== undefined &&
        last.change.coalesce === change.coalesce &&
        at - last.lastAt <= COALESCE_MS
      ) {
        state = change.next(state);
        last.lastAt = at;
        let row: HistoryRow | null = null;
        if (last.rowId !== null && change.words !== null) {
          const words = change.words;
          state = {
            ...state,
            history: state.history.map((r) => {
              if (r.id !== last.rowId) return r;
              row = { ...r, words, at };
              return row;
            }),
          };
        }
        emit({ kind: 'coalesce', change, row });
        return;
      }
      state = change.next(state);
      let row: HistoryRow | null = null;
      if (change.words !== null) {
        row = {
          id: nextRowId++,
          author: change.author,
          words: change.words,
          at,
          band: change.band,
          run: change.run === true,
          recorded: false,
        };
        state = withRow(state, row);
      }
      if (stack !== null && change.undo !== null)
        stack.push({ change, rowId: row?.id ?? null, lastAt: at });
      emit({ kind: 'commit', change, row });
    },

    undo(band) {
      const entry = stacks[band].pop();
      if (entry === undefined || entry.change.undo === null) return false;
      state = entry.change.undo(state);
      const row = state.history.find((r) => r.id === entry.rowId) ?? null;
      if (row !== null) state = { ...state, history: state.history.filter((r) => r !== row) };
      emit({ kind: 'undo', change: entry.change, row });
      return true;
    },

    canUndo: (band) => stacks[band].length > 0,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
