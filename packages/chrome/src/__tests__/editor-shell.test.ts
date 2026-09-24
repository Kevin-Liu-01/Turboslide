import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import { blockSchema } from '@turboslide/schema/blocks';
import type { TableBlock } from '@turboslide/schema/blocks/table';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { FREEFORM_SLIDE, freeformDocument, workedDocument } from '@turboslide/schema/fixtures';
import { LAYOUTS } from '@turboslide/schema/layouts';
import { TYPE_LEADING } from '@turboslide/schema/typography';

import {
  DEFAULT_SETTINGS,
  DEFAULT_TABLE_SIZE,
  DIALOG_IDS,
  PANEL_IDS,
  STORED_SETTINGS,
  CLEARED_FLAGS,
  SPACING_STEPS,
  buildMenuContext,
  dialogIdOf,
  flagEditOf,
  forgetKeptCells,
  hasClearableMarks,
  rememberCell,
  textStylePlan,
  withKeptCell,
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
import type { ActionFacts, EditorSelection, EditorShellInput, InsertIntent } from '../editor-shell';
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
    /* the return round (RETURN.md 2.4 fixes 2 and 3): a selected table takes the table tail with
       or without a cell; its controls act on the caret's cell, the kept cell, or cell 1,1 */
    expect(tailKindOf(shot, { blockId: 'tb' })).toBe('table');
    expect(tailKindOf(shot, { blockId: 'tb', cell: { row: 0, column: 0 } })).toBe('table');
  });

  it('is the text tail for the cover title selected by one click (RETURN.md 2.14 item 1)', () => {
    const title = document.slides['title'] as Slide;
    expect(title.kind).toBe('title');
    expect(tailKindOf(title, { blockId: 'heading' })).toBe('text');
    expect(tailKindOf(title, { blockId: 'lead' })).toBe('text');
    expect(tailKindOf(title, { blockId: 'mark' })).toBe('other');
    const statement = document.slides['thesis'] as Slide;
    expect(tailKindOf(statement, { blockId: 'big' })).toBe('text');
  });
});

describe('the kept cell pointer (RETURN.md 2.4 fixes 2 and 3)', () => {
  const table: Slide = {
    schemaVersion: 1,
    id: 'tbl',
    kind: 'content',
    layout: { type: 'center' },
    slots: {
      main: [
        {
          id: 'tb',
          type: 'table',
          columns: [{}, {}, {}],
          rows: [{ cells: ['a', 'b', 'c'] }, { cells: ['d', 'e', 'f'] }],
        } as Block,
      ],
    },
  };
  const doc: DeckDocument = { deck: document.deck, slides: { ...document.slides, tbl: table } };
  const input = (selection: EditorSelection | null): EditorShellInput => ({
    deckId: doc.deck.id,
    document: doc,
    slideId: 'tbl',
    selection,
    revision: 1,
    dispatch: async () => undefined,
  });

  it("remembers the caret's cell and fills it in when the session has ended", () => {
    forgetKeptCells();
    const inSession: EditorSelection = { blockId: 'tb', text: true, cell: { row: 1, column: 2 } };
    expect(withKeptCell(table, inSession)).toBe(inSession);
    const afterwards = withKeptCell(table, { blockId: 'tb' });
    expect(afterwards).toEqual({ blockId: 'tb', cell: { row: 1, column: 2 } });
    /* the plans and the menu context read the kept cell */
    expect(factsOf(input({ blockId: 'tb' })).selection?.cell).toEqual({ row: 1, column: 2 });
    const ctx = buildMenuContext(input({ blockId: 'tb' }), DEFAULT_SETTINGS, 'mac');
    expect(ctx.selection.tableCell).toBe(true);
    const center = menuActionPlan(
      itemById('format.alignIndent.center'),
      factsOf(input({ blockId: 'tb' })),
    );
    expect(center).toMatchObject({
      action: 'block.set',
      input: { blockId: 'tb', path: '/columns' },
    });
    if (!('refused' in center)) expect(center.input.value).toEqual([{}, {}, { align: 'center' }]);
  });

  it('has no cell for a table never entered, enables the Format > Table rows on one click, and clamps a deleted cell', () => {
    forgetKeptCells();
    expect(withKeptCell(table, { blockId: 'tb' })).toEqual({ blockId: 'tb' });
    const ctx = buildMenuContext(input({ blockId: 'tb' }), DEFAULT_SETTINGS, 'mac');
    expect(ctx.selection.tableCell).toBe(true);
    rememberCell('tbl', { blockId: 'tb', cell: { row: 7, column: 9 } });
    expect(withKeptCell(table, { blockId: 'tb' })?.cell).toEqual({ row: 1, column: 2 });
    /* another block of the slide is untouched */
    expect(withKeptCell(table, { blockId: 'other' })).toEqual({ blockId: 'other' });
    forgetKeptCells();
  });
});

