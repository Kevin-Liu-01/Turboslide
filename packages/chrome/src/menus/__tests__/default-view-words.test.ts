import { describe, expect, it } from 'vitest';

import { lintStatic } from '@turboslide/lint/lint-static';
import { document as lintFixture } from '@turboslide/lint/fixtures/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import { MENUS, TITLE_ROW_ITEMS, TOOLBAR_HEAD, TOOLBAR_TAIL_DEFAULT, allItems } from '../model.ts';
import {
  ACCESS_PAGE,
  ACCOUNT,
  ACTIVITY,
  AGENT_SENTENCES,
  CANVAS,
  CANVAS_NOTICES,
  CHECKS,
  COMMENTS,
  DIALOGS,
  DITHER,
  DOWNLOAD_PROGRESS,
  ERRORS,
  FILMSTRIP,
  FORBIDDEN_DEFAULT_VIEW_WORDS,
  FORMAT,
  GUIDES,
  HOME,
  IMPORT_PPTX,
  INBOX,
  PANELS,
  PICKERS,
  PRESENCE,
  PRESENT,
  PROMPTS,
  REFUSALS,
  SNACKBARS,
  TITLE_ROW,
  WORD_ART,
  forbiddenWordsIn,
  stubClause,
  stubTooltip,
} from '../strings.ts';
import { TOOLBAR_TAIL_END } from '../toolbar-tails.ts';

// The default view words (SPEC 12, R07 rule 22; SPEC-3 15): none of the engineering words reaches
// a label, a tooltip sentence or a stub clause of the menu model, the toolbar or the shared
// strings, outside Tools > Advanced, Extensions > Agent access and the agent sentences of
// SPEC-3 10.1 and 15. The shell-level form of this test (rendering /new and /edit) lands with the
// rest of B3; this one greps the data every surface is generated from.

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
    /* SPEC-2 section 10, 0.53: the process words of the canvas work never reach a person */
    for (const word of ['round', 'convert', 'conversion', 'measure', 'layer', 'overlay'])
      expect(FORBIDDEN_DEFAULT_VIEW_WORDS, word).toContain(word);
    expect(forbiddenWordsIn('The slide converts on the first drag')).toEqual([]);
    expect(forbiddenWordsIn('Convert the slide')).toEqual(['convert']);
    expect(forbiddenWordsIn('Arrives in the next round')).toEqual(['round']);
    /* Google's nouns stay allowed */
    expect(forbiddenWordsIn('Objects on the canvas snap to the guides and the ruler')).toEqual([]);
  });
});

