// Hardening HR-SD#1, the fix round after verifier pass 2 (F2): a comment caller who may not share
// the deck reads every other person in `comment.list` and `comment.get` by the person's stand-in,
// the id the editor's people map is keyed by for that reader, and a stand-in it writes (the
// editor's mention, an assignee, the author filter) names the principal among the people the deck
// knows. The room is a fake on the memory tier: the stored sidecar of a fresh folder is empty and
// the pending entry carries the thread, as liveThreads folds it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Entry, RosterEntry } from '@turboslide/realtime/channel';
import { newDeckRecord } from '@turboslide/schema/access';
import type { CommentOp } from '@turboslide/schema/comments';
import { workedDocument } from '@turboslide/schema/fixtures';

import { inboxFor, inputWithPrincipals, notificationList, runCommentAction } from './comments';
import type { CommentCaller, CommentListResult } from './comments';
import type { RequestIdentity, Room } from './room';

const DECK = 'stand-in-comments';
const OWNER = 'usr_owner01';
const EDITOR = 'anon_11111111-1111-4111-8111-111111111111';
const READER = 'anon_22222222-2222-4222-8222-222222222222';
const PASSER = 'usr_passer01';
const AT = '2026-10-10T00:00:00.000Z';
const THREAD = '01m3shbftjv64ww028yyhs386t';

