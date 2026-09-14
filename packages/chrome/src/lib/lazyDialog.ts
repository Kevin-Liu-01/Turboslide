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
 * which the shell runs when a menu opens. Every lazy dialog of the shell is made here, so this is
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