describe("the cover title before it converts (RETURN.md 2.14 item 1): the plans carry the reducer's mutations", () => {
  const heading: EditorSelection = { blockId: 'heading' };

  it('Bold, Center, the size and the spacings plan block.set on the field object as on a block', () => {
    const bold = menuActionPlan(itemById('format.text.bold'), facts('title', heading));
    expect(bold).toMatchObject({
      action: 'block.set',
      input: { slideId: 'title', blockId: 'heading', path: '/typography', value: { weight: 500 } },
    });
    const center = menuActionPlan(itemById('format.alignIndent.center'), facts('title', heading));
    expect(center).toMatchObject({
      action: 'block.set',
      input: { blockId: 'heading', path: '/typography', value: { align: 'center' } },
    });
    const smaller = menuActionPlan(itemById('format.text.size.decrease'), facts('title', heading));
    expect(smaller).toMatchObject({ action: 'block.set', input: { blockId: 'heading' } });
    /* the cover title draws at the theme's h1 size 88; one step down the ladder is 72 */
    if (!('refused' in smaller)) expect((smaller.input.value as { size: number }).size).toBe(72);
    const spacing = menuActionPlan(itemById('format.spacing.1_15'), facts('title', heading));
    expect(spacing).toMatchObject({
      action: 'block.set',
      input: { blockId: 'heading', path: '/typography', value: { leading: 1.15 } },
    });
  });

  it('a mark, a colour and a case on the field object are one slide.update of text.mark over the range', () => {
    const word: [number, number] = [8, 19];
    const italic = menuActionPlan(
      itemById('format.text.italic'),
      facts('title', { ...heading, text: true, range: word, marks: {} }),
    );
    expect(italic).toEqual({
      action: 'slide.update',
      input: {
        slideId: 'title',
        mutations: [
          {
            op: 'text.mark',
            slideId: 'title',
            blockId: 'heading',
            path: '/text',
            range: word,
            edit: { kind: 'marks', set: { i: true } },
          },
        ],
        baseRevision: 412,
      },
      label: 'Italic',
    });
    const off = menuActionPlan(
      itemById('format.text.superscript'),
      facts('title', { ...heading, text: true, range: word, marks: { sup: true } }),
    );
    if ('refused' in off) throw new Error(off.refused);
    expect((off.input.mutations as Array<{ edit: unknown }>)[0]?.edit).toEqual({
      kind: 'marks',
      clear: ['sup'],
    });
    const on = menuActionPlan(
      itemById('format.text.subscript'),
      facts('title', { ...heading, text: true, range: word, marks: {} }),
    );
    if ('refused' in on) throw new Error(on.refused);
    expect((on.input.mutations as Array<{ edit: unknown }>)[0]?.edit).toEqual({
      kind: 'marks',
      set: { sub: true },
      clear: ['sup'],
    });
    const upper = menuActionPlan(
      itemById('format.text.capitalization.upper'),
      facts('title', heading),
    );
    expect(upper).toMatchObject({
      action: 'slide.update',
      input: {
        mutations: [
          {
            op: 'text.mark',
            blockId: 'heading',
            path: '/text',
            range: [0, 'General Translation'.length],
            edit: { kind: 'case', mode: 'upper' },
          },
        ],
      },
    });
    const colour = textStylePlan(
      facts('title', { ...heading, text: true, range: word }),
      { color: 'red' },
      'Red',
    );
    if ('refused' in colour) throw new Error(colour.refused);
    expect((colour.input.mutations as Array<{ edit: unknown }>)[0]?.edit).toEqual({
      kind: 'marks',
      set: { color: 'red' },
    });
    const noColour = textStylePlan(facts('title', heading), { color: null }, 'None');
    if ('refused' in noColour) throw new Error(noColour.refused);
    expect((noColour.input.mutations as Array<{ edit: unknown }>)[0]?.edit).toEqual({
      kind: 'marks',
      clear: ['color'],
    });
  });

  it('a real block keeps text.style and text.case', () => {
    const slide = document.slides[RULE] as Slide;
    const block = firstBlockOf(slide, 'heading') as Block;
    const italic = menuActionPlan(
      itemById('format.text.italic'),
      facts(RULE, { blockId: block.id }),
    );
    expect(italic).toMatchObject({ action: 'text.style' });
    const upper = menuActionPlan(
      itemById('format.text.capitalization.upper'),
      facts(RULE, { blockId: block.id }),
    );
    expect(upper).toMatchObject({ action: 'text.case' });
  });

  it("Add space before and the indent write the field object's typography", () => {
    const before = menuActionPlan(itemById('format.spacing.addBefore'), facts('title', heading));
    expect(before).toMatchObject({
      action: 'block.set',
      input: { blockId: 'heading', path: '/typography', value: { spaceBefore: 8 } },
      label: 'Add space before paragraph',
    });
    const indent = menuActionPlan(
      itemById('format.alignIndent.increaseIndent'),
      facts('title', heading),
    );
    expect(indent).toMatchObject({
      action: 'block.set',
      input: { blockId: 'heading', path: '/typography', value: { indent: 64 } },
    });
    const outdent = menuActionPlan(
      itemById('format.alignIndent.decreaseIndent'),
      facts('title', heading),
    );
    expect(outdent).toMatchObject({
      action: 'block.set',
      input: { blockId: 'heading', path: '/typography' },
    });
    if (!('refused' in outdent)) expect('value' in outdent.input).toBe(false);
  });

  it("flagEditOf turns text.style marks into the reducer's set and clear", () => {
    expect(flagEditOf({ i: true })).toEqual({ set: { i: true } });
    expect(flagEditOf({ i: false })).toEqual({ clear: ['i'] });
    expect(flagEditOf({ sup: true, sub: false })).toEqual({ set: { sup: true }, clear: ['sub'] });
    expect(flagEditOf({ highlight: 'amber' })).toEqual({ set: { hl: 'amber' } });
    expect(flagEditOf({ highlight: null })).toEqual({ clear: ['hl'] });
  });
});

