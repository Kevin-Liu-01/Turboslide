// The nightly backup of the deck documents (hardening O#1a, docs/hardening/HARDENING.md 4.8;
// RELIABILITY-13). Vercel Blob has no versioning, no soft delete and no backup of its own, and a
// `del` is final, so a bug in a removal path or a leaked token could lose work for good. Every
// night `/api/cron/backup` copies the documents, as the deployment reads them (the private store
// after K1's cutover, both stores during its dual read window), into the backup store
// `turboslide-backup` under `backup/<yyyy-mm-dd>/`:
//
//   decks/<id>/deck.json, access.json, slides/, versions/, snapshots/, comments/
//   users/<principal>/decks.json   the per principal deck indexes
//   links/<hash>.json              the link hash index, so a restored deck's share links open
//
// Twins, thumbnails, leases, exports and the `.turboslide/` sidecars are left out: the twins are
// named by their digest on the public store, the rest regenerates. Per deck, `deck.json` is
// copied first and the folder listed after it: a commit stores its snapshot before it pushes
// `deck.json` (docs/hosting.md 4, Writes), so the listing holds the snapshot the copied manifest
// names, and a restore reads that document whole (`documentAtRevision`'s snapshot path).
//
// A call copies for at most 240 s (BACKUP_BUDGET_MS, inside the function's 300 s) from the
// cursor `backup/<day>/cursor.json`, which names the last deck finished and the phase, and writes
// `backup/<day>/done.json` when the day is whole. The cron calls every ten minutes from 03:00 to
// 05:59 UTC (apps/studio/vercel.json), so a call after the day is done reads one file and prunes:
// days older than BACKUP_KEEP_DAYS leave, and the newest complete day stays whatever its age. A
// copy the source moved past since an earlier call of the same day is replaced over its own etag
// (copy.ts `replaceDiffering`). The copy itself is packages/store/src/copy.ts, the module
// `scripts/blob-copy.mjs` runs.
import type { BlobClient } from '@turboslide/store/blob-store';
import { blobContentType } from '@turboslide/store/blob-store';
import { diskBlobClient } from '@turboslide/store/blob-disk';
import { vercelBlobClient } from '@turboslide/store/blob-vercel';
import { copyClientOf, copyStore, prefixedCopyClient } from '@turboslide/store/copy';
import type { CopyClient, CopyEntry, CopySummary } from '@turboslide/store/copy';

/**
 * The names the backup store's token is read under, in order: the spec's variable, then the one
 * the Vercel dashboard made when Kevin connected `turboslide-backup` to Production with the
 * prefix `TURBOSLIDE_BACKUP_BLOB` (`<prefix>_READ_WRITE_TOKEN`; docs/hosting.md section 10).
 */
export const BACKUP_TOKEN_VARIABLES = [
  'TURBOSLIDE_BACKUP_BLOB_TOKEN',
  'TURBOSLIDE_BACKUP_BLOB_READ_WRITE_TOKEN',
] as const;

/** A folder as the backup store, for a rehearsal on a checkout (`diskBlobClient`). */
export const BACKUP_DIR_VARIABLE = 'TURBOSLIDE_BACKUP_DIR';

export const BACKUP_PREFIX = 'backup/';
export const BACKUP_KEEP_DAYS = 30;
/** How long one call copies before it writes its cursor and answers. */
export const BACKUP_BUDGET_MS = 240_000;
/** The prefixes copied whole after the decks, in this order. */
export const BACKUP_FLAT_PREFIXES = ['users/', 'links/'] as const;
/** The failures a day's record names; the count is kept beyond them. */
export const BACKUP_FAILED_LISTED = 50;

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Env = Readonly<Record<string, string | undefined>>;
type Phase = 'decks' | (typeof BACKUP_FLAT_PREFIXES)[number];

/** The variable holding the backup store's token in this environment, or null. */
export function backupTokenVariable(env: Env = process.env): string | null {
  for (const name of BACKUP_TOKEN_VARIABLES) {
    const token = env[name];
    if (token !== undefined && token !== '') return name;
  }
  return null;
}

/**
 * The backup store: a folder for a rehearsal, else the Vercel store by its token, always with
 * private access (it holds access records with grant addresses, so a public store refuses the
 * puts and the backup fails loudly instead of publishing them); null when neither is set.
 */
export function backupBlobClient(env: Env = process.env): BlobClient | null {
  const dir = env[BACKUP_DIR_VARIABLE];
  if (dir !== undefined && dir !== '') return diskBlobClient(dir);
  const variable = backupTokenVariable(env);
  if (variable === null) return null;
  return vercelBlobClient(env, { tokenVariable: variable, access: 'private' });
}

