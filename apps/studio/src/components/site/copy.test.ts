import { describe, expect, it } from 'vitest';

import {
  CONTRAST_PAIR_PATTERN,
  EM_DASH,
  EN_DASH,
  EXCLAMATION,
  metaphorCandidates,
  wordsOutsideSentenceCase,
} from '@turboslide/theme/copy';

import { AGENTS_SCREEN, AVATAR_DOCS, FOOTER, HERO, NAV, PRESENT_SCREEN, TITLE_TEXT } from './copy';
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
];

const sentences: ReadonlyArray<[string, string]> = [
  ['meta.title', HOME_META.title],
  ['meta.description', HOME_META.description],
  ['title', TITLE_TEXT],
  ['hero.lead', HERO.lead],
  ['hero.note', HERO.note],
  ['hero.figure.label', HERO.figure.label],
  ['hero.figure.caption', HERO.figure.caption],
  ['hero.figure.alt', HERO.figure.alt],
  ['avatar.person', AVATAR_DOCS.person],
  ['avatar.agent', AVATAR_DOCS.agent],
  ['agents.label', AGENTS_SCREEN.label],
  ['agents.sentence', AGENTS_SCREEN.sentence],
  ['agents.terminal', AGENTS_SCREEN.terminal.label],
  ['agents.caption', AGENTS_SCREEN.table.caption],
  ['agents.note', AGENTS_SCREEN.note],
  ['agents.total', AGENTS_SCREEN.table.total],
  ['present.label', PRESENT_SCREEN.label],
  ['present.sentence', PRESENT_SCREEN.sentence],
  ['present.figure.label', PRESENT_SCREEN.figure.label],
  ['present.figure.alt', PRESENT_SCREEN.figure.alt],
  ...PRESENT_SCREEN.keys.map((key): [string, string] => [`present.key.${key.key}`, key.label]),
  ...FOOTER.columns.flatMap((column): Array<[string, string]> => [
    [`footer.${column.id}`, column.title],
    ...column.links.map((link): [string, string] => [`footer.${column.id}.link`, link.label]),
  ]),
  ['footer.made', FOOTER.made],
  ['footer.licence', FOOTER.licence],
];

const buttons: ReadonlyArray<string> = [
  NAV.skip,
  NAV.newPresentation.label,
  HERO.primary.label,
  HERO.secondary.label,
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
