// scripts/hosting/realtime-env.mjs against a fake `vercel` on PATH and a temp config folder: the
// parsers, the plan of every subcommand, the dry run that never calls vercel, the real run that
// passes a value on stdin and never on the command line, the names only output, the private
// mode rule and the linked project refusal. Nothing here reaches the network or a real project.
// Runs under the root vitest project `scripts` (vitest.config.ts includes scripts/**/*.test.mjs).
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
  EXPECTATION_REL,
  EXPECTED_NAMES,
  FILES,
  SUBCOMMANDS,
  UsageError,
  execute,
  isPrivateMode,
  namesFromEnvLs,
  parseArgs,
  parseEnvFile,
  planFor,
  readExpectation,
  readSecretFile,
  run,
  scrub,
} from './realtime-env.mjs';

const SCRIPT = join(import.meta.dirname, 'realtime-env.mjs');
const SECRET_ID = 'client-id-1234567890.apps.googleusercontent.com';
const SECRET_KEY = 'GOCSPX-this-is-a-fake-secret-value-0001';
const RESEND = 're_fake_resend_key_000000000000';

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

function calls() {
  return existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
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
  writeFileSync(
    join(config, FILES.google.name),
    `GOOGLE_CLIENT_ID=${SECRET_ID}\nGOOGLE_CLIENT_SECRET="${SECRET_KEY}"\n`,
  );
  chmodSync(join(config, FILES.google.name), 0o600);
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

  it('parses the arguments and refuses an unknown subcommand, environment or flag', () => {
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
    expect(() => parseArgs(['nope'])).toThrow(UsageError);
    expect(() => parseArgs(['flip', '--environments', 'development'])).toThrow(UsageError);
    expect(() => parseArgs(['flip', '--what'])).toThrow(UsageError);
    expect(() => parseArgs([])).toThrow(UsageError);
  });
});

