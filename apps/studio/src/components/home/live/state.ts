import type { HomeDeckFacts, HomeObjectId, HomeSlideId, SheetBox } from '../deck.generated';

/**
 * The page deck's one store (docs/LANDING.md 2.0 "Undo" and "The page deck", 6.3 "The store").
 * V2 owns this file (LANDING.md 6.4). Every band writes through `commit`; Version history, the
 * scrubber, the counters, the show and the print read `get`, `versions` and `subscribe`.
 *
 * The store is a log of changes over a base state, the deck before the recorded run (slide 5
 * absent). The run's three steps are the log's first three entries, recorded, so Version history
 * starts with their rows and the scrubber with their versions (2.9). The state is the log replayed
 * over the base, and each entry keeps the state after it, which is its version: version 1 is the
 * base and version k + 1 the state after the k-th entry that writes a row.
 *
 * Undo is per band (2.0): `undo(band)` takes that band's newest change out of the log, its row and
 * its version with it, and replays every later change over the state before it. So an Undo never
 * leaves a later version holding the undone change, and a restore after it cannot bring it back.
 * The changes merged by `coalesce` (nudges within 700 ms, 2.2) are one entry, one row and one
 * version. A change whose `undo` is null (an agent's, a restore) never enters an Undo stack. The
 * page has no redo.
 */

/** A band of the page (the `data-band` values whose bands write the deck). */
export type Band =
  | 'hero'
  | 'menus'
  | 'canvas'
  | 'tailor'
  | 'kits'
  | 'agents'
  | 'people'
  | 'present'
  | 'export'
  | 'patterns';

/** The bands with an Undo (2.0): the hero frame, the menus band, the canvas, Tailor, the kits. */
export type UndoBand = 'hero' | 'menus' | 'canvas' | 'tailor' | 'kits';

export const UNDO_BANDS: readonly UndoBand[] = ['hero', 'menus', 'canvas', 'tailor', 'kits'];

export type Author = 'you' | 'agent';

/** The kits (2.8): GT is the deck's own; Kestrel and Globex are example customers' kits. */
export type KitId = 'gt' | 'kestrel' | 'globex';

/** The recorded run's steps that have landed: 3 at rest, 0 in the deck before the run. */
export type AgentStep = 0 | 1 | 2 | 3;

/** A slide a menu row added: New slide (`added-<k>` from the blank layout) or Duplicate slide. */
export type AddedSlideId = `added-${number}`;

/** A slide of the page deck: one of the fixture's, or one a menu row added. */
export type SlideKey = HomeSlideId | AddedSlideId;

/** An object of a slide: `<slide>#<block>` (a slide added by a menu row carries its own key). */
export type ObjectKey = HomeObjectId | `${AddedSlideId}#${string}`;

export type AddedSlide = {
  id: AddedSlideId;
  /** the slide it copies, or the renderer's blank layout (2.5 Insert > New slide) */
  from: SlideKey | 'blank';
};

/** The kinds of block a menu row inserts (2.5): a text box, two shapes, a copy of an object. */
export type InsertedKind = 'text' | 'rect' | 'oval' | 'copy';

export type InsertedBlock = {
  /** `<slide>#ins-<k>` */
  id: ObjectKey;
  slide: SlideKey;
  kind: InsertedKind;
  /** the object a copy repeats (Edit > Duplicate) */
  source?: ObjectKey;
  /** where it was inserted, in sheet units; a later move is a pose */
  box: SheetBox;
};

/** What Format and Arrange rows set on an object (2.5): the run weight, the line, the side, the z. */
export type BlockStyle = {
  bold?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  z?: 'front' | 'back';
};

export type HistoryRow = {
  id: number;
  author: Author;
  /** the change in words: "Moved the title on slide 1" */
  words: string;
  /** epoch ms; the row prints it in "6:45 PM" form; 0 for a recorded row */
  at: number;
  band: Band;
  /** a row of the recorded run */
  run: boolean;
  /** a row in the markup at rest, whose time cell reads "Recorded" */
  recorded: boolean;
  /** the version a restore's row brought back (v3.md R11) */
  restoredFrom?: number;
};

