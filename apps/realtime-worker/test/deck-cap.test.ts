import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CAPS } from '@turboslide/realtime/admission';
import { documentBytes, fillerSlide, nearCapDocument } from '@turboslide/realtime/deck-cap-fixture';
import { DECK_OVERSIZE_SENTENCE } from '@turboslide/realtime/room-core';

import {
  CID_A,
  call,
  connect,
  fakeApp,
  isAck,
  isEvent,
  mint,
  opsFrame,
  splice,
  uniqueDeck,
} from './lib.ts';
import type { FakeApp } from './lib.ts';

// The 25 MB deck cap in the object (RUST-4; hardening HR-RT#10): a deck 64 kB under the cap,
// seeded through the fake app's seed route; a slide insert that would pass the cap comes back to
// its author as `too-large` with its sentence, takes no seq and leaves the live document as it
// was, and the next keystroke lands. The suite runs `shadow`, so the full and the incremental
// admission both read the running total.

describe('the deck cap in the object', () => {
  let app: FakeApp;
  let deck: string;

  beforeEach(() => {
    deck = uniqueDeck('deck-cap');
    app = fakeApp(deck, { document: nearCapDocument(64 * 1024) });
  });

  afterEach(() => {
    app.restore();
  });

  it('refuses an insert past 25 MB and lands the next keystroke', async () => {
    const section = app.document.deck.sections[app.document.deck.sections.length - 1];
    const sectionId = section?.id ?? '';
    const after = section?.slideIds[section.slideIds.length - 1] ?? '';
    // the fake app stamped its revision on the manifest, so the store's bytes are read here
    const start = documentBytes(app.document);
    expect(start).toBeGreaterThan(CAPS.deckMaxBytes - 100 * 1024);
    const a = await connect(deck, await mint({ deck, cid: CID_A }));
    await a.next(isEvent('hello'), 300_000);
    a.send(
      opsFrame(CID_A, 1, 0, 1, [
        [{ op: 'slide.insert', sectionId, after, slide: fillerSlide('one-too-many', 100 * 1024) }],
      ]),
    );
    const refused = await a.next(isAck(1), 300_000);
    expect(refused.kind === 'ack' && refused.frame.ok).toBe(true);
    if (refused.kind !== 'ack' || !refused.frame.ok) return;
    expect(refused.frame.entries).toEqual([]);
    expect(refused.frame.rejected).toEqual([
      { opId: `${CID_A}:1`, reason: 'too-large', message: DECK_OVERSIZE_SENTENCE },
    ]);

    a.send(opsFrame(CID_A, 2, 0, 2, [[splice(0, 0, 'Fits. ')]]));
    const landed = await a.next(isAck(2), 300_000);
    expect(landed.kind === 'ack' && landed.frame.ok && landed.frame.rejected).toEqual([]);
    const counters = (await (await call(`/rooms/${deck}/counters`)).json()) as { head: number };
    expect(counters.head).toBe(1);
    // the checkpoint carries the keystroke and never the refused insert
    const flushed = await call(`/rooms/${deck}/flush`, { method: 'POST' });
    expect(flushed.status).toBe(200);
    await flushed.text();
    const posted = app.checkpoints.flatMap((row) =>
      row.entries.flatMap((entry) => entry.mutations ?? []),
    );
    expect(posted.map((mutation) => mutation.op)).toEqual(['text.splice']);
    expect(app.document.slides['one-too-many']).toBeUndefined();
    expect(documentBytes(app.document)).toBe(start + 'Fits. '.length);
    a.close();
  }, 900_000);
});
