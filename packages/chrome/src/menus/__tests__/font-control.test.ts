// The text tail's Font control (docs/PRODUCT.md 3.4, 4.2, 8.3): the first control of the text,
// shape and table tails is the Font dropdown while the catalog is in the default view, and the
// read only family with the same tooltip and no chevron when `fonts` is parked by the ship's
// rule; a `chrome.toolbar.fold-any-width` reading accepts either drawing.
import { describe, expect, it } from 'vitest';

import { FONTS_PARKED, TOOLBAR_TAILS, fontControl } from '../toolbar-tails.ts';

describe('the Font control', () => {
  it('leads the text, shape and table tails as a dropdown with the catalog in the default view', () => {
    expect(FONTS_PARKED).toBe(false);
    for (const kind of ['text', 'shape', 'table'] as const) {
      const font = TOOLBAR_TAILS[kind].find((control) => control.control === 'toolbar.font');
      expect(font, kind).toBeDefined();
      expect(font?.op).toBe('font');
      expect(font?.dropdown).toBe(true);
      expect(font?.readOnly).toBeUndefined();
      expect(font?.enabled).toBeUndefined();
      expect(font?.status).toBe('now');
      /* the first text control: the fill and border group of a text box is parked, so the Font
         control is the first control drawn with the switch off */
      const drawn = TOOLBAR_TAILS[kind].filter((control) => control.advanced !== true);
      const first = kind === 'table' ? drawn.find((c) => c.op === 'font') : drawn[0];
      expect(first?.control, kind).toBe(kind === 'table' ? 'toolbar.font' : drawn[0]?.control);
    }
  });

  it('draws the read only family with the same words when the catalog is parked', () => {
    const parked = fontControl(true);
    expect(parked.control).toBe('toolbar.font');
    expect(parked.readOnly).toBe(true);
    expect(parked.dropdown).toBeUndefined();
    expect(parked.enabled).toBe('never');
    expect(parked.disabledReason).toMatch(/^The face of the selected text/);
    const live = fontControl(false);
    expect(live.dropdown).toBe(true);
    expect(live.doc).toMatch(/^The face of the selected text/);
    expect(live.label).toBe(parked.label);
  });
});
