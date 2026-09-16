// The principal record (gslides-parity SPEC-3 7.1): `principal:<id>` in Redis hosted, a JSON
// file under `.turboslide/principals/` on a checkout, holding what an anonymous or signed in
// principal chose (name, avatar), was granted by link (the exchanged share links), and set
// (notification level, live pointers), with a 90 day sliding TTL: every request that reads the
// record re-arms it, so a person who returns within 90 days keeps their name and links and one
// who does not becomes the label their id gives. The browser mirrors name and avatar in
// `localStorage` for instant paint and never as the truth (SPEC-3 0.17).
//
// This module is browser safe and holds the record's shape, its validation, the TTL arithmetic
// and the store contract with two backends that need no I/O of their own: one over a key value
// client shaped like ioredis (`get`, `set` with a millisecond TTL, `del`, `pexpire`) and one in
// memory for tests and the `memory` tier. The file backend lives in
// apps/studio/src/server/auth/principal.ts because it reads the disk.
import type { Preferences, PreferencesStore } from '@turboslide/schema/preferences';
import { defaultPreferences, normalizePreferences } from '@turboslide/schema/preferences';
import type { LinkGrant } from './access.ts';
import { isPrincipalId } from './ids.ts';
import { labelFor } from './labels.ts';

/** 90 days, the sliding TTL of a record (SPEC-3 0.17, 7.1). */
export const PRINCIPAL_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const PRINCIPAL_KEY_PREFIX = 'principal:';

/** Google's three notification levels (SPEC-3 5.5). */
export type NotificationLevel = 'all' | 'forYou' | 'none';
export const NOTIFICATION_LEVELS: readonly NotificationLevel[] = ['all', 'forYou', 'none'];

export type AvatarVariant = 'initials' | 'glyph' | 'dither' | 'picture';
export const AVATAR_VARIANTS: readonly AvatarVariant[] = ['initials', 'glyph', 'dither', 'picture'];

/** The avatar builder's choice (SPEC-3 7.6), a small document an agent can set too. */
export type AvatarChoice = {
  variant: AvatarVariant;
  /** One or two letters typed over the display name's own, Initials tab only. */
  initials?: string;
  /** The salt "Another" rerolls on the Glyph and Dither tabs. */
  salt?: number;
  /**
   * The uploaded picture (SPEC-3 7.6): the rotated key prefix, the content digest, the sizes
   * written, and the URL prefix of the folder (`<base>/<digest>-<size>.webp` is one file), which
   * is the public store's URL hosted and the studio's avatar route on a checkout.
   */
  picture?: { avatarKey: string; digest: string; sizes: number[]; base?: string };
};

export type LivePointers = {
  /** View > Live pointers > Show collaborator pointers, on by default. */
  collaborators: boolean;
  /** View > Live pointers > Show my pointer, off by default, per deck. */
  mine: Record<string, boolean>;
};

export type PrincipalRecord = {
  principalId: string;
  /** The generated label, kept so a record reads without recomputing the hash. */
  label: string;
  /** The typed name, once chosen and accepted by the name rules; absent keeps the label. */
  name?: string;
  avatar: AvatarChoice;
  linkGrants: LinkGrant[];
  notificationSettings: NotificationLevel;
  livePointers: LivePointers;
  /**
   * Tools > Preferences and the Accessibility settings (gslides-parity SPEC-5 7.1, 0.34; R10 3.3):
   * the record of `@turboslide/schema/preferences`, the defaults of 7.1 when absent
   * (`preferencesOf`). Written by `prefs.set`, `dictionary.add` and `dictionary.remove` through
   * `principalPreferencesStore`; a record stored before a member existed reads with that member's
   * default (`normalizePreferences`, the migration of an older shape), and the one time migration
   * of the browser's `spellcheck` and `announce` toggles arrives as two `prefs.set` writes from the
   * shell (`migrateLegacySettings` in the schema module).
   */
  preferences?: Preferences;
  createdAt: string;
  lastSeenAt: string;
};

export const DEFAULT_AVATAR: Readonly<AvatarChoice> = { variant: 'initials' };

/** A fresh record for a principal seen now. */
export function newPrincipalRecord(principalId: string, now: Date = new Date()): PrincipalRecord {
  if (!isPrincipalId(principalId))
    throw new RangeError(`not a principal id: ${JSON.stringify(principalId)}`);
  const stamp = now.toISOString();
  return {
    principalId,
    label: labelFor(principalId),
    avatar: { ...DEFAULT_AVATAR },
    linkGrants: [],
    notificationSettings: 'forYou',
    livePointers: { collaborators: true, mine: {} },
    createdAt: stamp,
    lastSeenAt: stamp,
  };
}

