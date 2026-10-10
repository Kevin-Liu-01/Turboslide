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

/**
 * Makes jsdom drop the focus as a browser does when the focused control takes the `disabled`
 * attribute (the focus fixup rule: the page body becomes the active element, and Chromium sends a
 * focusout with no related target). jsdom keeps the focus on a disabled control, so a test of the
 * keyboard verifier's final pass 3, F1 (a Share control that disabled itself for its write sent the
 * focus to Done) installs it. Returns the function that stops it.
 */
export function focusFixup(): () => void {
  const observer = new MutationObserver(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.hasAttribute('disabled')) return;
    /* jsdom's blur() leaves an element it does not count as focusable, a disabled one, focused */
    active.removeAttribute('disabled');
    active.blur();
    active.setAttribute('disabled', '');
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
  return () => observer.disconnect();
}

/**
 * Holds for `ms` of real time, reading the active element every `every` ms inside act, and answers
 * each reading as the element's control id, else its tag ("BODY" for the page body).
 */
export async function focusDuring(ms: number, every = 25): Promise<string[]> {
  const seen: string[] = [];
  const read = () => {
    const now = document.activeElement;
    seen.push(now?.getAttribute('data-control') ?? now?.tagName ?? 'none');
  };
  const until = Date.now() + ms;
  read();
  while (Date.now() < until) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, every));
    });
    read();
  }
  return seen;
}