describe('the spacing rows write the value their label names (RETURN.md 2.14 item 4)', () => {
  it('1.15 writes 1.15, Single 1 and Double 2, every one a step of the leading ladder', () => {
    expect(SPACING_STEPS.map((step) => [step.label, step.leading])).toEqual([
      ['Single', 1],
      ['1.15', 1.15],
      ['1.5', 1.5],
      ['Double', 2],
    ]);
    for (const step of SPACING_STEPS) expect(TYPE_LEADING).toContain(step.leading);
    const slide = document.slides[RULE] as Slide;
    const block = firstBlockOf(slide, 'heading') as Block;
    const plan = menuActionPlan(
      itemById('format.spacing.1_15'),
      facts(RULE, { blockId: block.id }),
    );
    expect(plan).toMatchObject({ input: { path: '/typography', value: { leading: 1.15 } } });
  });
});

describe('Clear formatting clears the inline marks too (RETURN.md 2.14 item 5)', () => {
  const marked: Slide = {
    schemaVersion: 1,
    id: 'mk',
    kind: 'content',
    layout: { type: 'center' },
    slots: {
      main: [
        {
          id: 'p',
          type: 'paragraph',
          text: 'One [italic]{i} word and a *bold* [red]{c:red} one',
        } as Block,
        { id: 'q', type: 'paragraph', text: 'Plain words with a [link](https://x.y)' } as Block,
        {
          id: 'r',
          type: 'paragraph',
          text: 'Sized [italic]{i} word',
          typography: { size: 34 },
        } as Block,
      ],
    },
  };
  const doc: DeckDocument = { deck: document.deck, slides: { ...document.slides, mk: marked } };
  const on = (selection: EditorSelection) => ({ ...facts('mk', selection), document: doc });

  it('a box with only marks: one text.mark clearing every mark, colour and bold run over the whole Text, and no refusal', () => {
    const plan = menuActionPlan(itemById('format.clearFormatting'), on({ blockId: 'p' }));
    expect(plan).toEqual({
      action: 'slide.update',
      input: {
        slideId: 'mk',
        mutations: [
          {
            op: 'text.mark',
            slideId: 'mk',
            blockId: 'p',
            path: '/text',
            range: [0, 'One italic word and a bold red one'.length],
            edit: { kind: 'marks', clear: [...CLEARED_FLAGS] },
          },
        ],
        baseRevision: 412,
      },
      label: 'Clear formatting',
    });
    expect(CLEARED_FLAGS).not.toContain('link');
  });

  it('a plain box with a link alone has nothing to clear; a link stays', () => {
    expect(menuActionPlan(itemById('format.clearFormatting'), on({ blockId: 'q' }))).toEqual({
      refused: 'Nothing to clear',
    });
    expect(hasClearableMarks('Plain [link](https://x.y)', [0, 10])).toBe(false);
    expect(hasClearableMarks('Plain *bold*', [0, 10])).toBe(true);
    expect(hasClearableMarks('Plain *bold*', [0, 5])).toBe(false);
  });

  it('a box with an override and a mark clears both in one write; a range clears its marks alone', () => {
    const both = menuActionPlan(itemById('format.clearFormatting'), on({ blockId: 'r' }));
    if ('refused' in both) throw new Error(both.refused);
    expect(
      (both.input.mutations as Array<{ op: string; path: string }>).map((m) => [m.op, m.path]),
    ).toEqual([
      ['block.set', '/typography'],
      ['text.mark', '/text'],
    ]);
    const range = menuActionPlan(
      itemById('format.clearFormatting'),
      on({ blockId: 'r', text: true, range: [6, 12] }),
    );
    if ('refused' in range) throw new Error(range.refused);
    expect(range.input.mutations).toEqual([
      {
        op: 'text.mark',
        slideId: 'mk',
        blockId: 'r',
        path: '/text',
        range: [6, 12],
        edit: { kind: 'marks', clear: [...CLEARED_FLAGS] },
      },
    ]);
    const plainRange = menuActionPlan(
      itemById('format.clearFormatting'),
      on({ blockId: 'r', text: true, range: [0, 5] }),
    );
    expect(plainRange).toEqual({ refused: 'Nothing to clear' });
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

  it('New slide after a Title slide is Title and body, and after any other slide it inherits that slide; the arrow’s last pick never wins (docs/PRODUCT.md section 2 rank 2)', () => {
    const title = Object.values(document.slides).find((slide) => slide.kind === 'title');
    if (title !== undefined) {
      const plan = menuActionPlan(itemById('insert.newSlide'), facts(title.id));
      if (!('refused' in plan)) expect(plan.input.layout).toBe('split');
    }
    const inherited = menuActionPlan(itemById('slide.newSlide'), facts(RULE));
    const remembered = menuActionPlan(
      itemById('slide.newSlide'),
      facts(RULE, undefined, { lastLayout: 'big-number' }),
    );
    if (!('refused' in remembered) && !('refused' in inherited)) {
      expect(remembered.input.layout).toBe(inherited.input.layout);
      expect(remembered.input.layout).not.toBe('big-number');
    }
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

  it('Bold, the alignments and the line spacings refuse on a list block instead of writing /typography (C2-F1, b7 C2-R16)', () => {
    /* a `plain` block has no typography field, so the `/typography` write these plans made was
       refused by the server's schema check and the title row read "Couldn't save, retrying"
       (VERIFICATION C2-F1: `text.format-menu.size-increase` and every text row after it while the
       reject card stood); the plan refuses with a sentence, as the table branch refuses Justified */
    const slide = document.slides[RULE] as Slide;
    const list = firstBlockOf(slide, 'plain') as Block;
    const listFacts = facts(RULE, { blockId: list.id });
    const rows = [
      ['format.text.bold', 'Bold applies to a text block'],
      ['format.alignIndent.left', 'Alignment applies to a text block'],
      ['format.alignIndent.center', 'Alignment applies to a text block'],
      ['format.alignIndent.right', 'Alignment applies to a text block'],
      ['format.alignIndent.justified', 'Alignment applies to a text block'],
      ['format.spacing.single', 'Line spacing applies to a text block'],
      ['format.spacing.1_15', 'Line spacing applies to a text block'],
      ['format.spacing.1_5', 'Line spacing applies to a text block'],
      ['format.spacing.double', 'Line spacing applies to a text block'],
    ] as const;
    for (const [id, sentence] of rows) {
      const plan = menuActionPlan(itemById(id), listFacts);
      expect(plan, id).toEqual({ refused: sentence });
    }
    /* the same rows on a text block keep their /typography write */
    const heading = firstBlockOf(slide, 'heading') as Block;
    const bold = menuActionPlan(itemById('format.text.bold'), facts(RULE, { blockId: heading.id }));
    expect(bold).toMatchObject({ action: 'block.set', input: { path: '/typography' } });
    const double = menuActionPlan(
      itemById('format.spacing.double'),
      facts(RULE, { blockId: heading.id }),
    );
    expect(double).toMatchObject({
      action: 'block.set',
      input: { path: '/typography', value: expect.objectContaining({ leading: 2 }) },
    });
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

  it('Bold, Italic, a colour and Align on a table write every selected cell in one slide.update (docs/FEATURES.md 2.2 rank 8)', () => {
    const table: Slide = {
      schemaVersion: 1,
      id: 'tbl2',
      kind: 'content',
      layout: { type: 'center' },
      slots: {
        main: [
          {
            id: 't',
            type: 'table',
            columns: [{}, {}, {}],
            rows: [
              { cells: ['Region', 'Q1', ''], header: true },
              { cells: ['North', '*100*', '200'] },
            ],
          } as Block,
        ],
      },
    };
    const doc: DeckDocument = { deck: document.deck, slides: { ...document.slides, tbl2: table } };
    /* a range over the header row: the bold run into its two typed cells, the empty one left out */
    const header = {
      ...facts('tbl2', {
        blockId: 't',
        cell: { row: 0, column: 0 },
        cells: { r0: 0, c0: 0, r1: 0, c1: 2 },
      }),
      document: doc,
    };
    const bold = menuActionPlan(itemById('format.text.bold'), header);
    expect(bold).toMatchObject({ action: 'slide.update', label: 'Bold' });
    if ('refused' in bold) throw new Error('refused');
    const mutations = bold.input.mutations as {
      op: string;
      path: string;
      range: number[];
      edit: unknown;
    }[];
    expect(mutations.map((m) => [m.op, m.path, m.range])).toEqual([
      ['text.mark', '/rows/0/cells/0', [0, 6]],
      ['text.mark', '/rows/0/cells/1', [0, 2]],
    ]);
    /* the range is the plain length: the bold cell's asterisks are markup, not characters */
    expect(mutations[0]?.edit).toEqual({ kind: 'marks', set: { b: true } });
    /* the table selected by one click, no cell: every typed cell; the bold cell is not bold whole
       across the table, so the run is set everywhere */
    const whole = { ...facts('tbl2', { blockId: 't' }), document: doc };
    const all = menuActionPlan(itemById('format.text.bold'), whole);
    if ('refused' in all) throw new Error('refused');
    expect((all.input.mutations as unknown[]).length).toBe(5);
    /* a range whose every cell is bold already clears the run */
    const boldOnly = {
      ...facts('tbl2', {
        blockId: 't',
        cell: { row: 1, column: 1 },
        cells: { r0: 1, c0: 1, r1: 1, c1: 1 },
      }),
      document: doc,
    };
    const clear = menuActionPlan(itemById('format.text.bold'), boldOnly);
    if ('refused' in clear) throw new Error('refused');
    expect((clear.input.mutations as { edit: unknown }[])[0]?.edit).toEqual({
      kind: 'marks',
      clear: ['b'],
    });
    /* Italic through textStylePlan and a colour, over the range */
    const italic = textStylePlan(header, { mark: 'i' }, 'Italic');
    if ('refused' in italic) throw new Error('refused');
    expect(italic.action).toBe('slide.update');
    expect((italic.input.mutations as { edit: unknown }[])[0]?.edit).toEqual({
      kind: 'marks',
      set: { i: true },
    });
    const colour = textStylePlan(header, { color: 'blue' }, 'Text color');
    if ('refused' in colour) throw new Error('refused');
    expect((colour.input.mutations as { edit: unknown }[])[1]?.edit).toEqual({
      kind: 'marks',
      set: { color: 'blue' },
    });
    /* a caret in one cell keeps the cell's own text.style */
    const caret = {
      ...facts('tbl2', { blockId: 't', cell: { row: 1, column: 0 }, text: true, range: [0, 5] }),
      document: doc,
    };
    expect(textStylePlan(caret, { mark: 'i' }, 'Italic')).toMatchObject({
      action: 'text.style',
      input: { path: '/rows/1/cells/0', range: [0, 5] },
    });
    /* a range with no text refuses with a sentence and never writes /typography */
    const empty = {
      ...facts('tbl2', {
        blockId: 't',
        cell: { row: 0, column: 2 },
        cells: { r0: 0, c0: 2, r1: 0, c1: 2 },
      }),
      document: doc,
    };
    expect(menuActionPlan(itemById('format.text.bold'), empty)).toEqual({
      refused: 'Type into a cell first',
    });
    /* Align on the range writes its columns; with no cell every column */
    const right = menuActionPlan(itemById('format.alignIndent.right'), {
      ...facts('tbl2', {
        blockId: 't',
        cell: { row: 0, column: 1 },
        cells: { r0: 0, c0: 1, r1: 1, c1: 2 },
      }),
      document: doc,
    });
    expect(right).toMatchObject({
      action: 'block.set',
      input: { path: '/columns', value: [{}, { align: 'right' }, { align: 'right' }] },
    });
    expect(menuActionPlan(itemById('format.alignIndent.center'), whole)).toMatchObject({
      input: { value: [{ align: 'center' }, { align: 'center' }, { align: 'center' }] },
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
      /* the features round, ship two (docs/FEATURES.md 5.4): Insert > Shader opens the gallery */
      'insert.shader': { kind: 'picker', picker: 'shader' },
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
  it('keeps View > Play shaders at In the show only by default and remembers it per browser (docs/FEATURES.md 5.6, question 5)', () => {
    expect(DEFAULT_SETTINGS.playShaders).toBe('show');
    expect(STORED_SETTINGS).toContain('playShaders');
    const written = writeStoredSettings({ ...DEFAULT_SETTINGS, playShaders: 'off' });
    expect(readStoredSettings(written).playShaders).toBe('off');
    expect(readStoredSettings(writeStoredSettings(DEFAULT_SETTINGS)).playShaders).toBe('show');
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
