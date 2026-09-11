// /llms.txt and /llms-full.txt (SPEC 7.1; MILESTONES M1 item 11, M4 item 1): the short machine
// guide and the long one, generated from the action table, the rule table and the manifest so the
// text an agent reads first cannot disagree with the contracts it then calls. The studio serves
// both committed files verbatim (apps/studio/src/routes/llms[.]txt.ts, llms-full[.]txt.ts).
import { actionsInOrder } from '@turboslide/schema/actions';
import type { ActionSpec } from '@turboslide/schema/actions';
import { rulesInOrder } from '@turboslide/schema/rules';
import { summarizeProperties, toJsonSchema } from './json-schema.ts';
import { EXECUTION_RULES, generateManifest } from './manifest.ts';

function inputSummary(spec: ActionSpec): string {
  const schema = toJsonSchema(spec.input);
  if (schema.type !== 'object') return typeof schema.type === 'string' ? schema.type : 'value';
  const properties = summarizeProperties(schema);
  if (properties.length === 0) return 'none';
  return properties.map((property) => `${property.name}${property.required ? '' : '?'}`).join(', ');
}

function header(): string[] {
  return [
    '# Turboslide',
    '',
    '> A block document with a validator and a grammar linter; every operation is a named action in one table, reachable from the CLI, MCP, HTTP and the studio window API (SPEC 1, 7.1).',
    '',
    'Turboslide holds the GT brand deck as typed JSON (deck.json plus slides/<id>.json), renders it with one renderer, lints it against the deck grammar, and exports it to PPTX and Google Slides with a verified report. There are no coordinates: a slide is a kind, a layout and typed blocks in named slots.',
    '',
  ];
}

function discovery(): string[] {
  const manifest = generateManifest();
  return [
    '## Discovery',
    '',
    `- ${manifest.discovery.manifest}: the manifest (transports, rules, execution rules, action ids, skills, resources, what this instance implements)`,
    `- ${manifest.discovery.openapi}: the OpenAPI 3.1 contract of POST /api/actions/<id>`,
    `- ${manifest.discovery.mcp}: MCP over streamable HTTP; \`turboslide mcp\` is the same server over stdio`,
    `- ${manifest.discovery.llmsFull}: this guide with every action and every lint rule`,
    '- skills/turboslide-{create,api,studio,verify}/SKILL.md: the four skills with their generated reference tables',
    '- docs/grammar.md: the deck grammar (slide kinds, layouts, blocks, rules)',
    '',
  ];
}

function rules(): string[] {
  const manifest = generateManifest();
  return ['## Rules', '', ...manifest.rules.map((rule) => `- ${rule}`), ''];
}

function execution(): string[] {
  const http = EXECUTION_RULES.http;
  return [
    '## Calling an action over HTTP',
    '',
    `- ${http.method} ${http.path}; ${http.describe}`,
    `- Body: ${http.body}`,
    `- Deck: ${http.deck}`,
    `- Author: ${http.author}`,
    `- Force: ${http.force}`,
    `- Auth: ${http.auth}`,
    `- Limits: ${http.limits.writeBytes} bytes per write body, ${http.limits.assetBytes} bytes per asset upload.`,
    `- Errors: ${http.errors}`,
    '',
    '## MCP over HTTP',
    '',
    `- ${EXECUTION_RULES.mcp.transport}`,
    `- ${EXECUTION_RULES.mcp.session}`,
    `- ${EXECUTION_RULES.mcp.deck} ${EXECUTION_RULES.mcp.author}`,
    `- ${EXECUTION_RULES.mcp.viewTools}`,
    '',
    '## Leases and revisions',
    '',
    `- ${EXECUTION_RULES.leases}`,
    `- ${EXECUTION_RULES.revisions}`,
    '',
  ];
}

function transports(): string[] {
  const manifest = generateManifest();
  return [
    '## Transports',
    '',
    ...Object.entries(manifest.transports).map(([name, how]) => `- ${name}: ${how}`),
    '',
  ];
}

function skills(): string[] {
  const manifest = generateManifest();
  return [
    '## Skills',
    '',
    ...manifest.skills.map((skill) => `- ${skill.name} (${skill.path}): ${skill.use}`),
    '',
  ];
}

/** The short guide: what Turboslide is, how to discover it, the rules, the transports, the skills. */
export function generateLlms(): string {
  return [
    ...header(),
    ...discovery(),
    ...rules(),
    ...execution(),
    ...transports(),
    ...skills(),
    '## Verification',
    '',
    '- Render both themes, read the contact sheet by its cell map, run the grammar linter, judge with the six lenses (deck_review prompt), verify exports against the web render (skills/turboslide-verify).',
    '- A claim about a deck names the revision it was verified at; a severity 3 finding blocks the ship step.',
    '',
  ].join('\n');
}

/** The long guide: the short one plus every action and every rule. */
export function generateLlmsFull(): string {
  const actions = actionsInOrder().map(
    (spec) =>
      `- ${spec.id} (${spec.label}; ${spec.mutates ? 'mutates' : 'read'}; ${spec.transports.join(', ')}; ${spec.milestone}): ${spec.doc} Input: ${inputSummary(spec)}.${spec.cli !== undefined ? ` CLI: ${spec.cli.usage}.` : ''}${spec.mcp !== undefined ? ` MCP: ${spec.mcp}.` : ''}`,
  );
  const ruleLines = rulesInOrder().map(
    (rule) =>
      `- ${rule.id} (${rule.layer}, severity ${rule.severity}${rule.fix ? ', fix' : ''}): ${rule.check}`,
  );
  return [
    generateLlms().trimEnd(),
    '',
    '## Actions',
    '',
    'Every mutating action takes baseRevision. The transports column says where the action is offered; an action whose milestone has not landed answers NotImplementedError (501).',
    '',
    ...actions,
    '',
    '## Lint rules',
    '',
    'Severity 3 must fix (the gate), 2 should fix, 1 polish; `fix` marks the rules whose findings carry mechanical fix mutations that `turboslide fix` applies.',
    '',
    ...ruleLines,
    '',
  ].join('\n');
}
