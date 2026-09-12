import { describe, expect, it } from 'vitest';
import type { DeckDocument } from './deck.ts';
import { workedDocument } from './fixtures.ts';
import type { Mutation, Write } from './mutations.ts';
import { applyMutations, applyWrite } from './reduce.ts';
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
