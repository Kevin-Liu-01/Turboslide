import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ACTION_IDS, ACTIONS, NO_REVISION_WRITES, actionsInOrder, actionsOn } from './actions.ts';
import { readInspector } from './annotate.ts';
import { BLOCK_SCHEMAS, BLOCK_TYPES, blockSchema, rowsBlockSchema } from './blocks.ts';
import {
  CATALOG,
  LAYOUT_CATALOG,
  SLIDE_KIND_CATALOG,
  blockAssetRefs,
  blockTextPaths,
  expandPaths,
} from './catalog.ts';
import { SLIDE_KINDS, slideSchema } from './deck.ts';
import { CONTENT_RULE, THE_PRODUCTION_SITE } from './fixtures.ts';
import { ICON_NAMES } from './icons.ts';
import { RULE_IDS, RULES } from './rules.ts';

describe('the block catalog', () => {
  it('has one entry per block type with a default instance that parses', () => {
    for (const type of BLOCK_TYPES) {
      const entry = CATALOG[type];
      expect(entry.type).toBe(type);
      const block = entry.make('demo');
      const result = BLOCK_SCHEMAS[type].safeParse(block);
      expect(result.success, `${type}: ${result.success ? '' : result.error.message}`).toBe(true);
      expect(blockSchema.safeParse(block).success).toBe(true);
    }
    expect(Object.keys(CATALOG).sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it('lists text and asset paths that exist on the fixtures', () => {
    if (CONTENT_RULE.kind !== 'content' || THE_PRODUCTION_SITE.kind !== 'content')
      throw new Error('fixture');
    const list = CONTENT_RULE.slots.right?.[0];
    const shot = THE_PRODUCTION_SITE.slots.right?.[0];
    if (list === undefined || shot === undefined) throw new Error('fixture');
    expect(blockTextPaths(list)).toEqual([0, 1, 2, 3, 4, 5].map((i) => `/items/${i}/text`));
    expect(blockTextPaths(shot)).toEqual(['/caption']);
    expect(blockAssetRefs(shot)).toEqual([{ path: '/asset', assetId: 'site-home' }]);
    expect(
      expandPaths({ figures: [{ assets: ['a', 'b'] }, { assets: ['c'] }] }, '/figures/*/assets/*'),
    ).toEqual(['/figures/0/assets/0', '/figures/0/assets/1', '/figures/1/assets/0']);
  });

  it('catalogues every slide kind and layout', () => {
    expect(Object.keys(SLIDE_KIND_CATALOG).sort()).toEqual([...SLIDE_KINDS].sort());
    expect(SLIDE_KIND_CATALOG.opener.plate).toEqual({ side: 'lower-left', maxWidth: 740 });
    expect(SLIDE_KIND_CATALOG.mood.plate).toEqual({
      side: 'lower-right',
      maxWidth: 560,
      titleSize: 44,
    });
    expect(SLIDE_KIND_CATALOG.closing.plate).toEqual({ side: 'upper-left', maxWidth: 720 });
    expect(LAYOUT_CATALOG.cols.slots).toEqual(['left', 'right']);
  });

  it('carries inspector annotations that survive into the JSON Schema', () => {
    const key = rowsBlockSchema.shape.key;
    expect(readInspector(key)).toMatchObject({
      label: 'Key width',
      control: 'select',
      group: 'Layout',
    });
    const json = z.toJSONSchema(rowsBlockSchema, { target: 'draft-2020-12' }) as {
      properties: Record<string, Record<string, unknown>>;
    };
    expect(json.properties.key?.title).toBe('Key width');
    expect(json.properties.key?.['x-inspector']).toMatchObject({ control: 'select' });
  });

  it('exports the whole slide schema as JSON Schema with the block recursion resolved by reference', () => {
    const json = JSON.stringify(z.toJSONSchema(slideSchema, { target: 'draft-2020-12' }));
    expect(json).toContain('$ref');
    expect(json).toContain('"composite"');
  });
});

describe('the rule table', () => {
  it('has one row per rule id with a severity, a layer and a source', () => {
    expect(Object.keys(RULES).sort()).toEqual([...RULE_IDS].sort());
    for (const id of RULE_IDS) {
      const rule = RULES[id];
      expect(rule.id).toBe(id);
      expect([1, 2, 3]).toContain(rule.severity);
      expect(['static', 'rendered', 'both']).toContain(rule.layer);
      expect(rule.source.length).toBeGreaterThan(0);
    }
    expect(RULES['sheet/overflow'].severity).toBe(3);
    expect(RULES['copy/heading-period'].fix).toBe(true);
  });
});

describe('the action table', () => {
  it('has one entry per id, every example parses and every mutating action takes baseRevision where it writes the document', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual([...ACTION_IDS].sort());
    for (const spec of actionsInOrder()) {
      const result = spec.input.safeParse(spec.example);
      expect(result.success, `${spec.id}: ${result.success ? '' : result.error.message}`).toBe(
        true,
      );
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.transports.length).toBeGreaterThan(0);
      if (spec.transports.includes('cli') && spec.id !== 'view.goto')
        expect(spec.cli, `${spec.id} needs a cli usage`).toBeDefined();
      if (spec.transports.includes('mcp'))
        expect(spec.mcp, `${spec.id} needs an mcp tool name`).toMatch(/^deck_/);
      if (
        spec.mutates &&
        spec.id !== 'slide.lease' &&
        spec.id !== 'version.save' &&
        spec.id !== 'import.run' &&
        spec.id !== 'source.apply' &&
        // deck.create writes a deck that does not exist yet, so there is no revision to base on
        spec.id !== 'deck.create' &&
        // deck.unpack, deck.push and deck.pull write a whole deck folder from a bundle
        // (docs/deck-transfer.md), so there is no document revision to base on either
        spec.id !== 'deck.unpack' &&
        spec.id !== 'deck.push' &&
        spec.id !== 'deck.pull' &&
        // round three's writes to page state, the principal record, the inbox, the identity store,
        // a checkout mirror or the flags (gslides-parity SPEC-3 12): no revisioned record to base on
        !NO_REVISION_WRITES.has(spec.id)
      ) {
        const json = z.toJSONSchema(spec.input, { target: 'draft-2020-12' }) as {
          properties?: Record<string, unknown>;
        };
        expect(json.properties?.baseRevision, `${spec.id} takes baseRevision`).toBeDefined();
      }
    }
  });

  it('offers the view and studio actions on the window transport only, except view.goto on mcp too', () => {
    const windowIds = actionsOn('window').map((spec) => spec.id);
    expect(windowIds).toContain('view.mode');
    expect(windowIds).toContain('source.apply');
    expect(windowIds).not.toContain('import.run');
    expect(ACTIONS['view.goto'].transports).toEqual(['window', 'mcp']);
    expect(ACTIONS['import.run'].transports).toEqual(['cli']);
  });

  it('keeps the icon list in sprite order with the mark first', () => {
    expect(ICON_NAMES[0]).toBe('gt-mark');
    // 69 Heroicons plus gt-mark: M5 added lock-closed (slide 83), the editor depth round the three
    // bars glyphs of the arrange bar's align buttons, the Google Slides parity round three bell and
    // inbox for the inbox plate and Notification settings (merge 1, build-3/b6.md request 2)
    expect(ICON_NAMES).toHaveLength(70);
    expect(new Set(ICON_NAMES).size).toBe(70);
  });
});
