// scripts/hosting/realtime-env.mjs against a fake `vercel` on PATH, a fake wrangler, a fake fetch
// and a temp config folder: the parsers, the plan of every subcommand, the dry run that makes no
// call, the real run that passes a value on stdin and never on the command line, the names only
// output, the private mode rule, the linked project refusal, the retired subcommand and the Worker
// side (the drain, the flag, the migration and the secrets). Nothing here reaches the network, a
// real project or a real Worker. Runs under the root vitest project `scripts` (vitest.config.ts
// includes scripts/**/*.test.mjs).
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_DATABASES,
  DEFAULT_ROOM_HOSTS,
  EXPECTATION_REL,
  EXPECTED_NAMES,
  FILES,
  NEVER_NAMES,
  RETIRED,
  readExpectation,
  ROOM_NAMES,
  SUBCOMMANDS,
  TIERS,
  UsageError,
  VERCEL_SUBCOMMANDS,
  databaseFor,
  execute,
  isPrivateMode,
  namesFromEnvLs,
  openDecksOf,
  parseArgs,
  parseEnvFile,
  planFor,
  readExpectation,
  readSecretFile,
  roomHostFor,
  run,
  scrub,
  writeExpectation,
} from './realtime-env.mjs';

const SCRIPT = join(import.meta.dirname, 'realtime-env.mjs');
const SECRET_ID = 'client-id-1234567890.apps.googleusercontent.com';
const SECRET_KEY = 'GOCSPX-this-is-a-fake-secret-value-0001';
const RESEND = 're_fake_resend_key_000000000000';
// the shared pair of before AUTH-3 (production's until its rotation) and the preview's own three
const ROOM_SECRET = 'a'.repeat(64);
const ROOM_BEARER = 'b'.repeat(64);
const BYPASS = 'c'.repeat(32);
const PREVIEW_SECRET = 'd'.repeat(64);
const PREVIEW_BEARER = 'e'.repeat(64);
const PREVIEW_DB = 'f'.repeat(64);
const PRODUCTION_SECRET = '1'.repeat(64);
const PRODUCTION_BEARER = '2'.repeat(64);
const PRODUCTION_DB = '3'.repeat(64);
const PREVIEW_KEYS = `TURBOSLIDE_ROOM_SECRET_PREVIEW=${PREVIEW_SECRET}\nTURBOSLIDE_ROOM_BEARER_PREVIEW=${PREVIEW_BEARER}\nTURBOSLIDE_DB_BEARER_PREVIEW=${PREVIEW_DB}\n`;
const PRODUCTION_KEYS = `TURBOSLIDE_ROOM_SECRET_PRODUCTION=${PRODUCTION_SECRET}\nTURBOSLIDE_ROOM_BEARER_PRODUCTION=${PRODUCTION_BEARER}\nTURBOSLIDE_DB_BEARER_PRODUCTION=${PRODUCTION_DB}\n`;
const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';

let dir;
let config;
let linked;
let bin;
let callLog;

/** A fake `vercel`: logs argv and the stdin byte count, answers `env ls --json` from a file. */
function installFakeVercel(names) {
  bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  callLog = join(dir, 'calls.log');
  const envsPath = join(dir, 'envs.json');
  writeFileSync(
    envsPath,
    JSON.stringify({
      envs: names.map((key) => ({ key, type: 'sensitive', target: ['production'] })),
    }),
  );
  const script = `#!/bin/sh
printf '%s\\n' "argv: $*" >> "${callLog}"
if [ "$1" = env ] && [ "$2" = ls ]; then cat "${envsPath}"; exit 0; fi
bytes=$(wc -c | tr -d ' ')
printf '%s\\n' "stdin-bytes: $bytes" >> "${callLog}"
exit 0
`;
  writeFileSync(join(bin, 'vercel'), script);
  chmodSync(join(bin, 'vercel'), 0o755);
}

/** A fake wrangler binary: logs argv and the stdin byte count. */
function installFakeWrangler() {
  const path = join(dir, 'fake-wrangler');
  writeFileSync(
    path,
    `#!/bin/sh
printf '%s\\n' "wrangler-argv: $*" >> "${join(dir, 'calls.log')}"
printf '%s\\n' "wrangler-account: \${CLOUDFLARE_ACCOUNT_ID:-none}" >> "${join(dir, 'calls.log')}"
bytes=$(wc -c | tr -d ' ')
printf '%s\\n' "wrangler-stdin-bytes: $bytes" >> "${join(dir, 'calls.log')}"
exit 0
`,
  );
  chmodSync(path, 0o755);
  return path;
}

function calls() {
  return existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
}

function writePrivateFile(name, text) {
  writeFileSync(join(config, name), text);
  chmodSync(join(config, name), 0o600);
}

function runScript(args, envNames = []) {
  installFakeVercel(envNames);
  const r = spawnSync(
    process.execPath,
    [SCRIPT, ...args, '--cwd', linked, '--config-dir', config],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    },
  );
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const filesOf = () =>
  Object.fromEntries(
    Object.entries(FILES).map(([k, s]) => [k, readSecretFile(join(config, s.name))]),
  );

const options = (sub, extra = {}) => ({
  subcommand: sub,
  flag: null,
  dryRun: true,
  scope: 'general-translation',
  project: 'turboslide-gt',
  cwd: linked,
  environments: ['production', 'preview'],
  configDir: config,
  adminEmails: null,
  force: false,
  tier: null,
  env: 'production',
  local: false,
  host: null,
  wrangler: null,
  workerDir: null,
  ...extra,
});

