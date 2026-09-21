import { describe, expect, it } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { factsOf, selectionMarks } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { FOLD_ORDER, MORE_BUTTON_PX, NEVER_FOLDS, TAIL_GAP_PX, foldPlan } from '../ToolbarTail';

// The toolbar's fold (docs/PRODUCT.md 3.4; the row chrome.toolbar.fold-any-width): the tail folds
// what does not fit into More at any width, in the order Clear formatting, the indent pair, the
// list buttons, Highlight color, then the fill and border group, then the rest from the right end;
// Format options never folds. And the pressed predicates (3.1; chrome.toolbar.bold-follows-selection):
// the marks under the selection, from the editor's report or from the text and the range.

const control = (id: string, width = 32) => ({ id, width });

describe('foldPlan', () => {
  it('folds nothing while every control fits', () => {
    const controls = [control('a'), control('b'), control('toolbar.formatOptions', 110)];
    const total = 32 + 32 + 110 + 2 * TAIL_GAP_PX;
    expect(foldPlan(controls, total)).toEqual(new Set());
    expect(foldPlan(controls, total - 1).size).toBeGreaterThan(0);
  });

  it('folds in the specification order and keeps Format options whatever the width', () => {
    const controls = [
      control('toolbar.fillColor'),
      control('toolbar.bold'),
      control('toolbar.highlightColor'),
      control('toolbar.bulletedList'),
      control('toolbar.decreaseIndent'),
      control('toolbar.clearFormatting'),
      control('toolbar.formatOptions', 110),
    ];
    /* one pixel short: Clear formatting goes first, and since More takes 36 px of the room it
       frees, the indent follows */
    const whole = controls.reduce((sum, each) => sum + each.width, 0) + 6 * TAIL_GAP_PX;
    expect([...foldPlan(controls, whole - 1)]).toEqual([
      'toolbar.clearFormatting',
      'toolbar.decreaseIndent',
    ]);
    /* room for three controls and More: the fold order holds and the fill goes before Bold */
    const folded = foldPlan(
      controls,
      32 + 32 + 110 + 2 * TAIL_GAP_PX + MORE_BUTTON_PX + TAIL_GAP_PX,
    );
    expect([...folded]).toEqual([
      'toolbar.clearFormatting',
      'toolbar.decreaseIndent',
      'toolbar.bulletedList',
      'toolbar.highlightColor',
    ]);
    /* no room at all: everything but Format options folds */
    const all = foldPlan(controls, 0);
    expect(all.has('toolbar.formatOptions')).toBe(false);
    expect(all.size).toBe(controls.length - 1);
    expect(NEVER_FOLDS.has('toolbar.formatOptions')).toBe(true);
    expect(FOLD_ORDER['toolbar.clearFormatting']).toBe(1);
  });

  it('folds the unnamed controls from the right end after the named ones', () => {
    const controls = [
      control('toolbar.bold'),
      control('toolbar.italic'),
      control('toolbar.underline'),
    ];
    const folded = foldPlan(controls, 32 + MORE_BUTTON_PX + TAIL_GAP_PX);
    expect([...folded]).toEqual(['toolbar.underline', 'toolbar.italic']);
  });
});

describe('selectionMarks', () => {
  const doc = workedDocument();
  const input = (selection: EditorShellInput['selection']): EditorShellInput => ({
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 1,
    dispatch: () => Promise.resolve({}),
    selection,
  });

  it('answers nothing with no selection and the editor’s report when it carries one', () => {
    expect(selectionMarks(factsOf(input(null)))).toBeUndefined();
    const facts = factsOf(input({ blockId: 'x', marks: { i: true, b: true } as never } as never));
    expect(selectionMarks(facts)).toEqual({ i: true, b: true });
  });
});
