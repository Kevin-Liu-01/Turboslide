// The alias table (gslides-parity SPEC-3 7.4; research 03 E2): signing in links the browser's
// anonymous principal to the account through `alias { anonymousId, userId, linkedAt }`. History is
// never rewritten: every record written before the sign in keeps `anon_<uuid>` as its author and
// `resolvePrincipal` (packages/identity) renders it as the account through this table from then
// on. Two browsers linked to one account are two aliases and one person. The anonymous
// principal record's link grants and choices merge into the account's record once, here.
import type { Kysely } from 'kysely';

import type { LinkGrant } from '@turboslide/identity/access';
import type { PrincipalRecord } from '@turboslide/identity/principal';

import type { AuthDatabase } from './schema.ts';

export type AliasStore = {
  /** Records the link; a second call for the same anonymous id is a no-op. */
  link: (anonymousId: string, userId: string, now?: Date) => Promise<boolean>;
  /** The account an anonymous id was linked to, or null. */
  accountOf: (anonymousId: string) => Promise<string | null>;
  /** Every anonymous id linked to an account. */
  aliasesOf: (userId: string) => Promise<string[]>;
  /** Removes every alias of an account (Delete account, SPEC-3 7.4). */
  unlinkAll: (userId: string) => Promise<number>;
};

export function dbAliasStore(db: Kysely<AuthDatabase>): AliasStore {
  return {
    async link(anonymousId, userId, now = new Date()) {
      const existing = await db
        .selectFrom('ts_alias')
        .select('userId')
        .where('anonymousId', '=', anonymousId)
        .executeTakeFirst();
      if (existing !== undefined) return false;
      await db
        .insertInto('ts_alias')
        .values({ anonymousId, userId, linkedAt: now.toISOString() })
        .execute();
      return true;
    },
    async accountOf(anonymousId) {
      const row = await db
        .selectFrom('ts_alias')
        .select('userId')
        .where('anonymousId', '=', anonymousId)
        .executeTakeFirst();
      return row?.userId ?? null;
    },
    async aliasesOf(userId) {
      const rows = await db
        .selectFrom('ts_alias')
        .select('anonymousId')
        .where('userId', '=', userId)
        .orderBy('linkedAt', 'asc')
        .execute();
      return rows.map((row) => row.anonymousId);
    },
    async unlinkAll(userId) {
      const result = await db
        .deleteFrom('ts_alias')
        .where('userId', '=', userId)
        .executeTakeFirst();
      return Number(result.numDeletedRows ?? 0);
    },
  };
}

export function memoryAliasStore(): AliasStore & { size: () => number } {
  const aliases = new Map<string, { userId: string; linkedAt: string }>();
  return {
    link(anonymousId, userId, now = new Date()) {
      if (aliases.has(anonymousId)) return Promise.resolve(false);
      aliases.set(anonymousId, { userId, linkedAt: now.toISOString() });
      return Promise.resolve(true);
    },
    accountOf: (anonymousId) => Promise.resolve(aliases.get(anonymousId)?.userId ?? null),
    aliasesOf: (userId) =>
      Promise.resolve(
        [...aliases.entries()]
          .filter(([, entry]) => entry.userId === userId)
          .sort((a, b) => a[1].linkedAt.localeCompare(b[1].linkedAt))
          .map(([id]) => id),
      ),
    unlinkAll(userId) {
      let n = 0;
      for (const [id, entry] of [...aliases.entries()])
        if (entry.userId === userId) {
          aliases.delete(id);
          n += 1;
        }
      return Promise.resolve(n);
    },
    size: () => aliases.size,
  };
}

/**
 * The account's principal record after a link (SPEC-3 7.4 "the anonymous index and inbox merge
 * into the account's once"): the union of the link grants by link id, the anonymous record's
 * typed name and avatar when the account's record has none, the account's other settings kept.
 */
export function mergePrincipalRecords(
  anonymous: PrincipalRecord,
  account: PrincipalRecord,
): PrincipalRecord {
  const grants = new Map<string, LinkGrant>();
  for (const grant of [...account.linkGrants, ...anonymous.linkGrants])
    if (!grants.has(grant.linkId)) grants.set(grant.linkId, grant);
  const merged: PrincipalRecord = {
    ...account,
    linkGrants: [...grants.values()],
    livePointers: {
      collaborators: account.livePointers.collaborators,
      mine: { ...anonymous.livePointers.mine, ...account.livePointers.mine },
    },
  };
  if (account.name === undefined && anonymous.name !== undefined) merged.name = anonymous.name;
  if (account.avatar.variant === 'initials' && account.avatar.initials === undefined)
    merged.avatar = { ...anonymous.avatar };
  return merged;
}