const quietIo = (extra = {}) => ({
  out: () => {},
  vercel: () => {
    throw new Error('vercel: never');
  },
  wrangler: () => {
    throw new Error('wrangler: never');
  },
  fetch: () => {
    throw new Error('fetch: never');
  },
  mint: () => 'x',
  writeFile: () => {},
  root: dir,
  ...extra,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'realtime-env-'));
  config = join(dir, 'config');
  linked = join(dir, 'linked');
  mkdirSync(config, { recursive: true });
  mkdirSync(join(linked, '.vercel'), { recursive: true });
  writeFileSync(
    join(linked, '.vercel', 'project.json'),
    JSON.stringify({ projectId: 'prj_x', orgId: 'team_x', projectName: 'turboslide-gt' }),
  );
  writePrivateFile(
    FILES.google.name,
    `GOOGLE_CLIENT_ID=${SECRET_ID}\nGOOGLE_CLIENT_SECRET="${SECRET_KEY}"\n`,
  );
  writePrivateFile(
    FILES.room.name,
    `TURBOSLIDE_ROOM_SECRET=${ROOM_SECRET}\nTURBOSLIDE_ROOM_BEARER=${ROOM_BEARER}\n${PREVIEW_KEYS}`,
  );
  writePrivateFile(
    FILES.cloudflare.name,
    `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID}\nCLOUDFLARE_WORKERS_SUBDOMAIN=sub\nD1_ACCOUNTS_NAME=turboslide-accounts\nD1_ACCOUNTS_ID=11111111-1111-1111-1111-111111111111\nD1_ACCOUNTS_PREVIEW_NAME=turboslide-accounts-preview\nD1_ACCOUNTS_PREVIEW_ID=22222222-2222-2222-2222-222222222222\nTURBOSLIDE_ROOM_HOST=turboslide-realtime.sub.workers.dev\nTURBOSLIDE_ROOM_HOST_PREVIEW=turboslide-realtime-preview.sub.workers.dev\n`,
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the parsers', () => {
  it('reads KEY=value lines, skips comments and blanks, strips one layer of quotes', () => {
    const m = parseEnvFile(`# a comment\n\nA=1\nexport B="two words"\nC='3'\nD=\nlower=no\n`);
    expect([...m.entries()]).toEqual([
      ['A', '1'],
      ['B', 'two words'],
      ['C', '3'],
    ]);
  });

  it('calls 600 and 400 private and 640, 644 and 660 not', () => {
    expect(isPrivateMode(0o600)).toBe(true);
    expect(isPrivateMode(0o400)).toBe(true);
    expect(isPrivateMode(0o640)).toBe(false);
    expect(isPrivateMode(0o644)).toBe(false);
    expect(isPrivateMode(0o660)).toBe(false);
  });

  it('reads the names of vercel env ls --json and no value', () => {
    const names = namesFromEnvLs(
      JSON.stringify({
        envs: [
          { key: 'A', type: 'sensitive' },
          { key: 'B', type: 'encrypted', value: 'x' },
        ],
      }),
    );
    expect([...names]).toEqual(['A', 'B']);
    expect(() => namesFromEnvLs('{}')).toThrow(TypeError);
  });

  it('refuses a file nobody but the owner may read and reads a private one', () => {
    const path = join(config, FILES.google.name);
    const ok = readSecretFile(path);
    expect(ok.private).toBe(true);
    expect(ok.keys).toEqual(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
    chmodSync(path, 0o644);
    const loose = readSecretFile(path);
    expect(loose.private).toBe(false);
    expect(loose.keys).toEqual([]);
    expect(loose.values.size).toBe(0);
    expect(readSecretFile(join(config, 'absent.env')).exists).toBe(false);
  });

  it('scrubs every value and anything that reads as a JWT', () => {
    expect(scrub(`set ${SECRET_KEY} and eyJ${'a'.repeat(30)} end`, new Set([SECRET_KEY]))).toBe(
      'set <value> and <jwt> end',
    );
  });

  it('parses the arguments and refuses an unknown subcommand, environment, tier or flag', () => {
    const o = parseArgs([
      'google',
      '--dry-run',
      '--environments',
      'preview',
      '--admin-emails',
      'a@b.c',
    ]);
    expect(o.subcommand).toBe('google');
    expect(o.dryRun).toBe(true);
    expect(o.environments).toEqual(['preview']);
    expect(o.adminEmails).toBe('a@b.c');
    expect(parseArgs(['flip', '--tier', 'do']).tier).toBe('do');
    expect(parseArgs(['worker-secrets', '--env', 'preview']).env).toBe('preview');
    expect(parseArgs(['do-flag', 'off']).flag).toBe('off');
    expect(() => parseArgs(['nope'])).toThrow(UsageError);
    expect(() => parseArgs(['flip', '--environments', 'development'])).toThrow(UsageError);
    expect(() => parseArgs(['flip', '--tier', 'memory'])).toThrow(UsageError);
    expect(() => parseArgs(['drain', '--env', 'production,preview'])).toThrow(UsageError);
    expect(() => parseArgs(['do-flag'])).toThrow(UsageError);
    expect(() => parseArgs(['do-flag', 'maybe'])).toThrow(UsageError);
    expect(() => parseArgs(['flip', '--what'])).toThrow(UsageError);
    expect(() => parseArgs([])).toThrow(UsageError);
  });

  it('names the retired redis subcommand with its reason', () => {
    expect(() => parseArgs(['redis'])).toThrow(/retired: the redis tier stays in the tree/);
    expect(Object.keys(RETIRED)).toEqual(['redis']);
    expect(SUBCOMMANDS).not.toContain('redis');
  });

  it('reads the expectation as blob, redis or do and nothing else', () => {
    mkdirSync(join(dir, 'scripts', 'hosting'), { recursive: true });
    expect(readExpectation(dir)).toBe('blob');
    writeExpectation('do', dir);
    expect(readExpectation(dir)).toBe('do');
    writeFileSync(join(dir, EXPECTATION_REL), '{"realtime":"memory"}');
    expect(readExpectation(dir)).toBe('blob');
    expect(() => writeExpectation('memory', dir)).toThrow(RangeError);
    expect(TIERS).toEqual(['blob', 'redis', 'do']);
  });

  it('reads the Worker host and the database per environment from cloudflare.env, else the defaults', () => {
    const files = filesOf();
    expect(roomHostFor('production', options('do'), files)).toBe(
      'turboslide-realtime.sub.workers.dev',
    );
    expect(roomHostFor('preview', options('do'), files)).toBe(
      'turboslide-realtime-preview.sub.workers.dev',
    );
    expect(roomHostFor('preview', options('do', { host: 'h.example' }), files)).toBe('h.example');
    expect(databaseFor('preview', files)).toBe('turboslide-accounts-preview');
    rmSync(join(config, FILES.cloudflare.name));
    const none = filesOf();
    expect(roomHostFor('production', options('do'), none)).toBe(DEFAULT_ROOM_HOSTS.production);
    expect(databaseFor('production', none)).toBe(DEFAULT_DATABASES.production);
  });

  it('reads the open decks of /control/open in its three shapes and drops a bad id', () => {
    expect(openDecksOf(['a-1', 'b'])).toEqual(['a-1', 'b']);
    expect(openDecksOf({ decks: [{ deckId: 'x' }, { id: 'y' }, { id: 'Bad Id' }] })).toEqual([
      'x',
      'y',
    ]);
    expect(openDecksOf({ open: ['z'] })).toEqual(['z']);
    expect(() => openDecksOf({})).toThrow(TypeError);
  });
});

