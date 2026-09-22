#!/usr/bin/env node
// MILESTONES M4 acceptance, `node apps/cli/e2e/mcp-http.mjs`: an MCP client over streamable HTTP
// repeats the M2 stdio cycle against the studio's /mcp (lists the tools, inserts a slide, renders
// it with image content coming back, receives a lint finding, patches the block, is refused a stale
// baseRevision with 409, re-lints clean, saves a version and lists the log), then opens a headless
// viewer page on /deck/<id>, starts a second MCP session, sees deck_goto_slide listed because the
// page is attached, drives it and reads the page's active slide back. The scratch deck lives under
// decks/e2e-mcp-http and is removed afterwards. The studio must listen on TURBOSLIDE_STUDIO_URL
// (default http://localhost:4321); when nothing answers there the script starts the dev server the
// way scripts/check.mjs does and stops it at the end.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { launchBrowser } from '@turboslide/headless/launch';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const STUDIO_URL = process.env.TURBOSLIDE_STUDIO_URL ?? 'http://localhost:4321';
const DECK = 'e2e-mcp-http';
const DECK_DIR = join(ROOT, 'decks', DECK);
const RUN_ID = 'mcp-http';
const PNG_SIGNATURE = '89504e470d0a1a0a';
const SERVER_TIMEOUT_MS = 120_000;

