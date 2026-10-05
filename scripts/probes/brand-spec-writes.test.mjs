// The brand spec's deployment wide writes (Round 1 follow-up, lane D; verify-r1.md finding 3): a
// run of apps/studio/e2e/core/brand.spec.ts on a deployment on 2026-10-01 saved a template that
// its teardown did not remove, and production's Template gallery listed it for every visitor. A
// Playwright spec cannot be imported here (it calls test() at load), so these tests read its
// source: every row that saves a template is skipped off localhost before anything else runs, and
// the teardown runs each step in a finally block of the step before, the default before the
// template (template.delete refuses the default), the context last.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SPEC = readFileSync(path.join(ROOT, 'apps/studio/e2e/core/brand.spec.ts'), 'utf8');
const MATRIX = JSON.parse(
  readFileSync(path.join(ROOT, 'docs/gslides-parity/focus/core-matrix.json'), 'utf8'),
);

/** The body of each `test(title('<id>'), ...)` block, by id, up to the next top level test. */
function testBodies(source) {
  const heads = [...source.matchAll(/^test\(title\('([^']+)'\)/gm)];
  const bodies = new Map();
  heads.forEach((m, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : source.length;
    bodies.set(m[1], source.slice(m.index, end));
  });
  return bodies;
}

/** The afterAll block's text. */
function afterAllBody(source) {
  const start = source.indexOf('test.afterAll(');
  const end = source.indexOf('\n});\n', start);
  return source.slice(start, end);
}

const SAVING_ROWS = [
  'templates.save.as-template',
  'templates.save.same-name-replaces',
  'templates.card.rename-and-delete',
  'templates.default.use-for-new',
];

describe('the brand spec on a deployment', () => {
  const bodies = testBodies(SPEC);

  it('skips every row that saves a template off localhost before its first step', () => {
    const saving = [...bodies]
      .filter(([, body]) => body.includes('saveAsTemplate('))
      .map(([id]) => id);
    expect(saving.sort()).toEqual([...SAVING_ROWS].sort());
    for (const id of SAVING_ROWS) {
      const body = bodies.get(id);
      const skip = body.indexOf(
        'if (!isLocalBase(BASE)) test.skip(true, DEPLOYMENT_TEMPLATE_SKIP);',
      );
      expect(skip, id).toBeGreaterThan(0);
      /* nothing but the timeout comes before the skip */
      const head = body
        .slice(body.indexOf('{') + 1, skip)
        .replace(/\s+/g, ' ')
        .trim();
      expect(head, id).toMatch(/^(test\.setTimeout\(\d+_?\d*\);)?$/);
    }
  });

  it('names the deployment wide record and the shared store in the reason', () => {
    const reason = SPEC.match(/const DEPLOYMENT_TEMPLATE_SKIP =\s*'([^']+)'/)?.[1] ?? '';
    expect(reason).toMatch(/^not driven on a deployment: /);
    expect(reason).toContain('deployment wide record');
    expect(reason).toContain('previews share production');
  });

  it('writes the same reason into the four matrix rows', () => {
    for (const id of SAVING_ROWS) {
      const row = MATRIX.rows.find((r) => r.id === id);
      expect(row?.driver, id).toBe('core/brand.spec.ts');
      expect(row?.note ?? '', id).toMatch(/not driven on a deployment/);
    }
  });
});

describe('the brand spec teardown', () => {
  const body = afterAllBody(SPEC);

  it('runs the default, the template, the leftovers, the decks and the context in that order', () => {
    const order = [
      'putDefaultBack()',
      'removeSavedTemplate',
      'sweepTemplateLeftovers(',
      'teardownAll(page, scratch)',
      'context.close()',
    ].map((needle) => body.indexOf(needle));
    for (const at of order) expect(at).toBeGreaterThan(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('runs every step after the first in a finally block of the step before', () => {
    const finallies = [...body.matchAll(/\} finally \{/g)].map((m) => m.index);
    expect(finallies.length).toBe(4);
    for (const needle of [
      'removeSavedTemplate',
      'sweepTemplateLeftovers(',
      'teardownAll(page, scratch)',
      'context.close()',
    ]) {
      const at = body.indexOf(needle);
      expect(
        finallies.some((f) => f < at),
        needle,
      ).toBe(true);
    }
  });

  it('bounds each network step so a hang cannot take the steps after it', () => {
    expect(body.match(/boundedStep\(/g)?.length).toBe(3);
    expect(SPEC).toMatch(/const TEARDOWN_STEP_MS = \d+_?\d*;/);
  });

  it('removes the template by its id through the surface when the gallery did not draw its card', () => {
    const fn = SPEC.slice(
      SPEC.indexOf('async function removeSavedTemplate'),
      SPEC.indexOf('\n}\n', SPEC.indexOf('async function removeSavedTemplate')),
    );
    expect(fn).toContain("surfacePost('template.delete', { id: slug, confirm: true })");
    expect(fn).toContain('still lists');
  });
});
