import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import { blockSchema } from '@turboslide/schema/blocks';
import type { TableBlock } from '@turboslide/schema/blocks/table';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { FREEFORM_SLIDE, freeformDocument, workedDocument } from '@turboslide/schema/fixtures';
import { LAYOUTS } from '@turboslide/schema/layouts';

import {
  DEFAULT_SETTINGS,
  DEFAULT_TABLE_SIZE,
  DIALOG_IDS,
  PANEL_IDS,
  STORED_SETTINGS,
  buildMenuContext,
  dialogIdOf,
  drawToolBlock,
  drawToolBlockType,
  factsOf,
  insertBlockPlan,
  insertIntentOf,
  listFrom,
  menuActionPlan,
  panelIdOfTitle,
  pictureTargetOf,
  readStoredSettings,
  retiredKeySentence,
  stepLadder,
  stepPlainSize,
  tailKindOf,
  writeStoredSettings,
} from '../editor-shell';
import type { ActionFacts, EditorSelection, InsertIntent } from '../editor-shell';
import {
  FIRST_BULLET_PRESET,
  FIRST_NUMBER_PRESET,
  TOOL_SIZES,
  ZOOM_LADDER,
  blockFamily,
  clampZoomPercent,
  effectiveZoomPercent,
  memberWritePlan,
  shapeDrawTool,
  shapePickPlan,
  zoomStepFrom,
} from '../editor-shell';
import { MENUS, allItems, itemById } from '../menus/model';

// The editor shell's pure helpers (gslides-parity SPEC 2, 3, 7.5, 10.2): the menu context from
// the editor's facts, the toolbar tail of a selection, the action input a menu item dispatches,
// the retired letters' sentence, the panel and dialog ids every model title resolves to.
const document: DeckDocument = workedDocument();
const FIRST = document.deck.sections[0]?.slideIds[0] ?? '';
const RULE = 'content-rule';

function facts(
  slideId: string,
  selection?: EditorSelection,
  extra: Partial<ActionFacts> = {},
): ActionFacts {
  return {
    document,
    slideId,
    selectedSlideIds: [slideId],
    selection: selection ?? null,
    revision: 412,
    lastLayout: null,
    ...extra,
  };
}

function firstBlockOf(slide: Slide, type: Block['type']): Block | undefined {
  if (slide.kind !== 'content') return undefined;
  for (const blocks of Object.values(slide.slots)) {
    const found = blocks?.find((block) => block.type === type);
    if (found) return found;
  }
  return undefined;
}

describe('buildMenuContext', () => {
  it('reads the slide position, the skip flag and the section count', () => {
    const ctx = buildMenuContext({ document, slideId: RULE }, DEFAULT_SETTINGS, 'mac');
    expect(ctx.slide?.count).toBe(Object.keys(document.slides).length);
    expect(ctx.slide?.index).toBeGreaterThan(0);
    expect(ctx.slide?.skipped).toBe(false);
    expect(ctx.sections).toBe(document.deck.sections.length);
    expect(ctx.selectedSlides).toBe(1);
    expect(ctx.selection.blocks).toBe(0);
    expect(ctx.focus).toBe('none');
    expect(ctx.settings.snapGuides).toBe(true);
  });

  it('names the family of the selected block and reads the text and list flags', () => {
    const slide = document.slides[RULE] as Slide;
    const list = firstBlockOf(slide, 'plain');
    expect(list).toBeDefined();
    const ctx = buildMenuContext(
      { document, slideId: RULE, selection: { blockId: list?.id } },
      DEFAULT_SETTINGS,
      'mac',
    );
    expect(ctx.selection.blocks).toBe(1);
    /* a list is text to the menus since the focus round (docs/FOCUS.md `text.list.chords`,
       `text.indent.toolbar`): a box turned into a list keeps the text family, the text tail and
       the Format > Text rows; before it read as `other` and lost them on the conversion */
    expect(ctx.selection.block).toBe('text');
    expect(ctx.selection.textBlock).toBe(true);
    expect(ctx.selection.listItem).toBe(true);
    expect(ctx.focus).toBe('canvas');
    const heading = firstBlockOf(slide, 'heading');
    const text = buildMenuContext(
      { document, slideId: RULE, selection: { blockId: heading?.id } },
      DEFAULT_SETTINGS,
      'mac',
    );
    expect(text.selection.block).toBe('text');
    expect(text.selection.textBlock).toBe(true);
    expect(text.selection.box).toBe(false);
  });

  it('gives the caret in text the text focus', () => {
    const ctx = buildMenuContext(
      { document, slideId: RULE, selection: { text: true } },
      DEFAULT_SETTINGS,
      'win',
    );
    expect(ctx.focus).toBe('text');
    expect(ctx.platform).toBe('win');
    expect(ctx.selection.textBlock).toBe(true);
  });
});

describe('tailKindOf', () => {
  const slide = document.slides[RULE] as Slide;
  it('is the default tail with nothing selected and the text tail for a heading or the caret', () => {
    expect(tailKindOf(slide, null)).toBe('default');
    expect(tailKindOf(slide, { blockId: firstBlockOf(slide, 'heading')?.id })).toBe('text');
    expect(tailKindOf(slide, { text: true })).toBe('text');
  });
  it('is the text tail for a list (the focus round) and the image tail for a shot', () => {
    expect(tailKindOf(slide, { blockId: firstBlockOf(slide, 'plain')?.id })).toBe('text');
    const shot: Slide = {
      schemaVersion: 1,
      id: 'x',
      kind: 'content',
      layout: { type: 'center' },
      slots: {
        main: [
          { id: 'pic', type: 'shot', asset: 'a' } as Block,
          { id: 'ln', type: 'shape', shape: 'line' } as Block,
          { id: 'tb', type: 'table', columns: [{}], rows: [{ cells: [''] }] } as Block,
        ],
      },
    };
    expect(tailKindOf(shot, { blockId: 'pic' })).toBe('image');
    expect(tailKindOf(shot, { blockId: 'ln' })).toBe('line');
    expect(tailKindOf(shot, { blockId: 'tb' })).toBe('other');
    expect(tailKindOf(shot, { blockId: 'tb', cell: { row: 0, column: 0 } })).toBe('table');
  });
});

