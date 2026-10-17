// The deck a hosted command names (dispatch.ts hostedDeckId): `--to <studio>` sends `?deck=` for
// the deck the command names, a deck folder by its folder name or a deck on the studio by its id,
// and the deck folder the command runs in; never the checkout's decks/gt-brand fallback of
// findDeckDir, which before this sent every hosted write from the repository root to the studio's
// seed deck. A write that names no deck is the studio's 400 `deck_required`, which the CLI reads
// as the --deck flag it lacks. The action is comment.add over a local fake of POST /api/actions.
// The first runCli loads the command modules cold, which took past the 5 s default on the shared
// machine and let that test's late request land in the next one's `seen`: beforeAll runs one
// command first, and every test has TEST_MS.
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { runCli } from './cli.ts';

const FAKE_TOKEN = 'fake-bearer-for-the-hosted-deck-test';
/** Each test's timeout: a command spawns nothing, but the machine it runs on is shared. */
const TEST_MS = 60_000;

let root: string;
let server: Server;
let origin = '';
const seen: string[] = [];

function deckFolder(dir: string, id: string): void {
  mkdirSync(join(dir, 'slides'), { recursive: true });
  writeFileSync(
    join(dir, 'deck.json'),
    JSON.stringify({ id, title: id, theme: 'gt-ink-paper', revision: 0, sections: [], assets: {} }),
  );
}

async function run(argv: string[], cwd = root) {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--to', origin, '--token', FAKE_TOKEN], {
    cwd,
    env: { USER: 'tester', TURBOSLIDE_CONFIG_DIR: join(root, 'config') },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  return { code, stdout, stderr };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'turboslide-hosted-deck-'));
  // a checkout: decks/gt-brand is what findDeckDir falls back to from the root
  deckFolder(join(root, 'decks', 'gt-brand'), 'gt-brand');
  deckFolder(join(root, 'decks', 'worked'), 'worked');
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fake.test');
    seen.push(`${url.pathname}${url.search}`);
    response.setHeader('content-type', 'application/json');
    // the studio's rule (apps/studio/src/server/agent-gate.ts writesBoundDeck), for comment.add
    if (!url.searchParams.has('deck')) {
      response.writeHead(400);
      response.end(
        JSON.stringify({
          error: {
            name: 'TypeError',
            status: 400,
            code: 'deck_required',
            message: 'comment.add writes to a deck and this request names none',
          },
        }),
      );
      return;
    }
    response.writeHead(200);
    response.end(
      JSON.stringify({
        thread: {
          id: 'thr_1',
          anchor: { kind: 'slide', slideId: 'thesis' },
          replies: [],
          resolved: false,
        },
        commentsRevision: 1,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  origin = `http://127.0.0.1:${address.port}`;
  // the cold load of the CLI's command modules, before any test reads `seen`
  await run(['comment', 'add', 'slide:thesis', '-m', 'warm up', '--deck', 'warm-up']);
}, 120_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  seen.length = 0;
});

describe('the deck a hosted command sends (dispatch.ts hostedDeckId)', () => {
  test(
    'sends no deck from the checkout root, and reads deck_required as the missing --deck',
    async () => {
      const result = await run(['comment', 'add', 'slide:thesis', '-m', 'hi']);
      expect(seen).toEqual(['/api/actions/comment.add']);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('comment.add writes to a deck and the command names none');
      expect(result.stderr).toContain(`pass --deck <id> with --to ${origin}`);
    },
    TEST_MS,
  );

  test(
    'sends the deck --deck names: a deck on the studio by id, a folder by its name',
    async () => {
      expect(
        (await run(['comment', 'add', 'slide:thesis', '-m', 'hi', '--deck', 'hosted-only'])).code,
      ).toBe(0);
      expect(
        (await run(['comment', 'add', 'slide:thesis', '-m', 'hi', '--deck', 'decks/worked'])).code,
      ).toBe(0);
      expect(seen).toEqual([
        '/api/actions/comment.add?deck=hosted-only',
        '/api/actions/comment.add?deck=worked',
      ]);
    },
    TEST_MS,
  );

  test(
    'sends the deck folder the command runs in, and refuses a --deck that is neither',
    async () => {
      expect(
        (await run(['comment', 'add', 'slide:thesis', '-m', 'hi'], join(root, 'decks', 'worked')))
          .code,
      ).toBe(0);
      expect(seen).toEqual(['/api/actions/comment.add?deck=worked']);
      seen.length = 0;
      const refused = await run([
        'comment',
        'add',
        'slide:thesis',
        '-m',
        'hi',
        '--deck',
        'no/such/Folder',
      ]);
      expect(refused.code).not.toBe(0);
      expect(refused.stderr).toContain(
        '--deck no/such/Folder is neither a deck folder here nor a deck id',
      );
      expect(seen).toEqual([]);
    },
    TEST_MS,
  );
});
