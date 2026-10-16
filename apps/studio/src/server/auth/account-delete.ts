// What an account deletion removes besides the account's rows (hardening HR-SD#2; DATA-V5 and
// DATA-4 in docs/hardening/research/data-verify.md). better-auth's `/api/auth/delete-user` deletes
// the user, its sessions and its sign in accounts, and the identity runtime's `onUserDeleted`
// marks the profile deleted, unlinks the aliases, deletes the principal record and revokes the
// keys (identity.ts). Before this module the person's decks stayed out of the trash with records
// naming them, other people's records kept the person's grants and access requests, the deck
// index (`users/<principalId>/decks.json`: the link grants, the typed name, the avatar choice)
// stayed, and the picture files under `u/<avatarKey>/` stayed readable at their URL (a public URL
// with a year of cache on the Blob tier).
//
// One hook runs before the account's rows go (`beforeAccountDelete`, bound in start.ts), over the
// account's principal id and the anonymous ids linked to it, which own the decks a browser made
// before its sign in and count as the account (`standingOf` in @turboslide/identity):
//
//   1. every deck whose stored record names one of the ids as its owner moves to the trash, with
//      the time of the deletion as its trash stamp. Nothing removes a trashed deck on a schedule
//      (SPEC 0.24): the listings and the viewer routes leave it out (decks.ts `loadShaped`), the
//      editor opens it read only under the trash banner for a holder of a grant on it, and the
//      deployment's admin deletes it forever;
//   2. every other deck's record drops the grants, the access requests and a pending ownership
//      that name one of the ids, in one conditional write announced to the deck's room;
//   3. the deck index of each id;
//   4. the picture files of the profile's avatar key (`removePictureFiles`), read before
//      `onUserDeleted` clears the key.
//
// A step that fails throws, and better-auth then deletes nothing: the account stays, and the next
// attempt repeats the steps, each of which is idempotent. The collection is listed once, the
// trashed decks included, and the records are read eight at a time: the records are the truth,
// and the index has never listed every deck a person owns. A deck without a stored record names
// nobody and stays as it is. A pending grant by address is the inviter's and stays; a grant bound
// to the account names its principal id and goes.
import { APIError } from 'better-auth/api';

import { accountPrincipalId } from '@turboslide/identity/ids';
import type { AccessRecord } from '@turboslide/schema/access';
import { ConflictError } from '@turboslide/schema/errors';
import type { IndexStore } from '@turboslide/store/access-store';
import { eachLimit } from '@turboslide/store/seed';
import type { DeckHead } from '@turboslide/store/templates';

import { requireFlag } from '../flags';
import { logSecurityEvent } from '../log';
import { removePictureFiles } from './avatar.ts';
import type { AvatarStore } from './avatar.ts';
import type { ProfileStore } from './profile.ts';

/** The account being deleted: its user id and every principal id it answers to. */
export type DeletedAccount = {
  userId: string;
  /** The account's principal id first, then the anonymous ids linked to it. */
  principalIds: readonly string[];
};

/** A record's conditional read and write, as the share actions run them (access.ts). */
export type RecordHooks = {
  load: () => Promise<AccessRecord | null>;
  save: (record: AccessRecord) => Promise<void>;
};

export type AccountDataDeps = {
  /** The collection: every head, the trashed ones included, and Move to trash. */
  decks: {
    list: (options: { includeTrashed: true }) => Promise<DeckHead[]>;
    trash: (deckId: string) => Promise<unknown>;
  };
  /** A deck's stored record, or null when the store holds none. */
  readRecord: (deckId: string) => Promise<AccessRecord | null>;
  /**
   * Applies `change` to the deck's record read past any cache and writes the result with the
   * read etag; `change` answers null when nothing is left to change. True when a write landed.
   */
  updateRecord: (
    deckId: string,
    change: (record: AccessRecord) => AccessRecord | null,
  ) => Promise<boolean>;
  index: Pick<IndexStore, 'remove'>;
  pictures: Pick<AvatarStore, 'removeKey'>;
  profiles: Pick<ProfileStore, 'get'>;
  /** How many records are read at once; 8 by default. */
  concurrency?: number;
};

