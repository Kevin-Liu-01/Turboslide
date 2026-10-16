// `turboslide admin migrate-storage` against a local server standing in for a hosted studio
// (HR-K1#4b, docs/hosting.md 10): the command sends the step, the call's budget, the requests in
// flight and the backup time of delete, and prints the state, the times and the rows. The server here only records the body and
// answers the action's output shape; the step itself is tested on the fake store in packages/store.
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { runCli } from '../cli.ts';

type Run = { code: number; stdout: string; stderr: string; json: unknown };

let root: string;
let server: Server;
let origin = '';
const bodies: Record<string, unknown>[] = [];
let answer: Record<string, unknown> = {};

async function run(argv: string[], json = true): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(json ? [...argv, '--json'] : argv, {
    cwd: root,
    env: { USER: 'tester', TURBOSLIDE_CONFIG_DIR: join(root, 'config') },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  let parsed: unknown;
  if (json && stdout.trim() !== '') parsed = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json: parsed };
}

describe('turboslide admin migrate-storage (HR-K1#4b)', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-migrate-'));
    server = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      request.on('end', () => {
        response.writeHead(request.url === '/api/actions/admin.migrateStorage' ? 200 : 404, {
          'content-type': 'application/json',
        });
        if (request.url !== '/api/actions/admin.migrateStorage') {
          response.end(JSON.stringify({ error: { code: 'not_found', message: 'no route' } }));
          return;
        }
        bodies.push(raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>));
        response.end(JSON.stringify(answer));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    bodies.length = 0;
    answer = {
      step: 'copy',
      state: 'v1',
      frozen: true,
      done: false,
      clean: false,
      processed: 3,
      remaining: 2,
      rows: ['decks/a/deck.json: the copy failed'],
      rowCount: 1,
      planned: 5,
      settlesAt: '2026-10-13T04:04:00.000Z',
      expiresAt: '2026-10-13T04:14:00.000Z',
      switchedAt: null,
      listMs: null,
      perSecond: 120,
      retries: 4,
      rekeyAfter: null,
      note: null,
    };
  });

  test('sends the budget in milliseconds, 240 s by default, and prints the state and the rows', async () => {
    const plain = await run(['admin', 'migrate-storage', 'copy', '--to', origin]);
    expect(plain.code, plain.stderr).toBe(0);
    expect(bodies.at(-1)).toEqual({ step: 'copy', budgetMs: 240_000 });
    expect(plain.json).toMatchObject({ state: 'v1', frozen: true, remaining: 2 });
    const short = await run(
      ['admin', 'migrate-storage', 'copy', '--to', origin, '--budget', '120'],
      false,
    );
    expect(short.code, short.stderr).toBe(0);
    expect(bodies.at(-1)).toEqual({ step: 'copy', budgetMs: 120_000 });
    expect(short.stdout + short.stderr).toMatch(
      /copy: v1 frozen, not done; 3 processed, 2 remaining, 1 rows; settles 2026-10-13T04:04:00\.000Z, frozen until 2026-10-13T04:14:00\.000Z at most, 120 a second/,
    );
    expect(short.stdout + short.stderr).toMatch(/ {2}decks\/a\/deck\.json: the copy failed/);
  });

  test('sends the requests in flight of copy, and none when the flag is not named', async () => {
    await run(['admin', 'migrate-storage', 'copy', '--to', origin, '--concurrency', '48']);
    expect(bodies.at(-1)).toEqual({ step: 'copy', budgetMs: 240_000, concurrency: 48 });
    await run(['admin', 'migrate-storage', 'copy', '--to', origin]);
    expect(bodies.at(-1)).not.toHaveProperty('concurrency');
  });

  test('prints when a rekey pass must run again, from the answer of a pass that replaced keys', async () => {
    answer = {
      ...answer,
      step: 'rekey',
      state: 'v2',
      frozen: false,
      done: true,
      clean: true,
      rows: [],
      rowCount: 0,
      settlesAt: null,
      expiresAt: null,
      perSecond: null,
      rekeyAfter: '2026-10-13T05:12:30.000Z',
    };
    const replaced = await run(['admin', 'migrate-storage', 'rekey', '--to', origin], false);
    expect(replaced.code, replaced.stderr).toBe(0);
    expect(replaced.stdout + replaced.stderr).toMatch(
      /rekey: v2, done; 3 processed, 2 remaining, 0 rows; run rekey again from 2026-10-13T05:12:30\.000Z/,
    );
  });

  test('sends the backup time of delete as backupAt, and nothing when it is not named', async () => {
    answer = { ...answer, step: 'delete', state: 'v2', frozen: false };
    const named = await run([
      'admin',
      'migrate-storage',
      'delete',
      '--to',
      origin,
      '--i-have-a-backup',
      '2026-10-13T04:00:00Z',
    ]);
    expect(named.code, named.stderr).toBe(0);
    expect(bodies.at(-1)).toMatchObject({ step: 'delete', backupAt: '2026-10-13T04:00:00Z' });
    await run(['admin', 'migrate-storage', 'delete', '--to', origin]);
    expect(bodies.at(-1)).not.toHaveProperty('backupAt');
  });

  test('refuses a step the migration lost and a budget outside 120 to 240 s, before any request', async () => {
    for (const budget of ['1', '119', '241', 'soon']) {
      const result = await run([
        'admin',
        'migrate-storage',
        'copy',
        '--to',
        origin,
        '--budget',
        budget,
      ]);
      expect(result.code, budget).toBe(2);
    }
    expect((await run(['admin', 'migrate-storage', 'cutover', '--to', origin])).code).toBe(2);
    expect(bodies).toHaveLength(0);
  });
});
