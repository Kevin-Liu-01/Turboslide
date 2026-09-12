import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useRef, useState } from 'react';

import { Icon } from './icons';
import { useMountEffect } from './lib/useMountEffect';
import { tipProps } from './Tooltip';

import './Snackbar.css';

/**
 * The snackbar (SPEC 1.1, 11.3; R08 B11): one sentence at the bottom left, 8 px above the bottom
 * bar, held for 5 s, with at most one action (Undo) and an X. It replaces the 1.4 s toast plate,
 * which could not take a click. `useSnackbar()` owns the message and the hold and hands the shell
 * a `show(text, action)`; a new message replaces the one on screen and restarts the hold; the
 * action runs and dismisses; the X dismisses; Esc dismisses while the action or the X has focus.
 * The plate is `role="status"` and stays mounted so the live region announces each message.
 * New in Turboslide (no Prototemplate source).
 */
export const SNACKBAR_HOLD_MS = 5000;

export type SnackbarAction = { label: string; run: () => void };

export type SnackbarMessage = { id: number; text: string; action?: SnackbarAction };

export type SnackbarState = {
  message: SnackbarMessage | null;
  /** shows the sentence for the hold, replacing the message on screen */
  show: (text: string, action?: SnackbarAction) => void;
  dismiss: () => void;
};

export function useSnackbar(hold: number = SNACKBAR_HOLD_MS): SnackbarState {
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  const timer = useRef(0);
  const count = useRef(0);

  useMountEffect(() => () => window.clearTimeout(timer.current));

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setMessage(null);
  }, []);

  const show = useCallback(
    (text: string, action?: SnackbarAction) => {
      window.clearTimeout(timer.current);
      count.current += 1;
      setMessage(
        action === undefined ? { id: count.current, text } : { id: count.current, text, action },
      );
      timer.current = window.setTimeout(() => setMessage(null), hold);
    },
    [hold],
  );

  return { message, show, dismiss };
}

export type SnackbarProps = {
  message: SnackbarMessage | null;
  onDismiss: () => void;
};

export function Snackbar({ message, onDismiss }: SnackbarProps) {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onDismiss();
  };
  return (
    <div
      className={message === null ? 'ts-snackbar' : 'ts-snackbar is-on'}
      role="status"
      aria-live="polite"
      data-control="snackbar"
      onKeyDown={onKeyDown}
    >
      {message === null ? null : (
        <>
          <span className="ts-snackbar-text">{message.text}</span>
          {message.action !== undefined ? (
            <button
              type="button"
              className="ts-snackbar-action"
              data-control="snackbar.action"
              onClick={() => {
                message.action?.run();
                onDismiss();
              }}
              {...tipProps({ name: message.action.label, doc: 'Esc dismisses the message' })}
            >
              {message.action.label}
            </button>
          ) : null}
          <button
            type="button"
            className="ts-snackbar-x"
            aria-label="Dismiss"
            data-control="snackbar.dismiss"
            onClick={onDismiss}
            {...tipProps({ name: 'Dismiss', key: 'Esc' })}
          >
            <Icon name="close" />
          </button>
        </>
      )}
    </div>
  );
}