/** The UTC date of a clock time, `yyyy-mm-dd`: the backup's folder for that night. */
export function backupDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function isBackupDay(value: string): boolean {
  return DAY_PATTERN.test(value) && backupDay(Date.parse(`${value}T00:00:00.000Z`)) === value;
}

/** `backup/<day>/`. */
export function dayPrefix(day: string): string {
  return `${BACKUP_PREFIX}${day}/`;
}

/** True for a pathname with a segment that starts with a dot (the `.turboslide/` state). */
function hasDotSegment(relative: string): boolean {
  return relative.split('/').some((segment) => segment.startsWith('.'));
}

/** The files of a deck the backup keeps, by their path under `decks/<id>/`. */
export function isBackedUpDocument(relative: string): boolean {
  if (hasDotSegment(relative)) return false;
  if (relative === 'deck.json' || relative === 'access.json') return true;
  return ['slides/', 'versions/', 'snapshots/', 'comments/'].some(
    (folder) => relative.startsWith(folder) && relative.length > folder.length,
  );
}

export type BackupCursor = {
  schemaVersion: 1;
  day: string;
  phase: Phase;
  /** the last deck id the decks phase finished, in code unit order; null before the first */
  after: string | null;
  decks: number;
  objects: number;
  bytes: number;
  failed: string[];
  failedCount: number;
  calls: number;
  startedAt: string;
  updatedAt: string;
};

export type BackupDone = Omit<BackupCursor, 'phase' | 'after' | 'updatedAt'> & {
  finishedAt: string;
};

export type BackupResult = {
  day: string;
  /** `done`: this call finished the day; `partial`: the cursor carries on; `was-done`: nothing to copy */
  state: 'done' | 'partial' | 'was-done';
  decks: number;
  objects: number;
  bytes: number;
  /** the objects this call put */
  copied: number;
  failedCount: number;
  failed: string[];
  /** the expired days this call removed */
  pruned: string[];
  elapsedMs: number;
};

