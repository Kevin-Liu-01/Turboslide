// The tool list derivation (SPEC 7.3): only actions on the mcp transport with an implementation
// become tools, the schemas come from the Zod definitions, results and errors have the documented
// shapes.
import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionId } from '@turboslide/schema/actions';
import { ACTIONS, actionsOn } from '@turboslide/schema/actions';
import { ConflictError, NotImplementedError } from '@turboslide/schema/errors';
import { describe, expect, it } from 'vitest';
import {
  deriveTools,
  imagePathsOf,
  outputSchemaFor,
  outputShape,
  structuredContentOf,
  toolEntry,
  toolError,
  toolErrorBody,
  toolResult,
  OUTPUT_PROPERTY_BUDGET,
  compactOutputSchema,
} from './tools.ts';
import type { JsonSchema } from './tools.ts';

function implementedFrom(ids: ReadonlyArray<ActionId>): (id: ActionId) => boolean {
  const set = new Set<ActionId>(ids);
  return (id) => set.has(id);
}

/**
 * Every tool of the action table, built once for the file: `deriveTools(() => true)` turns the
 * whole table's Zod definitions into JSON Schema, about half a second of CPU on a quiet machine,
 * and under the root `pnpm test` beside every package's workers and the check chain's browsers
 * the same work passed vitest's 5 s test budget twice (the focus round, VERIFICATION F-check5 and
 * C3T.5). Built at module load, outside any test's budget, so the two tests that read the full
 * list assert the same list and neither depends on the machine's load.
 */
const EVERY_TOOL = deriveTools(() => true);

