import { describe, expect, it } from 'vitest';
import type { DeckDocument } from './deck.ts';
import { describeMutation, diffDecks } from './diff.ts';
import { workedDocument } from './fixtures.ts';
import { applyMutations } from './reduce.ts';
import { validateDocument } from './validate.ts';

function edit(change: (document: DeckDocument) => void): DeckDocument {
  const document = workedDocument();
  change(document);
  return document;
}

function normalized(document: DeckDocument): DeckDocument {
  const result = validateDocument(document);
  if (!result.ok || result.deck === null)
    throw new Error(result.issues.map((row) => row.message).join('; '));
  return { deck: result.deck, slides: result.slides };
}

const scenarios: { name: string; b: DeckDocument }[] = [
  { name: 'identical documents', b: workedDocument() },
  {
    name: 'a manifest title and defaults',
    b: edit((d) => {
      d.deck.title = 'Renamed';
      d.deck.defaults = { notes: 'x' };
    }),
  },
  {
    name: 'assets added, removed and changed',
    b: edit((d) => {
      delete d.deck.assets['mood-earth'];
      const mood = d.slides['mood-earth'];
      if (mood?.kind === 'mood') mood.picture.asset = 'liquid-metal-diamond';
      const site = d.deck.assets['site-home'];
      if (site !== undefined) site.alt = 'Changed';
      d.deck.assets['extra'] = {
        id: 'extra',
        role: 'other',
        alt: 'Extra',
        twins: { neutral: 'assets/extra.png' },
        size: [1, 1],
        scale: 1,
        source: { kind: 'file' },
        inline: 'native',
      };
    }),
  },
  {
    name: 'a slide removed',
    b: edit((d) => {
      delete d.slides.thesis;
      d.deck.sections[0]!.slideIds = d.deck.sections[0]!.slideIds.filter((id) => id !== 'thesis');
    }),
  },
  {
    name: 'slides inserted at the start, middle and end of sections',
    b: edit((d) => {
      d.slides.alpha = { schemaVersion: 1, id: 'alpha', kind: 'statement', big: 'Alpha' };
      d.slides.mid = { schemaVersion: 1, id: 'mid', kind: 'statement', big: 'Mid' };
      d.slides.omega = { schemaVersion: 1, id: 'omega', kind: 'statement', big: 'Omega' };
      d.deck.sections[1]!.slideIds = ['alpha', 'the-production-site', 'omega'];
      d.deck.sections[0]!.slideIds.splice(2, 0, 'mid');
    }),
  },
  {
    name: 'a new section with new slides and a renamed section',
    b: edit((d) => {
      d.slides.plan = { schemaVersion: 1, id: 'plan', kind: 'statement', big: 'Plan' };
      d.deck.sections.push({ id: 'status', name: 'Status', slideIds: ['plan'] });
      d.deck.sections[1]!.name = 'The website';
    }),
  },
  {
    name: 'sections reordered',
    b: edit((d) => {
      d.deck.sections.reverse();
    }),
  },
  {
    name: 'a slide moved across sections',
    b: edit((d) => {
      d.deck.sections[0]!.slideIds = d.deck.sections[0]!.slideIds.filter((id) => id !== 'thesis');
      d.deck.sections[1]!.slideIds.push('thesis');
    }),
  },
  {
    name: 'a slide kind changed',
    b: edit((d) => {
      d.slides.thesis = {
        schemaVersion: 1,
        id: 'thesis',
        kind: 'title',
        mark: { w: 132, h: 84 },
        heading: 'Thesis',
        lead: 'Lead.',
      };
    }),
  },
  {
    name: 'slide fields set and removed',
    b: edit((d) => {
      d.slides.thesis!.notes = 'Pause here.';
      delete d.slides['opener-prototemplate']!.notes;
      const t = d.slides.thesis;
      if (t?.kind === 'statement') t.measure = 32;
    }),
  },
  {
    name: 'a layout change',
    b: edit((d) => {
      const s = d.slides['content-rule'];
      if (s?.kind === 'content') s.layout = { type: 'cols', ratio: { left: 390 } };
    }),
  },
  {
    name: 'blocks edited, added, removed, reordered and moved between slots',
    b: edit((d) => {
      const s = d.slides['content-rule'];
      if (s?.kind !== 'content') throw new Error('fixture');
      const [h, p1] = s.slots.left ?? [];
      const [list] = s.slots.right ?? [];
      if (h?.type !== 'heading' || p1 === undefined || list?.type !== 'plain')
        throw new Error('fixture');
      h.text = 'The content rules';
      list.size = 22;
      list.items.pop();
      s.slots.left = [p1, { id: 'new', type: 'paragraph', text: 'New.' }, list];
      s.slots.right = [h];
    }),
  },
  {
    name: 'a slot emptied and a block type changed under the same id',
    b: edit((d) => {
      const s = d.slides['content-rule'];
      if (s?.kind !== 'content') throw new Error('fixture');
      delete s.slots.right;
      s.slots.left = [{ id: 'h', type: 'paragraph', text: 'Now a paragraph.' }, s.slots.left![1]!];
    }),
  },
  {
    name: 'plate side and plate blocks',
    b: edit((d) => {
      const m = d.slides['mood-earth'];
      if (m?.kind !== 'mood') throw new Error('fixture');
      m.plate.side = 'lower-left';
      m.plate.maxWidth = 740;
      m.plate.blocks = [m.plate.blocks[2]!, m.plate.blocks[0]!];
    }),
  },
];

describe('diffDecks', () => {
  it('returns no mutations for identical documents', () => {
    expect(diffDecks(workedDocument(), workedDocument())).toEqual([]);
  });

  it.each(scenarios)('applied to a yields b: $name', ({ b }) => {
    const a = workedDocument();
    const target = normalized(b);
    const mutations = diffDecks(a, target);
    const { document } = applyMutations(a, mutations);
    expect(normalized(document)).toEqual(target);
    expect(diffDecks(normalized(document), target)).toEqual([]);
  });

  it('emits block-level mutations rather than a slide replacement for a text edit', () => {
    const b = edit((d) => {
      const s = d.slides['content-rule'];
      if (s?.kind !== 'content') throw new Error('fixture');
      const h = s.slots.left?.[0];
      if (h?.type === 'heading') h.text = 'The content rules';
    });
    const mutations = diffDecks(workedDocument(), b);
    expect(mutations).toEqual([
      {
        op: 'block.set',
        slideId: 'content-rule',
        blockId: 'h',
        path: '/text',
        value: 'The content rules',
      },
    ]);
    expect(mutations.map(describeMutation)).toEqual(['slide content-rule: block h /text changed']);
  });

  it('ignores revision and timestamps', () => {
    const b = workedDocument();
    b.deck.revision = 999;
    b.deck.updatedAt = '2027-01-01T00:00:00Z';
    expect(diffDecks(workedDocument(), b)).toEqual([]);
  });
});
