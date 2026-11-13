import { describe, expect, it } from 'vitest';

import {
  CONTRAST_PAIR_PATTERN,
  EM_DASH,
  EN_DASH,
  EXCLAMATION,
  metaphorCandidates,
  wordsOutsideSentenceCase,
} from '@turboslide/theme/copy';

import { AVATAR_PRESS, CARET, FOOTER, HERO, NAV, STORY, TITLE_TEXT } from './copy';
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
  /* the story's second chapter names the file a download writes */
  'PowerPoint',
];

const sentences: ReadonlyArray<[string, string]> = [
  ['meta.title', HOME_META.title],
  ['meta.description', HOME_META.description],
  ['title', TITLE_TEXT],
  ['hero.lead', HERO.lead],
  ['hero.caret', CARET.flag],
  ['hero.figure.alt', HERO.figure.alt],
  ['avatar.person', AVATAR_PRESS.person.sentence],
  ['avatar.agent', AVATAR_PRESS.agent.sentence],
  ...STORY.chapters.map((chapter): [string, string] => [`story.${chapter.id}`, chapter.lead]),
  ...FOOTER.columns.flatMap((column): Array<[string, string]> => [
    [`footer.${column.id}`, column.title],
    ...column.links.map((link): [string, string] => [`footer.${column.id}.link`, link.label]),
  ]),
  ['footer.made', `${FOOTER.made.before} ${FOOTER.made.name}.`],
  ['footer.build', FOOTER.build.name('0123abc')],
  ['footer.appearance', FOOTER.appearance.name],
];

/* the story's headings are short phrases in Title Case (Kevin, 2026-10-30: "Feature Parity for
   Agents"), checked with the buttons */
const buttons: ReadonlyArray<string> = [
  ...STORY.chapters.map((chapter) => chapter.heading),
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

  /* Kevin, 2026-11-12: "no turboslide shouldnt be in the header"; the bar above it names the
     product, and the page's title and description keep the name for search */
  it('names no product in the header', () => {
    for (const text of [
      TITLE_TEXT,
      HERO.lead,
      CARET.flag,
      HERO.primary.label,
      HERO.secondary.label,
    ])
      expect(text, text).not.toMatch(/turboslide/i);
    expect(HOME_META.title).toMatch(/^Turboslide /);
    expect(HOME_META.description).toMatch(/^Turboslide /);
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

  it('writes every button and chapter heading in Title Case', () => {
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
