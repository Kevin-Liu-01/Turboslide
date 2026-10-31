import { describe, expect, it } from 'vitest';

import {
  CONTRAST_PAIR_PATTERN,
  EM_DASH,
  EN_DASH,
  EXCLAMATION,
  metaphorCandidates,
  wordsOutsideSentenceCase,
} from '@turboslide/theme/copy';

import {
  AGENTS_SCREEN,
  AVATAR_PRESS,
  CANVAS_SCREEN,
  EXPORT_SCREEN,
  FOOTER,
  HERO,
  NAV,
  PATTERNS_SCREEN,
  PRESENT_SCREEN,
  TITLE_TEXT,
} from './copy';
import { HOME_META } from './meta';

// The landing's words (docs/SITE.md A.1; plain technical English): no em dash, en dash or
// exclamation mark, no metaphor word, no "X, not Y" pair, sentence case for every sentence and
// label with the product's names and tokens allowed, Title Case on every button, the h1 as Kevin
// wrote it, and no sentence of more than 30 words.

/**
 * The proper names and tokens of these words: tools, transports, the company, the poster deck's
 * client, and the product's own control names the alt texts read out (Share, File to Help, the
 * viewer's Previous, Next, Slide, Grid, Book, Theme and Present).
 */
const NAMES = [
  'Claude Code',
  'Codex',
  'MCP',
  'HTTP',
  'CLI',
  'GitHub',
  'MIT License',
  'FAQ',
  'General Translation',
  'Kevin Liu',
  'Page',
  'Northwind',
  'Share',
  'File',
  'Help',
  'Previous',
  'Next',
  'Slide',
  'Grid',
  'Book',
  'Theme',
  'Present',
  /* the figures of screens 02 to 06: the photograph's place and author and its licence, the
     product's menus, panels and settings by name, the example deck and its file names */
  'Cape Hatteras Light',
  'North Carolina',
  'Outer Banks',
  'National Park Service',
  'X',
  'Y',
  'New',
  'Version',
  'Format',
  'Still',
  'Reduce',
  'Dithering',
  'Download',
  'Pictures',
  'Editable',
  'PowerPoint',
  'PDF',
  'S',
  'Questions from Northwind',
];

