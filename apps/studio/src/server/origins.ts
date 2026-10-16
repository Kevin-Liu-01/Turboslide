// The origins a resync read answers (docs/archive/rounds/SYNC.md 3.2), apart from server/write.ts
// (polish two, P2-V1.4 finding 6; SPEC-4 3.12): the bound is the realtime protocol's replay bound,
// and write.ts is imported by the /new, /edit and /present loaders, so an export of write.ts that
// named the protocol put the protocol, the schema's mutations and documents and zod in the chunk
// every route loads. write.ts reads `resyncReadSince` inside its loader's handler only, which the
// client build drops with the import.
import type { RealtimeTier } from '@turboslide/realtime/channel';
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
 * The resync read's answer beside the document (RELIABILITY-17; hardening HR-RT#15), on every
 * tier. `origins` are the records above the tab's old position, oldest first, at most `max`
 * records considered (the newest ones when the log above the position is longer, so the bound
 * reads as "within REPLAY_MAX_ENTRIES of the head"); a record without an origin (a write from the
 * CLI, an agent's strict write, a record from before the round) names nothing and is skipped. Each
 * names its place in the tab's position space: the revision on the blob tier, where a tab's seq is the
 * revision, and the last stream seq the record folded (`ops.toSeq`) on the stream tiers (memory,
 * redis, do), where a tab's seq is the stream's. Before this every tier read the revision, so on
 * the stream tiers, whose seqs run far ahead of the revisions, no record was above the old
 * position and the answer named no origin.
 *
 * `bounded` is true when the records the read answers do not reach the old position: more than
 * `max` of them stand above it, or the oldest it answers starts above `since + 1` (the log it read
 * holds no record of the entries just above the position). A pending op the tab posted before the
 * resync may then sit in a record the answer does not name, so the room client returns it to its
 * author instead of sending it again (room-client.ts `settleFromResync`). Before this only the blob
 * tier had the bound, read by the client from the revisions; the do tier re-folded such ops onto
 * the fresh document. The entries above the newest record (the object's or the stream's
 * uncommitted tail) are not records: an op sent again that the tail holds is answered from the
 * log by its op id (`findEntry`, the stream's dedupe), so they leave `bounded` alone. A record
 * without `ops` on a stream tier (a write from outside the stream) folded no entry and is not
 * read there. Pure.
 */
export function resyncReadSince(
  records: ReadonlyArray<VersionRecord>,
  since: number,
  tier: RealtimeTier,
  max: number = RESYNC_ORIGINS_MAX,
): { origins: RecordOrigin[]; bounded: boolean } {
  const placed: { record: VersionRecord; from: number; at: number }[] = [];
  for (const record of records) {
    if (tier === 'blob') placed.push({ record, from: record.revision, at: record.revision });
    else if (record.ops !== undefined)
      placed.push({ record, from: record.ops.fromSeq, at: record.ops.toSeq });
  }
  placed.sort((a, b) => a.at - b.at);
  const above = placed.filter((row) => row.at > since);
  const considered = above.slice(Math.max(0, above.length - max));
  const origins: RecordOrigin[] = [];
  for (const { record, at } of considered) {
    if (record.origin === undefined) continue;
    origins.push({
      seq: at,
      n: record.n,
      clientId: record.origin.clientId,
      opIds: [...record.origin.opIds],
    });
  }
  const oldest = considered[0];
  const bounded = above.length > max || (oldest !== undefined && oldest.from > since + 1);
  return { origins, bounded };
}
