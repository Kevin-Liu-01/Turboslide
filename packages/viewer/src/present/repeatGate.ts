/**
 * A held key's repeats in a show and in the presenter console (the presenter audit of a95d4097d,
 * item 2). Every keydown of a held arrow used to move at once: the shell's select, the hash, a
 * shader mount, one channel message and, in the presenter, three live clones, all in the event.
 * When a move rendered slower than the key repeated, the repeats queued behind it and kept moving
 * after the key was let go. The gate keeps one press as one move, run at once, and lets a held
 * key's repeats run at most one move per frame, the latest repeat standing for the ones before it;
 * the release drops a repeat not yet run, so the show stops where the key was let go.
 */

/** The frame clock: `requestAnimationFrame` in a page, a fake in the tests. */
export type FrameScheduler = {
  request: (run: () => void) => number;
  cancel: (handle: number) => void;
};

export type RepeatGate = {
  /** a key that moves: a press runs `run` at once, a repeat on the next frame while the key is held */
  press: (event: { key: string; repeat: boolean }, run: () => void) => void;
  /** a key went up: a repeat of it not yet run is dropped */
  release: (key: string) => void;
  /** drops any repeat not yet run (the window lost focus, the surface left) */
  cancel: () => void;
};

function browserFrames(): FrameScheduler {
  return {
    request: (run) => window.requestAnimationFrame(() => run()),
    cancel: (handle) => window.cancelAnimationFrame(handle),
  };
}

export function createRepeatGate(frames: FrameScheduler = browserFrames()): RepeatGate {
  let held: string | null = null;
  let handle = 0;
  let waiting: (() => void) | null = null;

  const drop = (): void => {
    if (handle !== 0) frames.cancel(handle);
    handle = 0;
    waiting = null;
  };

  return {
    press(event, run) {
      held = event.key;
      if (!event.repeat) {
        drop();
        run();
        return;
      }
      waiting = run;
      if (handle !== 0) return;
      handle = frames.request(() => {
        handle = 0;
        const next = waiting;
        waiting = null;
        next?.();
      });
    },
    release(key) {
      if (key !== held) return;
      held = null;
      drop();
    },
    cancel() {
      held = null;
      drop();
    },
  };
}