const before = {
  root: process.env.TURBOSLIDE_ROOT,
  store: process.env.TURBOSLIDE_STORE,
  secret: process.env.TURBOSLIDE_DOWNLOAD_SECRET,
};
let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'turboslide-comment-stand-ins-'));
  mkdirSync(join(root, 'decks', DECK), { recursive: true });
  process.env.TURBOSLIDE_ROOT = root;
  process.env.TURBOSLIDE_STORE = 'file';
  process.env.TURBOSLIDE_DOWNLOAD_SECRET = 'a-download-secret-for-tests-only-0123456789';
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  for (const [name, value] of [
    ['TURBOSLIDE_ROOT', before.root],
    ['TURBOSLIDE_STORE', before.store],
    ['TURBOSLIDE_DOWNLOAD_SECRET', before.secret],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const add: CommentOp = {
  op: 'add',
  thread: {
    id: THREAD,
    deckId: DECK,
    anchor: { kind: 'slide', slideId: 'title' },
    comment: {
      id: THREAD,
      author: { principalId: OWNER, label: 'Olive', kind: 'human' },
      createdAt: AT,
      body: { text: 'For {@0}', mentions: [{ kind: 'principal', principalId: EDITOR }] },
      reactions: [{ emoji: '👍', principalIds: [READER, OWNER] }],
    },
    replies: [],
    assignee: { to: { kind: 'principal', principalId: EDITOR }, by: OWNER, at: AT },
    createdAt: AT,
    updatedAt: AT,
    revision: 0,
  },
};

const pending: Entry = {
  seq: 1,
  rev: 1,
  kind: 'comment',
  author: { kind: 'human', name: 'Olive', principalId: OWNER },
  clientId: 'server',
  opId: 'comment:1',
  comment: add,
  at: AT,
};

const passerRow = { clientId: 'c'.repeat(32), principalId: PASSER } as RosterEntry;

const room = {
  deckId: DECK,
  tier: 'memory',
  checkpointer: { pendingComments: () => [pending] },
  live: async () => ({ document: workedDocument(), seq: 1 }),
  channel: { presence: { roster: async () => [passerRow] } },
} as unknown as Room;

const identity = {
  principalId: READER,
  identity: READER,
  kind: 'anonymous',
  ctx: { principal: { id: READER, kind: 'anonymous', aliases: [] }, linkGrants: [] },
  record: null,
} as unknown as RequestIdentity;

/** Every principal id an answer carries but the reader's own, read from its JSON text. */
function othersIn(value: unknown): string[] {
  return [...JSON.stringify(value).matchAll(/(?:anon_|usr_|agent:)[A-Za-z0-9_-]+/g)]
    .map((match) => match[0])
    .filter((id) => id !== READER);
}

async function callers(): Promise<{
  reader: CommentCaller;
  sharer: CommentCaller;
  ref: (principalId: string, deckId?: string) => string;
}> {
  const { callerStandIns } = await import('./room');
  const { standInFor } = await import('./stand-ins');
  const record = newDeckRecord(DECK, OWNER, 'AbCdEfGhIjKlMnOpQrStUv', AT);
  const base: CommentCaller = {
    room,
    author: { kind: 'human', name: 'Rea', principalId: READER },
    capabilities: new Set(['read', 'readComments', 'comment']),
    principalId: READER,
    origin: 'http://localhost:4855',
    redis: null,
  };
  return {
    reader: { ...base, standIns: callerStandIns(room, record, identity) },
    sharer: base,
    ref: (principalId, deckId = DECK) => standInFor(deckId, principalId),
  };
}

describe('comments for a caller who may not share (HR-SD#1; verifier pass 2, F2)', () => {
  it('lists and gets the threads with every other person as a stand-in', async () => {
    const { reader, sharer, ref } = await callers();
    const listed = (await runCommentAction(reader, 'comment.list', {})) as CommentListResult;
    expect(listed.threads).toHaveLength(1);
    expect(othersIn(listed)).toEqual([]);
    const thread = listed.threads[0]!;
    expect(thread.comment.author).toEqual({
      principalId: ref(OWNER),
      label: 'Olive',
      kind: 'human',
    });
    expect(thread.comment.body.mentions).toEqual([{ kind: 'principal', principalId: ref(EDITOR) }]);
    expect(thread.comment.reactions?.[0]?.principalIds).toEqual([READER, ref(OWNER)]);
    expect(thread.assignee?.by).toBe(ref(OWNER));
    expect(thread.placement).toBeDefined();
    const got = await runCommentAction(reader, 'comment.get', { threadId: THREAD });
    expect(othersIn(got)).toEqual([]);
    // the author filter takes the stand-in the reader knows
    const byOwner = (await runCommentAction(reader, 'comment.list', {
      author: ref(OWNER),
    })) as CommentListResult;
    expect(byOwner.threads.map((row) => row.id)).toEqual([THREAD]);
    // a caller who may share reads the ids, as before
    const shared = (await runCommentAction(sharer, 'comment.list', {})) as CommentListResult;
    expect(othersIn(shared)).toEqual(expect.arrayContaining([OWNER, EDITOR]));
  });

  it('writes the principal a stand-in names among the people the deck knows', async () => {
    const { reader, ref } = await callers();
    const principalOf = reader.standIns!.principalOf;
    // the record's owner, a person a thread names, a person in the room's roster
    expect(await principalOf(ref(OWNER))).toBe(OWNER);
    expect(await principalOf(ref(EDITOR))).toBe(EDITOR);
    expect(await principalOf(ref(PASSER))).toBe(PASSER);
    // a stand-in of another deck, or of nobody the deck knows, names no one
    expect(await principalOf(ref(OWNER, 'another-deck'))).toBeUndefined();
    expect(await principalOf(ref('usr_stranger'))).toBeUndefined();
    // the editor writes an id that is no principal id as an invitation mention
    const input = (await inputWithPrincipals(
      {
        threadId: THREAD,
        body: {
          text: '{@0} and {@1} and {@2}',
          mentions: [
            { kind: 'invite', inviteId: ref(OWNER) },
            { kind: 'principal', principalId: ref(EDITOR) },
            { kind: 'invite', inviteId: 'inv_lee' },
          ],
        },
        assignee: { kind: 'principal', principalId: ref(PASSER) },
      },
      principalOf,
    )) as { body: { mentions: unknown[] }; assignee: unknown; threadId: string };
    expect(input.threadId).toBe(THREAD);
    expect(input.body.mentions).toEqual([
      { kind: 'principal', principalId: OWNER },
      { kind: 'principal', principalId: EDITOR },
      { kind: 'invite', inviteId: 'inv_lee' },
    ]);
    expect(input.assignee).toEqual({ kind: 'principal', principalId: PASSER });
    expect(await inputWithPrincipals({ threadId: THREAD, assignee: null }, principalOf)).toEqual({
      threadId: THREAD,
      assignee: null,
    });
  });
});

describe("an inbox row's actors for a reader who may not share the row's deck (HR-SD#1; verifier pass 2, F2)", () => {
  it('names the people who acted by their stand-ins on that deck, and by their ids to the owner', async () => {
    const { inboxActorsFor } = await import('./room');
    const { standInFor } = await import('./stand-ins');
    // the deck's record on the checkout's file store: owned by OWNER, nobody else holds share
    mkdirSync(join(root, 'decks', DECK, '.turboslide'), { recursive: true });
    writeFileSync(
      join(root, 'decks', DECK, '.turboslide', 'access.json'),
      JSON.stringify(newDeckRecord(DECK, OWNER, 'AbCdEfGhIjKlMnOpQrStUv', AT)),
    );
    const ownerIdentity = {
      ...identity,
      principalId: OWNER,
      identity: OWNER,
      kind: 'signedIn',
      ctx: { principal: { id: OWNER, kind: 'account', aliases: [] }, linkGrants: [] },
    } as unknown as RequestIdentity;
    expect(await inboxActorsFor(identity)(DECK, [OWNER, READER])).toEqual([
      standInFor(DECK, OWNER),
      READER,
    ]);
    expect(await inboxActorsFor(ownerIdentity)(DECK, [EDITOR])).toEqual([EDITOR]);
    // a deck the store does not hold shares nothing
    expect(await inboxActorsFor(ownerIdentity)('no-such-deck', [EDITOR])).toEqual([
      standInFor('no-such-deck', EDITOR),
    ]);
    // the list answer runs every row through the caller's mapping
    const inbox = inboxFor(null);
    await inbox.push(
      READER,
      { kind: 'mention', deckId: DECK, threadId: THREAD, actor: OWNER, at: AT },
      () => 'n1',
    );
    const listed = await notificationList(
      {
        principalId: READER,
        deckId: DECK,
        settingsCapability: false,
        redis: null,
        actorsOf: inboxActorsFor(identity),
      },
      {},
    );
    expect(listed.notifications.length).toBeGreaterThan(0);
    expect(othersIn(listed.notifications.map(({ principalId: _own, ...row }) => row))).toEqual([]);
    expect(listed.notifications[0]?.actors).toEqual([standInFor(DECK, OWNER)]);
  });
});
