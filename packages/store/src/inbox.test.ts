// The inbox (gslides-parity SPEC-3 5.5; research 08 5.2; MILESTONES-3 B2 day 5): coalescing per
// thread inside 15 minutes, the actor never notifying itself, the per deck level, the 500 unread
// and 5,000 total caps, and three backends answering the same rows for the same events.
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  COALESCE_WINDOW_MS,
  MAX_RECORDS,
  MAX_UNREAD,
  emptyInbox,
  fileInbox,
  inboxFileName,
  memoryInbox,
  pushInto,
  redisInbox,
  trimInbox,
} from './inbox.ts';
import type { Inbox, InboxFile, NotificationEvent } from './inbox.ts';

const ME = 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';
const MAYA = 'anon_1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5c';
const SAM = 'usr_sam';
const T0 = Date.parse('2026-09-13T10:00:00.000Z');
const at = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();

let n = 0;
const nextId = (): string => `n${String((n += 1)).padStart(4, '0')}`;

function reply(actor: string, offsetMs: number, threadId = 'thread-1'): NotificationEvent {
  return {
    kind: 'reply',
    deckId: 'q4-review',
    threadId,
    slideId: 'pricing',
    actor,
    at: at(offsetMs),
  };
}

/** A fake of the one Redis command shape the backend uses. */
function fakeRedis(): {
  call: (command: string, ...args: (string | number)[]) => Promise<unknown>;
  store: Map<string, { value: string; px: number }>;
} {
  const store = new Map<string, { value: string; px: number }>();
  return {
    store,
    async call(command, ...args) {
      if (command === 'GET') return store.get(String(args[0]))?.value ?? null;
      if (command === 'SET') {
        store.set(String(args[0]), { value: String(args[1]), px: Number(args[3]) });
        return 'OK';
      }
      throw new Error(`unexpected ${command}`);
    },
  };
}

describe('pushInto', () => {
  beforeEach(() => {
    n = 0;
  });

  it('coalesces one kind on one thread inside the window and starts a new row after it or once read', () => {
    const file = emptyInbox(ME);
    const first = pushInto(file, reply(MAYA, 0), nextId);
    const second = pushInto(file, reply(SAM, 60_000), nextId);
    expect(second).toBe(first);
    expect(first).toMatchObject({
      kind: 'reply',
      count: 2,
      actors: [SAM, MAYA],
      createdAt: at(0),
      updatedAt: at(60_000),
    });
    expect(file.records).toHaveLength(1);
    pushInto(file, reply(MAYA, 60_000 + COALESCE_WINDOW_MS + 1), nextId);
    expect(file.records).toHaveLength(2);
    file.records[1]!.readAt = at(1);
    pushInto(file, reply(MAYA, 60_000 + COALESCE_WINDOW_MS + 2), nextId);
    expect(file.records).toHaveLength(3);
    pushInto(file, { ...reply(MAYA, 5), threadId: 'thread-2' }, nextId);
    expect(file.records).toHaveLength(4);
  });

  it('drops the actor’s own events and follows the deck’s level', () => {
    const file = emptyInbox(ME);
    expect(pushInto(file, reply(ME, 0), nextId)).toBeNull();
    expect(pushInto(file, { ...reply(MAYA, 0), kind: 'comment' }, nextId)).toBeNull(); // Comments for you drops plain comments
    file.settings['q4-review'] = { level: 'all' };
    expect(pushInto(file, { ...reply(MAYA, 0), kind: 'comment' }, nextId)).not.toBeNull();
    file.settings['q4-review'] = { level: 'none' };
    expect(pushInto(file, { ...reply(MAYA, 0), kind: 'mention' }, nextId)).toBeNull();
    expect(file.records).toHaveLength(1);
  });

  it('caps unread at 500 and the total at 5,000, dropping read rows first', () => {
    const file: InboxFile = emptyInbox(ME);
    for (let i = 0; i < MAX_UNREAD + 20; i += 1) {
      pushInto(file, { ...reply(MAYA, i * 1000), threadId: `t${i}` }, nextId);
    }
    expect(file.records.filter((row) => row.readAt === undefined)).toHaveLength(MAX_UNREAD);
    expect(file.records.find((row) => row.threadId === 't0')).toBeUndefined();
    expect(file.records.find((row) => row.threadId === 't519')).toBeDefined();

    const big: InboxFile = emptyInbox(ME);
    for (let i = 0; i < MAX_RECORDS + 10; i += 1) {
      big.records.push({
        id: `r${String(i).padStart(5, '0')}`,
        principalId: ME,
        kind: 'mention',
        deckId: 'q4-review',
        threadId: `t${i}`,
        actors: [MAYA],
        count: 1,
        createdAt: at(i * 1000),
        updatedAt: at(i * 1000),
        ...(i < 4600 ? { readAt: at(i * 1000 + 1) } : {}),
      });
    }
    trimInbox(big);
    expect(big.records).toHaveLength(MAX_RECORDS);
    // the ten oldest read rows left; every unread row stayed
    expect(big.records.filter((row) => row.readAt !== undefined)).toHaveLength(4590);
    expect(big.records.filter((row) => row.readAt === undefined)).toHaveLength(410);
    expect(big.records.find((row) => row.id === 'r00000')).toBeUndefined();
    expect(big.records.find((row) => row.id === 'r00010')).toBeDefined();
    expect(
      big.records.find((row) => row.id === `r${String(MAX_RECORDS + 9).padStart(5, '0')}`),
    ).toBeDefined();
  });
});

