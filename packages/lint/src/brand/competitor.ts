// The product's words never name Google Slides (Kevin, 2026-10-05: "dont mention google slides at
// all"). A user facing string is one a person or an agent user reads: the string literals and JSX
// text of the product's sources (comments, tests, specs and fixtures are never read), and the whole
// text of the public documents and the generated agent contracts. Google as the sign in provider
// stays: "Continue with Google" and "the Google sign in page" do not match, and the possessive
// is allowed where it names the sign in itself (SIGN_IN_ALLOWED).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { isExcluded, listFiles } from './run.ts';

/** The product name and the possessive, in any case and with either apostrophe. */
export const COMPETITOR_WORDS = /\bgoogle\s+slides\b|\bgoogle['’]s\b/gi;

/** The cheap test that decides whether a script is parsed at all (the pattern without its state). */
const MAY_MENTION = new RegExp(COMPETITOR_WORDS.source, 'i');

/** The possessive where Google is the sign in provider: its sign in page, consent screen, account picker. */
export const SIGN_IN_ALLOWED: readonly RegExp[] = [
  /\bgoogle['’]s\s+(?:sign[\s-]in|consent|account picker|oauth)/i,
];

/** The source trees whose string literals and JSX text a person or an agent reads. */
export const SOURCE_ROOTS: readonly string[] = [
  'apps/cli/src',
  'apps/render-worker/src',
  'apps/realtime-worker/src',
  'apps/studio/src',
  'packages/agent/src',
  'packages/chrome/src',
  'packages/export/src',
  'packages/lint/src',
  'packages/materials/src',
  'packages/render/src',
  'packages/schema/src',
  'packages/store/src',
  'packages/theme/brand',
  'packages/theme/src',
  'packages/viewer/src',
  'packages/viewer/standalone',
  'docs/readme',
];

/** The files read whole: the README, the release notes, the agent contracts, the skills, the decks people open. */
export const TEXT_ROOTS: readonly string[] = [
  'README.md',
  'docs/updates.md',
  'docs/grammar.md',
  'packages/agent/generated',
  'skills',
  'apps/studio/public/manifest.webmanifest',
  'decks/templates',
  'decks/gt-brand',
];

/** Files no check reads, each with its reason. */
export const COMPETITOR_EXCEPTIONS: readonly { file: string; reason: string }[] = [
  {
    file: 'packages/lint/src/context.ts',
    reason:
      "The deck copy lint's proper nouns: a seller's own deck may name any product, and the list keeps its capitals.",
  },
];

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;
const TEXT = /\.(?:md|json|txt|webmanifest)$/;
const FIXTURES = /(^|\/)(?:__fixtures__|fixtures)\//;

export type CompetitorFinding = { file: string; line: number; text: string };

/** The mentions in a text that no sign in allowance covers. */
export function competitorMentions(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(COMPETITOR_WORDS)) {
    const at = match.index ?? 0;
    const tail = text.slice(at, at + 64);
    if (SIGN_IN_ALLOWED.some((re) => tail.search(re) === 0)) continue;
    found.push(match[0]);
  }
  return found;
}

const lineOf = (text: string, at: number): number => text.slice(0, at).split('\n').length;

/** The string literals, template parts and JSX text of one script that name the competitor. */
export function scriptMentions(file: string, text: string): CompetitorFinding[] {
  const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const findings: CompetitorFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      const raw = node.getText(source);
      if (competitorMentions(raw).length > 0)
        findings.push({
          file,
          line: lineOf(text, node.getStart(source)),
          text: raw.replace(/\s+/g, ' ').slice(0, 160),
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

/** The lines of a whole text file that name the competitor. */
export function textMentions(file: string, text: string): CompetitorFinding[] {
  return text
    .split('\n')
    .flatMap((line, index) =>
      competitorMentions(line).length > 0
        ? [{ file, line: index + 1, text: line.trim().slice(0, 160) }]
        : [],
    );
}

const skipped = (file: string): boolean =>
  isExcluded(file) ||
  FIXTURES.test(file) ||
  COMPETITOR_EXCEPTIONS.some((exception) => exception.file === file);

/** Every user facing mention in the tree at `root`. */
export function scanCompetitorMentions(root: string): CompetitorFinding[] {
  const scripts = listFiles(root, SOURCE_ROOTS).filter((f) => SCRIPT.test(f) && !skipped(f));
  const texts = listFiles(root, TEXT_ROOTS).filter((f) => TEXT.test(f) && !skipped(f));
  return [
    ...scripts.flatMap((f) => {
      const text = readFileSync(join(root, f), 'utf8');
      return MAY_MENTION.test(text) ? scriptMentions(f, text) : [];
    }),
    ...texts.flatMap((f) => textMentions(f, readFileSync(join(root, f), 'utf8'))),
  ];
}
