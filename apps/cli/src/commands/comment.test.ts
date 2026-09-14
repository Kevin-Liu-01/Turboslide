// The comment commands over a scratch copy of the fixture deck, no server (gslides-parity SPEC-3
// 5.9, 12, 16.6 cli row): `comment add` on a slide, a cell and a text range with a mention and an
// assignment, reply, edit (the author alone), delete and restore, resolve, reopen, done, react,
// get, link, `comments --for-me`, the inbox records the ops leave for the mentioned principal,
// the activity feed, the anchor grammar and the `<who>` forms. Every write validates the deck
// afterwards. Ids named for the coverage test: comment.add, comment.reply, comment.edit,
// comment.delete, comment.resolve, comment.reopen, comment.assign, comment.done, comment.react,
// comment.list, comment.get, comment.link, notification.list, notification.markRead,
// notification.settings, activity.list.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runCli } from '../cli.ts';
import { parseAnchor, parseWho } from './comment.ts';

const FIXTURE = join(import.meta.dirname, '..', '..', '..', '..', 'decks', 'fixture', 'gslides');

type Run = { code: number; stdout: string; stderr: string; json: unknown };

let root: string;
let deckDir: string;

async function run(argv: string[], author = 'tester'): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--deck', deckDir, '--json', '--author', author], {
    cwd: root,
    env: { USER: 'tester', TURBOSLIDE_ORIGIN: 'https://studio.test' },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  let json: unknown;
  if (stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

type ThreadAnswer = {
  thread: {
    id: string;
    anchor: Record<string, unknown>;
    comment: { id: string; body: { text: string; mentions: unknown[] } };
    replies: { id: string; deleted?: unknown; body: { text: string } }[];
    resolved?: unknown;
    assignee?: { to: unknown; done?: unknown };
  };
  commentsRevision: number;
};

async function validates(): Promise<void> {
  const result = await run(['validate', deckDir]);
  expect(result.code, result.stderr).toBe(0);
}

describe('turboslide comment and comments over the fixture deck', () => {
  let threadId = '';
  let commentId = '';
  let paragraphId = '';

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-comment-'));
    mkdirSync(join(root, 'decks'), { recursive: true });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    deckDir = join(root, 'decks', 'gslides');
    cpSync(FIXTURE, deckDir, { recursive: true });
    // the fixture carries three threads as export fixture data (SPEC-3 16); this walk starts from an empty sidecar
    rmSync(join(deckDir, 'comments'), { recursive: true, force: true });
    const breaks = JSON.parse(readFileSync(join(deckDir, 'slides', 'breaks.json'), 'utf8')) as {
      slots: Record<string, { id: string; type: string }[]>;
    };
    paragraphId =
      Object.values(breaks.slots)
        .flat()
        .find((block) => block.type === 'paragraph')?.id ?? '';
    expect(paragraphId).not.toBe('');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('parses the anchor grammar and the <who> forms of SPEC-3 5.9', () => {
    expect(parseAnchor('deck')).toEqual({ kind: 'deck' });
    expect(parseAnchor('slide:table')).toEqual({ kind: 'slide', slideId: 'table' });
    expect(parseAnchor('notes:title')).toEqual({ kind: 'notes', slideId: 'title' });
    expect(parseAnchor('table#t')).toEqual({ kind: 'block', slideId: 'table', blockId: 't' });
    expect(parseAnchor('table#t/cell:1,2')).toEqual({
      kind: 'cell',
      slideId: 'table',
      blockId: 't',
      cell: [1, 2],
    });
    expect(parseAnchor('breaks#p1/text:0-5')).toEqual({
      kind: 'text',
      slideId: 'breaks',
      blockId: 'p1',
      path: '/text',
      range: [0, 5],
      quoted: '',
    });
    expect(() => parseAnchor('nonsense')).toThrow(/not an anchor/);
    expect(() => parseAnchor('breaks#p1/text:5-2')).toThrow(/ends before/);
    expect(parseWho('maya')).toEqual({ kind: 'principal', principalId: 'local:maya' });
    expect(parseWho('usr_01J8Z2KMAYA')).toEqual({
      kind: 'principal',
      principalId: 'usr_01J8Z2KMAYA',
    });
    expect(parseWho('agent:tok_1')).toEqual({ kind: 'principal', principalId: 'agent:tok_1' });
    expect(parseWho('Lee@Example.com')).toEqual({ kind: 'invite', inviteId: 'lee@example.com' });
  });

  test('comment add on a slide with a mention and an assignment writes the sidecar and validates', async () => {
    const result = await run([
      'comment',
      'add',
      'slide:table',
      '-m',
      'check this',
      '--mention',
      'maya',
      '--assign',
      'maya',
    ]);
    expect(result.code, result.stderr).toBe(0);
    const answer = result.json as ThreadAnswer;
    threadId = answer.thread.id;
    commentId = answer.thread.comment.id;
    expect(threadId).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
    expect(answer.thread.anchor).toEqual({ kind: 'slide', slideId: 'table' });
    expect(answer.thread.comment.body).toEqual({
      text: 'check this {@0}',
      mentions: [{ kind: 'principal', principalId: 'local:maya' }],
    });
    expect(answer.thread.assignee?.to).toEqual({ kind: 'principal', principalId: 'local:maya' });
    expect(answer.commentsRevision).toBe(1);
    expect(existsSync(join(deckDir, 'comments', 'index.json'))).toBe(true);
    expect(existsSync(join(deckDir, 'comments', `${threadId}.json`))).toBe(true);
    const authors = JSON.parse(
      readFileSync(join(deckDir, 'comments', 'authors.json'), 'utf8'),
    ) as Record<string, { label: string }>;
    expect(authors['local:tester']?.label).toBe('tester');
    await validates();
  });

  test('a cell anchor and a text anchor with its quote from the document; an anchor on nothing is refused', async () => {
    const cell = await run(['comment', 'add', 'table#t/cell:1,1', '-m', 'this cell']);
    if (cell.code !== 0) {
      // the fixture table's block id is read from the slide when it is not `t`
      const slide = JSON.parse(readFileSync(join(deckDir, 'slides', 'table.json'), 'utf8')) as {
        slots: Record<string, { id: string; type: string }[]>;
      };
      const table = Object.values(slide.slots)
        .flat()
        .find((block) => block.type === 'table');
      const again = await run([
        'comment',
        'add',
        `table#${table?.id ?? 't'}/cell:1,1`,
        '-m',
        'this cell',
      ]);
      expect(again.code, again.stderr).toBe(0);
      expect((again.json as ThreadAnswer).thread.anchor.kind).toBe('cell');
    } else {
      expect((cell.json as ThreadAnswer).thread.anchor.kind).toBe('cell');
    }
    const text = await run([
      'comment',
      'add',
      `breaks#${paragraphId}/text:0-5`,
      '-m',
      'these words',
    ]);
    expect(text.code, text.stderr).toBe(0);
    const anchor = (text.json as ThreadAnswer).thread.anchor as {
      quoted: string;
      range: [number, number];
    };
    expect(anchor.quoted.length).toBe(5);
    const nowhere = await run(['comment', 'add', 'nowhere#x', '-m', 'lost']);
    expect(nowhere.code).toBe(2);
    expect(nowhere.stderr).toMatch(/names nothing/);
    await validates();
  });

  test('reply, edit by the author alone, react on and off, resolve and reopen', async () => {
    const reply = await run(['comment', 'reply', threadId, '-m', 'done, see the table'], 'maya');
    expect(reply.code, reply.stderr).toBe(0);
    const replied = reply.json as ThreadAnswer;
    expect(replied.thread.replies).toHaveLength(1);
    const replyId = replied.thread.replies[0]?.id ?? '';
    // the author edits; another principal is refused
    const edit = await run(
      ['comment', 'edit', threadId, replyId, '-m', 'done, see the new table'],
      'maya',
    );
    expect(edit.code, edit.stderr).toBe(0);
    expect((edit.json as ThreadAnswer).thread.replies[0]?.body.text).toBe(
      'done, see the new table',
    );
    const other = await run(['comment', 'edit', threadId, replyId, '-m', 'mine now']);
    expect(other.code).toBe(2);
    expect(other.stderr).toMatch(/only the author/);
    const react = await run(['comment', 'react', threadId, replyId, '👍']);
    expect(react.code, react.stderr).toBe(0);
    const unreact = await run(['comment', 'react', threadId, replyId, '👍', '--off']);
    expect(unreact.code, unreact.stderr).toBe(0);
    const outside = await run(['comment', 'react', threadId, replyId, '🦄']);
    expect(outside.code).toBe(2);
    const resolve = await run(['comment', 'resolve', threadId]);
    expect(resolve.code, resolve.stderr).toBe(0);
    expect((resolve.json as ThreadAnswer).thread.resolved).toBeDefined();
    const reopen = await run(['comment', 'reopen', threadId]);
    expect(reopen.code, reopen.stderr).toBe(0);
    expect((reopen.json as ThreadAnswer).thread.resolved).toBeUndefined();
    const done = await run(['comment', 'done', threadId], 'maya');
    expect(done.code, done.stderr).toBe(0);
    expect((done.json as ThreadAnswer).thread.assignee?.done).toBeDefined();
    await validates();
  });

  test('delete tombstones a reply and restore brings it back; the list hides tombstones unless asked', async () => {
    const before = await run(['comment', 'get', threadId]);
    const replyId = (before.json as { thread: ThreadAnswer['thread'] }).thread.replies[0]?.id ?? '';
    const deleted = await run(['comment', 'delete', threadId, replyId]);
    expect(deleted.code, deleted.stderr).toBe(0);
    expect((deleted.json as ThreadAnswer).thread.replies[0]?.deleted).toBeDefined();
    const listed = await run(['comments', 'table', '--state', 'all']);
    expect(listed.code, listed.stderr).toBe(0);
    const rows = (listed.json as { threads: ThreadAnswer['thread'][] }).threads;
    expect(rows.find((row) => row.id === threadId)?.replies).toHaveLength(0);
    const withDeleted = await run(['comments', 'table', '--state', 'all', '--include-deleted']);
    const kept = (withDeleted.json as { threads: ThreadAnswer['thread'][] }).threads.find(
      (row) => row.id === threadId,
    );
    expect(kept?.replies).toHaveLength(1);
    expect(kept?.replies[0]?.body.text).toBe('');
    const restored = await run(['comment', 'delete', threadId, replyId, '--restore']);
    expect(restored.code, restored.stderr).toBe(0);
    expect((restored.json as ThreadAnswer).thread.replies[0]?.deleted).toBeUndefined();
  });

  test('comments filters by slide, block, state, author and --for-me; get and link answer the thread', async () => {
    const forMe = await run(['comments', '--state', 'all', '--for-me'], 'maya');
    expect(forMe.code, forMe.stderr).toBe(0);
    expect((forMe.json as { threads: { id: string }[] }).threads.map((row) => row.id)).toEqual([
      threadId,
    ]);
    const notMe = await run(['comments', '--state', 'all', '--for-me']);
    expect((notMe.json as { threads: unknown[] }).threads).toHaveLength(0);
    const search = await run(['comments', '--state', 'all', '--search', 'cell']);
    expect(
      (search.json as { threads: { anchor: { kind: string } }[] }).threads.map(
        (row) => row.anchor.kind,
      ),
    ).toEqual(['cell']);
    const byAuthor = await run(['comments', '--state', 'all', '--author-id', 'maya']);
    expect((byAuthor.json as { threads: { id: string }[] }).threads.map((row) => row.id)).toEqual([
      threadId,
    ]);
    const got = await run(['comment', 'get', threadId]);
    expect(got.code, got.stderr).toBe(0);
    expect(
      (got.json as { thread: { placement: { orphaned: boolean } } }).thread.placement.orphaned,
    ).toBe(false);
    const link = await run(['comment', 'link', threadId]);
    expect(link.code, link.stderr).toBe(0);
    expect(link.json).toEqual({
      url: `https://studio.test/edit/gslides?comment=${threadId}&slide=table`,
      viewUrl: `https://studio.test/deck/gslides?comment=${threadId}&slide=table`,
    });
    const missing = await run(['comment', 'get', '01j8z2kmayaq4e0s7r9x2v8b3c']);
    expect(missing.code).toBe(2);
  });

  test('the inbox holds the mention, the assignment and the reply for the people named; read and settings', async () => {
    const inbox = await run(['notifications', '--unread'], 'maya');
    expect(inbox.code, inbox.stderr).toBe(0);
    const rows = (
      inbox.json as { notifications: { kind: string; actors: string[] }[]; unread: number }
    ).notifications;
    // the mention and the assignment from `comment add`, tester's reaction on maya's reply, the
    // resolve and the reopen on a thread maya takes part in; never maya's own reply or done
    expect(rows.map((row) => row.kind).sort()).toEqual([
      'assigned',
      'mention',
      'reaction',
      'reopened',
      'resolved',
    ]);
    expect(rows.every((row) => row.actors.includes('local:tester'))).toBe(true);
    // the actor never notifies itself; tester's inbox holds maya's reply
    const mine = await run(['notifications']);
    const kinds = (mine.json as { notifications: { kind: string }[] }).notifications.map(
      (row) => row.kind,
    );
    expect(kinds).toContain('reply');
    const read = await run(['notifications', 'read', '--all'], 'maya');
    expect(read.json).toEqual({ unread: 0 });
    const settings = await run(['notifications', 'settings', '--level', 'none'], 'maya');
    expect(settings.json).toMatchObject({ level: 'none' });
    const readBack = await run(['notifications', 'settings'], 'maya');
    expect(readBack.json).toMatchObject({
      level: 'none',
      email: true,
      activityForCommenters: false,
    });
    // every principal on a checkout without a persisted access record is its holder (SPEC-3 6.9),
    // so the owner switch works for maya here; share.test.ts covers the refusal once a record
    // names the owner
    const owner = await run(['notifications', 'settings', '--activity-for-commenters', 'true']);
    expect(owner.json).toMatchObject({ activityForCommenters: true });
  });

  test('activity merges the comment events and filters by kind', async () => {
    const result = await run(['activity', '--kind', 'comment']);
    expect(result.code, result.stderr).toBe(0);
    const events = (
      result.json as { events: { kind: string; threadId?: string; summary: string }[] }
    ).events;
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events.every((event) => event.kind === 'comment')).toBe(true);
    expect(
      events.some((event) => event.threadId === threadId && /replied/.test(event.summary)),
    ).toBe(true);
    const all = await run(['activity']);
    expect(
      (all.json as { events: { kind: string }[] }).events.some((event) => event.kind === 'version'),
    ).toBe(false);
    await validates();
    void commentId;
  });
});
