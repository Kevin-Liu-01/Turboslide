import type { Dispatcher } from '@turboslide/agent/dispatch';
import {
  STAND_IN_PREFIX,
  authorWithStandIn,
  commentOpWithStandIns,
  isStandIn,
  standInKey,
  standInOf,
  standInsWith,
  versionsWithStandIns,
} from '@turboslide/identity/stand-in';
import type { StandIns } from '@turboslide/identity/stand-in';
import { ROOM_SECRET_VARIABLE } from '@turboslide/realtime/select';
import type { AccessRecord } from '@turboslide/schema/access';
import type { CommentOp } from '@turboslide/schema/comments';
import { ConflictError } from '@turboslide/schema/errors';
import type { Author, Version } from '@turboslide/schema/mutations';

import { downloadSecret } from './tokens';
import type { EditorDeck, EditorIdentity } from './write';

/**
 * Stand-ins for principal ids in the answers to a reader who may not share the deck (hardening
 * HR-SD#1, DATA-V2). A principal id names the person's deck index on the store
 * (`users/<id>/decks.json`), so before this one deck read by a viewer led to its owner's and its
 * collaborators' whole library. A reader without the `share` capability gets, in place of each
 * other person's id, a stand-in: `ref_` and 22 characters of an HMAC over the deck id and the
 * principal id (@turboslide/identity/stand-in, the one definition). The key comes from
 * `TURBOSLIDE_ROOM_SECRET` when it is set, the value the realtime Worker verifies the room tickets
 * with, so the Worker's deck room names a person on a deck as the studio's answers do (the fix
 * round after verifier pass 2, F2), and from `TURBOSLIDE_DOWNLOAD_SECRET` otherwise. It is the same
 * for one person on one deck on every instance, so the page's people map, the version rows and the
 * Share dialog's owner row still meet, and it differs between decks, so two decks never show that
 * they name the same person. It is no principal id: no store path, lookup or index takes it. The
 * reader's own ids stay as they are, because the page tells "You" by them.
 */

export { STAND_IN_PREFIX, isStandIn, versionsWithStandIns };
export type { StandIns };

let cached: { id: string; key: Uint8Array } | undefined;

/** The deployment's stand-in key, derived once per secret value. */
function key(env: NodeJS.ProcessEnv = process.env): Uint8Array {
  const room = env[ROOM_SECRET_VARIABLE];
  const secret = room !== undefined && room !== '' ? room : downloadSecret(env);
  const id = typeof secret === 'string' ? `room:${secret}` : `download:${secret.toString('hex')}`;
  if (cached === undefined || cached.id !== id) cached = { id, key: standInKey(secret) };
  return cached.key;
}

/** The stand-in of one principal on one deck. */
export function standInFor(deckId: string, principalId: string): string {
  return standInOf(key(), deckId, principalId);
}

export function standInsFor(deckId: string, own: Iterable<string | null | undefined>): StandIns {
  return standInsWith((principalId) => standInFor(deckId, principalId), own);
}

/**
 * The principal a stand-in names on a deck among the principals the deck knows, or undefined. A
 * reader who may not share writes a mention or an assignee with the stand-ins it read, and the
 * server stores the principal (comments.ts).
 */
export function principalOfStandIn(
  deckId: string,
  standIn: string,
  known: Iterable<string>,
): string | undefined {
  if (!isStandIn(standIn)) return undefined;
  for (const principalId of known)
    if (standInFor(deckId, principalId) === standIn) return principalId;
  return undefined;
}

/**
 * The loader's answer for a reader who may not share the deck (hardening HR-SD#1, DATA-V2): no
 * other person's principal id. The access record is the reader's (access.ts recordForReader,
 * which the caller passes as `readerRecord` with the stand-ins applied), the version authors and
 * the lease holders carry stand-ins, and the people map is keyed by them, so the version rows and
 * the Share dialog's owner row still find the name and the mark. The comment authors are keyed by
 * their stand-ins as well, the ids `comment.list` and the room's stream name them by for such a
 * reader (the fix round after verifier pass 2, F2). Pure.
 */
