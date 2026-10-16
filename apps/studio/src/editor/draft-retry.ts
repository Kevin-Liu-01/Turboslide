// The draft's first save through a storage write freeze (HR-K1#4b; docs/hosting.md 10). While the
// documents move between stores the server refuses document writes with 503, the freeze's
// sentence and `retryAfter` (StorageFrozenError; StorageLayoutError for a layout record that did
// not read). The editor's first `writeDeck` of a new deck is the one write that cannot wait in the
// room, since the room starts on its answer: the page keeps it, and the edits queued behind it,
// and sends it again after each wait for as long as a freeze can last.
import { errorStatus } from '@turboslide/schema/errors';

/**
 * How long a refused first save is tried again: the longest a freeze lasts (packages/store
 * migrate.ts FREEZE_LIMIT_MS, 45 minutes, which this browser module does not import) and a minute.
 */
export const DRAFT_FREEZE_RETRY_FOR_MS = 46 * 60_000;

/** The wait when a 503 names none, the freeze's own `retry-after`. */
const DEFAULT_WAIT_S = 30;

/**
 * The wait in ms a store refusal asks for: a 503 that carries `retryAfter` in seconds (`writeDeck`'s
 * busy answer as server/write.ts `readWriteDeckAnswer` throws it); null for any other error.
 */
export function storeWaitMs(error: unknown): number | null {
  if (errorStatus(error) !== 503) return null;
  const wait = (error as { retryAfter?: unknown }).retryAfter;
  if (typeof wait !== 'number') return null;
  return (wait > 0 ? wait : DEFAULT_WAIT_S) * 1000;
}

export type ThroughFreezeOptions = {
  /** hears each refusal and its wait, before the wait (the controller says the sentence on the snackbar) */
  waiting: (refusal: Error, waitMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** DRAFT_FREEZE_RETRY_FOR_MS by default */
  forMs?: number;
};

/**
 * Runs `send` until it answers. A store refusal with a wait (`storeWaitMs`) is sent again after the
 * wait while the refusals last less than `forMs`; any other error, or a refusal past that, is
 * thrown as it is.
 */
export async function sendThroughFreeze<T>(
  send: () => Promise<T>,
  options: ThroughFreezeOptions,
): Promise<T> {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const forMs = options.forMs ?? DRAFT_FREEZE_RETRY_FOR_MS;
  const started = now();
  for (;;) {
    try {
      return await send();
    } catch (error) {
      const wait = storeWaitMs(error);
      if (wait === null || now() - started + wait > forMs) throw error;
      options.waiting(error instanceof Error ? error : new Error(String(error)), wait);
      await sleep(wait);
    }
  }
}
