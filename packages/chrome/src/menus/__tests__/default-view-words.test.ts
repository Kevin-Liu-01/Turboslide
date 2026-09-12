import { describe, expect, it } from 'vitest';

import { MENUS, TITLE_ROW_ITEMS, TOOLBAR_HEAD, TOOLBAR_TAIL_DEFAULT, allItems } from '../model.ts';
import {
  DIALOGS,
  ERRORS,
  FILMSTRIP,
  FORBIDDEN_DEFAULT_VIEW_WORDS,
  HOME,
  IMPORT_PPTX,
  PANELS,
  PRESENT,
  PROMPTS,
  SNACKBARS,
  TITLE_ROW,
  forbiddenWordsIn,
  stubClause,
  stubTooltip,
} from '../strings.ts';

// The default view words (SPEC 12, R07 rule 22): none of the engineering words reaches a label,
// a tooltip sentence or a stub clause of the menu model, the toolbar or the shared strings,
// outside Tools > Advanced and Extensions > Agent access. The shell-level form of this test
// (rendering /new and /edit) lands with the rest of B3; this one greps the data every surface is
// generated from.

const EXEMPT = (id: string): boolean =>
  id.startsWith('tools.advanced') || id === 'extensions.agentAccess';

function clean(text: string | undefined, where: string): void {
  if (text === undefined) return;
  expect(forbiddenWordsIn(text), `${where}: "${text}"`).toEqual([]);
}

describe('forbiddenWordsIn', () => {
  it('matches whole words and phrases, not parts of other words', () => {
    expect(forbiddenWordsIn('Show source')).toEqual(['source']);
    expect(forbiddenWordsIn('Agent access')).toEqual(['agent']);
    expect(forbiddenWordsIn('The MCP address')).toEqual(['MCP']);
    expect(forbiddenWordsIn('a JSON pointer here')).toEqual(['JSON pointer']);
    expect(forbiddenWordsIn('kindly')).toEqual([]);
    expect(forbiddenWordsIn('Turn on the laser pointer')).toEqual([]);
    expect(forbiddenWordsIn('Not available in Turboslide yet')).toEqual([]);
    expect(FORBIDDEN_DEFAULT_VIEW_WORDS).toContain('lint');
    expect(FORBIDDEN_DEFAULT_VIEW_WORDS).toContain('freeform');
  });
});

describe('the menu model', () => {
  it('keeps the engineering words out of every label, tooltip and stub clause in the default view', () => {
    for (const item of allItems()) {
      if (item.status === 'omit' || EXEMPT(item.id)) continue;
      clean(item.label, item.id);
      clean(item.altLabel?.label, item.id);
      clean(item.doc, item.id);
      clean(item.disabledReason, item.id);
      if (item.stubReason !== undefined) clean(stubClause(item.stubReason), item.id);
    }
    for (const menu of MENUS) clean(menu.label, menu.id);
    for (const item of TITLE_ROW_ITEMS) clean(item.label, item.id);
  });

  it('keeps them out of the toolbar', () => {
    for (const control of [...TOOLBAR_HEAD, ...TOOLBAR_TAIL_DEFAULT]) {
      clean(control.label, control.control);
      clean(control.doc, control.control);
      clean(control.disabledReason, control.control);
      if (control.stubReason !== undefined)
        clean(stubTooltip(control.label, control.stubReason), control.control);
    }
  });

  it('writes every stub tooltip in the one formula', () => {
    expect(stubClause('Comments arrive in the next round')).toBe(
      'Not available in Turboslide yet. Comments arrive in the next round',
    );
    expect(stubTooltip('Insert comment', 'Comments arrive in the next round')).toBe(
      'Insert comment · Not available in Turboslide yet. Comments arrive in the next round',
    );
  });
});

describe('the shared strings of SPEC 12', () => {
  function walk(value: unknown, where: string): void {
    if (typeof value === 'string') {
      clean(value, where);
      return;
    }
    if (typeof value === 'function') {
      clean(
        String((value as (...args: unknown[]) => string)('2 minutes ago', 3, 'pictures')),
        where,
      );
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((each, index) => walk(each, `${where}[${index}]`));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, each] of Object.entries(value)) walk(each, `${where}.${key}`);
    }
  }

  it('carry none of the words outside the Agent access dialog', () => {
    walk(TITLE_ROW, 'TITLE_ROW');
    walk(PROMPTS, 'PROMPTS');
    walk(SNACKBARS, 'SNACKBARS');
    walk(PANELS, 'PANELS');
    walk(FILMSTRIP, 'FILMSTRIP');
    walk(HOME, 'HOME');
    walk(PRESENT, 'PRESENT');
    walk(ERRORS, 'ERRORS');
    walk(IMPORT_PPTX, 'IMPORT_PPTX');
    const { agentAccess, ...dialogs } = DIALOGS;
    walk(dialogs, 'DIALOGS');
    /* the one dialog allowed the words, and the words it is allowed */
    expect(forbiddenWordsIn(agentAccess.title)).toEqual(['agent']);
    expect(forbiddenWordsIn(agentAccess.mcp)).toEqual(['MCP']);
  });

  it('spells the title row and the prompts as SPEC 12 does', () => {
    expect(TITLE_ROW.untitled).toBe('Untitled presentation');
    expect(TITLE_ROW.saving).toBe('Saving…');
    expect(TITLE_ROW.lastEdit('2 minutes ago')).toBe('Last edit 2 minutes ago');
    expect(PROMPTS.notes).toBe('Click to add speaker notes');
    expect(SNACKBARS.slidesDeleted(3)).toBe('Deleted 3 slides');
    expect(SNACKBARS.retiredLetter('S', 'hides the filmstrip', 'View')).toBe(
      'S now hides the filmstrip from the View menu',
    );
    expect(DIALOGS.share.stripped).toBe(
      'Skipped slides and speaker notes are not included in the view and present links',
    );
  });
});
