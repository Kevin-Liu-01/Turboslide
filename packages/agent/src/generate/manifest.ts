// The agent manifest served at GET /api/agent (SPEC 3.4, 7.5): what an agent reads first. It
// names the transports, the discovery documents, the skills, the MCP resources and the action ids
// by group, and repeats the two rules every client needs before its first write.
import { ACTION_IDS, actionsInOrder } from '@turboslide/schema/actions';
import { READY_EVENT, WINDOW_GLOBAL } from './describe.ts';
import { MCP_RESOURCES } from './mcp.ts';

export type Manifest = {
  name: 'turboslide';
  schemaVersion: 1;
  description: string;
  discovery: { openapi: string; llms: string; llmsFull: string; manifest: string; mcp: string };
  transports: Record<'cli' | 'mcp' | 'http' | 'window', string>;
  rules: string[];
  skills: { name: string; path: string; use: string }[];
  actions: Record<string, string[]>;
  actionCount: number;
  resources: typeof MCP_RESOURCES;
};

export function generateManifest(): Manifest {
  const byGroup: Record<string, string[]> = {};
  for (const spec of actionsInOrder()) {
    const list = byGroup[spec.group] ?? [];
    list.push(spec.id);
    byGroup[spec.group] = list;
  }
  return {
    name: 'turboslide',
    schemaVersion: 1,
    description:
      'A block document with a validator and a grammar linter; every operation is a named action in one table, reachable from the CLI, MCP, HTTP and the studio window API.',
    discovery: {
      openapi: '/openapi.json',
      llms: '/llms.txt',
      llmsFull: '/llms-full.txt',
      manifest: '/api/agent',
      mcp: '/mcp',
    },
    transports: {
      cli: 'turboslide <command> --json --author agent:<runId>',
      mcp: 'turboslide mcp (stdio) or POST /mcp (streamable HTTP); tools deck_<action>',
      http: 'POST /api/actions/<id> with the input as JSON',
      window: `${WINDOW_GLOBAL}.invoke(<id>, input) after the ${READY_EVENT} event`,
    },
    rules: [
      'Every mutating action requires baseRevision and rejects a stale one with 409 and the current document.',
      'Every write returns the normalized result; re-read from the response, not from memory.',
      'Unknown fields are rejected with unknown_field and a JSON pointer, except under ext on a slide, a block or an asset.',
      'A claim about a deck names the revision; render both themes and lint before claiming a slide is done.',
    ],
    skills: [
      {
        name: 'turboslide-create',
        path: 'skills/turboslide-create/SKILL.md',
        use: 'Write or revise slides in the grammar',
      },
      {
        name: 'turboslide-api',
        path: 'skills/turboslide-api/SKILL.md',
        use: 'Discover and write through the action table',
      },
      {
        name: 'turboslide-studio',
        path: 'skills/turboslide-studio/SKILL.md',
        use: 'Drive the studio through the window API',
      },
      {
        name: 'turboslide-verify',
        path: 'skills/turboslide-verify/SKILL.md',
        use: 'Render, lint, judge and verify exports',
      },
    ],
    actions: byGroup,
    actionCount: ACTION_IDS.length,
    resources: MCP_RESOURCES,
  };
}
