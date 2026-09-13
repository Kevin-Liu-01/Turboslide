import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Slide } from '@turboslide/schema/deck';

import {
  FORMAT_SECTIONS,
  formatSectionOfBlockControl,
  formatSectionOfSlideControl,
  hasAltText,
  hasTextFitting,
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
    const found = blocks?.find((each) => each.type === type);
    if (found) return found;
  }
  throw new Error(`no ${type} on the worked slide`);
}

describe('the sections', () => {
  it('carry the names of SPEC 12 and SPEC-2 section 5 in Google’s order, plus the block fallback', () => {
    const names = FORMAT_SECTIONS.map((section) => section.title);
    for (const name of PANELS.formatOptions.sections) expect(names).toContain(name);
    expect(names.indexOf('Size & rotation')).toBeLessThan(names.indexOf('Position'));
    expect(names.indexOf('Text')).toBeLessThan(names.indexOf('Colour'));
    /* SPEC-2 section 5: the round two sections in Google's order (R05 B7, F3) */
    for (const name of ['Adjustments', 'Drop shadow', 'Chart data', 'Line', 'Shape', 'Alt text'])
      expect(names).toContain(name);
    expect(names.indexOf('Picture')).toBeLessThan(names.indexOf('Adjustments'));
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
    const box: Block = { id: 'b', type: 'box', fill: 'plate', text: 'x' } as Block;
    const boxControls = blockControls(box);
    const fill = boxControls.controls.find((spec) => spec.path === '/fill');
    expect(fill).toBeDefined();
    if (fill) expect(formatSectionOfBlockControl(fill, box)).toBe('colour');
    const radius = boxControls.controls.find((spec) => spec.path === '/radius');
    if (radius) expect(formatSectionOfBlockControl(radius, box)).toBe('size');
  });

  it('Picture for a shot’s asset and caption; Table for a table’s cells', () => {
    const shot: Block = { id: 's', type: 'shot', asset: 'a', caption: 'c' } as Block;
    for (const spec of blockControls(shot).controls) {
      if (spec.path === '/asset' || spec.path === '/caption' || spec.path === '/crop')
        expect(formatSectionOfBlockControl(spec, shot), spec.path).toBe('picture');
    }
    const table: Block = {
      id: 't',
      type: 'table',
      columns: [{}],
      rows: [{ cells: ['x'] }],
    } as Block;
    for (const spec of blockControls(table).controls) {
      if (spec.path === '/alt') expect(formatSectionOfBlockControl(spec, table)).toBe('altText');
      else if (spec.path === '/valign')
        expect(formatSectionOfBlockControl(spec, table)).toBe('textFitting');
      else if (spec.path !== '/link' && spec.path !== '/ext' && spec.path !== '/shadow')
        expect(formatSectionOfBlockControl(spec, table), spec.path).toBe('table');
    }
    expect(hasAltText(shot)).toBe(true);
    expect(hasAltText(table)).toBe(false);
    expect(hasTextFitting({ id: 'x', type: 'text', text: '' } as Block)).toBe(true);
    expect(hasTextFitting({ id: 'h', type: 'heading', level: 'h2', text: '' } as Block)).toBe(true);
    expect(hasTextFitting({ id: 's', type: 'shape', shape: 'rect' } as Block)).toBe(true);
    expect(hasTextFitting({ id: 'l', type: 'shape', shape: 'line' } as Block)).toBe(false);
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
