// A reader's stream keeps every seq (hardening HR-RC#10). A tab moves its position one seq at a
// time, so an entry left out of a reader's stream was a gap the tab waited on for good: a viewer
// without the comments switch stopped applying edits after anyone's comment, and a viewer or a
// commenter after an editor's speaker notes, until a reload (reproduced on the local do tier on
// 2026-10-11: the viewer read "Before comment" with its position at 20 and the head at 33). The
// room's filter (room-core.ts `filterEventForReader`) now sends such an entry as `hiddenEntry`,
// and the tab moves past it and applies the next edit. The stream and the replay are the real
// filter over a hand transport, the way the stream route and the Durable Object send them.
import { describe, expect, it } from 'vitest';

import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';
import { plainOf } from '@turboslide/schema/text';
import { validateDocument } from '@turboslide/schema/validate';

import type { Entry, RoomEvent } from '../src/channel.ts';
import { entrySchema } from '../src/protocol.ts';
import { filterEventForReader, hiddenEntry } from '../src/room-core.ts';
import type { ViewerFacts } from '../src/room-core.ts';
import { createRoomClient } from './room-client.ts';
import type { RoomTransport } from './room-client.ts';

const SLIDE = 'content-rule';
const BLOCK = 'p1';
const OWNER = {
  kind: 'human' as const,
  name: 'Titanium 471',
  principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
};

function normalized(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: result.deck, slides: result.slides };
}

function textOf(document: DeckDocument): string {
  return plainOf(String(getAt(document.slides[SLIDE], '/slots/left/1/text')));
}

function splice(at: number, insert: string): Mutation {
  return {
    op: 'text.splice',
    slideId: SLIDE,
    blockId: BLOCK,
    path: '/text',
    at,
    remove: 0,
    insert,
  };
}

function edit(seq: number, mutations: Mutation[]): Entry {
  return {
    seq,
    rev: 0,
    kind: 'edit',
    author: OWNER,
    clientId: 'owner-tab',
    opId: `owner-tab:${seq}`,
    mutations,
    at: '2026-10-11T00:00:00.000Z',
  };
}

function comment(seq: number): Entry {
  return {
    seq,
    rev: 0,
    kind: 'comment',
    author: OWNER,
    clientId: 'server',
    opId: `server:comment-${seq}`,
    comment: {
      op: 'resolve',
      threadId: '01m4p2nwrver1as67dq1ypaym6',
      at: '2026-10-11T00:00:00.000Z',
      by: OWNER.principalId,
    },
    at: '2026-10-11T00:00:00.000Z',
  };
}

const notes = (seq: number): Entry =>
  edit(seq, [{ op: 'slide.set', slideId: SLIDE, path: '/notes', value: 'Owner notes' }]);

/** The owner's three words with a comment after the first and a notes edit after the second. */
function log(start: string): Entry[] {
  return [
    edit(1, [splice(start.length, ' one')]),
    comment(2),
    edit(3, [splice(start.length + 4, ' two')]),
    notes(4),
    edit(5, [splice(start.length + 8, ' three')]),
  ];
}

const viewerLink: ViewerFacts = {
  role: 'viewer',
  via: 'link',
  showNames: false,
  readComments: false,
};
const commenterLink: ViewerFacts = { ...viewerLink, role: 'commenter', readComments: true };

/** A reader's tab over a hand transport whose stream is the room's filter for that reader. */
function readerTab(reader: ViewerFacts) {
  const document = normalized();
  let deliver: ((event: RoomEvent) => void) | null = null;
  const transport: RoomTransport = {
    open(options) {
      deliver = options.onEvent;
      return { close: () => undefined };
    },
    postOps: async () => ({ ok: false, status: 403, code: 'forbidden', message: 'forbidden' }),
    postPresence: async () => undefined,
  };
  const room = createRoomClient({
    deckId: 'gt-brand',
    transport,
    document,
    seq: 0,
    tier: 'do',
    timers: { setTimeout: () => null, clearTimeout: () => undefined },
    onChange: () => undefined,
  });
  room.start();
  const send = (event: RoomEvent): void => {
    const shown = filterEventForReader(event, reader);
    if (shown !== null) deliver?.(shown);
  };
  send({
    type: 'hello',
    seq: 0,
    revision: 0,
    clientId: 'reader-tab',
    role: reader.role,
    clients: [],
    editing: 1,
    tier: 'do',
  });
  return { room, send, start: textOf(document) };
}

describe("a reader's stream keeps every seq (HR-RC#10)", () => {
  it('sends an entry the reader may not read as an empty edit every client parses', () => {
    const hidden = filterEventForReader({ type: 'op', entry: comment(2) }, viewerLink);
    expect(hidden).toEqual({ type: 'op', entry: hiddenEntry(comment(2)) });
    if (hidden?.type !== 'op') throw new Error('op');
    expect(hidden.entry).toMatchObject({ seq: 2, kind: 'edit', mutations: [] });
    expect(hidden.entry.comment).toBeUndefined();
    // the shape a tab of today's build reads (protocol.ts hasPayload), so an older tab moves too
    expect(entrySchema.safeParse(hidden.entry).success).toBe(true);
    const shown = filterEventForReader({ type: 'op', entry: notes(4) }, commenterLink);
    if (shown?.type !== 'op') throw new Error('op');
    expect(shown.entry).toMatchObject({ seq: 4, mutations: [] });
    expect(JSON.stringify(shown.entry)).not.toContain('Owner notes');
    expect(entrySchema.safeParse(shown.entry).success).toBe(true);
    // a commenter reads the comment whole, an editor reads the notes whole
    expect(filterEventForReader({ type: 'op', entry: comment(2) }, commenterLink)).toEqual({
      type: 'op',
      entry: comment(2),
    });
    expect(
      filterEventForReader({ type: 'op', entry: notes(4) }, { ...viewerLink, role: 'editor' }),
    ).toEqual({ type: 'op', entry: notes(4) });
  });

  it("keeps the replay's seqs whole", () => {
    const replay = filterEventForReader({ type: 'ops', entries: log('x') }, viewerLink);
    if (replay?.type !== 'ops') throw new Error('ops');
    expect(replay.entries.map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(replay.entries.every((entry) => entrySchema.safeParse(entry).success)).toBe(true);
  });

  for (const [name, reader] of [
    ['a viewer', viewerLink],
    ['a commenter', commenterLink],
  ] as const) {
    it(`${name} applies the edits after a comment and after a notes edit, live`, async () => {
      const tab = readerTab(reader);
      for (const entry of log(tab.start)) tab.send({ type: 'op', entry });
      await Promise.resolve();
      expect(tab.room.status().seq).toBe(5);
      expect(textOf(tab.room.document())).toBe(`${tab.start} one two three`);
      expect(JSON.stringify(tab.room.document())).not.toContain('Owner notes');
      await tab.room.stop();
    });

    it(`${name} applies them from a replay`, async () => {
      const tab = readerTab(reader);
      tab.send({ type: 'ops', entries: log(tab.start) });
      await Promise.resolve();
      expect(tab.room.status().seq).toBe(5);
      expect(textOf(tab.room.document())).toBe(`${tab.start} one two three`);
      await tab.room.stop();
    });
  }
});
