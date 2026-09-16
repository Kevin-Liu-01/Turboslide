import { describe, expect, test } from 'vitest';

import { RULE_IDS } from '@turboslide/schema/rules';

import {
  generateFixtureIndex,
  generateRulesJson,
  rulesWithoutFixture,
} from '../generate/fixtures.ts';
import type { FixtureIndex } from '../generate/fixtures.ts';

// MILESTONES M5 acceptance, last line: every rule in packages/schema/src/rules.json has a fixture
// in packages/lint/fixtures/index.json. The generator writes both; this test fails on the rule
// that has neither a fixture deck slide nor a test naming it, before the acceptance line does.
// A static rule that runs over a checker the caller injects (gslides-parity SPEC-5 7.2; b5.md item
// 12 and R11: `text/spelling` answers nothing without `LintOptions.spelling`) has its test file as
// its fixture, because the fixture index lints the fixture deck without a dictionary. Merge 2.
const INJECTED_CHECKER_RULES: ReadonlySet<string> = new Set(['text/spelling']);

describe('the rule table as JSON and the fixture index', () => {
  test('rules.json is RULE_IDS in table order', () => {
    expect(JSON.parse(generateRulesJson())).toEqual([...RULE_IDS]);
  });

  test('every rule has a fixture: a fixture deck slide or a test file', () => {
    expect(rulesWithoutFixture()).toEqual([]);
    const index = JSON.parse(generateFixtureIndex()) as FixtureIndex;
    for (const rule of RULE_IDS) {
      const entry = index[rule];
      expect(entry, rule).not.toBeNull();
      if (entry === null) continue;
      expect(entry.slides.length + entry.tests.length, rule).toBeGreaterThan(0);
      if (entry.layer === 'static' && !INJECTED_CHECKER_RULES.has(rule))
        expect(entry.slides.length, rule).toBeGreaterThan(0);
    }
  });
});