describe('menuActionPlan', () => {
  it('New slide inherits the current layout and lands after the current slide in its section', () => {
    const plan = menuActionPlan(itemById('slide.newSlide'), facts(RULE));
    expect('refused' in plan).toBe(false);
    if ('refused' in plan) return;
    expect(plan.action).toBe('slide.new');
    expect(plan.input.after).toBe(RULE);
    expect(plan.input.baseRevision).toBe(412);
    expect(typeof plan.input.layout).toBe('string');
    expect(plan.selectSlide).toBe('result');
  });

  it('New slide after a Title slide is Title and body, and the last picked layout wins', () => {
    const title = Object.values(document.slides).find((slide) => slide.kind === 'title');
    if (title !== undefined) {
      const plan = menuActionPlan(itemById('insert.newSlide'), facts(title.id));
      if (!('refused' in plan)) expect(plan.input.layout).toBe('split');
    }
    const remembered = menuActionPlan(
      itemById('slide.newSlide'),
      facts(RULE, undefined, { lastLayout: 'big-number' }),
    );
    if (!('refused' in remembered)) expect(remembered.input.layout).toBe('big-number');
  });

  it('Duplicate and Skip act on the selected slides in one write; Skip reads Unskip on a skipped slide', () => {
    const duplicate = menuActionPlan(
      itemById('slide.duplicateSlide'),
      facts(RULE, undefined, { selectedSlideIds: [RULE, FIRST] }),
    );
    expect(duplicate).toMatchObject({
      action: 'slide.duplicate',
      input: { slideIds: [RULE, FIRST], baseRevision: 412 },
    });
    const skip = menuActionPlan(itemById('slide.skipSlide'), facts(RULE));
    expect(skip).toMatchObject({ action: 'slide.skip', input: { slideIds: [RULE], skip: true } });
    /* Slide > Delete slide removes every selected slide, one write each (docs/FOCUS.md rank 22:
       the menu removed one of two selected cards); one card is one write and no batch */
    const removeTwo = menuActionPlan(
      itemById('slide.deleteSlide'),
      facts(RULE, undefined, { selectedSlideIds: [RULE, FIRST] }),
    );
    expect(removeTwo).toMatchObject({
      action: 'slide.remove',
      input: { slideId: RULE, baseRevision: 412 },
      batch: [
        { slideId: RULE, baseRevision: 412 },
        { slideId: FIRST, baseRevision: 412 },
      ],
      snackbar: 'Deleted 2 slides',
      undo: true,
    });
    const removeOne = menuActionPlan(itemById('slide.deleteSlide'), facts(RULE));
    expect(removeOne).toMatchObject({
      action: 'slide.remove',
      input: { slideId: RULE },
      snackbar: 'Slide deleted',
    });
    expect('batch' in removeOne).toBe(false);
    /* Edit > Duplicate is a client item (Cmd+D); with no block selected it plans slide.duplicate
       (measured on the dev server: the plan refused it as having no action, integrator merge 2) */
    const edit = menuActionPlan(itemById('edit.duplicate'), facts(RULE));
    expect(edit).toMatchObject({ action: 'slide.duplicate', input: { slideIds: [RULE] } });
  });

  it('Move slide up refuses on the first slide and names the slide before on the others', () => {
    const first = menuActionPlan(itemById('slide.moveSlide.up'), facts(FIRST));
    expect(first).toEqual({ refused: 'The slide is first' });
    const up = menuActionPlan(itemById('slide.moveSlide.up'), facts(RULE));
    expect('refused' in up).toBe(false);
    if (!('refused' in up)) expect(up.action).toBe('slide.move');
  });

  it('Bold toggles weight 500 on the selected text block and refuses with nothing selected', () => {
    const slide = document.slides[RULE] as Slide;
    const heading = firstBlockOf(slide, 'heading') as Block;
    const bold = menuActionPlan(itemById('format.text.bold'), facts(RULE, { blockId: heading.id }));
    expect(bold).toMatchObject({
      action: 'block.set',
      input: { blockId: heading.id, path: '/typography', value: { weight: 500 } },
    });
    expect(menuActionPlan(itemById('format.text.bold'), facts(RULE))).toEqual({
      refused: 'Select a text block first',
    });
  });

  it('Increase font size steps the ladder and Align writes the alignment', () => {
    const slide = document.slides[RULE] as Slide;
    const heading = firstBlockOf(slide, 'heading') as Block;
    const bigger = menuActionPlan(
      itemById('format.text.size.increase'),
      facts(RULE, { blockId: heading.id }),
    );
    expect('refused' in bigger).toBe(false);
    if (!('refused' in bigger))
      expect((bigger.input.value as { size: number }).size).toBeGreaterThan(0);
    const right = menuActionPlan(
      itemById('format.alignIndent.right'),
      facts(RULE, { blockId: heading.id }),
    );
    expect(right).toMatchObject({
      action: 'block.set',
      input: { path: '/typography', value: { align: 'right' } },
    });
  });

  it('Increase and Decrease font size on a list write /size on the ladder 20, 22, 24 (F-list-size, b1 R22)', () => {
    /* a `plain` block has no typography field, so the `/typography` write the text branch made
       was dropped by the schema and the row wrote nothing (docs/FOCUS.md
       `text.format-menu.size-increase` on a list); the list's size lives at /size */
    const slide = document.slides[RULE] as Slide;
    const list = firstBlockOf(slide, 'plain') as Block;
    const bigger = menuActionPlan(
      itemById('format.text.size.increase'),
      facts(RULE, { blockId: list.id }),
    );
    expect(bigger).toMatchObject({
      action: 'block.set',
      input: { blockId: list.id, path: '/size', value: 22 },
    });
    const smaller = menuActionPlan(
      itemById('format.text.size.decrease'),
      facts(RULE, { blockId: list.id }),
    );
    expect(smaller).toMatchObject({
      action: 'block.set',
      input: { blockId: list.id, path: '/size', value: 20 },
    });
    expect(stepPlainSize(undefined, 1)).toBe(22);
    expect(stepPlainSize(22, 1)).toBe(24);
    expect(stepPlainSize(24, 1)).toBe(24);
    expect(stepPlainSize(22, -1)).toBe(20);
    expect(stepPlainSize(20, -1)).toBe(20);
  });

  it('a zoom step from Fit starts at the stage scale, not at 100 (F-zoom-fit, b1 R20)', () => {
    /* at Fit the controller reports no number; the shell reads the stage's live scale through
       the handle's `scale()` and steps from it: 0.705 is 71 percent, whose next rung is 75 and
       whose previous is 50 (docs/FOCUS.md `arrange.zoom.menu-in`: "71% -> 125%, expected 75") */
    expect(zoomStepFrom(effectiveZoomPercent('fit', 0.705), 1)).toBe(75);
    expect(zoomStepFrom(effectiveZoomPercent('fit', 0.705), -1)).toBe(50);
    /* without a scale the effective percent stays 100 (a route with no stage) */
    expect(zoomStepFrom(effectiveZoomPercent('fit', undefined), 1)).toBe(125);
  });

  it('Bulleted list is one text.list with the first bullet preset; on a bulleted list it returns to the ruled form (SPEC-2 0.4)', () => {
    const slide = document.slides[RULE] as Slide;
    const paragraph = firstBlockOf(slide, 'paragraph') as Block;
    const plan = menuActionPlan(
      itemById('format.bulletsNumbering.bulleted'),
      facts(RULE, { blockId: paragraph.id }),
    );
    expect(plan).toMatchObject({
      action: 'text.list',
      input: {
        slideId: RULE,
        blockId: paragraph.id,
        marker: 'bullet',
        preset: FIRST_BULLET_PRESET,
      },
    });
    const numbered = menuActionPlan(
      itemById('format.bulletsNumbering.numbered'),
      facts(RULE, { blockId: paragraph.id }),
    );
    expect(numbered).toMatchObject({ input: { marker: 'number', preset: FIRST_NUMBER_PRESET } });
    const bulleted: Slide = {
      schemaVersion: 1,
      id: 'bul',
      kind: 'content',
      layout: { type: 'center' },
      slots: {
        main: [{ id: 'l', type: 'plain', marker: 'bullet', items: [{ text: 'a' }] } as Block],
      },
    };
    const doc: DeckDocument = {
      deck: document.deck,
      slides: { ...document.slides, bul: bulleted },
    };
    expect(
      menuActionPlan(itemById('format.bulletsNumbering.bulleted'), {
        ...facts('bul', { blockId: 'l' }),
        document: doc,
      }),
    ).toMatchObject({ action: 'text.list', input: { marker: 'rule' } });
    const list = listFrom(
      { id: 'p', type: 'paragraph', text: 'One\nTwo' } as Block,
      true,
    ) as Block & { items: unknown[]; numbered?: true };
    expect(list.items).toHaveLength(2);
    expect(list.numbered).toBe(true);
  });

  it('a table row is one of the table actions through the table plans; Delete table removes the block', () => {
    const table: Slide = {
      schemaVersion: 1,
      id: 'tbl',
      kind: 'content',
      layout: { type: 'center' },
      slots: {
        main: [
          {
            id: 't',
            type: 'table',
            columns: [{}, {}],
            rows: [{ cells: ['a', 'b'], header: true }, { cells: ['c', 'd'] }],
          } as Block,
        ],
      },
    };
    const doc: DeckDocument = { deck: document.deck, slides: { ...document.slides, tbl: table } };
    const base = { ...facts('tbl', { blockId: 't', cell: { row: 1, column: 0 } }), document: doc };
    const above = menuActionPlan(itemById('format.table.insertRowAbove'), base);
    expect(above).toMatchObject({
      action: 'table.insertRows',
      input: { slideId: 'tbl', blockId: 't', at: 1, count: 1, where: 'above', baseRevision: 412 },
      snackbar: 'Row added',
    });
    expect(menuActionPlan(itemById('format.table.mergeCells'), base)).toEqual({
      refused: 'Select two or more cells first',
    });
    expect(
      menuActionPlan(itemById('format.table.mergeCells'), {
        ...base,
        selection: {
          blockId: 't',
          cell: { row: 0, column: 0 },
          cells: { r0: 0, c0: 0, r1: 1, c1: 1 },
        },
      }),
    ).toMatchObject({ action: 'table.merge', input: { from: [0, 0], to: [1, 1] } });
    expect(menuActionPlan(itemById('format.table.deleteTable'), base)).toMatchObject({
      action: 'block.remove',
      input: { blockId: 't' },
    });
  });

  it('Clear formatting removes only the overrides that exist, as one write', () => {
    const styled: Slide = {
      schemaVersion: 1,
      id: 'sty',
      kind: 'content',
      layout: { type: 'center' },
      slots: {
        main: [{ id: 'b', type: 'box', fill: 'plate', typography: { weight: 500 } } as Block],
      },
    };
    const doc: DeckDocument = { deck: document.deck, slides: { ...document.slides, sty: styled } };
    const plan = menuActionPlan(itemById('format.clearFormatting'), {
      ...facts('sty', { blockId: 'b' }),
      document: doc,
    });
    expect('refused' in plan).toBe(false);
    if ('refused' in plan) return;
    expect((plan.input.mutations as Array<{ path: string }>).map((m) => m.path).sort()).toEqual([
      '/fill',
      '/typography',
    ]);
  });

  it('Move to trash names the deck and the snackbar with Undo; the zoom levels dispatch a factor', () => {
    expect(menuActionPlan(itemById('file.moveToTrash'), facts(RULE))).toMatchObject({
      action: 'deck.trash',
      input: { id: document.deck.id, baseRevision: 412 },
      snackbar: 'Moved to trash',
      undo: true,
    });
    expect(menuActionPlan(itemById('view.zoom.50'), facts(RULE))).toMatchObject({
      action: 'view.zoom',
      input: { zoom: 0.5 },
    });
    expect(menuActionPlan(itemById('view.zoom.fit'), facts(RULE))).toMatchObject({
      action: 'view.zoom',
      input: { zoom: 'fit' },
    });
  });

  it('every now item with an action effect builds a plan or a refusal sentence, never throws', () => {
    for (const item of allItems()) {
      if (item.status !== 'now' || item.effect === undefined) continue;
      if (item.effect.kind !== 'action') continue;
      const plan = menuActionPlan(item, facts(RULE));
      if ('refused' in plan) expect(plan.refused.length).toBeGreaterThan(0);
      else expect(plan.action).toBeTruthy();
    }
  });
});

