// The documents of the deck cap's tests (RUST-4; hardening HR-RT#10): the worked deck grown with
// filler slides until its canonical bytes stand a given distance under `CAPS.deckMaxBytes`, and
// a filler slide of a given size. The bytes are measured here with the store's own rule (each
// slide's canonical JSON and the manifest's, in UTF-8), apart from the admission's running total,
// so the tests read the admission against an independent count. Imported by tests alone (the
// realtime package, the studio's memory tier and the Worker suite); no node: module, so the
// Workers runtime loads it too.
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { CONTENT_RULE, workedDocument } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';

import { CAPS } from './admission.ts';

const encoder = new TextEncoder();

function bytesOf(value: unknown): number {
  return encoder.encode(canonicalJson(value)).byteLength;
}

/** A copy of the worked deck's content slide under `id`, its paragraph padded to `bytes` canonical bytes. */
export function fillerSlide(id: string, bytes: number): Slide {
  const slide = JSON.parse(JSON.stringify(CONTENT_RULE)) as Slide;
  slide.id = id;
  const slots = (slide as unknown as { slots: Record<string, { id: string; text?: string }[]> })
    .slots;
  const paragraph = Object.values(slots)
    .flat()
    .find((block) => block.id === 'p1');
  if (paragraph === undefined) throw new Error('the content slide has no paragraph p1');
  paragraph.text = 'x';
  const pad = bytes - bytesOf(slide);
  if (pad < 0) throw new Error(`a filler slide is at least ${bytesOf(slide)} bytes`);
  paragraph.text = 'x'.repeat(1 + pad);
  return slide;
}

/** The canonical bytes of a document as the cap reads them: every slide's and the manifest's. */
export function documentBytes(document: DeckDocument): number {
  let total = bytesOf(document.deck);
  for (const slide of Object.values(document.slides)) total += bytesOf(slide);
  return total;
}

/**
 * The worked deck with filler slides in its last section, `room` bytes under the deck cap
 * exactly (`documentBytes`). The fillers share what is left evenly, each under the slide cap.
 */
export function nearCapDocument(room: number): DeckDocument {
  const document = workedDocument();
  const section = document.deck.sections[document.deck.sections.length - 1];
  if (section === undefined) throw new Error('the worked deck has no section');
  const target = CAPS.deckMaxBytes - room;
  let slides = 0;
  for (const slide of Object.values(document.slides)) slides += bytesOf(slide);
  const count = Math.ceil((target - slides - bytesOf(document.deck)) / (190 * 1024));
  const ids = Array.from({ length: count }, (_, i) => `filler-${String(i + 1).padStart(4, '0')}`);
  // the ids first, so the manifest the fillers share the rest with is the final one
  section.slideIds.push(...ids);
  const left = target - slides - bytesOf(document.deck);
  const share = Math.floor(left / count);
  ids.forEach((id, i) => {
    document.slides[id] = fillerSlide(id, i < count - 1 ? share : left - share * (count - 1));
  });
  const total = documentBytes(document);
  if (total !== target) throw new Error(`the filled deck is ${total} bytes, not ${target}`);
  return document;
}