export type AccountDataReport = {
  /** The decks the account owned that this run moved to the trash. */
  trashed: string[];
  /** The decks of other owners whose record named the account and no longer does. */
  released: string[];
  /** Index files removed over the account's ids. */
  indexFiles: number;
  /** Picture files removed. */
  pictureFiles: number;
};

/**
 * The record without the grants, the access requests and the pending ownership that name one of
 * `ids` by principal id, its revision counted once; null when the record names none of them there.
 * The owner and the authorship fields (`createdBy`, `invitedBy`, a link's `createdBy`) stay: they
 * record who did what, as a deleted person's edits keep their words.
 */
export function recordWithout(record: AccessRecord, ids: ReadonlySet<string>): AccessRecord | null {
  const names = (principalId: string | null): boolean =>
    principalId !== null && ids.has(principalId);
  const grants = record.grants.filter((grant) => !names(grant.principalId));
  const requests = record.requests.filter((request) => !names(request.principalId));
  const pendingOwner =
    record.pendingOwner !== null && names(record.pendingOwner.principalId)
      ? null
      : record.pendingOwner;
  if (
    grants.length === record.grants.length &&
    requests.length === record.requests.length &&
    pendingOwner === record.pendingOwner
  )
    return null;
  return { ...record, grants, requests, pendingOwner, revision: record.revision + 1 };
}

/** Runs the four steps of the header for one account; see there. */
export async function removeAccountData(
  account: DeletedAccount,
  deps: AccountDataDeps,
): Promise<AccountDataReport> {
  const ids = new Set(account.principalIds);
  const report: AccountDataReport = { trashed: [], released: [], indexFiles: 0, pictureFiles: 0 };
  const heads = await deps.decks.list({ includeTrashed: true });
  let failed = false;
  await eachLimit(heads, deps.concurrency ?? 8, async (head) => {
    // a step that failed refuses the deletion: the other readers stop at their next deck
    if (failed) return;
    try {
      const record = await deps.readRecord(head.id);
      if (record === null) return;
      if (record.owner !== null && ids.has(record.owner)) {
        if (head.trashedAt !== undefined) return;
        await deps.decks.trash(head.id);
        report.trashed.push(head.id);
        return;
      }
      if (recordWithout(record, ids) === null) return;
      // the change runs on the record the write bases on, so a grant written since the read
      // above goes too, and the owner's other edits since then stay
      if (await deps.updateRecord(head.id, (current) => recordWithout(current, ids)))
        report.released.push(head.id);
    } catch (error) {
      failed = true;
      throw error;
    }
  });
  for (const principalId of account.principalIds)
    report.indexFiles += await deps.index.remove(principalId);
  // last, so a refused deletion leaves the person's picture as it was for as long as it can
  report.pictureFiles = await removePictureFiles(
    { store: deps.pictures, profiles: deps.profiles },
    account.userId,
  );
  report.trashed.sort();
  report.released.sort();
  return report;
}

/** How many times a record write that met a newer record is based again. */
export const RECORD_ATTEMPTS = 3;

/**
 * `updateRecord` over the share actions' hooks: `load` reads past the cache, `save` writes with
 * the read etag and answers a ConflictError when another write landed in between, and the change
 * is then based on that write, up to RECORD_ATTEMPTS times.
 */
export function recordUpdater(
  hooksFor: (deckId: string) => RecordHooks,
): AccountDataDeps['updateRecord'] {
  return async (deckId, change) => {
    for (let attempt = 1; ; attempt += 1) {
      const hooks = hooksFor(deckId);
      const current = await hooks.load();
      const next = current === null ? null : change(current);
      if (next === null) return false;
      try {
        await hooks.save(next);
        return true;
      } catch (error) {
        if (attempt >= RECORD_ATTEMPTS || !(error instanceof ConflictError)) throw error;
      }
    }
  };
}

