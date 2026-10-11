// A resent POST keeps its author's letters in order (RELIABILITY-2, F1; hardening HR-RT#2): the
// tab's first entry was admitted and its answer lost, the tab resends it with the next entry on
// the same base, the log answers the first, and the next lands right after the first's letters,
// never pushed past them. The S1 reproduction of docs/hardening/research/reliability.md as unit
// tests of the memory tier's `admitOps` and the blob tier's `admitOnBlob`; the object's `admit`
// has the same test in apps/realtime-worker/test/resend-order.test.ts.
import { describe, expect, it } from 'vitest';

import type { Entry } from '@turboslide/realtime/channel';
import { memoryChannel } from '@turboslide/realtime/memory';
import type { MemoryChannel } from '@turboslide/realtime/memory';
import type { OpsPost } from '@turboslide/realtime/protocol';
import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { validateDocument } from '@turboslide/schema/validate';

import { applyStreamEntries } from './checkpoint';
import { admitOnBlob, admitOps } from './room';
import type { RequestIdentity, Room } from './room';

const DECK = 'resend-order';
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);

const splice = (at: number, insert: string): Mutation => ({
  op: 'text.splice',
  slideId: 'content-rule',
  blockId: 'p1',
  path: '/text',
  at,
  remove: 0,
  insert,
});

function startDocument(revision = 0): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: { ...result.deck, revision }, slides: result.slides };
}

function paragraph(document: DeckDocument): string {
  const slide = document.slides['content-rule'] as unknown as {
    slots: Record<string, { id: string; text?: unknown }[]>;
  };
  const block = Object.values(slide.slots)
    .flat()
    .find((row) => row.id === 'p1');
  return String(block?.text ?? '');
}

/** The memory tier's room over one channel: the live document follows the stream. */
function memoryRoom(channel: MemoryChannel, start: DeckDocument): Room {
  let live = { seq: 0, document: start };
  return {
    deckId: DECK,
    channel,
    tier: 'memory',
    async live() {
      const head = await channel.head(DECK);
      if (head > live.seq) {
        const entries = await channel.since(DECK, live.seq, head - live.seq);
        live = { seq: head, document: applyStreamEntries(live.document, entries) };
      }
      return live;
    },
    checkpointer: {
      noteComments: () => undefined,
      noteAppended: () => undefined,
      schedule: () => undefined,
      run: async () => undefined,
      pendingComments: () => [],
    },
    revision: () => 0,
  } as unknown as Room;
}

type Post = {
  clientId: string;
  base: number;
  entries: { opId: string; at: number; insert: string; run?: true }[];
};

function opsPost(post: Post): OpsPost {
  return {
    clientId: post.clientId,
    base: { seq: post.base },
    entries: post.entries.map((entry) => ({
      opId: entry.opId,
      kind: 'edit',
      mutations: [splice(entry.at, entry.insert)],
      ...(entry.run === undefined ? {} : { run: true }),
    })),
  } as unknown as OpsPost;
}

