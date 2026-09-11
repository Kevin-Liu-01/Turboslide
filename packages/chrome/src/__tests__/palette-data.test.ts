import { describe, expect, it } from 'vitest';

import { actionsInOrder } from '@turboslide/schema/actions';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Version } from '@turboslide/schema/mutations';

import type { PaletteContext } from '../palette-data';
import {
  PALETTE_GROUPS,
  buildPaletteEntries,
  filterPalette,
  insertionSlot,
  matchScore,
  parsePaletteQuery,
} from '../palette-data';

// The palette's five groups and its filter (SPEC 6.3).
const document = workedDocument();

const versions: Version[] = Array.from({ length: 12 }, (_value, index) => ({
  n: index + 1,
  revision: 400 + index,
  author:
    index % 2 === 0
      ? { kind: 'human', name: 'kevin' }
      : { kind: 'agent', name: 'agent', runId: `run-${index}` },
  note: index === 11 ? 'Before the copy pass' : '',
  createdAt: '2026-09-10T18:00:00Z',
  mutations: [],
}));

const noop = () => undefined;

const ctx: PaletteContext = {
  deck: document.deck,
  slides: document.slides,
  slideId: 'content-rule',
  blockId: 'list',
  revision: 412,
  versions,
  view: {
    mode: 'slide',
    theme: 'dark',
    present: false,
    edit: true,
    twin: false,
    lint: false,
    source: false,
  },
  toggles: { edit: noop, twin: noop, lint: noop, source: noop },
  apple: true,
};

describe('buildPaletteEntries', () => {
  const entries = buildPaletteEntries(ctx);

  it('has the five groups in order', () => {
    expect(PALETTE_GROUPS.map((group) => group.id)).toEqual([
      'slides',
      'insert',
      'actions',
      'view',
      'versions',
    ]);
    const present = new Set(entries.map((entry) => entry.group));
    for (const group of PALETTE_GROUPS) expect(present.has(group.id)).toBe(true);
  });

  it('lists every slide with its section and a preview id', () => {
    const slides = entries.filter((entry) => entry.group === 'slides');
    expect(slides).toHaveLength(7);
    const rule = slides.find((entry) => entry.preview === 'content-rule');
    expect(rule?.meta).toBe('Brand');
    expect(rule?.run).toEqual({
      kind: 'dispatch',
      action: 'view.goto',
      input: { slideId: 'content-rule' },
    });
  });

  it('lists the six slide kinds and every block the selection allows, with the constraint as a hint', () => {
    const insert = entries.filter((entry) => entry.group === 'insert');
    const kinds = insert.filter((entry) => entry.id.startsWith('insert:slide:'));
    expect(kinds.map((entry) => entry.id.split(':')[2])).toEqual([
      'content',
      'opener',
      'mood',
      'closing',
      'title',
      'statement',
    ]);
    const plain = insert.find((entry) => entry.id === 'insert:block:plain');
    expect(plain?.hint).toBeTruthy();
    expect(plain?.run.kind).toBe('dispatch');
    if (plain?.run.kind === 'dispatch') {
      const input = plain.run.input as { slot: string; after?: string; baseRevision: number };
      expect(input.slot).toBe('right');
      expect(input.after).toBe('list');
      expect(input.baseRevision).toBe(412);
    }
    /* a plate-only block is not offered on a content slide */
    expect(insert.some((entry) => entry.id === 'insert:block:credit')).toBe(false);
  });

  it('lists every labeled action outside the view and studio groups', () => {
    const actions = entries.filter((entry) => entry.group === 'actions');
    const expected = actionsInOrder().filter(
      (spec) => spec.group !== 'view' && spec.group !== 'studio',
    );
    expect(actions.map((entry) => entry.meta)).toEqual(expected.map((spec) => spec.id));
    const lint = actions.find((entry) => entry.meta === 'lint.run');
    expect(lint?.run).toEqual({
      kind: 'dispatch',
      action: 'lint.run',
      input: { slideIds: 'all', layers: 'static' },
    });
    expect(actions.find((entry) => entry.meta === 'version.save')?.run.kind).toBe('prompt');
    expect(actions.find((entry) => entry.meta === 'asset.add')?.run.kind).toBe('needs');
    expect(actions.find((entry) => entry.meta === 'version.save')?.keys).toBe('Cmd S');
  });

  it('lists the last ten versions newest first with author and note', () => {
    const rows = entries.filter((entry) => entry.group === 'versions');
    expect(rows).toHaveLength(10);
    expect(rows[0]?.title).toBe('Before the copy pass');
    expect(rows[0]?.meta).toBe('agent:run-11 · r411');
    expect(rows[1]?.title).toBe('Version 11');
    expect(rows[0]?.run).toEqual({
      kind: 'dispatch',
      action: 'version.restore',
      input: { n: 12, baseRevision: 412 },
    });
  });
});