const log = (line) => process.stderr.write(`${line}\n`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function seedDeck() {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(DECK_DIR, { recursive: true });
  cpSync(join(ROOT, 'decks', 'fixture', 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ROOT, 'decks', 'fixture', 'deck.json'), 'utf8'));
  manifest.id = DECK;
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function removeDeck() {
  rmSync(DECK_DIR, { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', DECK), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'thumbs', DECK), { recursive: true, force: true });
}

/** The slide the client inserts: a content slide whose heading ends in a period (copy/heading-period, severity 3). */
const INSERTED_SLIDE = {
  schemaVersion: 1,
  id: 'agent-rule',
  kind: 'content',
  layout: { type: 'cols', ratio: '1/1' },
  slots: {
    left: [
      { id: 'h', type: 'heading', level: 'h2', text: 'The agent rule.' },
      { id: 'p1', type: 'paragraph', measure: 56, text: 'Every write names the revision it read.' },
    ],
    right: [
      {
        id: 'list',
        type: 'plain',
        items: [
          { icon: { name: 'check-circle', color: 'ok' }, text: 'A stale revision is refused' },
          { icon: { name: 'x-circle', color: 'no' }, no: true, text: 'A silent overwrite' },
        ],
      },
    ],
  },
};

function textOf(result) {
  const text = result.content.find((item) => item.type === 'text');
  return text ? text.text : '';
}

function errorOf(result) {
  try {
    return JSON.parse(textOf(result)).error;
  } catch {
    return undefined;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isUp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

let server = null;

/** Starts the studio dev server on 4321 when nothing answers (scripts/check.mjs does the same). */
async function ensureServer() {
  if (await isUp(STUDIO_URL)) {
    log(`mcp-http: using the studio at ${STUDIO_URL}`);
    return;
  }
  if (new URL(STUDIO_URL).port !== '4321') {
    throw new Error(`nothing answers at ${STUDIO_URL}; start the studio there first`);
  }
  log('mcp-http: starting the studio dev server on 4321');
  server = spawn(
    'pnpm',
    ['--filter', '@turboslide/studio', 'exec', 'vite', 'dev', '--port', '4321', '--strictPort'],
    { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'ignore'] },
  );
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isUp(STUDIO_URL)) return;
    if (server.exitCode !== null) throw new Error(`the dev server exited with ${server.exitCode}`);
    await sleep(500);
  }
  throw new Error('the dev server did not answer within 120 s');
}

async function stopServer() {
  if (!server) return;
  const child = server;
  server = null;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
  const deadline = Date.now() + 5000;
  while (child.exitCode === null && Date.now() < deadline) await sleep(100);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  log('mcp-http: dev server stopped');
}

async function connect(name, author = `agent:${RUN_ID}`) {
  const url = new URL(`/mcp?deck=${DECK}&author=${encodeURIComponent(author)}`, STUDIO_URL);
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({ name, version: '0.0.0' });
  await client.connect(transport);
  return { client, transport };
}

async function main() {
  seedDeck();
  const steps = [];
  let current = '';
  const step = async (name, fn) => {
    current = name;
    const startedAt = Date.now();
    const value = await fn();
    steps.push(`${name} (${Date.now() - startedAt} ms)`);
    log(`ok   ${name}`);
    return value;
  };
  let client;
  let transport;
  let viewerClient;
  let viewerTransport;
  let launched;
  try {
    await step('studio reachable', ensureServer);

    ({ client, transport } = await step('initialize over /mcp', () =>
      connect('turboslide-e2e-http'),
    ));
    assert(transport.sessionId, 'the transport carries no session id after initialize');

    const info = await step('tools/list without a viewer has no deck_goto_slide', async () => {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name);
      for (const name of [
        'deck_get_info',
        'deck_get_slide',
        'deck_list_slides',
        'deck_insert_slide',
        'deck_update_block',
        'deck_render',
        'deck_lint',
        'deck_fix',
        'deck_version_save',
        'deck_version_list',
        'deck_lease_slide',
      ])
        assert(names.includes(name), `tools/list lacks ${name}: ${names.join(', ')}`);
      assert(!names.includes('deck_goto_slide'), 'deck_goto_slide is listed with no page attached');
      log(`     ${tools.length} tools: ${names.join(', ')}`);
      const result = await client.callTool({ name: 'deck_get_info', arguments: {} });
      assert(!result.isError, `deck_get_info failed: ${textOf(result)}`);
      assert(result.structuredContent.id === DECK, `deck id ${result.structuredContent.id}`);
      return result.structuredContent;
    });

    const inserted = await step('deck_insert_slide', async () => {
      const result = await client.callTool({
        name: 'deck_insert_slide',
        arguments: {
          sectionId: info.sections[0].id,
          slide: INSERTED_SLIDE,
          baseRevision: info.revision,
        },
      });
      assert(!result.isError, `deck_insert_slide failed: ${textOf(result)}`);
      const out = result.structuredContent;
      assert(
        out.revision === info.revision + 1,
        `revision ${out.revision} after insert at ${info.revision}`,
      );
      assert(out.slide.id === 'agent-rule', 'the inserted slide came back with another id');
      return out;
    });

    await step('deck_render returns image content through the render worker', async () => {
      const result = await client.callTool({
        name: 'deck_render',
        arguments: { slideIds: ['agent-rule'], themes: ['light'], scale: 1 },
      });
      assert(!result.isError, `deck_render failed: ${textOf(result)}`);
      const images = result.content.filter((item) => item.type === 'image');
      assert(images.length === 1, `expected 1 image, got ${images.length}`);
      const head = Buffer.from(images[0].data, 'base64').subarray(0, 8).toString('hex');
      assert(head === PNG_SIGNATURE, `image content is not a PNG (${head})`);
      const { records } = result.structuredContent;
      assert(records.length === 1 && records[0].slideId === 'agent-rule', 'record');
      assert(
        records[0].image.startsWith('/api/render/agent-rule'),
        `record image ${records[0].image}`,
      );
      assert(
        records[0].pageErrors.length === 0,
        `page errors: ${records[0].pageErrors.join('; ')}`,
      );
      log(`     renderer: ${records[0].renderer}`);
    });

    await step('deck_lint reports copy/heading-period', async () => {
      const result = await client.callTool({
        name: 'deck_lint',
        arguments: { slideIds: ['agent-rule'], layers: 'static' },
      });
      assert(!result.isError, `deck_lint failed: ${textOf(result)}`);
      const { items } = result.structuredContent;
      const finding = items.find((row) => row.rule === 'copy/heading-period');
      assert(
        finding && finding.blockId === 'h' && finding.source === 'lint',
        'no copy/heading-period on h',
      );
    });

    const patched = await step('deck_update_block patches the heading', async () => {
      const result = await client.callTool({
        name: 'deck_update_block',
        arguments: {
          slideId: 'agent-rule',
          blockId: 'h',
          path: '/text',
          value: 'The agent rule',
          baseRevision: inserted.revision,
        },
      });
      assert(!result.isError, `deck_update_block failed: ${textOf(result)}`);
      const out = result.structuredContent;
      assert(out.revision === inserted.revision + 1, `revision ${out.revision} after patch`);
      assert(out.slide.slots.left[0].text === 'The agent rule', 'the heading was not patched');
      assert(
        !out.findings.some((row) => row.rule === 'copy/heading-period'),
        'the finding remains',
      );
      return out;
    });

    await step('a stale baseRevision is refused with 409 and the current document', async () => {
      const result = await client.callTool({
        name: 'deck_update_block',
        arguments: {
          slideId: 'agent-rule',
          blockId: 'h',
          path: '/text',
          value: 'Another heading',
          baseRevision: inserted.revision,
        },
      });
      assert(result.isError === true, 'the stale write was accepted');
      const error = errorOf(result);
      assert(error && error.status === 409, `expected 409, got ${JSON.stringify(error)}`);
      assert(
        error.currentRevision === patched.revision,
        `currentRevision ${error.currentRevision}`,
      );
      assert(
        error.current && error.current.slides['agent-rule'],
        'the 409 body lacks the current slide',
      );
    });

    await step('an unknown field is refused with unknown_field and a pointer', async () => {
      const result = await client.callTool({
        name: 'deck_update_block',
        arguments: {
          slideId: 'agent-rule',
          blockId: 'h',
          path: '/text',
          value: 'x',
          baseRevision: patched.revision,
          bogus: 1,
        },
      });
      assert(result.isError === true, 'the unknown field was accepted');
      const error = errorOf(result);
      assert(
        error && error.status === 400 && error.code === 'unknown_field',
        `error ${JSON.stringify(error)}`,
      );
      assert(error.pointer === '/bogus', `pointer ${error.pointer}`);
    });

    await step('deck_lint is clean of copy/heading-period after the patch', async () => {
      const result = await client.callTool({
        name: 'deck_lint',
        arguments: { slideIds: ['agent-rule'], layers: 'static' },
      });
      assert(!result.isError, `deck_lint failed: ${textOf(result)}`);
      const { items } = result.structuredContent;
      assert(
        !items.some((row) => row.rule === 'copy/heading-period'),
        'copy/heading-period is still reported',
      );
    });

    const saved = await step('deck_version_save records the agent author', async () => {
      const result = await client.callTool({
        name: 'deck_version_save',
        arguments: { note: 'mcp http e2e' },
      });
      assert(!result.isError, `deck_version_save failed: ${textOf(result)}`);
      const version = result.structuredContent;
      assert(version.note === 'mcp http e2e', `note ${version.note}`);
      assert(
        version.author.kind === 'agent' && version.author.runId === RUN_ID,
        `author ${JSON.stringify(version.author)}`,
      );
      return version;
    });

    await step('deck_version_list lists the writes and the saved version', async () => {
      const result = await client.callTool({ name: 'deck_version_list', arguments: {} });
      assert(!result.isError, `deck_version_list failed: ${textOf(result)}`);
      const { items } = result.structuredContent;
      assert(
        items.some((row) => row.n === saved.n && row.note === 'mcp http e2e'),
        'the saved version is not listed',
      );
      const ops = items.flatMap((row) => row.mutations.map((mutation) => mutation.op));
      assert(
        ops.includes('slide.insert') && ops.includes('block.set'),
        `the log lacks the writes: ${ops.join(', ')}`,
      );
    });

    await step('resources: the slide and the latest render', async () => {
      const slide = await client.readResource({ uri: `deck://${DECK}/slides/agent-rule` });
      assert(
        JSON.parse(slide.contents[0].text).slots.left[0].text === 'The agent rule',
        'the slide resource is stale',
      );
      const render = await client.readResource({ uri: 'deck://render/agent-rule/light' });
      const png = render.contents.find((content) => content.mimeType === 'image/png');
      assert(
        png && Buffer.from(png.blob, 'base64').subarray(0, 8).toString('hex') === PNG_SIGNATURE,
        'not a PNG',
      );
    });

    launched = await step('a headless viewer page opens /deck and attaches', async () => {
      const opened = await launchBrowser({ probeRenderer: false });
      const page = await opened.browser.newPage({ viewport: { width: 1440, height: 900 } });
      // the flag is the rule, not a test convenience: since the sync and costs round a /deck,
      // /present or /embed page attaches a studio session only when its address carries
      // agent=1 and while it is visible (docs/SYNC.md 3.10, question 3's default;
      // useStudioSession.ts agentSessionRequested), so an agent that wants deck_goto_slide to
      // reach a viewer page opens it this way
      await page.goto(new URL(`/deck/${DECK}?agent=1`, STUDIO_URL).href, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        try {
          return Boolean(window.turboslide?.studio);
        } catch {
          return false;
        }
      });
      const deadline = Date.now() + 20_000;
      let attached = false;
      while (Date.now() < deadline && !attached) {
        const manifest = await (await fetch(new URL(`/api/agent?deck=${DECK}`, STUDIO_URL))).json();
        attached = manifest.sessions.some(
          (session) => session.deckId === DECK && session.actions.includes('view.goto'),
        );
        if (!attached) await sleep(250);
      }
      assert(attached, 'the viewer page did not attach within 20 s');
      return { ...opened, page };
    });

    ({ client: viewerClient, transport: viewerTransport } = await step(
      'a second MCP session lists deck_goto_slide',
      async () => {
        const connected = await connect('turboslide-e2e-http-viewer', 'agent:mcp-http-viewer');
        const { tools } = await connected.client.listTools();
        assert(
          tools.some((tool) => tool.name === 'deck_goto_slide'),
          'deck_goto_slide is not listed',
        );
        return connected;
      },
    ));

    await step('deck_goto_slide drives the attached viewer', async () => {
      const result = await viewerClient.callTool({
        name: 'deck_goto_slide',
        arguments: { slideId: 'agent-rule' },
      });
      assert(!result.isError, `deck_goto_slide failed: ${textOf(result)}`);
      const state = result.structuredContent;
      assert(state.slideId === 'agent-rule', `view state slide ${state.slideId}`);
      assert(state.mode === 'slide', `view state mode ${state.mode}`);
      await launched.page.waitForFunction(
        () => document.querySelector('.pt-viewer')?.getAttribute('data-active') === 'agent-rule',
        undefined,
        { timeout: 5000 },
      );
      const unknown = await viewerClient.callTool({
        name: 'deck_goto_slide',
        arguments: { slideId: 'no-such-slide' },
      });
      assert(unknown.isError === true, 'an unknown slide was accepted');
      assert(
        errorOf(unknown)?.status === 404,
        `expected 404, got ${JSON.stringify(errorOf(unknown))}`,
      );
    });

    await step('close', async () => {
      await viewerTransport.terminateSession();
      await viewerClient.close();
      await transport.terminateSession();
      await client.close();
      await launched.page.close();
      await launched.close();
      launched = undefined;
      client = undefined;
      viewerClient = undefined;
    });

    log(`mcp-http: ${steps.length} steps passed against ${STUDIO_URL}`);
    return 0;
  } catch (error) {
    log(
      `mcp-http: step "${current}" failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    for (const c of [client, viewerClient]) {
      try {
        await c?.close();
      } catch {
        // the transport may already be gone
      }
    }
    try {
      await launched?.close();
    } catch {
      // the browser may already be gone
    }
    return 1;
  } finally {
    removeDeck();
    await stopServer();
  }
}

process.exitCode = await main();