export function withStandIns(
  payload: EditorDeck,
  identities: Readonly<Record<string, EditorIdentity>>,
  people: StandIns,
  options: { readerRecord: AccessRecord | undefined },
): { payload: EditorDeck; identities: Record<string, EditorIdentity> } {
  const views: Record<string, EditorIdentity> = {};
  for (const [id, view] of Object.entries(identities)) {
    const standIn = people(id);
    const { accountId: _accountId, ...rest } = view;
    views[standIn] = standIn === id ? view : { ...rest, principalId: standIn };
  }
  return {
    payload: {
      ...payload,
      versions: versionsWithStandIns(payload.versions, people),
      leases: payload.leases.map((lease) => ({
        ...lease,
        holder: authorWithStandIn(lease.holder, people),
      })),
      ...(options.readerRecord === undefined ? {} : { access: options.readerRecord }),
    },
    identities: views,
  };
}

// ---------------------------------------------------------------------------------------------
// The dispatcher's answers (verifier pass 3, V3-1). Every transport runs one dispatcher per deck
// (actions.ts deckDispatcher: the window's runDeckAction, /api/actions, /mcp, /api/agent), and
// before this its answers named every author by principal id to every caller: an editor who may
// not share read the owner's id in version.diff and version.list. These are the answers of the
// action table that carry another person's id, and how each reads for such a caller. version.save
// and slide.lease answer the caller's own author; comment.*, notification.*, share.get and
// presence.list shape their own answers (comments.ts, records/access.ts, the room).

type VersionDiffAnswer = { byAuthor: { author: Author }[] };
type DeckWatchAnswer = { versions: Version[]; comments: CommentOp[] };
type ActivityAnswer = { events: { actor?: string }[] };

const ANSWERS_WITH_STAND_INS: Readonly<
  Record<string, (output: unknown, people: StandIns) => unknown>
> = {
  'version.list': (output, people) => versionsWithStandIns(output as Version[], people),
  'version.diff': (output, people) => {
    const diff = output as VersionDiffAnswer;
    return {
      ...diff,
      byAuthor: diff.byAuthor.map((group) => ({
        ...group,
        author: authorWithStandIn(group.author, people),
      })),
    };
  },
  'deck.watch': (output, people) => {
    const watch = output as DeckWatchAnswer;
    return {
      ...watch,
      versions: versionsWithStandIns(watch.versions, people),
      comments: watch.comments.map((op) => commentOpWithStandIns(op, people)),
    };
  },
  'activity.list': (output, people) => {
    const activity = output as ActivityAnswer;
    return {
      ...activity,
      events: activity.events.map((event) =>
        event.actor === undefined ? event : { ...event, actor: people(event.actor) },
      ),
    };
  },
};

/** One answer of the dispatcher as a caller who may not share reads it; an answer that names nobody is returned as it is. */
function answerWithStandIns(action: string, output: unknown, people: StandIns): unknown {
  const shape = ANSWERS_WITH_STAND_INS[action];
  return shape === undefined || output === null || output === undefined
    ? output
    : shape(output, people);
}

/**
 * A refusal as such a caller reads it: a 409's lease holder (any write, slide.lease) as a stand-in.
 * The dispatcher's refusals and the window's lease (write.ts `refusalForReader`) take this step.
 */
export function errorWithStandIns(error: unknown, people: StandIns): unknown {
  if (!(error instanceof ConflictError) || error.holder?.principalId === undefined) return error;
  const mapped = new ConflictError(error.message, {
    currentRevision: error.currentRevision,
    ...(error.current !== undefined ? { current: error.current } : {}),
    holder: authorWithStandIn(error.holder, people),
  });
  if (error.stack !== undefined) mapped.stack = error.stack;
  return mapped;
}

/**
 * The deck's dispatcher for one caller: each answer and each refusal through the caller's people
 * mapping, resolved at the call (`people` answers null for a caller who may share the deck, so a
 * share granted or ended between two calls of one MCP session counts at the next call). Only the
 * answers that name people resolve it.
 */
export function dispatcherWithStandIns(
  dispatcher: Dispatcher,
  people: () => Promise<StandIns | null>,
): Dispatcher {
  return {
    ...dispatcher,
    dispatch: async (id, input, context) => {
      let output: unknown;
      try {
        output = await dispatcher.dispatch(id, input, context);
      } catch (error) {
        if (!(error instanceof ConflictError) || error.holder === undefined) throw error;
        const map = await people();
        throw map === null ? error : errorWithStandIns(error, map);
      }
      if (ANSWERS_WITH_STAND_INS[id] === undefined) return output;
      const map = await people();
      return map === null ? output : answerWithStandIns(id, output, map);
    },
  };
}
