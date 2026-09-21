// The stdio MCP server's tool list and the two tools the verification found missing
// (docs/gslides-parity/VERIFICATION.md, findings 1 and 12): `turboslide mcp` serves deck_set and
// deck_import_slides beside the other parity tools, deck_import_slides copies a slide with its
// assets from a sibling deck under the same decks/ folder the way `slide import` does, and
// deck_set writes /defaults/appearance on a deck that has no `defaults` yet (the blank template).
// The dispatcher and the server are built the way the command builds them (createDeckDispatcher,
// createDeckServer) and connected over the SDK's in-memory transport, so one test covers the
// derivation and the calls without a child process; apps/cli/e2e/mcp-stdio.mjs covers stdio.
import {
  cpSync,
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
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { DESTRUCTIVE_ACTIONS } from '@turboslide/mcp/tools';
import { GS3_ACTION_IDS } from '@turboslide/schema/actions';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { openFileStore } from '@turboslide/store/file-store';

import { runCli } from '../cli.ts';
import type { Author } from '../context.ts';
import { createDeckDispatcher, createDeckServer } from './mcp.ts';
import type { HandlerEnv } from './mcp.ts';

const REPO_DECKS = join(import.meta.dirname, '..', '..', '..', '..', 'decks');
const FIXTURE = join(REPO_DECKS, 'fixture', 'gslides');

/**
 * The tool list budgets (SPEC-3 0.40; the stdio buffer finding of VERIFICATION-2, the gate of
 * packages/mcp/src/tools.test.ts): the whole tools/list answer under 4 MB so a client over a pipe
 * reads the list in one frame, and every outputSchema under 32 KB so no answer's shape grows past
 * what a model reads whole (the input schema of deck_insert_slide carries the whole slide
 * catalog and is the largest tool by design).
 */
const TOOLS_LIST_BUDGET = 4 * 1024 * 1024;
const OUTPUT_SCHEMA_BUDGET = 32 * 1024;

/** The round three tools the stdio server serves (SPEC-3 12; the window only actions and the hosted only ones are not served over a deck folder). */
const ROUND_THREE_TOOLS = [
  'deck_add_comment',
  'deck_reply_comment',
  'deck_edit_comment',
  'deck_delete_comment',
  'deck_resolve_comment',
  'deck_reopen_comment',
  'deck_assign_comment',
  'deck_done_comment',
  'deck_react_comment',
  'deck_list_comments',
  'deck_get_comment',
  'deck_comment_link',
  'deck_list_notifications',
  'deck_mark_notifications_read',
  'deck_notification_settings',
  'deck_list_activity',
  'deck_version_diff',
  'deck_get_share',
  'deck_create_share_link',
  'deck_revoke_share_link',
  'deck_rotate_share_link',
  'deck_share_settings',
  'deck_publish',
  'deck_unpublish',
  'deck_admin_flag',
  'deck_dither_picture',
  'deck_materialize_pictures',
  'deck_set_slide_background_picture',
  'deck_set_slide_background_material',
  'deck_list_presence',
  'deck_sync_status',
  'deck_watch',
];
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

      // a deck from the blank template opens in the deployment kit's appearance (docs/PRODUCT.md
      // 4.1; the store's createDeck writes defaults.appearance from the template's kit, light on
      // General Translation's deployment), so the manifest carries that one field before any write
      expect(manifest().defaults).toEqual({ appearance: 'light' });
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

describe('turboslide mcp serves the round three tools, resources and subscriptions over the fixture deck', () => {
  let fixtureRoot: string;
  let fixtureDecks: string;
  let fixtureDir: string;

  async function fixtureCli(
    argv: string[],
    author = 'tester',
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    let stdout = '';
    let stderr = '';
    const code = await runCli([...argv, '--deck', fixtureDir, '--json', '--author', author], {
      cwd: fixtureRoot,
      env: {
        USER: 'tester',
        TURBOSLIDE_DECKS_DIR: fixtureDecks,
        TURBOSLIDE_ORIGIN: 'https://studio.test',
      },
      streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
      stdin: async () => '',
    });
    return { code, stdout, stderr };
  }

  function fixtureEnv(): HandlerEnv {
    return {
      dir: fixtureDir,
      store: openFileStore({ dir: fixtureDir }),
      derived: join(fixtureRoot, 'derived'),
      cwd: fixtureRoot,
      processEnv: {
        USER: 'tester',
        TURBOSLIDE_DECKS_DIR: fixtureDecks,
        TURBOSLIDE_ORIGIN: 'https://studio.test',
      },
      author: AUTHOR,
      log: () => undefined,
    };
  }

  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'turboslide-mcp3-'));
    fixtureDecks = join(fixtureRoot, 'decks');
    mkdirSync(fixtureDecks, { recursive: true });
    writeFileSync(join(fixtureRoot, 'pnpm-workspace.yaml'), 'packages: []\n');
    fixtureDir = join(fixtureDecks, 'gslides');
    cpSync(FIXTURE, fixtureDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test('the tool list names every round three tool, stays under the budgets and marks the destructive ones', () => {
    const { tools } = createDeckServer(fixtureEnv(), 'gslides', '0.0.0-test');
    const names = tools.map((entry) => entry.name);
    for (const name of ROUND_THREE_TOOLS) expect(names, name).toContain(name);
    expect(new Set(names).size).toBe(names.length);
    // every round three action with an mcp transport and a handler here is served
    const served = new Set(tools.map((entry) => entry.action));
    const missing = GS3_ACTION_IDS.filter((id) => !served.has(id));
    // hosted only (accounts, tokens, admin bootstrap, migration, mail, presence follow through a page) and the window transport
    for (const id of missing)
      expect(id, `${id} is not served over a deck folder`).toMatch(
        /^(account\.|admin\.(bootstrap|migrateStorage|mail)|share\.(invite|setRole|remove|setExpiry|stop|setGeneralAccess|listRequests|respond|requestAccess|transferOwnership|acceptOwnership|declineOwnership|claim|emailCollaborators)|admin\.assignOwner|presence\.(follow|unfollow|pointer)|deck\.follow|notification\.|comment\.|version\.)/,
      );
    const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
    const whole = bytes({ tools: tools.map((entry) => entry.tool) });
    expect(whole).toBeLessThan(TOOLS_LIST_BUDGET);
    for (const entry of tools) {
      if (entry.tool.outputSchema !== undefined)
        expect(bytes(entry.tool.outputSchema), entry.name).toBeLessThan(OUTPUT_SCHEMA_BUDGET);
    }
    for (const id of ['comment.delete', 'share.revokeLink', 'deck.unpublish'] as const) {
      expect(DESTRUCTIVE_ACTIONS.has(id), id).toBe(true);
      const entry = tools.find((row) => row.action === id);
      if (entry !== undefined) expect(entry.tool.annotations?.destructiveHint, id).toBe(true);
    }
    for (const id of ['comment.add', 'share.get', 'presence.list'] as const) {
      const entry = tools.find((row) => row.action === id);
      expect(entry?.tool.annotations?.destructiveHint ?? false, id).toBe(false);
    }
  });

  test('deck://<id>/comments, deck://<id>/presence and deck://inbox are listed and read; a CLI comment add fires the subscription', async () => {
    const created = createDeckServer(fixtureEnv(), 'gslides', '0.0.0-test');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await created.server.connect(serverTransport);
    const client = new Client({ name: 'mcp-test', version: '0.0.0' });
    const updated: string[] = [];
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
      updated.push(notification.params.uri);
    });
    await client.connect(clientTransport);
    try {
      expect(client.getServerCapabilities()?.resources).toEqual({
        subscribe: true,
        listChanged: true,
      });
      const listed = (await client.listResources()).resources.map((resource) => resource.uri);
      for (const uri of ['deck://gslides/comments', 'deck://gslides/presence', 'deck://inbox'])
        expect(listed, uri).toContain(uri);
      const comments = await client.readResource({ uri: 'deck://gslides/comments' });
      const body = JSON.parse((comments.contents[0] as { text: string }).text) as {
        threads: { anchor: { kind: string } }[];
        commentsRevision: number;
      };
      expect(body.threads.length).toBeGreaterThanOrEqual(3);
      expect(body.commentsRevision).toBeGreaterThan(0);
      const presence = await client.readResource({ uri: 'deck://gslides/presence' });
      expect(JSON.parse((presence.contents[0] as { text: string }).text)).toMatchObject({
        deckId: 'gslides',
        cap: 20,
        others: [],
      });
      const inbox = await client.readResource({ uri: 'deck://inbox' });
      expect(JSON.parse((inbox.contents[0] as { text: string }).text)).toMatchObject({
        notifications: expect.any(Array) as unknown,
      });

      await client.subscribeResource({ uri: 'deck://gslides/comments' });
      expect(created.subscriptions()).toContain('deck://gslides/comments');
      // the watcher is armed after the subscribe returns; give the file system watcher a beat
      await new Promise((resolve) => setTimeout(resolve, 200));
      const added = await fixtureCli(
        ['comment', 'add', 'slide:title', '-m', 'check this from the CLI'],
        'maya',
      );
      expect(added.code, added.stderr).toBe(0);
      const deadline = Date.now() + 8000;
      while (!updated.includes('deck://gslides/comments') && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(updated).toContain('deck://gslides/comments');
      const after = await client.readResource({ uri: 'deck://gslides/comments' });
      const afterBody = JSON.parse((after.contents[0] as { text: string }).text) as {
        commentsRevision: number;
      };
      expect(afterBody.commentsRevision).toBe(body.commentsRevision + 1);

      // the tool answers the same record the CLI wrote
      const listedThreads = await client.callTool({
        name: 'deck_list_comments',
        arguments: { slideId: 'title', state: 'open' },
      });
      expect(listedThreads.isError, JSON.stringify(listedThreads.content)).toBeFalsy();
      const threads = (
        listedThreads.structuredContent as { threads: { comment: { body: { text: string } } }[] }
      ).threads;
      expect(threads.some((thread) => thread.comment.body.text === 'check this from the CLI')).toBe(
        true,
      );
      await client.unsubscribeResource({ uri: 'deck://gslides/comments' });
      expect(created.subscriptions()).not.toContain('deck://gslides/comments');
      const validated = await fixtureCli(['validate', fixtureDir]);
      expect(validated.code, validated.stderr).toBe(0);
    } finally {
      await client.close();
      await created.server.close();
    }
  }, 30_000);
});
