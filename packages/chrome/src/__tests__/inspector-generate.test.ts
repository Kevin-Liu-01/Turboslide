import { describe, expect, it } from 'vitest';

import { inspectorsOf } from '@turboslide/schema/annotate';
import type {
  DiaBlock,
  HeadingBlock,
  ParagraphBlock,
  PlainBlock,
  RowsBlock,
  ShotBlock,
} from '@turboslide/schema/blocks';
import { ROWS_KEY_SNAP, rowItemSchema, rowsBlockSchema } from '@turboslide/schema/blocks';
import { CONTENT_RULE, OPENER_BRAND, TITLE } from '@turboslide/schema/fixtures';

import { blankOf, blockControls, kindFor, slideControls } from '../inspector/generate';

// The inspector is generated from the Zod annotations (SPEC 6.5): every annotated field of a
// block gets a control with the label `<block id>: <property label>` and the data-control id
// `block.<id>.<path>`, and the kind follows the rules of SPEC 6.5.
const rows: RowsBlock = {
  id: 'list',
  type: 'rows',
  key: 240,
  tight: true,
  items: [
    {
      key: 'Deck',
      icon: { name: 'check-circle', color: 'ok' },
      value: 'One JSON file per slide',
      ext: true,
    },
    { key: 'CLI', value: 'turboslide render all' },
  ],
};

describe('blockControls for a rows block', () => {
  const generated = blockControls(rows);
  const byPath = new Map(generated.controls.map((spec) => [spec.path, spec]));

  it('gives every annotated top-level field a control except the read-only id and the position box', () => {
    /* `pos` (schema/position.ts) is offered on a freeform slide only */
    const annotated = Object.keys(inspectorsOf(rowsBlockSchema)).filter(
      (key) => key !== 'id' && key !== 'pos',
    );
    expect(annotated).toEqual(['key', 'tight', 'links', 'minRowHeight']);
    for (const key of annotated) expect(byPath.has(`/${key}`)).toBe(true);
    expect(byPath.has('/id')).toBe(false);
    expect(byPath.has('/type')).toBe(false);
    expect(byPath.has('/pos')).toBe(false);
    expect(
      blockControls(rows, { freeform: true }).controls.some((spec) => spec.path === '/pos'),
    ).toBe(true);
  });

  it('gives every annotated item field a control, per item, with the item number in the label', () => {
    const itemFields = Object.keys(inspectorsOf(rowItemSchema));
    expect(itemFields).toEqual(['key', 'value', 'ext']);
    for (const index of [0, 1]) {
      for (const field of itemFields) expect(byPath.has(`/items/${index}/${field}`)).toBe(true);
      expect(byPath.has(`/items/${index}/icon`)).toBe(true);
    }
    expect(byPath.get('/items/0/key')?.label).toBe('list: Key 1');
    expect(byPath.get('/items/1/value')?.label).toBe('list: Value 2');
    expect(byPath.get('/items/0/key')?.control).toBe('block.list.items.0.key');
  });

  it('labels and addresses the controls as SPEC 6.5 states', () => {
    expect(byPath.get('/key')?.label).toBe('list: Key width');
    expect(byPath.get('/key')?.control).toBe('block.list.key');
    expect(byPath.get('/tight')?.label).toBe('list: Tight');
  });

  it('picks the kinds of SPEC 6.5', () => {
    /* ten key widths: a numeric snap set past a Seg's four, so a stepper through the set */
    expect(byPath.get('/key')?.kind).toBe('stepper');
    expect(byPath.get('/key')?.options).toEqual([90, 120, 150, 180, 190, 200, 220, 240, 250, 300]);
    expect(byPath.get('/tight')?.kind).toBe('check');
    expect(byPath.get('/links')?.kind).toBe('check');
    expect(byPath.get('/minRowHeight')?.kind).toBe('number');
    expect(byPath.get('/items/0/key')?.kind).toBe('text');
    expect(byPath.get('/items/0/key')?.text).toBe(true);
    expect(byPath.get('/items/0/icon')?.kind).toBe('icon');
    expect(byPath.get('/items/0/ext')?.kind).toBe('check');
  });

  it('steps only through a long numeric snap: words stay a select, a short set stays a Seg', () => {
    const inner = rowsBlockSchema.shape.key;
    const words = ['a', 'b', 'c', 'd', 'e'];
    expect(kindFor({ label: 'Words', control: 'select', snap: words }, inner, words)).toBe(
      'select',
    );
    expect(kindFor({ label: 'Few', control: 'select', snap: [1, 2, 3] }, inner, [1, 2, 3])).toBe(
      'seg',
    );
    expect(
      kindFor({ label: 'Widths', control: 'select', snap: ROWS_KEY_SNAP }, inner, ROWS_KEY_SNAP),
    ).toBe('stepper');
  });

  it('reads the current values and the optional flag', () => {
    expect(byPath.get('/key')?.value).toBe(240);
    expect(byPath.get('/tight')?.value).toBe(true);
    expect(byPath.get('/links')?.value).toBeUndefined();
    expect(byPath.get('/links')?.optional).toBe(true);
    expect(byPath.get('/key')?.optional).toBe(false);
    expect(byPath.get('/items/1/icon')?.value).toBeUndefined();
  });

  it('lists the items array so the inspector can add and remove, with a valid blank item', () => {
    expect(generated.arrays).toHaveLength(1);
    const items = generated.arrays[0];
    expect(items?.path).toBe('/items');
    expect(items?.minItems).toBe(1);
    expect(items?.length).toBe(2);
    expect(rowItemSchema.safeParse(items?.blank()).success).toBe(true);
  });
});

