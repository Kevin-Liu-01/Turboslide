import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
  competitorMentions,
  cssMentions,
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

  test('a comparison, a behaviour, the short name and the other services match too', () => {
    expect(competitorMentions('the argument, as in Google Slides')).toEqual(['in Google']);
    expect(competitorMentions('one Google Slide')).toEqual(['Google Slide']);
    expect(competitorMentions('the header row is bold, as Google does')).toEqual(['as Google']);
    expect(competitorMentions('the rows stretch; Google shrinks it;')).toEqual(['Google shrinks']);
    expect(competitorMentions('Appears in Google only with screen reader support on')).toEqual([
      'in Google',
    ]);
    expect(competitorMentions('A Google service')).toEqual(['Google service']);
    expect(competitorMentions('export gslides was removed')).toEqual(['gslides']);
    expect(competitorMentions('(gslides-parity SPEC-2 2.2.19)')).toEqual(['gslides']);
  });

  test('the planning folder keeps its name in a path, and other Google products are not the competitor', () => {
    expect(competitorMentions('docs/gslides-parity/focus/manual-checklist.md')).toEqual([]);
    expect(competitorMentions('docs/archive/gslides-parity/SPEC-2.md 2.8.1')).toEqual([]);
    expect(competitorMentions('the AWS, Azure, Google Cloud and Kubernetes icon sets')).toEqual([]);
    expect(competitorMentions('the faces come from Google Fonts')).toEqual([]);
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

  test('a sheet the renderer ships as written is read with its comments, any other sheet by its rules', () => {
    const sheet = ['/* the fill covers the row, as Google draws it */', '.a { color: red; }'].join(
      '\n',
    );
    expect(
      cssMentions('packages/theme/src/gt-ink-paper/sheet.css', sheet).map((f) => f.line),
    ).toEqual([1]);
    expect(cssMentions('packages/chrome/src/Panel.css', sheet)).toEqual([]);
    expect(
      cssMentions(
        'packages/chrome/src/Panel.css',
        ".a::after {\n  content: 'as in Google Slides';\n}",
      ).map((f) => f.line),
    ).toEqual([2]);
  });

  test('a token a program reads is allowed only where it is listed', () => {
    const source = "if (rest[0] === 'gslides') throw new Error('that export format was removed');";
    expect(scriptMentions('apps/cli/src/commands/export.ts', source)).toEqual([]);
    expect(scriptMentions('apps/cli/src/commands/other.ts', source).map((f) => f.line)).toEqual([
      1,
    ]);
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
