// The origins a resync read answers (docs/archive/rounds/SYNC.md 3.2), apart from server/write.ts
// (polish two, P2-V1.4 finding 6; SPEC-4 3.12): the bound is the realtime protocol's replay bound,
// and write.ts is imported by the /new, /edit and /present loaders, so an export of write.ts that
// named the protocol put the protocol, the schema's mutations and documents and zod in the chunk
// every route loads. write.ts reads `originsSince` inside its watch handler only, which the client
// build drops with the import.
import { REPLAY_MAX_ENTRIES } from '@turboslide/realtime/protocol';
import type { VersionRecord } from '@turboslide/store/store';

/**
 * How many records above the caller's `since` the resync read answers the origins of (docs/
 * SYNC.md 3.2, invariants 3 and 10): the stream's replay bound (`REPLAY_MAX_ENTRIES`, realtime
 * protocol.ts), so a pending op whose first attempt is further behind the head than a stream
 * could replay is dropped with the queue and returned to its author, never acknowledged blind.
 */
export const RESYNC_ORIGINS_MAX = REPLAY_MAX_ENTRIES;

/**
 * A record above the resync read's `since` that names its origin (docs/archive/rounds/SYNC.md 3.2): the seq
 * its admission made (the revision on the blob tier), the client id and the op ids it folded,
 * mutations stripped. The room client drops every pending op named here as acknowledged at
 * `seq` before it re-folds the rest on the fresh document.
 */
export type RecordOrigin = { seq: number; n: number; clientId: string; opIds: string[] };

/**
 * The origins of the records above `since`, oldest first, at most `max` records considered
 * (the newest ones when the log above `since` is longer than that, so the bound reads as
 * "within REPLAY_MAX_ENTRIES of the head"). A record without an origin (a write from the CLI,
 * an agent's strict write, a record from before the round) names nothing and is skipped. Pure.
 */
export function originsSince(
  records: ReadonlyArray<VersionRecord>,
  since: number,
  max: number = RESYNC_ORIGINS_MAX,
): RecordOrigin[] {
  const above = records.filter((record) => record.revision > since);
  const considered = above.slice(Math.max(0, above.length - max));
  const out: RecordOrigin[] = [];
  for (const record of considered) {
    if (record.origin === undefined) continue;
    out.push({
      seq: record.revision,
      n: record.n,
      clientId: record.origin.clientId,
      opIds: [...record.origin.opIds],
    });
  }
  return out;
}
