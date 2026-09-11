// The server end to end in one process: an SDK client over the in-memory transport lists the
// tools the dispatcher implements, calls one, reads a resource and gets the prompt.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDispatcher } from '@turboslide/agent/dispatch';
import { ConflictError } from '@turboslide/schema/errors';
import { afterEach, describe, expect, it } from 'vitest';
import type { DeckSource } from './resources.ts';
import { createMcpServer } from './server.ts';

const author = { kind: 'agent' as const, name: 'agent', runId: 'server-test' };

function source(): DeckSource {
  return {
    deckId: 'fixture',
    manifest: async () => ({ id: 'fixture', revision: 3 }),
    slides: async () => [{ id: 'thesis', n: 1, title: 'Thesis' }],
    slide: async (slideId) =>
      slideId === 'thesis' ? { id: 'thesis', kind: 'statement', big: 'Thesis' } : undefined,
    latestRender: async () => undefined,
    latestSheet: async () => undefined,
  };
}

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

async function connect() {
  const dispatcher = createDispatcher();
  dispatcher.register('deck.info', () => ({
    id: 'fixture',
    title: 'Fixture',
    theme: 'gt-ink-paper',
    revision: 3,
    sections: [
      {
        id: 'brand',
        name: 'Brand',
        slides: [{ id: 'thesis', n: 1, title: 'Thesis', kind: 'statement' }],
      },
    ],
    counts: { slides: 1, sections: 1, assets: 0, htmlBlocks: 0 },
  }));
  dispatcher.register('version.list', () => [
    { n: 1, revision: 2, author, note: 'first', createdAt: '2026-09-10T00:00:00Z', mutations: [] },
  ]);
  dispatcher.register('block.set', (input) => {
    const { baseRevision } = input as { baseRevision: number };
    if (baseRevision !== 3) throw new ConflictError('stale', { currentRevision: 3 });
    return {
      slide: { schemaVersion: 1, id: 'thesis', kind: 'statement', big: 'Thesis' },
      revision: 4,
      findings: [],
    };
  });
  const created = createMcpServer({ dispatcher, source: source(), author, version: '0.0.0-test' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await created.server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  closers.push(async () => {
    await client.close();
    await created.server.close();
  });
  return { client, created };
}

describe('createMcpServer', () => {
  it('lists exactly the implemented tools with their schemas', async () => {
    const { client, created } = await connect();
    expect(created.tools.map((entry) => entry.name)).toEqual([
      'deck_get_info',
      'deck_update_block',
      'deck_version_list',
    ]);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(created.tools.map((entry) => entry.name));
    const update = listed.tools.find((tool) => tool.name === 'deck_update_block');
    expect(update?.inputSchema.required).toContain('baseRevision');
    expect(update?.outputSchema?.type).toBe('object');
  });

  it('dispatches a call and returns text plus structuredContent', async () => {
    const { client } = await connect();
    const result = await client.callTool({ name: 'deck_get_info', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ id: 'fixture', revision: 3 });
    const list = await client.callTool({ name: 'deck_version_list', arguments: {} });
    expect(list.structuredContent).toMatchObject({ count: 1 });
  });

  it('answers a stale baseRevision with an isError body carrying 409 and the current revision', async () => {
    const { client } = await connect();
    const ok = await client.callTool({
      name: 'deck_update_block',
      arguments: { slideId: 'thesis', blockId: 'big', path: '/text', value: 'x', baseRevision: 3 },
    });
    expect(ok.isError).toBeFalsy();
    expect(ok.structuredContent).toMatchObject({ revision: 4 });
    const stale = await client.callTool({
      name: 'deck_update_block',
      arguments: { slideId: 'thesis', blockId: 'big', path: '/text', value: 'x', baseRevision: 1 },
    });
    expect(stale.isError).toBe(true);
    const content = (stale.content as { type: string; text?: string }[])[0];
    expect(JSON.parse(content?.text ?? '{}')).toMatchObject({
      error: { name: 'ConflictError', status: 409, currentRevision: 3 },
    });
    const malformed = await client.callTool({
      name: 'deck_update_block',
      arguments: { slideId: 'thesis', baseRevision: 3 },
    });
    expect(malformed.isError).toBe(true);
    expect(JSON.parse((malformed.content as { text?: string }[])[0]?.text ?? '{}')).toMatchObject({
      error: { name: 'TypeError', status: 400 },
    });
    await expect(client.callTool({ name: 'deck_export', arguments: {} })).rejects.toThrow(
      /Unknown tool/,
    );
  });

  it('serves the resources and the prompt', async () => {
    const { client } = await connect();
    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toContain(
      'deck://fixture/slides/thesis',
    );
    const templates = await client.listResourceTemplates();
    expect(templates.resourceTemplates.map((template) => template.uriTemplate)).toContain(
      'deck://render/{slideId}/{theme}',
    );
    const slide = await client.readResource({ uri: 'deck://fixture/slides/thesis' });
    const first = slide.contents[0];
    expect(JSON.parse(first !== undefined && 'text' in first ? first.text : '{}')).toMatchObject({
      id: 'thesis',
    });
    await expect(client.readResource({ uri: 'deck://render/thesis/light' })).rejects.toThrow(
      /no render yet/,
    );
    await expect(client.readResource({ uri: 'deck://lint' })).rejects.toThrow(/no handler/);
    await expect(client.readResource({ uri: 'deck://nope' })).rejects.toThrow(/Resource not found/);
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(['deck_review']);
    const prompt = await client.getPrompt({ name: 'deck_review', arguments: { lens: 'layout' } });
    const content = prompt.messages[0]?.content;
    expect(content?.type === 'text' ? content.text : '').toContain('revision 3');
    await expect(
      client.getPrompt({ name: 'deck_review', arguments: { lens: 'vibes' } }),
    ).rejects.toThrow(/Unknown lens/);
  });
});
