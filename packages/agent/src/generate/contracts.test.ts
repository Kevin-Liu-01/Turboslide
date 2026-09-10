// The stale-file test (SPEC 7.1): every committed contract equals a fresh generation, the
// generation is deterministic, and every action has a documentation row (design C's coverage).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACTION_IDS, ACTIONS, actionsOn } from '@turboslide/schema/actions';
import { describe, expect, it } from 'vitest';
import { generateCli } from './cli.ts';
import { REPO_ROOT, generateAll, staleFiles } from './contracts.ts';
import { generateMcpTools } from './mcp.ts';
import { generateOpenApi } from './openapi.ts';

describe('generated contracts', () => {
  it('are committed and current (run pnpm generate:contracts when this fails)', () => {
    expect(staleFiles()).toEqual([]);
  });

  it('are deterministic', () => {
    expect(generateAll()).toEqual(generateAll());
  });

  it('give every action a row in the actions reference and every CLI action a usage', () => {
    const reference = readFileSync(
      join(REPO_ROOT, 'skills/turboslide-api/references/actions.md'),
      'utf8',
    );
    for (const id of ACTION_IDS) expect(reference, id).toContain(`\`${id}\``);
    const cli = generateCli();
    const cliIds = cli.actions.map((action) => action.action);
    for (const spec of actionsOn('cli')) {
      if (spec.cli !== undefined) expect(cliIds).toContain(spec.id);
    }
    const slideGet = cli.actions.find((action) => action.action === 'slide.get');
    expect(slideGet).toMatchObject({
      command: ['slide', 'get'],
      positionals: ['slideId'],
      options: [],
    });
    const insert = cli.actions.find((action) => action.action === 'slide.insert');
    expect(insert?.stdin).toBe('slide');
    expect(insert?.options.find((option) => option.key === 'sectionId')?.flag).toBe('--section');
    expect(insert?.options.find((option) => option.key === 'baseRevision')?.flag).toBe(
      '--base-revision',
    );
    const blockSet = cli.actions.find((action) => action.action === 'block.set');
    expect(blockSet?.positionals).toEqual(['slideId', 'blockId', 'path', 'value']);
  });

  it('name one MCP tool per mcp transport action and describe every http action in OpenAPI', () => {
    const tools = generateMcpTools().tools;
    const names = new Set(tools.map((tool) => tool.name));
    for (const spec of actionsOn('mcp'))
      if (spec.mcp !== undefined) expect(names.has(spec.mcp), spec.id).toBe(true);
    for (const tool of tools) {
      expect(tool.inputSchema).toBeTypeOf('object');
      expect(JSON.stringify(tool.inputSchema)).not.toContain('#/components');
    }
    const openapi = generateOpenApi() as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    for (const spec of actionsOn('http'))
      expect(openapi.paths[`/api/actions/${spec.id}`], spec.id).toBeDefined();
    expect(openapi.paths['/api/actions/view.mode']).toBeUndefined();
    for (const name of [
      'Deck',
      'Slide',
      'Block',
      'Asset',
      'Mutation',
      'Finding',
      'RenderRecord',
      'ExportReport',
    ]) {
      expect(openapi.components.schemas[name], name).toBeDefined();
    }
    expect(JSON.stringify(openapi.components.schemas.Slide)).toContain(
      '#/components/schemas/Block',
    );
    expect(Object.keys(ACTIONS)).toHaveLength(ACTION_IDS.length);
  });
});
