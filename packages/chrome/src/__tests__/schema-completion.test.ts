import { describe, expect, it } from 'vitest';

import {
  propertyCompletions,
  schemasAt,
  slideJsonSchema,
  typeLabel,
  valueCompletions,
} from '../source/schema-completion';

// JSON Schema completion from the slide schema (SPEC 6.6): the schema side, in Node.
const root = slideJsonSchema();

describe('schemasAt', () => {
  it('resolves the slide kind by its discriminator', () => {
    const content = schemasAt(root, [], { kind: 'content' });
    expect(content).toHaveLength(1);
    expect(Object.keys(content[0]?.properties as object)).toContain('layout');
    const all = schemasAt(root, [], {});
    expect(all.length).toBe(6);
  });

  it('follows properties, array items and $ref into the block union', () => {
    const doc = { kind: 'content', slots: { left: [{ type: 'rows' }] } };
    const rows = schemasAt(root, ['slots', 'left', 0], doc);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]?.properties as object)).toEqual(
      expect.arrayContaining(['key', 'items', 'tight', 'links']),
    );
  });
});

describe('propertyCompletions', () => {
  it('offers the fields of a content slide and not those of a picture slide', () => {
    const labels = propertyCompletions(root, [], { kind: 'content' }).map((row) => row.label);
    expect(labels).toEqual(expect.arrayContaining(['layout', 'slots', 'notes', 'title', 'tags']));
    expect(labels).not.toContain('plate');
    expect(labels).not.toContain('picture');
  });

  it('offers the branch of a layout by its type, with titles and required flags', () => {
    const doc = { kind: 'content', layout: { type: 'cols' } };
    const rows = propertyCompletions(root, ['layout'], doc);
    const labels = rows.map((row) => row.label);
    expect(labels).toEqual(expect.arrayContaining(['ratio', 'gap', 'align']));
    expect(labels).not.toContain('head');
    expect(rows.find((row) => row.label === 'ratio')?.required).toBe(true);
    expect(rows.find((row) => row.label === 'gap')?.title).toBe('Gap');
  });

  it('offers every block field when the block type is not yet written', () => {
    const doc = { kind: 'content', slots: { left: [{}] } };
    const labels = propertyCompletions(root, ['slots', 'left', 0], doc).map((row) => row.label);
    expect(labels).toEqual(expect.arrayContaining(['type', 'id', 'level', 'key', 'asset']));
  });

  it('offers the row item fields inside a rows block', () => {
    const doc = { kind: 'content', slots: { left: [{ type: 'rows', items: [{}] }] } };
    const labels = propertyCompletions(root, ['slots', 'left', 0, 'items', 0], doc).map(
      (row) => row.label,
    );
    expect(labels).toEqual(['key', 'icon', 'value', 'ext']);
  });
});

describe('valueCompletions', () => {
  it('offers the literal set of a field', () => {
    const doc = { kind: 'content', slots: { left: [{ type: 'rows' }] } };
    const labels = valueCompletions(root, ['slots', 'left', 0, 'key'], doc).map((row) => row.label);
    expect(labels).toEqual(['90', '120', '150', '180', '190', '200', '220', '240', '250', '300']);
  });

  it('offers the layout types and the booleans', () => {
    const types = valueCompletions(root, ['layout', 'type'], { kind: 'content' }).map(
      (row) => row.label,
    );
    expect(types).toEqual(['"cols"', '"split"', '"center"', '"left-mid"', '"stack"']);
    const doc = { kind: 'content', slots: { left: [{ type: 'rows' }] } };
    const tight = valueCompletions(root, ['slots', 'left', 0, 'tight'], doc).map(
      (row) => row.label,
    );
    expect(tight).toEqual(['true', 'false']);
  });
});

describe('typeLabel', () => {
  it('names literals, unions and plain types', () => {
    const content = schemasAt(root, [], { kind: 'content' })[0];
    const properties = content?.properties as Record<string, Record<string, unknown>>;
    expect(typeLabel(root, properties.notes ?? {})).toBe('string');
    expect(typeLabel(root, properties.kind ?? {})).toBe('"content"');
    expect(typeLabel(root, properties.layout ?? {})).toBe('object');
  });
});
