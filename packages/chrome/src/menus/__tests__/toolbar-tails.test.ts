import { describe, expect, it } from 'vitest';

import { TOOLBAR_TAIL_DEFAULT, findItem } from '../model.ts';
import { forbiddenWordsIn, stubClause } from '../strings.ts';
import {
  HIDE_MENUS_CONTROL,
  TOOLBAR_TAILS,
  TOOLBAR_TAIL_END,
  tailFor,
  tailLabels,
} from '../toolbar-tails.ts';
import type { TailKind } from '../toolbar-tails.ts';

// The contextual toolbar tails (gslides-parity SPEC 3.2 to 3.8 with the round two flips of SPEC-2
// 4.2): Google's order per selection family, every control labelled in Google's words, every
// Later control with its stub clause, every control that runs a menu item naming one that exists,
// the Turboslide additions marked as ours, and no engineering word anywhere.

const TEXT_LABELS = [
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
  'Highlight color',
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
];

describe('the tails of SPEC 3.2 to 3.8 with SPEC-2 4.2', () => {
  it('a text block: fill and border first, then the text controls with Italic, Underline and Highlight color, then Format options (3.2)', () => {
    expect(tailLabels('text')).toEqual(TEXT_LABELS);
    const byId = (control: string) => TOOLBAR_TAILS.text.find((each) => each.control === control);
    /* headings, paragraphs and text boxes take no fill; a box or word art takes a border (SPEC-2 0.62) */
    expect(byId('toolbar.fillColor')?.enabled).toBe('boxSelected');
    expect(byId('toolbar.borderColor')?.enabled).toBe('hasBorderField');
    expect(byId('toolbar.borderWeight')?.enabled).toBe('hasBorderField');
    expect(byId('toolbar.borderDash')?.enabled).toBe('boxSelected');
    for (const control of ['toolbar.italic', 'toolbar.underline', 'toolbar.highlightColor'])
      expect(byId(control)?.status, control).toBe('now');
    expect(byId('toolbar.italic')?.item).toBe('format.text.italic');
    expect(byId('toolbar.underline')?.item).toBe('format.text.underline');
    expect(byId('toolbar.highlightColor')?.op).toBe('highlightColor');
    expect(byId('toolbar.decreaseIndent')?.item).toBe('format.alignIndent.decreaseIndent');
    expect(byId('toolbar.increaseIndent')?.item).toBe('format.alignIndent.increaseIndent');
    /* the list buttons gain the preset grid arrow */
    expect(byId('toolbar.bulletedList')?.arrow).toBe('format.bulletsNumbering.bulleted');
    expect(byId('toolbar.numberedList')?.arrow).toBe('format.bulletsNumbering.numbered');
    expect(byId('toolbar.borderDash')?.op).toBe('borderDash');
    expect(byId('toolbar.font')?.enabled).toBe('never');
  });

  it('a shape: Change shape, then the text tail with the text controls enabled (3.3, SPEC-2 0.11)', () => {
    expect(tailLabels('shape')).toEqual(['Change shape', ...TEXT_LABELS]);
    const change = TOOLBAR_TAILS.shape.find((control) => control.control === 'toolbar.changeShape');
    expect(change?.op).toBe('changeShape');
    expect(change?.turboslide).toBe(true);
    const bold = TOOLBAR_TAILS.shape.find((control) => control.control === 'toolbar.bold');
    expect(bold?.enabled).toBeUndefined();
    /* a shape's fill and border always apply */
    for (const control of ['toolbar.fillColor', 'toolbar.borderColor', 'toolbar.borderWeight'])
      expect(
        TOOLBAR_TAILS.shape.find((each) => each.control === control)?.enabled,
        control,
      ).toBeUndefined();
  });

  it('an image: the frame controls, Crop with the Mask arrow, Replace, Image options, Reset, Dither (3.4; SPEC-3 13.2)', () => {
    expect(tailLabels('image')).toEqual([
      'Border color',
      'Border weight',
      'Border dash',
      'Crop image',
      'Replace image',
      'Image options',
      'Reset image',
      'Dither',
      'Format options',
    ]);
    const crop = TOOLBAR_TAILS.image.find((control) => control.control === 'toolbar.cropImage');
    expect(crop?.op).toBe('crop');
    expect(crop?.arrow).toBe('format.image.maskImage');
    const reset = TOOLBAR_TAILS.image.find((control) => control.control === 'toolbar.resetImage');
    expect(reset?.status).toBe('now');
    expect(reset?.enabled).toBe('imageEdited');
    for (const control of ['toolbar.borderWeight', 'toolbar.borderDash'])
      expect(TOOLBAR_TAILS.image.find((each) => each.control === control)?.status, control).toBe(
        'now',
      );
    /* SPEC-3 10.5, 13.2: the Dither toggle runs the picture's row and is a Turboslide addition */
    const dither = TOOLBAR_TAILS.image.find((control) => control.control === 'toolbar.dither');
    expect(dither?.item).toBe('format.image.dither');
    expect(dither?.turboslide).toBe(true);
    expect(findItem('format.image.dither')?.effect).toEqual({
      kind: 'action',
      id: 'picture.dither',
    });
  });

  it('the tail’s right end: the pointer toggle for editors and the View only button for viewers (SPEC-3 13.2)', () => {
    expect(TOOLBAR_TAIL_END.map((control) => control.control)).toEqual([
      'toolbar.pointer',
      'toolbar.viewOnly',
    ]);
    const pointer = TOOLBAR_TAIL_END[0];
    expect(pointer?.item).toBe('view.livePointers.mine');
    expect(pointer?.when).toBe('write');
    expect(pointer?.label).toBe('Show my pointer');
    const viewOnly = TOOLBAR_TAIL_END[1];
    expect(viewOnly?.label).toBe('View only');
    expect(viewOnly?.when).toBe('viewOnly');
    expect(viewOnly?.effect).toEqual({
      kind: 'action',
      id: 'share.requestAccess',
      input: { role: 'editor' },
    });
    /* neither is part of a selection's tail: they are drawn apart, like Hide the menus */
    for (const kind of Object.keys(TOOLBAR_TAILS) as TailKind[])
      for (const control of tailFor(kind))
        expect(
          ['toolbar.pointer', 'toolbar.viewOnly'],
          `${kind}: ${control.control}`,
        ).not.toContain(control.control);
    for (const control of TOOLBAR_TAIL_END) {
      expect(forbiddenWordsIn(control.label), control.control).toEqual([]);
      if (control.doc !== undefined)
        expect(forbiddenWordsIn(control.doc), control.control).toEqual([]);
    }
  });

  it('a line: colour, weight, dash, start and end, all Now (3.5)', () => {
    expect(tailLabels('line')).toEqual([
      'Line color',
      'Line weight',
      'Line dash',
      'Line start',
      'Line end',
      'Format options',
    ]);
    for (const control of TOOLBAR_TAILS.line) expect(control.status, control.control).toBe('now');
  });

  it('a table cell: border first, then the fill, the merge buttons, then the text controls (3.6)', () => {
    const labels = tailLabels('table');
    expect(labels.slice(0, 6)).toEqual([
      'Border color',
      'Border weight',
      'Border dash',
      'Fill color',
      'Merge cells',
      'Unmerge cells',
    ]);
    expect(labels.at(-1)).toBe('Format options');
    expect(labels).toContain('Align');
    /* the merge buttons are Turboslide additions (SPEC-2 4.2) that run the Format > Table rows */
    const merge = TOOLBAR_TAILS.table.find((control) => control.control === 'toolbar.mergeCells');
    expect(merge?.turboslide).toBe(true);
    expect(merge?.item).toBe('format.table.mergeCells');
    expect(merge?.enabled).toBe('cellRangeSelected');
    const unmerge = TOOLBAR_TAILS.table.find(
      (control) => control.control === 'toolbar.unmergeCells',
    );
    expect(unmerge?.item).toBe('format.table.unmergeCells');
    expect(unmerge?.enabled).toBe('mergedCellSelected');
  });

  it('a chart: type, legend, number format, data and Format options, every one ours (SPEC-2 4.2)', () => {
    expect(tailLabels('chart')).toEqual([
      'Chart type',
      'Legend',
      'Number format',
      'Edit data',
      'Format options',
    ]);
    for (const control of TOOLBAR_TAILS.chart) {
      if (control.control === 'toolbar.formatOptions') continue;
      expect(control.turboslide, control.control).toBe(true);
    }
    expect(
      TOOLBAR_TAILS.chart.find((control) => control.control === 'toolbar.editData')?.item,
    ).toBe('format.editData');
  });

  it('a group: the fill and border controls over every member, then Format options (SPEC-2 0.102)', () => {
    expect(tailLabels('group')).toEqual([
      'Fill color',
      'Border color',
      'Border weight',
      'Border dash',
      'Format options',
    ]);
    for (const control of TOOLBAR_TAILS.group)
      expect(control.enabled, control.control).toBeUndefined();
  });

  it('the default tail is the model tail of 3.1 with the Hide the menus chevron drawn apart', () => {
    expect(tailFor('default').map((control) => control.control)).toEqual(
      TOOLBAR_TAIL_DEFAULT.filter((control) => control.control !== HIDE_MENUS_CONTROL).map(
        (control) => control.control,
      ),
    );
    expect(TOOLBAR_TAIL_DEFAULT.at(-1)?.control).toBe(HIDE_MENUS_CONTROL);
    /* the Insert shape and Insert line dropdowns open the categories and kinds of SPEC-2 4.1 */
    expect(
      TOOLBAR_TAILS.default.find((control) => control.control === 'toolbar.insertShape')?.arrow,
    ).toBe('insert.shape');
    expect(
      TOOLBAR_TAILS.default.find((control) => control.control === 'toolbar.insertLine')?.arrow,
    ).toBe('insert.line');
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
          control.status === 'now' &&
            control.item === undefined &&
            control.op === undefined &&
            control.effect === undefined,
          `${control.control} runs nothing`,
        ).toBe(false);
      }
    }
  });

  it('leaves no Later control outside the default tail: Insert comment is live since SPEC-3 5.3', () => {
    const later: string[] = [];
    for (const kind of kinds)
      if (kind !== 'default')
        for (const control of TOOLBAR_TAILS[kind])
          if (control.status === 'later') later.push(`${kind}:${control.control}`);
    expect(later).toEqual([]);
    for (const kind of ['text', 'shape', 'table'] as const) {
      const comment = TOOLBAR_TAILS[kind].find(
        (control) => control.control === 'toolbar.insertComment',
      );
      expect(comment?.status, kind).toBe('now');
      expect(comment?.item, kind).toBe('insert.comment');
      expect(comment?.when, kind).toBe('comment');
    }
  });

  it('never wraps: every tail fits the More button rule with the same control ids', () => {
    for (const kind of kinds) {
      const ids = tailFor(kind).map((control) => control.control);
      expect(new Set(ids).size, kind).toBe(ids.length);
    }
  });
});