describe('deriveTools', () => {
  it('offers only implemented actions whose transports include mcp', () => {
    const tools = deriveTools(
      implementedFrom(['deck.info', 'lint.run', 'render.slide', 'import.run', 'view.mode']),
    );
    expect(tools.map((entry) => entry.name)).toEqual(['deck_get_info', 'deck_render', 'deck_lint']);
    expect(tools.map((entry) => entry.action)).toEqual(['deck.info', 'render.slide', 'lint.run']);
  });

  it('returns no tool when nothing is implemented and every tool when everything is', () => {
    expect(deriveTools(() => false)).toEqual([]);
    const all = EVERY_TOOL;
    const expected = new Set(actionsOn('mcp').map((spec) => spec.mcp));
    expect(new Set(all.map((entry) => entry.name))).toEqual(expected);
    // one tool per name; every action on mcp is reached through exactly one tool
    const served = all.flatMap((entry) => [entry.action, ...entry.alsoServes]);
    expect(served.sort()).toEqual(
      actionsOn('mcp')
        .map((spec) => spec.id)
        .sort(),
    );
  });

  it('offers deck_export once export.run has a handler, with the theme on every slide entry', () => {
    const [tool, ...rest] = deriveTools(implementedFrom(['export.run']));
    expect(rest).toEqual([]);
    expect(tool?.name).toBe('deck_export');
    expect(tool?.action).toBe('export.run');
    expect(tool?.returnsImages).toBe(false);
    expect(tool?.shape).toBe('object');
    expect(tool?.tool.inputSchema.required).toEqual(['format']);
    expect(tool?.tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    const output = tool?.tool.outputSchema as
      | { properties?: { slides?: { items?: { properties?: Record<string, JsonSchema> } } } }
      | undefined;
    const slide = output?.properties?.slides?.items?.properties ?? {};
    expect(Object.keys(slide)).toContain('theme');
    expect(slide.theme).toMatchObject({ enum: ['light', 'dark'] });
    expect(slide.verify).toBeDefined();
  });

  it('follows the dispatcher: registering a handler adds the tool', () => {
    const dispatcher = createDispatcher();
    expect(deriveTools((id) => dispatcher.has(id))).toEqual([]);
    dispatcher.register('version.list', () => []);
    dispatcher.register('slide.list', () => []);
    dispatcher.register('import.run', () => ({
      slides: 0,
      sections: 0,
      htmlBlocks: 0,
      report: '',
    }));
    const names = deriveTools((id) => dispatcher.has(id)).map((entry) => entry.name);
    expect(names).toEqual(['deck_list_slides', 'deck_version_list']);
  });

  it('builds the tool definition from the Zod schemas', () => {
    const info = toolEntry(ACTIONS['deck.info']);
    expect(info.tool.name).toBe('deck_get_info');
    expect(info.tool.title).toBe('Deck info');
    expect(info.tool.inputSchema.type).toBe('object');
    expect(info.tool.inputSchema.additionalProperties).toBe(false);
    expect(info.tool.outputSchema?.type).toBe('object');
    expect(info.shape).toBe('object');
    expect(info.returnsImages).toBe(false);
    expect(info.tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });

    const set = toolEntry(ACTIONS['block.set']);
    const properties = set.tool.inputSchema.properties ?? {};
    expect(Object.keys(properties)).toEqual([
      'slideId',
      'blockId',
      'path',
      'value',
      'baseRevision',
    ]);
    expect(set.tool.inputSchema.required).toContain('baseRevision');
    expect(set.tool.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    expect(set.tool.description).toContain('baseRevision');

    const remove = toolEntry(ACTIONS['slide.remove']);
    expect(remove.tool.annotations?.destructiveHint).toBe(true);
  });

  it('wraps list outputs under items and count and marks the render tools', () => {
    const lint = toolEntry(ACTIONS['lint.run']);
    expect(lint.shape).toBe('items');
    const properties = lint.tool.outputSchema?.properties ?? {};
    expect(Object.keys(properties)).toEqual(['items', 'count']);
    expect((properties.items as { type?: string }).type).toBe('array');
    expect(lint.tool.description).toContain('items, count');
    // recursive definitions stay at the root so #/definitions references inside items resolve
    const versionsOut = outputSchemaFor(ACTIONS['version.list']);
    expect(JSON.stringify(versionsOut.properties)).toContain('#/definitions/');
    expect(versionsOut.definitions).toBeDefined();
    expect(Object.keys(versionsOut.definitions as Record<string, unknown>).length).toBeGreaterThan(
      0,
    );
    expect((versionsOut.properties as { items: JsonSchema }).items.definitions).toBeUndefined();
    // draft-07 tuples, the form the SDK's Ajv validates (no prefixItems)
    const renderOut = JSON.stringify(outputSchemaFor(ACTIONS['render.slide']));
    expect(renderOut).not.toContain('prefixItems');
    expect(renderOut).toContain('additionalItems');

    const render = toolEntry(ACTIONS['render.slide']);
    expect(render.returnsImages).toBe(true);
    expect(render.shape).toBe('object');
    expect(render.tool.description).toContain('image content');

    expect(outputShape({ type: 'string' })).toBe('value');
  });
});

describe('the served tool list stays under the stdio read buffer', () => {
  const byteSize = (value: unknown): number =>
    new TextEncoder().encode(JSON.stringify(value)).length;

  it('serves the document carrying outputs as their type and keeps the small outputs whole', () => {
    const full = outputSchemaFor(ACTIONS['slide.setLayout']);
    const fullProperties = full.properties as Record<string, JsonSchema>;
    expect(byteSize(fullProperties.slide)).toBeGreaterThan(OUTPUT_PROPERTY_BUDGET);
    const served = toolEntry(ACTIONS['slide.setLayout']).tool.outputSchema as JsonSchema;
    const servedProperties = served.properties as Record<string, JsonSchema>;
    expect(served.type).toBe('object');
    expect(Object.keys(servedProperties)).toEqual(Object.keys(fullProperties));
    expect(servedProperties.slide).toMatchObject({ type: 'object' });
    expect(servedProperties.slide?.description).toContain('mcp-tools.json');
    expect(servedProperties.slide?.properties).toBeUndefined();
    expect(servedProperties.revision).toEqual(fullProperties.revision);
    expect(served.required).toEqual(full.required);
    // the Block union nothing references any more leaves the definitions
    expect(served.definitions).toBeUndefined();
    expect(full.definitions).toBeDefined();
    // a list output keeps its array type so structuredContent still validates
    const lint = toolEntry(ACTIONS['lint.run']).tool.outputSchema as JsonSchema;
    expect((lint.properties as Record<string, JsonSchema>).items).toMatchObject({
      type: 'array',
      items: {},
    });
    // an output with nothing over the budget is the full schema, the same object
    const info = outputSchemaFor(ACTIONS['deck.info']);
    expect(compactOutputSchema(info)).toBe(info);
    expect(byteSize(toolEntry(ACTIONS['export.run']).tool.outputSchema)).toBe(
      byteSize(outputSchemaFor(ACTIONS['export.run'])),
    );
  });

  it('serialises every tool under 4 MB in total and every outputSchema under 32 KB', () => {
    const tools = EVERY_TOOL;
    expect(tools.length).toBeGreaterThan(80);
    const total = tools.reduce((sum, entry) => sum + byteSize(entry.tool), 0);
    expect(total).toBeLessThan(4 * 1024 * 1024);
    for (const entry of tools)
      expect(byteSize(entry.tool.outputSchema), entry.name).toBeLessThan(32 * 1024);
  });
});

describe('tool results', () => {
  it('carries the output as text and structuredContent, with images after the text', () => {
    const entry = toolEntry(ACTIONS['render.slide']);
    const output = { records: [], images: ['/tmp/a.png'] };
    const result = toolResult(entry, output, [{ data: 'AAAA', mimeType: 'image/png' }], 'a note');
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: 'text', text: JSON.stringify(output, null, 2) });
    expect(result.content[1]).toEqual({ type: 'image', data: 'AAAA', mimeType: 'image/png' });
    expect(result.content[2]).toEqual({ type: 'text', text: 'a note' });
    expect(result.structuredContent).toEqual(output);
  });

  it('shapes structuredContent by the tool shape', () => {
    expect(structuredContentOf('object', { a: 1 })).toEqual({ a: 1 });
    expect(structuredContentOf('items', [1, 2])).toEqual({ items: [1, 2], count: 2 });
    expect(structuredContentOf('items', undefined)).toEqual({ items: [], count: 0 });
    expect(structuredContentOf('value', 'x')).toEqual({ value: 'x' });
  });

  it('names the image files of the render, sheet and diff outputs', () => {
    expect(imagePathsOf('render.slide', { records: [], images: ['a.png', 'b.png'] })).toEqual([
      'a.png',
      'b.png',
    ]);
    expect(
      imagePathsOf('render.sheet', {
        sheets: [
          { theme: 'light', image: 'l.png', cells: [] },
          { theme: 'dark', image: 'd.png' },
        ],
      }),
    ).toEqual(['l.png', 'd.png']);
    expect(
      imagePathsOf('diff.run', {
        mutations: [],
        prose: [],
        crops: [{ slideId: 'a', before: 'b.png', after: 'c.png' }],
      }),
    ).toEqual(['b.png', 'c.png']);
    expect(imagePathsOf('deck.info', { images: ['x.png'] })).toEqual([]);
    expect(imagePathsOf('render.slide', null)).toEqual([]);
  });

  it('maps the error classes of SPEC 7.1 to isError results with the status', () => {
    const conflict = toolErrorBody(
      'block.set',
      new ConflictError('stale', { currentRevision: 13, current: { revision: 13 } }),
    );
    expect(conflict).toMatchObject({
      name: 'ConflictError',
      status: 409,
      action: 'block.set',
      currentRevision: 13,
      current: { revision: 13 },
    });
    expect(toolErrorBody('slide.get', new RangeError('No slide "x"')).status).toBe(404);
    expect(toolErrorBody('slide.get', new TypeError('bad')).status).toBe(400);
    expect(toolErrorBody('export.run', new NotImplementedError('export.run', 'M2'))).toMatchObject({
      status: 501,
      milestone: 'M2',
    });
    expect(toolErrorBody('render.slide', 'boom')).toMatchObject({ name: 'Error', status: 500 });

    const result = toolError('block.set', new RangeError('No block "list"'));
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    const text = result.content[0];
    expect(text?.type).toBe('text');
    expect(JSON.parse(text?.type === 'text' ? text.text : '{}')).toMatchObject({
      error: { name: 'RangeError', status: 404 },
    });
  });
});
