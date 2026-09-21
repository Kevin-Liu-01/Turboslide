// The room protocol's schemas (SPEC-3 3.3, 3.8): the caps, the identity fields refused in a
// presence body (report 10 F31), the payload rule per entry kind, every event kind, and the SSE
// framing round trip.
import { describe, expect, it } from 'vitest';

import { THREAD_ID, threadFixture } from './channel-contract.ts';
import type { Entry, RoomEvent, RosterEntry, TextSpliceMutation } from './channel.ts';
import {
  ENTRY_NOTE_MAX,
  OPS_POST_MAX_ENTRIES,
  PRESENCE_MAX_BYTES,
  entrySchema,
  opsPostSchema,
  parseSseBlock,
  presencePostSchema,
  roomEventOf,
  roomEventSchema,
  rosterEntrySchema,
  sseComment,
  sseFrame,
  sseRetry,
} from './protocol.ts';

const CLIENT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER = '0000000000000000000000000000ffff';
const author = { kind: 'human', name: 'kevin' } as const;
const setSize = {
  op: 'block.set',
  slideId: 'content-rule',
  blockId: 'list',
  path: '/size',
  value: 22,
};
const splice: TextSpliceMutation = {
  op: 'text.splice',
  slideId: 'content-rule',
  blockId: 'p1',
  path: '/text',
  at: 4,
  remove: 0,
  insert: 'x',
};

function editEntry(n: number, clientId = CLIENT): Record<string, unknown> {
  return { opId: `${clientId}:${n}`, kind: 'edit', mutations: [setSize] };
}

const roster: RosterEntry = {
  clientId: CLIENT,
  clock: 3,
  slideId: 'content-rule',
  selection: { blockIds: ['p1'], caret: { blockId: 'p1', path: '/text', offset: 4 } },
  pointer: { x: 800, y: 450 },
  pointerOn: true,
  presenting: false,
  principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  label: 'Titanium 471',
  trust: 'label',
  mark: { kind: 'initials', text: 'T' },
  hueSlot: 2,
  kind: 'human',
  role: 'editor',
};

