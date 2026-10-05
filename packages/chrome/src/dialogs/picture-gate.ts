/**
 * A bound on the pictures a list loads at once (round1/build/ha.md "Round 1 fix round" request 1):
 * the Import slides dialog drew a fresh copy's 95 tiles and the browser asked for every tile
 * picture at once. A dev server rendered them one at a time behind the import's own request, and
 * on the blob tier 95 cold renders made the store refuse the import for 60 s. A tile asks the gate
 * for a turn before it sets its `src`; at most `limit` turns are out at once.
 *
 * The places go to the pictures a person can see (the Round 1 follow-up, lane A item 2;
 * VERIFICATION.md "Round 1, pass 2" P2-1). Before, a tile kept its place from the first time it
 * came near the list's visible area until it unmounted, so a person who scrolled to the end of 95
 * tiles saw the tiles in view stay blank behind every tile scrolled past (on production 8 blank
 * tiles 20 s after the scroll). Now a tile that leaves gives its place back, waiting or started.
 * The waiting tiles in view start before the tiles that are only near the view, each rank in the
 * order it asked. A tile in view that waits while a tile only near the view holds a turn takes
 * that turn: the near tile is stopped and waits again in its asking order.
 */
export type PictureTurn = {
  /** Moves the tile between the two ranks: in view, or only near the view. */
  see: (inView: boolean) => void;
  /**
   * Gives the place back: a waiting tile leaves the queue, a started one frees its turn for the
   * next tile. The picture loaded, failed or left; a second call changes nothing.
   */
  release: () => void;
};

export type PictureGate = {
  /**
   * Asks for a turn. `start` runs when one is free (at once when one is free now). `stop` runs
   * when a tile in view takes the turn of this started tile while it is only near the view; the
   * tile then waits for a turn again and `start` runs again when it gets one.
   */
  ask: (start: () => void, inView: boolean, stop?: () => void) => PictureTurn;
  /** The turns out now and the tiles waiting, for tests. */
  readonly counts: () => { active: number; waiting: number };
};

/** The pictures one list loads at once: a browser's six connections to one HTTP/1.1 host. */
export const PICTURES_IN_FLIGHT = 6;

type Entry = {
  start: () => void;
  stop: (() => void) | undefined;
  inView: boolean;
  /** the order of asking, which each rank keeps */
  order: number;
  state: 'waiting' | 'started' | 'released';
};

export function pictureGate(limit: number = PICTURES_IN_FLIGHT): PictureGate {
  let asked = 0;
  /* in the order the tiles asked */
  const waiting: Entry[] = [];
  /* in the order they started */
  const started: Entry[] = [];
  const wait = (entry: Entry): void => {
    entry.state = 'waiting';
    const at = waiting.findIndex((other) => other.order > entry.order);
    if (at < 0) waiting.push(entry);
    else waiting.splice(at, 0, entry);
  };
  const balance = (): void => {
    for (;;) {
      if (started.length < limit && waiting.length > 0) {
        /* the first waiting tile in view, else the first one */
        const seen = waiting.findIndex((entry) => entry.inView);
        const [entry] = waiting.splice(seen >= 0 ? seen : 0, 1);
        entry!.state = 'started';
        started.push(entry!);
        entry!.start();
        continue;
      }
      /* every turn is out and a tile in view waits: the last near tile to start gives its turn */
      if (!waiting.some((entry) => entry.inView)) return;
      const near = started.findLastIndex((entry) => !entry.inView && entry.stop !== undefined);
      if (near < 0) return;
      const [stopped] = started.splice(near, 1);
      wait(stopped!);
      stopped!.stop!();
    }
  };
  return {
    ask(start, inView, stop) {
      asked += 1;
      const entry: Entry = { start, stop, inView, order: asked, state: 'waiting' };
      waiting.push(entry);
      balance();
      return {
        see(seen) {
          if (entry.inView === seen) return;
          entry.inView = seen;
          if (entry.state !== 'released') balance();
        },
        release() {
          if (entry.state === 'waiting') {
            const at = waiting.indexOf(entry);
            if (at >= 0) waiting.splice(at, 1);
          } else if (entry.state === 'started') {
            const at = started.indexOf(entry);
            if (at >= 0) started.splice(at, 1);
          }
          const freed = entry.state === 'started';
          entry.state = 'released';
          if (freed) balance();
        },
      };
    },
    counts: () => ({ active: started.length, waiting: waiting.length }),
  };
}