export type BackupDeps = {
  /** the documents as the deployment reads them (root.ts `exportBlobClient`) */
  source: BlobClient;
  /** the backup store */
  target: BlobClient;
  now?: () => number;
  budgetMs?: number;
  concurrency?: number;
  keepDays?: number;
  log?: (line: string) => void;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A JSON file of the backup store, or null when it is missing or not JSON. */
async function readJson<T>(client: BlobClient, pathname: string): Promise<T | null> {
  const found = await client.get(pathname);
  if (found === null) return null;
  try {
    return JSON.parse(decoder.decode(found.bytes)) as T;
  } catch {
    return null;
  }
}

async function writeJson(client: BlobClient, pathname: string, value: unknown): Promise<void> {
  await client.put(pathname, encoder.encode(`${JSON.stringify(value, null, 2)}\n`), {
    overwrite: true,
    contentType: 'application/json',
  });
}

function freshCursor(day: string, at: number): BackupCursor {
  const stamp = new Date(at).toISOString();
  return {
    schemaVersion: 1,
    day,
    phase: 'decks',
    after: null,
    decks: 0,
    objects: 0,
    bytes: 0,
    failed: [],
    failedCount: 0,
    calls: 0,
    startedAt: stamp,
    updatedAt: stamp,
  };
}

function isCursor(value: unknown, day: string): value is BackupCursor {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<BackupCursor>;
  return (
    row.schemaVersion === 1 &&
    row.day === day &&
    (row.phase === 'decks' || (BACKUP_FLAT_PREFIXES as readonly string[]).includes(row.phase ?? ''))
  );
}

/** The deck ids of a folder listing of `decks/`, in code unit order. */
function deckIdsOf(folders: ReadonlyArray<string>): string[] {
  const ids: string[] = [];
  for (const folder of folders) {
    const match = /^decks\/([^/.][^/]*)\/$/.exec(folder);
    if (match?.[1] !== undefined) ids.push(match[1]);
  }
  return ids.sort();
}

/** What one copy left for the day's record: the objects and bytes of the listing it kept. */
function tally(
  cursor: BackupCursor,
  entries: ReadonlyArray<CopyEntry>,
  summary: CopySummary,
): void {
  const failed = new Set(summary.failed.map((row) => row.pathname));
  for (const entry of entries) {
    if (failed.has(entry.pathname)) continue;
    cursor.objects += 1;
    cursor.bytes += entry.size ?? 0;
  }
  cursor.objects -= summary.vanished;
  const lines = [
    ...summary.failed.map((row) => `${row.pathname}: ${row.error}`),
    ...summary.differing.map((pathname) => `${pathname}: the copy differs from the source`),
    ...summary.conflicts.map((pathname) => `${pathname}: the backup holds another copy`),
  ];
  cursor.failedCount += lines.length;
  for (const line of lines)
    if (cursor.failed.length < BACKUP_FAILED_LISTED) cursor.failed.push(line.slice(0, 300));
}

/**
 * Runs one call of the night: the decks after the cursor, then the flat prefixes, each copy
 * stopping at the budget; the cursor is written after every deck, so a function that dies at its
 * own limit loses one deck's work at most. The day's `done.json` is written once every phase
 * finished, then the expired days are pruned while the budget lasts.
 */
export async function runBackup(deps: BackupDeps): Promise<BackupResult> {
  const clock = deps.now ?? (() => Date.now());
  const started = clock();
  const deadline = started + (deps.budgetMs ?? BACKUP_BUDGET_MS);
  const day = backupDay(started);
  const prefix = dayPrefix(day);
  const log = deps.log ?? (() => {});
  const keepDays = deps.keepDays ?? BACKUP_KEEP_DAYS;
  const { source, target } = deps;
  const sourceCopy: CopyClient = copyClientOf(source, blobContentType);
  const targetCopy: CopyClient = prefixedCopyClient(copyClientOf(target, blobContentType), prefix);
  const pass = (entries: ReadonlyArray<CopyEntry>): Promise<CopySummary> =>
    copyStore({
      source: sourceCopy,
      target: targetCopy,
      entries,
      replaceDiffering: true,
      deadline,
      now: clock,
      ...(deps.concurrency === undefined ? {} : { concurrency: deps.concurrency }),
    });
  // the objects a pass failed on are tried once more at once (a 5xx or a deadline of the store),
  // so one refused call does not leave a hole in the night's copy
  const copy = async (entries: ReadonlyArray<CopyEntry>): Promise<CopySummary> => {
    const first = await pass(entries);
    if (first.failed.length === 0 || first.stopped > 0) return first;
    const again = new Set(first.failed.map((row) => row.pathname));
    const second = await pass(entries.filter((entry) => again.has(entry.pathname)));
    return {
      ...first,
      copied: first.copied + second.copied,
      copiedBytes: first.copiedBytes + second.copiedBytes,
      already: first.already + second.already,
      vanished: first.vanished + second.vanished,
      stopped: second.stopped,
      replaced: [...first.replaced, ...second.replaced],
      conflicts: [...first.conflicts, ...second.conflicts],
      differing: [...first.differing, ...second.differing],
      failed: second.failed,
    };
  };
  const answer = (
    state: BackupResult['state'],
    record: Pick<BackupCursor, 'decks' | 'objects' | 'bytes' | 'failed' | 'failedCount'>,
    copied: number,
    pruned: string[],
  ): BackupResult => ({
    day,
    state,
    decks: record.decks,
    objects: record.objects,
    bytes: record.bytes,
    copied,
    failedCount: record.failedCount,
    failed: record.failed,
    pruned,
    elapsedMs: clock() - started,
  });

  const done = await readJson<BackupDone>(target, `${prefix}done.json`);
  if (done !== null && done.day === day) {
    const pruned = await pruneBackups(target, { today: day, keepDays, deadline, now: clock, log });
    return answer('was-done', done, 0, pruned);
  }

  const stored = await readJson<unknown>(target, `${prefix}cursor.json`);
  const cursor = isCursor(stored, day) ? stored : freshCursor(day, started);
  cursor.calls += 1;
  let copied = 0;
  const save = async (): Promise<void> => {
    cursor.updatedAt = new Date(clock()).toISOString();
    await writeJson(target, `${prefix}cursor.json`, cursor);
  };
  const partial = async (): Promise<BackupResult> => {
    await save();
    log(
      `${day}: ${cursor.decks} decks and ${cursor.objects} objects so far, ${copied} put by this call; the next call continues after ${cursor.after ?? 'the first deck'} (${cursor.phase})`,
    );
    return answer('partial', cursor, copied, []);
  };

  if (cursor.phase === 'decks') {
    const ids = deckIdsOf(await source.folders('decks/'));
    for (const id of ids) {
      if (cursor.after !== null && id <= cursor.after) continue;
      if (clock() >= deadline) return partial();
      const deck = `decks/${id}/`;
      const manifest = await source.head(`${deck}deck.json`);
      if (manifest !== null) {
        // the manifest first, then the listing that holds the snapshot it names
        const first: CopyEntry = {
          pathname: manifest.pathname,
          size: manifest.size,
          etag: manifest.version,
        };
        const head = await copy([first]);
        if (head.stopped > 0) return partial();
        const rest = (await source.list(deck))
          .filter(
            (entry) =>
              entry.pathname !== manifest.pathname &&
              isBackedUpDocument(entry.pathname.slice(deck.length)),
          )
          .map((entry) => ({ pathname: entry.pathname, size: entry.size, etag: entry.version }));
        const body = await copy(rest);
        if (body.stopped > 0) return partial();
        copied += head.copied + body.copied;
        tally(cursor, [first], head);
        tally(cursor, rest, body);
        cursor.decks += 1;
      }
      // a folder without a manifest holds twins alone (the public store keeps them by digest)
      cursor.after = id;
      await save();
    }
    cursor.phase = BACKUP_FLAT_PREFIXES[0];
    cursor.after = null;
  }

  // the decks phase above has moved the cursor to the first flat prefix, or a call starts in one
  const from = BACKUP_FLAT_PREFIXES.indexOf(cursor.phase);
  for (const flat of BACKUP_FLAT_PREFIXES.slice(from)) {
    cursor.phase = flat;
    if (clock() >= deadline) return partial();
    const entries = (await source.list(flat))
      .filter((entry) => !hasDotSegment(entry.pathname.slice(flat.length)))
      .map((entry) => ({ pathname: entry.pathname, size: entry.size, etag: entry.version }));
    const summary = await copy(entries);
    if (summary.stopped > 0) return partial();
    copied += summary.copied;
    tally(cursor, entries, summary);
  }

  const record: BackupDone = {
    schemaVersion: 1,
    day,
    decks: cursor.decks,
    objects: cursor.objects,
    bytes: cursor.bytes,
    failed: cursor.failed,
    failedCount: cursor.failedCount,
    calls: cursor.calls,
    startedAt: cursor.startedAt,
    finishedAt: new Date(clock()).toISOString(),
  };
  await save();
  await writeJson(target, `${prefix}done.json`, record);
  log(
    `${day}: done, ${record.decks} decks and ${record.objects} objects (${record.bytes} bytes) over ${record.calls} calls; ${record.failedCount} failed`,
  );
  const pruned = await pruneBackups(target, { today: day, keepDays, deadline, now: clock, log });
  return answer('done', record, copied, pruned);
}

/** The days the backup store holds, oldest first. */
export async function backupDays(target: BlobClient): Promise<string[]> {
  return (await target.folders(BACKUP_PREFIX))
    .map((folder) => folder.slice(BACKUP_PREFIX.length).replace(/\/$/, ''))
    .filter(isBackupDay)
    .sort();
}

/** The newest day with its `done.json`, or null when no day is complete. */
export async function newestCompleteDay(target: BlobClient): Promise<string | null> {
  const days = await backupDays(target);
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i] as string;
    if ((await target.head(`${dayPrefix(day)}done.json`)) !== null) return day;
  }
  return null;
}

