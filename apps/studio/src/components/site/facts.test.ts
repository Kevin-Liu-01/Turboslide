import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ACTIONS } from '@turboslide/schema/actions';

import { AGENTS_SCREEN } from './copy';
import { SITE_FACTS } from './facts';

// The landing's counts (docs/SITE.md A.1): every number of facts.ts recomputed from the action
// table and the generated contracts, and the names of slide.new on each transport read from the
// generated files, so the page never states a count or a name the tree does not have.

const root = new URL('../../../../../', import.meta.url);
const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as T;

const actions = Object.values(ACTIONS);
const on = (transport: 'cli' | 'mcp' | 'http' | 'window'): number =>
  actions.filter((action) => action.transports.includes(transport)).length;

describe('the landing’s facts', () => {
  it('are the action table’s counts in all and per transport', () => {
    expect(SITE_FACTS).toEqual({
      actions: actions.length,
      cli: on('cli'),
      mcp: on('mcp'),
      http: on('http'),
      page: on('window'),
    });
  });

  it('agree with the generated contracts', () => {
    const manifest = json<{ actionCount: number }>('packages/agent/generated/manifest.json');
    expect(manifest.actionCount).toBe(SITE_FACTS.actions);
    const cli = json<{ actions: { action: string; command: string[] }[] }>(
      'packages/agent/generated/cli.json',
    );
    expect(cli.actions).toHaveLength(SITE_FACTS.cli);
    const slideNew = cli.actions.find((each) => each.action === 'slide.new');
    const rows = Object.fromEntries(AGENTS_SCREEN.table.rows.map((row) => [row.id, row.name]));
    expect(rows['cli']).toBe(`turboslide ${slideNew?.command.join(' ')}`);
    const mcp = json<
      { tools: { name: string; action: string }[] } | { name: string; action: string }[]
    >('packages/agent/generated/mcp-tools.json');
    const tools = Array.isArray(mcp) ? mcp : mcp.tools;
    expect(tools.find((tool) => tool.action === 'slide.new')?.name).toBe(rows['mcp']);
    expect(rows['http']).toBe('POST /api/actions/slide.new');
    expect(rows['page']).toBe("studio.invoke('slide.new', input)");
  });
});