describe('the plan', () => {
  it('has a plan for every subcommand', () => {
    for (const sub of SUBCOMMANDS)
      expect(
        planFor(sub, options(sub, sub === 'do-flag' ? { flag: 'off' } : {}), filesOf()).length,
      ).toBeGreaterThan(0);
  });

  it('do reads /health per Worker first, then sets the host plain and the two secrets sensitive', () => {
    const steps = planFor('do', options('do'), filesOf());
    expect(steps.slice(0, 2).map((s) => [s.kind, s.environment, s.host])).toEqual([
      ['health', 'production', 'turboslide-realtime.sub.workers.dev'],
      ['health', 'preview', 'turboslide-realtime-preview.sub.workers.dev'],
    ]);
    const adds = steps.filter((s) => s.kind === 'add');
    expect(
      adds.map((s) => `${s.name} ${s.environment} ${s.plain ? 'plain' : 'sensitive'}`),
    ).toEqual([
      'TURBOSLIDE_ROOM_HOST production plain',
      'TURBOSLIDE_ROOM_SECRET production sensitive',
      'TURBOSLIDE_ROOM_BEARER production sensitive',
      'TURBOSLIDE_ROOM_HOST preview plain',
      'TURBOSLIDE_ROOM_SECRET preview sensitive',
      'TURBOSLIDE_ROOM_BEARER preview sensitive',
      'TURBOSLIDE_DB_BEARER preview sensitive',
    ]);
    expect(adds[3].source).toMatchObject({
      file: 'cloudflare',
      key: 'TURBOSLIDE_ROOM_HOST_PREVIEW',
    });
    // production before its rotation keeps the shared pair and gains no database bearer
    expect(adds[1].source).toEqual({ file: 'room', key: 'TURBOSLIDE_ROOM_SECRET' });
    expect(adds[1].gate).toBeUndefined();
    expect(
      steps.find((s) => s.kind === 'note' && s.text.startsWith('TURBOSLIDE_DB_BEARER production')),
    ).toBeDefined();
    // the preview takes its own three and never the shared pair
    expect(adds.slice(4).map((s) => s.source)).toEqual([
      { file: 'room', key: 'TURBOSLIDE_ROOM_SECRET_PREVIEW' },
      { file: 'room', key: 'TURBOSLIDE_ROOM_BEARER_PREVIEW' },
      { file: 'room', key: 'TURBOSLIDE_DB_BEARER_PREVIEW' },
    ]);
  });

  it('do stops with exit 1 when room.env is absent or loose', () => {
    rmSync(join(config, FILES.room.name));
    expect(planFor('do', options('do'), filesOf())[0]).toMatchObject({ kind: 'stop', exit: 1 });
    writeFileSync(
      join(config, FILES.room.name),
      `TURBOSLIDE_ROOM_SECRET=a\nTURBOSLIDE_ROOM_BEARER=b\n`,
    );
    chmodSync(join(config, FILES.room.name), 0o644);
    const stop = planFor('do', options('do'), filesOf())[0];
    expect(stop.kind).toBe('stop');
    expect(stop.text).toContain('chmod 600');
  });

  it('database requires the host and the bearer, mints one secret per environment and sets TURBOSLIDE_ACCOUNTS=d1 with BETTER_AUTH_SECRET', () => {
    const steps = planFor('database', options('database'), filesOf());
    expect(steps.filter((s) => s.kind === 'require').map((s) => s.names)).toEqual([
      ['TURBOSLIDE_ROOM_HOST', 'TURBOSLIDE_ROOM_BEARER'],
      ['TURBOSLIDE_ROOM_HOST', 'TURBOSLIDE_ROOM_BEARER'],
    ]);
    expect(steps.filter((s) => s.kind === 'mint').map((s) => s.key)).toEqual([
      'BETTER_AUTH_SECRET_PRODUCTION',
      'BETTER_AUTH_SECRET_PREVIEW',
    ]);
    const adds = steps.filter((s) => s.kind === 'add');
    expect(
      adds.map((s) => [s.name, s.environment, s.plain === true, s.source.key ?? s.source.literal]),
    ).toEqual([
      ['TURBOSLIDE_ACCOUNTS', 'production', true, 'd1'],
      ['BETTER_AUTH_SECRET', 'production', false, 'BETTER_AUTH_SECRET_PRODUCTION'],
      ['TURBOSLIDE_ACCOUNTS', 'preview', true, 'd1'],
      ['BETTER_AUTH_SECRET', 'preview', false, 'BETTER_AUTH_SECRET_PREVIEW'],
    ]);
    expect(steps.some((s) => s.kind === 'require' && s.names.includes('DATABASE_URL'))).toBe(false);
  });

  it('google sets the two client values and the admin addresses, after TURBOSLIDE_ACCOUNTS', () => {
    const steps = planFor('google', options('google'), filesOf());
    expect(steps[0]).toMatchObject({ kind: 'require', names: ['TURBOSLIDE_ACCOUNTS'] });
    const adds = steps.filter((s) => s.kind === 'add').map((s) => `${s.name} ${s.environment}`);
    expect(adds).toEqual([
      'GOOGLE_CLIENT_ID production',
      'GOOGLE_CLIENT_SECRET production',
      'TURBOSLIDE_ADMIN_EMAILS production',
      'GOOGLE_CLIENT_ID preview',
      'GOOGLE_CLIENT_SECRET preview',
      'TURBOSLIDE_ADMIN_EMAILS preview',
    ]);
    expect(steps.find((s) => s.name === 'TURBOSLIDE_ADMIN_EMAILS').source.literal).toBe(
      'kevin@generaltranslation.com',
    );
  });

  it('google stops with exit 1 when the file is absent, and names the chmod when it is loose', () => {
    rmSync(join(config, FILES.google.name));
    expect(planFor('google', options('google'), filesOf())[0]).toMatchObject({
      kind: 'stop',
      exit: 1,
    });
    writeFileSync(join(config, FILES.google.name), `GOOGLE_CLIENT_ID=a\nGOOGLE_CLIENT_SECRET=b\n`);
    chmodSync(join(config, FILES.google.name), 0o644);
    const stop = planFor('google', options('google'), filesOf())[0];
    expect(stop.kind).toBe('stop');
    expect(stop.text).toContain('chmod 600');
  });

  it('mail without its file sets nothing; with it sets the pair, removes the production row and sets capture on preview', () => {
    expect(planFor('mail', options('mail'), filesOf()).map((s) => s.kind)).toEqual(['note']);
    writePrivateFile(
      FILES.mail.name,
      `RESEND_API_KEY=${RESEND}\nTURBOSLIDE_MAIL_FROM=hello@turboslide.com\n`,
    );
    const steps = planFor('mail', options('mail'), filesOf());
    expect(steps.map((s) => `${s.kind} ${s.name} ${s.environment}`)).toEqual([
      'add RESEND_API_KEY production',
      'add TURBOSLIDE_MAIL_FROM production',
      'rm TURBOSLIDE_MAIL production',
      'add RESEND_API_KEY preview',
      'add TURBOSLIDE_MAIL_FROM preview',
      'add TURBOSLIDE_MAIL preview',
    ]);
    expect(steps[5].source.literal).toBe('capture');
  });

  it('flip --tier do requires the three room names, removes the forced row on both environments and expects do', () => {
    const flip = planFor('flip', options('flip', { tier: 'do' }), filesOf());
    expect(flip.filter((s) => s.kind === 'require').map((s) => s.names)).toEqual([
      [...ROOM_NAMES],
      [...ROOM_NAMES],
    ]);
    expect(flip.filter((s) => s.kind === 'rm').map((s) => `${s.name} ${s.environment}`)).toEqual([
      'TURBOSLIDE_REALTIME production',
      'TURBOSLIDE_REALTIME preview',
    ]);
    expect(flip.find((s) => s.kind === 'expect').realtime).toBe('do');
    expect(
      planFor('flip', options('flip'), filesOf()).find((s) => s.kind === 'expect').realtime,
    ).toBe('do');
  });

  it('flip --tier redis and --tier blob are refused with exit 2 and the reason', () => {
    const redis = planFor('flip', options('flip', { tier: 'redis' }), filesOf());
    expect(redis).toEqual([
      expect.objectContaining({
        kind: 'stop',
        exit: 2,
        text: expect.stringContaining('never deployed'),
      }),
    ]);
    const blob = planFor('flip', options('flip', { tier: 'blob' }), filesOf());
    expect(blob[0]).toMatchObject({ kind: 'stop', exit: 2 });
    expect(blob[0].text).toContain('rollback');
  });

  it('rollback forces blob on both environments, expects blob and names the drain first', () => {
    const back = planFor('rollback', options('rollback'), filesOf());
    expect(
      back.filter((s) => s.kind === 'add').every((s) => s.source.literal === 'blob' && s.force),
    ).toBe(true);
    expect(back.find((s) => s.kind === 'expect').realtime).toBe('blob');
    expect(back.at(-1).text).toContain('`drain`');
  });

  it('status reports every expected name, the never set names and the files per environment', () => {
    const steps = planFor('status', options('status'), filesOf());
    expect(steps.filter((s) => s.kind === 'report').map((s) => s.names)).toEqual(
      [EXPECTED_NAMES, EXPECTED_NAMES].map((n) => [...n]),
    );
    expect(steps.filter((s) => s.kind === 'never').map((s) => s.names)).toEqual(
      [NEVER_NAMES, NEVER_NAMES].map((n) => [...n]),
    );
    expect(EXPECTED_NAMES).not.toContain('REDIS_URL');
    expect(EXPECTED_NAMES).not.toContain('DATABASE_URL');
    expect(EXPECTED_NAMES).toEqual(expect.arrayContaining([...ROOM_NAMES, 'TURBOSLIDE_ACCOUNTS']));
    // the files, the expectation, and the three names compared across the environments
    expect(steps.filter((s) => s.kind === 'note').length).toBe(Object.keys(FILES).length + 4);
  });

  it('drain and do-flag name the Worker of --env; worker-migrate names the database and the remote or local switch; worker-secrets puts the two secrets and the bypass on the preview alone', () => {
    const drain = planFor('drain', options('drain', { env: 'preview' }), filesOf());
    expect(drain).toEqual([
      {
        kind: 'flush',
        environment: 'preview',
        host: 'turboslide-realtime-preview.sub.workers.dev',
      },
    ]);
    const flag = planFor('do-flag', options('do-flag', { flag: 'off' }), filesOf());
    expect(flag).toEqual([
      {
        kind: 'flag',
        environment: 'production',
        host: 'turboslide-realtime.sub.workers.dev',
        realtime: 'off',
      },
    ]);
    const migrate = planFor('worker-migrate', options('worker-migrate'), filesOf());
    expect(migrate[0].args).toEqual([
      'd1',
      'migrations',
      'apply',
      'turboslide-accounts',
      '--remote',
    ]);
    const migratePreview = planFor(
      'worker-migrate',
      options('worker-migrate', { env: 'preview' }),
      filesOf(),
    );
    expect(migratePreview[0].args).toEqual([
      'd1',
      'migrations',
      'apply',
      'turboslide-accounts-preview',
      '--remote',
      '--env',
      'preview',
    ]);
    const migrateLocal = planFor(
      'worker-migrate',
      options('worker-migrate', { local: true }),
      filesOf(),
    );
    expect(migrateLocal[0].args).toContain('--local');
    expect(migrateLocal.some((s) => s.kind === 'note')).toBe(false);
    const prod = planFor('worker-secrets', options('worker-secrets'), filesOf());
    expect(prod.filter((s) => s.kind === 'wrangler').map((s) => s.args)).toEqual([
      ['secret', 'put', 'TURBOSLIDE_ROOM_SECRET'],
      ['secret', 'put', 'TURBOSLIDE_ROOM_BEARER'],
    ]);
    const preview = planFor(
      'worker-secrets',
      options('worker-secrets', { env: 'preview' }),
      filesOf(),
    );
    expect(preview.filter((s) => s.kind === 'wrangler').map((s) => s.args)).toEqual([
      ['secret', 'put', 'TURBOSLIDE_DB_BEARER', '--env', 'preview'],
      ['secret', 'put', 'TURBOSLIDE_ROOM_SECRET', '--env', 'preview'],
      ['secret', 'put', 'TURBOSLIDE_ROOM_BEARER', '--env', 'preview'],
    ]);
    expect(
      preview.find((s) => s.kind === 'note' && s.text.includes('vercel-bypass')).text,
    ).toContain('vercel-bypass.env is absent');
    writePrivateFile(FILES.bypass.name, `VERCEL_AUTOMATION_BYPASS_SECRET=${BYPASS}\n`);
    const withBypass = planFor(
      'worker-secrets',
      options('worker-secrets', { env: 'preview' }),
      filesOf(),
    );
    expect(withBypass.filter((s) => s.kind === 'wrangler').at(-1).args).toEqual([
      'secret',
      'put',
      'VERCEL_AUTOMATION_BYPASS_SECRET',
      '--env',
      'preview',
    ]);
  });
});

