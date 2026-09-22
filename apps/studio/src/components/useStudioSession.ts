import { useEffect } from 'react';

import type { SessionCommand, SessionOwner } from '@turboslide/agent/http/sessions';
import type { StudioAutomation } from '@turboslide/agent/window/adapter';
import { activeStudio, READY_EVENT, whenStudioReady } from '@turboslide/agent/window/ready';
import { errorStatus } from '@turboslide/schema/errors';

import {
  answerStudioSession,
  attachStudioSession,
  detachStudioSession,
  pollStudioSession,
} from '../server/sessions';
import type { AnswerSessionInput, AttachSessionInput } from '../server/sessions';

/**
 * Attaches the page to the studio's session registry (server/sessions.ts) so the hosted agent
 * surface can drive it: `deck_goto_slide` over /mcp and `view.goto` over /api/actions become
 * commands this hook receives on a poll and runs through the page's own
 * `window.turboslide.studio` handle (SPEC 7.3, 7.4), the same dispatcher a click uses, and the
 * owner's view state goes back as the answer. The page re-attaches under the same id when its
 * owner changes (the Edit | View seg fires the ready event); it detaches on unmount, and a page
 * that stops polling is swept by the server after 45 s.
 *
 * The sync and costs round (docs/SYNC.md 3.10; audit-costs item 1; docs/sessions-polling.md 2.2
 * option a) changed three things about the poll, which was 88 percent of production's provisioned
 * memory bill as a 25 s hold on every editor, viewer and show tab:
 *
 * - The poll is not held. `POLL_MS` is zero, the server answers at once with the queued commands
 *   or `[]`, and the hook paces itself with `EMPTY_ANSWER_PAUSE_MS`, so a poll costs the function's
 *   own few milliseconds. After a command the hook polls every `HOT_PAUSE_MS` for `HOT_WINDOW_MS`,
 *   so an agent's second and third command land within a second.
 * - A hidden tab polls nothing. While `document.visibilityState` is `hidden` (or the document is
 *   a prerender) no poll leaves; after `HIDDEN_DETACH_MS` hidden the page detaches, so an agent
 *   gets the honest "No studio page is attached" 404 at once instead of a 15 s wait; on return to
 *   visible the page attaches again under the same id and polls at once. A page that loads hidden
 *   attaches when it is first shown.
 * - A viewer or a show page attaches only when its address was opened for an agent
 *   (`agentSessionRequested`, `?agent=1`); the editor attaches as before. The routes read the
 *   flag and pass `enabled`.
 *
 * The loop is `startStudioSession` over injected dependencies so useStudioSession.test.ts drives
 * it with fakes and fake timers; the hook wires the browser's document, window and server
 * functions to it.
 */

/**
 * The hold the hook asks the server for. Zero: the server answers at once (server/sessions.ts
 * `POLL_MAX_MS` clamps every caller to the same) and the pacing is this module's.
 */
export const POLL_MS = 0;
/** The pause after a poll that carried no command, when no command landed recently. */
export const EMPTY_ANSWER_PAUSE_MS = 20_000;
/** The pause after an empty poll inside `HOT_WINDOW_MS` of a command, so a sequence stays quick. */
export const HOT_PAUSE_MS = 1_000;
/** How long after a command the hook keeps the quick pace. */
export const HOT_WINDOW_MS = 30_000;
/** How long a tab stays hidden before the page detaches; a quick tab switch never detaches. */
export const HIDDEN_DETACH_MS = 10_000;
/** The pause after a poll or an attach that threw (a deploy's 5xx, a refused rate). */
const RETRY_MS = 2_000;
/** How long the hook waits for a window API owner before it gives up on this mount. */
const READY_TIMEOUT_MS = 30_000;

/** The search key that opens a viewer or a show page for an agent: `/deck/<id>?agent=1`. */
export const AGENT_SEARCH_KEY = 'agent';