describe('parsePaletteQuery and matchScore', () => {
  it('reads the three prefixes', () => {
    expect(parsePaletteQuery('>lint')).toEqual({ group: 'actions', needle: 'lint' });
    expect(parsePaletteQuery('# the')).toEqual({ group: 'slides', needle: 'the' });
    expect(parsePaletteQuery('+plain')).toEqual({ group: 'insert', needle: 'plain' });
    expect(parsePaletteQuery('  Lint')).toEqual({ group: null, needle: 'lint' });
  });

  it('scores a prefix over a word prefix over a substring over a subsequence', () => {
    expect(matchScore('con', 'content-rule')).toBe(4);
    expect(matchScore('rule', 'content-rule')).toBe(3);
    expect(matchScore('ent', 'content-rule')).toBe(2);
    expect(matchScore('cntrl', 'content-rule')).toBe(1);
    expect(matchScore('xyz', 'content-rule')).toBe(0);
  });
});

describe('filterPalette', () => {
  const entries = buildPaletteEntries(ctx);

  it('shows every group for an empty query', () => {
    const groups = filterPalette(entries, '');
    expect(groups.map((group) => group.group.id)).toEqual([
      'slides',
      'insert',
      'actions',
      'view',
      'versions',
    ]);
  });

  it('restricts to actions with >, to slides with # and to insert with +', () => {
    const actions = filterPalette(entries, '>lint');
    expect(actions.map((group) => group.group.id)).toEqual(['actions']);
    expect(actions[0]?.rows[0]?.meta).toBe('lint.run');

    const slides = filterPalette(entries, '#site');
    expect(slides.map((group) => group.group.id)).toEqual(['slides']);
    expect(slides[0]?.rows.map((row) => row.preview)).toContain('the-production-site');

    const insert = filterPalette(entries, '+plain');
    expect(insert.map((group) => group.group.id)).toEqual(['insert']);
    expect(insert[0]?.rows[0]?.id).toBe('insert:block:plain');
  });

  it('matches fuzzily over titles and ids and orders the best match first', () => {
    const groups = filterPalette(entries, 'cntrl');
    const slides = groups.find((group) => group.group.id === 'slides');
    expect(slides?.rows.some((row) => row.preview === 'content-rule')).toBe(true);
    const lint = filterPalette(entries, 'lint');
    const actions = lint.find((group) => group.group.id === 'actions');
    expect(actions?.rows[0]?.meta).toBe('lint.run');
  });

  it('reports nothing for a query no entry matches', () => {
    expect(filterPalette(entries, 'qzqzqzqz')).toEqual([]);
  });
});

describe('insertionSlot', () => {
  it('follows the selected block, else the first filled slot, else the plate', () => {
    const rule = document.slides['content-rule'];
    const opener = document.slides['opener-brand'];
    if (!rule || !opener) throw new Error('fixture missing');
    expect(insertionSlot(rule, 'list')).toBe('right');
    expect(insertionSlot(rule)).toBe('left');
    expect(insertionSlot(opener)).toBe('plate');
  });
});
