import type { OnPress } from './frame-boxes';
import { TRY_PRESS, isTryPress } from './try-frame';

/** How long a pressed figure shows its flag, so a touch reads the name too. */
const PRESSED_MS = 1200;

/** How far each key moves along a row; Home and End reach past either end. */
const STEP: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  Home: -Infinity,
  End: Infinity,
};

/**
 * One row of the title's figures (AvatarStack.tsx draws it): each figure is a button named by its
 * person or tool, and pressing it hands the person (`data-name`, `data-hue`) or the agent
 * (`data-brand`) to the live editor below (`onPress`), where the same pointer or mark appears. The
 * pressed figure shows its flag for PRESSED_MS. The row is one tab stop, the figure focused last:
 * the arrow keys move along it, Home and End go to its ends, and Enter and Space press. The
 * component calls this on mount; on /home's static load the page's script does (home-entry.ts).
 */
export function attachAvatarStack(stack: HTMLElement, onPress?: OnPress): () => void {
  const buttons = (): HTMLButtonElement[] => [
    ...stack.querySelectorAll<HTMLButtonElement>('.site-av'),
  ];
  const figureOf = (target: EventTarget | null): HTMLButtonElement | null =>
    target instanceof Element ? target.closest<HTMLButtonElement>('.site-av') : null;
  const onClick = (event: MouseEvent): void => {
    const button = figureOf(event.target);
    if (button === null) return;
    /* the figure clicks once (site.css); a second press restarts it */
    delete button.dataset.pressed;
    void button.offsetWidth;
    button.dataset.pressed = '';
    window.setTimeout(() => {
      delete button.dataset.pressed;
    }, PRESSED_MS);
    const { brand, name, hue } = button.dataset;
    const message = {
      type: TRY_PRESS,
      who:
        brand === undefined ? { kind: 'person', name, hue: Number(hue) } : { kind: 'agent', brand },
    };
    if (isTryPress(message)) onPress?.(message.who);
  };
  const onFocus = (event: FocusEvent): void => {
    const focused = figureOf(event.target);
    if (focused === null) return;
    for (const button of buttons()) button.tabIndex = button === focused ? 0 : -1;
  };
  const onKey = (event: KeyboardEvent): void => {
    const by = STEP[event.key];
    if (by === undefined) return;
    const all = buttons();
    const from = all.findIndex((button) => button.tabIndex === 0);
    const next = Math.min(all.length - 1, Math.max(0, from + by));
    event.preventDefault();
    all[next]?.focus();
  };
  stack.addEventListener('click', onClick);
  stack.addEventListener('focusin', onFocus);
  stack.addEventListener('keydown', onKey);
  return () => {
    stack.removeEventListener('click', onClick);
    stack.removeEventListener('focusin', onFocus);
    stack.removeEventListener('keydown', onKey);
  };
}
