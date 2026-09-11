// The ready event (SPEC 7.4): `turboslide:studio-api-ready` fires with describe() as its detail
// once per owner change, never per render. The names are the generator's, so describe.json, the
// skills reference and this module cannot disagree. whenStudioReady() is the client side: it
// resolves with the active adapter at once when one is installed and waits for the event
// otherwise, which is how a Playwright spec or an agent waits for the editor.
import type { StudioAutomation, StudioDescribe } from './adapter.ts';
import { READY_EVENT, WINDOW_GLOBAL } from '../generate/describe.ts';

export { READY_EVENT, WINDOW_GLOBAL };

/** Dispatches the ready event on the window with describe() as detail. */
export function dispatchReady(target: Window, detail: StudioDescribe): void {
  target.dispatchEvent(new CustomEvent<StudioDescribe>(READY_EVENT, { detail }));
}

/** The active adapter, or undefined while no owner is registered or active. */
export function activeStudio(target: Window = window): StudioAutomation | undefined {
  try {
    return target.turboslide?.studio;
  } catch {
    return undefined;
  }
}

/**
 * Resolves with window.turboslide.studio: at once when an owner is active, otherwise on the next
 * ready event, or rejects after `timeoutMs` (default 10 s).
 */
export function whenStudioReady(
  timeoutMs = 10_000,
  target: Window = window,
): Promise<StudioAutomation> {
  const now = activeStudio(target);
  if (now) return Promise.resolve(now);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      target.removeEventListener(READY_EVENT, onReady);
      reject(new Error(`No ${WINDOW_GLOBAL} owner became ready within ${timeoutMs} ms`));
    }, timeoutMs);
    const onReady = () => {
      const studio = activeStudio(target);
      if (!studio) return;
      clearTimeout(timer);
      target.removeEventListener(READY_EVENT, onReady);
      resolve(studio);
    };
    target.addEventListener(READY_EVENT, onReady);
  });
}

/**
 * Two animation frames: what applySource() awaits after the owner's validator has committed, so
 * the React commit and the stage's layout effect have run (SPEC 7.4). A resolved promise is still
 * not a render (skills/turboslide-studio: wait for fonts and image decode before reading pixels).
 */
export function waitForCommit(target: Window = window): Promise<void> {
  return new Promise((resolve) =>
    target.requestAnimationFrame(() => target.requestAnimationFrame(() => resolve())),
  );
}
