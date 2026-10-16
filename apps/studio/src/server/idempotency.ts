import type { IdempotencyScope } from '@turboslide/agent/http/dispatch';
import { idempotencyKeyPrefix, idempotentOpId } from '@turboslide/agent/http/dispatch';
import { jsonResponse } from '@turboslide/agent/http/errors';
import type { DeckDocument } from '@turboslide/schema/deck';
import type { DeckStore, VersionRecord, WriteOutcome } from '@turboslide/store/store';

import type { AgentCaller } from './agent-gate';
import { serverClientId } from './room';

// Idempotency-Key on POST /api/actions/<action> (RELIABILITY-21, hardening HR-O#6). An agent that
// resends a write after a timeout used to meet a 409 (its first attempt had moved the revision),
// read the deck again and write a second time, so the deck took the change twice. With a key, the
// writes the action makes carry it as their op id: in the room (the object finds the entry by
// client id and op id and answers it), and as the record's `origin` (the store answers a write
// whose op id a record above its base names with that record). The route finds a resend's first
// attempt in the log before the action runs. A resend of the same request runs the action once
// more over `replayStore`, which answers each write with its record, so the answer is the action's
// own and nothing is written; the same key with another action or body is refused with 422
// (the wave 3b verify's findings 3 and 4).

/** Who sent the key, the key and the request's fingerprint: the op ids hash all three. */
export type Idempotency = IdempotencyScope;

/** The caller a key is scoped to: the API key record, else the principal, else the bearer's kind. */
export function idempotencyCaller(caller: AgentCaller): string {
  return caller.ctx.agent?.tokenId ?? caller.ctx.principal?.id ?? caller.kind;
}

/** A write with the op id of the `n`th write of a keyed request as its origin. */
function keyedWrite(
  store: DeckStore,
  idempotency: Idempotency,
  n: number,
  ...[write, options]: Parameters<DeckStore['write']>
): Promise<WriteOutcome> {
  const opId = idempotentOpId(idempotency, n);
  return store.write(
    { ...write, origin: { clientId: serverClientId(write.author), opIds: [opId] } },
    options,
  );
}

/**
 * The store the actions of one keyed request write through: the `n`th write carries the op id
 * `idempotentOpId(idempotency, n)` as its origin, under the client id the room gives a server
 * write, so the record names it on every tier.
 */
export function keyedStore(store: DeckStore, idempotency: Idempotency): DeckStore {
  let writes = 0;
  return {
    ...store,
    write(write, options) {
      writes += 1;
      return keyedWrite(store, idempotency, writes, write, options);
    },
  };
}

/** The first record an earlier attempt of a key made, and whether it came with this request. */
export type EarlierAttempt = {
  record: VersionRecord;
  /** false when the key came with another action or body (a 422) */
  sameRequest: boolean;
  /** the log the record was found in, which `replayStore` answers the writes from */
  records: VersionRecord[];
};

/**
 * The record of the first write an earlier attempt of this key made, or undefined: the newest
 * record whose origin names a first write of the key, whatever request it came with. The store's
 * mirror is brought up to date first when it can be, since the first attempt may have committed
 * on another instance.
 */
export async function replayedRecord(
  store: DeckStore,
  idempotency: Idempotency,
): Promise<EarlierAttempt | undefined> {
  const prefix = idempotencyKeyPrefix(idempotency);
  const mine = idempotentOpId(idempotency, 1);
  const synced = store as DeckStore & { sync?: (force?: boolean) => Promise<unknown> };
  if (typeof synced.sync === 'function') await synced.sync(true).catch(() => undefined);
  const records = await store.records();
  // a first write's id is the prefix and a fingerprint alone; a later write's carries `-<n>`
  const first = (id: string): boolean => id.startsWith(prefix) && id.length === mine.length;
  const record = records.findLast((row) => row.origin?.opIds.some((id) => first(id)) === true);
  if (record === undefined) return undefined;
  return { record, sameRequest: record.origin?.opIds.includes(mine) === true, records };
}

/**
 * The store a resend of a keyed request runs its action over: it reads the deck as the first
 * attempt read it (the document at the first record's base), and answers each write with the
 * record of the first attempt's write of the same number and the document at that record, so the
 * action builds the answer the first attempt gave (the slide `slide.new` made, its outline) and
 * nothing is written. A write the first attempt never reached (it stopped part way) is made now,
 * once, under its op id.
 */
export function replayStore(
  store: DeckStore,
  idempotency: Idempotency,
  earlier: EarlierAttempt,
): DeckStore {
  let writes = 0;
  let seen: DeckDocument | undefined;
  const view = async (): Promise<DeckDocument> =>
    (seen ??= await store.documentAtRevision(earlier.record.baseRevision));
  return {
    ...store,
    async read() {
      return { document: await view(), issues: [], ok: true };
    },
    async revision() {
      return (await view()).deck.revision;
    },
    async write(write, options) {
      writes += 1;
      const opId = idempotentOpId(idempotency, writes);
      const record = earlier.records.findLast((row) => row.origin?.opIds.includes(opId) === true);
      if (record === undefined) return keyedWrite(store, idempotency, writes, write, options);
      seen = await store.documentAtRevision(record.revision);
      return {
        ok: true,
        document: seen,
        revision: record.revision,
        entry: record,
        changed: [],
        issues: [],
        warnings: [],
        replayed: record,
      };
    },
  };
}

/**
 * The answer to a resend whose first attempt landed when the action's answer cannot be built
 * again (the action failed over `replayStore`, such as an upload the first attempt consumed): 200,
 * the record it made, and the replay header.
 */
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

/** A replayed action's own answer with the replay header added. */
export function withReplayedHeader(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('idempotent-replayed', 'true');
  return new Response(response.body, { status: response.status, headers });
}