describe('the menu model', () => {
  it('keeps the engineering words out of every label, tooltip and stub clause in the default view', () => {
    let laterClauses = 0;
    for (const item of allItems()) {
      if (item.status === 'omit' || EXEMPT(item.id)) continue;
      clean(item.label, item.id);
      clean(item.altLabel?.label, item.id);
      clean(item.doc, item.id);
      clean(item.disabledReason, item.id);
      if (item.stubReason !== undefined) {
        clean(stubClause(item.stubReason), item.id);
        laterClauses += 1;
      }
    }
    /* SPEC-2 0.53: every Later clause is checked, and there are Later rows to check */
    expect(laterClauses).toBeGreaterThan(0);
    for (const menu of MENUS) clean(menu.label, menu.id);
    for (const item of TITLE_ROW_ITEMS) clean(item.label, item.id);
  });

  it('keeps them out of the toolbar', () => {
    for (const control of [...TOOLBAR_HEAD, ...TOOLBAR_TAIL_DEFAULT, ...TOOLBAR_TAIL_END]) {
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
    /* round two (SPEC-2 section 10): the canvas chips, the rulers and guides, the Check slides
       sentences, the pickers, the Format options words and the Download dialog's progress */
    walk(CANVAS, 'CANVAS');
    walk(GUIDES, 'GUIDES');
    walk(CHECKS, 'CHECKS');
    walk(PICKERS, 'PICKERS');
    walk(FORMAT, 'FORMAT');
    walk(DOWNLOAD_PROGRESS, 'DOWNLOAD_PROGRESS');
    walk(WORD_ART, 'WORD_ART');
    walk(CANVAS_NOTICES, 'CANVAS_NOTICES');
    const { agentAccess, ...dialogs } = DIALOGS;
    walk(dialogs, 'DIALOGS');
    /* the one dialog allowed the words, and the words it is allowed */
    expect(forbiddenWordsIn(agentAccess.title)).toEqual(['agent']);
    expect(forbiddenWordsIn(agentAccess.mcp)).toEqual(['MCP']);
    /* round three (SPEC-3 6.8, 15): the refusals, the presence, comment, inbox, activity, account,
       access page and dither words; the avatar tab "Glyph" is the spec's own label (0.22, 7.6) and
       the one key exempted, recorded in build-3/b6.md for Kevin */
    walk(REFUSALS, 'REFUSALS');
    walk(PRESENCE, 'PRESENCE');
    walk(COMMENTS, 'COMMENTS');
    walk(INBOX, 'INBOX');
    walk(ACTIVITY, 'ACTIVITY');
    const { avatar, ...account } = ACCOUNT;
    walk(account, 'ACCOUNT');
    const { tabs, ...avatarWords } = avatar;
    walk(avatarWords, 'ACCOUNT.avatar');
    expect(tabs).toEqual(['Initials', 'Glyph', 'Dither', 'Picture']);
    expect(forbiddenWordsIn(tabs.join(' '))).toEqual(['glyph']);
    walk(ACCESS_PAGE, 'ACCESS_PAGE');
    walk(DITHER, 'DITHER');
    /* the agent sentences carry the nouns on purpose and never reach the default view (the
       matcher reads whole words, so the plural "twins" passes it; "source" is caught) */
    expect(forbiddenWordsIn(AGENT_SENTENCES.noContinuousSource)).toEqual(['source']);
    expect(forbiddenWordsIn(AGENT_SENTENCES.agentTrust('a7f3'))).toEqual(['agent']);
    expect(forbiddenWordsIn(AGENT_SENTENCES.materializeFirst)).toEqual([]);
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

  it('spells the canvas readouts and the Check slides sentences as SPEC-2 section 10 does', () => {
    expect(CANVAS.size(480, 64)).toBe('480 × 64');
    expect(CANVAS.rotation(37)).toBe('37°');
    expect(CANVAS.objects(3)).toBe('3 objects');
    expect(CANVAS.group).toBe('Group');
    expect(GUIDES.inches(800)).toBe('6.67 in');
    expect(GUIDES.inches(1600)).toBe('13.33 in');
    expect(GUIDES.showRuler).toBe('Show ruler');
    expect(GUIDES.hideRuler).toBe('Hide ruler');
    expect(GUIDES.deleteGuide).toBe('Delete guide');
    expect(CHECKS.arrangedByHand).toBe('This slide is arranged by hand; Apply layout re-flows it');
    expect(PICKERS.tableGrid.size(4, 3)).toBe('4 x 3');
    expect(PICKERS.tableGrid.cell(4, 3)).toBe('4 columns by 3 rows');
    expect(PICKERS.tableGrid.cell(1, 1)).toBe('1 column by 1 row');
    expect(FORMAT.autofit.growNote).toBe('Available on a text box placed on the slide');
  });
});

describe('the lint rules (SPEC-2 0.52, section 10)', () => {
  /* the round one rules whose proposals cite DECK-GRAMMAR.md or say twin, native, run, source or
     measure; their wording lives in the lint package (B1) and is requested in build-2/b3.md. The
     list is a ceiling: no rule of round two may join it, and a reworded rule leaves it. */
  const ROUND_ONE_WORDED: ReadonlySet<string> = new Set([
    'export/non-native',
    'asset/twin-or-border',
    'copy/no-eyebrow',
    'copy/token-first',
    'dia/label-clearance',
    'copy/contrast-pair',
    'color/semantic-icons-only',
    'color/tokens-only',
    'icon/placement',
    'scales/marker-equals-value',
    'type/weight-cap',
    'dia/stroke-grammar',
    'escape/html-block',
    'picture/blank-twin',
    'asset/license-missing',
    'color/off-palette',
    'picture/plate-clear',
  ]);

  it('keep the engineering words out of every finding a person reads on the fixture decks, outside the round one ceiling', () => {
    const findings = [...lintStatic(lintFixture), ...lintStatic(workedDocument())];
    expect(findings.length).toBeGreaterThan(0);
    const rules = new Set(findings.map((finding) => finding.rule));
    for (const finding of findings) {
      if (ROUND_ONE_WORDED.has(finding.rule)) continue;
      clean(finding.proposal, `${finding.rule} on ${finding.slideId}`);
    }
    /* the canvas rules of round two are clean, whatever fires */
    for (const rule of [
      'layout/freeform',
      'freeform/off-sheet',
      'freeform/overlap',
      'text/overflow',
      'chart/size',
    ])
      expect(ROUND_ONE_WORDED.has(rule), rule).toBe(false);
    const freeform = findings.find((finding) => finding.rule === 'layout/freeform');
    if (freeform !== undefined) expect(freeform.proposal).toBe(CHECKS.arrangedByHand);
    expect(rules.size).toBeGreaterThan(5);
  });
});
