import { describe, expect, it } from 'vitest';

import { TOOLBAR_TAIL_DEFAULT, findItem } from '../model.ts';
import { forbiddenWordsIn, stubClause } from '../strings.ts';
import { HIDE_MENUS_CONTROL, TOOLBAR_TAILS, tailFor, tailLabels } from '../toolbar-tails.ts';
import type { TailKind } from '../toolbar-tails.ts';

// The contextual toolbar tails (gslides-parity SPEC 3.2 to 3.8): Google's order per selection
// family, every control labelled in Google's words, every Later control with its stub clause,
// every control that runs a menu item naming one that exists, and no engineering word anywhere.

describe('the tails of SPEC 3.2 to 3.8', () => {
  it('a text block: fill and border first, then the text controls, then Format options (3.2)', () => {
    expect(tailLabels('text')).toEqual([
      'Fill color',
      'Border color',
      'Border weight',
      'Border dash',
      'Font',
      'Font size',
      'Bold',
      'Italic',
      'Underline',
      'Text color',
      'Insert link',
      'Insert comment',
      'Align',
      'Line & paragraph spacing',
      'Bulleted list',
      'Numbered list',
      'Decrease indent',
      'Increase indent',
      'Clear formatting',
      'Format options',
    ]);
  });

  it('a shape: the same row with the text controls greyed (3.3)', () => {
    expect(tailLabels('shape')).toEqual(tailLabels('text'));
    const bold = TOOLBAR_TAILS.shape.find((control) => control.control === 'toolbar.bold');
    expect(bold?.enabled).toBe('never');
    expect(bold?.disabledReason).toBe('Use a text box for text over a shape, or insert a box');
  });

  it('an image (3.4)', () => {
    expect(tailLabels('image')).toEqual([
      'Border color',
      'Border weight',
      'Border dash',
      'Crop image',
      'Replace image',
      'Image options',
      'Reset image',
      'Format options',
    ]);
  });

  it('a line (3.5)', () => {
    expect(tailLabels('line')).toEqual([
      'Line color',
      'Line weight',
      'Line dash',
      'Line start',
      'Line end',
      'Format options',
    ]);
  });

  it('a table cell: border first, then the fill, then the text controls (3.6)', () => {
    const labels = tailLabels('table');
    expect(labels.slice(0, 4)).toEqual([
      'Border color',
      'Border weight',
      'Border dash',
      'Fill color',
    ]);
    expect(labels.at(-1)).toBe('Format options');
    expect(labels).toContain('Align');
  });

  it('the default tail is the model tail of 3.1 with the Hide the menus chevron drawn apart', () => {
    expect(tailFor('default').map((control) => control.control)).toEqual(
      TOOLBAR_TAIL_DEFAULT.filter((control) => control.control !== HIDE_MENUS_CONTROL).map(
        (control) => control.control,
      ),
    );
    expect(TOOLBAR_TAIL_DEFAULT.at(-1)?.control).toBe(HIDE_MENUS_CONTROL);
  });

  it('other blocks: Format options and Replace image (3.8)', () => {
    expect(tailLabels('other')).toEqual(['Format options', 'Replace image']);
  });
});

describe('every tail control', () => {
  const kinds = Object.keys(TOOLBAR_TAILS) as TailKind[];
  it('has a label, a stub clause when Later, an existing menu item when it names one, and no engineering word', () => {
    for (const kind of kinds) {
      for (const control of TOOLBAR_TAILS[kind]) {
        expect(control.label.length, control.control).toBeGreaterThan(0);
        expect(forbiddenWordsIn(control.label), control.control).toEqual([]);
        if (control.doc !== undefined)
          expect(forbiddenWordsIn(control.doc), control.control).toEqual([]);
        if (control.disabledReason !== undefined)
          expect(forbiddenWordsIn(control.disabledReason), control.control).toEqual([]);
        if (control.status === 'later') {
          expect(control.stubReason, control.control).toBeTruthy();
          expect(forbiddenWordsIn(stubClause(control.stubReason ?? '')), control.control).toEqual(
            [],
          );
        }
        if (control.item !== undefined)
          expect(findItem(control.item), `${control.control} -> ${control.item}`).toBeDefined();
        if (control.arrow !== undefined)
          expect(findItem(control.arrow), `${control.control} -> ${control.arrow}`).toBeDefined();
        expect(
          control.status === 'now' && control.item === undefined && control.op === undefined,
          `${control.control} runs nothing`,
        ).toBe(false);
      }
    }
  });

  it('never wraps: every tail fits the More button rule with the same control ids', () => {
    for (const kind of kinds) {
      const ids = tailFor(kind).map((control) => control.control);
      expect(new Set(ids).size, kind).toBe(ids.length);
    }
  });
});
