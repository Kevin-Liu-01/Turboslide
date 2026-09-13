// The coverage test (SPEC 7.1 "A coverage test asserts every action has a test and a doc row";
// MILESTONES M4 acceptance): every action's example parses through its input schema and has a
// documentation row; every action id is named in at least one test file of the repository; and
// the MCP tool list, describe().actions, the OpenAPI paths, the CLI parsers and the skill tables
// agree with the action table by name. Every rule that declares a fix produces one on the
// linter's fixture deck, so `turboslide fix` covers every rule with a fix.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { document as lintFixture, renderedRecords } from '@turboslide/lint/fixtures/deck';
import { lintDeck } from '@turboslide/lint/run';
import { ACTION_IDS, ACTIONS, actionsInOrder, actionsOn } from '@turboslide/schema/actions';
import type { ActionId } from '@turboslide/schema/actions';
import { applyMutations } from '@turboslide/schema/reduce';
import { RULES, rulesInOrder } from '@turboslide/schema/rules';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../generate/contracts.ts';
import { generateCli } from '../generate/cli.ts';
import { generateDescribe } from '../generate/describe.ts';
import { generateMcpTools } from '../generate/mcp.ts';
import { generateOpenApi } from '../generate/openapi.ts';
import { generateActionsReference, generateBrowserApiReference } from '../generate/skills.ts';
import { viewerActionIds, windowActionIds } from '../window/registry.ts';

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.turboslide',
  '.git',
  '.output',
  '.tanstack',
  'generated',
]);

/** Every test, spec and e2e file in the repository, read once. */
function testFiles(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const isTest =
        /\.(test|spec)\.(ts|tsx|mjs)$/.test(entry) || (/\.mjs$/.test(entry) && dir.endsWith('e2e'));
      if (isTest) out.push({ path: relative(REPO_ROOT, path), text: readFileSync(path, 'utf8') });
    }
  };
  walk(REPO_ROOT);
  return out.filter((file) => !file.path.endsWith('__tests__/coverage.test.ts'));
}

describe('every action', () => {
  const rows = actionsInOrder().map((spec) => [spec.id, spec] as const);

  it.each(rows)(
    '%s has a parsing example, a sentence of documentation and a label',
    (_id, spec) => {
      const parsed = spec.input.safeParse(spec.example);
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues[0])).toBe(
        true,
      );
      expect(spec.doc.trim().endsWith('.')).toBe(true);
      expect(spec.label.length).toBeGreaterThan(0);
      expect(spec.transports.length).toBeGreaterThan(0);
      if (spec.transports.includes('cli')) {
        expect(spec.cli?.usage.startsWith('turboslide '), `${spec.id} cli usage`).toBe(true);
      }
      if (spec.transports.includes('mcp'))
        expect(spec.mcp?.startsWith('deck_'), `${spec.id} mcp name`).toBe(true);
      if (spec.mutates && spec.input.safeParse({}).success === false) {
        // a mutating action names baseRevision unless it is a lease or a version save, which have none by design
        const noBase: ActionId[] = [
          'slide.lease',
          'version.save',
          'import.run',
          'deck.create',
          // whole-deck transfers (docs/deck-transfer.md): a bundle carries its own revision
          'deck.unpack',
          'deck.push',
          'deck.pull',
          'source.apply',
        ];
        if (!noBase.includes(spec.id))
          expect(JSON.stringify(spec.example), `${spec.id} baseRevision`).toContain('baseRevision');
      }
    },
  );

  it('has a documentation row in the actions reference', () => {
    const reference = generateActionsReference();
    for (const id of ACTION_IDS) expect(reference, id).toContain(`\`${id}\``);
  });

  it('is named in at least one test or spec file once its milestone has landed', () => {
    const files = testFiles();
    const landed: ReadonlySet<string> = new Set(['M1', 'M2', 'M3', 'M4', 'GS1', 'GS2']);
    const named = (spec: (typeof rows)[number][1]): string[] => [
      `'${spec.id}'`,
      `"${spec.id}"`,
      `\`${spec.id}\``,
      ...(spec.mcp !== undefined ? [spec.mcp] : []),
      ...(spec.cli !== undefined ? [spec.cli.usage.split(/\s+/).slice(1, 3).join(' ')] : []),
    ];
    const missing = actionsInOrder()
      .filter((spec) => landed.has(spec.milestone))
      .filter(
        (spec) => !files.some((file) => named(spec).some((needle) => file.text.includes(needle))),
      )
      .map((spec) => spec.id);
    expect(
      missing,
      `actions without a test naming them (id, MCP tool or CLI command in a *.test.ts, *.spec.ts or e2e/*.mjs file): ${missing.join(', ')}`,
    ).toEqual([]);
  });
});

