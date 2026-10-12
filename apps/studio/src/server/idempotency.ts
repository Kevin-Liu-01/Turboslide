import { idempotentOpId } from '@turboslide/agent/http/dispatch';
import { jsonResponse } from '@turboslide/agent/http/errors';
import type { DeckStore, VersionRecord } from '@turboslide/store/store';

import type { AgentCaller } from './agent-gate';
import { serverClientId } from './room';

// Idempotency-Key on POST /api/actions/<action> (RELIABILITY-21, hardening HR-O#6). An agent that
// resends a write after a timeout used to meet a 409 (its first attempt had moved the revision),
// read the deck again and write a second time, so the deck took the change twice. With a key, the
// writes the action makes carry it as their op id: in the room (the object finds the entry by
// client id and op id and answers it), and as the record's `origin` (the store answers a write
// whose op id a record above its base names with that record). The route answers a resend whose
// first attempt is in the log before the action runs, so an action that picks a fresh id each time
// (slide.new) is answered with the record and not run again.

/** Who sent the key and the key: the op ids hash both, so two callers' keys never meet. */
export type Idempotency = { caller: string; key: string };

/** The caller a key is scoped to: the API key record, else the principal, else the bearer's kind. */
export function idempotencyCaller(caller: AgentCaller): string {
  return caller.ctx.agent?.tokenId ?? caller.ctx.principal?.id ?? caller.kind;
}

/**
 * The store the actions of one keyed request write through: the `n`th write carries the op id
 * `idempotentOpId(caller, key, n)` as its origin, under the client id the room gives a server
 * write, so the record names it on every tier.
 */
export function keyedStore(store: DeckStore, idempotency: Idempotency): DeckStore {
  let writes = 0;
  return {
    ...store,
    write(write, options) {
      writes += 1;
      const opId = idempotentOpId(idempotency.caller, idempotency.key, writes);
      return store.write(
        { ...write, origin: { clientId: serverClientId(write.author), opIds: [opId] } },
        options,
      );
    },
  };
}

/**
 * The record an earlier attempt of this keyed request made, or undefined: the newest record whose
 * origin names the request's first op id. The store's mirror is brought up to date first when it
 * can be, since the first attempt may have committed on another instance.
 */
export async function replayedRecord(
  store: DeckStore,
  idempotency: Idempotency,
): Promise<VersionRecord | undefined> {
  const opId = idempotentOpId(idempotency.caller, idempotency.key, 1);
  const synced = store as DeckStore & { sync?: (force?: boolean) => Promise<unknown> };
  if (typeof synced.sync === 'function') await synced.sync(true).catch(() => undefined);
  const records = await store.records();
  return records.findLast((record) => record.origin?.opIds.includes(opId) === true);
}

/** The answer to a resend whose first attempt landed: 200, the record it made, and the replay header. */
export function replayedResponse(action: string, record: VersionRecord): Response {
  return jsonResponse(
    {
      replayed: true,
      action,
      revision: record.revision,
      record: {
        n: record.n,
        revision: record.revision,
        author: record.author,
        note: record.note,
        createdAt: record.createdAt,
      },
    },
    200,
    { 'idempotent-replayed': 'true' },
  );
}