// The Insert menu (SPEC 2.4; VERIFICATION 9.4): what each row does before its write, and the
// block.insert it makes when the shell has no canvas to draw on or the picker has chosen.
describe('the Insert menu', () => {
  /** The draft of /new: the blank template's one Title slide (SPEC 5.2). */
  function freshDocument(): DeckDocument {
    const title = LAYOUTS.find((entry) => entry.id === 'title');
    const slide = title?.make('fresh', document.deck, 'deck');
    if (slide === null || slide === undefined) throw new Error('the Title layout makes a slide');
    return {
      deck: { ...document.deck, sections: [{ id: 'deck', name: 'Deck', slideIds: ['fresh'] }] },
      slides: { fresh: slide },
    };
  }

  const INSERT_ACTION_ROWS = () =>
    allItems().filter(
      (item) =>
        item.id.startsWith('insert.') && item.status === 'now' && item.effect?.kind === 'action',
    );

  it('names the tool, the picker or the file picker of every row (SPEC 2.4, 3.1)', () => {
    const expected: Record<string, InsertIntent | null> = {
      'insert.textBox': { kind: 'tool', tool: { kind: 'text' } },
      'insert.shape.shapes.rectangle': {
        kind: 'tool',
        tool: { kind: 'shape', shape: 'rectangle' },
      },
      'insert.shape.shapes.rounded': { kind: 'tool', tool: { kind: 'shape', shape: 'rounded' } },
      'insert.shape.shapes.ellipse': { kind: 'tool', tool: { kind: 'shape', shape: 'ellipse' } },
      'insert.shape.arrows.arrow': { kind: 'tool', tool: { kind: 'line', line: 'arrow' } },
      'insert.line.line': { kind: 'tool', tool: { kind: 'line', line: 'line' } },
      'insert.line.arrow': { kind: 'tool', tool: { kind: 'line', line: 'arrow' } },
      'insert.line.rule': { kind: 'tool', tool: { kind: 'line', line: 'rule' } },
      'insert.line.elbowConnector': { kind: 'tool', tool: { kind: 'line', line: 'elbow' } },
      'insert.line.curvedConnector': { kind: 'tool', tool: { kind: 'line', line: 'curved' } },
      'insert.line.curve': { kind: 'tool', tool: { kind: 'line', line: 'curve' } },
      'insert.line.polyline': { kind: 'tool', tool: { kind: 'line', line: 'polyline' } },
      'insert.line.scribble': { kind: 'tool', tool: { kind: 'line', line: 'scribble' } },
      /* the chart rows plan the insert outright (SPEC-2 2.8.2) */
      'insert.chart.bar': null,
      /* Insert > Table is a hover grid inside the menu (SPEC-2 0.26); run as a command it plans the default table */
      'insert.table': null,
      'insert.icon': { kind: 'picker', picker: 'icon' },
      'insert.material': { kind: 'picker', picker: 'material' },
      'insert.image.upload': { kind: 'upload' },
      'insert.newSlide': null,
    };
    for (const [id, intent] of Object.entries(expected))
      expect(insertIntentOf(itemById(id)), id).toEqual(intent);
    /* the Replace image Upload from computer row opens the same file picker (Change background is
       one Background dialog on every slide kind since SPEC-2 0.74) */
    expect(insertIntentOf(itemById('format.image.replaceImage.upload'))).toEqual({
      kind: 'upload',
    });
    expect(itemById('slide.changeBackground').items).toBeUndefined();
    expect(insertIntentOf(itemById('slide.deleteSlide'))).toBeNull();
    expect(MENUS.find((menu) => menu.id === 'insert')).toBeDefined();
  });

  it('every action row of Insert arms a tool, opens a picker or plans a write on a fresh presentation, never a refusal', () => {
    const fresh = freshDocument();
    const rows = INSERT_ACTION_ROWS();
    expect(rows.map((row) => row.id)).toContain('insert.textBox');
    /* Insert > Table is the hover grid plate (SPEC-2 0.26), not an action row; its default plan is tested below */
    expect(rows.map((row) => row.id)).not.toContain('insert.table');
    expect(itemById('insert.table').effect?.kind).toBe('submenu');
    for (const item of rows) {
      const intent = insertIntentOf(item);
      if (intent !== null) continue;
      const plan = menuActionPlan(item, {
        document: fresh,
        slideId: 'fresh',
        selectedSlideIds: ['fresh'],
        selection: null,
        revision: 1,
        lastLayout: null,
      });
      expect('refused' in plan, item.id).toBe(false);
    }
  });

  it('the write behind each row lands a valid block as an object centred on the sheet, in main, on every slide kind (SPEC-2 1.6)', () => {
    for (const item of INSERT_ACTION_ROWS()) {
      const intent = insertIntentOf(item);
      if (intent?.kind === 'upload' || intent?.kind === 'picker') continue;
      if (intent === null && !item.id.startsWith('insert.chart.')) continue;
      const plan = menuActionPlan(item, facts(RULE));
      expect('refused' in plan, item.id).toBe(false);
      if ('refused' in plan) continue;
      expect(plan.action).toBe('block.insert');
      expect(plan.input.slideId).toBe(RULE);
      expect(plan.input.slot).toBe('main');
      expect(plan.input.after).toBeUndefined();
      expect(plan.input.baseRevision).toBe(412);
      const block = plan.input.block as Block;
      expect(blockSchema.safeParse(block).success, `${item.id}: ${JSON.stringify(block)}`).toBe(
        true,
      );
      const pos = block.pos;
      expect(pos, item.id).toBeDefined();
      if (pos !== undefined) {
        expect(pos.x + pos.w / 2).toBeCloseTo(800, -1);
        expect(pos.y + pos.h / 2).toBeCloseTo(450, -1);
      }
      if (intent?.kind === 'tool') {
        expect(block.type).toBe(drawToolBlockType(intent.tool));
        const { pos: _pos, ...made } = block;
        expect(made).toEqual(drawToolBlock(intent.tool, block.id));
        expect([pos?.w, pos?.h]).toEqual(TOOL_SIZES[intent.tool.kind]);
      }
    }
    const table = menuActionPlan(itemById('insert.table'), facts(RULE));
    expect('refused' in table).toBe(false);
    if (!('refused' in table)) {
      const block = table.input.block as TableBlock & { pos?: { w: number; h: number } };
      expect(block.columns).toHaveLength(DEFAULT_TABLE_SIZE.columns);
      expect(block.rows).toHaveLength(DEFAULT_TABLE_SIZE.rows);
      expect(block.rows[0]?.header).toBe(true);
      expect([block.pos?.w, block.pos?.h]).toEqual([960, 320]);
    }
    const chart = menuActionPlan(itemById('insert.chart.pie'), facts(RULE));
    expect(chart).toMatchObject({
      action: 'block.insert',
      input: { slot: 'main', block: { type: 'chart', kind: 'pie', pos: { w: 960, h: 540 } } },
    });
    /* a selected block does not move the insert into its slot any more: the object lands centred */
    const heading = firstBlockOf(document.slides[RULE] as Slide, 'heading');
    const after = menuActionPlan(itemById('insert.textBox'), facts(RULE, { blockId: heading?.id }));
    expect(after).toMatchObject({ action: 'block.insert', input: { slot: 'main' } });
    expect('action' in after ? after.input : {}).not.toHaveProperty('after');
    /* the ids stay free: a second text box on a slide with one is text-2 */
    const text = drawToolBlock({ kind: 'text' }, 'text');
    expect(text).toEqual({ id: 'text', type: 'text', text: '', autofit: 'grow' });
    expect(drawToolBlock({ kind: 'line', line: 'rule' }, 'r')).toEqual({
      id: 'r',
      type: 'rule',
      orientation: 'horizontal',
    });
    expect(drawToolBlock({ kind: 'line', line: 'arrow' }, 's')).toEqual({
      id: 's',
      type: 'shape',
      shape: 'arrow',
    });
    expect(drawToolBlock({ kind: 'line', line: 'polyline' }, 'l')).toMatchObject({
      type: 'shape',
      shape: 'polyline',
    });
    expect(drawToolBlock({ kind: 'wordArt', text: 'Hi' }, 'w')).toMatchObject({
      type: 'text',
      text: 'Hi',
      outline: { color: 'ink', width: 1.5 },
      typography: { size: 88, weight: 500 },
    });
  });

  it('on a freeform slide the block carries a position box; a table takes 960 by 320 (SPEC 7.3)', () => {
    const free = freeformDocument();
    const at: ActionFacts = {
      document: free,
      slideId: FREEFORM_SLIDE.id,
      selectedSlideIds: [FREEFORM_SLIDE.id],
      selection: null,
      revision: 3,
      lastLayout: null,
    };
    const text = menuActionPlan(itemById('insert.textBox'), at);
    expect(text).toMatchObject({ input: { slot: 'main', block: { type: 'text' } } });
    /* the box is the tool's default size centred on the sheet (SPEC-2 6.2) */
    if (!('refused' in text)) {
      const pos = (text.input.block as Block).pos;
      expect(pos).toBeDefined();
      expect(Math.abs((pos?.w ?? 0) - 480)).toBeLessThanOrEqual(8);
      expect(Math.abs((pos?.h ?? 0) - 64)).toBeLessThanOrEqual(8);
    }
    const table = insertBlockPlan(
      at,
      'table',
      (id) => ({ id, type: 'table', columns: [{}], rows: [{ cells: [''], header: true }] }),
      'Table',
    );
    expect('refused' in table).toBe(false);
    if (!('refused' in table)) {
      const pos = (table.input.block as Block).pos;
      expect(Math.abs((pos?.w ?? 0) - 960)).toBeLessThanOrEqual(8);
      expect(Math.abs((pos?.h ?? 0) - 320)).toBeLessThanOrEqual(8);
    }
  });

  it('a Title slide and a picture layout take the insert as an object: the first insert converts the slide (SPEC-2 1.6)', () => {
    const fresh = freshDocument();
    const at: ActionFacts = {
      document: fresh,
      slideId: 'fresh',
      selectedSlideIds: ['fresh'],
      selection: null,
      revision: 1,
      lastLayout: null,
    };
    expect(menuActionPlan(itemById('insert.textBox'), at)).toMatchObject({
      action: 'block.insert',
      input: { slideId: 'fresh', slot: 'main', block: { type: 'text', pos: { w: 480, h: 64 } } },
    });
    const opener = Object.values(document.slides).find((slide) => slide.kind === 'opener');
    if (opener !== undefined) {
      const plan = menuActionPlan(itemById('insert.shape.shapes.ellipse'), facts(opener.id));
      expect(plan).toMatchObject({
        action: 'block.insert',
        input: { slot: 'main', block: { shape: 'ellipse' } },
      });
    }
  });

  it('a picked picture lands where the row says: a new block, the selected block, or the slide', () => {
    expect(pictureTargetOf('insert.image.upload', RULE, 'p1')).toEqual({
      kind: 'insert',
      slideId: RULE,
    });
    expect(pictureTargetOf('format.image.replaceImage.upload', RULE, 'shot')).toEqual({
      kind: 'block',
      slideId: RULE,
      blockId: 'shot',
      path: '/asset',
    });
    expect(pictureTargetOf('format.image.replaceImage.byUrl', RULE, undefined)).toEqual({
      kind: 'insert',
      slideId: RULE,
    });
    /* the Background dialog's Choose image (SPEC-2 0.74, 2.6.4) names the picture object at the bottom of the stack */
    expect(pictureTargetOf('slide.changeBackground', RULE, 'p1')).toEqual({
      kind: 'background',
      slideId: RULE,
    });
    const built = factsOf({
      deckId: document.deck.id,
      document,
      slideId: RULE,
      revision: 9,
      dispatch: () => Promise.resolve({}),
    });
    expect(built).toMatchObject({ slideId: RULE, selectedSlideIds: [RULE], revision: 9 });
  });
});

