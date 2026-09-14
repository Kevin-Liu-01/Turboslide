// `turboslide login` and `logout` over the device flow client (gslides-parity SPEC-3 7.7, 12):
// against a local fake of the two endpoints the flow posts the client id, prints the code and
// the verification URL without the device code, polls through authorization_pending and
// slow_down, stores the key under hosts.json with `kind: 'api-key'` and the record ids, never
// prints the key, and logout revokes the key through account.tokens.revoke with the bearer and
// forgets the host; access_denied and an expired code read as the fixed sentences; a studio
// without the flow names the alternative. Ids named for the coverage test: account.tokens.revoke.
import { readFileSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runCli } from '../cli.ts';
import { DEVICE_CODE_PATH, DEVICE_GRANT, DEVICE_TOKEN_PATH, deviceFlow } from './login.ts';

type Run = { code: number; stdout: string; stderr: string; json: unknown };

const FAKE_KEY = 'tsk_test_fake_key_0000000000000000';
const FAKE_DEVICE = 'dev_fake_device_code_0000';

let root: string;
let server: Server;
let origin = '';
let mode: 'grant' | 'deny' | 'expired' | 'absent' = 'grant';
const requests: { path: string; body: Record<string, unknown>; authorization?: string }[] = [];
let polls = 0;

