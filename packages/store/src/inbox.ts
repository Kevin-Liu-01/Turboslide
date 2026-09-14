// The inbox (gslides-parity SPEC-3 5.5; research 08 5.2; report 10 F39): one record per event
// kind (`mention`, `reply`, `assigned`, `resolved`, `reopened`, `reaction`, `accessRequest`,
// `granted`, `versionNamed`, `comment`), coalesced per thread inside a 15 minute window, at most
// 500 unread and 5,000 in all per principal, with the per deck notification level (All comments,
// Comments for you, None). Three backends behind one interface: a JSON file per principal under
// `.turboslide/inbox/` on a checkout (the file the CLI's records write, apps/cli/src/records/
// inbox.ts, same path and bytes), a Redis sorted set with a 30 day TTL for anonymous principals
// hosted (over the two command shape the realtime channel's client offers), and memory for the
// tests and the tmp overlay. The coalescing and the caps are one pure function so every backend
// answers the same rows. Framework free.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { NotificationKind, NotificationLevel } from '@turboslide/schema/actions';
import { NOTIFICATION_KINDS } from '@turboslide/schema/actions';

export const INBOX_DIR = 'inbox';
/** Events of one kind on one thread inside this window are one row (08 5.2). */
export const COALESCE_WINDOW_MS = 15 * 60_000;
export const MAX_UNREAD = 500;
export const MAX_RECORDS = 5_000;
/** An anonymous principal's inbox lives this long in Redis (08 5.2). */
export const INBOX_TTL_MS = 30 * 24 * 60 * 60_000;
export const DEFAULT_LEVEL: NotificationLevel = 'forYou';

export type Notification = {
  id: string;
  principalId: string;
  kind: NotificationKind;
  deckId: string;
  threadId?: string;
  slideId?: string;
  /** the principals that caused the record, newest first */
  actors: string[];
  count: number;
  createdAt: string;
  updatedAt: string;
  readAt?: string;
};

export type DeckNotificationSettings = {
  level: NotificationLevel;
  email: boolean;
  activityForCommenters: boolean;
};

/** The file of one principal, the shape the CLI's records write. */
export type InboxFile = {
  version: 1;
  principalId: string;
  records: Notification[];
  settings: Record<string, Partial<DeckNotificationSettings>>;
};

export type NotificationEvent = {
  kind: NotificationKind;
  deckId: string;
  threadId?: string;
  slideId?: string;
  actor: string;
  at: string;
};

export type ListOptions = { unread?: boolean; since?: string; limit?: number };