describe('the retired letters, the ladder and the stored settings', () => {
  it('words the one time sentence of SPEC 0.28', () => {
    expect(retiredKeySentence('s')).toBe('S now hides the filmstrip from the View menu');
    expect(retiredKeySentence('[')).toBe('[ now hides the filmstrip from the View menu');
    expect(retiredKeySentence('?')).toBe('? now shows the keyboard shortcuts from the Help menu');
    expect(retiredKeySentence('x')).toBeNull();
  });
  it('steps the type ladder in both directions and stops at the ends', () => {
    expect(stepLadder(20, 1)).toBe(22);
    expect(stepLadder(20, -1)).toBe(18);
    expect(stepLadder(88, 1)).toBe(88);
    expect(stepLadder(15, -1)).toBe(15);
    expect(stepLadder(21, 1)).toBe(24);
  });
  it('round trips the per browser settings and ignores unknown keys', () => {
    const written = writeStoredSettings({
      ...DEFAULT_SETTINGS,
      snapGrid: true,
      showIds: true,
      compact: true,
    });
    const read = readStoredSettings(written);
    expect(read.snapGrid).toBe(true);
    expect(read.showIds).toBe(true);
    expect(read.compact).toBeUndefined();
    expect(readStoredSettings('not json')).toEqual({});
    expect(readStoredSettings(null)).toEqual({});
  });
  it('keeps Tools > Advanced tools off by default and remembers it with the other stored settings (docs/FOCUS.md 3.1)', () => {
    expect(DEFAULT_SETTINGS.advancedTools).toBe(false);
    expect(STORED_SETTINGS).toContain('advancedTools');
    const written = writeStoredSettings({ ...DEFAULT_SETTINGS, advancedTools: true });
    expect(readStoredSettings(written).advancedTools).toBe(true);
    expect(readStoredSettings(writeStoredSettings(DEFAULT_SETTINGS)).advancedTools).toBe(false);
  });
});

