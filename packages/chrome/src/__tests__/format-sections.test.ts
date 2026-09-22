import { describe, expect, it } from 'vitest';

import type { Block, BlockType } from '@turboslide/schema/blocks';
import { BLOCK_SCHEMAS } from '@turboslide/schema/blocks';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Slide } from '@turboslide/schema/deck';

import {
  FORMAT_SECTIONS,
  formatSectionOfBlockControl,
  formatSectionOfSlideControl,
  hasAltText,
  hasShadow,
  hasTextFitting,
  leadingFormatSection,
  sectionsInOrderFor,
} from '../inspector/format-sections';
import { blockControls, slideControls } from '../inspector/generate';
import { PANELS, forbiddenWordsIn } from '../menus/strings';

// Format options' routing (gslides-parity SPEC 3.9): the generated controls of the Inspector land
// under Google's section names, the fields that leave the panel route to none, and the section
// names are the ones SPEC 12 lists.
const document = workedDocument();
const rule = document.slides['content-rule'] as Slide;

function block(type: Block['type']): Block {
  if (rule.kind !== 'content') throw new Error('content slide');
  for (const blocks of Object.values(rule.slots)) {
    const found = blocks.find((each) => each.type === type);
    if (found) return found;
  }
  throw new Error(`no ${type} on the worked slide`);
}

describe('the sections', () => {
  it('carry the names of SPEC 12 and SPEC-2 section 5 in Google’s order, plus the block fallback', () => {
    const names = FORMAT_SECTIONS.map((section) => section.title);
    /* the Picture section reads "Image options" since the product round (docs/PRODUCT.md section 2
       rank 10, the words), in the panel's word list of menus/strings.ts too */
    for (const name of PANELS.formatOptions.sections) expect(names).toContain(name);
    expect(names.indexOf('Size & rotation')).toBeLessThan(names.indexOf('Position'));
    expect(names.indexOf('Text')).toBeLessThan(names.indexOf('Colour'));
    /* SPEC-2 section 5: the round two sections in Google's order (R05 B7, F3) */
    for (const name of ['Adjustments', 'Drop shadow', 'Chart data', 'Line', 'Shape', 'Alt text'])
      expect(names).toContain(name);
    expect(names.indexOf('Image options')).toBeLessThan(names.indexOf('Adjustments'));
    expect(names.indexOf('Adjustments')).toBeLessThan(names.indexOf('Drop shadow'));
    expect(names.indexOf('Table')).toBeLessThan(names.indexOf('Chart data'));
    expect(names.indexOf('Chart data')).toBeLessThan(names.indexOf('Line'));
    expect(names.indexOf('Line')).toBeLessThan(names.indexOf('Shape'));
    expect(names.indexOf('List')).toBeLessThan(names.indexOf('Alt text'));
    for (const section of FORMAT_SECTIONS) {
      expect(forbiddenWordsIn(section.title), section.id).toEqual([]);
      expect(forbiddenWordsIn(section.doc), section.id).toEqual([]);
    }
  });
});

describe('a block control routes to', () => {
  it('Text for a heading’s typography, Size for its position, none for its link', () => {
    const heading = block('heading');
    const generated = blockControls(heading, { freeform: true });
    const sections = new Map(
      generated.controls.map((spec) => [spec.path, formatSectionOfBlockControl(spec, heading)]),
    );
    expect(sections.get('/typography')).toBe('text');
    expect(sections.get('/text')).toBe('text');
    expect(sections.get('/pos')).toBe('size');
    expect(sections.get('/link')).toBeNull();
  });

  it('List for a plain block’s items and Colour for a box fill', () => {
    const plain = block('plain');
    const generated = blockControls(plain);
    for (const spec of generated.controls) {
      if (spec.path.startsWith('/items'))
        expect(formatSectionOfBlockControl(spec, plain), spec.path).toBe('list');
    }
    const box: Block = { id: 'b', type: 'box', fill: 'plate', text: 'x' };
    const boxControls = blockControls(box);
    const fill = boxControls.controls.find((spec) => spec.path === '/fill');
    expect(fill).toBeDefined();
    if (fill) expect(formatSectionOfBlockControl(fill, box)).toBe('colour');
    const radius = boxControls.controls.find((spec) => spec.path === '/radius');
    if (radius) expect(formatSectionOfBlockControl(radius, box)).toBe('size');
  });

  it('Picture for a shot’s asset and caption; Table for a table’s cells', () => {
    const shot: Block = { id: 's', type: 'shot', asset: 'a', caption: 'c' };
    for (const spec of blockControls(shot).controls) {
      if (spec.path === '/asset' || spec.path === '/caption' || spec.path === '/crop')
        expect(formatSectionOfBlockControl(spec, shot), spec.path).toBe('picture');
    }
    const table: Block = {
      id: 't',
      type: 'table',
      columns: [{}],
      rows: [{ cells: ['x'] }],
    };
    for (const spec of blockControls(table).controls) {
      if (spec.path === '/alt') expect(formatSectionOfBlockControl(spec, table)).toBe('altText');
      else if (spec.path === '/valign')
        expect(formatSectionOfBlockControl(spec, table)).toBe('textFitting');
      else if (spec.path !== '/link' && spec.path !== '/ext' && spec.path !== '/shadow')
        expect(formatSectionOfBlockControl(spec, table), spec.path).toBe('table');
    }
    expect(hasAltText(shot)).toBe(true);
    expect(hasAltText(table)).toBe(false);
    expect(hasTextFitting({ id: 'x', type: 'text', text: '' })).toBe(true);
    expect(hasTextFitting({ id: 'h', type: 'heading', level: 'h2', text: '' })).toBe(true);
    expect(hasTextFitting({ id: 's', type: 'shape', shape: 'rect' })).toBe(true);
    expect(hasTextFitting({ id: 'l', type: 'shape', shape: 'line' })).toBe(false);
    expect(hasTextFitting(shot)).toBe(false);
  });
});

