// The editor loader's reads in three rounds (hardening PS#5, PERF-4). Before this push
// `readEditorDeck` (write.ts) awaited each read before it started the next: the deck's head, the
// caller, the decision, the room, the live document, the three store reads, the access record, the
// resolved caller, the templates, the comments and the views, a serial chain of 13 that took 1.46
// to 1.71 s on production (docs/hardening/research/perf.md, PERF-4). Here every read starts once
// the reads it needs have answered: round one holds the reads that need only the deck's id and the
// request, round two the reads that need the caller or the room, round three the views and the
// room ticket, which need the decision and the documents. Server only, reached through the
// handler's dynamic import; the module imports types alone.
import type { ResolvedIdentity } from '@turboslide/identity/resolve';
import type { AccessRecord } from '@turboslide/schema/access';
import type { Lease, Version } from '@turboslide/schema/mutations';
import type { ReadResult, VersionRecord } from '@turboslide/store/store';
import type { DefaultKit } from '@turboslide/store/templates';

import type { Decision } from './authorize';
import type { LiveDocument, RequestIdentity, Room } from './room';

/** The reads of one editor load, each a step the handler binds to the request (write.ts). */
export type EditorLoadSteps<Finished> = {
  /** whether the store holds the deck; false answers null before any other read is used */
  deckHead: () => Promise<boolean>;
  /** the caller (room.ts `requestIdentity`, past the index cache) */
  identity: () => Promise<RequestIdentity>;
  room: () => Promise<Room>;
  accessRecord: () => Promise<AccessRecord>;
  /** the deployment's default kit */
  templates: () => Promise<DefaultKit>;
  decide: (identity: RequestIdentity) => Promise<Decision>;
  /**
   * binds the caller's pending email invitations (access.ts `bindEmailGrants`): the record it
   * wrote when it bound one, else null. A bound record is read again, the one read of a fourth
   * round, at an invitee's first load alone
   */
  bindGrants: (identity: RequestIdentity) => Promise<AccessRecord | null>;
  live: (room: Room) => Promise<LiveDocument>;
  document: (room: Room) => Promise<ReadResult>;
  versions: (room: Room) => Promise<Version[]>;
  leases: (room: Room) => Promise<Lease[]>;
  /** the whole log for a resync read (`since`), else null and nothing is read */
  records: ((room: Room) => Promise<VersionRecord[]>) | null;
  /** the comment authors' principal ids; read beside the documents and used only when the decision allows comments */
  commentAuthors: (room: Room) => Promise<string[]>;
  resolve: (identity: RequestIdentity) => Promise<ResolvedIdentity>;
  /** round three: the views and the ticket, given every read above */
  finish: (reads: EditorReads) => Promise<Finished>;
};

/** What rounds one and two read, for the handler's shaping and round three. */
export type EditorReads = {
  identity: RequestIdentity;
  room: Room;
  record: AccessRecord;
  kit: DefaultKit;
  decision: Extract<Decision, { ok: true }>;
  live: LiveDocument;
  read: ReadResult;
  versions: Version[];
  leases: Lease[];
  records: VersionRecord[] | undefined;
  commentAuthors: string[];
  resolved: ResolvedIdentity;
};

/** A promise whose rejection is read later or never: no unhandled rejection while it waits. */
function held<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

/**
 * Runs the loader's reads in three rounds and answers `finish`'s value, or null for a deck the
 * store does not hold or a caller the decision refuses. The reads a round starts beside the head
 * and the decision are left to settle when the answer is null; none of their bytes reaches it. A
 * read that throws rejects the load with its error (the handler answers a gone deck as null).
 */
export async function loadEditorReads<Finished>(
  steps: EditorLoadSteps<Finished>,
): Promise<Finished | null> {
  // round one: the deck's id and the request
  const head = held(steps.deckHead());
  const identity = held(steps.identity());
  const room = held(steps.room());
  const record = held(steps.accessRecord());
  const kit = held(steps.templates());
  // round two: each read starts once its own input answered
  const decision = held(identity.then((who) => steps.decide(who)));
  const bound = held(identity.then((who) => steps.bindGrants(who)));
  const resolved = held(identity.then((who) => steps.resolve(who)));
  const live = held(room.then((open) => steps.live(open)));
  const read = held(room.then((open) => steps.document(open)));
  const versions = held(room.then((open) => steps.versions(open)));
  const leases = held(room.then((open) => steps.leases(open)));
  const recordsStep = steps.records;
  const records = held(
    recordsStep === null ? Promise.resolve(undefined) : room.then((open) => recordsStep(open)),
  );
  const commentAuthors = held(room.then((open) => steps.commentAuthors(open)));
  if (!(await head)) return null;
  const decided = await decision;
  if (!decided.ok) return null;
  const rebound = await bound;
  const reads: EditorReads = {
    identity: await identity,
    room: await room,
    // the record the binding wrote is read again through the effective access rule
    record: rebound === null ? await record : await steps.accessRecord(),
    kit: await kit,
    decision: decided,
    live: await live,
    read: await read,
    versions: await versions,
    leases: await leases,
    records: await records,
    commentAuthors: await commentAuthors,
    resolved: await resolved,
  };
  // round three
  return steps.finish(reads);
}