export type HomeDeckState = {
  /** the deck's order; `next-steps` is absent while `agentStep` is 0 */
  order: readonly SlideKey[];
  /** the objects moved, resized or turned; an absent object sits at its rendered box */
  poses: Readonly<Partial<Record<ObjectKey, SheetBox>>>;
  /** the objects whose words the visitor typed; an absent object keeps its rendered text */
  texts: Readonly<Partial<Record<ObjectKey, string>>>;
  /** the slides turned into a canvas by a first gesture (the Layout row reads Canvas) */
  canvas: Readonly<Partial<Record<SlideKey, true>>>;
  /** the customer name in every slide's text and notes */
  customer: string;
  kit: KitId;
  /** a background typed in the kits band (`#rrggbb`), over the kit's; null for the kit's own */
  background: string | null;
  agentStep: AgentStep;
  /** the slides Slide > Skip slide or a chip skipped: left out of the show and the print */
  skipped: Readonly<Partial<Record<SlideKey, true>>>;
  /** slide 5's two looks a chip makes (2.9, v3.md R10): the turned title and the rewritten row */
  nextSteps: { turned: boolean; rewritten: boolean };
  /** File > Rename */
  deckTitle: string;
  /** the slides a menu row added, by id and source */
  added: readonly AddedSlide[];
  /** the fixture's slides a menu row deleted (their ids leave `order`) */
  removed: readonly SlideKey[];
  /** the blocks a menu row inserted */
  blocks: readonly InsertedBlock[];
  /** the objects Edit > Delete took off their slide */
  deleted: readonly ObjectKey[];
  /** Format and Arrange rows, by object */
  styles: Readonly<Partial<Record<ObjectKey, BlockStyle>>>;
  /** the speaker notes typed in the miniature; an absent slide keeps its rendered notes */
  notes: Readonly<Partial<Record<SlideKey, string>>>;
  /** File > Version history > Name current version: the name, by version number */
  versionNames: Readonly<Record<number, string>>;
  /** Version history, oldest first (derived from the log; a change's `next` never writes it) */
  history: readonly HistoryRow[];
};

export type Change = {
  band: Band;
  author: Author;
  /** the Version history row's words; null for a change that adds no row and no version */
  words: string | null;
  /** epoch ms; the store stamps the time when absent */
  at?: number;
  /** the state after the change; replayed after an Undo, so it reads only its argument */
  next: (state: HomeDeckState) => HomeDeckState;
  /**
   * Non-null when the band's Undo may take the change back. The store takes a change back by
   * replaying the log without it, so the function is not called; it is kept for the first pass's
   * callers and for a reader of the change.
   */
  undo: ((state: HomeDeckState) => HomeDeckState) | null;
  /** changes of one band with this key within COALESCE_MS of the last are one step and one row */
  coalesce?: string;
  /** a row of the recorded run */
  run?: boolean;
  /** the slide the change touched, which the scrubber shows (absent: a change of the whole deck) */
  slide?: SlideKey;
  /** a restore's version number, which its row carries (v3.md R11) */
  restoredFrom?: number;
};

export type StoreEvent = {
  kind: 'commit' | 'coalesce' | 'undo';
  change: Change;
  /** the row the event added, updated or removed; null when none */
  row: HistoryRow | null;
};

/** One version of the page deck (2.9 "The scrubber"). */
export type Version = {
  /** 1 is the deck before the recorded run */
  n: number;
  author: Author;
  /** the row's words; the base reads its own sentence, which the caption does not print */
  words: string;
  /** epoch ms; 0 for the recorded versions */
  at: number;
  /** the base and the run's three steps */
  recorded: boolean;
  /** the slide the version changed; absent for the base and a change of the whole deck */
  slide: SlideKey | null;
  /** the row that wrote it; null for the base */
  rowId: number | null;
  /** the deck as the version left it, `history` included as it stood then */
  state: HomeDeckState;
};

