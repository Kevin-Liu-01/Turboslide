import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import { applyMutations } from '@turboslide/schema/reduce';

import {
  altFor,
  assetIdFor,
  CLIPBOARD_PREFIX,
  clipboardKindOf,
  createClipboardStore,
  decodeClipboard,
  encodeClipboard,
  freeId,
  insertSlotFor,
  paintFormatOf,
  paintMutations,
  PASTE_OFFSET_PX,
  pastedBlockInserts,
  pastedSlideInserts,
} from '../clipboard';
import type { ClipboardPayload } from '../clipboard';

// The clipboard envelope of gslides-parity SPEC 2.2 and the planning of a paste; paint format
// (SPEC 3.1 row 6) as one block.set per field the target takes.

const document = workedDocument();
const content = document.slides['content-rule'];
if (!content) throw new Error('the worked document has no content-rule slide');

describe('the envelope', () => {
  it('prefixes turboslide:v1: and decodes its own text back', () => {
    const payload: ClipboardPayload = { kind: 'text', text: 'Hello' };
    const encoded = encodeClipboard(payload);
    expect(encoded.startsWith(CLIPBOARD_PREFIX)).toBe(true);
    expect(decodeClipboard(encoded)).toEqual(payload);
    const slides: ClipboardPayload = { kind: 'slides', deckId: 'fixture', slides: [content] };
    expect(decodeClipboard(encodeClipboard(slides))).toEqual(slides);
  });

  it('reads any other text as a text payload, nothing for an empty string, and a broken envelope as text', () => {
    expect(decodeClipboard('plain words')).toEqual({ kind: 'text', text: 'plain words' });
    expect(decodeClipboard('')).toBeNull();
    expect(decodeClipboard(`${CLIPBOARD_PREFIX}{not json`)).toEqual({
      kind: 'text',
      text: `${CLIPBOARD_PREFIX}{not json`,
    });
    expect(clipboardKindOf(null)).toBe('empty');
    expect(clipboardKindOf({ kind: 'blocks', deckId: 'd', slideId: 's', blocks: [] })).toBe(
      'blocks',
    );
  });
});

describe('the store', () => {
  it('writes the envelope to the system clipboard and reads it back, in-page copy first when the system refuses', async () => {
    let system = '';
    const store = createClipboardStore({
      writeText: async (text) => {
        system = text;
      },
      readText: async () => system,
    });
    expect(store.kind()).toBe('empty');
    const payload: ClipboardPayload = {
      kind: 'blocks',
      deckId: 'fixture',
      slideId: 'content-rule',
      blocks: [{ id: 'p', type: 'paragraph', text: 'x' }],
    };
    await store.write(payload);
    expect(system).toBe(encodeClipboard(payload));
    expect(store.kind()).toBe('blocks');
    expect(await store.read()).toEqual(payload);
    /* another tab's copy on the system clipboard wins over the in-page payload */
    system = encodeClipboard({ kind: 'text', text: 'from elsewhere' });
    expect(await store.read()).toEqual({ kind: 'text', text: 'from elsewhere' });
    system = 'plain words copied anywhere';
    expect(await store.read()).toEqual({ kind: 'text', text: 'plain words copied anywhere' });
    /* a refused system read answers with the in-page payload */
    const refusing = createClipboardStore({
      writeText: async () => {
        throw new Error('no permission');
      },
      readText: async () => {
        throw new Error('no permission');
      },
    });
    await refusing.write(payload);
    expect(await refusing.read()).toEqual(payload);
  });
});

describe('pasting slides', () => {
  it('inserts copies after the selected slide with fresh ids, in order', () => {
    const payload: ClipboardPayload = {
      kind: 'slides',
      deckId: 'fixture',
      slides: [content, { ...content, id: 'other' }],
    };
    const home = document.deck.sections.find((section) => section.slideIds.includes('title'));
    if (!home) throw new Error('the worked document has no section holding title');
    const inserts = pastedSlideInserts(document.deck, payload, 'title');
    expect(inserts.map((row) => [row.sectionId, row.after, row.slide.id])).toEqual([
      [home.id, 'title', 'content-rule-2'],
      [home.id, 'content-rule-2', 'other'],
    ]);
    /* every insert applies through the reducer, right after the selected slide */
    let working = document;
    for (const input of inserts) {
      working = applyMutations(working, [{ op: 'slide.insert', ...input }]).document;
    }
    const after = working.deck.sections.find((section) => section.id === home.id)?.slideIds ?? [];
    const at = after.indexOf('title');
    expect(after.slice(at, at + 3)).toEqual(['title', 'content-rule-2', 'other']);
  });

  it('lands in the last section when no slide is selected', () => {
    const payload: ClipboardPayload = { kind: 'slides', deckId: 'fixture', slides: [content] };
    const [only] = pastedSlideInserts(document.deck, payload, undefined);
    const last = document.deck.sections[document.deck.sections.length - 1];
    expect(only?.sectionId).toBe(last?.id);
    expect(only?.after).toBeUndefined();
  });
});