describe('panel and dialog ids', () => {
  it('resolve every panel and dialog title of the menu model', () => {
    for (const item of allItems()) {
      if (item.status !== 'now' || item.effect === undefined) continue;
      if (item.effect.kind === 'panel')
        expect(panelIdOfTitle(item.effect.title), item.id).not.toBeNull();
      if (item.effect.kind === 'dialog')
        expect(dialogIdOf(item.effect.title, item.id), item.id).not.toBeNull();
    }
    expect(dialogIdOf('Download', 'file.download.pdf')).toBe('downloadPdf');
    expect(dialogIdOf('Download', 'file.download.pptx')).toBe('download');
    expect(PANEL_IDS).toContain('checkSlides');
    expect(DIALOG_IDS).toContain('agentAccess');
  });
});

describe('Arrange > Order on a grammar slide (SPEC-2 6.1 row 13)', () => {
  const at = (blockId: string) =>
    buildMenuContext({ document, slideId: RULE, selection: { blockId } }, DEFAULT_SETTINGS, 'mac')
      .selection.order;

  it('reads the rows from the place of the block in document order, the z the first pick gives it: forward and front when it is not last, backward and back when it is not first', () => {
    expect(at('h')).toEqual({ forward: true, front: true, backward: false, back: false });
    expect(at('p1')).toEqual({ forward: true, front: true, backward: true, back: true });
    expect(at('list')).toEqual({ forward: false, front: false, backward: true, back: true });
  });

  it('plans one block.order on every slide kind; the store action converts a slide that is not a canvas yet', () => {
    expect(
      menuActionPlan(itemById('arrange.order.bringForward'), facts(RULE, { blockId: 'p1' })),
    ).toMatchObject({
      action: 'block.order',
      input: { slideId: RULE, blockId: 'p1', move: 'forward', baseRevision: 412 },
    });
    expect(
      menuActionPlan(itemById('arrange.order.sendToBack'), facts(RULE, { blockId: 'h' })),
    ).toMatchObject({ action: 'block.order', input: { blockId: 'h', move: 'back' } });
    expect(menuActionPlan(itemById('arrange.order.sendToBack'), facts(RULE))).toEqual({
      refused: 'Select an object on the slide first',
    });
  });

  it('reads the rows from the rank in the paint order on a canvas, a missing z sorting as 0 (b4 C2-R3)', () => {
    /* the walk placed three text boxes through block.insert; the first got no z and the store
       gave the next two 1 and 2: the four Order rows were drawn disabled for the first box while
       Cmd+Shift+Up moved it. The rank in `sortByZ` is the fact, not the z alone */
    const box = (id: string, z?: number): Block =>
      ({
        id,
        type: 'text',
        text: id,
        pos: { x: 100, y: 100, w: 200, h: 100, ...(z === undefined ? {} : { z }) },
      }) as unknown as Block;
    const canvas: Slide = {
      schemaVersion: 1,
      id: 'cv',
      kind: 'content',
      layout: { type: 'freeform' },
      slots: { main: [box('a1'), box('a2', 1), box('a3', 2)] },
    };
    const doc: DeckDocument = { deck: document.deck, slides: { cv: canvas } };
    const orderOf = (blockId: string) =>
      buildMenuContext(
        { document: doc, slideId: 'cv', selection: { blockId } },
        DEFAULT_SETTINGS,
        'mac',
      ).selection.order;
    expect(orderOf('a1')).toEqual({ forward: true, front: true, backward: false, back: false });
    expect(orderOf('a2')).toEqual({ forward: true, front: true, backward: true, back: true });
    expect(orderOf('a3')).toEqual({ forward: false, front: false, backward: true, back: true });
    /* two boxes with no z at all: document order breaks the tie, so each can move one way */
    const tied: DeckDocument = {
      ...doc,
      slides: { cv: { ...canvas, slots: { main: [box('b1'), box('b2')] } } },
    };
    const tiedOrder = (blockId: string) =>
      buildMenuContext(
        { document: tied, slideId: 'cv', selection: { blockId } },
        DEFAULT_SETTINGS,
        'mac',
      ).selection.order;
    expect(tiedOrder('b1')).toEqual({ forward: true, front: true, backward: false, back: false });
    expect(tiedOrder('b2')).toEqual({ forward: false, front: false, backward: true, back: true });
  });

  it('keeps the paint order on a freeform slide', () => {
    const doc = freeformDocument();
    const slide = doc.slides[FREEFORM_SLIDE.id];
    const first = slide === undefined ? undefined : slideBlocksOf(slide)[0];
    expect(first).toBeDefined();
    const plan = menuActionPlan(itemById('arrange.order.bringToFront'), {
      ...facts(FREEFORM_SLIDE.id, { blockId: first?.id }),
      document: doc,
    });
    expect(plan).toMatchObject({ action: 'block.order', input: { move: 'front' } });
  });
});

