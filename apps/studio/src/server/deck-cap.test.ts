// The 25 MB deck cap on the function's rooms (RUST-4; hardening HR-RT#10): the memory tier's
// `admitOps` refuses an entry that would take the deck past `CAPS.deckMaxBytes` with
// `too-large` and its sentence, appends nothing for it, and lands the next entry that fits. The
// pure rows are packages/realtime/src/deck-cap.test.ts; the object's are
// apps/realtime-worker/test/deck-cap.test.ts.
import { describe, expect, it } from 'vitest';

import { CAPS } from '@turboslide/realtime/admission';
import { documentBytes, fillerSlide, nearCapDocument } from '@turboslide/realtime/deck-cap-fixture';
import { memoryChannel } from '@turboslide/realtime/memory';
import type { MemoryChannel } from '@turboslide/realtime/memory';
import type { OpsPost } from '@turboslide/realtime/protocol';
import { DECK_OVERSIZE_SENTENCE } from '@turboslide/realtime/room-core';
import type { DeckDocument } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';

import { applyStreamEntries } from './checkpoint';
import { admitOps } from './room';
import type { RequestIdentity, Room } from './room';

const DECK = 'deck-cap';
const A = 'a'.repeat(32);

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

describe('the deck cap on the memory tier (admitOps)', () => {
  it('refuses an insert past 25 MB with its sentence and lands a write that fits', async () => {
    const start = nearCapDocument(64 * 1024);
    const section = start.deck.sections[start.deck.sections.length - 1];
    const sectionId = section?.id ?? '';
    const after = section?.slideIds[section.slideIds.length - 1] ?? '';
    const channel = memoryChannel();
    const room = memoryRoom(channel, start);
    await channel.presence.bind(DECK, A, 'anon_a', 60_000);
    let clock = Date.parse('2026-10-12T22:00:00.000Z');
    const admit = (opId: string, mutations: Mutation[]) =>
      admitOps(room, {
        post: {
          clientId: A,
          base: { seq: 0 },
          entries: [{ opId, kind: 'edit', mutations }],
        } as unknown as OpsPost,
        bytes: 256,
        identity: { kind: 'anonymous', identity: 'anon_a' } as RequestIdentity,
        author: { kind: 'human', name: 'a' },
        role: 'editor',
        // a minute apart, so the budgets never refuse
        now: () => (clock += 61_000),
      });

    const refused = await admit(`${A}:1`, [
      { op: 'slide.insert', sectionId, after, slide: fillerSlide('one-too-many', 100 * 1024) },
    ]);
    expect(refused).toMatchObject({
      ok: true,
      entries: [],
      rejected: [{ opId: `${A}:1`, reason: 'too-large', message: DECK_OVERSIZE_SENTENCE }],
    });
    expect(await channel.head(DECK)).toBe(0);

    const landed = await admit(`${A}:2`, [
      {
        op: 'text.splice',
        slideId: 'content-rule',
        blockId: 'p1',
        path: '/text',
        at: 0,
        remove: 0,
        insert: 'Fits. ',
      },
    ]);
    expect(landed).toMatchObject({ ok: true, rejected: [] });
    expect(await channel.head(DECK)).toBe(1);
    const live = (await room.live()).document;
    expect(documentBytes(live)).toBe(CAPS.deckMaxBytes - 64 * 1024 + 'Fits. '.length);
  }, 300_000);
});
