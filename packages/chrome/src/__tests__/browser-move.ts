import { act } from '@testing-library/react';

// A unit helper for the modal card's focus rule (Dialog.tsx; the keyboard verifier's final pass 2
// on the dropdown round, F1). Not a test file: vitest runs `*.test.ts(x)` alone.
//
// jsdom moves the focus in one step. A browser moves it in steps: the old control's blur and
// focusout, with the new control as the related target and the page body as the active element;
// then the microtasks those listeners queued (React's render of the blur, a MutationObserver's
// callback); then the new control's focus and focusin. A script that moves the focus in that gap
// cancels the move: Chromium drops a Tab, Shift+Tab or click, Firefox a click.

type ActEnvironment = { IS_REACT_ACT_ENVIRONMENT?: boolean };

/** Waits for one task, inside act, so a check the card put in a task of its own has run. */
export async function nextTask(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * Moves the focus from `from` to `to` in a browser's steps. React renders the blur in a microtask
 * of the gap, as in a browser, so the gap runs outside act. Returns the elements that took the
 * focus in the gap; the move goes on to `to` only when none did, as a browser drops it otherwise.
 */
export async function browserMove(from: HTMLElement, to: HTMLElement): Promise<Element[]> {
  const taken: Element[] = [];
  const note = (event: FocusEvent) => {
    if (event.target instanceof Element) taken.push(event.target);
  };
  const env = globalThis as ActEnvironment;
  const actEnvironment = env.IS_REACT_ACT_ENVIRONMENT;
  document.addEventListener('focusin', note, true);
  env.IS_REACT_ACT_ENVIRONMENT = false;
  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get: () => document.body,
  });
  try {
    from.dispatchEvent(new FocusEvent('blur', { relatedTarget: to }));
    from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: to }));
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  } finally {
    Reflect.deleteProperty(document, 'activeElement');
    env.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    document.removeEventListener('focusin', note, true);
  }
  if (taken.length === 0) act(() => to.focus());
  await nextTask();
  return taken;
}
