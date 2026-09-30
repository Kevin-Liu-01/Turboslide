// The editor's re-read of the caller's standing (controller.tsx `refreshAccess`): after an
// `access` event on the stream, after the first write that made the deck, and after a server side
// create. On the blob tier the read can land on an instance that has not seen the deck or its
// access record yet (VERIFICATION.md "Polish round, pass 3": a deck made seconds ago answers 404
// on another instance for a while; the ship step's second attempt: `readEditorDeck` answered null
// to the owner of a deck one write old), and a null answer read as "you lost access" reloaded the
// page onto the You need access page. So a null answer is read again after a wait, a few times,
// before it is believed; and after the deck's own creation it is never believed, since the deck
// exists and the record with it (server/access.ts recordNewDeck).

/** How many times a null read is tried again before it is believed. */
export const ACCESS_REFRESH_RETRIES = 3;
/** The wait before each try again, in ms: the blob tier's cross instance lag is seconds. */
export const ACCESS_REFRESH_WAIT_MS = 1500;

export type AccessReadOptions = {
  retries?: number;
  waitMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Reads until the read answers a value or the retries are spent; null when every read answered
 * null. `read` is the server function; a throw ends the reads and is the caller's.
 */
export async function readAccessWithRetries<T>(
  read: () => Promise<T | null>,
  options: AccessReadOptions = {},
): Promise<T | null> {
  const retries = options.retries ?? ACCESS_REFRESH_RETRIES;
  const waitMs = options.waitMs ?? ACCESS_REFRESH_WAIT_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let answer = await read();
  for (let attempt = 0; answer === null && attempt < retries; attempt += 1) {
    await sleep(waitMs);
    answer = await read();
  }
  return answer;
}

/**
 * What the editor does with a null answer once the retries are spent: after an `access` event a
 * reader may have lost the deck (the record moved to Restricted, a grant revoked), so the page
 * reloads and the route answers the access page; after the deck's own creation the answer is the
 * lag and the page keeps the standing it has.
 */
export type MissingAccessPolicy = 'reload' | 'keep';