export type HomeStore = {
  get(): HomeDeckState;
  commit(change: Change): void;
  /** takes back the band's newest change; false when the band has none */
  undo(band: UndoBand): boolean;
  canUndo(band: UndoBand): boolean;
  /** every version, oldest first: the base, the run's three steps, one per change with a row */
  versions(): readonly Version[];
  /** the state at version n (1 to `versions().length`); undefined past either end */
  version(n: number): HomeDeckState | undefined;
  /** one change whose state is version n's, adding its row and version (2.9); false past either end */
  restore(n: number, author: Author, words: string, band?: Band): boolean;
  /** the current state, for a clone that must not follow later changes (6.3 "Exports") */
  snapshot(): HomeDeckState;
  /** called after every commit and undo; returns the unsubscribe */
  subscribe(fn: (state: HomeDeckState, event: StoreEvent) => void): () => void;
};

/** Nudges within this window are one undo step (2.2, row home.objects.keyboard). */
export const COALESCE_MS = 700;

/** The deck's order with `id` placed after `after` (or at the end when `after` is absent). */
export function insertAfter(order: readonly SlideKey[], after: SlideKey, id: SlideKey): SlideKey[] {
  const rest = order.filter((s) => s !== id);
  const at = rest.indexOf(after);
  if (at < 0) return [...rest, id];
  return [...rest.slice(0, at + 1), id, ...rest.slice(at + 1)];
}

/** The fixture's slide a key draws: itself, or the slide an added slide copies; 'blank' for New slide. */
export function sourceOf(
  state: Pick<HomeDeckState, 'added'>,
  key: SlideKey,
): HomeSlideId | 'blank' {
  let at: SlideKey | 'blank' = key;
  for (let guard = 0; guard < 64; guard += 1) {
    if (at === 'blank') return 'blank';
    const added = state.added.find((a) => a.id === at);
    if (added === undefined) return at as HomeSlideId;
    at = added.from;
  }
  return 'blank';
}

/** The recorded run's three steps, as the fixture's deck reaches the page deck (2.0, 2.2). */
function runChange(n: 1 | 2 | 3, words: string): Change {
  return {
    band: 'agents',
    author: 'agent',
    words,
    at: 0,
    run: true,
    undo: null,
    slide: 'next-steps' as HomeSlideId,
    next: (s) => ({
      ...s,
      agentStep: n,
      order:
        n === 1 && !s.order.includes('next-steps' as HomeSlideId)
          ? insertAfter(s.order, 'ships' as HomeSlideId, 'next-steps' as HomeSlideId)
          : s.order,
    }),
  };
}

/** The deck before the recorded run: the fixture, slide 5 absent (2.9 "The versions"). */
export function baseState(deck: HomeDeckFacts): HomeDeckState {
  return {
    order: deck.startOrder,
    poses: {},
    texts: {},
    canvas: {},
    customer: deck.customer,
    kit: 'gt',
    background: null,
    agentStep: 0,
    skipped: {},
    nextSteps: { turned: false, rewritten: false },
    deckTitle: deck.title,
    added: [],
    removed: [],
    blocks: [],
    deleted: [],
    styles: {},
    notes: {},
    versionNames: {},
    history: [],
  };
}

/** The store's start: the base and the run's three steps with their recorded rows (2.9 "At rest"). */
export type RestStart = { base: HomeDeckState; run: readonly Change[] };

/**
 * The page deck at rest: the run's end, its three rows recorded (2.0 "At rest"). The words are the
 * markup's resting rows, oldest first (`index.ts` reads them from the page so the core does not
 * carry the recording); fewer than three words record that many steps.
 */
export function restState(deck: HomeDeckFacts, runRowWords: readonly string[]): RestStart {
  const run = runRowWords.slice(0, 3).map((words, i) => runChange((i + 1) as 1 | 2 | 3, words));
  return { base: baseState(deck), run };
}

type Entry = {
  change: Change;
  /** every `next` merged into the entry, in order */
  nexts: ((state: HomeDeckState) => HomeDeckState)[];
  row: HistoryRow | null;
  recorded: boolean;
  lastAt: number;
  /** the state after the entry, `history` included */
  after: HomeDeckState;
};

