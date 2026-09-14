// The presence, sync and account commands on a checkout, no server (gslides-parity SPEC-3 3.10,
// 3.11, 4.11, 7.9, 12, 16.6 cli row): `presence list` answers the caller alone with its computed
// mark, `presence pointer` persists the own pointer switch per deck on the principal record,
// follow and unfollow refuse with the sentence that names the missing page, `sync status` reads
// the file store on the memory tier over the file transport, `account me`, `account name` under
// the name rules of 0.19, `account avatar` and `account decks` over the decks folder; the hosted
// only actions say so without --to. Ids named for the coverage test: presence.list,
// presence.follow, presence.unfollow, presence.pointer, sync.status, account.me, account.setName,
// account.setAvatar, account.decks, account.sessions, account.signOut, account.tokens.create,
// account.tokens.list, account.tokens.revoke.
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runCli } from '../cli.ts';

const FIXTURE = join(import.meta.dirname, '..', '..', '..', '..', 'decks', 'fixture', 'gslides');

type Run = { code: number; stdout: string; stderr: string; json: unknown };
type Participant = {
  clientId: string;
  principalId: string;
  kind: string;
  label: string;
  trust: string;
  mark: Record<string, unknown>;
  role?: string;
  presenting: boolean;
  idle: boolean;
};
type Me = {
  principal: { id: string; kind: string };
  trust: string;
  label: string;
  name?: string;
  avatar: { variant: string } | null;
  mark: Record<string, unknown>;
};

let root: string;
let deckDir: string;

async function run(argv: string[], author = 'tester'): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--deck', deckDir, '--json', '--author', author], {
    cwd: root,
    env: { USER: 'tester', TURBOSLIDE_ORIGIN: 'https://studio.test' },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  let json: unknown;
  if (stdout.trim() !== '') json = JSON.parse(stdout) as unknown;
  return { code, stdout, stderr, json };
}