/** The instant a record expires: 90 days after it was last seen. */
export function principalExpiresAt(record: PrincipalRecord): number {
  return Date.parse(record.lastSeenAt) + PRINCIPAL_TTL_MS;
}

export function isPrincipalExpired(record: PrincipalRecord, now: Date = new Date()): boolean {
  return principalExpiresAt(record) <= now.getTime();
}

export function principalKey(principalId: string): string {
  return `${PRINCIPAL_KEY_PREFIX}${principalId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoStamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isLinkGrant(value: unknown): value is LinkGrant {
  return (
    isRecord(value) &&
    typeof value.linkId === 'string' &&
    typeof value.deckId === 'string' &&
    (value.role === 'editor' || value.role === 'commenter' || value.role === 'viewer')
  );
}

function isAvatarChoice(value: unknown): value is AvatarChoice {
  if (!isRecord(value)) return false;
  if (!(AVATAR_VARIANTS as readonly unknown[]).includes(value.variant)) return false;
  if (value.initials !== undefined && typeof value.initials !== 'string') return false;
  if (value.salt !== undefined && typeof value.salt !== 'number') return false;
  if (value.picture !== undefined) {
    const p = value.picture;
    if (!isRecord(p) || typeof p.avatarKey !== 'string' || typeof p.digest !== 'string')
      return false;
    if (!Array.isArray(p.sizes) || !p.sizes.every((s) => typeof s === 'number')) return false;
    if (p.base !== undefined && typeof p.base !== 'string') return false;
  }
  return true;
}

/**
 * The record a store read back, or null when the bytes are not one. Unknown keys are refused so
 * a record from a later schema is not silently narrowed.
 */
export function parsePrincipalRecord(value: unknown): PrincipalRecord | null {
  if (!isRecord(value)) return null;
  const keys = new Set(Object.keys(value));
  const allowed = [
    'principalId',
    'label',
    'name',
    'avatar',
    'linkGrants',
    'notificationSettings',
    'livePointers',
    'preferences',
    'createdAt',
    'lastSeenAt',
  ];
  for (const key of keys) if (!allowed.includes(key)) return null;
  if (typeof value.principalId !== 'string' || !isPrincipalId(value.principalId)) return null;
  if (typeof value.label !== 'string') return null;
  if (value.name !== undefined && typeof value.name !== 'string') return null;
  if (!isAvatarChoice(value.avatar)) return null;
  if (!Array.isArray(value.linkGrants) || !value.linkGrants.every(isLinkGrant)) return null;
  if (!(NOTIFICATION_LEVELS as readonly unknown[]).includes(value.notificationSettings))
    return null;
  const lp = value.livePointers;
  if (!isRecord(lp) || typeof lp.collaborators !== 'boolean' || !isRecord(lp.mine)) return null;
  if (!Object.values(lp.mine).every((v) => typeof v === 'boolean')) return null;
  if (!isIsoStamp(value.createdAt) || !isIsoStamp(value.lastSeenAt)) return null;
  // the preferences (SPEC-5 7.1) read through the schema's normalizer: a member the record was
  // written before takes its default (the migration of an older shape), while a wrong type or a
  // member the record does not have refuses the whole record the way an unknown key does, so a
  // later shape is never silently narrowed
  const preferences =
    value.preferences === undefined ? undefined : normalizePreferences(value.preferences);
  if (preferences === null) return null;
  const record: PrincipalRecord = {
    principalId: value.principalId,
    label: value.label,
    avatar: value.avatar,
    linkGrants: value.linkGrants,
    notificationSettings: value.notificationSettings as NotificationLevel,
    livePointers: {
      collaborators: lp.collaborators,
      mine: { ...(lp.mine as Record<string, boolean>) },
    },
    createdAt: value.createdAt,
    lastSeenAt: value.lastSeenAt,
  };
  if (typeof value.name === 'string') record.name = value.name;
  if (preferences !== undefined) record.preferences = preferences;
  return record;
}

// ---------------------------------------------------------------------------------------------
// The preferences on the record (gslides-parity SPEC-5 7.1; R10 3.2, 3.4)

/** The record's preferences, the defaults of SPEC-5 7.1 for a principal that never set one. */
export function preferencesOf(record: Pick<PrincipalRecord, 'preferences'> | null): Preferences {
  return record?.preferences ?? defaultPreferences();
}

/** The record with its preferences replaced and `lastSeenAt` stamped, the way every write re-arms the TTL. */
export function withPreferences(
  record: PrincipalRecord,
  preferences: Preferences,
  now: Date = new Date(),
): PrincipalRecord {
  return { ...record, preferences, lastSeenAt: now.toISOString() };
}

/**
 * The `PreferencesStore` of `@turboslide/schema/preferences` over a principal's record in any
 * `PrincipalStore` (Redis hosted, the file store on a checkout, the memory store in tests): the
 * home of `prefs.get`, `prefs.set`, `dictionary.add` and `dictionary.remove` on the hosted
 * dispatcher, composed by the studio with the request's principal. `load` touches the record
 * (creating it for a principal seen for the first time, as every read re-arms the TTL) and
 * answers its preferences or the defaults; `save` writes the whole record back. The id must be
 * one of the three principal id formats; the CLI's `local:<name>` principal has its own file
 * module in apps/cli/src/records/principal.ts.
 */
export function principalPreferencesStore(
  store: PrincipalStore,
  principalId: string,
  now: () => Date = () => new Date(),
): PreferencesStore {
  if (!isPrincipalId(principalId))
    throw new RangeError(`not a principal id: ${JSON.stringify(principalId)}`);
  const recordOf = async (): Promise<PrincipalRecord> =>
    (await store.touch(principalId, now(), true)) ?? newPrincipalRecord(principalId, now());
  return {
    async load() {
      return preferencesOf(await recordOf());
    },
    async save(preferences) {
      const record = withPreferences(await recordOf(), preferences, now());
      await store.put(record);
      return preferencesOf(record);
    },
  };
}

/**
 * The store contract. `get` answers null for a missing or expired record; `touch` re-arms the
 * TTL and stamps `lastSeenAt` (creating the record when `create` is set); `put` writes a record
 * with the TTL from its `lastSeenAt`.
 */
export type PrincipalStore = {
  get(principalId: string, now?: Date): Promise<PrincipalRecord | null>;
  put(record: PrincipalRecord): Promise<void>;
  touch(principalId: string, now?: Date, create?: boolean): Promise<PrincipalRecord | null>;
  delete(principalId: string): Promise<void>;
};

/** The subset of ioredis this store uses; `set` takes a millisecond TTL. */
export type KvClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
};

/** The Redis (or any key value) backend: the TTL is the store's, `lastSeenAt` the record's. */
export function kvPrincipalStore(kv: KvClient): PrincipalStore {
  const store: PrincipalStore = {
    async get(principalId, now = new Date()) {
      const raw = await kv.get(principalKey(principalId));
      if (raw === null) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      const record = parsePrincipalRecord(parsed);
      if (record === null || isPrincipalExpired(record, now)) return null;
      return record;
    },
    async put(record) {
      const ttl = Math.max(1, principalExpiresAt(record) - Date.now());
      await kv.set(principalKey(record.principalId), JSON.stringify(record), ttl);
    },
    async touch(principalId, now = new Date(), create = false) {
      const existing = await store.get(principalId, now);
      const record = existing ?? (create ? newPrincipalRecord(principalId, now) : null);
      if (record === null) return null;
      const touched: PrincipalRecord = { ...record, lastSeenAt: now.toISOString() };
      await kv.set(principalKey(principalId), JSON.stringify(touched), PRINCIPAL_TTL_MS);
      return touched;
    },
    async delete(principalId) {
      await kv.del(principalKey(principalId));
    },
  };
  return store;
}

/** An in memory key value client with expiry, for tests and the `memory` tier. */
export function memoryKv(clock: () => number = () => Date.now()): KvClient & { size(): number } {
  const entries = new Map<string, { value: string; expiresAt: number }>();
  const sweep = (key: string): void => {
    const entry = entries.get(key);
    if (entry !== undefined && entry.expiresAt <= clock()) entries.delete(key);
  };
  return {
    async get(key) {
      sweep(key);
      return entries.get(key)?.value ?? null;
    },
    async set(key, value, ttlMs) {
      entries.set(key, { value, expiresAt: clock() + ttlMs });
    },
    async del(key) {
      entries.delete(key);
    },
    size() {
      for (const key of [...entries.keys()]) sweep(key);
      return entries.size;
    },
  };
}

export function memoryPrincipalStore(clock?: () => number): PrincipalStore {
  return kvPrincipalStore(memoryKv(clock));
}
