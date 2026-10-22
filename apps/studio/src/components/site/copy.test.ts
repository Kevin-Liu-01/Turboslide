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
import { plainText } from './InlineCode';
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
  ['agents.sentence', AGENTS_SCREEN.sentence],
  ['agents.caption', AGENTS_SCREEN.table.caption],
  ['agents.total', AGENTS_SCREEN.table.total],
  ['present.sentence', PRESENT_SCREEN.sentence],
  ['present.figure.alt', PRESENT_SCREEN.figure.alt],
  ...PRESENT_SCREEN.keys.map((key): [string, string] => [`present.key.${key.key}`, key.label]),
  ['canvas.sentence', CANVAS_SCREEN.sentence],
  ['canvas.figure.alt', CANVAS_SCREEN.figure.alt],
  ['canvas.slide.heading', CANVAS_SCREEN.slide.heading],
  ['canvas.slide.paragraph', CANVAS_SCREEN.slide.paragraph],
  ['canvas.slide.credit', CANVAS_SCREEN.slide.credit],
  ['canvas.table.name', CANVAS_SCREEN.table.name],
  ...Object.values(CANVAS_SCREEN.table.heads).map((h): [string, string] => ['canvas.head', h]),
  ...Object.values(CANVAS_SCREEN.table.rows).map((r): [string, string] => ['canvas.row', r]),
  ['agents.flow.alt', AGENTS_SCREEN.flow.alt],
  ['agents.flow.people', AGENTS_SCREEN.flow.people],
  ['agents.flow.agents', AGENTS_SCREEN.flow.agents],
  ['agents.flow.menu', AGENTS_SCREEN.flow.menu],
  ...AGENTS_SCREEN.flow.stations.flatMap((st): Array<[string, string]> => [
    [`agents.flow.${st.id}.sub`, plainText(st.sub)],
    ...('refusal' in st ? [[`agents.flow.${st.id}.refusal`, st.refusal] as [string, string]] : []),
    ...('code' in st ? [] : [[`agents.flow.${st.id}.name`, st.name] as [string, string]]),
  ]),
  ['present.windows.alt', PRESENT_SCREEN.windows.alt],
  ['present.windows.show', PRESENT_SCREEN.windows.show.who],
  ['present.windows.presenter', PRESENT_SCREEN.windows.presenter.who],
  ['present.windows.opens', PRESENT_SCREEN.windows.opens],
  ['present.windows.moveBoth', PRESENT_SCREEN.windows.moveBoth],
  ['patterns.sentence', PATTERNS_SCREEN.sentence],
  ['patterns.figure.alt', PATTERNS_SCREEN.figure.alt],
  ['patterns.strip.name', PATTERNS_SCREEN.strip.name],
  ['patterns.strip.still', PATTERNS_SCREEN.strip.stillAt(4)],
  ['patterns.table.caption', PATTERNS_SCREEN.table.caption],
  ...PATTERNS_SCREEN.table.rows.flatMap((row): Array<[string, string]> => [
    ['patterns.row.place', row.place],
    ['patterns.row.pattern', row.pattern],
  ]),
  ['export.sentence', EXPORT_SCREEN.sentence],
  ...EXPORT_SCREEN.files.list.flatMap((file): Array<[string, string]> => [
    [`export.files.${file.id}.kind`, file.kind],
    [`export.files.${file.id}.says`, file.says.map((run) => run.text).join('')],
  ]),
  ['export.seam.alt', EXPORT_SCREEN.seam.alt({ text: 4, rect: 3, line: 12 })],
  ['export.seam.pictures', EXPORT_SCREEN.seam.holds.pictures({ text: 4 })],
  ['export.seam.editable', EXPORT_SCREEN.seam.holds.editable({ text: 4, rect: 3, line: 12 })],
  ...Object.values(EXPORT_SCREEN.seam.chips).map((c): [string, string] => ['export.seam.chip', c]),
  ['export.seam.slider', EXPORT_SCREEN.seam.slider.name],
  ['export.seam.value', EXPORT_SCREEN.seam.slider.value(50)],
  ...FOOTER.columns.flatMap((column): Array<[string, string]> => [
    [`footer.${column.id}`, column.title],
    ...column.links.map((link): [string, string] => [`footer.${column.id}.link`, link.label]),
  ]),
  ['footer.made', `${FOOTER.made.before} ${FOOTER.made.name}.`],
  ['footer.build', FOOTER.build.name('0123abc')],
  ['footer.appearance', FOOTER.appearance.name],
];

const buttons: ReadonlyArray<string> = [
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

  it('writes every button in Title Case', () => {
    for (const label of buttons) {
      const small = new Set(['a', 'an', 'the', 'to', 'of', 'and', 'or', 'in', 'on', 'for']);
      const words = label.split(/\s+/);
      words.forEach((word, i) => {
        if (i > 0 && small.has(word)) return;
        expect(/^[A-Z]/.test(word), `${label}: ${word}`).toBe(true);
      });
    }
  });
});