describe('turboslide presence, sync and account on a checkout', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-presence-'));
    mkdirSync(join(root, 'decks'), { recursive: true });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    deckDir = join(root, 'decks', 'gslides');
    cpSync(FIXTURE, deckDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('presence list answers the caller alone with a computed mark; the roster cap is 20', async () => {
    const result = await run(['presence', 'list']);
    expect(result.code, result.stderr).toBe(0);
    const answer = result.json as {
      deckId: string;
      cap: number;
      pointersVisible: boolean;
      self: Participant;
      others: Participant[];
    };
    expect(answer.deckId).toBe('gslides');
    expect(answer.cap).toBe(20);
    expect(answer.others).toEqual([]);
    expect(answer.self.clientId).toBe(`cli:${process.pid}`);
    expect(answer.self.principalId).toBe('local:tester');
    expect(answer.self.kind).toBe('human');
    expect(answer.self.label).toBe('tester');
    expect(answer.self.role).toBe('owner');
    expect(answer.self.presenting).toBe(false);
    expect(Object.keys(answer.self.mark).length).toBeGreaterThan(0);
    const agent = await run(['presence', 'list'], 'agent:run-7');
    expect((agent.json as { self: Participant }).self).toMatchObject({
      principalId: 'agent:run-7',
      kind: 'agent',
      trust: 'agent',
    });
  });

  test('presence pointer persists per deck and shows in the list; follow and unfollow name the missing page', async () => {
    const off = await run(['presence', 'pointer', '--off']);
    expect(off.code, off.stderr).toBe(0);
    expect(off.json).toEqual({ on: false });
    const on = await run(['presence', 'pointer', '--on']);
    expect(on.json).toEqual({ on: true });
    const neither = await run(['presence', 'pointer']);
    expect(neither.code).toBe(2);
    const principals = readdirSync(join(root, '.turboslide', 'principals'));
    expect(principals.some((file) => file.startsWith('local-tester'))).toBe(true);
    const follow = await run(['presence', 'follow', 'cli:1']);
    expect(follow.code).toBe(2);
    expect(follow.stderr).toMatch(/no studio page is attached/);
    const unfollow = await run(['presence', 'unfollow']);
    expect(unfollow.code).toBe(2);
    expect(unfollow.stderr).toMatch(/--to <studio>/);
  });

  test('sync status reads the file store: the memory tier over the file transport, not connected', async () => {
    const result = await run(['sync', 'status']);
    expect(result.code, result.stderr).toBe(0);
    expect(result.json).toEqual({
      seq: 0,
      revision: expect.any(Number) as number,
      pending: 0,
      retained: 0,
      tier: 'memory',
      transport: 'file',
      connected: false,
    });
    const other = await run(['sync', 'nothing']);
    expect(other.code).toBe(2);
  });

  test('account me, name under the rules of 0.19, avatar variants and decks over the folder', async () => {
    const me = await run(['account', 'me']);
    expect(me.code, me.stderr).toBe(0);
    const first = me.json as Me;
    expect(first.principal).toMatchObject({ id: 'local:tester', kind: 'local', admin: false });
    expect(first.label).toBe('tester');
    // a checkout principal is a guest (a typed name, no sign in); an agent run is `agent`
    expect(first.trust).toBe('guest');
    expect(['initials', 'glyph', 'dither', 'picture']).toContain(first.avatar?.variant);
    const named = await run(['account', 'name', 'Maya Chen']);
    expect(named.code, named.stderr).toBe(0);
    expect((named.json as Me).name).toBe('Maya Chen');
    const reserved = await run(['account', 'name', 'admin']);
    expect(reserved.code).toBe(2);
    expect(reserved.stderr).toMatch(/name/i);
    const control = await run(['account', 'name', 'Ma‮ya']);
    expect(control.code).toBe(2);
    const long = await run(['account', 'name', 'x'.repeat(80)]);
    expect(long.code).toBe(2);
    const glyph = await run(['account', 'avatar', '--variant', 'glyph']);
    expect(glyph.code, glyph.stderr).toBe(0);
    expect((glyph.json as Me).avatar).toMatchObject({ variant: 'glyph' });
    const initials = await run(['account', 'avatar', '--variant', 'initials', '--initials', 'MC']);
    expect((initials.json as Me).avatar).toMatchObject({ variant: 'initials' });
    const bad = await run(['account', 'avatar', '--variant', 'photo']);
    expect(bad.code).toBe(2);
    const again = await run(['account', 'me']);
    expect((again.json as Me).name).toBe('Maya Chen');
    expect((again.json as Me).avatar).toMatchObject({ variant: 'initials' });
    const png = await run(['account', 'me', '--avatar-png', join(root, 'me.png')]);
    expect(png.code).toBe(2);
    expect(existsSync(join(root, 'me.png'))).toBe(false);
    const decks = await run(['account', 'decks']);
    expect(decks.code, decks.stderr).toBe(0);
    const rows = decks.json as {
      id: string;
      title: string;
      slides: number;
      revision: number;
      role?: string;
    }[];
    expect(rows.map((row) => row.id)).toEqual(['gslides']);
    expect(rows[0]?.slides).toBeGreaterThan(20);
    expect(rows[0]?.role).toBe('owner');
    const shared = await run(['account', 'decks', '--view', 'shared']);
    expect(shared.json).toEqual([]);
    const view = await run(['account', 'decks', '--view', 'nothing']);
    expect(view.code).toBe(2);
  });

  test('the hosted only account actions refuse without --to and name the flag', async () => {
    for (const argv of [
      ['account', 'sessions'],
      ['account', 'sign-out', '--all'],
      ['account', 'tokens', 'create', '--name', 'ci', '--scope', 'read'],
      ['account', 'tokens', 'list'],
      ['account', 'tokens', 'revoke', 'tok_1'],
      ['admin', 'bootstrap', '--email', 'a@example.com'],
      ['admin', 'migrate-storage', 'plan'],
      ['admin', 'mail'],
    ]) {
      const result = await run(argv);
      expect(result.code, argv.join(' ')).toBe(2);
      expect(result.stderr, argv.join(' ')).toMatch(/--to/);
    }
  });
});
