import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { DeckDocument } from './deck.ts';
import { workedDocument } from './fixtures.ts';
import type { Mutation, Write } from './mutations.ts';
import { applyMutation, applyMutations, applyWrite } from './reduce.ts';
import { canonicalText } from './text.ts';
import { transformAgainst } from './transform.ts';
import { validateDocument } from './validate.ts';

const author = { kind: 'agent', name: 'agent', runId: 'test' } as const;
const NOW = '2026-09-10T20:00:00.000Z';

function write(mutations: Mutation[], baseRevision = 412): Write {
  return { baseRevision, author, mutations };
}

/** The worked deck in its normalized form, the state a stored deck is always in. */
function base(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: result.deck, slides: result.slides };
}

/** Strips the fields a write always changes, so before and after can be compared. */
function stable(document: DeckDocument): DeckDocument {
  const { revision: _r, updatedAt: _u, ...deck } = document.deck;
  return { deck: { ...deck, revision: 0, updatedAt: '' }, slides: document.slides };
}

describe('applyWrite', () => {
  it('rejects a stale baseRevision with the current document', () => {
    const document = workedDocument();
    const result = applyWrite(document, write([{ op: 'slide.remove', slideId: 'thesis' }], 400));
    expect(result.ok).toBe(false);
    if (result.ok || result.code !== 'conflict') throw new Error('expected a conflict');
    expect(result.currentRevision).toBe(412);
    expect(result.current).toBe(document);
  });

  it('bumps the revision, stamps updatedAt and returns the log entry', () => {
    const document = workedDocument();
    const result = applyWrite(
      document,
      { ...write([{ op: 'deck.set', path: '/title', value: 'Brand deck' }]), note: 'rename' },
      { now: NOW },
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.document.deck.revision).toBe(413);
    expect(result.document.deck.updatedAt).toBe(NOW);
    expect(result.document.deck.title).toBe('Brand deck');
    expect(result.entry).toMatchObject({
      revision: 413,
      baseRevision: 412,
      author,
      note: 'rename',
      createdAt: NOW,
    });
    expect(result.inverse).toEqual([{ op: 'deck.set', path: '/title', value: 'GT brand deck' }]);
    expect(document.deck.title).toBe('GT brand deck');
  });

  it('is atomic: a failing mutation leaves the input untouched and reports the index', () => {
    const document = workedDocument();
    const result = applyWrite(
      document,
      write([
        { op: 'slide.remove', slideId: 'thesis' },
        { op: 'slide.remove', slideId: 'nowhere' },
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok || result.code !== 'invalid') throw new Error('expected invalid');
    expect(result.index).toBe(1);
    expect(document.slides.thesis).toBeDefined();
  });

  it('rejects a write that leaves the deck invalid', () => {
    const document = workedDocument();
    const result = applyWrite(
      document,
      write([
        { op: 'slide.set', slideId: 'content-rule', path: '/layout', value: { type: 'nope' } },
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok || result.code !== 'invalid') throw new Error('expected invalid');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('returns the normalized document: typed text is stored in canonical form', () => {
    const document = workedDocument();
    const result = applyWrite(
      document,
      write([
        {
          op: 'text.replace',
          slideId: 'content-rule',
          blockId: 'h',
          path: '/text',
          range: [4, 11],
          text: '* star',
        },
      ]),
    );
    if (!result.ok) throw new Error(result.message);
    const slide = result.document.slides['content-rule'];
    if (slide?.kind !== 'content') throw new Error('result');
    const heading = slide.slots.left?.[0];
    expect(heading?.type === 'heading' && heading.text).toBe('The \\* star rule');
  });
});

describe('inverse mutations', () => {
  const cases: { name: string; mutations: Mutation[] }[] = [
    {
      name: 'slide.insert first',
      mutations: [
        {
          op: 'slide.insert',
          sectionId: 'website',
          slide: { schemaVersion: 1, id: 'why', kind: 'statement', big: 'Why' },
        },
      ],
    },
    {
      name: 'slide.insert after',
      mutations: [
        {
          op: 'slide.insert',
          sectionId: 'brand',
          after: 'thesis',
          slide: { schemaVersion: 1, id: 'why', kind: 'statement', big: 'Why' },
        },
      ],
    },
    { name: 'slide.remove', mutations: [{ op: 'slide.remove', slideId: 'thesis' }] },
    {
      name: 'slide.remove first of section',
      mutations: [{ op: 'slide.remove', slideId: 'the-production-site' }],
    },
    {
      name: 'slide.move across sections',
      mutations: [
        { op: 'slide.move', slideId: 'thesis', sectionId: 'website', after: 'the-production-site' },
      ],
    },
    {
      name: 'slide.move to first',
      mutations: [
        { op: 'slide.move', slideId: 'content-rule', sectionId: 'brand', after: 'opener-brand' },
      ],
    },
    {
      name: 'slide.set existing',
      mutations: [
        { op: 'slide.set', slideId: 'content-rule', path: '/layout/ratio', value: '4/8' },
      ],
    },
    {
      name: 'slide.set new field',
      mutations: [
        { op: 'slide.set', slideId: 'content-rule', path: '/notes', value: 'Say it plainly.' },
      ],
    },
    {
      name: 'slide.set delete',
      mutations: [{ op: 'slide.set', slideId: 'opener-prototemplate', path: '/notes' }],
    },
    {
      name: 'slide.replace',
      mutations: [
        {
          op: 'slide.replace',
          slideId: 'thesis',
          slide: { schemaVersion: 1, id: 'thesis', kind: 'statement', big: 'A new thesis' },
        },
      ],
    },
    {
      name: 'block.insert into an empty slot',
      mutations: [
        {
          op: 'block.insert',
          slideId: 'content-rule',
          slot: 'right',
          after: 'list',
          block: { id: 'p9', type: 'paragraph', text: 'More.' },
        },
      ],
    },
    {
      name: 'block.insert first',
      mutations: [
        {
          op: 'block.insert',
          slideId: 'content-rule',
          slot: 'left',
          block: { id: 'p0', type: 'paragraph', text: 'First.' },
        },
      ],
    },
    {
      name: 'block.insert on a plate',
      mutations: [
        {
          op: 'block.insert',
          slideId: 'mood-earth',
          slot: 'plate',
          after: 'p',
          block: { id: 'p2', type: 'paragraph', text: 'Second.' },
        },
      ],
    },
    {
      name: 'block.remove',
      mutations: [{ op: 'block.remove', slideId: 'content-rule', blockId: 'p1' }],
    },
    {
      name: 'block.remove first',
      mutations: [{ op: 'block.remove', slideId: 'content-rule', blockId: 'h' }],
    },
    {
      name: 'block.move within a slot',
      mutations: [
        { op: 'block.move', slideId: 'content-rule', blockId: 'h', slot: 'left', after: 'p1' },
      ],
    },
    {
      name: 'block.move across slots',
      mutations: [
        { op: 'block.move', slideId: 'content-rule', blockId: 'list', slot: 'left', after: 'h' },
      ],
    },
    {
      name: 'block.set',
      mutations: [
        { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: 22 },
      ],
    },
    {
      name: 'block.set nested',
      mutations: [
        {
          op: 'block.set',
          slideId: 'content-rule',
          blockId: 'list',
          path: '/items/3/text',
          value: 'How GT ships',
        },
      ],
    },
    {
      /* a field under an object the block does not carry yet creates the object (the font rows'
         agent write, docs/PRODUCT.md 4.2); the inverse removes it whole */
      name: 'block.set creates the parent object',
      mutations: [
        {
          op: 'block.set',
          slideId: 'content-rule',
          blockId: 'h',
          path: '/typography/family',
          value: 'roboto',
        },
      ],
    },
    {
      name: 'text.replace',
      mutations: [
        {
          op: 'text.replace',
          slideId: 'content-rule',
          blockId: 'h',
          path: '/text',
          range: [4, 11],
          text: 'copy',
        },
      ],
    },
    {
      name: 'text.replace with an escape',
      mutations: [
        {
          op: 'text.replace',
          slideId: 'content-rule',
          blockId: 'p1',
          path: '/text',
          range: [0, 0],
          text: '* ',
        },
      ],
    },
    {
      name: 'section.set',
      mutations: [
        {
          op: 'section.set',
          sections: [
            {
              id: 'brand',
              name: 'Brand',
              slideIds: [
                'opener-brand',
                'title',
                'thesis',
                'mood-earth',
                'content-rule',
                'the-production-site',
              ],
            },
            { id: 'website', name: 'Website', slideIds: [] },
            {
              id: 'prototemplate-and-glyphfield',
              name: 'Prototemplate and Glyphfield',
              slideIds: ['opener-prototemplate'],
            },
          ],
        },
      ],
    },
    {
      name: 'asset.set existing',
      mutations: [
        {
          op: 'asset.set',
          asset: {
            id: 'site-home',
            role: 'capture',
            alt: 'Home',
            twins: { neutral: 'assets/site-home.png' },
            size: [10, 10],
            scale: 1,
            source: { kind: 'file' },
            inline: 'native',
          },
        },
      ],
    },
    {
      name: 'asset.set new',
      mutations: [
        {
          op: 'asset.set',
          asset: {
            id: 'new-one',
            role: 'other',
            alt: 'New',
            twins: { neutral: 'assets/new.png' },
            size: [10, 10],
            scale: 1,
            source: { kind: 'file' },
            inline: 'native',
          },
        },
      ],
    },
    {
      name: 'deck.set',
      mutations: [{ op: 'deck.set', path: '/defaults', value: { notes: 'Speak slowly.' } }],
    },
    {
      name: 'a mixed list',
      mutations: [
        {
          op: 'slide.insert',
          sectionId: 'brand',
          after: 'thesis',
          slide: { schemaVersion: 1, id: 'why', kind: 'statement', big: 'Why' },
        },
        { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: 20 },
        { op: 'slide.move', slideId: 'why', sectionId: 'website' },
        { op: 'block.remove', slideId: 'content-rule', blockId: 'p1' },
      ],
    },
  ];

  it.each(cases)('$name applies and its inverse restores the document', ({ mutations }) => {
    const before = base();
    const forward = applyWrite(before, write(mutations), { now: NOW });
    if (!forward.ok) throw new Error(forward.message);
    expect(stable(forward.document)).not.toEqual(stable(before));
    const back = applyWrite(forward.document, write(forward.inverse, 413), { now: NOW });
    if (!back.ok) throw new Error(back.message);
    expect(stable(back.document)).toEqual(stable(before));
    expect(back.document.deck.revision).toBe(414);
  });

  it('asset.remove inverts to asset.set', () => {
    const before = workedDocument();
    // Remove the capture's only reference first so the deck stays valid.
    const prepared = applyWrite(
      before,
      write([{ op: 'block.remove', slideId: 'the-production-site', blockId: 'shot' }]),
      { now: NOW },
    );
    if (!prepared.ok) throw new Error(prepared.message);
    const forward = applyWrite(
      prepared.document,
      write([{ op: 'asset.remove', assetId: 'site-home' }], 413),
      { now: NOW },
    );
    if (!forward.ok) throw new Error(forward.message);
    expect(forward.document.deck.assets['site-home']).toBeUndefined();
    expect(forward.inverse[0]?.op).toBe('asset.set');
    const back = applyWrite(forward.document, write(forward.inverse, 414), { now: NOW });
    if (!back.ok) throw new Error(back.message);
    expect(back.document.deck.assets['site-home']).toEqual(
      prepared.document.deck.assets['site-home'],
    );
  });

  it('version.restore expands to the diff and inverts exactly', () => {
    const v1 = base();
    const edited = applyWrite(
      v1,
      write([
        { op: 'slide.remove', slideId: 'thesis' },
        { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: 20 },
        { op: 'deck.set', path: '/title', value: 'Edited' },
      ]),
      { now: NOW },
    );
    if (!edited.ok) throw new Error(edited.message);
    const restored = applyWrite(edited.document, write([{ op: 'version.restore', n: 1 }], 413), {
      now: NOW,
      resolveVersion: (n) => (n === 1 ? v1 : undefined),
    });
    if (!restored.ok) throw new Error(restored.message);
    expect(stable(restored.document)).toEqual(stable(v1));
    const undone = applyWrite(restored.document, write(restored.inverse, 414), { now: NOW });
    if (!undone.ok) throw new Error(undone.message);
    expect(stable(undone.document)).toEqual(stable(edited.document));
  });

  it('rejects a restore of an unknown version', () => {
    const result = applyWrite(workedDocument(), write([{ op: 'version.restore', n: 7 }]));
    expect(result.ok).toBe(false);
    if (result.ok || result.code !== 'invalid') throw new Error('expected invalid');
    expect(result.message).toMatch(/No version 7/);
  });
});

describe('applyMutations', () => {
  it('does not mutate its input and refuses forbidden paths', () => {
    const document = workedDocument();
    const { document: next } = applyMutations(document, [
      { op: 'deck.set', path: '/title', value: 'X' },
    ]);
    expect(next.deck.title).toBe('X');
    expect(document.deck.title).toBe('GT brand deck');
    expect(() =>
      applyMutations(document, [
        { op: 'slide.set', slideId: 'thesis', path: '/id', value: 'other' },
      ]),
    ).toThrow(TypeError);
    expect(() =>
      applyMutations(document, [{ op: 'deck.set', path: '/revision', value: 1 }]),
    ).toThrow(TypeError);
    expect(() =>
      applyMutations(document, [
        { op: 'block.set', slideId: 'thesis', blockId: 'x', path: '/a', value: 1 },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      applyMutations(document, [
        {
          op: 'block.insert',
          slideId: 'content-rule',
          slot: 'main',
          block: { id: 'z', type: 'paragraph', text: 'x' },
        },
      ]),
    ).toThrow(RangeError);
  });
});

describe('the gslides-parity fields (SPEC 7.2)', () => {
  it('writes skip and template through slide.set and clears them with an absent value', () => {
    const document = base();
    const first = applyWrite(
      document,
      write([
        { op: 'slide.set', slideId: 'content-rule', path: '/skip', value: true },
        { op: 'slide.set', slideId: 'content-rule', path: '/template', value: 'plain' },
      ]),
      { now: NOW },
    );
    if (!first.ok) throw new Error(first.message);
    expect(first.document.slides['content-rule']).toMatchObject({ skip: true, template: 'plain' });
    expect(first.inverse).toEqual([
      { op: 'slide.set', slideId: 'content-rule', path: '/template' },
      { op: 'slide.set', slideId: 'content-rule', path: '/skip' },
    ]);
    const second = applyWrite(
      first.document,
      write([{ op: 'slide.set', slideId: 'content-rule', path: '/skip' }], 413),
      { now: NOW },
    );
    if (!second.ok) throw new Error(second.message);
    expect(second.document.slides['content-rule']).not.toHaveProperty('skip');
    // skip takes only true and template only a layout id
    const bad = applyWrite(
      document,
      write([{ op: 'slide.set', slideId: 'content-rule', path: '/skip', value: false }]),
    );
    expect(bad.ok).toBe(false);
    const badTemplate = applyWrite(
      document,
      write([{ op: 'slide.set', slideId: 'content-rule', path: '/template', value: 'nope' }]),
    );
    expect(badTemplate.ok).toBe(false);
  });

  it('writes /defaults/appearance and /defaults/counter through deck.set and refuses /trashedAt', () => {
    const document = base();
    const result = applyWrite(
      document,
      write([
        { op: 'deck.set', path: '/defaults', value: {} },
        { op: 'deck.set', path: '/defaults/appearance', value: 'light' },
        { op: 'deck.set', path: '/defaults/counter', value: 'skip-title' },
      ]),
      { now: NOW },
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.document.deck.defaults).toEqual({ appearance: 'light', counter: 'skip-title' });
    const trashed = applyWrite(
      document,
      write([{ op: 'deck.set', path: '/trashedAt', value: NOW }]),
    );
    expect(trashed.ok).toBe(false);
    if (trashed.ok || trashed.code !== 'invalid') throw new Error('expected invalid');
    expect(trashed.message).toMatch(/deck\.trash/);
    const badAppearance = applyWrite(
      document,
      write([
        { op: 'deck.set', path: '/defaults', value: {} },
        { op: 'deck.set', path: '/defaults/appearance', value: 'sepia' },
      ]),
    );
    expect(badAppearance.ok).toBe(false);
  });

  it('creates /defaults when a pointer under it is written on a deck without the object, and the inverse removes the object', () => {
    // Every deck written before the parity round has no `defaults`; the Themes panel's first
    // write and `turboslide deck set /defaults/appearance light` land on such a deck.
    const before = base();
    expect(before.deck.defaults).toBeUndefined();
    const forward = applyWrite(
      before,
      write([{ op: 'deck.set', path: '/defaults/appearance', value: 'light' }]),
      { now: NOW },
    );
    if (!forward.ok) throw new Error(forward.message);
    expect(forward.document.deck.defaults).toEqual({ appearance: 'light' });
    expect(forward.inverse).toEqual([{ op: 'deck.set', path: '/defaults' }]);
    const back = applyWrite(forward.document, write(forward.inverse, 413), { now: NOW });
    if (!back.ok) throw new Error(back.message);
    expect(stable(back.document)).toEqual(stable(before));
    // once the object exists a write under it is an ordinary set with a field level inverse
    const second = applyWrite(
      forward.document,
      write([{ op: 'deck.set', path: '/defaults/counter', value: 'off' }], 413),
      { now: NOW },
    );
    if (!second.ok) throw new Error(second.message);
    expect(second.document.deck.defaults).toEqual({ appearance: 'light', counter: 'off' });
    expect(second.inverse).toEqual([{ op: 'deck.set', path: '/defaults/counter' }]);
    // removing a field under a missing object changes nothing and does not create it
    const removeMissing = applyWrite(
      before,
      write([{ op: 'deck.set', path: '/defaults/counter' }]),
      { now: NOW },
    );
    if (!removeMissing.ok) throw new Error(removeMissing.message);
    expect(removeMissing.document.deck.defaults).toBeUndefined();
  });

  it('keeps text.replace as it was: markup offsets and a whole string inverse (SPEC-3 0.4)', () => {
    // the recorded form of round one and two: the inverse covers the whole new string in markup
    // offsets, which the replay paths apply through this reducer
    const document = base();
    const result = applyWrite(
      document,
      write([
        {
          op: 'text.replace',
          slideId: 'content-rule',
          blockId: 'h',
          path: '/text',
          range: [4, 11],
          text: '*copy*',
        },
      ]),
      { now: NOW },
    );
    if (!result.ok) throw new Error(result.message);
    const heading = result.document.slides['content-rule'];
    expect(heading?.kind === 'content' && heading.slots.left?.[0]).toMatchObject({
      text: 'The *copy* rule',
    });
    expect(result.inverse).toEqual([
      {
        op: 'text.replace',
        slideId: 'content-rule',
        blockId: 'h',
        path: '/text',
        range: [0, 'The *copy* rule'.length],
        text: 'The content rule',
      },
    ]);
  });

  it('answers every recorded round one and two text.replace record as the reducer of 61b16e4 did (SPEC-3 0.4, 16.6)', () => {
    // __fixtures__/text-replace-records.json: the editor's 400 ms bursts in markup offsets and
    // their answers, recorded by the round two reducer's case (byte for byte this one, checked
    // against `git show 61b16e4:packages/schema/src/reduce.ts`); the two new ops of round three
    // leave every one of them, and every stored inverse, replayable
    const fixture = JSON.parse(
      readFileSync(new URL('./__fixtures__/text-replace-records.json', import.meta.url), 'utf8'),
    ) as {
      records: {
        name: string;
        slideId: string;
        blockId: string;
        path: string;
        before: string;
        range: [number, number];
        text: string;
        next: string;
        inverse: Mutation[];
      }[];
    };
    expect(fixture.records.length).toBeGreaterThanOrEqual(8);
    for (const record of fixture.records) {
      const document = base();
      const textOf = (doc: DeckDocument): string => {
        const slide = doc.slides[record.slideId];
        if (slide?.kind !== 'content') throw new Error(record.name);
        for (const list of Object.values(slide.slots)) {
          const block = list.find((row) => row.id === record.blockId);
          if (block !== undefined && 'text' in block) return block.text as string;
        }
        throw new Error(record.name);
      };
      expect(textOf(document), record.name).toBe(record.before);
      const inverse = applyMutation(document, {
        op: 'text.replace',
        slideId: record.slideId,
        blockId: record.blockId,
        path: record.path,
        range: record.range,
        text: record.text,
      });
      expect(textOf(document), record.name).toBe(record.next);
      expect(inverse, record.name).toEqual(record.inverse);
      for (const back of inverse) applyMutation(document, back);
      expect(textOf(document), record.name).toBe(record.before);
    }
  });

  it('accepts a paragraph break in text.replace on a paragraph and refuses it on a heading', () => {
    const document = base();
    const ok = applyWrite(
      document,
      write([
        {
          op: 'text.replace',
          slideId: 'content-rule',
          blockId: 'p1',
          path: '/text',
          range: [0, 0],
          text: 'First paragraph.\n',
        },
      ]),
      { now: NOW },
    );
    if (!ok.ok) throw new Error(ok.message);
    const p1 = ok.document.slides['content-rule'];
    expect(p1?.kind === 'content' && p1.slots.left?.[1]).toMatchObject({
      text: expect.stringMatching(/^First paragraph\.\n/),
    });
    const refused = applyWrite(
      document,
      write([
        {
          op: 'text.replace',
          slideId: 'content-rule',
          blockId: 'h',
          path: '/text',
          range: [0, 0],
          text: 'Two\nlines ',
        },
      ]),
    );
    expect(refused.ok).toBe(false);
  });
});

describe('the text mutations and their inverses (the return round, docs/RETURN.md 2.14 items 2 and 5)', () => {
  const p1 = { slideId: 'content-rule', blockId: 'p1', path: '/text' } as const;
  const MARKED =
    'One [italic]{i} word and a *bold* [red]{c:red} one, [lit]{h:amber} [link](https://x.y).';

  function marked(): DeckDocument {
    const document = base();
    const result = applyWrite(document, write([{ op: 'block.set', ...p1, value: MARKED }]), {
      now: NOW,
    });
    if (!result.ok) throw new Error(result.message);
    return result.document;
  }
  function textOf(document: DeckDocument): string {
    const slide = document.slides['content-rule'];
    const block = slide?.kind === 'content' ? slide.slots.left?.[1] : undefined;
    return block?.type === 'paragraph' ? block.text : '';
  }
  /** Applies a write, then its inverse as a write of its own, and returns both documents. */
  function roundTrip(document: DeckDocument, mutations: Mutation[]) {
    const forward = applyWrite(document, write(mutations, document.deck.revision), { now: NOW });
    if (!forward.ok) throw new Error(forward.message);
    const back = applyWrite(
      forward.document,
      write(forward.inverse, forward.document.deck.revision),
      { now: NOW },
    );
    if (!back.ok) throw new Error(back.message);
    return { forward: forward.document, back: back.document, inverse: forward.inverse };
  }

  it('Clear formatting: one text.mark clearing every mark, colour, highlight and bold run keeps the link, and its inverse restores each run', () => {
    const { forward, back, inverse } = roundTrip(marked(), [
      {
        op: 'text.mark',
        ...p1,
        range: [0, 45],
        edit: { kind: 'marks', clear: ['i', 'u', 's', 'sup', 'sub', 'color', 'hl', 'b'] },
      },
    ]);
    expect(textOf(forward)).toBe('One italic word and a bold red one, lit [link](https://x.y).');
    expect(inverse.every((m) => m.op === 'text.mark')).toBe(true);
    expect(textOf(back)).toBe(MARKED);
  });

  it('a mark toggled on a word alone: set marks the word, the inverse clears it, and sup clears sub', () => {
    const on = roundTrip(marked(), [
      { op: 'text.mark', ...p1, range: [4, 10], edit: { kind: 'marks', set: { sup: true } } },
    ]);
    expect(textOf(on.forward)).toBe(MARKED.replace('[italic]{i}', '[italic]{i sup}'));
    expect(on.inverse).toEqual([
      { op: 'text.mark', ...p1, range: [4, 10], edit: { kind: 'marks', clear: ['sup'] } },
    ]);
    expect(textOf(on.back)).toBe(MARKED);
    const swapped = roundTrip(on.forward, [
      {
        op: 'text.mark',
        ...p1,
        range: [4, 10],
        edit: { kind: 'marks', set: { sub: true }, clear: ['sup'] },
      },
    ]);
    expect(textOf(swapped.forward)).toBe(MARKED.replace('[italic]{i}', '[italic]{i sub}'));
    expect(textOf(swapped.back)).toBe(textOf(on.forward));
  });

  it('a colour and a highlight set and cleared over a range come back exactly', () => {
    const coloured = roundTrip(marked(), [
      {
        op: 'text.mark',
        ...p1,
        range: [0, 3],
        edit: { kind: 'marks', set: { color: 'blue', hl: 'green' } },
      },
    ]);
    expect(textOf(coloured.forward).startsWith('[One]{c:blue h:green}')).toBe(true);
    expect(textOf(coloured.back)).toBe(MARKED);
    const cleared = roundTrip(marked(), [
      { op: 'text.mark', ...p1, range: [27, 30], edit: { kind: 'marks', clear: ['color'] } },
    ]);
    expect(textOf(cleared.forward)).toBe(MARKED.replace('[red]{c:red}', 'red'));
    expect(textOf(cleared.back)).toBe(MARKED);
  });

  it('a case change over a word and over the whole Text keeps the marks, and its inverse restores the letters', () => {
    const word = roundTrip(marked(), [
      { op: 'text.mark', ...p1, range: [4, 10], edit: { kind: 'case', mode: 'upper' } },
    ]);
    expect(textOf(word.forward)).toBe(MARKED.replace('[italic]{i}', '[ITALIC]{i}'));
    expect(textOf(word.back)).toBe(MARKED);
    const whole = roundTrip(marked(), [
      { op: 'text.mark', ...p1, range: [0, 45], edit: { kind: 'case', mode: 'title' } },
    ]);
    expect(textOf(whole.forward)).toBe(
      'One [Italic]{i} Word And A *Bold* [Red]{c:red} One, [Lit]{h:amber} [Link](https://x.y).',
    );
    expect(textOf(whole.back)).toBe(MARKED);
    const lower = roundTrip(whole.forward, [
      { op: 'text.mark', ...p1, range: [0, 45], edit: { kind: 'case', mode: 'lower' } },
    ]);
    expect(textOf(lower.forward)).toBe(
      'one [italic]{i} word and a *bold* [red]{c:red} one, [lit]{h:amber} [link](https://x.y).',
    );
    expect(textOf(lower.back)).toBe(textOf(whole.forward));
  });

  it('a splice through a marked run and a splice with flags both come back with the marks they removed', () => {
    const through = roundTrip(marked(), [
      { op: 'text.splice', ...p1, at: 2, remove: 6, insert: 'ce ' },
    ]);
    expect(textOf(through.forward)).toBe(MARKED.replace('One [italic]{i}', 'Once [ic]{i}'));
    expect(textOf(through.back)).toBe(MARKED);
    const flagged = roundTrip(marked(), [
      { op: 'text.splice', ...p1, at: 45, remove: 0, insert: 'Done', flags: { b: true } },
    ]);
    expect(textOf(flagged.forward).endsWith('[link](https://x.y).*Done*')).toBe(true);
    expect(textOf(flagged.back)).toBe(MARKED);
  });

  it('text.replace of the whole Text and its inverse', () => {
    const next = 'Replaced [wholly]{u}.';
    const { forward, back, inverse } = roundTrip(marked(), [
      { op: 'text.replace', ...p1, range: [0, MARKED.length], text: next },
    ]);
    expect(textOf(forward)).toBe(next);
    expect(inverse).toEqual([{ op: 'text.replace', ...p1, range: [0, next.length], text: MARKED }]);
    expect(textOf(back)).toBe(MARKED);
  });

  it('refuses a range past the end and a mark on a field that is not a Text, and leaves the input untouched', () => {
    const document = marked();
    const past = applyWrite(
      document,
      write(
        [{ op: 'text.mark', ...p1, range: [0, 99], edit: { kind: 'marks', set: { i: true } } }],
        document.deck.revision,
      ),
      { now: NOW },
    );
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.code).toBe('invalid');
    const notText = applyWrite(
      document,
      write(
        [
          {
            op: 'text.mark',
            slideId: 'content-rule',
            blockId: 'p1',
            path: '/typography',
            range: [0, 1],
            edit: { kind: 'marks', set: { i: true } },
          },
        ],
        document.deck.revision,
      ),
      { now: NOW },
    );
    expect(notText.ok).toBe(false);
    expect(textOf(document)).toBe(MARKED);
  });
});

describe('the multiplayer text ops (gslides-parity SPEC-3 3.1)', () => {
  const p1 = { slideId: 'content-rule', blockId: 'p1', path: '/text' } as const;
  const MARKED = 'Every *post* states [what](https://x.y) was [built]{i c:red}.';

  /** The normalized worked deck with p1 carrying marks, a display run and a link. */
  function marked(): DeckDocument {
    const document = base();
    const result = applyWrite(document, write([{ op: 'block.set', ...p1, value: MARKED }]), {
      now: NOW,
    });
    if (!result.ok) throw new Error(result.message);
    return result.document;
  }

  function textOf(document: DeckDocument): string {
    const slide = document.slides['content-rule'];
    const block = slide?.kind === 'content' ? slide.slots.left?.[1] : undefined;
    return block?.type === 'paragraph' ? block.text : '';
  }

  it('applies a splice in plain offsets and stores the canonical form', () => {
    const result = applyWrite(
      marked(),
      write([{ op: 'text.splice', ...p1, at: 6, remove: 4, insert: 'note' }], 413),
      { now: NOW },
    );
    if (!result.ok) throw new Error(result.message);
    expect(textOf(result.document)).toBe(
      'Every *note* states [what](https://x.y) was [built]{i c:red}.',
    );
    expect(result.inverse).toEqual([
      { op: 'text.splice', ...p1, at: 6, remove: 4, insert: 'post' },
    ]);
  });

  it('applies a mark and a case change in plain offsets', () => {
    const marks = applyWrite(
      marked(),
      write(
        [
          {
            op: 'text.mark',
            ...p1,
            range: [0, 5],
            edit: { kind: 'marks', set: { u: true } },
          },
        ],
        413,
      ),
      { now: NOW },
    );
    if (!marks.ok) throw new Error(marks.message);
    expect(textOf(marks.document)).toBe(
      '[Every]{u} *post* states [what](https://x.y) was [built]{i c:red}.',
    );
    expect(marks.inverse).toEqual([
      { op: 'text.mark', ...p1, range: [0, 5], edit: { kind: 'marks', clear: ['u'] } },
    ]);
    const upper = applyWrite(
      marked(),
      write(
        [{ op: 'text.mark', ...p1, range: [6, 10], edit: { kind: 'case', mode: 'upper' } }],
        413,
      ),
      { now: NOW },
    );
    if (!upper.ok) throw new Error(upper.message);
    expect(textOf(upper.document)).toBe(
      'Every *POST* states [what](https://x.y) was [built]{i c:red}.',
    );
    expect(upper.inverse[0]).toEqual({
      op: 'text.splice',
      ...p1,
      at: 6,
      remove: 4,
      insert: 'post',
    });
  });

  const cases: { name: string; mutations: Mutation[] }[] = [
    {
      name: 'a typed character',
      mutations: [{ op: 'text.splice', ...p1, at: 5, remove: 0, insert: ',' }],
    },
    {
      name: 'typing at the end of a display run',
      mutations: [{ op: 'text.splice', ...p1, at: 10, remove: 0, insert: 's' }],
    },
    {
      name: 'a backspace inside a link',
      mutations: [{ op: 'text.splice', ...p1, at: 21, remove: 1, insert: '' }],
    },
    {
      name: 'a deletion of the display run',
      mutations: [{ op: 'text.splice', ...p1, at: 6, remove: 4, insert: '' }],
    },
    {
      name: 'a deletion across the display run and the link',
      mutations: [{ op: 'text.splice', ...p1, at: 3, remove: 20, insert: '' }],
    },
    {
      name: 'a deletion of the marked word with the period',
      mutations: [{ op: 'text.splice', ...p1, at: 27, remove: 6, insert: '' }],
    },
    {
      name: 'a replacement over mixed runs',
      mutations: [{ op: 'text.splice', ...p1, at: 6, remove: 12, insert: 'x' }],
    },
    {
      name: 'a paragraph break typed and the break removed',
      mutations: [
        { op: 'text.splice', ...p1, at: 12, remove: 0, insert: '\n' },
        { op: 'text.splice', ...p1, at: 12, remove: 1, insert: '' },
        { op: 'text.splice', ...p1, at: 19, remove: 0, insert: '\nNext.' },
      ],
    },
    {
      name: 'marks set over mixed runs',
      mutations: [
        {
          op: 'text.mark',
          ...p1,
          range: [3, 24],
          edit: { kind: 'marks', set: { s: true, hl: 'amber' } },
        },
      ],
    },
    {
      name: 'marks cleared over mixed runs',
      mutations: [
        {
          op: 'text.mark',
          ...p1,
          range: [0, 33],
          edit: { kind: 'marks', clear: ['b', 'link', 'color'] },
        },
      ],
    },
    {
      name: 'a link set and sub over sup',
      mutations: [
        {
          op: 'text.mark',
          ...p1,
          range: [0, 5],
          edit: { kind: 'marks', set: { link: 'https://gt.example', sup: true } },
        },
        { op: 'text.mark', ...p1, range: [2, 4], edit: { kind: 'marks', set: { sub: true } } },
      ],
    },
    {
      name: 'a title case over mixed runs',
      mutations: [
        { op: 'text.mark', ...p1, range: [0, 33], edit: { kind: 'case', mode: 'title' } },
      ],
    },
    {
      name: 'an upper case then a splice inside it',
      mutations: [
        { op: 'text.mark', ...p1, range: [6, 10], edit: { kind: 'case', mode: 'upper' } },
        { op: 'text.splice', ...p1, at: 8, remove: 1, insert: 'ab' },
      ],
    },
  ];

  it.each(cases)(
    '$name applies, stores a canonical Text and its inverse restores the document exactly',
    ({ mutations }) => {
      const before = marked();
      const forward = applyWrite(before, write(mutations, 413), { now: NOW });
      if (!forward.ok) throw new Error(forward.message);
      expect(stable(forward.document)).not.toEqual(stable(before));
      expect(canonicalText(textOf(forward.document))).toBe(textOf(forward.document));
      const back = applyWrite(forward.document, write(forward.inverse, 414), { now: NOW });
      if (!back.ok) throw new Error(back.message);
      expect(textOf(back.document)).toBe(MARKED);
      expect(stable(back.document)).toEqual(stable(before));
      // the inverse is a splice or a mark, never a whole string, so undo transforms (SPEC-3 3.5)
      for (const inverse of forward.inverse)
        expect(['text.splice', 'text.mark']).toContain(inverse.op);
    },
  );

  it('refuses a splice or a mark outside the text, on a non string pointer and a break on a heading', () => {
    const document = marked();
    const outside = applyWrite(
      document,
      write([{ op: 'text.splice', ...p1, at: 100, remove: 1, insert: '' }], 413),
    );
    expect(outside.ok).toBe(false);
    if (outside.ok || outside.code !== 'invalid') throw new Error('expected invalid');
    expect(outside.message).toMatch(/outside a text/);
    const notText = applyWrite(
      document,
      write(
        [
          {
            op: 'text.splice',
            slideId: 'content-rule',
            blockId: 'p1',
            path: '/measure',
            at: 0,
            remove: 0,
            insert: 'x',
          },
        ],
        413,
      ),
    );
    expect(notText.ok).toBe(false);
    const badRange = applyWrite(
      document,
      write(
        [{ op: 'text.mark', ...p1, range: [5, 3], edit: { kind: 'marks', set: { i: true } } }],
        413,
      ),
    );
    expect(badRange.ok).toBe(false);
    const heading = applyWrite(
      document,
      write(
        [
          {
            op: 'text.splice',
            slideId: 'content-rule',
            blockId: 'h',
            path: '/text',
            at: 3,
            remove: 0,
            insert: '\n',
          },
        ],
        413,
      ),
    );
    expect(heading.ok).toBe(false);
    const paragraph = applyWrite(
      document,
      write([{ op: 'text.splice', ...p1, at: 5, remove: 0, insert: '\n' }], 413),
      { now: NOW },
    );
    expect(paragraph.ok).toBe(true);
  });

  it('refuses a link outside the allowed schemes after the write (SPEC-3 8.4)', () => {
    const refused = applyWrite(
      marked(),
      write(
        [
          {
            op: 'text.mark',
            ...p1,
            range: [0, 5],
            edit: { kind: 'marks', set: { link: 'javascript:alert(1)' } },
          },
        ],
        413,
      ),
    );
    expect(refused.ok).toBe(false);
    if (refused.ok || refused.code !== 'invalid') throw new Error('expected invalid');
    expect(refused.message).toMatch(/javascript/);
    const blockLink = applyWrite(
      marked(),
      write(
        [
          {
            op: 'block.set',
            slideId: 'content-rule',
            blockId: 'list',
            path: '/link',
            value: 'data:text/html,x',
          },
        ],
        413,
      ),
    );
    expect(blockLink.ok).toBe(false);
  });
});

describe('the undo of a text session against a document a collaborator moved (VERIFICATION.md C3-F8)', () => {
  // The shape of realtime.spec.ts "undo in A never reverts B's later change" (SPEC-3 3.5, 3.6):
  // A opens a session on p1 and types U at the start; B's VV at the start lands; A undoes. The
  // inverse the reducer answered at A's commit (remove one character at 0) is moved past B's
  // splice the way the controller's stepMutations moves it (room-client transformSince over the
  // entries that landed since, transformAgainst here) and applied to the document as it stands
  // when the undo runs: B's change stays and only A's character leaves.
  const p1 = { slideId: 'content-rule', blockId: 'p1', path: '/text' } as const;

  function textOf(document: DeckDocument): string {
    const slide = document.slides['content-rule'];
    const block = slide?.kind === 'content' ? slide.slots.left?.[1] : undefined;
    return block?.type === 'paragraph' ? block.text : '';
  }

  it('moves the commit’s inverse past the collaborator’s later insert at the same offset', () => {
    const before = textOf(base());
    // A commits: the session's first burst, one character at the start
    const a = applyMutations(base(), [{ op: 'text.splice', ...p1, at: 0, remove: 0, insert: 'U' }]);
    expect(textOf(a.document)).toBe(`U${before}`);
    expect(a.inverse).toEqual([{ op: 'text.splice', ...p1, at: 0, remove: 1, insert: '' }]);
    // B's change lands after A's commit, at the same offset
    const bSplice: Mutation = { op: 'text.splice', ...p1, at: 0, remove: 0, insert: 'VV' };
    const b = applyMutations(a.document, [bSplice]);
    expect(textOf(b.document)).toBe(`VVU${before}`);
    // A undoes: the inverse rebased past what landed since, applied to the current document
    const undo = a.inverse.flatMap((inverse) => transformAgainst(inverse, [bSplice]));
    expect(undo).toEqual([{ op: 'text.splice', ...p1, at: 2, remove: 1, insert: '' }]);
    const undone = applyMutations(b.document, undo);
    expect(textOf(undone.document)).toBe(`VV${before}`);
    // the untransformed inverse is the finding's shape: it would take one of B's characters
    const stale = applyMutations(b.document, a.inverse);
    expect(textOf(stale.document)).toBe(`VU${before}`);
  });

  it('keeps the collaborator’s change whichever side undoes, and inside the run as well', () => {
    const before = textOf(base());
    const a = applyMutations(base(), [
      { op: 'text.splice', ...p1, at: 6, remove: 4, insert: 'note' },
    ]);
    expect(textOf(a.document)).toBe(before.replace('post', 'note'));
    const bSplice: Mutation = { op: 'text.splice', ...p1, at: 0, remove: 0, insert: 'VV' };
    const b = applyMutations(a.document, [bSplice]);
    // A undoes past B's insert before the replaced word: the word comes back and VV stays
    const undoA = a.inverse.flatMap((inverse) => transformAgainst(inverse, [bSplice]));
    expect(textOf(applyMutations(b.document, undoA).document)).toBe(`VV${before}`);
    // B undoes its own insert with nothing landed since: A's replacement stays
    const undoB = applyMutations(b.document, b.inverse);
    expect(textOf(undoB.document)).toBe(before.replace('post', 'note'));
  });
});

describe('the slide fields as text runs (the sync round, docs/SYNC.md 3.4)', () => {
  const heading = { slideId: 'title', blockId: 'heading', path: '/heading' } as const;
  const lead = { slideId: 'title', blockId: 'lead', path: '/lead' } as const;
  const big = { slideId: 'thesis', blockId: 'big', path: '/big' } as const;

  it("splices, marks and replaces the heading, the lead and the big text like a block's Text, with splice inverses", () => {
    const document = base();
    const spliced = applyWrite(
      document,
      write([{ op: 'text.splice', ...heading, at: 7, remove: 0, insert: ' Global' }]),
      { now: NOW },
    );
    if (!spliced.ok) throw new Error(spliced.message);
    expect(spliced.document.slides['title']).toMatchObject({
      heading: 'General Global Translation',
    });
    expect(spliced.inverse[0]).toEqual({
      op: 'text.splice',
      ...heading,
      at: 7,
      remove: 7,
      insert: '',
    });
    // the lead is multiline: a paragraph break is a character of it
    const leadWrite = applyWrite(
      document,
      write([{ op: 'text.splice', ...lead, at: 4, remove: 0, insert: '\nNew paragraph.' }]),
      { now: NOW },
    );
    if (!leadWrite.ok) throw new Error(leadWrite.message);
    expect(
      (leadWrite.document.slides['title'] as { lead: string }).lead.startsWith(
        'This\nNew paragraph. deck',
      ),
    ).toBe(true);
    const marked = applyWrite(
      document,
      write([
        { op: 'text.mark', ...big, range: [0, 5], edit: { kind: 'marks', set: { i: true } } },
      ]),
      { now: NOW },
    );
    if (!marked.ok) throw new Error(marked.message);
    expect((marked.document.slides['thesis'] as { big: string }).big).toBe(
      '[Every]{i} product in every language',
    );
    const replaced = applyWrite(
      document,
      write([{ op: 'text.replace', ...big, range: [0, 5], text: 'Each' }]),
      { now: NOW },
    );
    if (!replaced.ok) throw new Error(replaced.message);
    expect((replaced.document.slides['thesis'] as { big: string }).big).toBe(
      'Each product in every language',
    );
    // the whole round trip through the inverse leaves the document as it was
    const back = applyMutations(spliced.document, spliced.inverse).document;
    expect(stable(back)).toEqual(stable(document));
  });

  it('refuses a field addressed at another pointer, a break in the heading, and a field name on a slide without it', () => {
    const document = base();
    const wrongPath = applyWrite(
      document,
      write([{ op: 'text.splice', ...heading, path: '/text', at: 0, remove: 0, insert: 'x' }]),
    );
    expect(wrongPath.ok).toBe(false);
    if (wrongPath.ok || wrongPath.code !== 'invalid') throw new Error('expected invalid');
    expect(wrongPath.message).toMatch(/addressed at \/heading, got \/text/);
    const broken = applyWrite(
      document,
      write([{ op: 'text.splice', ...heading, at: 3, remove: 0, insert: '\n' }]),
    );
    expect(broken.ok).toBe(false);
    // `big` on a title slide is a block id there, and the slide has no such block
    const noField = applyWrite(
      document,
      write([
        {
          op: 'text.splice',
          slideId: 'title',
          blockId: 'big',
          path: '/big',
          at: 0,
          remove: 0,
          insert: 'x',
        },
      ]),
    );
    expect(noField.ok).toBe(false);
    if (noField.ok || noField.code !== 'invalid') throw new Error('expected invalid');
    expect(noField.message).toMatch(/No block "big"/);
    // nothing of the input changed
    expect(stable(document)).toEqual(stable(base()));
  });
});