/** The sentence a deletion refused while the deployment is read only answers. */
export const DELETE_READ_ONLY =
  'Turboslide is read only right now, so your account was not deleted. Try again later.';

/** The sentence a deletion answers when a step failed; the account stays. */
export const DELETE_NOT_DONE =
  'Your account was not deleted, because its presentations and pictures could not all be removed. Try again in a minute.';

/** Where the hook finds the account's ids and the stores the four steps run over. */
export type AccountDeleteDeps = {
  /** The account's principal id and the anonymous ids linked to it. */
  principalIds: (userId: string) => Promise<string[]>;
  data: () => Promise<AccountDataDeps>;
};

/**
 * This process's stores, loaded when a deletion runs, never at boot: the collection the store
 * selection built, the access store (its cached read, and the share actions' `load` and `save`,
 * which read past the cache, write with the etag and tell the deck's room), the deck index, the
 * picture store of this tier and the identity runtime's aliases and profiles.
 */
const PROCESS_DEPS: AccountDeleteDeps = {
  principalIds: async (userId) => {
    const { identityRuntime } = await import('./identity.ts');
    const runtime = identityRuntime();
    await runtime.ready;
    return [accountPrincipalId(userId), ...(await runtime.aliases.aliasesOf(userId))];
  },
  data: async () => {
    const [root, access, { selectAvatarStore }, { identityRuntime }] = await Promise.all([
      import('../root'),
      import('../access'),
      import('./avatar-tier.ts'),
      import('./identity.ts'),
    ]);
    const decks = await root.ensureDecks();
    return {
      decks: {
        list: (options) => decks.list(options),
        trash: (deckId) => decks.trash(deckId),
      },
      readRecord: (deckId) => access.readAccess(deckId),
      updateRecord: recordUpdater((deckId) => access.hostedAccessHooks(deckId)),
      index: await access.indexStore(),
      pictures: selectAvatarStore(),
      profiles: identityRuntime().profiles,
    };
  },
};

/**
 * The hook start.ts binds (`bindIdentityHooks({ beforeDelete })`); one function, so binding it on
 * every request binds it once.
 */
export async function beforeAccountDelete(userId: string): Promise<void> {
  await deleteAccountData(userId, PROCESS_DEPS);
}

/**
 * Refused while the deployment is read only, then the four steps over `deps`, then one `delete`
 * line in the security log with the counts. A refusal or a failed step answers the person a 503
 * with its sentence, and better-auth deletes nothing.
 */
export async function deleteAccountData(
  userId: string,
  deps: AccountDeleteDeps,
): Promise<AccountDataReport> {
  const started = Date.now();
  const identity = accountPrincipalId(userId);
  const refused = await requireFlag('readOnly', { identity, action: 'account.delete' });
  if (refused !== null)
    throw new APIError('SERVICE_UNAVAILABLE', { message: DELETE_READ_ONLY, code: 'READ_ONLY' });
  let report: AccountDataReport;
  try {
    const principalIds = await deps.principalIds(userId);
    report = await removeAccountData({ userId, principalIds }, await deps.data());
  } catch (error) {
    logSecurityEvent({
      event: 'delete',
      action: 'account.delete',
      identity,
      status: 503,
      reason: `the account's data was not removed: ${error instanceof Error ? error.message : String(error)}`,
      ms: Date.now() - started,
    });
    throw new APIError('SERVICE_UNAVAILABLE', {
      message: DELETE_NOT_DONE,
      code: 'ACCOUNT_DATA_NOT_REMOVED',
    });
  }
  logSecurityEvent({
    event: 'delete',
    action: 'account.delete',
    identity,
    status: 200,
    removed: report.trashed.length,
    reason: `decks moved to the trash: ${report.trashed.length}; records of other decks released: ${report.released.length}; index files removed: ${report.indexFiles}; picture files removed: ${report.pictureFiles}`,
    ms: Date.now() - started,
  });
  return report;
}
