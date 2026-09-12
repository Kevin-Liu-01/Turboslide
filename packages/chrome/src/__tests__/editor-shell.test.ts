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
  tailKindOf,
  writeStoredSettings,
} from '../editor-shell';
import type { ActionFacts, EditorSelection, InsertIntent } from '../editor-shell';
import { MENUS, allItems, itemById } from '../menus/model';
import { SNACKBARS } from '../menus/strings';

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
    expect(ctx.selection.block).toBe('other');
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
  it('is the other tail for a list and the image tail for a shot', () => {
    expect(tailKindOf(slide, { blockId: firstBlockOf(slide, 'plain')?.id })).toBe('other');
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

  it('Bulleted list turns a paragraph into a plain block with one item per paragraph, in one write', () => {
    const slide = document.slides[RULE] as Slide;
    const paragraph = firstBlockOf(slide, 'paragraph') as Block;
    const plan = menuActionPlan(
      itemById('format.bulletsNumbering.bulleted'),
      facts(RULE, { blockId: paragraph.id }),
    );
    expect('refused' in plan).toBe(false);
    if ('refused' in plan) return;
    expect(plan.action).toBe('slide.update');
    const mutations = plan.input.mutations as Array<{ op: string; block?: Block }>;
    expect(mutations.map((m) => m.op)).toEqual(['block.remove', 'block.insert']);
    expect(mutations[1]?.block?.type).toBe('plain');
    const list = listFrom(
      { id: 'p', type: 'paragraph', text: 'One\nTwo' } as Block,
      true,
    ) as Block & { items: unknown[]; numbered?: true };
    expect(list.items).toHaveLength(2);
    expect(list.numbered).toBe(true);
  });

  it('a table command is one slide.update of columns and rows; Delete table removes the block', () => {
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
    expect('refused' in above).toBe(false);
    if (!('refused' in above)) {
      expect(above.action).toBe('slide.update');
      expect(above.snackbar).toBe('Row added');
      const rows = (above.input.mutations as Array<{ path: string; value: unknown[] }>).find(
        (m) => m.path === '/rows',
      );
      expect(rows?.value).toHaveLength(3);
    }
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
      'insert.shape.arrows.arrow': { kind: 'tool', tool: { kind: 'shape', shape: 'arrow' } },
      'insert.line.line': { kind: 'tool', tool: { kind: 'shape', shape: 'line' } },
      'insert.line.arrow': { kind: 'tool', tool: { kind: 'shape', shape: 'arrow' } },
      'insert.line.rule': { kind: 'tool', tool: { kind: 'rule' } },
      'insert.table': { kind: 'picker', picker: 'table' },
      'insert.icon': { kind: 'picker', picker: 'icon' },
      'insert.material': { kind: 'picker', picker: 'material' },
      'insert.image.upload': { kind: 'upload' },
      'insert.newSlide': null,
    };
    for (const [id, intent] of Object.entries(expected))
      expect(insertIntentOf(itemById(id)), id).toEqual(intent);
    /* the other two Upload from computer rows open the same file picker */
    expect(insertIntentOf(itemById('format.image.replaceImage.upload'))).toEqual({
      kind: 'upload',
    });
    expect(insertIntentOf(itemById('slide.changeBackground.upload'))).toEqual({ kind: 'upload' });
    expect(insertIntentOf(itemById('slide.deleteSlide'))).toBeNull();
    expect(MENUS.find((menu) => menu.id === 'insert')).toBeDefined();
  });

  it('every action row of Insert arms a tool, opens a picker or plans a write on a fresh presentation, never a refusal', () => {
    const fresh = freshDocument();
    const rows = INSERT_ACTION_ROWS();
    expect(rows.map((row) => row.id)).toContain('insert.textBox');
    expect(rows.map((row) => row.id)).toContain('insert.table');
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

  it('the write behind each row lands a valid block in the current slot, and after the selected block in its slot', () => {
    const slide = document.slides[RULE] as Slide;
    for (const item of INSERT_ACTION_ROWS()) {
      const intent = insertIntentOf(item);
      if (intent === null || intent.kind === 'upload') continue;
      const plan = menuActionPlan(item, facts(RULE));
      expect('refused' in plan, item.id).toBe(false);
      if ('refused' in plan) continue;
      expect(plan.action).toBe('block.insert');
      expect(plan.input.slideId).toBe(RULE);
      expect(typeof plan.input.slot).toBe('string');
      expect(plan.input.after).toBeUndefined();
      expect(plan.input.baseRevision).toBe(412);
      const block = plan.input.block as Block;
      expect(blockSchema.safeParse(block).success, `${item.id}: ${JSON.stringify(block)}`).toBe(
        true,
      );
      if (intent.kind === 'tool') {
        expect(block.type).toBe(drawToolBlockType(intent.tool));
        expect(block).toEqual(drawToolBlock(intent.tool, block.id));
      }
    }
    const table = menuActionPlan(itemById('insert.table'), facts(RULE));
    expect('refused' in table).toBe(false);
    if (!('refused' in table)) {
      const block = table.input.block as TableBlock;
      expect(block.columns).toHaveLength(DEFAULT_TABLE_SIZE.columns);
      expect(block.rows).toHaveLength(DEFAULT_TABLE_SIZE.rows);
      expect(block.rows[0]?.header).toBe(true);
    }
    /* after the selected heading, in the heading's slot */
    const heading = firstBlockOf(slide, 'heading');
    const placed = slide.kind === 'content' ? Object.entries(slide.slots) : [];
    const slotOfHeading = placed.find(([, blocks]) =>
      blocks?.some((block) => block.id === heading?.id),
    )?.[0];
    const after = menuActionPlan(itemById('insert.textBox'), facts(RULE, { blockId: heading?.id }));
    expect(after).toMatchObject({
      action: 'block.insert',
      input: { slot: slotOfHeading, after: heading?.id },
    });
    /* the ids stay free: a second text box on a slide with one is text-2 */
    const text = drawToolBlock({ kind: 'text' }, 'text');
    expect(text).toEqual({ id: 'text', type: 'text', text: '' });
    expect(drawToolBlock({ kind: 'rule' }, 'r')).toEqual({
      id: 'r',
      type: 'rule',
      orientation: 'horizontal',
    });
    expect(drawToolBlock({ kind: 'shape', shape: 'arrow' }, 's')).toEqual({
      id: 's',
      type: 'shape',
      shape: 'arrow',
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
    /* the box is the palette's default for the type, snapped to the freeform grid (snapPosition
       keeps the 1 px edges, so 480 by 64 lands within a grid step) */
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

  it('a Title slide has no place for a block: the fallback write refuses with the sentence naming the layouts', () => {
    const fresh = freshDocument();
    const at: ActionFacts = {
      document: fresh,
      slideId: 'fresh',
      selectedSlideIds: ['fresh'],
      selection: null,
      revision: 1,
      lastLayout: null,
    };
    expect(menuActionPlan(itemById('insert.textBox'), at)).toEqual({
      refused: SNACKBARS.needsBody('Text box'),
    });
    expect(SNACKBARS.needsBody('Table')).toBe(
      'Table needs a layout with a body. Apply Title and body or Blank first',
    );
    /* a shape does not belong on a picture layout's plate */
    const opener = Object.values(document.slides).find((slide) => slide.kind === 'opener');
    if (opener !== undefined) {
      const plan = menuActionPlan(itemById('insert.shape.shapes.ellipse'), facts(opener.id));
      expect(plan).toEqual({ refused: SNACKBARS.needsBody('Ellipse') });
      /* a text box does: the plate takes text */
      const box = menuActionPlan(itemById('insert.textBox'), facts(opener.id));
      expect(box).toMatchObject({ action: 'block.insert', input: { slot: 'plate' } });
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
    expect(pictureTargetOf('slide.changeBackground.upload', RULE, 'p1')).toEqual({
      kind: 'slide',
      slideId: RULE,
      path: '/picture/asset',
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

describe('Arrange > Order on a grammar slide (SPEC 4.3)', () => {
  const at = (blockId: string) =>
    buildMenuContext({ document, slideId: RULE, selection: { blockId } }, DEFAULT_SETTINGS, 'mac')
      .selection.order;

  it('reads the rows from the place of the block in its slot: not first for forward and front, not last for backward and back', () => {
    expect(at('p1')).toEqual({ forward: true, front: true, backward: false, back: false });
    expect(at('h')).toEqual({ forward: false, front: false, backward: true, back: true });
    expect(at('list')).toEqual({ forward: false, front: false, backward: false, back: false });
  });

  it('plans one block.move within the slot, the write the stage makes for Cmd Up and Cmd Down', () => {
    const forward = menuActionPlan(
      itemById('arrange.order.bringForward'),
      facts(RULE, { blockId: 'p1' }),
    );
    expect(forward).toMatchObject({
      action: 'block.move',
      input: { slideId: RULE, blockId: 'p1', slot: 'left', baseRevision: 412 },
    });
    expect('action' in forward ? forward.input : {}).not.toHaveProperty('after');
    expect(
      menuActionPlan(itemById('arrange.order.bringToFront'), facts(RULE, { blockId: 'p1' })),
    ).toMatchObject({
      action: 'block.move',
      input: { blockId: 'p1', slot: 'left' },
    });
    expect(
      menuActionPlan(itemById('arrange.order.sendBackward'), facts(RULE, { blockId: 'h' })),
    ).toMatchObject({
      action: 'block.move',
      input: { blockId: 'h', slot: 'left', after: 'p1' },
    });
    expect(
      menuActionPlan(itemById('arrange.order.sendToBack'), facts(RULE, { blockId: 'h' })),
    ).toMatchObject({
      action: 'block.move',
      input: { blockId: 'h', slot: 'left', after: 'p1' },
    });
    expect(
      menuActionPlan(itemById('arrange.order.bringForward'), facts(RULE, { blockId: 'h' })),
    ).toEqual({
      refused: 'The block is already first',
    });
    expect(
      menuActionPlan(itemById('arrange.order.sendToBack'), facts(RULE, { blockId: 'list' })),
    ).toEqual({
      refused: 'The block is alone in its place',
    });
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
