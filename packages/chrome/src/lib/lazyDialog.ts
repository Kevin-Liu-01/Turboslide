import type { ComponentType, LazyExoticComponent } from 'react';
import { lazy } from 'react';

/**
 * A dialog loaded on first open (gslides-parity SPEC-4 0.44, 3.12; PP 7 row 5): the editor shell
 * imported its twenty dialogs, the Diagram panel and the shortcuts dialog statically, so every
 * route that carried the shell (the editor, the viewer, the presenter through the shared chunk)
 * downloaded and parsed dialogs nobody had opened (about 250 KB of source across dialogs/). Each
 * one is now a `lazy()` component behind one `import()` of its module, rendered under the shell's
 * one `Suspense` with no fallback (the dialog appears a frame later on the first open, tens of
 * milliseconds warm; nothing else moves), and `preload()` fetches the module ahead of the open,
 * which the shell runs when a menu opens; the two lazy panels also load in idle time once the
 * editor has painted (`preloadWhenIdle`). Every lazy dialog of the shell is made here, so this is
 * one of the four `import()` sites AGENTS.md allows in the browser graph; the loaders are the
 * callers' arrow functions, so the bundler sees each module's path.
 */
export type LazyDialog<TProps> = {
  Component: LazyExoticComponent<ComponentType<TProps>>;
  /** loads the module now; resolves when it is ready, rejects with the loader's error */
  preload: () => Promise<void>;
};

export function lazyDialog<TProps>(load: () => Promise<ComponentType<TProps>>): LazyDialog<TProps> {
  let pending: Promise<ComponentType<TProps>> | null = null;
  const once = (): Promise<ComponentType<TProps>> => {
    pending ??= load().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
  return {
    Component: lazy(() => once().then((component) => ({ default: component }))),
    preload: () => once().then(() => undefined),
  };
}

/** Preloads every dialog of a set; a loader that fails is reported by the browser and retried on the next call. */
export function preloadDialogs(dialogs: ReadonlyArray<{ preload: () => Promise<void> }>): void {
  for (const dialog of dialogs) void dialog.preload().catch(() => undefined);
}

/** How long after the call the idle preload starts, so the editor's first paint and its loads go first. */
export const IDLE_PRELOAD_DELAY_MS = 1200;

/** The longest an idle preload waits for an idle period before it loads anyway. */
const IDLE_PRELOAD_TIMEOUT_MS = 4000;

/** True when the browser asks pages to save data (the Save-Data setting, `navigator.connection.saveData`). */
export function savesData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * Loads the modules of a set in idle time, one per idle period, starting `IDLE_PRELOAD_DELAY_MS`
 * after the call, so the first open of a lazy panel finds its module ready (Glyphfield's tool
 * prefetch, StudioApp.tsx `scheduleStudioToolPrefetch`). Nothing loads when the browser asks to
 * save data. Returns the cancel; a load already started finishes, and the rest never start.
 */
export function preloadWhenIdle(
  dialogs: ReadonlyArray<{ preload: () => Promise<void> }>,
): () => void {
  if (typeof window === 'undefined' || savesData()) return () => undefined;
  const queue = [...dialogs];
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  const next = (): void => {
    const dialog = queue.shift();
    if (cancelled || dialog === undefined) return;
    const load = (): void => {
      idle = undefined;
      void dialog
        .preload()
        .catch(() => undefined)
        .finally(next);
    };
    if (typeof window.requestIdleCallback === 'function')
      idle = window.requestIdleCallback(load, { timeout: IDLE_PRELOAD_TIMEOUT_MS });
    else timer = setTimeout(load, 0);
  };
  timer = setTimeout(next, IDLE_PRELOAD_DELAY_MS);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}