export type Inbox = {
  readonly kind: 'memory' | 'file' | 'redis';
  /** adds one event; null when the level drops it or the actor is the principal */
  push: (
    principalId: string,
    event: NotificationEvent,
    id: () => string,
  ) => Promise<Notification | null>;
  list: (
    principalId: string,
    options?: ListOptions,
  ) => Promise<{ records: Notification[]; unread: number }>;
  /** marks rows read; answers the unread count after */
  markRead: (principalId: string, ids: readonly string[] | 'all', at?: string) => Promise<number>;
  unread: (principalId: string) => Promise<number>;
  settings: (principalId: string, deckId: string) => Promise<DeckNotificationSettings>;
  setSettings: (
    principalId: string,
    deckId: string,
    patch: Partial<DeckNotificationSettings>,
  ) => Promise<DeckNotificationSettings>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is NotificationKind {
  return typeof value === 'string' && (NOTIFICATION_KINDS as ReadonlyArray<string>).includes(value);
}

export function emptyInbox(principalId: string): InboxFile {
  return { version: 1, principalId, records: [], settings: {} };
}

/** A file safe name for a principal id, the one the CLI's records use. */
export function inboxFileName(principalId: string): string {
  return `${principalId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
}

export function parseInboxFile(raw: unknown, principalId: string): InboxFile {
  const empty = emptyInbox(principalId);
  if (!isRecord(raw)) return empty;
  const records = Array.isArray(raw.records)
    ? raw.records.filter(
        (row): row is Notification =>
          isRecord(row) &&
          typeof row.id === 'string' &&
          isKind(row.kind) &&
          typeof row.deckId === 'string' &&
          Array.isArray(row.actors),
      )
    : [];
  return {
    version: 1,
    principalId,
    records,
    settings: isRecord(raw.settings) ? (raw.settings as InboxFile['settings']) : {},
  };
}

export function settingsOf(file: InboxFile, deckId: string): DeckNotificationSettings {
  const row = file.settings[deckId] ?? {};
  return {
    level: row.level ?? DEFAULT_LEVEL,
    email: row.email ?? true,
    activityForCommenters: row.activityForCommenters ?? false,
  };
}

/**
 * The pure push (08 5.2): the actor never notifies itself; the deck's level drops `comment` under
 * Comments for you and everything under None; an unread row of the same kind on the same thread
 * inside the window gains the actor and the count; the caps drop the oldest read rows first.
 */
export function pushInto(
  file: InboxFile,
  event: NotificationEvent,
  id: () => string,
): Notification | null {
  if (file.principalId === event.actor) return null;
  const level = settingsOf(file, event.deckId).level;
  if (level === 'none') return null;
  if (level === 'forYou' && event.kind === 'comment') return null;
  const since = Date.parse(event.at) - COALESCE_WINDOW_MS;
  const open = file.records.find(
    (row) =>
      row.kind === event.kind &&
      row.deckId === event.deckId &&
      row.threadId === event.threadId &&
      row.readAt === undefined &&
      Date.parse(row.updatedAt) >= since,
  );
  let record: Notification;
  if (open !== undefined) {
    open.count += 1;
    open.updatedAt = event.at;
    open.actors = [event.actor, ...open.actors.filter((actor) => actor !== event.actor)];
    record = open;
  } else {
    record = {
      id: id(),
      principalId: file.principalId,
      kind: event.kind,
      deckId: event.deckId,
      ...(event.threadId !== undefined ? { threadId: event.threadId } : {}),
      ...(event.slideId !== undefined ? { slideId: event.slideId } : {}),
      actors: [event.actor],
      count: 1,
      createdAt: event.at,
      updatedAt: event.at,
    };
    file.records.push(record);
  }
  trimInbox(file);
  return record;
}

/** The caps (08 5.2): past 500 unread the oldest unread rows leave; past 5,000 in all the oldest read rows leave. */
export function trimInbox(file: InboxFile): void {
  const byAge = (a: Notification, b: Notification): number =>
    a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id);
  const unread = file.records.filter((row) => row.readAt === undefined).sort(byAge);
  if (unread.length > MAX_UNREAD) {
    const drop = new Set(unread.slice(0, unread.length - MAX_UNREAD));
    file.records = file.records.filter((row) => !drop.has(row));
  }
  if (file.records.length > MAX_RECORDS) {
    const read = file.records.filter((row) => row.readAt !== undefined).sort(byAge);
    const drop = new Set(read.slice(0, file.records.length - MAX_RECORDS));
    file.records = file.records.filter((row) => !drop.has(row));
  }
}

export function listFrom(
  file: InboxFile,
  options: ListOptions = {},
): { records: Notification[]; unread: number } {
  const rows = file.records
    .filter((row) => (options.unread === true ? row.readAt === undefined : true))
    .filter((row) => (options.since === undefined ? true : row.updatedAt > options.since))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
  return {
    records: rows.slice(0, options.limit ?? 100),
    unread: file.records.filter((row) => row.readAt === undefined).length,
  };
}

export function markReadIn(file: InboxFile, ids: readonly string[] | 'all', at: string): number {
  for (const row of file.records) {
    if (row.readAt !== undefined) continue;
    if (ids === 'all' || ids.includes(row.id)) row.readAt = at;
  }
  return file.records.filter((row) => row.readAt === undefined).length;
}

/** An inbox over a load and save pair; the three backends differ only there. */
function inboxOver(
  kind: Inbox['kind'],
  load: (principalId: string) => Promise<InboxFile>,
  save: (file: InboxFile) => Promise<void>,
): Inbox {
  return {
    kind,
    async push(principalId, event, id) {
      const file = await load(principalId);
      const record = pushInto(file, event, id);
      if (record !== null) await save(file);
      return record;
    },
    async list(principalId, options) {
      return listFrom(await load(principalId), options);
    },
    async markRead(principalId, ids, at = new Date().toISOString()) {
      const file = await load(principalId);
      const unread = markReadIn(file, ids, at);
      await save(file);
      return unread;
    },
    async unread(principalId) {
      return (await load(principalId)).records.filter((row) => row.readAt === undefined).length;
    },
    async settings(principalId, deckId) {
      return settingsOf(await load(principalId), deckId);
    },
    async setSettings(principalId, deckId, patch) {
      const file = await load(principalId);
      const current = settingsOf(file, deckId);
      const next = { ...current, ...patch };
      file.settings[deckId] = next;
      await save(file);
      return next;
    },
  };
}

export function memoryInbox(): Inbox & { readonly files: Map<string, InboxFile> } {
  const files = new Map<string, InboxFile>();
  const inbox = inboxOver(
    'memory',
    async (principalId) => files.get(principalId) ?? emptyInbox(principalId),
    async (file) => {
      files.set(file.principalId, file);
    },
  );
  return { ...inbox, files };
}

/** `<stateDir>/inbox/<principal>.json`, the CLI's file (apps/cli/src/records/inbox.ts). */
export function fileInbox(stateDir: string): Inbox {
  const pathOf = (principalId: string): string =>
    join(stateDir, INBOX_DIR, inboxFileName(principalId));
  return inboxOver(
    'file',
    async (principalId) => {
      const path = pathOf(principalId);
      if (!existsSync(path)) return emptyInbox(principalId);
      try {
        return parseInboxFile(JSON.parse(readFileSync(path, 'utf8')), principalId);
      } catch {
        return emptyInbox(principalId);
      }
    },
    async (file) => {
      mkdirSync(join(stateDir, INBOX_DIR), { recursive: true });
      const path = pathOf(file.principalId);
      const partial = `${path}.${process.pid}.part`;
      writeFileSync(partial, `${JSON.stringify(file, null, 2)}\n`);
      renameSync(partial, path);
    },
  );
}

/** The one command the Redis backend needs, the shape of the realtime channel's `RedisCommands.call`. */
export type InboxRedis = {
  call: (command: string, ...args: (string | number)[]) => Promise<unknown>;
};

/**
 * `inbox:<principalId>` as one JSON value with a 30 day TTL refreshed on every write (08 5.2 names
 * a sorted set; one value keeps the coalescing and the caps in the pure function above and costs
 * one command per read and one per write, which the budgets of 3.9 count).
 */
export function redisInbox(
  redis: InboxRedis,
  keyOf: (principalId: string) => string = (id) => `inbox:${id}`,
): Inbox {
  return inboxOver(
    'redis',
    async (principalId) => {
      const raw = await redis.call('GET', keyOf(principalId));
      if (typeof raw !== 'string') return emptyInbox(principalId);
      try {
        return parseInboxFile(JSON.parse(raw), principalId);
      } catch {
        return emptyInbox(principalId);
      }
    },
    async (file) => {
      await redis.call('SET', keyOf(file.principalId), JSON.stringify(file), 'PX', INBOX_TTL_MS);
    },
  );
}
