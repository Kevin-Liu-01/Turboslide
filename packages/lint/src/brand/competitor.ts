// The product's words never name Google Slides (Kevin, 2026-10-05: "dont mention google slides at
// all"). A user facing string is one a person or an agent user reads: the string literals and JSX
// text of the product's sources (comments, tests, specs and fixtures are never read), the CSS the
// renderer ships as it is written (comments included) and the rules of every other sheet, the JSON
// of the source trees, and the whole text of the public documents and the generated agent
// contracts. Google as the sign in provider stays: "Continue with Google" and "the Google sign in
// page" do not match, and the possessive is allowed where it names the sign in itself
// (SIGN_IN_ALLOWED). The paths of the planning folder docs/gslides-parity keep its name.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { isExcluded, listFiles } from './run.ts';

/**
 * The ways a sentence names the product or describes its behaviour, in any case and with either
 * apostrophe: the name (singular or plural), the possessive, the short name `gslides` outside the
 * planning folder's paths, "as Google", "like Google", "in Google" and the other comparisons,
 * "Google" with a verb of behaviour ("Google shrinks it", "Google draws"), and Google's other
 * services, which the menus of a slides editor would otherwise name.
 */
export const COMPETITOR_WORDS = new RegExp(
  [
    String.raw`\bgoogle\s*slides?\b`,
    String.raw`\bgoogle['’]s\b`,
    String.raw`\bgslides\b(?!-parity\/)`,
    String.raw`\b(?:as|like|than|unlike|by|in)\s+google\b`,
    String.raw`\bgoogle\s+(?:does|did|draws|drew|shrinks|shows|keeps|puts|uses|writes|sets|retired|enables|cuts|copies|pastes|lists|places|moves|snaps|stretches|selects|names|calls|has|had)\b`,
    String.raw`\bgoogle\s+(?:services?|docs|sheets|drive|workspace|keep|meet|translate|explore)\b`,
  ].join('|'),
  'gi',
);

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
  'packages/effects/src',
  'packages/export/src',
  'packages/fonts/src',
  'packages/headless/src',
  'packages/identity/src',
  'packages/import/src',
  'packages/lint/src',
  'packages/materials/src',
  'packages/mcp/src',
  'packages/realtime/client',
  'packages/realtime/src',
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
  /* polish two (docs/POLISH-2.md 5.6, C29): the docs at /docs, their MDX read whole */
  'apps/studio/content/docs',
];

/**
 * The sheets the renderer reads from disk and writes into a page as they are (theme.ts SHEET_CSS_URL
 * and STAGE_CSS_URL, fonts inter.ts INTER_CSS): the standalone web page and the Node render carry
 * their comments, so these are read whole. Every other sheet goes through the client build, which
 * drops comments, so its rules alone are read.
 */
export const RAW_CSS_ROOTS: readonly string[] = ['packages/theme/src/', 'packages/fonts/src/'];

/** Files no check reads, each with its reason. */
export const COMPETITOR_EXCEPTIONS: readonly { file: string; reason: string }[] = [
  {
    file: 'packages/lint/src/brand/competitor.ts',
    reason: "The guard's own words and allowances.",
  },
  {
    file: 'packages/lint/src/context.ts',
    reason:
      "The deck copy lint's proper nouns: a seller's own deck may name any product, and the list keeps its capitals.",
  },
  {
    file: 'apps/studio/src/server/logo-index.snapshot.json',
    reason:
      "The logo picker's catalogue of third party brand marks (thesvg.org): a seller finds a product's mark only by searching for its name, and the catalogue stays whole (Kevin's decision on the no Google verifier's F5).",
  },
];

/** String literals that are tokens a program reads, never a sentence, each with its file and reason. */
export const COMPETITOR_LITERALS: readonly { file: string; literal: string; reason: string }[] = [
  {
    file: 'apps/cli/src/commands/export.ts',
    literal: "'gslides'",
    reason:
      'The removed export target the CLI still recognises, so its removal error answers; the error names no format.',
  },
];

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;
const TEXT = /\.(?:mdx?|json|txt|webmanifest)$/;
const CSS = /\.css$/;
const JSON_FILE = /\.json$/;
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
      const token = COMPETITOR_LITERALS.some((l) => l.file === file && l.literal === raw);
      if (!token && competitorMentions(raw).length > 0)
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

/** A sheet's text with its comments blanked to spaces, so the line numbers stay. */
export function cssRules(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** The lines of a sheet that name the competitor: the whole text of a sheet shipped as it is, the rules of any other. */
export function cssMentions(file: string, text: string): CompetitorFinding[] {
  const raw = RAW_CSS_ROOTS.some((root) => file.startsWith(root));
  return textMentions(file, raw ? text : cssRules(text));
}

const skipped = (file: string): boolean =>
  isExcluded(file) ||
  FIXTURES.test(file) ||
  COMPETITOR_EXCEPTIONS.some((exception) => exception.file === file);

/** Every user facing mention in the tree at `root`. */
export function scanCompetitorMentions(root: string): CompetitorFinding[] {
  const sources = listFiles(root, SOURCE_ROOTS).filter((f) => !skipped(f));
  const scripts = sources.filter((f) => SCRIPT.test(f));
  const sheets = sources.filter((f) => CSS.test(f));
  const json = sources.filter((f) => JSON_FILE.test(f));
  const texts = listFiles(root, TEXT_ROOTS).filter((f) => TEXT.test(f) && !skipped(f));
  const read = (f: string): string => readFileSync(join(root, f), 'utf8');
  return [
    ...scripts.flatMap((f) => {
      const text = read(f);
      return MAY_MENTION.test(text) ? scriptMentions(f, text) : [];
    }),
    ...sheets.flatMap((f) => cssMentions(f, read(f))),
    ...[...json, ...texts].flatMap((f) => textMentions(f, read(f))),
  ];
}
