import { useEffect } from 'react';

import type { SessionOwner } from '@turboslide/agent/http/sessions';
import type { StudioAutomation } from '@turboslide/agent/window/adapter';
import { activeStudio, READY_EVENT, whenStudioReady } from '@turboslide/agent/window/ready';
import { errorStatus } from '@turboslide/schema/errors';

import {
  answerStudioSession,
  attachStudioSession,
  detachStudioSession,
  pollStudioSession,
} from '../server/sessions';

/**
 * Attaches the page to the studio's session registry (server/sessions.ts) so the hosted agent
 * surface can drive it: `deck_goto_slide` over /mcp and `view.goto` over /api/actions become
 * commands this hook receives on a long poll and runs through the page's own
 * `window.turboslide.studio` handle (SPEC 7.3, 7.4), the same dispatcher a click uses, and the
 * owner's view state goes back as the answer. The page re-attaches under the same id when its
 * owner changes (the Edit | View seg fires the ready event), so the registry always knows which
 * actions the page answers; it detaches on unmount, and a page that stops polling is swept by the
 * server after 45 s.
 */

const POLL_MS = 20_000;
const RETRY_MS = 2_000;

export type StudioSessionOptions = {
  deckId: string;
  /** The author label of the page, for the manifest's session list. */
  author?: string;
  /** Off while the route has no owner yet (SSR, a missing deck). */
  enabled?: boolean;
};

function ownerOf(studio: StudioAutomation): SessionOwner {
  const owner = studio.owner();
  return owner === 'source-drawer' ? 'editor' : owner;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useStudioSession({ deckId, author, enabled = true }: StudioSessionOptions): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    /* read through a call: the cleanup below flips it while `run` awaits, which the type checker's
       narrowing inside `run` does not see (it would read a plain `let` as always true after the
       first check) */
    let alive = true;
    const isAlive = (): boolean => alive;
    let sessionId: string | undefined;

    const attach = async (studio: StudioAutomation): Promise<void> => {
      const described = studio.describe();
      const session = await attachStudioSession({
        deckId,
        owner: ownerOf(studio),
        actions: [...described.actions],
        ...(author !== undefined ? { author } : {}),
        url: window.location.href,
        state: described.state,
        ...(sessionId !== undefined ? { id: sessionId } : {}),
      });
      sessionId = session.id;
    };

    const onReady = (): void => {
      const studio = activeStudio();
      if (studio && isAlive()) void attach(studio).catch(() => undefined);
    };

    const run = async (): Promise<void> => {
      const studio = await whenStudioReady(30_000).catch(() => undefined);
      if (!studio || !isAlive()) return;
      await attach(studio);
      window.addEventListener(READY_EVENT, onReady);
      while (isAlive() && sessionId !== undefined) {
        let commands;
        try {
          commands = await pollStudioSession({ id: sessionId, timeoutMs: POLL_MS });
        } catch {
          await sleep(RETRY_MS);
          continue;
        }
        if (!isAlive()) break;
        for (const command of commands) {
          const now = activeStudio();
          try {
            if (!now) throw new RangeError('No studio owner is active in this page');
            const result = await now.invoke(command.action, command.input);
            await answerStudioSession({
              id: sessionId,
              answer: { commandId: command.id, ok: true, result },
            });
          } catch (error) {
            await answerStudioSession({
              id: sessionId,
              answer: {
                commandId: command.id,
                ok: false,
                error: {
                  name: error instanceof Error ? error.name : 'Error',
                  message: error instanceof Error ? error.message : String(error),
                  status: errorStatus(error),
                },
              },
            }).catch(() => undefined);
          }
        }
      }
    };

    void run();
    return () => {
      alive = false;
      window.removeEventListener(READY_EVENT, onReady);
      if (sessionId !== undefined)
        void detachStudioSession({ id: sessionId }).catch(() => undefined);
    };
  }, [deckId, author, enabled]);
}