describe('opsPostSchema', () => {
  it('accepts a batch of edits, splices and comment ops from one client', () => {
    const post = {
      clientId: CLIENT,
      base: { seq: 4112 },
      entries: [
        editEntry(1),
        { opId: `${CLIENT}:2`, kind: 'edit', mutations: [splice] },
        {
          opId: `${CLIENT}:3`,
          kind: 'comment',
          comment: { op: 'add', thread: threadFixture() },
        },
      ],
    };
    expect(opsPostSchema.safeParse(post).success).toBe(true);
  });

  it('carries a history label on an edit and refuses it on a comment, blank or over its cap (the product round fix round)', () => {
    const base = { clientId: CLIENT, base: { seq: 0 } };
    const noted = { ...editEntry(1), note: 'Brand kit: Primary' };
    const parsed = opsPostSchema.safeParse({ ...base, entries: [noted] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.entries[0]?.note).toBe('Brand kit: Primary');
    expect(
      opsPostSchema.safeParse({
        ...base,
        entries: [{ ...editEntry(1), note: 'x'.repeat(ENTRY_NOTE_MAX + 1) }],
      }).success,
    ).toBe(false);
    expect(
      opsPostSchema.safeParse({ ...base, entries: [{ ...editEntry(1), note: '  ' }] }).success,
    ).toBe(false);
    expect(
      opsPostSchema.safeParse({
        ...base,
        entries: [
          {
            opId: `${CLIENT}:1`,
            kind: 'comment',
            comment: { op: 'add', thread: threadFixture() },
            note: 'Assist: notes',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('caps a post at 64 entries and refuses the 65th (SPEC-3 3.4 step 1)', () => {
    const entries = Array.from({ length: OPS_POST_MAX_ENTRIES }, (_, i) => editEntry(i + 1));
    expect(opsPostSchema.safeParse({ clientId: CLIENT, base: { seq: 0 }, entries }).success).toBe(
      true,
    );
    entries.push(editEntry(65));
    expect(opsPostSchema.safeParse({ clientId: CLIENT, base: { seq: 0 }, entries }).success).toBe(
      false,
    );
    expect(
      opsPostSchema.safeParse({ clientId: CLIENT, base: { seq: 0 }, entries: [] }).success,
    ).toBe(false);
  });

  it('refuses an opId of another client, a payload of the wrong kind and an unknown field', () => {
    const base = { clientId: CLIENT, base: { seq: 0 } };
    expect(opsPostSchema.safeParse({ ...base, entries: [editEntry(1, OTHER)] }).success).toBe(
      false,
    );
    expect(
      opsPostSchema.safeParse({
        ...base,
        entries: [{ opId: `${CLIENT}:1`, kind: 'edit', mutations: [] }],
      }).success,
    ).toBe(false);
    expect(
      opsPostSchema.safeParse({
        ...base,
        entries: [
          { opId: `${CLIENT}:1`, kind: 'edit', comment: { op: 'add', thread: threadFixture() } },
        ],
      }).success,
    ).toBe(false);
    expect(
      opsPostSchema.safeParse({
        ...base,
        entries: [
          { opId: `${CLIENT}:1`, kind: 'comment', comment: { op: 'shout', threadId: THREAD_ID } },
        ],
      }).success,
    ).toBe(false);
    expect(opsPostSchema.safeParse({ ...base, author, entries: [editEntry(1)] }).success).toBe(
      false,
    );
    expect(
      opsPostSchema.safeParse({ clientId: 'tab-1', base: { seq: 0 }, entries: [editEntry(1)] })
        .success,
    ).toBe(false);
  });
});

describe('presencePostSchema', () => {
  const minimal = { clientId: CLIENT, clock: 1, pointerOn: false, presenting: false };

  it('accepts a client state and refuses the identity fields as unknown keys (report 10 F31)', () => {
    expect(presencePostSchema.safeParse(minimal).success).toBe(true);
    const spoofed = presencePostSchema.safeParse({
      ...minimal,
      displayName: 'Kevin',
      label: 'Kevin',
    });
    expect(spoofed.success).toBe(false);
    if (spoofed.success) return;
    const unknown = spoofed.error.issues.find((issue) => issue.code === 'unrecognized_keys');
    expect(unknown).toBeDefined();
    expect(JSON.stringify(unknown)).toContain('displayName');
  });

  it('keeps the pointer on the sheet, the selection under 64 blocks and the state under 2 KB', () => {
    expect(presencePostSchema.safeParse({ ...minimal, pointer: { x: 1600, y: 900 } }).success).toBe(
      true,
    );
    expect(presencePostSchema.safeParse({ ...minimal, pointer: { x: 1601, y: 0 } }).success).toBe(
      false,
    );
    expect(presencePostSchema.safeParse({ ...minimal, pointer: { x: 0, y: -1 } }).success).toBe(
      false,
    );
    const ids = Array.from({ length: 64 }, (_, i) => `b${i}`);
    expect(presencePostSchema.safeParse({ ...minimal, selection: { blockIds: ids } }).success).toBe(
      true,
    );
    expect(
      presencePostSchema.safeParse({ ...minimal, selection: { blockIds: [...ids, 'b64'] } })
        .success,
    ).toBe(false);
    const big = {
      ...minimal,
      selection: {
        blockIds: ['p1'],
        caret: { blockId: 'p1', path: `/${'a'.repeat(PRESENCE_MAX_BYTES)}` },
      },
    };
    expect(presencePostSchema.safeParse(big).success).toBe(false);
    expect(presencePostSchema.safeParse({ ...minimal, clock: -1 }).success).toBe(false);
    expect(presencePostSchema.safeParse({ ...minimal, follow: OTHER }).success).toBe(true);
    expect(presencePostSchema.safeParse({ ...minimal, follow: 'someone' }).success).toBe(false);
  });

  it('parses a roster entry with the server’s identity fields', () => {
    expect(rosterEntrySchema.parse(roster)).toEqual(roster);
    expect(rosterEntrySchema.safeParse({ ...roster, hueSlot: 6 }).success).toBe(false);
    expect(rosterEntrySchema.safeParse({ ...roster, trust: 'admin' }).success).toBe(false);
  });
});

describe('entries and events', () => {
  const entry: Entry = {
    seq: 4113,
    rev: 25,
    kind: 'edit',
    author,
    clientId: CLIENT,
    opId: `${CLIENT}:7`,
    mutations: [splice],
    at: '2026-09-13T10:00:00.000Z',
  };

  it('parses an entry and refuses one without a seq or with both payloads', () => {
    expect(entrySchema.parse(entry)).toEqual(entry);
    // the history label rides an edit entry (channel.ts Entry.note) and never a comment
    const noted = { ...entry, note: 'Assist: Slide 2 shortened' };
    expect(entrySchema.parse(noted)).toEqual(noted);
    expect(
      entrySchema.safeParse({
        ...entry,
        mutations: undefined,
        kind: 'comment',
        comment: { op: 'add', thread: threadFixture() },
        note: 'Assist: notes',
      }).success,
    ).toBe(false);
    expect(entrySchema.safeParse({ ...entry, seq: 0 }).success).toBe(false);
    expect(
      entrySchema.safeParse({ ...entry, comment: { op: 'add', thread: threadFixture() } }).success,
    ).toBe(false);
  });

  it('parses every event kind of SPEC-3 3.3', () => {
    const events: RoomEvent[] = [
      {
        type: 'hello',
        seq: 4112,
        revision: 25,
        clientId: CLIENT,
        role: 'editor',
        clients: [roster],
        editing: 2,
        tier: 'redis',
      },
      { type: 'ops', entries: [entry] },
      { type: 'op', entry },
      {
        type: 'checkpoint',
        revision: 26,
        fromSeq: 4100,
        toSeq: 4140,
        snapshot: 'fc8e0000000000000000000000000000',
        author,
        note: '',
        comments: { revision: 3, threadIds: ['thr_1'] },
      },
      { type: 'presence', clientId: CLIENT, clock: 3, state: roster },
      { type: 'leave', clientId: CLIENT },
      { type: 'reject', opId: `${CLIENT}:8`, reason: 'stale', mutations: [splice] },
      { type: 'inbox', unread: 3 },
      { type: 'access', revision: 7 },
      { type: 'resync', revision: 26 },
    ];
    for (const event of events) expect(roomEventSchema.parse(event), event.type).toEqual(event);
    // the hello's `covered` (the cycle 3 stream fix round, fix round; SEAM-F8): optional, so an
    // older server's hello still parses, and a non negative seq when present
    const hello = events[0] as Extract<RoomEvent, { type: 'hello' }>;
    expect(roomEventSchema.parse({ ...hello, covered: 4100 })).toEqual({ ...hello, covered: 4100 });
    expect(roomEventSchema.safeParse({ ...hello, covered: -1 }).success).toBe(false);
    expect(
      roomEventSchema.safeParse({ type: 'reject', opId: 'x', reason: 'because' }).success,
    ).toBe(false);
    expect(roomEventSchema.safeParse({ type: 'chat', text: 'hi' }).success).toBe(false);
  });

  it('frames an event as one SSE block and parses it back', () => {
    const event: RoomEvent = { type: 'op', entry };
    const frame = sseFrame(event, 4113);
    expect(frame).toBe(`id: 4113\nevent: op\ndata: ${JSON.stringify(event)}\n\n`);
    const block = parseSseBlock(frame);
    expect(block).toEqual({ id: '4113', event: 'op', data: JSON.stringify(event) });
    expect(block === null ? null : roomEventOf(block)).toEqual(event);
    expect(parseSseBlock(sseComment())).toBeNull();
    expect(parseSseBlock(sseRetry(2500))).toEqual({ retry: 2500 });
    expect(parseSseBlock('data: a\ndata: b\n')).toEqual({ data: 'a\nb' });
    expect(roomEventOf({ data: 'not json' })).toBeNull();
    expect(roomEventOf({ data: '{"type":"chat"}' })).toBeNull();
  });
});
