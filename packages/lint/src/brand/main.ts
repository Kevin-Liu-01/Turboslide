// The brand lint's command, run by check step 33 (scripts/check.mjs) from the tree's root:
//
//   node packages/lint/src/brand/main.ts                 the mode of config.ts
//   node packages/lint/src/brand/main.ts --report        print and pass
//   node packages/lint/src/brand/main.ts --enforce       fail on any finding not accepted
//   node packages/lint/src/brand/main.ts --json <file>   also write the result as JSON
//   node packages/lint/src/brand/main.ts --rules css/radius,gt-ui/no-em-dash
//   node packages/lint/src/brand/main.ts --files packages/chrome/src/TitleRow.css,...
//   node packages/lint/src/brand/main.ts --ref HEAD      read a commit's tree, not the working tree
//
// Exit 0 when the run passes, 1 on findings in enforce mode, 2 when a file does not parse or the
// file list cannot be read (an infrastructure failure is never a pass, lint-lines.mjs line 113).
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CSS_RULES, SOURCE_RULES } from './config.ts';
import type { BrandLintMode, BrandRuleId } from './config.ts';
import { formatBrandLint, runBrandLint } from './run.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const KNOWN = new Set<string>([...SOURCE_RULES, ...CSS_RULES, 'brand/credits']);

function value(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function list(text: string | undefined): string[] | undefined {
  return text === undefined
    ? undefined
    : text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function main(argv: readonly string[]): number {
  const mode: BrandLintMode | undefined = argv.includes('--enforce')
    ? 'enforce'
    : argv.includes('--report')
      ? 'report'
      : undefined;
  const ruleList = list(value(argv, 'rules'));
  const unknown = (ruleList ?? []).filter((r) => !KNOWN.has(r));
  if (unknown.length > 0) {
    console.error(`brand lint: unknown rule(s) ${unknown.join(', ')}`);
    return 2;
  }
  const result = runBrandLint({
    root: ROOT,
    mode,
    rules: ruleList ? new Set(ruleList as BrandRuleId[]) : undefined,
    files: list(value(argv, 'files')),
    ref: value(argv, 'ref'),
  });
  const json = value(argv, 'json');
  if (json) writeFileSync(resolve(process.cwd(), json), `${JSON.stringify(result, null, 2)}\n`);
  const lines = formatBrandLint(result);
  for (const line of lines) (result.failed ? console.error : console.log)(line);
  if (result.broken.length > 0) return 2;
  return result.failed ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`brand lint: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