function slideBlocksOf(slide: Slide): Block[] {
  if (slide.kind !== 'content') return [];
  return Object.values(slide.slots).flatMap((blocks) => blocks ?? []);
}

describe('the round two plans (SPEC-2 sections 3, 4, 6)', () => {
  const styled: Slide = {
    schemaVersion: 1,
    id: 'r2',
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        {
          id: 't',
          type: 'text',
          text: 'Hello [world]{i}',
          pos: { x: 100, y: 100, w: 480, h: 64, z: 0 },
        } as Block,
        {
          id: 's',
          type: 'shape',
          shape: 'rect',
          pos: { x: 700, y: 100, w: 240, h: 160, z: 1, group: 'g1' },
        } as Block,
        {
          id: 'u',
          type: 'shape',
          shape: 'ellipse',
          pos: { x: 700, y: 400, w: 240, h: 160, z: 2, group: 'g1' },
        } as Block,
        {
          id: 'ln',
          type: 'shape',
          shape: 'arrow',
          pos: { x: 100, y: 400, w: 320, h: 8, z: 3 },
        } as Block,
        {
          id: 'pic',
          type: 'picture',
          asset: 'a',
          pos: { x: 0, y: 0, w: 1600, h: 900, z: -1 },
        } as Block,
      ],
    },
  };
  const doc: DeckDocument = { deck: document.deck, slides: { ...document.slides, r2: styled } };
  const at = (selection?: EditorSelection, extra: Partial<ActionFacts> = {}): ActionFacts => ({
    ...facts('r2', selection, extra),
    document: doc,
  });

  it('Italic toggles the mark over the caret range, else the whole Text; a second Italic clears it', () => {
    const whole = menuActionPlan(itemById('format.text.italic'), at({ blockId: 't' }));
    expect(whole).toMatchObject({
      action: 'text.style',
      input: { slideId: 'r2', blockId: 't', path: '/text', range: [0, 11], marks: { i: true } },
    });
    const ranged = menuActionPlan(
      itemById('format.text.underline'),
      at({ blockId: 't', text: true, range: [6, 11], marks: { i: true } }),
    );
    expect(ranged).toMatchObject({ input: { range: [6, 11], marks: { u: true } } });
    const off = menuActionPlan(
      itemById('format.text.italic'),
      at({ blockId: 't', text: true, range: [6, 11], marks: { i: true } }),
    );
    expect(off).toMatchObject({ input: { marks: { i: false } } });
    /* superscript clears subscript (2.2.4) */
    expect(menuActionPlan(itemById('format.text.superscript'), at({ blockId: 't' }))).toMatchObject(
      {
        input: { marks: { sup: true, sub: false } },
      },
    );
    expect(
      menuActionPlan(itemById('format.text.capitalization.upper'), at({ blockId: 't' })),
    ).toMatchObject({
      action: 'text.case',
      input: { path: '/text', range: [0, 11], mode: 'upper' },
    });
    expect(menuActionPlan(itemById('format.text.italic'), at())).toEqual({
      refused: 'Select a text block first',
    });
  });

  it('the indents step a paragraph by one and a list item by level; the spacing rows toggle 8 px; Justified writes the alignment', () => {
    expect(
      menuActionPlan(itemById('format.alignIndent.increaseIndent'), at({ blockId: 't' })),
    ).toMatchObject({
      action: 'text.indent',
      input: { blockIds: ['t'], by: 1 },
    });
    expect(
      menuActionPlan(itemById('format.spacing.addBefore'), at({ blockId: 't' })),
    ).toMatchObject({
      action: 'text.spacing',
      input: { blockIds: ['t'], before: 8 },
    });
    expect(
      menuActionPlan(itemById('format.alignIndent.justified'), at({ blockId: 't' })),
    ).toMatchObject({
      action: 'block.set',
      input: { path: '/typography', value: { align: 'justify' } },
    });
  });

  it('Rotate, Flip, Group and Ungroup plan one action over the selection; a group rotates about the selection', () => {
    expect(
      menuActionPlan(itemById('arrange.rotate.clockwise'), at({ blockId: 's' })),
    ).toMatchObject({
      action: 'block.rotate',
      input: { blockIds: ['s'], by: 90 },
    });
    const group = at({ blockId: 's', blockIds: ['s', 'u'], group: 'g1' });
    expect(menuActionPlan(itemById('arrange.rotate.counterClockwise'), group)).toMatchObject({
      input: { blockIds: ['s', 'u'], by: -90, about: 'selection' },
    });
    expect(menuActionPlan(itemById('arrange.rotate.flipHorizontally'), group)).toMatchObject({
      action: 'block.flip',
      input: { axis: 'h', about: 'selection' },
    });
    expect(
      menuActionPlan(itemById('arrange.group'), at({ blockId: 't', blockIds: ['t', 'ln'] })),
    ).toMatchObject({
      action: 'block.group',
      input: { blockIds: ['t', 'ln'] },
    });
    expect(menuActionPlan(itemById('arrange.group'), at({ blockId: 't' }))).toEqual({
      refused: 'Select two or more objects on the slide first',
    });
    expect(menuActionPlan(itemById('arrange.ungroup'), group)).toMatchObject({
      action: 'block.ungroup',
      input: { group: 'g1' },
    });
    expect(menuActionPlan(itemById('arrange.regroup'), at({ blockId: 's' }))).toEqual({
      refused: 'Available after Ungroup, while the objects are still on the slide',
    });
    expect(
      menuActionPlan(
        itemById('arrange.regroup'),
        at({ blockId: 's' }, { regroup: { blockIds: ['s', 'u'], group: 'g1' } }),
      ),
    ).toMatchObject({ action: 'block.regroup', input: { blockIds: ['s', 'u'], group: 'g1' } });
  });

  it('Align with one object goes to the sheet, with several to the selection; Center on page always to the sheet (0.80)', () => {
    expect(menuActionPlan(itemById('arrange.align.left'), at({ blockId: 's' }))).toMatchObject({
      action: 'block.align',
      input: { blockIds: ['s'], edge: 'left', to: 'sheet' },
    });
    expect(
      menuActionPlan(itemById('arrange.align.top'), at({ blockId: 's', blockIds: ['s', 'u'] })),
    ).toMatchObject({
      input: { edge: 'top', to: 'selection' },
    });
    expect(
      menuActionPlan(
        itemById('arrange.centerOnPage.horizontally'),
        at({ blockId: 's', blockIds: ['s', 'u'] }),
      ),
    ).toMatchObject({
      input: { edge: 'center', to: 'sheet' },
    });
    expect(
      menuActionPlan(
        itemById('arrange.distribute.horizontally'),
        at({ blockId: 's', blockIds: ['s', 'u', 't'] }),
      ),
    ).toMatchObject({
      action: 'block.distribute',
      input: { axis: 'horizontal' },
    });
  });

  it('the View guide rows write deck.guides with the revision; Delete guide needs the guide under the pointer', () => {
    expect(menuActionPlan(itemById('view.guides.addVertical'), at())).toMatchObject({
      action: 'deck.guides',
      input: { add: [{ axis: 'x', at: 800 }], baseRevision: 412 },
    });
    expect(menuActionPlan(itemById('view.guides.clear'), at())).toMatchObject({
      action: 'deck.guides',
      input: { clear: true, baseRevision: 412 },
    });
    expect(menuActionPlan(itemById('view.guides.delete'), at())).toEqual({
      refused: 'Right-click a guide to delete it',
    });
    expect(
      menuActionPlan(
        itemById('view.guides.delete'),
        at(undefined, { guide: { axis: 'y', at: 450 } }),
      ),
    ).toMatchObject({
      input: { remove: [{ axis: 'y', at: 450 }] },
    });
  });

  it('a Border dash row writes the dash by block type; a Line end row writes line.set; Reset image and Chart type plan their actions', () => {
    expect(
      menuActionPlan(itemById('format.bordersLines.borderDash.dot'), at({ blockId: 's' })),
    ).toMatchObject({
      action: 'shape.set',
      input: { blockIds: ['s'], dash: 'dot' },
    });
    expect(
      menuActionPlan(itemById('format.bordersLines.borderDash.solid'), at({ blockId: 'pic' })),
    ).toMatchObject({
      action: 'block.set',
      input: { blockId: 'pic', path: '/frame' },
    });
    expect(
      menuActionPlan(itemById('format.bordersLines.lineEnd.fillCircle'), at({ blockId: 'ln' })),
    ).toMatchObject({
      action: 'line.set',
      input: { blockIds: ['ln'], end: 'fillCircle' },
    });
    expect(
      menuActionPlan(itemById('format.bordersLines.lineStart.none'), at({ blockId: 's' })),
    ).toEqual({
      refused: 'Select a line first',
    });
    expect(
      menuActionPlan(itemById('format.image.resetImage'), at({ blockId: 'pic' })),
    ).toMatchObject({
      action: 'block.resetImage',
      input: { blockId: 'pic' },
    });
    expect(menuActionPlan(itemById('format.chartType.pie'), at({ blockId: 's' }))).toEqual({
      refused: 'Select a chart first',
    });
  });

  it('the shape picker plans a mask on a picture, a change of shape on a shape and an insert from an Insert row', () => {
    expect(
      shapePickPlan(itemById('format.image.maskImage'), at({ blockId: 'pic' }), 'ellipse'),
    ).toMatchObject({
      action: 'block.mask',
      input: { blockId: 'pic', mask: 'ellipse' },
    });
    expect(
      shapePickPlan(itemById('format.changeShape'), at({ blockId: 's' }), 'hexagon'),
    ).toMatchObject({
      action: 'shape.set',
      input: { blockIds: ['s'], kind: 'hexagon' },
    });
    expect(shapePickPlan(itemById('insert.shape.callouts'), at(), 'cloudCallout')).toMatchObject({
      action: 'block.insert',
      input: {
        slot: 'main',
        block: { type: 'shape', shape: 'cloudCallout', pos: { w: 240, h: 160 } },
      },
    });
    expect(shapeDrawTool('rightArrow')).toEqual({ kind: 'shape', shape: 'rightArrow' });
    expect(shapeDrawTool('elbow')).toEqual({ kind: 'line', line: 'elbow' });
  });

  it('a group write lands on every member that has the field, in one slide.update (0.102)', () => {
    const plan = memberWritePlan(
      at({ blockId: 's', blockIds: ['s', 'u', 't'] }),
      'fill',
      'plate',
      'Fill color',
    );
    expect(plan).toMatchObject({ action: 'slide.update' });
    if (!('refused' in plan)) {
      const mutations = plan.input.mutations as Array<{
        blockId: string;
        path: string;
        value: unknown;
      }>;
      expect(mutations.map((m) => m.blockId)).toEqual(['s', 'u']);
      expect(mutations.every((m) => m.path === '/fill' && m.value === 'plate')).toBe(true);
    }
    expect(memberWritePlan(at({ blockId: 't' }), 'fill', 'plate', 'Fill color')).toEqual({
      refused: 'None of the selected objects has that field',
    });
  });

  it('the zoom ladder steps from the effective percent and clamps to 25 and 1600 (0.81, 0.101)', () => {
    expect(ZOOM_LADDER).toEqual([25, 50, 75, 100, 125, 150, 200, 300, 400, 800, 1600]);
    expect(zoomStepFrom(100, 1)).toBe(125);
    expect(zoomStepFrom(100, -1)).toBe(75);
    /* an off ladder percent steps to the next rung on either side (docs/FOCUS.md rank 23 and the
       row arrange.zoom.menu-in: the fit's 71 percent zooms in to 75; before the focus round the
       nearest rung's neighbour was taken, 63 up landed on 100) */
    expect(zoomStepFrom(63, 1)).toBe(75);
    expect(zoomStepFrom(63, -1)).toBe(50);
    expect(zoomStepFrom(71, 1)).toBe(75);
    expect(zoomStepFrom(71, -1)).toBe(50);
    expect(zoomStepFrom(150, 1)).toBe(200);
    expect(zoomStepFrom(1600, 1)).toBe(1600);
    expect(zoomStepFrom(25, -1)).toBe(25);
    expect(clampZoomPercent(9999)).toBe(1600);
    expect(clampZoomPercent(3)).toBe(25);
    expect(effectiveZoomPercent('fit', 0.63)).toBe(63);
    expect(effectiveZoomPercent('fit', undefined)).toBe(100);
    expect(effectiveZoomPercent('200', 0.5)).toBe(200);
  });

  it('the menu context reads the round two facts from the document: the group, the covering picture, the guides, the word art outline', () => {
    const ctx = buildMenuContext(
      { document: doc, slideId: 'r2', selection: { blockId: 's', blockIds: ['s', 'u'] } },
      DEFAULT_SETTINGS,
      'mac',
    );
    expect(ctx.selection.group).toBe('g1');
    expect(ctx.selection.object).toBe(true);
    expect(ctx.selection.blocks).toBe(2);
    const covering = buildMenuContext(
      { document: doc, slideId: 'r2', selection: { blockId: 'pic' } },
      DEFAULT_SETTINGS,
      'mac',
    );
    expect(covering.selection.coversSheet).toBe(true);
    expect(covering.selection.block).toBe('image');
    const withGuides: DeckDocument = { ...doc, deck: { ...doc.deck, guides: { x: [800], y: [] } } };
    expect(
      buildMenuContext(
        { document: withGuides, slideId: 'r2', selection: null },
        DEFAULT_SETTINGS,
        'mac',
      ).guides,
    ).toBe(1);
    /* a Title slide's heading is an object to the menus (1.1) */
    const title = Object.values(document.slides).find((slide) => slide.kind === 'title');
    if (title !== undefined) {
      const onTitle = buildMenuContext(
        { document, slideId: title.id, selection: { blockId: 'heading' } },
        DEFAULT_SETTINGS,
        'mac',
      );
      expect(onTitle.selection.object).toBe(true);
      expect(onTitle.selection.textBlock).toBe(true);
      expect(onTitle.selection.rotatable).toBe(true);
    }
    /* the rulers and guides are stored per browser and start hidden (0.77) */
    expect(STORED_SETTINGS).toContain('showRuler');
    expect(STORED_SETTINGS).toContain('showGuides');
    expect(DEFAULT_SETTINGS.showRuler).toBe(false);
    expect(DEFAULT_SETTINGS.showGuides).toBe(false);
  });

  it('tailKindOf names the chart and group tails; blockFamily names a chart, a picture and the line kinds', () => {
    expect(
      blockFamily({
        id: 'c',
        type: 'chart',
        kind: 'bar',
        categories: ['a'],
        series: [{ name: 's', values: [1] }],
      } as Block),
    ).toBe('chart');
    expect(blockFamily({ id: 'p', type: 'picture', asset: 'a' } as Block)).toBe('image');
    expect(blockFamily({ id: 'e', type: 'shape', shape: 'elbow' } as Block)).toBe('line');
    expect(blockFamily({ id: 'h', type: 'shape', shape: 'hexagon' } as Block)).toBe('shape');
    expect(tailKindOf(styled, { blockId: 's', blockIds: ['s', 'u'] })).toBe('group');
    expect(tailKindOf(styled, { blockId: 's', blockIds: ['s', 't'] })).toBe('shape');
    expect(tailKindOf(styled, { blockId: 'pic' })).toBe('image');
  });
});