describe('the three backends', () => {
  let root: string;
  beforeEach(async () => {
    n = 0;
    root = await mkdtemp(join(tmpdir(), 'turboslide-inbox-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function drive(inbox: Inbox): Promise<unknown> {
    n = 0;
    await inbox.push(ME, reply(MAYA, 0), nextId);
    await inbox.push(ME, reply(SAM, 30_000), nextId);
    await inbox.push(ME, { ...reply(MAYA, 40_000), kind: 'mention', threadId: 'thread-2' }, nextId);
    await inbox.push(
      ME,
      { kind: 'accessRequest', deckId: 'q4-review', actor: SAM, at: at(50_000) },
      nextId,
    );
    expect(await inbox.unread(ME)).toBe(3);
    const unreadAfter = await inbox.markRead(ME, ['n0001'], at(60_000));
    expect(unreadAfter).toBe(2);
    await inbox.setSettings(ME, 'q4-review', { level: 'all' });
    expect(await inbox.settings(ME, 'q4-review')).toEqual({
      level: 'all',
      email: true,
      activityForCommenters: false,
    });
    expect(await inbox.settings(ME, 'other')).toEqual({
      level: 'forYou',
      email: true,
      activityForCommenters: false,
    });
    return inbox.list(ME, { limit: 10 });
  }

  it('answer the same rows for the same events', async () => {
    const memory = memoryInbox();
    const file = fileInbox(join(root, '.turboslide'));
    const redis = redisInbox(fakeRedis());
    const rows = await drive(memory);
    expect(await drive(file)).toEqual(rows);
    expect(await drive(redis)).toEqual(rows);
    expect(rows).toMatchObject({
      unread: 2,
      records: [
        { kind: 'accessRequest', count: 1, actors: [SAM] },
        { kind: 'mention', threadId: 'thread-2' },
        { kind: 'reply', count: 2, actors: [SAM, MAYA], readAt: at(60_000) },
      ],
    });
    expect((rows as { records: unknown[] }).records).toHaveLength(3);
    // the file is the CLI's shape and path
    const path = join(root, '.turboslide', 'inbox', inboxFileName(ME));
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as InboxFile;
    expect(parsed.version).toBe(1);
    expect(parsed.principalId).toBe(ME);
    expect(parsed.settings['q4-review']).toEqual({
      level: 'all',
      email: true,
      activityForCommenters: false,
    });
    expect(await memory.list(ME, { unread: true })).toMatchObject({ unread: 2 });
    expect((await memory.list(ME, { unread: true })).records).toHaveLength(2);
    expect(await memory.markRead(ME, 'all', at(70_000))).toBe(0);
  });

  it('refreshes the Redis TTL on every write', async () => {
    const kv = fakeRedis();
    const inbox = redisInbox(kv);
    await inbox.push(ME, reply(MAYA, 0), nextId);
    const key = `inbox:${ME}`;
    expect(kv.store.get(key)?.px).toBe(30 * 24 * 60 * 60_000);
    await inbox.markRead(ME, 'all');
    expect(JSON.parse(kv.store.get(key)?.value ?? '{}')).toMatchObject({
      version: 1,
      principalId: ME,
    });
  });
});
