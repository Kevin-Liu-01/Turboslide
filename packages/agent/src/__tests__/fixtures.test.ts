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
      if (entry.layer === 'static') expect(entry.slides.length, rule).toBeGreaterThan(0);
    }
  });
});