export function createHomeStore(start: RestStart, now: () => number = Date.now): HomeStore {
  const base = start.base;
  const log: Entry[] = [];
  let nextRowId = 1;
  const listeners = new Set<(state: HomeDeckState, event: StoreEvent) => void>();

  const stateAfter = (i: number): HomeDeckState => (i < 0 ? base : (log[i]?.after ?? base));

  /** recomputes every entry's state from index `from` on */
  const replay = (from: number): void => {
    let s = stateAfter(from - 1);
    for (let i = Math.max(0, from); i < log.length; i += 1) {
      const entry = log[i] as Entry;
      const history = entry.row === null ? s.history : [...s.history, entry.row];
      for (const next of entry.nexts) s = next(s);
      s = { ...s, history };
      entry.after = s;
    }
  };

  const get = (): HomeDeckState => stateAfter(log.length - 1);

  const emit = (event: StoreEvent): void => {
    const state = get();
    for (const fn of [...listeners]) fn(state, event);
  };

  const append = (change: Change, recorded: boolean): HistoryRow | null => {
    const at = change.at ?? now();
    const row: HistoryRow | null =
      change.words === null
        ? null
        : {
            id: nextRowId++,
            author: change.author,
            words: change.words,
            at,
            band: change.band,
            run: change.run === true,
            recorded,
            ...(change.restoredFrom !== undefined ? { restoredFrom: change.restoredFrom } : {}),
          };
    const entry: Entry = { change, nexts: [change.next], row, recorded, lastAt: at, after: base };
    log.push(entry);
    replay(log.length - 1);
    return row;
  };

  for (const change of start.run) append(change, true);

  const versions = (): Version[] => {
    const list: Version[] = [
      {
        n: 1,
        author: 'agent',
        words: '',
        at: 0,
        recorded: true,
        slide: null,
        rowId: null,
        state: base,
      },
    ];
    for (const entry of log) {
      if (entry.row === null) {
        // a change with no row folds into the version before it
        const last = list[list.length - 1] as Version;
        list[list.length - 1] = { ...last, state: entry.after };
        continue;
      }
      list.push({
        n: list.length + 1,
        author: entry.row.author,
        words: entry.row.words,
        at: entry.row.at,
        recorded: entry.recorded,
        slide: entry.change.slide ?? null,
        rowId: entry.row.id,
        state: entry.after,
      });
    }
    return list;
  };

  const newestOf = (band: UndoBand): number => {
    for (let i = log.length - 1; i >= 0; i -= 1) {
      const c = (log[i] as Entry).change;
      if (c.band === band && c.undo !== null && !(log[i] as Entry).recorded) return i;
    }
    return -1;
  };

  const store: HomeStore = {
    get,

    commit(change) {
      const at = change.at ?? now();
      const last = log[log.length - 1];
      if (
        change.coalesce !== undefined &&
        last !== undefined &&
        last.change.band === change.band &&
        last.change.coalesce === change.coalesce &&
        at - last.lastAt <= COALESCE_MS
      ) {
        last.nexts.push(change.next);
        last.lastAt = at;
        if (last.row !== null && change.words !== null)
          last.row = { ...last.row, words: change.words, at };
        replay(log.length - 1);
        emit({ kind: 'coalesce', change, row: last.row });
        return;
      }
      const row = append({ ...change, at }, false);
      emit({ kind: 'commit', change, row });
    },

    undo(band) {
      const i = newestOf(band);
      if (i < 0) return false;
      const [entry] = log.splice(i, 1) as [Entry];
      replay(i);
      emit({ kind: 'undo', change: entry.change, row: entry.row });
      return true;
    },

    canUndo: (band) => newestOf(band) >= 0,

    versions,

    version(n) {
      return versions()[n - 1]?.state;
    },

    restore(n, author, words, band = 'agents') {
      const target = versions()[n - 1];
      if (target === undefined) return false;
      const { history: _history, ...kept } = target.state;
      store.commit({
        band,
        author,
        words,
        undo: null,
        restoredFrom: n,
        ...(target.slide !== null ? { slide: target.slide } : {}),
        next: (s) => ({ ...s, ...kept, versionNames: s.versionNames }),
      });
      return true;
    },

    snapshot: get,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return store;
}
