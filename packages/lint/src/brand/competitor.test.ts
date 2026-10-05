import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
  competitorMentions,
  scanCompetitorMentions,
  scriptMentions,
  textMentions,
} from './competitor.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('no user facing string names Google Slides', () => {
  test('the product name and the possessive match in any case, with either apostrophe', () => {
    expect(competitorMentions('It has Google Slides’ menus')).toEqual(['Google Slides']);
    expect(competitorMentions('check how google slides does it')).toEqual(['google slides']);
    expect(competitorMentions("The menus are Google's")).toEqual(["Google's"]);
    expect(competitorMentions('None is Google’s Transparent border')).toEqual(['Google’s']);
  });

  test('Google as the sign in provider is allowed', () => {
    expect(competitorMentions('Continue with Google')).toEqual([]);
    expect(competitorMentions("Uses your Google account's name and address")).toEqual([]);
    expect(competitorMentions('the tab reached the Google sign in page')).toEqual([]);
    expect(competitorMentions("the tab reached Google's sign in page")).toEqual([]);
    expect(competitorMentions("Google's consent screen")).toEqual([]);
    expect(competitorMentions('GOOGLE_CLIENT_ID and /api/auth/callback/google')).toEqual([]);
  });

  test('a script is read in its strings and JSX text, never in its comments', () => {
    const source = [
      "// Google's menu order, a comment",
      "const a = 'Google Slides';",
      'const b = <p>The menus are Google’s</p>;',
      '/* Google Slides in a block comment */',
      "const c = 'Continue with Google';",
    ].join('\n');
    expect(scriptMentions('x.tsx', source).map((f) => f.line)).toEqual([2, 3]);
  });

  test('a text file is read line by line', () => {
    expect(textMentions('README.md', 'one\nLibreOffice and Google Slides draw it\n')).toEqual([
      { file: 'README.md', line: 2, text: 'LibreOffice and Google Slides draw it' },
    ]);
  });

  /* about 2,000 files read from disk; the bound is for a loaded machine */
  test('the tree carries none in its product strings, documents and agent contracts', () => {
    expect(scanCompetitorMentions(ROOT)).toEqual([]);
  }, 120_000);
});