describe('the plan', () => {
  const options = (sub, extra = {}) => ({
    subcommand: sub,
    dryRun: true,
    scope: 'general-translation',
    project: 'turboslide-gt',
    cwd: linked,
    environments: ['production', 'preview'],
    configDir: config,
    adminEmails: null,
    force: false,
    ...extra,
  });
  const filesOf = () =>
    Object.fromEntries(
      Object.entries(FILES).map(([k, s]) => [k, readSecretFile(join(config, s.name))]),
    );

  it('has a plan for every subcommand', () => {
    for (const sub of SUBCOMMANDS)
      expect(planFor(sub, options(sub), filesOf()).length).toBeGreaterThan(0);
  });

  it('redis sets nothing and requires REDIS_URL on both environments', () => {
    const steps = planFor('redis', options('redis'), filesOf());
    expect(steps.filter((s) => s.kind === 'add' || s.kind === 'rm')).toEqual([]);
    expect(steps.filter((s) => s.kind === 'require').map((s) => s.environment)).toEqual([
      'production',
      'preview',
    ]);
  });

  it('database mints one secret per environment and sets BETTER_AUTH_SECRET from it', () => {
    const steps = planFor('database', options('database'), filesOf());
    expect(steps.filter((s) => s.kind === 'mint').map((s) => s.key)).toEqual([
      'BETTER_AUTH_SECRET_PRODUCTION',
      'BETTER_AUTH_SECRET_PREVIEW',
    ]);
    const adds = steps.filter((s) => s.kind === 'add');
    expect(adds.map((s) => [s.name, s.environment, s.source.key])).toEqual([
      ['BETTER_AUTH_SECRET', 'production', 'BETTER_AUTH_SECRET_PRODUCTION'],
      ['BETTER_AUTH_SECRET', 'preview', 'BETTER_AUTH_SECRET_PREVIEW'],
    ]);
  });

  it('google sets the two client values and the admin addresses, after a database', () => {
    const steps = planFor('google', options('google'), filesOf());
    expect(steps[0]).toMatchObject({ kind: 'require', names: ['DATABASE_URL'] });
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
    writeFileSync(
      join(config, FILES.mail.name),
      `RESEND_API_KEY=${RESEND}\nTURBOSLIDE_MAIL_FROM=hello@turboslide.com\n`,
    );
    chmodSync(join(config, FILES.mail.name), 0o600);
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

  it('flip requires REDIS_URL, removes the forced row on both environments and expects redis; rollback forces blob', () => {
    const flip = planFor('flip', options('flip'), filesOf());
    expect(flip.filter((s) => s.kind === 'require').length).toBe(2);
    expect(flip.filter((s) => s.kind === 'rm').map((s) => `${s.name} ${s.environment}`)).toEqual([
      'TURBOSLIDE_REALTIME production',
      'TURBOSLIDE_REALTIME preview',
    ]);
    expect(flip.find((s) => s.kind === 'expect').realtime).toBe('redis');
    const back = planFor('rollback', options('rollback'), filesOf());
    expect(
      back.filter((s) => s.kind === 'add').every((s) => s.source.literal === 'blob' && s.force),
    ).toBe(true);
    expect(back.find((s) => s.kind === 'expect').realtime).toBe('blob');
  });

  it('status reports every expected name per environment and the files', () => {
    const steps = planFor('status', options('status'), filesOf());
    expect(steps.filter((s) => s.kind === 'report').map((s) => s.names)).toEqual(
      [EXPECTED_NAMES, EXPECTED_NAMES].map((n) => [...n]),
    );
    expect(steps.filter((s) => s.kind === 'note').length).toBe(4);
  });
});

describe('execute', () => {
  const options = {
    subcommand: 'google',
    dryRun: false,
    scope: 'general-translation',
    project: 'turboslide-gt',
    environments: ['production'],
    configDir: '',
    adminEmails: null,
    force: false,
  };

  it('skips a present variable unless --force, and passes --force only then', () => {
    const files = {
      google: readSecretFile(join(config, FILES.google.name)),
      mail: readSecretFile(join(config, 'none')),
      auth: readSecretFile(join(config, 'none2')),
    };
    const calls = [];
    const lines = [];
    const vercel = (args, input) => {
      calls.push({ args, input });
      if (args[1] === 'ls')
        return {
          status: 0,
          stdout: JSON.stringify({ envs: [{ key: 'DATABASE_URL' }, { key: 'GOOGLE_CLIENT_ID' }] }),
          stderr: '',
        };
      return { status: 0, stdout: '', stderr: '' };
    };
    const code = execute(planFor('google', options, files), options, files, {
      out: (l) => lines.push(l),
      vercel,
      mint: () => 'x',
      writeFile: () => {},
      root: dir,
    });
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
    execute(
      planFor('google', { ...options, force: true }, files),
      { ...options, force: true },
      files,
      {
        out: () => {},
        vercel: (args, input) => {
          forced.push(args);
          return vercel(args, input);
        },
        mint: () => 'x',
        writeFile: () => {},
        root: dir,
      },
    );
    expect(forced.find((a) => a[2] === 'GOOGLE_CLIENT_ID')).toContain('--force');
  });

  it('stops with exit 1 when a required name is absent and names the reason', () => {
    const files = {
      google: readSecretFile(join(config, FILES.google.name)),
      mail: readSecretFile(join(config, 'none')),
      auth: readSecretFile(join(config, 'none2')),
    };
    const lines = [];
    const code = execute(
      planFor('redis', { ...options, subcommand: 'redis' }, files),
      { ...options, subcommand: 'redis' },
      files,
      {
        out: (l) => lines.push(l),
        vercel: () => ({ status: 0, stdout: JSON.stringify({ envs: [] }), stderr: '' }),
        mint: () => 'x',
        writeFile: () => {},
        root: dir,
      },
    );
    expect(code).toBe(1);
    expect(lines.at(-1)).toContain('REDIS_URL absent');
    expect(lines.at(-1)).toContain('Kevin installs');
  });

  it('mints into the auth file once per environment, 600, and the expectation file follows flip and rollback', () => {
    const authPath = join(config, FILES.auth.name);
    const files = {
      google: readSecretFile(join(config, 'none')),
      mail: readSecretFile(join(config, 'none2')),
      auth: readSecretFile(authPath),
    };
    const written = [];
    const minted = ['a'.repeat(64), 'b'.repeat(64)];
    const vercel = (args) =>
      args[1] === 'ls'
        ? {
            status: 0,
            stdout: JSON.stringify({ envs: [{ key: 'DATABASE_URL' }, { key: 'REDIS_URL' }] }),
            stderr: '',
          }
        : { status: 0, stdout: '', stderr: '' };
    const o = {
      ...options,
      subcommand: 'database',
      environments: ['production', 'preview'],
      configDir: config,
    };
    const code = execute(planFor('database', o, files), o, files, {
      out: () => {},
      vercel,
      mint: () => minted.shift(),
      writeFile: (p, t) => {
        written.push(p);
        writeFileSync(p, t, { mode: 0o600 });
      },
      root: dir,
    });
    expect(code).toBe(0);
    expect(written).toEqual([authPath, authPath]);
    const text = readFileSync(authPath, 'utf8');
    expect(text).toBe(
      `BETTER_AUTH_SECRET_PRODUCTION=${'a'.repeat(64)}\nBETTER_AUTH_SECRET_PREVIEW=${'b'.repeat(64)}\n`,
    );
    mkdirSync(join(dir, 'scripts', 'hosting'), { recursive: true });
    const f = { ...options, subcommand: 'flip', environments: ['production'] };
    expect(
      execute(planFor('flip', f, files), f, files, {
        out: () => {},
        vercel,
        mint: () => 'x',
        writeFile: () => {},
        root: dir,
      }),
    ).toBe(0);
    expect(readExpectation(dir)).toBe('redis');
    const b = { ...options, subcommand: 'rollback', environments: ['production'] };
    expect(
      execute(planFor('rollback', b, files), b, files, {
        out: () => {},
        vercel,
        mint: () => 'x',
        writeFile: () => {},
        root: dir,
      }),
    ).toBe(0);
    expect(readExpectation(dir)).toBe('blob');
    expect(existsSync(join(dir, EXPECTATION_REL))).toBe(true);
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
    const r = runScript(['google'], ['DATABASE_URL']);
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

  it('refuses a real run from a root linked to another project and says so in a dry run', () => {
    writeFileSync(
      join(linked, '.vercel', 'project.json'),
      JSON.stringify({ projectName: 'turboslide' }),
    );
    const real = runScript(['google'], ['DATABASE_URL']);
    expect(real.status).toBe(2);
    expect(real.stdout).toContain('is turboslide, not turboslide-gt; refused');
    expect(calls()).toBe('');
    const dry = runScript(['google', '--dry-run']);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('a real run would refuse');
  });

  it('exits 1 when a Kevin step is absent and 2 on usage', () => {
    expect(runScript(['redis'], []).status).toBe(1);
    const usage = runScript(['nothing']);
    expect(usage.status).toBe(2);
    expect(usage.stderr).toContain('unknown subcommand');
  });

  it('status lists the files with their modes and keys and the expectation', () => {
    const r = runScript(['status'], ['TURBOSLIDE_REALTIME']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('production: REDIS_URL absent');
    expect(r.stdout).toContain('TURBOSLIDE_REALTIME present');
    expect(r.stdout).toContain(
      'google-oauth.env: mode 600, keys GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET',
    );
    expect(r.stdout).toContain('mail.env: absent');
    expect(r.stdout).toContain(`${EXPECTATION_REL}: realtime blob`);
  });
});

describe('run', () => {
  it('reads the files once and hands execute the plan', () => {
    const lines = [];
    const code = run(
      {
        subcommand: 'mail',
        dryRun: true,
        scope: 's',
        project: 'turboslide-gt',
        cwd: linked,
        environments: ['production'],
        configDir: config,
        adminEmails: null,
        force: false,
      },
      {
        out: (l) => lines.push(l),
        vercel: () => {
          throw new Error('never');
        },
        mint: () => 'x',
        writeFile: () => {},
        root: dir,
      },
    );
    expect(code).toBe(0);
    expect(lines[0]).toContain(
      'realtime-env mail --dry-run (project turboslide-gt, scope s, environments production',
    );
    expect(lines[1]).toContain('mail.env is absent: TURBOSLIDE_MAIL stays off');
  });
});