describe('kinds for the other blocks', () => {
  it('makes a four-option enum a seg and a snapping number a stepper', () => {
    const heading: HeadingBlock = { id: 'h', type: 'heading', level: 'h2', text: 'The copy test' };
    const controls = blockControls(heading).controls;
    const level = controls.find((spec) => spec.path === '/level');
    expect(level?.kind).toBe('seg');
    expect(level?.options).toEqual(['h1', 'h2', 'big', 'title']);
    expect(controls.find((spec) => spec.path === '/marginBottom')?.kind).toBe('seg');
    expect(controls.find((spec) => spec.path === '/marginTop')?.kind).toBe('number');
    expect(controls.find((spec) => spec.path === '/text')?.text).toBe(true);

    const paragraph: ParagraphBlock = { id: 'p', type: 'paragraph', text: 'Body.', measure: 56 };
    const measure = blockControls(paragraph).controls.find((spec) => spec.path === '/measure');
    expect(measure?.kind).toBe('stepper');
    expect(measure?.options).toEqual([32, 56]);

    const plain: PlainBlock = { id: 'list', type: 'plain', size: 22, items: [{ text: 'One' }] };
    const size = blockControls(plain).controls.find((spec) => spec.path === '/size');
    expect(size?.kind).toBe('seg');
    expect(size?.label).toBe('list: Size');
    expect(size?.control).toBe('block.list.size');
  });

  it('makes an AssetId the asset picker and a structured field a json control', () => {
    const shot: ShotBlock = { id: 'fig', type: 'shot', asset: 'site-home', fit: 'width' };
    const controls = blockControls(shot).controls;
    expect(controls.find((spec) => spec.path === '/asset')?.kind).toBe('asset');
    expect(controls.find((spec) => spec.path === '/fit')?.kind).toBe('seg');
    expect(controls.find((spec) => spec.path === '/caption')?.kind).toBe('textarea');

    const dia: DiaBlock = { id: 'd', type: 'dia', fit: 'slot', svg: '<svg/>', alt: '' };
    expect(blockControls(dia).controls.find((spec) => spec.path === '/fit')?.kind).toBe('json');
  });
});

describe('slideControls', () => {
  it('offers the layout type, its branch fields and the slide fields of a content slide, never the slots', () => {
    const controls = slideControls(CONTENT_RULE, [{ id: 'brand', name: 'Brand' }]).controls;
    const byPath = new Map(controls.map((spec) => [spec.path, spec]));
    const type = controls.find((spec) => spec.control === 'slide.layout.type');
    expect(type?.kind).toBe('select');
    expect(type?.options).toEqual(['cols', 'split', 'center', 'left-mid', 'stack', 'freeform']);
    expect(type?.value).toBe('cols');
    const ratio = byPath.get('/layout/ratio');
    expect(ratio?.kind).toBe('json');
    expect(ratio?.options).toEqual(['5/7', '4/8', '1/1']);
    expect(ratio?.group).toBe('Layout');
    expect(byPath.get('/layout/gap')?.kind).toBe('seg');
    expect(byPath.get('/notes')?.kind).toBe('textarea');
    expect(byPath.get('/notes')?.label).toBe('slide: Notes');
    expect(byPath.get('/title')?.control).toBe('slide.title');
    expect(controls.some((spec) => spec.path.startsWith('/slots'))).toBe(false);
    expect(byPath.has('/id')).toBe(false);
  });

  it('offers the section, the plate and the picture of an opener without its plate blocks', () => {
    const sections = [
      { id: 'brand', name: 'Brand' },
      { id: 'website', name: 'Website' },
    ];
    const controls = slideControls(OPENER_BRAND, sections).controls;
    const byPath = new Map(controls.map((spec) => [spec.path, spec]));
    expect(byPath.get('/sectionId')?.kind).toBe('seg');
    expect(byPath.get('/sectionId')?.options).toEqual(['brand', 'website']);
    expect(byPath.get('/plate/side')?.kind).toBe('seg');
    expect(byPath.get('/plate/maxWidth')?.options).toEqual([740, 560, 720]);
    expect(byPath.get('/picture/asset')?.kind).toBe('asset');
    expect(byPath.get('/picture/position')?.kind).toBe('seg');
    expect(controls.some((spec) => spec.path.startsWith('/plate/blocks'))).toBe(false);
  });

  it('marks the title slide texts as Text fields', () => {
    const controls = slideControls(TITLE).controls;
    const heading = controls.find((spec) => spec.path === '/heading');
    expect(heading?.kind).toBe('text');
    expect(heading?.text).toBe(true);
    expect(controls.find((spec) => spec.path === '/mark/w')?.kind).toBe('number');
  });
});

describe('blankOf', () => {
  it('builds a valid blank for the row item schema', () => {
    expect(rowItemSchema.safeParse(blankOf(rowItemSchema)).success).toBe(true);
  });
});
