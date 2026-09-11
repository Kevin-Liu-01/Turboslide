// The rule table as JSON and the lint fixture index (MILESTONES M5 acceptance: every rule in
// packages/schema/src/rules.json has an entry in packages/lint/fixtures/index.json). rules.json is
// the rule ids in table order, a copy of RULE_IDS for scripts that read JSON. The fixture index
// names, per rule, the slides of the linter's fixture deck (packages/lint/src/fixtures/deck.ts)
// on which the static layer raises it, and the test files under packages/lint/src that name the
// rule (the rendered layer's fixtures are records the tests construct, so the file is the
// fixture). Both are deterministic: the fixture deck is data, and the test files are read in
// sorted path order. A rule with no fixture at all is written as null so the acceptance line and
// fixtures.test.ts fail on it instead of passing by omission.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { document as lintFixture } from '@turboslide/lint/fixtures/deck';
import { lintStatic } from '@turboslide/lint/lint-static';
import { RULES, RULE_IDS } from '@turboslide/schema/rules';
import type { RuleId } from '@turboslide/schema/rules';
import { stableJson } from './json-schema.ts';

/** The repository root, four levels above this file (packages/agent/src/generate). */
const ROOT = new URL('../../../../', import.meta.url);

export const RULES_JSON_PATH = 'packages/schema/src/rules.json';
export const FIXTURE_INDEX_PATH = 'packages/lint/fixtures/index.json';

const LINT_SRC = 'packages/lint/src';

export type FixtureEntry = {
  layer: 'static' | 'rendered' | 'both';
  /** slides of the fixture deck on which lintStatic raises the rule */
  slides: string[];
  /** test files under packages/lint/src naming the rule */
  tests: string[];
};

export type FixtureIndex = Record<RuleId, FixtureEntry | null>;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.test\.tsx?$/.test(name)) out.push(path);
  }
}

/** Every `*.test.ts` under packages/lint/src, repo relative, sorted. */
function lintTestFiles(root: string): string[] {
  const out: string[] = [];
  walk(join(root, LINT_SRC), out);
  return out.map((path) => relative(root, path).split('\\').join('/')).sort();
}

export function generateRulesJson(): string {
  return stableJson([...RULE_IDS]);
}

export function generateFixtureIndex(root: string = ROOT.pathname): string {
  const findings = lintStatic(lintFixture);
  const slidesByRule = new Map<RuleId, Set<string>>();
  for (const finding of findings) {
    const set = slidesByRule.get(finding.rule) ?? new Set<string>();
    set.add(finding.slideId);
    slidesByRule.set(finding.rule, set);
  }
  const tests = lintTestFiles(root).map((path) => ({
    path,
    text: readFileSync(join(root, path), 'utf8'),
  }));
  const index: Partial<FixtureIndex> = {};
  for (const rule of RULE_IDS) {
    const slides = [...(slidesByRule.get(rule) ?? [])].sort();
    const named = tests.filter((file) => file.text.includes(`'${rule}'`)).map((file) => file.path);
    index[rule] =
      slides.length === 0 && named.length === 0
        ? null
        : { layer: RULES[rule].layer, slides, tests: named };
  }
  return stableJson(index);
}

/** The rules whose fixture entry is null; the acceptance line and fixtures.test.ts want none. */
export function rulesWithoutFixture(root: string = ROOT.pathname): RuleId[] {
  const index = JSON.parse(generateFixtureIndex(root)) as FixtureIndex;
  return RULE_IDS.filter((rule) => index[rule] === null);
}
