// The decks and the seeded writes of the admission's parity and bench tests (hardening HR-RT#5a,
// RUST-1; docs/hardening/research/rust.md section 4): GT is decks/gt-brand (85 slides), x10 the
// same deck ten times over with new slide and section ids (850 slides), and a mulberry32 stream
// of entries over a document: typing, marks, block and slide writes, block inserts, removes and
// moves, slide replaces, and now and then a write of the deck, some of them refused on purpose.
// Imported by the tests alone (admission-parity.test.ts, admission.bench.test.ts).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockTextPaths } from '@turboslide/schema/catalog';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { getAt } from '@turboslide/schema/pointer';
import { plainLength } from '@turboslide/schema/text';
import type { Text } from '@turboslide/schema/text';
import { validateDeck } from '@turboslide/schema/validate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** decks/gt-brand as the validator normalizes it. */
export function gtDocument(): DeckDocument {
  const dir = join(ROOT, 'decks', 'gt-brand');
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as unknown;
  const slides = readdirSync(join(dir, 'slides'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, 'slides', name), 'utf8')) as unknown);
  const result = validateDeck({ deck, slides });
  if (!result.ok || result.deck === null) throw new Error('decks/gt-brand does not validate');
  return { deck: result.deck, slides: result.slides };
}

/** The document `times` over: each copy's slides and sections under new ids, the assets shared. */
export function copiedDocument(document: DeckDocument, times: number): DeckDocument {
  const sections = [...document.deck.sections];
  const slides: Record<string, Slide> = { ...document.slides };
  for (let n = 2; n <= times; n += 1) {
    for (const section of document.deck.sections) {
      const sectionId = `${section.id}-c${n}`;
      const slideIds: string[] = [];
      for (const slideId of section.slideIds) {
        const slide = document.slides[slideId];
        if (slide === undefined) continue;
        const id = `${slideId}-c${n}`;
        const copy = JSON.parse(JSON.stringify(slide)) as Slide & { sectionId?: string };
        copy.id = id;
        if (copy.kind === 'opener') copy.sectionId = sectionId;
        slides[id] = copy;
        slideIds.push(id);
      }
      sections.push({ ...section, id: sectionId, name: `${section.name} ${n}`, slideIds });
    }
  }
  const result = validateDeck({
    deck: { ...document.deck, sections },
    slides: Object.values(slides),
  });
  if (!result.ok || result.deck === null) throw new Error('the copied deck does not validate');
  return { deck: result.deck, slides: result.slides };
}

/** A seeded generator (mulberry32), so a red sequence reads the same order again. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Freezes a value and everything under it, so a write through a shared reference throws. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value as object))
    deepFreeze((value as Record<string, unknown>)[key]);
  return value;
}

type TextSite = { slideId: string; blockId: string; path: string; length: number };

/** Every Text a person types into on a slide: the block texts, and the fields of a title or statement slide. */
function textSites(slide: Slide): TextSite[] {
  const out: TextSite[] = [];
  if (slide.kind === 'title') {
    for (const field of ['heading', 'lead'] as const) {
      const value = (slide as unknown as Record<string, unknown>)[field];
      if (typeof value === 'string')
        out.push({
          slideId: slide.id,
          blockId: field,
          path: `/${field}`,
          length: plainLength(value as Text),
        });
    }
  }
  if (slide.kind === 'statement' && typeof slide.big === 'string')
    out.push({
      slideId: slide.id,
      blockId: 'big',
      path: '/big',
      length: plainLength(slide.big as Text),
    });
  for (const { block } of slideBlocks(slide)) {
    for (const path of blockTextPaths(block)) {
      const value = getAt(block, path);
      if (typeof value === 'string')
        out.push({
          slideId: slide.id,
          blockId: block.id,
          path,
          length: plainLength(value as Text),
        });
    }
  }
  return out;
}

const pick = <T>(next: () => number, rows: readonly T[]): T =>
  rows[Math.floor(next() * rows.length)] as T;
const WORDS = ['a', ' b', 'cd', ' ', 'é', '\n', '<x>', '&amp;', 'one two'];

