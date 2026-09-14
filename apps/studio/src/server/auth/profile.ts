// The account facts better-auth's user row does not hold (gslides-parity SPEC-3 7.4, 7.6, 7.7;
// research 03 F, G, I4): the admin flag (`admin.bootstrap`, `TURBOSLIDE_ADMIN_EMAILS`), the
// avatar choice and the picture files' key prefix (rotated on every change so an old picture's
// URL dies with it), and the deletion stamp that renders a principal as "Deleted account" without
// touching a byte of history. One row per user in ts_profile; memory for tests.
import type { Kysely } from 'kysely';

import type { AvatarChoice } from '@turboslide/identity/principal';

import type { AuthDatabase, ProfileTable } from './schema.ts';

export type Profile = {
  userId: string;
  admin: boolean;
  avatar: AvatarChoice | null;
  avatarKey: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProfileStore = {
  get: (userId: string) => Promise<Profile | null>;
  /** Creates the row when missing; returns the current profile. */
  ensure: (userId: string, now?: Date) => Promise<Profile>;
  setAdmin: (userId: string, admin: boolean, now?: Date) => Promise<Profile>;
  setAvatar: (
    userId: string,
    avatar: AvatarChoice | null,
    avatarKey: string | null,
    now?: Date,
  ) => Promise<Profile>;
  markDeleted: (userId: string, now?: Date) => Promise<Profile>;
  /** Every admin's user id, for the deployment admin rule. */
  admins: () => Promise<string[]>;
};

function parseAvatar(value: string | null): AvatarChoice | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as AvatarChoice;
  } catch {
    return null;
  }
}

function rowToProfile(row: ProfileTable): Profile {
  return {
    userId: row.userId,
    admin: row.admin === 1,
    avatar: parseAvatar(row.avatar),
    avatarKey: row.avatarKey,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function dbProfileStore(db: Kysely<AuthDatabase>): ProfileStore {
  const store: ProfileStore = {
    async get(userId) {
      const row = await db
        .selectFrom('ts_profile')
        .selectAll()
        .where('userId', '=', userId)
        .executeTakeFirst();
      return row === undefined ? null : rowToProfile(row);
    },
    async ensure(userId, now = new Date()) {
      const existing = await store.get(userId);
      if (existing !== null) return existing;
      const stamp = now.toISOString();
      const row: ProfileTable = {
        userId,
        admin: 0,
        avatar: null,
        avatarKey: null,
        deletedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      await db.insertInto('ts_profile').values(row).execute();
      return rowToProfile(row);
    },
    async setAdmin(userId, admin, now = new Date()) {
      await store.ensure(userId, now);
      await db
        .updateTable('ts_profile')
        .set({ admin: admin ? 1 : 0, updatedAt: now.toISOString() })
        .where('userId', '=', userId)
        .execute();
      return (await store.get(userId))!;
    },
    async setAvatar(userId, avatar, avatarKey, now = new Date()) {
      await store.ensure(userId, now);
      await db
        .updateTable('ts_profile')
        .set({
          avatar: avatar === null ? null : JSON.stringify(avatar),
          avatarKey,
          updatedAt: now.toISOString(),
        })
        .where('userId', '=', userId)
        .execute();
      return (await store.get(userId))!;
    },
    async markDeleted(userId, now = new Date()) {
      await store.ensure(userId, now);
      const stamp = now.toISOString();
      await db
        .updateTable('ts_profile')
        .set({ deletedAt: stamp, updatedAt: stamp, avatar: null, avatarKey: null, admin: 0 })
        .where('userId', '=', userId)
        .execute();
      return (await store.get(userId))!;
    },
    async admins() {
      const rows = await db
        .selectFrom('ts_profile')
        .select('userId')
        .where('admin', '=', 1)
        .execute();
      return rows.map((row) => row.userId);
    },
  };
  return store;
}

export function memoryProfileStore(): ProfileStore {
  const rows = new Map<string, Profile>();
  const store: ProfileStore = {
    get: (userId) => Promise.resolve(rows.get(userId) ?? null),
    ensure(userId, now = new Date()) {
      const existing = rows.get(userId);
      if (existing !== undefined) return Promise.resolve(existing);
      const stamp = now.toISOString();
      const profile: Profile = {
        userId,
        admin: false,
        avatar: null,
        avatarKey: null,
        deletedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      rows.set(userId, profile);
      return Promise.resolve(profile);
    },
    async setAdmin(userId, admin, now = new Date()) {
      const profile = await store.ensure(userId, now);
      const next = { ...profile, admin, updatedAt: now.toISOString() };
      rows.set(userId, next);
      return next;
    },
    async setAvatar(userId, avatar, avatarKey, now = new Date()) {
      const profile = await store.ensure(userId, now);
      const next = { ...profile, avatar, avatarKey, updatedAt: now.toISOString() };
      rows.set(userId, next);
      return next;
    },
    async markDeleted(userId, now = new Date()) {
      const profile = await store.ensure(userId, now);
      const stamp = now.toISOString();
      const next = {
        ...profile,
        deletedAt: stamp,
        updatedAt: stamp,
        avatar: null,
        avatarKey: null,
        admin: false,
      };
      rows.set(userId, next);
      return next;
    },
    admins: () =>
      Promise.resolve(
        [...rows.values()].filter((p) => p.admin && p.deletedAt === null).map((p) => p.userId),
      ),
  };
  return store;
}

export const ADMIN_EMAILS_VARIABLE = 'TURBOSLIDE_ADMIN_EMAILS';

/** The addresses `TURBOSLIDE_ADMIN_EMAILS` names, lower case, empty when unset. */
export function adminEmails(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  return (env[ADMIN_EMAILS_VARIABLE] ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}
