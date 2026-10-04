/**
 * A bound on the pictures a list loads at once (round1/build/ha.md "Round 1 fix round" request 1):
 * the Import slides dialog drew a fresh copy's 95 tiles and the browser asked for every tile
 * picture at once. A dev server rendered them one at a time behind the import's own request, and
 * on the blob tier 95 cold renders made the store refuse the import for 60 s. A tile asks the gate
 * for a turn before it sets its `src`, and gives the turn back when the picture loads or fails or
 * the tile leaves; at most `limit` turns are out at once, and the waiting tiles start in the order
 * they asked.
 */
export type PictureGate = {
  /** Asks for a turn; `start` runs when one is free. Answers a cancel for a turn not yet started. */
  ask: (start: () => void) => () => void;
  /** Gives a started turn back. */
  done: () => void;
  /** The turns out now and the tiles waiting, for tests. */
  readonly counts: () => { active: number; waiting: number };
};

/** The pictures one list loads at once: a browser's six connections to one HTTP/1.1 host. */
export const PICTURES_IN_FLIGHT = 6;

export function pictureGate(limit: number = PICTURES_IN_FLIGHT): PictureGate {
  let active = 0;
  const waiting: Array<() => void> = [];
  const next = (): void => {
    while (active < limit && waiting.length > 0) {
      const start = waiting.shift()!;
      active += 1;
      start();
    }
  };
  return {
    ask(start) {
      let queued = true;
      const turn = (): void => {
        queued = false;
        start();
      };
      waiting.push(turn);
      next();
      return () => {
        if (!queued) return;
        queued = false;
        const at = waiting.indexOf(turn);
        if (at >= 0) waiting.splice(at, 1);
      };
    },
    done() {
      active = Math.max(0, active - 1);
      next();
    },
    counts: () => ({ active, waiting: waiting.length }),
  };
}