describe('the surfaces agree by name', () => {
  it('MCP tool list equals the mcp transport actions', () => {
    const generated = generateMcpTools().tools;
    const names = new Set(generated.map((tool) => tool.name));
    const expected = new Set(actionsOn('mcp').map((spec) => spec.mcp));
    expect([...names].sort()).toEqual([...expected].sort());
    const served = new Set(generated.flatMap((tool) => [tool.action, ...(tool.alsoServes ?? [])]));
    expect([...served].sort()).toEqual(
      actionsOn('mcp')
        .map((spec) => spec.id)
        .sort(),
    );
  });

  it('describe().actions equals the window transport actions and the registry lists agree', () => {
    const described = generateDescribe();
    const windowIds = actionsOn('window').map((spec) => spec.id);
    expect(described.actions).toEqual(windowIds);
    expect(windowActionIds()).toEqual(windowIds);
    // the editor owner answers every window action but the six the API handles itself
    const editor = described.owners.find((owner) => owner.id === 'editor');
    expect(editor?.actions).toEqual(
      windowIds.filter((id) => !described.standardActions.includes(id)),
    );
    const viewer = described.owners.find((owner) => owner.id === 'viewer');
    expect(viewer?.actions).toEqual(viewerActionIds());
    for (const id of viewerActionIds()) expect(windowIds, id).toContain(id);
  });

  it('OpenAPI paths equal the http transport actions', () => {
    const openapi = generateOpenApi() as { paths: Record<string, unknown> };
    const actionPaths = Object.keys(openapi.paths)
      .filter((path) => path.startsWith('/api/actions/') && path !== '/api/actions/{id}')
      .map((path) => path.slice('/api/actions/'.length))
      .sort();
    expect(actionPaths).toEqual(
      actionsOn('http')
        .map((spec) => spec.id)
        .sort(),
    );
    expect(openapi.paths['/mcp']).toBeDefined();
    expect(openapi.paths['/api/agent']).toBeDefined();
  });

  it('CLI parsers equal the cli transport actions with a usage', () => {
    const cli = generateCli();
    const parsed = cli.actions.map((action) => action.action).sort();
    const expected = actionsOn('cli')
      .filter((spec) => spec.cli !== undefined)
      .map((spec) => spec.id)
      .sort();
    expect(parsed).toEqual(expected);
    for (const action of cli.actions)
      expect(action.command.length, action.action).toBeGreaterThan(0);
  });

  it('the skill tables name every action and every window action', () => {
    const actions = generateActionsReference();
    for (const id of ACTION_IDS) expect(actions).toContain(`\`${id}\``);
    const browser = generateBrowserApiReference();
    for (const spec of actionsOn('window')) expect(browser).toContain(`\`${spec.id}\``);
  });
});

describe('every rule with a fix', () => {
  const fixable = rulesInOrder()
    .filter((rule) => rule.fix)
    .map((rule) => rule.id);
  // both layers: a rendered rule's fixture is the record the lint fixture deck carries for it
  const findings = lintDeck(lintFixture, renderedRecords);

  it.each(fixable)(
    '%s produces a finding with fix mutations on the fixture deck, and the fix applies',
    (rule) => {
      const withFix = findings.filter(
        (finding) => finding.rule === rule && finding.fix !== undefined && finding.fix.length > 0,
      );
      expect(withFix.length, `${rule} fires with a fix`).toBeGreaterThan(0);
      const first = withFix[0]!;
      const applied = applyMutations(lintFixture, first.fix ?? []);
      expect(applied.document.deck.id).toBe(lintFixture.deck.id);
      const after = lintDeck(applied.document, renderedRecords).filter(
        (finding) =>
          finding.rule === rule &&
          finding.slideId === first.slideId &&
          finding.blockId === first.blockId &&
          finding.path === first.path,
      );
      expect(
        after.length,
        `${rule} on ${first.slideId}#${first.blockId ?? ''} after its fix`,
      ).toBeLessThan(
        findings.filter(
          (finding) =>
            finding.rule === rule &&
            finding.slideId === first.slideId &&
            finding.blockId === first.blockId &&
            finding.path === first.path,
        ).length,
      );
    },
  );

  it('every lint finding says its source and names a rule of the table', () => {
    for (const finding of findings) {
      expect(finding.source).toBe('lint');
      expect(RULES[finding.rule], finding.rule).toBeDefined();
    }
  });
});

describe('the action table', () => {
  it('has one spec per id and no id outside the list', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual([...ACTION_IDS].sort());
  });
});
