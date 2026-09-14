// The inbox on a checkout (gslides-parity SPEC-3 5.5, 5.9; research-3 08 5.2): one JSON file per
// principal under `.turboslide/inbox/` at the repository root holding the notification records
// (`mention`, `reply`, `assigned`, `resolved`, `reopened`, `reaction`, `accessRequest`, `granted`,
// `versionNamed`, `comment`), coalesced per thread inside a 15 minute window, at most 500 unread
// and 5,000 in all, plus the per deck notification settings (All comments, Comments for you,
// None; the email switch is a hosted fact and stored as asked). Hosted the same records live in a
// Redis sorted set or the `inbox_notification` table behind B2's `Inbox` interface; this file is
// the checkout backend `notification.*` read for the `--author` principal.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { NotificationKind, NotificationLevel } from '@turboslide/schema/actions';
import { NOTIFICATION_KINDS } from '@turboslide/schema/actions';

import { principalFileName } from './principal.ts';

export const INBOX_DIR = 'inbox';
export const COALESCE_WINDOW_MS = 15 * 60_000;
export const MAX_UNREAD = 500;
export const MAX_RECORDS = 5_000;

export type Notification = {
  id: string;
  principalId: string;
  kind: NotificationKind;
  deckId: string;
  threadId?: string;
  slideId?: string;
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

export type InboxFile = {
  version: 1;
  principalId: string;
  records: Notification[];
  /** Per deck settings; the default is Comments for you with email on (SPEC-3 5.5). */
  settings: Record<string, Partial<DeckNotificationSettings>>;
};

export const DEFAULT_LEVEL: NotificationLevel = 'forYou';

function inboxPath(stateDir: string, principalId: string): string {
  return join(stateDir, INBOX_DIR, principalFileName(principalId));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is NotificationKind {
  return typeof value === 'string' && (NOTIFICATION_KINDS as ReadonlyArray<string>).includes(value);
}

export function readInbox(stateDir: string, principalId: string): InboxFile {
  const path = inboxPath(stateDir, principalId);
  const empty: InboxFile = { version: 1, principalId, records: [], settings: {} };
  if (!existsSync(path)) return empty;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
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
  } catch {
    return empty;
  }
}

export function writeInbox(stateDir: string, file: InboxFile): string {
  const path = inboxPath(stateDir, file.principalId);
  mkdirSync(join(stateDir, INBOX_DIR), { recursive: true });
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, `${JSON.stringify(file, null, 2)}\n`);
  renameSync(partial, path);
  return path;
}

export type NotificationEvent = {
  kind: NotificationKind;
  deckId: string;
  threadId?: string;
  slideId?: string;
  actor: string;
  at: string;
};

/**
 * Adds one event to a principal's inbox: an unread record of the same kind on the same thread
 * (or the same deck for a deck level kind) inside the 15 minute window gains the actor and the
 * count instead of a second row (08 5.2); the caps drop the oldest read rows first. The actor
 * never notifies itself.
 */
export function pushNotification(
  stateDir: string,
  principalId: string,
  event: NotificationEvent,
  id: () => string,
): Notification | null {
  if (principalId === event.actor) return null;
  const file = readInbox(stateDir, principalId);
  const level = settingsFor(file, event.deckId).level;
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
      principalId,
      kind: event.kind,
      deckId: event.deckId,
      ...(event.threadId !== undefined ? { threadId: event.threadId } : {}),
      ...(event.slideId !== undefined ? { slideId: event.slideId } : {}),
      actors: [event.actor],
      count: 1,
      createdAt: event.at,
      updatedAt: event.at,
    };
    file.records.unshift(record);
  }
  // the caps: read rows go first, then the oldest unread beyond 500
  const unread = file.records.filter((row) => row.readAt === undefined);
  if (unread.length > MAX_UNREAD) {
    const drop = new Set(unread.slice(MAX_UNREAD).map((row) => row.id));
    file.records = file.records.filter((row) => !drop.has(row.id));
  }
  while (file.records.length > MAX_RECORDS) {
    const index = file.records.map((row) => row.readAt !== undefined).lastIndexOf(true);
    file.records.splice(index >= 0 ? index : file.records.length - 1, 1);
  }
  writeInbox(stateDir, file);
  return record;
}

export function settingsFor(file: InboxFile, deckId: string): DeckNotificationSettings {
  const stored = file.settings[deckId] ?? {};
  return {
    level: stored.level ?? DEFAULT_LEVEL,
    email: stored.email ?? true,
    activityForCommenters: stored.activityForCommenters ?? false,
  };
}

export function listNotifications(
  file: InboxFile,
  options: { unread?: boolean; since?: string; limit?: number } = {},
): { notifications: Notification[]; unread: number } {
  const since = options.since === undefined ? undefined : Date.parse(options.since);
  const rows = file.records
    .filter((row) => (options.unread === true ? row.readAt === undefined : true))
    .filter((row) =>
      since === undefined || Number.isNaN(since) ? true : Date.parse(row.updatedAt) > since,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, options.limit ?? 100);
  return {
    notifications: rows,
    unread: file.records.filter((row) => row.readAt === undefined).length,
  };
}

export function markRead(
  stateDir: string,
  principalId: string,
  selection: { ids?: string[]; all?: true },
  now: string,
): { unread: number } {
  const file = readInbox(stateDir, principalId);
  const ids = selection.ids === undefined ? null : new Set(selection.ids);
  for (const row of file.records) {
    if (row.readAt !== undefined) continue;
    if (selection.all === true || (ids !== null && ids.has(row.id))) row.readAt = now;
  }
  writeInbox(stateDir, file);
  return { unread: file.records.filter((row) => row.readAt === undefined).length };
}

export function writeSettings(
  stateDir: string,
  principalId: string,
  deckId: string,
  patch: Partial<DeckNotificationSettings>,
): DeckNotificationSettings {
  const file = readInbox(stateDir, principalId);
  const next = { ...settingsFor(file, deckId), ...stripUndefined(patch) };
  file.settings[deckId] = next;
  writeInbox(stateDir, file);
  return next;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