describe('a slide control routes to', () => {
  it('Layout for the layout fields and none for the id, title, notes and tags', () => {
    const generated = slideControls(rule, document.deck.sections);
    const byPath = new Map(
      generated.controls.map((spec) => [spec.path, formatSectionOfSlideControl(spec)]),
    );
    for (const [path, section] of byPath) {
      if (path.startsWith('/layout')) expect(section, path).toBe('layout');
      if (path === '/notes' || path === '/title' || path === '/tags' || path === '/id')
        expect(section, path).toBeNull();
    }
  });
});

describe('the Dither section (gslides-parity SPEC-3 10.7)', () => {
  it('sits after Adjustments and before Drop shadow, routes /dither and serves shots and pictures', async () => {
    const { FORMAT_SECTION_BY_ID, hasDither, isOwnSectionPath } =
      await import('../inspector/format-sections');
    const names = FORMAT_SECTIONS.map((section) => section.id);
    expect(names.indexOf('adjustments')).toBeLessThan(names.indexOf('dither'));
    expect(names.indexOf('dither')).toBeLessThan(names.indexOf('shadow'));
    expect(FORMAT_SECTION_BY_ID.dither.title).toBe('Dither');
    expect(FORMAT_SECTION_BY_ID.dither.icon).toBe('adjustments');
    expect(forbiddenWordsIn(FORMAT_SECTION_BY_ID.dither.doc)).toEqual([]);
    const picture: Block = {
      id: 'p',
      type: 'picture',
      asset: 'site-home',
      pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
      dither: { pattern: 'bayer8' },
    };
    const generated = blockControls(picture, { freeform: true });
    const dither = generated.controls.find((spec) => spec.path === '/dither');
    expect(dither).toBeDefined();
    if (dither) expect(formatSectionOfBlockControl(dither, picture)).toBe('dither');
    expect(isOwnSectionPath('/dither')).toBe(true);
    expect(hasDither(picture)).toBe(true);
    expect(hasDither({ id: 's', type: 'shot', asset: 'site-home' })).toBe(true);
    expect(hasDither({ id: 'i', type: 'icon', name: 'bell' })).toBe(false);
    expect(hasDither(block('heading'))).toBe(false);
  });
});

describe('Drop shadow (gslides-parity SPEC-2 2.3.4)', () => {
  it('serves exactly the blocks whose schema carries the shadow field', () => {
    for (const type of Object.keys(BLOCK_SCHEMAS) as BlockType[]) {
      /* one source of truth: the section appears where block.shadow is accepted (VERIFICATION-3
         finding 16: a heading or a paragraph carries no field today, so the section stays absent
         until the schema gains it; build-3/b5.md, Fix round, names the request) */
      expect(hasShadow({ id: 'x', type } as Block), type).toBe(
        'shadow' in BLOCK_SCHEMAS[type].shape,
      );
    }
    for (const type of [
      'box',
      'shape',
      'text',
      'shot',
      'picture',
      'icon',
      'table',
      'chart',
    ] as const)
      expect(hasShadow({ id: 'x', type } as Block), type).toBe(true);
    expect(hasShadow(block('heading'))).toBe('shadow' in BLOCK_SCHEMAS.heading.shape);
    expect(hasShadow(block('paragraph'))).toBe('shadow' in BLOCK_SCHEMAS.paragraph.shape);
  });
});

describe('the leading section (docs/FEATURES.md 2.2 rank 13; docs/RETURN.md 2.5)', () => {
  it('leads with Chart data for a chart and Table for a table, and keeps Google’s order otherwise', () => {
    const chart = { id: 'c', type: 'chart', kind: 'bar', categories: ['a'], series: [] } as Block;
    const table = { id: 't', type: 'table', columns: [{}], rows: [{ cells: [''] }] } as Block;
    expect(leadingFormatSection(chart)).toBe('chart');
    expect(leadingFormatSection(table)).toBe('table');
    expect(leadingFormatSection(block('heading'))).toBeNull();
    expect(leadingFormatSection(undefined)).toBeNull();
    const ids = (blockOf: Block | undefined) =>
      sectionsInOrderFor(FORMAT_SECTIONS, blockOf).map((section) => section.id);
    expect(ids(table)[0]).toBe('table');
    expect(ids(chart)[0]).toBe('chart');
    /* the sort is stable: the rest keep their order */
    expect(ids(table).filter((id) => id !== 'table')).toEqual(
      FORMAT_SECTIONS.map((section) => section.id).filter((id) => id !== 'table'),
    );
    expect(ids(block('heading'))).toEqual(FORMAT_SECTIONS.map((section) => section.id));
  });
});