async function run(argv: string[]): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--json'], {
    cwd: root,
    env: { USER: 'tester', TURBOSLIDE_CONFIG_DIR: join(root, 'config') },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  let json: unknown;
  if (stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

function hosts(): {
  hosts: Record<string, { token: string; kind?: string; tokenId?: string; principalId?: string }>;
} {
  return JSON.parse(readFileSync(join(root, 'config', 'hosts.json'), 'utf8')) as ReturnType<
    typeof hosts
  >;
}

describe('deviceFlow polls at the server interval and backs off on slow_down', () => {
  test('authorization_pending keeps the interval, slow_down adds five seconds, the token ends the loop', async () => {
    const answers: unknown[] = [
      {
        device_code: FAKE_DEVICE,
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://studio.test/device',
        expires_in: 600,
        interval: 2,
      },
      { error: 'authorization_pending' },
      { error: 'slow_down' },
      { error: 'authorization_pending' },
      { access_token: FAKE_KEY, token_id: 'tok_01FAKE' },
    ];
    const posted: string[] = [];
    const slept: number[] = [];
    const lines: string[] = [];
    const fetchImpl = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      posted.push(`${String(url)} ${String(init?.body)}`);
      return new Response(JSON.stringify(answers.shift()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const result = await deviceFlow('https://studio.test', {
      fetchImpl,
      sleep: async (ms) => {
        slept.push(ms);
      },
      log: (line) => lines.push(line),
    });
    expect(result).toEqual({ token: FAKE_KEY, tokenId: 'tok_01FAKE' });
    expect(slept).toEqual([2000, 2000, 7000, 7000]);
    expect(posted[0]).toContain(DEVICE_CODE_PATH);
    expect(posted[0]).toContain('"client_id":"turboslide-cli"');
    expect(
      posted
        .slice(1)
        .every((line) => line.includes(DEVICE_TOKEN_PATH) && line.includes(FAKE_DEVICE)),
    ).toBe(true);
    expect(lines[0]).toBe('Open https://studio.test/device and enter the code ABCD-EFGH');
    expect(lines.join('\n')).not.toContain(FAKE_KEY);
  });

  test('the deadline ends the loop with the expiry sentence', async () => {
    let now = 0;
    const fetchImpl = (async (url: Parameters<typeof fetch>[0]) =>
      new Response(
        JSON.stringify(
          String(url).endsWith(DEVICE_CODE_PATH)
            ? {
                device_code: FAKE_DEVICE,
                user_code: 'X',
                verification_uri: 'https://studio.test/device',
                expires_in: 1,
              }
            : { error: 'authorization_pending' },
        ),
        { status: 200 },
      )) as typeof fetch;
    const realNow = Date.now;
    Date.now = () => now;
    try {
      await expect(
        deviceFlow('https://studio.test', {
          fetchImpl,
          sleep: async (ms) => {
            now += ms;
          },
          log: () => undefined,
        }),
      ).rejects.toThrow(/expired before it was approved/);
    } finally {
      Date.now = realNow;
    }
  });
});

describe('turboslide login and logout over the device flow', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-login-'));
    server = createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      request.on('end', () => {
        const body = raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>);
        requests.push({
          path: request.url ?? '',
          body,
          ...(request.headers.authorization !== undefined
            ? { authorization: request.headers.authorization }
            : {}),
        });
        const answer = (status: number, payload: unknown): void => {
          response.writeHead(status, { 'content-type': 'application/json' });
          response.end(JSON.stringify(payload));
        };
        if (request.url === DEVICE_CODE_PATH) {
          if (mode === 'absent') return answer(404, { error: 'not_found' });
          return answer(200, {
            device_code: FAKE_DEVICE,
            user_code: 'WDJB-MJHT',
            verification_uri: `${origin}/device`,
            verification_uri_complete: `${origin}/device?code=WDJB-MJHT`,
            expires_in: 600,
            interval: 0,
          });
        }
        if (request.url === DEVICE_TOKEN_PATH) {
          polls += 1;
          if (body.grant_type !== DEVICE_GRANT || body.device_code !== FAKE_DEVICE)
            return answer(400, { error: 'invalid_grant' });
          if (mode === 'deny') return answer(400, { error: 'access_denied' });
          if (mode === 'expired') return answer(400, { error: 'expired_token' });
          return answer(200, {
            access_token: FAKE_KEY,
            token_type: 'Bearer',
            token_id: 'tok_01FAKE',
            principal_id: 'usr_01FAKE',
          });
        }
        if (request.url === '/api/actions/account.tokens.revoke') {
          if (request.headers.authorization !== `Bearer ${FAKE_KEY}`)
            return answer(401, { error: { code: 'unauthorized', message: 'unauthorized' } });
          return answer(200, { tokenId: body.tokenId, revoked: true, sessionsClosed: 0 });
        }
        return answer(404, { error: { code: 'not_found', message: 'no such route' } });
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

  test('login polls through pending and slow_down, stores the key as an api-key record and never prints it', async () => {
    mode = 'grant';
    polls = 0;
    requests.length = 0;
    const result = await run(['login', '--to', origin, '--client', 'turboslide-cli-test']);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toContain('WDJB-MJHT');
    expect(result.stderr).toContain(`${origin}/device?code=WDJB-MJHT`);
    expect(result.stdout + result.stderr).not.toContain(FAKE_KEY);
    expect(result.stdout + result.stderr).not.toContain(FAKE_DEVICE);
    expect(result.json).toEqual({
      origin,
      kind: 'api-key',
      tokenId: 'tok_01FAKE',
      principalId: 'usr_01FAKE',
      path: join(root, 'config', 'hosts.json'),
    });
    expect(requests[0]).toMatchObject({
      path: DEVICE_CODE_PATH,
      body: { client_id: 'turboslide-cli-test' },
    });
    expect(polls).toBe(1);
    const stored = hosts().hosts[origin];
    expect(stored).toMatchObject({
      token: FAKE_KEY,
      kind: 'api-key',
      tokenId: 'tok_01FAKE',
      principalId: 'usr_01FAKE',
    });
    expect(statSync(join(root, 'config', 'hosts.json')).mode & 0o777).toBe(0o600);
  }, 15_000);

  test('logout revokes the key with the bearer and forgets the host; a second logout finds nothing', async () => {
    requests.length = 0;
    const result = await run(['logout', '--to', origin]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.json).toEqual({ origin, revoked: true, forgotten: true });
    const revoke = requests.find((row) => row.path === '/api/actions/account.tokens.revoke');
    expect(revoke?.body).toEqual({ tokenId: 'tok_01FAKE' });
    expect(revoke?.authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(hosts().hosts[origin]).toBeUndefined();
    const again = await run(['logout', '--to', origin]);
    expect(again.code).toBe(0);
    expect(again.stderr).toMatch(/no credential is stored/);
  });

  test('access_denied and an expired code read as the fixed sentences; a studio without the flow names the alternative; --to is required', async () => {
    mode = 'deny';
    polls = 0;
    const denied = await run(['login', '--to', origin]);
    expect(denied.code).toBe(2);
    expect(denied.stderr).toMatch(/denied at the studio/);
    mode = 'expired';
    polls = 0;
    const expired = await run(['login', '--to', origin]);
    expect(expired.code).toBe(2);
    expect(expired.stderr).toMatch(/expired before it was approved/);
    mode = 'absent';
    const absent = await run(['login', '--to', origin]);
    expect(absent.code).toBe(2);
    expect(absent.stderr).toMatch(/does not offer the device flow \(404\)/);
    const missing = await run(['login']);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toMatch(/--to <url>/);
    expect(hosts().hosts[origin]).toBeUndefined();
  }, 15_000);
});
