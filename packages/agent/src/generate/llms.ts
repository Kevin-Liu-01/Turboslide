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
    'Turboslide holds the GT brand deck as typed JSON (deck.json plus slides/<id>.json), renders it with one renderer, lints it against the deck grammar, and exports it to PPTX with a verified report, pixel identical in its default mode (docs/pptx.md). There are no coordinates: a slide is a kind, a layout and typed blocks in named slots.',
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

/**
 * The two HTTP routes outside the action table (SPEC 3.4): the render facade and the export
 * route. Their rules live in the studio (apps/studio/src/routes/api/render.$slideId.ts and
 * export.$deckId.ts; docs/hosting-chromium.md section 4) and are restated here so an API caller
 * learns them before the first request.
 */
function rendersAndExports(): string[] {
  return [
    '## Renders and exports over HTTP',
    '',
    '- GET /api/render/<slideId>?deck=<deckId>&theme=light|dark&scale=1|2 answers the PNG with the RenderRecord in the X-Turboslide-Record header; ?format=json (or Accept: application/json) answers the record. ?w=160|320|640 is the cached thumbnail.',
    '- POST /api/export/<deckId> takes the export.run input as one JSON object (format defaults to pptx; out is ignored, the file lands in the job folder). ?sync=1 (or "sync": true in the body) runs the export inside the request and answers the file, or the ExportReport with the files and their URLs under ?format=json (or Accept: application/json); the X-Turboslide-Export-Report header carries the summary.',
    '- A hosted studio (a serverless function) runs every POST synchronously, ?sync=1 or not, and says so in X-Turboslide-Sync: hosted: a queued job would get CPU only while another request kept the instance busy, and its record lives on that instance alone. Send ?sync=1 so the request means the same everywhere.',
    "- In a checkout or against the Docker worker, a POST without ?sync=1 answers 202 with the job and a Location to poll: GET /api/export/<deckId>?job=<id> for the record (the ExportReport under report once done), GET without job for the deck's jobs.",
    '- A file over 4.5 MB cannot leave a function: the route answers 302 to the stored copy when the deployment has a Blob store, else 413 with the JSON body; export one theme or a slide subset then.',
    '- Auth: both routes require Authorization: Bearer <TURBOSLIDE_TOKEN> when the instance has the token set (the thumbnail variant of the render route stays open for the editor); without it they are open.',
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
    ...rendersAndExports(),
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
