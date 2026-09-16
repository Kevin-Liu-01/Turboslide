import { describe, expect, it } from 'vitest';

import { DEFAULT_COMMAND_TIMEOUT_MS, DEFAULT_STALE_MS } from '@turboslide/agent/http/sessions';

import {
  EMPTY_ANSWER_PAUSE_MS,
  POLL_MS,
  RETRY_MAX_MS,
  RETRY_MS,
  isHidden,
  retryDelayMs,
  whenVisible,
} from './useStudioSession';
import type { VisibilityDocument } from './useStudioSession';

/**
 * The session poll's cadence (gslides-parity SPEC-4 0.37, 4.4; VERIFICATION-4 finding 12): the
 * idle budget is four `_serverFn` responses in any 60 s window, the editor makes up to two calls
 * of its own that a loaded machine can land inside the window, so the poll may take two at most.
 * Responses with a period P land at most `floor(60 / P) + 1` times in a 60 s window, so the
 * period must clear 30 s. The server caps one poll at 25 s (server/sessions.ts `POLL_MAX_MS`,
 * pinned here as a literal because the module is not exported) and sweeps a silent session after
 * `DEFAULT_STALE_MS`; a command queued during the pause waits for the next poll, so the pause stays
 * under the command timeout.
 */
const POLL_MAX_MS = 25_000;
const WINDOW_MS = 60_000;
const OWN_CALLS = 2;
const IDLE_BUDGET = 4;

describe('the session poll cadence', () => {
  it('fits the idle budget with two of the editor’s own calls in the window', () => {
    const period = POLL_MS + EMPTY_ANSWER_PAUSE_MS;
    const pollsInWindow = Math.floor(WINDOW_MS / period) + 1;
    expect(pollsInWindow + OWN_CALLS).toBeLessThanOrEqual(IDLE_BUDGET);
  });

  it('keeps the hold under the server cap and the session under the sweep', () => {
    expect(POLL_MS).toBeLessThanOrEqual(POLL_MAX_MS);
    expect(POLL_MS + EMPTY_ANSWER_PAUSE_MS).toBeLessThan(DEFAULT_STALE_MS);
  });

  it('keeps a queued command inside its own timeout', () => {
    expect(EMPTY_ANSWER_PAUSE_MS).toBeLessThan(DEFAULT_COMMAND_TIMEOUT_MS);
  });
});

describe('the poll error backoff (SPEC-5-amendments A8 row 7)', () => {
  it('doubles from 2 s and caps at 60 s', () => {
    expect(retryDelayMs(1)).toBe(RETRY_MS);
    expect(retryDelayMs(2)).toBe(RETRY_MS * 2);
    expect(retryDelayMs(3)).toBe(RETRY_MS * 4);
    expect(retryDelayMs(6)).toBe(RETRY_MAX_MS);
    expect(retryDelayMs(40)).toBe(RETRY_MAX_MS);
    expect(retryDelayMs(0)).toBe(RETRY_MS);
  });

  it('keeps a persistent error under 60 polls an hour instead of 1,800', () => {
    let elapsed = 0;
    let polls = 0;
    for (let failures = 1; elapsed < 3_600_000; failures += 1) {
      elapsed += retryDelayMs(failures);
      polls += 1;
    }
    expect(polls).toBeLessThan(70);
  });
});

describe('the visibility gate (SPEC-5-amendments A8 row 8)', () => {
  function fakeDocument(state: 'visible' | 'hidden'): VisibilityDocument & {
    show: () => void;
    listeners: number;
  } {
    const listeners = new Set<() => void>();
    const doc = {
      visibilityState: state as DocumentVisibilityState,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.add(listener as () => void);
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.delete(listener as () => void);
      },
      show: () => {
        doc.visibilityState = 'visible';
        for (const listener of [...listeners]) listener();
      },
      get listeners() {
        return listeners.size;
      },
    };
    return doc;
  }

  it('reads a hidden document as hidden and no document as shown', () => {
    expect(isHidden(fakeDocument('hidden'))).toBe(true);
    expect(isHidden(fakeDocument('visible'))).toBe(false);
    expect(isHidden(undefined)).toBe(false);
  });

  it('resolves at once for a shown document and waits for the change of a hidden one, then unlistens', async () => {
    await whenVisible(fakeDocument('visible'));
    await whenVisible(undefined);
    const hidden = fakeDocument('hidden');
    let shown = false;
    const waiting = whenVisible(hidden).then(() => {
      shown = true;
    });
    await Promise.resolve();
    expect(shown).toBe(false);
    expect(hidden.listeners).toBe(1);
    hidden.show();
    await waiting;
    expect(shown).toBe(true);
    expect(hidden.listeners).toBe(0);
  });
});
