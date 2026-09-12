// The stdio MCP server's tool list and the two tools the verification found missing
// (docs/gslides-parity/VERIFICATION.md, findings 1 and 12): `turboslide mcp` serves deck_set and
// deck_import_slides beside the other parity tools, deck_import_slides copies a slide with its
// assets from a sibling deck under the same decks/ folder the way `slide import` does, and
// deck_set writes /defaults/appearance on a deck that has no `defaults` yet (the blank template).
// The dispatcher and the server are built the way the command builds them (createDeckDispatcher,
// createDeckServer) and connected over the SDK's in-memory transport, so one test covers the
// derivation and the calls without a child process; apps/cli/e2e/mcp-stdio.mjs covers stdio.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { openFileStore } from '@turboslide/store/file-store';

import { runCli } from '../cli.ts';
import type { Author } from '../context.ts';
import { createDeckDispatcher, createDeckServer } from './mcp.ts';
import type { HandlerEnv } from './mcp.ts';

const REPO_DECKS = join(import.meta.dirname, '..', '..', '..', '..', 'decks');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const DECK_ID = 'untitled-presentation';
const AUTHOR: Author = { kind: 'agent', name: 'agent', runId: 'mcp-test' };

/** The parity round's tools the stdio server serves (SPEC 7.5; view.zoom is a window action and deck.remove has no mcp transport). */
const PARITY_TOOLS = [
  'deck_new_slide',
  'deck_duplicate_slide',
  'deck_skip_slide',
  'deck_apply_layout',
  'deck_import_slides',
  'deck_duplicate_block',
  'deck_replace_text',
  'deck_export_text',
  'deck_list',
  'deck_copy',
  'deck_trash',
  'deck_restore',
  'deck_set',
];

let root: string;
let decksDir: string;
let deckDir: string;

async function cli(argv: string[]): Promise<{ code: number; stderr: string }> {
  let stderr = '';
  const code = await runCli([...argv, '--json'], {
    cwd: root,
    env: { USER: 'tester', TURBOSLIDE_DECKS_DIR: decksDir },
    streams: { stdout: () => undefined, stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  return { code, stderr };
}

/** The worked deck under decks/, the source of deck_import_slides (its capture has twins). */
function writeWorkedDeck(id: string): void {
  const dir = join(decksDir, id);
  mkdirSync(join(dir, 'slides'), { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'deck.json'), canonicalJson({ ...WORKED_DECK, id }));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
  for (const asset of Object.values(WORKED_DECK.assets))
    for (const twin of Object.values(asset.twins)) writeFileSync(join(dir, twin), PNG);
}

function manifest(): { revision: number; defaults?: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(deckDir, 'deck.json'), 'utf8')) as {
    revision: number;
    defaults?: Record<string, unknown>;
  };
}

function handlerEnv(): HandlerEnv {
  return {
    dir: deckDir,
    store: openFileStore({ dir: deckDir }),
    derived: join(root, 'derived'),
    cwd: root,
    processEnv: { USER: 'tester', TURBOSLIDE_DECKS_DIR: decksDir },
    author: AUTHOR,
    log: () => undefined,
  };
}

describe('turboslide mcp serves the parity actions over the deck folder', () => {
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-mcp-'));
    decksDir = join(root, 'decks');
    mkdirSync(join(decksDir, 'templates'), { recursive: true });
    symlinkSync(join(REPO_DECKS, 'templates', 'blank'), join(decksDir, 'templates', 'blank'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    writeWorkedDeck('worked');
    const created = await cli(['deck', 'create', 'Untitled presentation', '--from', 'blank']);
    expect(created.code, created.stderr).toBe(0);
    deckDir = join(decksDir, DECK_ID);
  }, 30_000);

  afterAll(() => {
    unlinkSync(join(decksDir, 'templates', 'blank'));
    rmSync(root, { recursive: true, force: true });
  });

  test('the dispatcher has deck.set and slide.import and the tool list names every parity tool', () => {
    const dispatcher = createDeckDispatcher(handlerEnv());
    expect(dispatcher.has('deck.set')).toBe(true);
    expect(dispatcher.has('slide.import')).toBe(true);
    const { tools } = createDeckServer(handlerEnv(), DECK_ID, '0.0.0-test');
    const names = tools.map((entry) => entry.name);
    for (const name of PARITY_TOOLS) expect(names, name).toContain(name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('deck_import_slides copies a slide and its asset from a sibling deck, deck_set writes and removes /defaults/appearance', async () => {
    const created = createDeckServer(handlerEnv(), DECK_ID, '0.0.0-test');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await created.server.connect(serverTransport);
    const client = new Client({ name: 'mcp-test', version: '0.0.0' });
    await client.connect(clientTransport);
    try {
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).toContain('deck_import_slides');
      expect(names).toContain('deck_set');

      const imported = await client.callTool({
        name: 'deck_import_slides',
        arguments: {
          sourceDeckId: 'worked',
          slideIds: ['the-production-site'],
          after: 'title',
          baseRevision: manifest().revision,
        },
      });
      expect(imported.isError, JSON.stringify(imported.content)).toBeFalsy();
      const body = imported.structuredContent as {
        slides: { id: string }[];
        assets: string[];
        revision: number;
      };
      expect(body.slides.map((slide) => slide.id)).toEqual(['the-production-site']);
      expect(body.assets).toEqual(['site-home']);
      expect(existsSync(join(deckDir, 'assets', 'site-home-light.jpg'))).toBe(true);
      expect(manifest().revision).toBe(body.revision);

      const missing = await client.callTool({
        name: 'deck_import_slides',
        arguments: { sourceDeckId: 'nowhere', slideIds: ['title'], baseRevision: body.revision },
      });
      expect(missing.isError).toBe(true);

      // the blank template has no `defaults`; the first write under it creates the object
      expect(manifest().defaults).toBeUndefined();
      const light = await client.callTool({
        name: 'deck_set',
        arguments: { path: '/defaults/appearance', value: 'light', baseRevision: body.revision },
      });
      expect(light.isError, JSON.stringify(light.content)).toBeFalsy();
      expect(light.structuredContent).toMatchObject({
        path: '/defaults/appearance',
        value: 'light',
      });
      expect(manifest().defaults).toEqual({ appearance: 'light' });
      const removed = await client.callTool({
        name: 'deck_set',
        arguments: { path: '/defaults/appearance', baseRevision: manifest().revision },
      });
      expect(removed.isError, JSON.stringify(removed.content)).toBeFalsy();
      expect(removed.structuredContent).not.toHaveProperty('value');
      expect(manifest().defaults).toEqual({});

      const validated = await cli(['validate', deckDir]);
      expect(validated.code, validated.stderr).toBe(0);
    } finally {
      await client.close();
      await created.server.close();
    }
    // the writes lint the deck on every commit; under the whole workspace's parallel run the
    // sequence passes 5 s, so the timeout is the one the CLI walk allows a slow machine
  }, 30_000);
});
