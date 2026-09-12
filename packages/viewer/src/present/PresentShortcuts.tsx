import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef } from 'react';

import type { PresentPlatform } from './presentKeys';
import { presentKeyRows } from './presentKeys';
import { PRESENT_TEXT } from './strings';
import { defaultTip, PresentIcon } from './ui';
import type { PresentIcons, PresentTip } from './ui';

import './PresentShortcuts.css';

/**
 * The Keyboard shortcuts card of a show (gslides-parity SPEC 9.2: More > Keyboard shortcuts
 * "shows the presenting group"): a dialog over the sheet with Google's presenting table in the
 * platform's spelling. `role="dialog"` with `aria-labelledby`, focus on the Close button when it
 * opens, Tab and Shift+Tab held inside, Esc closes; the caller returns focus to the row that
 * opened it (SPEC 13.3). Every row is real text, so a screen reader reads it (SPEC 13.10).
 */
export type PresentShortcutsProps = {
  platform: PresentPlatform;
  onClose: () => void;
  icons?: PresentIcons;
  tip?: PresentTip;
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function PresentShortcuts({
  platform,
  onClose,
  icons,
  tip = defaultTip,
}: PresentShortcutsProps) {
  const card = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !card.current) return;
    const focusable = [...card.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="ts-present-scrim" data-present-popover="" onClick={onClose}>
      <div
        ref={card}
        className="ts-present-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ts-present-shortcuts-title"
        data-control="present.shortcuts"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="ts-present-card-head">
          <h2 id="ts-present-shortcuts-title">{PRESENT_TEXT.keyboardShortcuts}</h2>
          <button
            ref={close}
            type="button"
            className="ts-present-card-x"
            aria-label={PRESENT_TEXT.close}
            data-control="present.shortcuts.close"
            onClick={onClose}
            {...tip({ name: PRESENT_TEXT.close, key: 'Esc' })}
          >
            <PresentIcon name="exit" icons={icons} />
          </button>
        </div>
        <h3>{PRESENT_TEXT.presenting}</h3>
        <table className="ts-present-keys">
          <tbody>
            {presentKeyRows(platform).map((row) => (
              <tr key={row.action}>
                <th scope="row">{row.keys}</th>
                <td>
                  {row.action}
                  {row.note !== undefined ? (
                    <span className="ts-present-keys-note"> · {row.note}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
