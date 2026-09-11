// The skills test (SPEC 7.5; MILESTONES M4 item 3): the four SKILL.md files exist in Glyphfield's
// shape (front matter with the directory's name and a description, under 50 lines, one reference
// file they link, a completion section), each has its agents/openai.yaml, and the generated
// reference tables agree with the action table and the rule table by name.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ACTION_IDS, actionsOn } from '@turboslide/schema/actions';
import { RULE_IDS } from '@turboslide/schema/rules';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../generate/contracts.ts';
import { generateManifest } from '../generate/manifest.ts';

const SKILLS: Record<string, { reference: string; mentions: string[] }> = {
  'turboslide-create': { reference: 'grammar.md', mentions: ['slide.insert', 'baseRevision'] },
  'turboslide-api': {
    reference: 'actions.md',
    mentions: ['/api/actions', '/mcp', 'force', 'x-turboslide-author'],
  },
  'turboslide-studio': {
    reference: 'browser-api.md',
    mentions: ['window.turboslide.studio', 'describe()'],
  },
  'turboslide-verify': {
    reference: 'verification.md',
    mentions: ['judge bundle', 'judge-loop', 'turboslide fix'],
  },
};

const MAX_LINES = 50;

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function frontMatter(text: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (match === null) return {};
  const out: Record<string, string> = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    out[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return out;
}

describe('the four skills', () => {
  for (const [name, expected] of Object.entries(SKILLS)) {
    it(`${name}/SKILL.md has the shape and points at its reference`, () => {
      const path = `skills/${name}/SKILL.md`;
      expect(existsSync(join(REPO_ROOT, path)), path).toBe(true);
      const text = read(path);
      const meta = frontMatter(text);
      expect(meta.name).toBe(name);
      expect(meta.description?.length ?? 0).toBeGreaterThan(40);
      const lines = text.trimEnd().split('\n').length;
      expect(lines, `${path} is ${lines} lines`).toBeLessThanOrEqual(MAX_LINES);
      expect(text).toContain(`references/${expected.reference}`);
      expect(existsSync(join(REPO_ROOT, `skills/${name}/references/${expected.reference}`))).toBe(
        true,
      );
      expect(text).toMatch(/\n## Completion/);
      for (const mention of expected.mentions) expect(text, mention).toContain(mention);
      expect(text).not.toContain('—');
      const yaml = read(`skills/${name}/agents/openai.yaml`);
      expect(yaml).toContain('display_name');
    });
  }

  it('are the skills the manifest names', () => {
    const manifest = generateManifest();
    expect(manifest.skills.map((skill) => skill.name).sort()).toEqual(Object.keys(SKILLS).sort());
    for (const skill of manifest.skills)
      expect(existsSync(join(REPO_ROOT, skill.path)), skill.path).toBe(true);
  });
});

describe('the reference tables', () => {
  it('actions.md names every action with its transports, CLI usage and MCP tool', () => {
    const text = read('skills/turboslide-api/references/actions.md');
    for (const id of ACTION_IDS) expect(text, id).toContain(`\`${id}\``);
    for (const spec of actionsOn('cli'))
      if (spec.cli) expect(text, spec.id).toContain(spec.cli.usage);
    for (const spec of actionsOn('mcp'))
      if (spec.mcp) expect(text, spec.id).toContain(`\`${spec.mcp}\``);
  });

  it('browser-api.md names every window action and the six standard actions', () => {
    const text = read('skills/turboslide-studio/references/browser-api.md');
    for (const spec of actionsOn('window')) expect(text, spec.id).toContain(`\`${spec.id}\``);
    for (const id of [
      'source.read',
      'source.apply',
      'controls.list',
      'control.activate',
      'control.set',
      'artifact.download',
    ])
      expect(text).toContain(`\`${id}\``);
  });

  it('verification.md names every rule and the evidence actions', () => {
    const text = read('skills/turboslide-verify/references/verification.md');
    for (const id of RULE_IDS) expect(text, id).toContain(`\`${id}\``);
    for (const id of [
      'render.slide',
      'render.sheet',
      'lint.run',
      'fix.run',
      'judge.bundle',
      'export.run',
    ])
      expect(text, id).toContain(`\`${id}\``);
    expect(text).toContain('judge:<lens>');
  });

  it('grammar.md names every rule', () => {
    const text = read('skills/turboslide-create/references/grammar.md');
    for (const id of RULE_IDS) expect(text, id).toContain(`\`${id}\``);
  });
});
