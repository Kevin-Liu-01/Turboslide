// The MCP tool list (SPEC 7.3), generated from the action table: tools named deck_<action> with
// JSON Schema from Zod. The file shares one `$defs` block for the document types, so every tool's
// inputSchema and outputSchema reference `#/$defs/Slide`, `#/$defs/Block` and so on rather than
// inlining them; a client that needs a standalone tool schema copies `$defs` in. @turboslide/mcp
// (M2) registers the tools from the Zod schemas directly and lets the SDK derive the JSON; this
// committed list is the contract a client can read without running the server.
import type { ActionId } from '@turboslide/schema/actions';
import { actionsOn } from '@turboslide/schema/actions';
import type { JsonSchema } from './json-schema.ts';
import { generateNamedSchemas } from './named.ts';

export type McpTool = {
  name: string;
  action: ActionId;
  /** Actions that share this tool name, reached through a discriminating field (view.* on deck_set_view). */
  alsoServes?: ActionId[];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
  };
  milestone: string;
  /** Render tools return image content alongside the JSON record (SPEC 7.3). */
  returnsImages: boolean;
};

export type McpResource = { uri: string; name: string; description: string; mimeType: string };

export const MCP_RESOURCES: McpResource[] = [
  {
    uri: 'deck://manifest',
    name: 'Manifest',
    description: 'deck.json: sections, assets, revision',
    mimeType: 'application/json',
  },
  {
    uri: 'deck://grammar',
    name: 'Grammar',
    description: 'The rule table as JSON plus the prose grammar',
    mimeType: 'application/json',
  },
  {
    uri: 'deck://catalog/blocks',
    name: 'Block catalog',
    description: 'Every block type with its schema and defaults',
    mimeType: 'application/json',
  },
  {
    uri: 'deck://catalog/icons',
    name: 'Icon catalog',
    description: 'The 63 Heroicons plus gt-mark',
    mimeType: 'application/json',
  },
  {
    uri: 'deck://catalog/materials',
    name: 'Material catalog',
    description: 'The shader materials and their uniforms (M5)',
    mimeType: 'application/json',
  },
  {
    uri: 'deck://theme',
    name: 'Theme',
    description: 'The gt-ink-paper tokens and the type ladder',
    mimeType: 'application/json',
  },
  {
    uri: 'deck://slides/{id}',
    name: 'Slide',
    description: 'One normalized slide',
    mimeType: 'application/json',
  },
  {
    uri: 'deck://lint',
    name: 'Lint',
    description: 'The current findings',
    mimeType: 'application/json',
  },
  {
    uri: 'deck://render/{id}/{theme}',
    name: 'Render',
    description: 'The latest render of a slide in a theme',
    mimeType: 'image/png',
  },
  // the round three resources (gslides-parity SPEC-3 3.7 g, 3.10); a server declares
  // resources: { subscribe: true, listChanged: true } and sends notifications/resources/updated
  {
    uri: 'deck://{id}/comments',
    name: 'Comments',
    description: 'The comment threads with their anchors resolved; subscribe for updates',
    mimeType: 'application/json',
  },
  {
    uri: 'deck://{id}/presence',
    name: 'Collaborators',
    description: 'The roster of the room with the computed marks; subscribe for updates',
    mimeType: 'application/json',
  },
  {
    uri: 'deck://inbox',
    name: 'Notifications',
    description: 'The notifications of the caller; subscribe for updates',
    mimeType: 'application/json',
  },
];

export const MCP_PROMPTS = [
  {
    name: 'deck_review',
    description:
      'The judge lens instructions (SPEC 7.6): layout, visual consistency and dark mode, copy and case, accuracy, completeness, art direction',
  },
];

const IMAGE_ACTIONS = new Set<ActionId>(['render.slide', 'render.sheet', 'diff.run']);
const DESTRUCTIVE = new Set<ActionId>([
  'slide.remove',
  'block.remove',
  'version.restore',
  'asset.dither',
  'fix.run',
  // the Google Slides parity round, matching packages/mcp/src/tools.ts DESTRUCTIVE_ACTIONS
  'deck.trash',
  'slide.applyLayout',
  'text.replaceAll',
  // the parity round two: a picture loses its tools, rows and columns leave, cells merge, text is
  // rewritten, a chart loses series
  'block.resetImage',
  'table.deleteRows',
  'table.deleteColumns',
  'table.merge',
  'text.case',
  'chart.setKind',
  // the parity round three (gslides-parity SPEC-3 12): a comment is tombstoned, links and grants
  // die, the published URL answers 410, the anonymous identity is replaced, storage moves, an
  // owner is set over a record
  'comment.delete',
  'share.stop',
  'share.remove',
  'share.revokeLink',
  'deck.unpublish',
  'account.forget',
  'admin.migrateStorage',
  'admin.assignOwner',
]);

export type McpContract = {
  version: 1;
  note: string;
  $defs: Record<string, JsonSchema>;
  tools: McpTool[];
  resources: McpResource[];
  prompts: typeof MCP_PROMPTS;
};

export function generateMcpTools(): McpContract {
  const named = generateNamedSchemas((id) => `#/$defs/${id}`);
  const byName = new Map<string, McpTool>();
  const used = new Set<string>();
  const collectRefs = (schema: JsonSchema): void => {
    const text = JSON.stringify(schema);
    for (const match of text.matchAll(/#\/\$defs\/([A-Za-z0-9]+)/g))
      if (match[1] !== undefined) used.add(match[1]);
  };
  for (const spec of actionsOn('mcp')) {
    if (spec.mcp === undefined) continue;
    const existing = byName.get(spec.mcp);
    if (existing !== undefined) {
      existing.alsoServes = [...(existing.alsoServes ?? []), spec.id];
      continue;
    }
    const inputSchema = named.schemas[named.inputId(spec.id)] ?? {};
    const outputSchema = named.schemas[named.outputId(spec.id)] ?? {};
    collectRefs(inputSchema);
    collectRefs(outputSchema);
    byName.set(spec.mcp, {
      name: spec.mcp,
      action: spec.id,
      description: spec.doc,
      inputSchema,
      outputSchema,
      annotations: {
        title: spec.label,
        readOnlyHint: !spec.mutates,
        destructiveHint: DESTRUCTIVE.has(spec.id),
        idempotentHint: !spec.mutates,
      },
      milestone: spec.milestone,
      returnsImages: IMAGE_ACTIONS.has(spec.id),
    });
  }
  // $defs holds every schema a tool references, transitively.
  const defs: Record<string, JsonSchema> = {};
  let pending = [...used];
  while (pending.length > 0) {
    const next: string[] = [];
    for (const id of pending) {
      if (defs[id] !== undefined) continue;
      const schema = named.schemas[id];
      if (schema === undefined) continue;
      defs[id] = schema;
      const before = new Set(used);
      collectRefs(schema);
      for (const added of used) if (!before.has(added)) next.push(added);
    }
    pending = next;
  }
  const ordered: Record<string, JsonSchema> = {};
  for (const id of Object.keys(defs).sort()) ordered[id] = defs[id] ?? {};
  return {
    version: 1,
    note: 'Tool schemas reference the shared $defs at the root of this file; copy $defs into a tool schema to use it standalone.',
    $defs: ordered,
    tools: [...byName.values()],
    resources: MCP_RESOURCES,
    prompts: MCP_PROMPTS,
  };
}
