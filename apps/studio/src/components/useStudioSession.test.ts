import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSessionRegistry,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_STALE_MS,
} from '@turboslide/agent/http/sessions';
import type { SessionCommand } from '@turboslide/agent/http/sessions';
import type { StudioAutomation } from '@turboslide/agent/window/adapter';

import {
  agentSessionRequested,
  EMPTY_ANSWER_PAUSE_MS,
  HIDDEN_DETACH_MS,
  HOT_PAUSE_MS,
  HOT_WINDOW_MS,
  POLL_MS,
  startStudioSession,
} from './useStudioSession';
import type { SessionLoopDeps } from './useStudioSession';

/**
 * The session poll of the sync and costs round (docs/SYNC.md 3.10 and 6.4; audit-costs item 1;
 * docs/sessions-polling.md 2.2 option a): a viewer page attaches only when its address carries
 * `agent=1`; a hidden tab issues no poll and detaches after 10 s hidden; an empty answer pauses
 * the loop 20 s; the poll is not held on the server. The cadence's earlier budget (SPEC-4 4.4,
 * four `_serverFn` responses in a 60 s window with the poll held 25 s) is superseded by the cost
 * rows of SYNC.md 6.1: `cost.editor-idle.calls` allows 12 function requests a minute with 3 polls
 * among them, `cost.show.calls` none, `cost.editor-hidden.calls` no poll.
 */

type Call =
  | { kind: 'attach'; at: number; id?: string }
  | { kind: 'poll'; at: number; id: string; timeoutMs?: number }
  | { kind: 'answer'; at: number; id: string; commandId: string; ok: boolean }
  | { kind: 'detach'; at: number; id: string };

function fakeStudio(invoke: (action: string, input?: unknown) => unknown = () => ({})) {
  const studio = {
    version: 1,
    describe: () => ({
      version: 1,
      global: 'window.turboslide.studio',
      event: 'turboslide:studio-api-ready',
      owner: 'viewer',
      actions: ['view.goto'],
      source: { read: false, apply: false },
      state: { deckId: 'fixture' },
    }),
    owner: () => 'viewer',
    invoke: async (action: string, input?: unknown) => invoke(action, input),
  } as unknown as StudioAutomation;
  return studio;
}

/** The loop's dependencies over fakes: a document whose visibility the test flips, an api that logs. */
function harness(options: { visible?: boolean; answers?: SessionCommand[][] } = {}) {
  const calls: Call[] = [];
  let visible = options.visible ?? true;
  const listeners = new Set<() => void>();
  const answers = [...(options.answers ?? [])];
  let attaches = 0;
  const studio = fakeStudio();
  const deps: SessionLoopDeps = {
    deckId: 'fixture',
    author: 'viewer',
    api: {
      attach: async (input) => {
        attaches += 1;
        calls.push({
          kind: 'attach',
          at: Date.now(),
          ...(input.id !== undefined ? { id: input.id } : {}),
        });
        return { id: input.id ?? `session-${attaches}` };
      },
      poll: async (input) => {
        calls.push({
          kind: 'poll',
          at: Date.now(),
          id: input.id,
          ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        });
        return answers.shift() ?? [];
      },
      answer: async (input) => {
        calls.push({
          kind: 'answer',
          at: Date.now(),
          id: input.id,
          commandId: input.answer.commandId,
          ok: input.answer.ok,
        });
        return true;
      },
      detach: async (input) => {
        calls.push({ kind: 'detach', at: Date.now(), id: input.id });
        return true;
      },
    },
    studio: () => studio,
    whenReady: async () => studio,
    visible: () => visible,
    onVisibilityChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onReady: () => () => undefined,
    href: () => 'http://localhost/deck/fixture?agent=1',
    now: () => Date.now(),
  };
  const setVisible = (next: boolean): void => {
    visible = next;
    for (const listener of listeners) listener();
  };
  const of = (kind: Call['kind']): Call[] => calls.filter((call) => call.kind === kind);
  return { deps, calls, of, setVisible };
}

const tick = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('the agent flag of a viewer or show address (SYNC.md 3.10, open question 3)', () => {
  it('reads agent=1 in the three forms the router hands a search value in', () => {
    expect(agentSessionRequested({ agent: '1' })).toBe(true);
    expect(agentSessionRequested({ agent: 1 })).toBe(true);
    expect(agentSessionRequested({ agent: true })).toBe(true);
  });

  it('is off on /deck without agent=1, on a show and on a published player', () => {
    expect(agentSessionRequested({})).toBe(false);
    expect(agentSessionRequested({ present: '1' })).toBe(false);
    expect(agentSessionRequested({ p: 'abcdefghijklmnop', present: 1 })).toBe(false);
    expect(agentSessionRequested({ agent: '0' })).toBe(false);
    expect(agentSessionRequested({ agent: 'yes' })).toBe(false);
  });
});