describe('a resent POST on the memory tier (admitOps)', () => {
  let clock = Date.parse('2026-10-11T10:00:00.000Z');
  const admit = (room: Room, post: Post) =>
    admitOps(room, {
      post: opsPost(post),
      bytes: 256,
      identity: { kind: 'anonymous', identity: `anon_${post.clientId[0]}` } as RequestIdentity,
      author: { kind: 'human', name: post.clientId[0] ?? 'x' },
      role: 'editor',
      // a minute apart, so the budgets never refuse
      now: () => (clock += 61_000),
    });

  it("answers the first entry from the log and lands the next right after its author's letters", async () => {
    const channel = memoryChannel();
    const room = memoryRoom(channel, startDocument());
    await channel.presence.bind(DECK, A, 'anon_a', 60_000);
    await channel.presence.bind(DECK, B, 'anon_b', 60_000);
    const start = paragraph((await room.live()).document);
    // B's " tb" lands at 0 as seq 1
    const b = await admit(room, {
      clientId: B,
      base: 0,
      entries: [{ opId: `${B}:1`, at: 0, insert: ' tb' }],
    });
    expect(b.ok && b.entries.map((entry) => entry.seq)).toEqual([1]);
    // A's " t" at 0 on base 0 lands after it as seq 2; its answer is lost
    const first = await admit(room, {
      clientId: A,
      base: 0,
      entries: [{ opId: `${A}:1`, at: 0, insert: ' t' }],
    });
    expect(first.ok && first.entries.map((entry) => entry.seq)).toEqual([2]);
    // the tab resends " t" with "a1", written after its own " t", on the same base
    const resend = await admit(room, {
      clientId: A,
      base: 0,
      entries: [
        { opId: `${A}:1`, at: 0, insert: ' t' },
        { opId: `${A}:2`, at: 2, insert: 'a1', run: true },
      ],
    });
    expect(resend.ok).toBe(true);
    if (!resend.ok) return;
    expect(resend.rejected).toEqual([]);
    expect(resend.entries.map((entry) => [entry.opId, entry.seq])).toEqual([
      [`${A}:1`, 2],
      [`${A}:2`, 3],
    ]);
    expect(resend.entries[1]?.mutations).toEqual([splice(5, 'a1')]);
    expect(paragraph((await room.live()).document)).toBe(` tb ta1${start}`);
  });

  it('keeps the word whole when nothing else landed: the next entry is not moved past its own first (the S1 reading)', async () => {
    const channel = memoryChannel();
    const room = memoryRoom(channel, startDocument());
    await channel.presence.bind(DECK, A, 'anon_a', 60_000);
    const start = paragraph((await room.live()).document);
    const end = start.length;
    await admit(room, {
      clientId: A,
      base: 0,
      entries: [{ opId: `${A}:1`, at: end, insert: ' t' }],
    });
    const resend = await admit(room, {
      clientId: A,
      base: 0,
      entries: [
        { opId: `${A}:1`, at: end, insert: ' t' },
        { opId: `${A}:2`, at: end + 2, insert: 'a1', run: true },
      ],
    });
    expect(resend.ok && resend.rejected).toEqual([]);
    expect(paragraph((await room.live()).document)).toBe(`${start} ta1`);
  });
});

describe('a resent POST on the blob tier (admitOnBlob)', () => {
  type Input = Parameters<typeof admitOnBlob>[1];

  const record = (
    seq: number,
    clientId: string,
    covers: string[] | undefined,
    mutations: Mutation[],
  ): Entry => ({
    seq,
    rev: seq - 1,
    kind: 'edit',
    author: { kind: 'human', name: clientId },
    clientId,
    opId: `store:${seq}`,
    mutations,
    at: '2026-10-11T10:00:00.000Z',
    ...(covers === undefined ? {} : { covers }),
  });

  /** A blob tier room at `revision` whose log is `records`; the appends are recorded and committed at the next revision. */
  const roomOf = (revision: number, records: Entry[]) => {
    const appends: { base: number; mutations: Mutation[][] }[] = [];
    const room = {
      deckId: DECK,
      tier: 'blob',
      live: async () => ({ seq: revision, document: startDocument(revision) }),
      store: { sync: async () => undefined },
      channel: {
        append: async (_deckId: string, base: number, entries: { mutations?: Mutation[] }[]) => {
          appends.push({ base, mutations: entries.map((entry) => entry.mutations ?? []) });
          return { ok: true, entries: entries.map((entry) => ({ ...entry, seq: base + 1 })) };
        },
        since: async (_deckId: string, seq: number, limit: number) =>
          records.filter((entry) => entry.seq > seq).slice(0, limit),
      },
    } as unknown as Room;
    return { room, appends };
  };

  const input = (post: Post): Input =>
    ({
      post: opsPost(post),
      bytes: 256,
      identity: { kind: 'anonymous', identity: 'anon_a' },
      author: { kind: 'human', name: 'a' },
      role: 'editor',
    }) as unknown as Input;

  it("answers the first entry from its record and places the next right after its author's letters", async () => {
    // B's " tb" at 0 committed as revision 8; A's " t", moved past it to 3, as revision 9, its answer lost
    const { room, appends } = roomOf(9, [
      record(8, B, [`${B}:1`], [splice(0, ' tb')]),
      record(9, A, [`${A}:1`], [splice(3, ' t')]),
    ]);
    const result = await admitOnBlob(
      room,
      input({
        clientId: A,
        base: 7,
        entries: [
          { opId: `${A}:1`, at: 0, insert: ' t' },
          { opId: `${A}:2`, at: 2, insert: 'a1', run: true },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected).toEqual([]);
    expect(result.entries.map((entry) => [entry.opId, entry.seq])).toEqual([
      [`${A}:1`, 9],
      [`${A}:2`, 10],
    ]);
    // before the fix "a1" was moved past its own " t" too: 7, two letters past its place
    expect(appends).toEqual([{ base: 9, mutations: [[splice(5, 'a1')]] }]);
  });
});