/**
 * Whether the address asks the page to attach a studio session (docs/SYNC.md 3.10, open question
 * 3's default): `?agent=1` on /deck, /present and /embed. The route validators call this and the
 * viewer routes pass the answer as the hook's `enabled`, so a seller's show costs no function
 * request after its load and `deck_goto_slide` reaches a viewer tab only when it was opened for
 * an agent.
 */
export function agentSessionRequested(search: Record<string, unknown>): boolean {
  const value = search[AGENT_SEARCH_KEY];
  return value === 1 || value === '1' || value === true;
}

export type StudioSessionOptions = {
  deckId: string;
  /** The author label of the page, for the manifest's session list. */
  author?: string;
  /** Off while the route has no owner yet (SSR, a missing deck) and on a viewer page without `?agent=1`. */
  enabled?: boolean;
};

/** The four server functions, as the loop calls them; the test hands in fakes. */
export type SessionApi = {
  attach: (input: AttachSessionInput) => Promise<{ id: string }>;
  poll: (input: { id: string; timeoutMs?: number }) => Promise<SessionCommand[]>;
  answer: (input: AnswerSessionInput) => Promise<boolean>;
  detach: (input: { id: string }) => Promise<boolean>;
};

export type SessionLoopDeps = {
  deckId: string;
  author?: string;
  api: SessionApi;
  /** the active window API owner, or undefined while none is registered or active */
  studio: () => StudioAutomation | undefined;
  /** resolves with the first active owner; rejects when none becomes ready in time */
  whenReady: () => Promise<StudioAutomation>;
  /** whether the document is shown: not hidden and not a prerender */
  visible: () => boolean;
  /** subscribes to changes of `visible()`; returns the unsubscribe */
  onVisibilityChange: (listener: () => void) => () => void;
  /** subscribes to the owner change (the ready event); returns the unsubscribe */
  onReady: (listener: () => void) => () => void;
  /** the page's address, for the manifest's session list */
  href: () => string;
  now: () => number;
};

function ownerOf(studio: StudioAutomation): SessionOwner {
  const owner = studio.owner();
  return owner === 'source-drawer' ? 'editor' : owner;
}

/**
 * Runs the session loop until the returned stop is called. Exported for the unit test; the hook
 * below is its one product caller.
 */