describe('execute', () => {
  const real = (sub, extra = {}) =>
    options(sub, { dryRun: false, environments: ['production'], ...extra });

  it('skips a present variable unless --force, passes --force only then, and omits --sensitive for a plain value', () => {
    const files = filesOf();
    const calls = [];
    const lines = [];
    const vercel = (args, input) => {
      calls.push({ args, input });
      if (args[1] === 'ls')
        return {
          status: 0,
          stdout: JSON.stringify({
            envs: [{ key: 'TURBOSLIDE_ACCOUNTS' }, { key: 'GOOGLE_CLIENT_ID' }],
          }),
          stderr: '',
        };
      return { status: 0, stdout: '', stderr: '' };
    };
    const o = real('google');
    const code = execute(
      planFor('google', o, files),
      o,
      files,
      quietIo({ out: (l) => lines.push(l), vercel }),
    );
    expect(code).toBe(0);
    const adds = calls.filter((c) => c.args[1] === 'add');
    expect(adds.map((c) => c.args[2])).toEqual(['GOOGLE_CLIENT_SECRET', 'TURBOSLIDE_ADMIN_EMAILS']);
    expect(adds[0].input).toBe(SECRET_KEY);
    expect(adds.every((c) => !c.args.includes('--force') && c.args.includes('--sensitive'))).toBe(
      true,
    );
    expect(lines.some((l) => l.startsWith('skip GOOGLE_CLIENT_ID production: present'))).toBe(true);
    expect(lines.join('\n')).not.toContain(SECRET_KEY);
    expect(lines.join('\n')).not.toContain(SECRET_ID);
    const forced = [];
    const f = real('google', { force: true });
    execute(
      planFor('google', f, files),
      f,
      files,
      quietIo({
        vercel: (args, input) => {
          forced.push(args);
          return vercel(args, input);
        },
      }),
    );
    expect(forced.find((a) => a[2] === 'GOOGLE_CLIENT_ID')).toContain('--force');
    // the plain host of `do`
    const doCalls = [];
    const d = real('do');
    const health = () => ({
      status: 200,
      json: { ok: true, realtime: 'on', commit: 'abc', appOrigin: 'https://www.turboslide.com' },
    });
    expect(
      execute(
        planFor('do', d, files),
        d,
        files,
        quietIo({
          vercel: (args, input) => {
            doCalls.push({ args, input });
            return args[1] === 'ls'
              ? { status: 0, stdout: JSON.stringify({ envs: [] }), stderr: '' }
              : { status: 0, stdout: '', stderr: '' };
          },
          fetch: health,
        }),
      ),
    ).toBe(0);
    const hostAdd = doCalls.find(
      (c) => c.args[1] === 'add' && c.args[2] === 'TURBOSLIDE_ROOM_HOST',
    );
    expect(hostAdd.args).not.toContain('--sensitive');
    expect(hostAdd.input).toBe('turboslide-realtime.sub.workers.dev');
    const secretAdd = doCalls.find(
      (c) => c.args[1] === 'add' && c.args[2] === 'TURBOSLIDE_ROOM_SECRET',
    );
    expect(secretAdd.args).toContain('--sensitive');
    expect(secretAdd.input).toBe(ROOM_SECRET);
  });

  it('do stops with exit 1 when /health is unreachable, not ok or unset, before any variable is set', () => {
    const files = filesOf();
    for (const fetch of [
      () => {
        throw new Error('fetch failed');
      },
      () => ({ status: 503, json: null }),
      () => ({ status: 200, json: { ok: true, realtime: 'unset', commit: '', appOrigin: '' } }),
    ]) {
      const lines = [];
      const o = real('do');
      const vercelCalls = [];
      const code = execute(
        planFor('do', o, files),
        o,
        files,
        quietIo({
          out: (l) => lines.push(l),
          fetch,
          vercel: (args) => {
            vercelCalls.push(args);
            return { status: 0, stdout: JSON.stringify({ envs: [] }), stderr: '' };
          },
        }),
      );
      expect(code).toBe(1);
      expect(vercelCalls).toEqual([]);
      expect(lines.at(-1)).toContain('/health');
    }
  });

  it('stops with exit 1 when a required name is absent and names the step', () => {
    const files = filesOf();
    const lines = [];
    const o = real('database');
    const code = execute(
      planFor('database', o, files),
      o,
      files,
      quietIo({
        out: (l) => lines.push(l),
        vercel: () => ({ status: 0, stdout: JSON.stringify({ envs: [] }), stderr: '' }),
      }),
    );
    expect(code).toBe(1);
    expect(lines.at(-1)).toContain('TURBOSLIDE_ROOM_HOST, TURBOSLIDE_ROOM_BEARER absent');
    expect(lines.at(-1)).toContain('run `do` first');
  });

  it('mints into the auth file once per environment, 600, and the expectation file follows flip and rollback', () => {
    const authPath = join(config, FILES.auth.name);
    const files = filesOf();
    const written = [];
    const minted = ['a'.repeat(64), 'b'.repeat(64)];
    const vercel = (args) =>
      args[1] === 'ls'
        ? {
            status: 0,
            stdout: JSON.stringify({
              envs: [
                { key: 'TURBOSLIDE_ROOM_HOST' },
                { key: 'TURBOSLIDE_ROOM_SECRET' },
                { key: 'TURBOSLIDE_ROOM_BEARER' },
                { key: 'TURBOSLIDE_REALTIME' },
              ],
            }),
            stderr: '',
          }
        : { status: 0, stdout: '', stderr: '' };
    const o = real('database', { environments: ['production', 'preview'] });
    const code = execute(
      planFor('database', o, files),
      o,
      files,
      quietIo({
        vercel,
        mint: () => minted.shift(),
        writeFile: (p, t) => {
          written.push(p);
          writeFileSync(p, t, { mode: 0o600 });
        },
      }),
    );
    expect(code).toBe(0);
    expect(written).toEqual([authPath, authPath]);
    const text = readFileSync(authPath, 'utf8');
    expect(text).toBe(
      `BETTER_AUTH_SECRET_PRODUCTION=${'a'.repeat(64)}\nBETTER_AUTH_SECRET_PREVIEW=${'b'.repeat(64)}\n`,
    );
    mkdirSync(join(dir, 'scripts', 'hosting'), { recursive: true });
    const f = real('flip', { tier: 'do' });
    const rms = [];
    expect(
      execute(
        planFor('flip', f, files),
        f,
        files,
        quietIo({
          vercel: (args, input) => {
            if (args[1] === 'rm') rms.push(args);
            return vercel(args, input);
          },
        }),
      ),
    ).toBe(0);
    expect(rms).toEqual([
      ['env', 'rm', 'TURBOSLIDE_REALTIME', 'production', '--yes', '--scope', 'general-translation'],
    ]);
    expect(readExpectation(dir)).toBe('do');
    const b = real('rollback');
    expect(execute(planFor('rollback', b, files), b, files, quietIo({ vercel }))).toBe(0);
    expect(readExpectation(dir)).toBe('blob');
    expect(existsSync(join(dir, EXPECTATION_REL))).toBe(true);
  });

  it('drain reads /control/open under the bearer and flushes every open deck; the flag is posted and read back', () => {
    const files = filesOf();
    const requests = [];
    const fetch = (url, init) => {
      requests.push({
        url,
        method: init.method,
        auth: init.headers.authorization,
        body: init.body,
      });
      if (url.endsWith('/control/open'))
        return { status: 200, json: { decks: ['deck-a', 'deck-b'] } };
      if (url.endsWith('/flush')) return { status: 200, json: { ok: true } };
      if (url.endsWith('/control/flags') && init.method === 'POST')
        return { status: 200, json: { ok: true } };
      if (url.endsWith('/control/flags')) return { status: 200, json: { realtime: 'off' } };
      return { status: 404, json: null };
    };
    const lines = [];
    const d = real('drain', { env: 'preview' });
    expect(
      execute(planFor('drain', d, files), d, files, quietIo({ out: (l) => lines.push(l), fetch })),
    ).toBe(0);
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET https://turboslide-realtime-preview.sub.workers.dev/control/open',
      'POST https://turboslide-realtime-preview.sub.workers.dev/rooms/deck-a/flush',
      'POST https://turboslide-realtime-preview.sub.workers.dev/rooms/deck-b/flush',
    ]);
    // the preview Worker takes the preview's own room bearer
    expect(requests.every((r) => r.auth === `Bearer ${PREVIEW_BEARER}`)).toBe(true);
    expect(lines.at(-1)).toBe(
      'preview: 2 of 2 open decks flushed on turboslide-realtime-preview.sub.workers.dev',
    );
    expect(lines.join('\n')).not.toContain(PREVIEW_BEARER);
    requests.length = 0;
    const g = real('do-flag', { flag: 'off' });
    const flagLines = [];
    expect(
      execute(
        planFor('do-flag', g, files),
        g,
        files,
        quietIo({ out: (l) => flagLines.push(l), fetch }),
      ),
    ).toBe(0);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: 'https://turboslide-realtime.sub.workers.dev/control/flags',
      body: '{"realtime":"off"}',
      auth: `Bearer ${ROOM_BEARER}`,
    });
    expect(flagLines.at(-1)).toContain('realtime flag off on turboslide-realtime.sub.workers.dev');
    // a flush that fails reads exit 1 with the deck named
    const failing = (url, init) =>
      url.endsWith('/control/open')
        ? { status: 200, json: ['deck-a'] }
        : { status: 500, json: null, method: init.method };
    const failLines = [];
    expect(
      execute(
        planFor('drain', d, files),
        d,
        files,
        quietIo({ out: (l) => failLines.push(l), fetch: failing }),
      ),
    ).toBe(1);
    expect(failLines.at(-1)).toContain('failed: deck-a (500)');
  });

  it('worker-secrets hands the value to wrangler on stdin, in order, and a failed command reads exit 2', () => {
    const files = filesOf();
    const ran = [];
    const o = real('worker-secrets', { env: 'preview' });
    const lines = [];
    expect(
      execute(
        planFor('worker-secrets', o, files),
        o,
        files,
        quietIo({
          out: (l) => lines.push(l),
          wrangler: (args, input) => {
            ran.push({ args, input });
            return { status: 0, stdout: '', stderr: '' };
          },
        }),
      ),
    ).toBe(0);
    expect(ran.map((r) => [r.args.join(' '), r.input])).toEqual([
      ['secret put TURBOSLIDE_DB_BEARER --env preview', PREVIEW_DB],
      ['secret put TURBOSLIDE_ROOM_SECRET --env preview', PREVIEW_SECRET],
      ['secret put TURBOSLIDE_ROOM_BEARER --env preview', PREVIEW_BEARER],
    ]);
    for (const value of [PREVIEW_DB, PREVIEW_SECRET, PREVIEW_BEARER, ROOM_SECRET, ROOM_BEARER])
      expect(lines.join('\n')).not.toContain(value);
    const failLines = [];
    expect(
      execute(
        planFor('worker-secrets', o, files),
        o,
        files,
        quietIo({
          out: (l) => failLines.push(l),
          wrangler: () => ({ status: 1, stdout: '', stderr: `not logged in ${PREVIEW_DB}` }),
        }),
      ),
    ).toBe(2);
    expect(failLines.at(-1)).toContain(
      'wrangler secret put TURBOSLIDE_DB_BEARER --env preview failed (exit 1)',
    );
    expect(failLines.at(-1)).not.toContain(PREVIEW_DB);
  });
});

