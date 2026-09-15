import { describe, expect, it } from 'vitest';

import { DEFAULT_COMMAND_TIMEOUT_MS, DEFAULT_STALE_MS } from '@turboslide/agent/http/sessions';

import { EMPTY_ANSWER_PAUSE_MS, POLL_MS } from './useStudioSession';

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