describe('the session loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T20:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('attaches, polls with no hold and pauses 20 s after an empty answer', async () => {
    const h = harness();
    const stop = startStudioSession(h.deps);
    await tick(0);
    expect(h.of('attach')).toHaveLength(1);
    expect(h.of('poll')).toHaveLength(1);
    expect((h.of('poll')[0] as { timeoutMs?: number }).timeoutMs).toBe(POLL_MS);
    expect(POLL_MS).toBe(0);
    await tick(EMPTY_ANSWER_PAUSE_MS - 1);
    expect(h.of('poll')).toHaveLength(1);
    await tick(1);
    expect(h.of('poll')).toHaveLength(2);
    await tick(EMPTY_ANSWER_PAUSE_MS);
    expect(h.of('poll')).toHaveLength(3);
    stop();
    await tick(0);
    expect(h.of('detach')).toHaveLength(1);
  });

  it('runs a command, answers it, polls at once and keeps the quick pace for 30 s', async () => {
    const command: SessionCommand = {
      id: 'cmd-1',
      action: 'view.goto',
      input: { slideId: 'thesis' },
      issuedAt: new Date().toISOString(),
    };
    const h = harness({ answers: [[command]] });
    const stop = startStudioSession(h.deps);
    await tick(0);
    expect(h.of('answer')).toEqual([
      expect.objectContaining({ commandId: 'cmd-1', ok: true, id: 'session-1' }),
    ]);
    /* the poll after the command leaves at once, then the quick pace */
    expect(h.of('poll')).toHaveLength(2);
    await tick(HOT_PAUSE_MS);
    expect(h.of('poll')).toHaveLength(3);
    const before = h.of('poll').length;
    await tick(HOT_WINDOW_MS);
    const during = h.of('poll').length - before;
    expect(during).toBeGreaterThanOrEqual(HOT_WINDOW_MS / HOT_PAUSE_MS - 2);
    /* past the window the idle pace returns */
    const settled = h.of('poll').length;
    await tick(HOT_PAUSE_MS * 3);
    expect(h.of('poll').length).toBeLessThanOrEqual(settled + 1);
    await tick(EMPTY_ANSWER_PAUSE_MS);
    expect(h.of('poll').length).toBeGreaterThan(settled);
    stop();
  });

  it('issues no poll while the document is hidden', async () => {
    const h = harness({ visible: false });
    const stop = startStudioSession(h.deps);
    await tick(60_000);
    expect(h.of('attach')).toHaveLength(0);
    expect(h.of('poll')).toHaveLength(0);
    /* shown: one attach, then the poll */
    h.setVisible(true);
    await tick(0);
    expect(h.of('attach')).toHaveLength(1);
    expect(h.of('poll')).toHaveLength(1);
    stop();
  });

  it('stops polling on hide, detaches after 10 s hidden and re-attaches under the same id when shown', async () => {
    const h = harness();
    const stop = startStudioSession(h.deps);
    await tick(0);
    expect(h.of('poll')).toHaveLength(1);
    h.setVisible(false);
    await tick(HIDDEN_DETACH_MS - 1);
    expect(h.of('poll')).toHaveLength(1);
    expect(h.of('detach')).toHaveLength(0);
    await tick(1);
    expect(h.of('detach')).toEqual([expect.objectContaining({ id: 'session-1' })]);
    /* hidden on: nothing more, however long */
    await tick(5 * 60_000);
    expect(h.of('poll')).toHaveLength(1);
    expect(h.of('attach')).toHaveLength(1);
    /* shown: the same id comes back and the poll resumes at once */
    h.setVisible(true);
    await tick(0);
    expect(h.of('attach')).toHaveLength(2);
    expect((h.of('attach')[1] as { id?: string }).id).toBe('session-1');
    expect(h.of('poll')).toHaveLength(2);
    stop();
  });

  it('never detaches on a quick tab switch and never polls during it', async () => {
    const h = harness();
    const stop = startStudioSession(h.deps);
    await tick(0);
    h.setVisible(false);
    await tick(HIDDEN_DETACH_MS / 2);
    h.setVisible(true);
    await tick(0);
    expect(h.of('detach')).toHaveLength(0);
    expect(h.of('attach')).toHaveLength(1);
    /* the poll after the return waits for the pause that was running, never longer */
    await tick(EMPTY_ANSWER_PAUSE_MS);
    expect(h.of('poll').length).toBeGreaterThanOrEqual(2);
    stop();
  });

  it('notices a hide that lands during the pause and counts the 10 s from the hide', async () => {
    const h = harness();
    const stop = startStudioSession(h.deps);
    await tick(0);
    await tick(5_000);
    h.setVisible(false);
    await tick(HIDDEN_DETACH_MS);
    expect(h.of('detach')).toHaveLength(1);
    expect(h.of('poll')).toHaveLength(1);
    stop();
  });
});

describe('the registry half (packages/agent/src/http/sessions.ts)', () => {
  it('answers an unknown id at once, whatever hold the caller asks for', async () => {
    vi.useFakeTimers();
    try {
      const registry = createSessionRegistry();
      let answered: SessionCommand[] | undefined;
      void registry.poll('not-here', 25_000).then((commands) => {
        answered = commands;
      });
      /* no timer advanced: the answer is the next microtask */
      await Promise.resolve();
      await Promise.resolve();
      expect(answered).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers a known id with no queue after the hold it was asked for, zero included', async () => {
    const registry = createSessionRegistry();
    const session = registry.attach({ deckId: 'fixture', owner: 'viewer', actions: ['view.goto'] });
    expect(await registry.poll(session.id, 0)).toEqual([]);
  });
});

describe('the cadence constants', () => {
  it('keeps the idle cycle inside the sweep, with a hidden grace added', () => {
    expect(EMPTY_ANSWER_PAUSE_MS + HIDDEN_DETACH_MS).toBeLessThan(DEFAULT_STALE_MS);
  });

  it('keeps a command issued right after a poll inside its own timeout', () => {
    /* the pause, the round trip of the next poll and the page's own work, with room */
    expect(EMPTY_ANSWER_PAUSE_MS + 5_000).toBeLessThanOrEqual(DEFAULT_COMMAND_TIMEOUT_MS);
    expect(HOT_PAUSE_MS).toBeLessThan(EMPTY_ANSWER_PAUSE_MS);
  });

  it('fits the idle cost row: at most 4 polls in any 60 s window (SYNC.md 6.1 cost.editor-idle.calls)', () => {
    const pollsInWindow = Math.floor(60_000 / EMPTY_ANSWER_PAUSE_MS) + 1;
    expect(pollsInWindow).toBeLessThanOrEqual(4);
  });
});