// AUTH-3: one set of values per environment; the preview never takes a production value; the
// production rotation of docs/hosting.md 13.8 in its order; nothing printed but names and words.
describe('the values per environment (AUTH-3)', () => {
  const real = (sub, extra = {}) =>
    options(sub, { dryRun: false, environments: ['production'], ...extra });
  const withRoom = (extra) =>
    writePrivateFile(
      FILES.room.name,
      `TURBOSLIDE_ROOM_SECRET=${ROOM_SECRET}\nTURBOSLIDE_ROOM_BEARER=${ROOM_BEARER}\n${extra}`,
    );
  const ALL = [
    ROOM_SECRET,
    ROOM_BEARER,
    PREVIEW_SECRET,
    PREVIEW_BEARER,
    PREVIEW_DB,
    PRODUCTION_SECRET,
    PRODUCTION_BEARER,
    PRODUCTION_DB,
  ];

  it('the preview never takes the shared pair or a production value, and a database bearer is never the room bearer', () => {
    withRoom('');
    for (const sub of ['do', 'worker-secrets']) {
      const stop = planFor(
        sub,
        options(sub, { env: 'preview', environments: ['preview'] }),
        filesOf(),
      )[0];
      expect(stop).toMatchObject({ kind: 'stop', exit: 1 });
      expect(stop.text).toContain('mint --environments preview');
    }
    const refused = (extra, sub = 'worker-secrets', env = 'preview') => {
      withRoom(extra);
      const steps = planFor(sub, options(sub, { env, environments: [env] }), filesOf());
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({ kind: 'stop', exit: 2 });
      for (const value of ALL) expect(steps[0].text).not.toContain(value);
      return steps[0].text;
    };
    expect(
      refused(
        `TURBOSLIDE_ROOM_SECRET_PREVIEW=${ROOM_SECRET}\nTURBOSLIDE_ROOM_BEARER_PREVIEW=${PREVIEW_BEARER}\nTURBOSLIDE_DB_BEARER_PREVIEW=${PREVIEW_DB}\n`,
      ),
    ).toContain(
      'TURBOSLIDE_ROOM_SECRET_PREVIEW equals the production value TURBOSLIDE_ROOM_SECRET',
    );
    expect(
      refused(
        `${PRODUCTION_KEYS}TURBOSLIDE_ROOM_SECRET_PREVIEW=${PREVIEW_SECRET}\nTURBOSLIDE_ROOM_BEARER_PREVIEW=${PREVIEW_BEARER}\nTURBOSLIDE_DB_BEARER_PREVIEW=${PRODUCTION_DB}\n`,
        'do',
      ),
    ).toContain(
      'TURBOSLIDE_DB_BEARER_PREVIEW equals the production value TURBOSLIDE_DB_BEARER_PRODUCTION',
    );
    expect(
      refused(
        `TURBOSLIDE_ROOM_SECRET_PREVIEW=${PREVIEW_SECRET}\nTURBOSLIDE_ROOM_BEARER_PREVIEW=${PREVIEW_BEARER}\nTURBOSLIDE_DB_BEARER_PREVIEW=${PREVIEW_BEARER}\n`,
      ),
    ).toContain('the preview database bearer equals its room bearer');
    // production refuses a value the preview holds
    expect(
      refused(
        `${PREVIEW_KEYS}TURBOSLIDE_ROOM_SECRET_PRODUCTION=${PRODUCTION_SECRET}\nTURBOSLIDE_ROOM_BEARER_PRODUCTION=${PREVIEW_BEARER}\nTURBOSLIDE_DB_BEARER_PRODUCTION=${PRODUCTION_DB}\n`,
        'worker-secrets',
        'production',
      ),
    ).toContain('TURBOSLIDE_ROOM_BEARER_PRODUCTION equals the preview value');
  });

  it('status says distinct or shared per name, by digest, and prints no value', () => {
    const vercel = () => ({ status: 0, stdout: JSON.stringify({ envs: [] }), stderr: '' });
    const lines = [];
    const o = real('status', { environments: ['production', 'preview'] });
    let files = filesOf();
    expect(
      execute(
        planFor('status', o, files),
        o,
        files,
        quietIo({ out: (l) => lines.push(l), vercel }),
      ),
    ).toBe(0);
    expect(lines).toEqual(
      expect.arrayContaining([
        'TURBOSLIDE_ROOM_SECRET: production and preview distinct',
        'TURBOSLIDE_ROOM_BEARER: production and preview distinct',
        // production holds no database bearer before its rotation
        'TURBOSLIDE_DB_BEARER: production and preview unknown',
      ]),
    );
    // before the preview half: the preview holds the shared pair, which status calls shared
    withRoom('');
    files = filesOf();
    lines.length = 0;
    execute(planFor('status', o, files), o, files, quietIo({ out: (l) => lines.push(l), vercel }));
    expect(lines).toEqual(
      expect.arrayContaining([
        'TURBOSLIDE_ROOM_SECRET: production and preview shared',
        'TURBOSLIDE_ROOM_BEARER: production and preview shared',
      ]),
    );
    withRoom(`${PREVIEW_KEYS}${PRODUCTION_KEYS}`);
    files = filesOf();
    lines.length = 0;
    execute(planFor('status', o, files), o, files, quietIo({ out: (l) => lines.push(l), vercel }));
    expect(lines).toContain('TURBOSLIDE_DB_BEARER: production and preview distinct');
    for (const value of ALL) expect(lines.join('\n')).not.toContain(value);
  });

  it('mint writes the three keys of each environment once, into a 600 file, and prints none', () => {
    withRoom('');
    const files = filesOf();
    const written = [];
    let n = 0;
    const lines = [];
    const o = real('mint', { environments: ['production', 'preview'] });
    expect(
      execute(
        planFor('mint', o, files),
        o,
        files,
        quietIo({
          out: (l) => lines.push(l),
          mint: () => (n += 1).toString(16).padStart(64, '0'),
          writeFile: (path, text) => {
            written.push(path);
            writeFileSync(path, text);
            chmodSync(path, 0o600);
          },
        }),
      ),
    ).toBe(0);
    expect(n).toBe(6);
    const after = readSecretFile(join(config, FILES.room.name));
    expect(after.private).toBe(true);
    expect(after.keys).toEqual([
      'TURBOSLIDE_ROOM_SECRET',
      'TURBOSLIDE_ROOM_BEARER',
      'TURBOSLIDE_ROOM_SECRET_PRODUCTION',
      'TURBOSLIDE_ROOM_BEARER_PRODUCTION',
      'TURBOSLIDE_DB_BEARER_PRODUCTION',
      'TURBOSLIDE_ROOM_SECRET_PREVIEW',
      'TURBOSLIDE_ROOM_BEARER_PREVIEW',
      'TURBOSLIDE_DB_BEARER_PREVIEW',
    ]);
    // the shared pair stands: production's rotation reads it as the previous values
    expect(after.values.get('TURBOSLIDE_ROOM_BEARER')).toBe(ROOM_BEARER);
    for (const value of after.values.values()) expect(lines.join('\n')).not.toContain(value);
    // a second run mints nothing
    const again = filesOf();
    expect(
      planFor('mint', o, again)
        .filter((s) => s.kind === 'mint')
        .every((s) => s.when === 'present'),
    ).toBe(true);
  });

  it('the production rotation: --from-shared keeps the shared pair as the previous names, then puts production’s own three; settle deletes the previous names', () => {
    withRoom(`${PREVIEW_KEYS}${PRODUCTION_KEYS}`);
    const files = filesOf();
    const ran = [];
    const o = real('worker-secrets', { fromShared: true });
    const wrangler = (args, input) => {
      ran.push([args.join(' '), input]);
      return { status: 0, stdout: '', stderr: '' };
    };
    const lines = [];
    expect(
      execute(
        planFor('worker-secrets', o, files),
        o,
        files,
        quietIo({ out: (l) => lines.push(l), wrangler }),
      ),
    ).toBe(0);
    expect(ran).toEqual([
      ['secret put TURBOSLIDE_ROOM_SECRET_PREVIOUS', ROOM_SECRET],
      ['secret put TURBOSLIDE_ROOM_BEARER_PREVIOUS', ROOM_BEARER],
      ['secret put TURBOSLIDE_DB_BEARER_PREVIOUS', ROOM_BEARER],
      ['secret put TURBOSLIDE_DB_BEARER', PRODUCTION_DB],
      ['secret put TURBOSLIDE_ROOM_SECRET', PRODUCTION_SECRET],
      ['secret put TURBOSLIDE_ROOM_BEARER', PRODUCTION_BEARER],
    ]);
    for (const value of ALL) expect(lines.join('\n')).not.toContain(value);
    ran.length = 0;
    const settle = real('worker-settle');
    expect(
      execute(planFor('worker-settle', settle, files), settle, files, quietIo({ wrangler })),
    ).toBe(0);
    expect(ran.map(([args, input]) => [args, input])).toEqual([
      ['secret delete TURBOSLIDE_ROOM_SECRET_PREVIOUS', undefined],
      ['secret delete TURBOSLIDE_ROOM_BEARER_PREVIOUS', undefined],
      ['secret delete TURBOSLIDE_DB_BEARER_PREVIOUS', undefined],
    ]);
    // without production's own keys there is nothing to rotate to
    withRoom(PREVIEW_KEYS);
    expect(planFor('worker-secrets', o, filesOf())[0]).toMatchObject({ kind: 'stop', exit: 1 });
    expect(() => parseArgs(['worker-secrets', '--env', 'preview', '--from-shared'])).toThrow(
      UsageError,
    );
    expect(() => parseArgs(['do', '--from-shared'])).toThrow(UsageError);
    expect(parseArgs(['worker-secrets', '--from-shared']).fromShared).toBe(true);
  });

  it('worker-rollback puts the shared pair back on production and deletes the database bearer and the previous names, passing a name the Worker lacks', () => {
    withRoom(`${PREVIEW_KEYS}${PRODUCTION_KEYS}`);
    const files = filesOf();
    const ran = [];
    const lines = [];
    const o = real('worker-rollback');
    expect(
      execute(
        planFor('worker-rollback', o, files),
        o,
        files,
        quietIo({
          out: (l) => lines.push(l),
          wrangler: (args, input) => {
            ran.push([args.join(' '), input]);
            return {
              status: args.includes('TURBOSLIDE_DB_BEARER_PREVIOUS') ? 1 : 0,
              stdout: '',
              stderr: '',
            };
          },
        }),
      ),
    ).toBe(0);
    expect(ran).toEqual([
      ['secret put TURBOSLIDE_ROOM_SECRET', ROOM_SECRET],
      ['secret put TURBOSLIDE_ROOM_BEARER', ROOM_BEARER],
      ['secret delete TURBOSLIDE_DB_BEARER', undefined],
      ['secret delete TURBOSLIDE_ROOM_SECRET_PREVIOUS', undefined],
      ['secret delete TURBOSLIDE_ROOM_BEARER_PREVIOUS', undefined],
      ['secret delete TURBOSLIDE_DB_BEARER_PREVIOUS', undefined],
    ]);
    expect(
      lines.some((l) => l.includes('TURBOSLIDE_DB_BEARER_PREVIOUS') && l.includes('passed')),
    ).toBe(true);
    for (const value of ALL) expect(lines.join('\n')).not.toContain(value);
    expect(
      planFor('worker-rollback', real('worker-rollback', { env: 'preview' }), files)[0],
    ).toMatchObject({
      kind: 'stop',
      exit: 2,
    });
  });

  it('do on production sends its own values and the database bearer only once its Worker takes them', () => {
    withRoom(`${PREVIEW_KEYS}${PRODUCTION_KEYS}`);
    const files = filesOf();
    const run = (db) => {
      const adds = [];
      const lines = [];
      const o = real('do', { force: true });
      const code = execute(
        planFor('do', o, files),
        o,
        files,
        quietIo({
          out: (l) => lines.push(l),
          fetch: () => ({
            status: 200,
            json: {
              ok: true,
              realtime: 'on',
              commit: 'abc',
              appOrigin: 'x',
              ...(db ? { db } : {}),
            },
          }),
          vercel: (args, input) => {
            if (args[1] === 'ls')
              return {
                status: 0,
                stdout: JSON.stringify({
                  envs: [
                    'TURBOSLIDE_ROOM_HOST',
                    'TURBOSLIDE_ROOM_SECRET',
                    'TURBOSLIDE_ROOM_BEARER',
                  ].map((key) => ({ key })),
                }),
                stderr: '',
              };
            adds.push([args[2], input, args.includes('--force')]);
            return { status: 0, stdout: '', stderr: '' };
          },
        }),
      );
      expect(code).toBe(0);
      for (const value of ALL) expect(lines.join('\n')).not.toContain(value);
      return { adds, lines };
    };
    // an older Worker (no db in /health) and a Worker in fallback: nothing of the new values
    for (const db of [undefined, 'fallback']) {
      const { adds, lines } = run(db);
      expect(adds.map(([name]) => name)).toEqual(['TURBOSLIDE_ROOM_HOST']);
      expect(
        lines.filter((l) => l.startsWith('skip ') && l.includes('worker-secrets --from-shared')),
      ).toHaveLength(3);
    }
    // the Worker rotating: production's own three
    const { adds } = run('rotating');
    expect(adds).toEqual([
      ['TURBOSLIDE_ROOM_HOST', 'turboslide-realtime.sub.workers.dev', true],
      ['TURBOSLIDE_ROOM_SECRET', PRODUCTION_SECRET, true],
      ['TURBOSLIDE_ROOM_BEARER', PRODUCTION_BEARER, true],
      ['TURBOSLIDE_DB_BEARER', PRODUCTION_DB, false],
    ]);
  });

  it('app-partner sets the coming room bearer as the app’s partner on production; app-settle removes it', () => {
    withRoom(PREVIEW_KEYS);
    expect(
      planFor(
        'app-partner',
        options('app-partner', { environments: ['production'] }),
        filesOf(),
      )[0],
    ).toMatchObject({
      kind: 'stop',
      exit: 1,
    });
    withRoom(`${PREVIEW_KEYS}${PRODUCTION_KEYS}`);
    const files = filesOf();
    const calls = [];
    const vercel = (args, input) => {
      calls.push([args.slice(0, 4).join(' '), input]);
      return args[1] === 'ls'
        ? {
            status: 0,
            stdout: JSON.stringify({ envs: [{ key: 'TURBOSLIDE_ROOM_BEARER_PREVIOUS' }] }),
            stderr: '',
          }
        : { status: 0, stdout: '', stderr: '' };
    };
    const o = real('app-partner');
    expect(execute(planFor('app-partner', o, files), o, files, quietIo({ vercel }))).toBe(0);
    expect(calls.filter(([args]) => args.startsWith('env add'))).toEqual([
      ['env add TURBOSLIDE_ROOM_BEARER_PREVIOUS production', PRODUCTION_BEARER],
    ]);
    calls.length = 0;
    const settle = real('app-settle');
    expect(execute(planFor('app-settle', settle, files), settle, files, quietIo({ vercel }))).toBe(
      0,
    );
    expect(calls.filter(([args]) => args.startsWith('env rm'))).toEqual([
      ['env rm TURBOSLIDE_ROOM_BEARER_PREVIOUS production', undefined],
    ]);
  });
});