/** Paths per `del` call when a day leaves. */
const DELETE_BATCH = 500;

/**
 * Removes the days older than `keepDays` before `today` (so `keepDays` dated folders stay), the
 * oldest first, while the budget lasts; the newest complete day stays whatever its age, so a
 * month of failed nights never leaves the store without a backup. Answers the days removed.
 */
export async function pruneBackups(
  target: BlobClient,
  options: {
    today: string;
    keepDays?: number;
    deadline?: number;
    now?: () => number;
    log?: (line: string) => void;
  },
): Promise<string[]> {
  const clock = options.now ?? (() => Date.now());
  const keepDays = options.keepDays ?? BACKUP_KEEP_DAYS;
  const oldestKept = backupDay(
    Date.parse(`${options.today}T00:00:00.000Z`) - (keepDays - 1) * DAY_MS,
  );
  const expired = (await backupDays(target)).filter((day) => day < oldestKept);
  if (expired.length === 0) return [];
  const keep = await newestCompleteDay(target);
  const pruned: string[] = [];
  for (const day of expired) {
    if (day === keep) continue;
    if (options.deadline !== undefined && clock() >= options.deadline) break;
    const paths = (await target.list(dayPrefix(day))).map((entry) => entry.pathname);
    for (let i = 0; i < paths.length; i += DELETE_BATCH)
      await target.del(paths.slice(i, i + DELETE_BATCH));
    pruned.push(day);
    options.log?.(`${day}: removed, ${paths.length} objects (older than ${keepDays} days)`);
  }
  return pruned;
}