const sentences: ReadonlyArray<[string, string]> = [
  ['meta.title', HOME_META.title],
  ['meta.description', HOME_META.description],
  ['title', TITLE_TEXT],
  ['hero.lead', HERO.lead],
  ['hero.figure.alt', HERO.figure.alt],
  ['avatar.person', AVATAR_PRESS.person.sentence],
  ['avatar.agent', AVATAR_PRESS.agent.sentence],
  ['canvas.figure.alt', CANVAS_SCREEN.figure.alt],
  ['canvas.slide.heading', CANVAS_SCREEN.slide.heading],
  ['canvas.slide.paragraph', CANVAS_SCREEN.slide.paragraph],
  ['canvas.slide.credit', CANVAS_SCREEN.slide.credit],
  ['canvas.move.name', CANVAS_SCREEN.move.name],
  ['canvas.move.doc', CANVAS_SCREEN.move.doc],
  ['canvas.turn.name', CANVAS_SCREEN.turn.name],
  ['canvas.turn.doc', CANVAS_SCREEN.turn.doc],
  ['canvas.degrees', CANVAS_SCREEN.degrees(354)],
  ['agents.caption', AGENTS_SCREEN.table.caption],
  ['agents.person', AGENTS_SCREEN.table.person.transport],
  ...AGENTS_SCREEN.table.rows.map((row): [string, string] => [`agents.${row.id}`, row.transport]),
  ['agents.count', AGENTS_SCREEN.table.count(190)],
  ['agents.path.name', AGENTS_SCREEN.path.name],
  ['agents.path.history', AGENTS_SCREEN.path.history],
  ['agents.path.record', AGENTS_SCREEN.path.record],
  ['present.windows.name', PRESENT_SCREEN.windows.name],
  ['present.windows.show', PRESENT_SCREEN.windows.show],
  ['present.windows.presenter', PRESENT_SCREEN.windows.presenter],
  ...PRESENT_SCREEN.keys.flatMap((key): Array<[string, string]> => [
    [`present.key.${key.key}`, key.label],
    ...('doc' in key ? [[`present.key.${key.key}.doc`, key.doc] as [string, string]] : []),
  ]),
  ['patterns.lead', PATTERNS_SCREEN.lead],
  ['patterns.figure.alt', PATTERNS_SCREEN.figure.alt],
  ['patterns.time.name', PATTERNS_SCREEN.time.name],
  ['patterns.time.doc', PATTERNS_SCREEN.time.doc],
  ['patterns.time.still', PATTERNS_SCREEN.time.stillAt(4)],
  ['patterns.time.value', PATTERNS_SCREEN.time.value(4)],
  ['export.files.pictures', EXPORT_SCREEN.files.pictures.holds({ text: 4 })],
  ['export.files.editable', EXPORT_SCREEN.files.editable.holds({ text: 4, rect: 3, line: 12 })],
  ['export.files.pdf', EXPORT_SCREEN.files.pdf.holds],
  ['export.seam.alt', EXPORT_SCREEN.seam.alt({ text: 4, rect: 3, line: 12 })],
  ...Object.values(EXPORT_SCREEN.seam.chips).map((c): [string, string] => ['export.seam.chip', c]),
  ['export.seam.slider', EXPORT_SCREEN.seam.slider.name],
  ['export.seam.doc', EXPORT_SCREEN.seam.slider.doc],
  ['export.seam.value', EXPORT_SCREEN.seam.slider.value(50)],
  ...FOOTER.columns.flatMap((column): Array<[string, string]> => [
    [`footer.${column.id}`, column.title],
    ...column.links.map((link): [string, string] => [`footer.${column.id}.link`, link.label]),
  ]),
  ['footer.made', `${FOOTER.made.before} ${FOOTER.made.name}.`],
  ['footer.build', FOOTER.build.name('0123abc')],
  ['footer.appearance', FOOTER.appearance.name],
];

/* the screens' headings are short phrases in Title Case (Kevin, 2026-10-30: "Feature Parity for
   Agents"), checked with the buttons */
const buttons: ReadonlyArray<string> = [
  CANVAS_SCREEN.heading,
  AGENTS_SCREEN.heading,
  PRESENT_SCREEN.heading,
  PATTERNS_SCREEN.heading,
  EXPORT_SCREEN.heading,
  NAV.skip,
  NAV.newPresentation.label,
  HERO.primary.label,
  HERO.secondary.label,
  FOOTER.appearance.light,
  FOOTER.appearance.dark,
];

describe('the landing’s copy', () => {
  it('keeps the h1 as Kevin wrote it', () => {
    expect(TITLE_TEXT).toBe('Presentations for people and agents');
  });

  it('is plain technical English in sentence case', () => {
    for (const [path, text] of sentences) {
      expect(text.includes(EM_DASH), path).toBe(false);
      expect(text.includes(EN_DASH), path).toBe(false);
      expect(text.includes(EXCLAMATION), path).toBe(false);
      expect(metaphorCandidates(text), path).toEqual([]);
      expect(CONTRAST_PAIR_PATTERN.test(text), path).toBe(false);
      expect(wordsOutsideSentenceCase(text, NAMES), path).toEqual([]);
      for (const sentence of text.split(/(?<=\.)\s+/))
        expect(sentence.split(/\s+/).length, `${path}: ${sentence}`).toBeLessThanOrEqual(30);
    }
  });

  it('writes every button and screen heading in Title Case', () => {
    for (const label of buttons) {
      expect(label.includes(EM_DASH) || label.endsWith('.'), label).toBe(false);
      const small = new Set(['a', 'an', 'the', 'to', 'of', 'and', 'or', 'in', 'on', 'for', 'from']);
      const words = label.split(/\s+/);
      words.forEach((word, i) => {
        if (i > 0 && small.has(word)) return;
        expect(/^[A-Z]/.test(word), `${label}: ${word}`).toBe(true);
      });
    }
  });
});