describe('the command', () => {
  it('dry run never calls vercel, prints names only and exits 0', () => {
    const r = runScript(['google', '--dry-run']);
    expect(r.status).toBe(0);
    expect(calls()).toBe('');
    expect(r.stdout).toContain(
      'would set GOOGLE_CLIENT_ID production (sensitive, value from google-oauth.env GOOGLE_CLIENT_ID on stdin)',
    );
    expect(r.stdout).not.toContain(SECRET_ID);
    expect(r.stdout).not.toContain(SECRET_KEY);
  });

  it('a real run passes the value on stdin, never on the command line, and prints no value', () => {
    const r = runScript(['google'], ['TURBOSLIDE_ACCOUNTS']);
    expect(r.status).toBe(0);
    const log = calls();
    expect(log).toContain('argv: env ls production --json --scope general-translation');
    expect(log).toContain(
      'argv: env add GOOGLE_CLIENT_ID production --sensitive --yes --scope general-translation',
    );
    expect(log).toContain(`stdin-bytes: ${SECRET_ID.length}`);
    expect(log).toContain(`stdin-bytes: ${SECRET_KEY.length}`);
    expect(log).not.toContain(SECRET_ID);
    expect(log).not.toContain(SECRET_KEY);
    expect(r.stdout).not.toContain(SECRET_ID);
    expect(r.stdout).not.toContain(SECRET_KEY);
    expect(r.stdout).toContain(
      'set GOOGLE_CLIENT_SECRET production (sensitive, value from google-oauth.env GOOGLE_CLIENT_SECRET on stdin)',
    );
  });

  it('refuses a real Vercel run from a root linked to another project and says so in a dry run', () => {
    writeFileSync(
      join(linked, '.vercel', 'project.json'),
      JSON.stringify({ projectName: 'turboslide' }),
    );
    const real = runScript(['google'], ['TURBOSLIDE_ACCOUNTS']);
    expect(real.status).toBe(2);
    expect(real.stdout).toContain('is turboslide, not turboslide-gt; refused');
    expect(calls()).toBe('');
    const dry = runScript(['google', '--dry-run']);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('a real run would refuse');
  });

  it('a Worker subcommand needs no linked project and runs the given wrangler with the account id, the value on stdin', () => {
    writeFileSync(
      join(linked, '.vercel', 'project.json'),
      JSON.stringify({ projectName: 'other' }),
    );
    const wrangler = installFakeWrangler();
    const r = runScript([
      'worker-secrets',
      '--env',
      'preview',
      '--wrangler',
      wrangler,
      '--worker-dir',
      dir,
    ]);
    expect(r.status).toBe(0);
    const log = calls();
    expect(log).toContain('wrangler-argv: secret put TURBOSLIDE_ROOM_SECRET --env preview');
    expect(log).toContain('wrangler-argv: secret put TURBOSLIDE_ROOM_BEARER --env preview');
    expect(log).toContain('wrangler-argv: secret put TURBOSLIDE_DB_BEARER --env preview');
    expect(log).toContain(`wrangler-account: ${ACCOUNT_ID}`);
    expect(log).toContain('wrangler-stdin-bytes: 64');
    for (const value of [PREVIEW_SECRET, PREVIEW_BEARER, PREVIEW_DB, ROOM_SECRET]) {
      expect(log).not.toContain(value);
      expect(r.stdout).not.toContain(value);
    }
    expect(r.stdout).toContain('ran wrangler secret put TURBOSLIDE_ROOM_SECRET --env preview');
    expect(r.stdout).toContain('worker environment preview');
    expect(VERCEL_SUBCOMMANDS).not.toContain('worker-secrets');
    const migrate = runScript(['worker-migrate', '--dry-run']);
    expect(migrate.status).toBe(0);
    expect(migrate.stdout).toContain(
      'would run wrangler d1 migrations apply turboslide-accounts --remote',
    );
    const missing = runScript(['worker-migrate', '--wrangler', join(dir, 'absent-wrangler')]);
    expect(missing.status).toBe(2);
    expect(missing.stdout).toContain('is absent');
  });

  it('exits 1 when a step is absent, 2 on usage and 2 on the retired subcommand', () => {
    expect(runScript(['database'], []).status).toBe(1);
    const usage = runScript(['nothing']);
    expect(usage.status).toBe(2);
    expect(usage.stderr).toContain('unknown subcommand');
    const retired = runScript(['redis']);
    expect(retired.status).toBe(2);
    expect(retired.stderr).toContain('retired');
    expect(runScript(['flip', '--tier', 'redis', '--dry-run']).status).toBe(2);
  });

  it('status lists the names, the never set names, the files with their modes and keys and the expectation', () => {
    const r = runScript(['status'], ['TURBOSLIDE_REALTIME', 'REDIS_URL']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('production: TURBOSLIDE_ROOM_HOST absent');
    expect(r.stdout).toContain('TURBOSLIDE_REALTIME present');
    expect(r.stdout).toContain('production: REDIS_URL PRESENT; these names are never set');
    expect(r.stdout).toContain(
      'google-oauth.env: mode 600, keys GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET',
    );
    expect(r.stdout).toContain(
      'room.env: mode 600, keys TURBOSLIDE_ROOM_SECRET, TURBOSLIDE_ROOM_BEARER',
    );
    expect(r.stdout).toContain('mail.env: absent');
    // the tree's own expectation, whatever the last flip or rollback wrote (ce2e5411 wrote do)
    expect(r.stdout).toContain(`${EXPECTATION_REL}: realtime ${readExpectation()}`);
    expect(r.stdout).not.toContain(ROOM_SECRET);
  });
});

describe('run', () => {
  it('reads the files once and hands execute the plan', () => {
    const lines = [];
    const code = run(
      options('mail', { environments: ['production'], scope: 's' }),
      quietIo({ out: (l) => lines.push(l) }),
    );
    expect(code).toBe(0);
    expect(lines[0]).toContain(
      'realtime-env mail --dry-run (project turboslide-gt, scope s, environments production',
    );
    expect(lines[1]).toContain('mail.env is absent: TURBOSLIDE_MAIL stays off');
  });
});
