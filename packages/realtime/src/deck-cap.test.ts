// The 25 MB deck cap at admission (RUST-4; hardening HR-RT#10): `CAPS.deckMaxBytes` was declared
// and never read, so a deck grew by inserts with no bound and the admission's cost grew with it.
// `landCandidate` keeps the deck's canonical bytes as a running total and refuses an entry that
// would take the deck past the cap with `too-large`; an entry that keeps or lowers the bytes of a
// deck already over the cap still lands, so such a deck can be trimmed. Every mode of the
// admission reads the same total. The memory tier's rows are in apps/studio
// (`deck-cap.test.ts`) and the object's in apps/realtime-worker/test/deck-cap.test.ts.
//
// A landing of a 25 MB deck in `full` validates the whole document (about 2 s of CPU, minutes at
// this machine's load), so the landings run in `incremental`, where a write of one slide is
// judged on that slide, and in `full` once; the refusals, which stop before any validation, run
// in every mode.
import { describe, expect, it } from 'vitest';

import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';

import { entryOf, gtDocument, random } from './admission-decks.ts';
import { CAPS } from './admission.ts';
import { documentBytes, fillerSlide, nearCapDocument } from './deck-cap-fixture.ts';
import { DECK_OVERSIZE_SENTENCE, deckBytes, landCandidate } from './room-core.ts';
import type { AdmissionMode } from './room-core.ts';

const MODES: AdmissionMode[] = ['full', 'incremental', 'shadow'];
const KB = 1024;

/** A slide insert at the end of the last section (an opener stays first in its section). */
function insertAtEnd(document: DeckDocument, slide: Slide): Mutation {
  const section = document.deck.sections[document.deck.sections.length - 1];
  if (section === undefined) throw new Error('no section');
  const after = section.slideIds[section.slideIds.length - 1];
  return {
    op: 'slide.insert',
    sectionId: section.id,
    ...(after === undefined ? {} : { after }),
    slide,
  };
}

function land(document: DeckDocument, mutations: Mutation[], mode: AdmissionMode) {
  const disagreements: unknown[] = [];
  const placed = landCandidate(document, { opId: 'a:1', kind: 'edit', mutations }, () => true, {
    mode,
    onDisagree: (row) => disagreements.push(row),
  });
  expect(disagreements).toEqual([]);
  return placed;
}

const typed = (insert: string, at = 0, slideId = 'content-rule'): Mutation => ({
  op: 'text.splice',
  slideId,
  blockId: 'p1',
  path: '/text',
  at,
  remove: 0,
  insert,
});

const deleted = (remove: number, slideId: string): Mutation => ({
  op: 'text.splice',
  slideId,
  blockId: 'p1',
  path: '/text',
  at: 0,
  remove,
  insert: '',
});

describe('the deck cap (RUST-4, HR-RT#10)', { timeout: 900_000 }, () => {
  // 64 kB under the cap, and 8 kB over it as a deck stored before the cap could be; built once
  // and never written through (every landing copies what it writes)
  const under = nearCapDocument(64 * KB);
  const over = nearCapDocument(-8 * KB);

  it('builds its decks at the bytes it names', () => {
    expect(documentBytes(under)).toBe(CAPS.deckMaxBytes - 64 * KB);
    expect(deckBytes(under)).toBe(documentBytes(under));
    expect(deckBytes(over)).toBe(CAPS.deckMaxBytes + 8 * KB);
  });

  for (const mode of MODES) {
    it(`refuses an insert past the cap, typing past it, and growth of a deck over it (${mode})`, () => {
      expect(
        land(under, [insertAtEnd(under, fillerSlide('one-too-many', 100 * KB))], mode),
      ).toEqual({
        ok: false,
        rejected: { opId: 'a:1', reason: 'too-large', message: DECK_OVERSIZE_SENTENCE },
      });
      expect(land(under, [typed('y'.repeat(80 * KB))], mode)).toEqual({
        ok: false,
        rejected: { opId: 'a:1', reason: 'too-large', message: DECK_OVERSIZE_SENTENCE },
      });
      expect(land(over, [typed('z')], mode)).toMatchObject({
        ok: false,
        rejected: { reason: 'too-large' },
      });
    });
  }

  it('lands typing under the cap and keeps the running total equal to a fresh count', () => {
    for (const mode of ['incremental', 'full'] as const) {
      const landed = land(under, [typed('y'.repeat(16 * KB))], mode);
      expect(landed.ok).toBe(true);
      if (!landed.ok) return;
      expect(deckBytes(landed.document)).toBe(CAPS.deckMaxBytes - 48 * KB);
      expect(documentBytes(landed.document)).toBe(CAPS.deckMaxBytes - 48 * KB);
    }
  });

  it('lets a deck over the cap shrink under it, write by write', () => {
    let document = over;
    for (const slideId of ['filler-0001', 'filler-0002']) {
      const placed = land(document, [deleted(6 * KB, slideId)], 'incremental');
      expect(placed.ok).toBe(true);
      if (!placed.ok) return;
      document = placed.document;
    }
    expect(deckBytes(document)).toBe(CAPS.deckMaxBytes - 4 * KB);
    expect(documentBytes(document)).toBe(deckBytes(document));
    // under the cap again, the deck takes a write that grows it
    expect(land(document, [typed('fits')], 'incremental').ok).toBe(true);
  });

  it('carries the total through seeded writes of GT, the title rule and deck writes included', () => {
    for (const mode of ['incremental', 'full'] as const) {
      let landed = 0;
      for (let seed = 20_001; seed <= 20_010; seed += 1) {
        const next = random(seed);
        let document = gtDocument();
        for (let step = 0; step < 6; step += 1) {
          const mutations = entryOf(document, next);
          const placed = land(document, mutations, mode);
          if (!placed.ok) continue;
          landed += 1;
          expect(deckBytes(placed.document), `seed ${seed} step ${step} (${mode})`).toBe(
            documentBytes(placed.document),
          );
          document = placed.document;
        }
      }
      expect(landed).toBeGreaterThan(20);
    }
  });
});