/** One mutation over the document, valid most of the time and refused on purpose now and then. */
function mutationOf(document: DeckDocument, next: () => number): Mutation {
  const ids = Object.keys(document.slides);
  const slide = document.slides[pick(next, ids)] as Slide;
  const sites = textSites(slide);
  const blocks = slideBlocks(slide);
  const roll = next();
  if (roll < 0.4 && sites.length > 0) {
    const site = pick(next, sites);
    const at = Math.floor(next() * (site.length + (next() < 0.1 ? 4 : 1)));
    const remove = next() < 0.3 ? Math.floor(next() * 3) : 0;
    return {
      op: 'text.splice',
      slideId: site.slideId,
      blockId: site.blockId,
      path: site.path,
      at,
      remove,
      insert: pick(next, WORDS),
    };
  }
  if (roll < 0.5 && sites.length > 0) {
    const site = pick(next, sites);
    const start = Math.floor(next() * (site.length + 1));
    const end = Math.min(site.length + (next() < 0.1 ? 3 : 0), start + Math.floor(next() * 5));
    return {
      op: 'text.mark',
      slideId: site.slideId,
      blockId: site.blockId,
      path: site.path,
      range: [start, Math.max(start, end)],
      edit: { kind: 'marks', set: { b: true } },
    };
  }
  if (roll < 0.6 && blocks.length > 0) {
    const { block } = pick(next, blocks);
    const write = next();
    if (write < 0.4)
      return {
        op: 'block.set',
        slideId: slide.id,
        blockId: block.id,
        path: '/text',
        value: pick(next, WORDS),
      };
    if (write < 0.7)
      return {
        op: 'block.set',
        slideId: slide.id,
        blockId: block.id,
        path: '/measure',
        value: next() < 0.8 ? 40 : -3,
      };
    return { op: 'block.set', slideId: slide.id, blockId: block.id, path: '/bogus', value: 1 };
  }
  if (roll < 0.68) {
    const write = next();
    if (write < 0.4)
      return { op: 'slide.set', slideId: slide.id, path: '/notes', value: pick(next, WORDS) };
    if (write < 0.6 && slide.kind === 'title')
      return { op: 'slide.set', slideId: slide.id, path: '/heading', value: pick(next, WORDS) };
    return {
      op: 'slide.set',
      slideId: slide.id,
      path: '/layout',
      value: next() < 0.5 ? { type: 'single' } : 'nonsense',
    };
  }
  if (roll < 0.74 && blocks.length > 0) {
    const { block } = pick(next, blocks);
    return { op: 'block.remove', slideId: slide.id, blockId: block.id };
  }
  if (roll < 0.8 && slide.kind === 'content') {
    const slot = pick(next, Object.keys(slide.slots).concat(['nowhere']));
    return {
      op: 'block.insert',
      slideId: slide.id,
      slot: slot as never,
      block: {
        id: next() < 0.9 ? `new-${Math.floor(next() * 1e6)}` : (blocks[0]?.block.id ?? 'p1'),
        type: 'paragraph',
        text: 'Inserted',
      } as never,
    };
  }
  if (roll < 0.85 && blocks.length > 1 && slide.kind === 'content') {
    const { block, slot } = pick(next, blocks);
    return { op: 'block.move', slideId: slide.id, blockId: block.id, slot: slot as never };
  }
  if (roll < 0.9) {
    const copy = JSON.parse(JSON.stringify(slide)) as Slide & { notes?: string };
    copy.notes = pick(next, WORDS);
    return { op: 'slide.replace', slideId: slide.id, slide: copy };
  }
  if (roll < 0.95)
    return { op: 'deck.set', path: '/title', value: pick(next, ['Deck', '', 'A title']) };
  const section = pick(next, document.deck.sections);
  return { op: 'slide.move', slideId: pick(next, ids), sectionId: section.id };
}

/** One entry of a seeded sequence: one to three mutations over the document as it stands. */
export function entryOf(document: DeckDocument, next: () => number): Mutation[] {
  const count = 1 + Math.floor(next() * 3);
  return Array.from({ length: count }, () => mutationOf(document, next));
}
