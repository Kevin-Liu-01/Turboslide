// The agent manifest served at GET /api/agent (SPEC 3.4, 7.5): what an agent reads first. It
// names the transports, the discovery documents, the skills, the MCP resources and the action ids
// by group, repeats the rules every client needs before its first write, and states the execution
// rules of the hosted surface (how a request is built, authenticated and refused). The studio
// serves this generated document with the runtime facts of the instance added
// (packages/agent/src/http/manifest.ts).
import { ACTION_IDS, actionsInOrder } from '@turboslide/schema/actions';
import { READY_EVENT, WINDOW_GLOBAL } from './describe.ts';
import { MCP_RESOURCES } from './mcp.ts';

/**
 * How a request to the hosted surface is built (MILESTONES M4 item 1 "manifest with execution
 * rules"): the same facts the OpenAPI document states as parameters, in prose an agent reads once.
 */
export type ExecutionRules = {
  http: {
    method: 'POST';
    path: string;
    describe: string;
    body: string;
    deck: string;
    author: string;
    force: string;
    auth: string;
    limits: { writeBytes: number; assetBytes: number };
    errors: string;
  };
  mcp: {
    path: string;
    transport: string;
    session: string;
    deck: string;
    author: string;
    viewTools: string;
  };
  leases: string;
  revisions: string;
};

export const EXECUTION_RULES: ExecutionRules = {
  http: {
    method: 'POST',
    path: '/api/actions/<id>',
    describe:
      'GET /api/actions/<id> returns the action contract: input and output JSON Schema, transports, milestone and whether this instance implements it.',
    body: 'One JSON object, the action input exactly as the input schema states it; unknown fields are refused with 400 and code unknown_field plus a JSON pointer.',
    deck: '?deck=<slug> names the deck; without it the instance default (gt-brand) is used.',
    author:
      'x-turboslide-author: agent:<runId> (or ?author=); a request without one writes as agent:http.',
    force:
      '?force=1 (or x-turboslide-force: 1) writes to a slide another author leased; without it the write is 409 with the holder and the current document.',
    auth: 'Authorization: Bearer <TURBOSLIDE_TOKEN> on every deployed instance; open only on localhost when the instance has no token; a request off localhost without a token is 401.',
    limits: { writeBytes: 1024 * 1024, assetBytes: 25 * 1024 * 1024 },
    errors:
      '{ error: { name, status, message, code?, pointer?, currentRevision?, current?, holder?, milestone? } }; TypeError 400, RangeError 404, ConflictError 409, NotImplementedError 501, Error 500.',
  },
  mcp: {
    path: '/mcp',
    transport:
      'MCP streamable HTTP: POST JSON-RPC to /mcp (initialize first), GET for the notification stream, DELETE to end the session; the mcp-session-id header carries the session.',
    session:
      'One MCP session is bound to one deck and one author at initialize; tools are deck_<action> for every implemented action on the mcp transport.',
    deck: '?deck=<slug> on the initialize request; the instance default otherwise.',
    author: 'x-turboslide-author or ?author= on the initialize request; agent:mcp-http otherwise.',
    viewTools:
      'deck_goto_slide (view.goto) is listed when a studio page is attached to the deck and runs in that page: the editor at /edit while it is visible, and a /deck, /present or /embed page opened with ?agent=1 while it is visible; a page hidden for 10 s detaches and the call answers 404 until it is shown again.',
  },
  leases:
    'slide.lease takes ten minutes on a slide; an agent write to a slide another author holds is 409 with the holder unless force is set; a human write warns and goes through (SPEC 6.7).',
  revisions:
    'Every mutating action takes baseRevision; a stale one is 409 with currentRevision and the current document; re-read from the response and retry once.',
};

export type Manifest = {
  name: 'turboslide';
  schemaVersion: 1;
  description: string;
  discovery: { openapi: string; llms: string; llmsFull: string; manifest: string; mcp: string };
  transports: Record<'cli' | 'mcp' | 'http' | 'window', string>;
  rules: string[];
  execution: ExecutionRules;
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
      'An agent write to a slide another author leased is refused with 409 and the holder unless force is set.',
      'A claim about a deck names the revision; render both themes and lint before claiming a slide is done.',
    ],
    execution: EXECUTION_RULES,
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
