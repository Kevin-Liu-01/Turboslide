import { useCallback, useRef, useState } from 'react';

import { useLayer } from './Layer';
import { useMountEffect } from './lib/useMountEffect';

import './Toast.css';

/**
 * The one-line notice above everything: 'Link to slide 12 copied',
 * 'Slide 12, press Enter', 'Link copied', and the first-visit hint. The
 * element is presentational; useToast() owns the message and the 1400ms
 * hold (a caller may ask for a longer one), and hands ViewerShell the say()
 * it publishes in context. Ported from Prototemplate/src/components/viewer/Toast.tsx.
 */
export const TOAST_HOLD_MS = 1400;

export type ToastProps = {
  message: string;
  /** visible while true; the text stays in place through the fade */
  on: boolean;
};

export function Toast({ message, on }: ToastProps) {
  /* the toast layer of the stacking scale while it shows, in the browser's top layer over an open
     dialog (docs/DESIGN.md 2.2, 2.3); it fades out in its own place */
  const plate = useRef<HTMLDivElement>(null);
  useLayer(plate, { layer: 'toast', open: on });
  return (
    <div
      ref={plate}
      className={on ? 'pt-toast pt-float is-on' : 'pt-toast pt-float'}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export type ToastState = {
  message: string;
  on: boolean;
  /** shows msg for the hold, restarting the timer on every call */
  say: (msg: string, hold?: number) => void;
};

export function useToast(hold: number = TOAST_HOLD_MS): ToastState {
  const [message, setMessage] = useState('');
  const [on, setOn] = useState(false);
  const timer = useRef(0);

  useMountEffect(() => () => window.clearTimeout(timer.current));

  const say = useCallback(
    (msg: string, ms?: number) => {
      setMessage(msg);
      setOn(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setOn(false), ms ?? hold);
    },
    [hold],
  );

  return { message, on, say };
}