describe('pasting blocks', () => {
  const free: Slide = {
    schemaVersion: 1,
    id: 'free',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        { id: 'a', type: 'paragraph', text: 'A', pos: { x: 200, y: 200, w: 300, h: 100, z: 0 } },
      ],
    },
  };
  const blocks: Block[] = [
    { id: 'a', type: 'paragraph', text: 'A', pos: { x: 200, y: 200, w: 300, h: 100, z: 0 } },
  ];

  it('offsets a copy pasted onto its own freeform slide by 16 px and puts it on top', () => {
    const planned = pastedBlockInserts(
      free,
      { kind: 'blocks', deckId: 'fixture', slideId: 'free', blocks },
      { sameSlide: true, selectedBlockId: 'a' },
    );
    expect(planned.ids).toEqual(['a-2']);
    const [mutation] = planned.mutations;
    expect(mutation?.op).toBe('block.insert');
    if (mutation?.op === 'block.insert') {
      expect(mutation.slot).toBe('main');
      expect(mutation.block.pos).toEqual({
        x: 200 + PASTE_OFFSET_PX,
        y: 200 + PASTE_OFFSET_PX,
        w: 300,
        h: 100,
        z: 1,
      });
    }
    const after = applyMutations({ deck: document.deck, slides: { free } }, planned.mutations)
      .document.slides['free'];
    expect(after?.kind === 'content' && after.slots.main?.map((b) => b.id)).toEqual(['a', 'a-2']);
  });

  it('keeps the source box on another freeform slide and drops it on a grammar slide, after the selected block', () => {
    const elsewhere = pastedBlockInserts(
      free,
      { kind: 'blocks', deckId: 'other', slideId: 'x', blocks },
      { sameSlide: false },
    );
    const [onto] = elsewhere.mutations;
    if (onto?.op === 'block.insert')
      expect(onto.block.pos).toEqual({ x: 200, y: 200, w: 300, h: 100, z: 1 });
    const grammar = pastedBlockInserts(
      content,
      { kind: 'blocks', deckId: 'fixture', slideId: 'free', blocks },
      { sameSlide: false, selectedBlockId: 'h' },
    );
    const [into] = grammar.mutations;
    expect(into?.op).toBe('block.insert');
    if (into?.op === 'block.insert') {
      expect(into.slot).toBe(insertSlotFor(content, 'h'));
      expect(into.after).toBe('h');
      expect(into.block.pos).toBeUndefined();
      expect(into.block.id).toBe('a');
    }
    /* the first filled slot with nothing selected, the selected block's slot otherwise */
    expect(insertSlotFor(content)).toBe(insertSlotFor(content, 'h'));
    expect(insertSlotFor(content, 'list')).toBe(insertSlotFor(content, 'list'));
  });
});

describe('ids and pictures', () => {
  it('frees an id by counting up and slugs a file name for an asset', () => {
    expect(freeId('text', new Set())).toBe('text');
    expect(freeId('text', new Set(['text']))).toBe('text-2');
    expect(freeId('text', new Set(['text', 'text-2']))).toBe('text-3');
    expect(assetIdFor('Acme Logo (final).PNG', new Set())).toBe('acme-logo-final');
    expect(assetIdFor('acme-logo.png', new Set(['acme-logo']))).toBe('acme-logo-2');
    expect(altFor('acme_logo-final.png')).toBe('acme logo final');
    expect(altFor('.png')).toBe('Picture');
  });
});

describe('paint format', () => {
  const box: Block = {
    id: 'box',
    type: 'box',
    text: 'Box',
    fill: 'plate',
    stroke: 'ink',
    strokeWidth: 1.5,
    typography: { size: 22, weight: 500 },
  };
  const target: Block = { id: 'other', type: 'box', text: 'Other', fill: 'plate' };
  const heading: Block = { id: 'h', type: 'heading', level: 'h2', text: 'H' };

  it('copies the look of a block and applies the fields the target takes, one block.set each', () => {
    const format = paintFormatOf(box);
    expect(Object.keys(format).sort()).toEqual(['fill', 'stroke', 'strokeWidth', 'typography']);
    const onBox = paintMutations(content, target, format);
    /* fill is already plate: three writes */
    expect(onBox.map((m) => (m.op === 'block.set' ? m.path : m.op)).sort()).toEqual([
      '/stroke',
      '/strokeWidth',
      '/typography',
    ]);
    const onHeading = paintMutations(content, heading, format);
    /* a heading has typography and no fill or stroke */
    expect(onHeading.map((m) => (m.op === 'block.set' ? m.path : m.op))).toEqual(['/typography']);
    expect(paintFormatOf({ id: 'r', type: 'rule', orientation: 'horizontal' })).toEqual({});
  });
});
