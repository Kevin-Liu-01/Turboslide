import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef } from 'react';

import type { PresentPlatform } from './presentKeys';
import { presentKeyRows } from './presentKeys';
import { PRESENT_TEXT } from './strings';
import { defaultTip, noLayer, PresentIcon } from './ui';
import type { PresentIcons, PresentLayer, PresentTip } from './ui';

import './PresentShortcuts.css';

/**
 * The Keyboard shortcuts card of a show (gslides-parity SPEC 9.2: More > Keyboard shortcuts
 * "shows the presenting group"): a dialog over the sheet with the presenting table in the
 * platform's spelling. `role="dialog"` with `aria-labelledby`, focus on the Close button when it
 * opens, Tab and Shift+Tab held inside, Esc closes; the caller returns focus to the row that
 * opened it (SPEC 13.3). Every row is real text, so a screen reader reads it (SPEC 13.10). The
 * scrim enters the `dialog` layer through the handed in Layer hook (docs/DESIGN.md 2.3), so the
 * card shows over the show and under its menus and its snackbar; the card is a `.pt-window`, the
 * 8 px window of the ladder (DESIGN.md 3.1).
 */
export type PresentShortcutsProps = {
  platform: PresentPlatform;
  onClose: () => void;
  icons?: PresentIcons;
  tip?: PresentTip;
  /** the chrome's `useLayer`; without it the scrim keeps its DOM place at the scale's z-index */
  layer?: PresentLayer;
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function PresentShortcuts({
  platform,
  onClose,
  icons,
  tip = defaultTip,
  layer = noLayer,
}: PresentShortcutsProps) {
  const scrim = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const useScrimLayer = layer;
  useScrimLayer(scrim, { layer: 'dialog' });

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
    <div ref={scrim} className="ts-present-scrim" data-present-popover="" onClick={onClose}>
      <div
        ref={card}
        className="ts-present-card pt-window"
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