export function startStudioSession(deps: SessionLoopDeps): () => void {
  /* read through calls: the stop flips them while `run` awaits, which narrowing inside `run`
     would not see */
  let alive = true;
  let sessionId: string | undefined;
  let attached = false;
  let lastCommandAt = Number.NEGATIVE_INFINITY;
  /* the interruptible wait: a visibility change or the stop ends a pause early, and a change that
     lands while no wait is pending is kept so the next wait returns at once */
  let changed = false;
  let wake: (() => void) | undefined;

  const wakeUp = (): void => {
    changed = true;
    const pending = wake;
    wake = undefined;
    pending?.();
  };

  /** Waits `ms` (or until woken when `ms` is undefined); returns at once after a change. */
  const wait = (ms?: number): Promise<void> => {
    if (changed) {
      changed = false;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timer = ms === undefined ? undefined : setTimeout(() => finish(), ms);
      const finish = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        if (wake === finish) wake = undefined;
        changed = false;
        resolve();
      };
      wake = finish;
    });
  };

  const attach = async (): Promise<boolean> => {
    const studio = deps.studio();
    if (!studio) return false;
    const described = studio.describe();
    const session = await deps.api.attach({
      deckId: deps.deckId,
      owner: ownerOf(studio),
      actions: [...described.actions],
      ...(deps.author !== undefined ? { author: deps.author } : {}),
      url: deps.href(),
      state: described.state,
      ...(sessionId !== undefined ? { id: sessionId } : {}),
    });
    sessionId = session.id;
    attached = true;
    return true;
  };

  const detach = async (): Promise<void> => {
    attached = false;
    if (sessionId === undefined) return;
    await deps.api.detach({ id: sessionId }).catch(() => undefined);
  };

  const runCommand = async (command: SessionCommand): Promise<void> => {
    if (sessionId === undefined) return;
    const id = sessionId;
    try {
      const studio = deps.studio();
      if (!studio) throw new RangeError('No studio owner is active in this page');
      const result = await studio.invoke(command.action, command.input);
      await deps.api.answer({ id, answer: { commandId: command.id, ok: true, result } });
    } catch (error) {
      await deps.api
        .answer({
          id,
          answer: {
            commandId: command.id,
            ok: false,
            error: {
              name: error instanceof Error ? error.name : 'Error',
              message: error instanceof Error ? error.message : String(error),
              status: errorStatus(error),
            },
          },
        })
        .catch(() => undefined);
    }
  };

  const onReady = (): void => {
    /* the owner changed (the Edit | View seg): the registry learns the new owner and its actions
       under the same id; a detached or hidden page reads the owner at its next attach anyway */
    if (attached && alive && deps.visible()) void attach().catch(() => undefined);
  };

  const run = async (): Promise<void> => {
    const studio = await deps.whenReady().catch(() => undefined);
    if (!studio || !alive) return;
    while (alive) {
      if (!deps.visible()) {
        /* hidden: no poll. An attached page detaches once it has been hidden for HIDDEN_DETACH_MS
           (a return inside that grace resumes with no server call); then the loop sleeps until
           the document is shown again */
        if (attached) {
          await wait(HIDDEN_DETACH_MS);
          if (!alive) break;
          if (deps.visible()) continue;
          await detach();
          if (!alive) break;
        }
        await wait();
        continue;
      }
      if (!attached) {
        try {
          if (!(await attach())) {
            await wait(RETRY_MS);
            continue;
          }
        } catch {
          await wait(RETRY_MS);
          continue;
        }
        if (!alive) break;
      }
      if (sessionId === undefined) break;
      let commands: SessionCommand[];
      try {
        commands = await deps.api.poll({ id: sessionId, timeoutMs: POLL_MS });
      } catch {
        await wait(RETRY_MS);
        continue;
      }
      if (!alive) break;
      if (commands.length === 0) {
        const hot = deps.now() - lastCommandAt < HOT_WINDOW_MS;
        await wait(hot ? HOT_PAUSE_MS : EMPTY_ANSWER_PAUSE_MS);
        continue;
      }
      lastCommandAt = deps.now();
      for (const command of commands) await runCommand(command);
    }
  };

  const offVisibility = deps.onVisibilityChange(wakeUp);
  const offReady = deps.onReady(onReady);
  void run();
  return () => {
    alive = false;
    offVisibility();
    offReady();
    wakeUp();
    if (attached) void detach();
  };
}

/** The browser's document as the loop reads it: hidden and prerendering both count as not shown. */
function documentVisible(): boolean {
  if (typeof document === 'undefined') return false;
  if ((document as Document & { prerendering?: boolean }).prerendering === true) return false;
  return document.visibilityState !== 'hidden';
}

export function useStudioSession({ deckId, author, enabled = true }: StudioSessionOptions): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    return startStudioSession({
      deckId,
      ...(author !== undefined ? { author } : {}),
      api: {
        attach: attachStudioSession,
        poll: pollStudioSession,
        answer: answerStudioSession,
        detach: detachStudioSession,
      },
      studio: () => activeStudio(),
      whenReady: () => whenStudioReady(READY_TIMEOUT_MS),
      visible: documentVisible,
      onVisibilityChange: (listener) => {
        document.addEventListener('visibilitychange', listener);
        document.addEventListener('prerenderingchange', listener);
        return () => {
          document.removeEventListener('visibilitychange', listener);
          document.removeEventListener('prerenderingchange', listener);
        };
      },
      onReady: (listener) => {
        window.addEventListener(READY_EVENT, listener);
        return () => window.removeEventListener(READY_EVENT, listener);
      },
      href: () => window.location.href,
      now: () => Date.now(),
    });
  }, [deckId, author, enabled]);
}
