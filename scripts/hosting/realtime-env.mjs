#!/usr/bin/env node
// The production variables of the realtime round (docs/REALTIME.md 3.7, 3.8 and 4.5), set in
// the order of 4.5 as subcommands, each reading its values from a 600 file under
// ~/.config/turboslide/ and setting them with `vercel env add <NAME> <environment> --sensitive`
// with the value on stdin. Nothing here prints a value: the output names variables and
// environments, and the Vercel CLI's own output is scrubbed of every value it was given before a
// line of it is shown. `--dry-run` prints what the command would read, mint, set and remove and
// never runs `vercel` (the realtime round runs the dry run alone; an env command on a Vercel
// project is Kevin's step, REALTIME.md 4.5).
//
//   node scripts/hosting/realtime-env.mjs <subcommand> [--dry-run] [--scope <team>]
//     [--project <name>] [--cwd <linked root>] [--environments production,preview]
//     [--config-dir <dir>] [--admin-emails <a,b>] [--force]
//
//   status     the expected names per environment (present or absent), the 600 files and their
//              keys, the tree's tier expectation; sets nothing
//   redis      4.5 step 1: requires REDIS_URL on every environment (Kevin's Upstash install);
//              sets nothing
//   database   4.5 step 2: requires DATABASE_URL (Kevin's Neon install); mints BETTER_AUTH_SECRET
//              per environment into better-auth.env with `openssl rand -hex 32` when absent and
//              sets it
//   google     4.5 step 4: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from google-oauth.env, and
//              TURBOSLIDE_ADMIN_EMAILS, on every environment
//   mail       4.5 step 5: with mail.env (RESEND_API_KEY, TURBOSLIDE_MAIL_FROM) sets both, removes
//              the forced TURBOSLIDE_MAIL on production and sets TURBOSLIDE_MAIL=capture on preview;
//              without the file TURBOSLIDE_MAIL stays off (REALTIME.md 7.7) and nothing is set
//   flip       4.5 step 7 and 3.7: requires REDIS_URL, removes the forced TURBOSLIDE_REALTIME row
//              (so `REDIS_URL` selects redis, select.ts 79; default 7.9) and writes the tree's
//              expectation scripts/hosting/production.json to redis for the guard
//   rollback   3.8: sets TURBOSLIDE_REALTIME=blob (--force) and writes the expectation to blob
//
// Rules. The linked project of `--cwd` (its .vercel/project.json) must be `--project`
// (turboslide-gt by default), else a real run refuses; a dry run says so and goes on. A 600 file
// is read only when its mode lets nobody else read it ((mode & 0o077) is zero); a looser mode is
// refused with the chmod to run. A variable already present on an environment is skipped unless
// `--force` (rotation is docs/security.md section 9's runbook). Exit 0 when done or nothing to
// do, 1 when a precondition is absent (a Kevin step named in the output), 2 on usage or a refusal.
// Node only; no dependency. Tested by realtime-env.test.mjs against a fake `vercel` on PATH.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** The repository root of this script's tree: the expectation file is written there. */
export const ROOT = resolve(here, '..', '..');
/** The tree's expectation of production's realtime tier, read by the guard before a production deploy. */
export const EXPECTATION_REL = 'scripts/hosting/production.json';

export const SUBCOMMANDS = Object.freeze([
  'status',
  'redis',
  'database',
  'google',
  'mail',
  'flip',
  'rollback',
]);
export const ENVIRONMENTS = Object.freeze(['production', 'preview']);
export const DEFAULT_PROJECT = 'turboslide-gt';
export const DEFAULT_SCOPE = 'general-translation';
export const DEFAULT_ADMIN_EMAILS = 'kevin@generaltranslation.com';
export const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'turboslide');

/** The 600 files under the config folder and the keys each may carry. */
export const FILES = Object.freeze({
  google: {
    name: 'google-oauth.env',
    keys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TURBOSLIDE_ADMIN_EMAILS'],
  },
  mail: { name: 'mail.env', keys: ['RESEND_API_KEY', 'TURBOSLIDE_MAIL_FROM'] },
  auth: {
    name: 'better-auth.env',
    keys: ['BETTER_AUTH_SECRET_PRODUCTION', 'BETTER_AUTH_SECRET_PREVIEW'],
  },
});

/** The names `status` reports per environment, in the order of REALTIME.md 4.5. */
export const EXPECTED_NAMES = Object.freeze([
  'REDIS_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'TURBOSLIDE_ADMIN_EMAILS',
  'RESEND_API_KEY',
  'TURBOSLIDE_MAIL_FROM',
  'TURBOSLIDE_MAIL',
  'TURBOSLIDE_REALTIME',
]);

const USAGE = `usage: node scripts/hosting/realtime-env.mjs <${SUBCOMMANDS.join('|')}> [--dry-run] [--scope <team>] [--project <name>] [--cwd <linked root>] [--environments production,preview] [--config-dir <dir>] [--admin-emails <a,b>] [--force]`;

export class UsageError extends Error {}

export function parseArgs(argv) {
  const out = {
    subcommand: null,
    dryRun: false,
    scope: DEFAULT_SCOPE,
    project: DEFAULT_PROJECT,
    cwd: process.cwd(),
    environments: [...ENVIRONMENTS],
    configDir: DEFAULT_CONFIG_DIR,
    adminEmails: null,
    force: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${arg} wants a value\n${USAGE}`);
      return v;
    };
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--force') out.force = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--scope') out.scope = value();
    else if (arg === '--project') out.project = value();
    else if (arg === '--cwd') out.cwd = resolve(value());
    else if (arg === '--config-dir') out.configDir = resolve(value());
    else if (arg === '--admin-emails') out.adminEmails = value();
    else if (arg === '--environments') {
      out.environments = value()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const e of out.environments)
        if (!ENVIRONMENTS.includes(e))
          throw new UsageError(`unknown environment ${e}; one of ${ENVIRONMENTS.join(', ')}`);
      if (out.environments.length === 0) throw new UsageError(`--environments wants a list`);
    } else if (arg.startsWith('-')) throw new UsageError(`unknown argument ${arg}\n${USAGE}`);
    else if (out.subcommand === null) {
      if (!SUBCOMMANDS.includes(arg)) throw new UsageError(`unknown subcommand ${arg}\n${USAGE}`);
      out.subcommand = arg;
    } else throw new UsageError(`one subcommand at a time\n${USAGE}`);
  }
  if (!out.help && out.subcommand === null) throw new UsageError(USAGE);
  return out;
}

// ---------------------------------------------------------------------------------------------
// the 600 files

/** `KEY=value` lines; `#` comments and blank lines skipped; one layer of quotes removed. */
export function parseEnvFile(text) {
  const out = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    )
      value = value.slice(1, -1);
    if (value !== '') out.set(m[1], value);
  }
  return out;
}

/** True when the mode lets neither the group nor others read the file (600 or stricter). */
export function isPrivateMode(mode) {
  return (mode & 0o077) === 0;
}

/**
 * Reads one config file: `{ path, exists, mode, private, keys, values }`. The values stay in the
 * map for the caller's stdin and are never written to the output; a file whose mode is not
 * private is reported with `private: false` and its values are not read.
 */
export function readSecretFile(path) {
  if (!existsSync(path))
    return { path, exists: false, mode: null, private: false, keys: [], values: new Map() };
  const mode = statSync(path).mode & 0o777;
  if (!isPrivateMode(mode))
    return { path, exists: true, mode, private: false, keys: [], values: new Map() };
  const values = parseEnvFile(readFileSync(path, 'utf8'));
  return { path, exists: true, mode, private: true, keys: [...values.keys()], values };
}

function octal(mode) {
  return mode === null ? 'absent' : mode.toString(8).padStart(3, '0');
}

/** The linked project name of a repository root, from .vercel/project.json; null when unlinked. */
export function linkedProject(cwd) {
  try {
    const j = JSON.parse(readFileSync(join(cwd, '.vercel', 'project.json'), 'utf8'));
    return typeof j.projectName === 'string' ? j.projectName : null;
  } catch {
    return null;
  }
}

/** The variable names of `vercel env ls <environment> --json`: the `key` of every row, no value. */
export function namesFromEnvLs(text) {
  const j = JSON.parse(text);
  const rows = Array.isArray(j) ? j : Array.isArray(j?.envs) ? j.envs : null;
  if (rows === null) throw new TypeError('vercel env ls --json answered no envs list');
  const names = new Set();
  for (const r of rows) if (r && typeof r.key === 'string') names.add(r.key);
  return names;
}

/** Replaces every secret value in a line with `<value>` and drops anything that reads as a token. */
export function scrub(text, values) {
  let out = String(text);
  for (const v of values)
    if (typeof v === 'string' && v.length >= 4) out = out.split(v).join('<value>');
  return out.replace(/eyJ[A-Za-z0-9_-]{20,}/g, '<jwt>');
}

/** The tree's expectation file: `{ realtime: 'blob' | 'redis' }`; absent reads as blob. */
export function readExpectation(root = ROOT) {
  try {
    const j = JSON.parse(readFileSync(join(root, EXPECTATION_REL), 'utf8'));
    return j.realtime === 'redis' ? 'redis' : 'blob';
  } catch {
    return 'blob';
  }
}

export function writeExpectation(realtime, root = ROOT) {
  const path = join(root, EXPECTATION_REL);
  const current = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const next = { ...current, realtime };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return path;
}

// ---------------------------------------------------------------------------------------------
// the plan: one list of steps per subcommand, executed or printed

const step = (kind, fields) => ({ kind, ...fields });

/**
 * The steps of a subcommand. `files` is `{ google, mail, auth }` as `readSecretFile` returns them.
 * Step kinds: `report` (names per environment), `require` (names that must be present, else
 * stop with exit 1), `mint` (a key into better-auth.env), `add` (vercel env add; `source` names
 * the file and key or the literal's name, never the value; `when: 'absent'` skips a present
 * variable unless `force`), `rm` (vercel env rm when present), `expect` (the expectation file),
 * `note` (a sentence), `stop` (end with an exit code).
 */
export function planFor(sub, options, files) {
  const envs = options.environments;
  const steps = [];
  const google = files.google;
  const mail = files.mail;
  const auth = files.auth;
  switch (sub) {
    case 'status': {
      for (const e of envs)
        steps.push(step('report', { environment: e, names: [...EXPECTED_NAMES] }));
      for (const [key, spec] of Object.entries(FILES)) {
        const f = files[key];
        steps.push(
          step('note', {
            text: `${spec.name}: ${f.exists ? `mode ${octal(f.mode)}${f.private ? '' : ' (not private; chmod 600 and run again)'}, keys ${f.keys.length ? f.keys.join(', ') : 'none'}` : 'absent'}`,
          }),
        );
      }
      steps.push(
        step('note', {
          text: `${EXPECTATION_REL}: realtime ${readExpectation(options.root ?? ROOT)}`,
        }),
      );
      break;
    }
    case 'redis': {
      for (const e of envs)
        steps.push(
          step('require', {
            environment: e,
            names: ['REDIS_URL'],
            reason:
              'Kevin installs Upstash Redis from the Storage tab of turboslide-gt, Fixed 250 MB, us-east-1, connected to production and preview (REALTIME.md 4.5 step 1); the pipeline sets nothing for this step',
          }),
        );
      for (const e of envs)
        steps.push(
          step('report', {
            environment: e,
            names: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
          }),
        );
      steps.push(
        step('note', {
          text: 'nothing to set: the deployment stays on the blob tier while TURBOSLIDE_REALTIME is forced; `flip` removes the row after the redis preview gate (REALTIME.md 3.7, 5.4)',
        }),
      );
      break;
    }
    case 'database': {
      for (const e of envs)
        steps.push(
          step('require', {
            environment: e,
            names: ['DATABASE_URL'],
            reason:
              'Kevin installs Neon Postgres from the Storage tab of turboslide-gt, Free, us-east-1, connected to production and preview (REALTIME.md 4.5 step 2)',
          }),
        );
      for (const e of envs) {
        const key = `BETTER_AUTH_SECRET_${e.toUpperCase()}`;
        steps.push(
          step('mint', { file: 'auth', key, when: auth.values.has(key) ? 'present' : 'absent' }),
        );
        steps.push(
          step('add', {
            name: 'BETTER_AUTH_SECRET',
            environment: e,
            source: { file: 'auth', key },
            when: 'absent',
          }),
        );
      }
      break;
    }
    case 'google': {
      if (
        !google.exists ||
        !google.private ||
        !google.values.has('GOOGLE_CLIENT_ID') ||
        !google.values.has('GOOGLE_CLIENT_SECRET')
      ) {
        steps.push(
          step('stop', {
            exit: 1,
            text: `${FILES.google.name} ${google.exists ? (google.private ? 'lacks GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET' : `has mode ${octal(google.mode)}; chmod 600 it`) : 'is absent'}: Kevin creates the Google Cloud project Turboslide and the Web application client (REALTIME.md 4.5 step 3) and writes the two values into the file (design-google-login.md section 8 line 6)`,
          }),
        );
        break;
      }
      for (const e of envs)
        steps.push(
          step('require', {
            environment: e,
            names: ['DATABASE_URL'],
            reason:
              'the Google button needs a database (better-auth.ts signInMethods); run `database` first (REALTIME.md 4.5 step 2)',
          }),
        );
      const adminEmails =
        options.adminEmails ?? google.values.get('TURBOSLIDE_ADMIN_EMAILS') ?? DEFAULT_ADMIN_EMAILS;
      for (const e of envs) {
        steps.push(
          step('add', {
            name: 'GOOGLE_CLIENT_ID',
            environment: e,
            source: { file: 'google', key: 'GOOGLE_CLIENT_ID' },
            when: 'absent',
          }),
        );
        steps.push(
          step('add', {
            name: 'GOOGLE_CLIENT_SECRET',
            environment: e,
            source: { file: 'google', key: 'GOOGLE_CLIENT_SECRET' },
            when: 'absent',
          }),
        );
        steps.push(
          step('add', {
            name: 'TURBOSLIDE_ADMIN_EMAILS',
            environment: e,
            source: {
              literal: adminEmails,
              label: options.adminEmails
                ? '--admin-emails'
                : google.values.has('TURBOSLIDE_ADMIN_EMAILS')
                  ? `${FILES.google.name} TURBOSLIDE_ADMIN_EMAILS`
                  : 'the default of REALTIME.md 4.5 step 4',
            },
            when: 'absent',
          }),
        );
      }
      break;
    }
    case 'mail': {
      if (!mail.exists) {
        steps.push(
          step('note', {
            text: `${FILES.mail.name} is absent: TURBOSLIDE_MAIL stays off and Google may be the only method (REALTIME.md 4.5 step 5, default 7.7); nothing set`,
          }),
        );
        break;
      }
      if (
        !mail.private ||
        !mail.values.has('RESEND_API_KEY') ||
        !mail.values.has('TURBOSLIDE_MAIL_FROM')
      ) {
        steps.push(
          step('stop', {
            exit: 1,
            text: `${FILES.mail.name} ${mail.private ? 'lacks RESEND_API_KEY or TURBOSLIDE_MAIL_FROM' : `has mode ${octal(mail.mode)}; chmod 600 it`}: Kevin provides Resend's key and a sending address on turboslide.com (REALTIME.md 4.5 step 5)`,
          }),
        );
        break;
      }
      for (const e of envs) {
        steps.push(
          step('add', {
            name: 'RESEND_API_KEY',
            environment: e,
            source: { file: 'mail', key: 'RESEND_API_KEY' },
            when: 'absent',
          }),
        );
        steps.push(
          step('add', {
            name: 'TURBOSLIDE_MAIL_FROM',
            environment: e,
            source: { file: 'mail', key: 'TURBOSLIDE_MAIL_FROM' },
            when: 'absent',
          }),
        );
        if (e === 'production')
          steps.push(
            step('rm', {
              name: 'TURBOSLIDE_MAIL',
              environment: e,
              reason:
                'with no forced value the Resend pair selects resend (auth/mail/mailer.ts selectMail)',
            }),
          );
        else
          steps.push(
            step('add', {
              name: 'TURBOSLIDE_MAIL',
              environment: e,
              source: { literal: 'capture', label: 'the literal capture' },
              when: 'always',
              force: true,
              reason:
                'a preview writes outgoing mail to the capture list (docs/hosting.md section 11)',
            }),
          );
      }
      break;
    }
    case 'flip': {
      for (const e of envs)
        steps.push(
          step('require', {
            environment: e,
            names: ['REDIS_URL'],
            reason:
              'a removal without REDIS_URL would select blob on its own and the tree would expect redis (REALTIME.md 3.7); REDIS_URL comes from the Upstash install (4.5 step 1)',
          }),
        );
      for (const e of envs)
        steps.push(
          step('rm', {
            name: 'TURBOSLIDE_REALTIME',
            environment: e,
            reason: 'REDIS_URL then selects redis at the next deploy (select.ts 79; default 7.9)',
          }),
        );
      steps.push(step('expect', { realtime: 'redis' }));
      steps.push(
        step('note', {
          text: `commit ${EXPECTATION_REL} with the push that follows; the next main deploy through the guard selects redis and every open tab reloads once (REALTIME.md 3.7); Instant Rollback lands on the previous production deployment, built with the forced blob row`,
        }),
      );
      break;
    }
    case 'rollback': {
      for (const e of envs)
        steps.push(
          step('add', {
            name: 'TURBOSLIDE_REALTIME',
            environment: e,
            source: { literal: 'blob', label: 'the literal blob' },
            when: 'always',
            force: true,
            reason: 'the rollback switch of REALTIME.md 3.8',
          }),
        );
      steps.push(step('expect', { realtime: 'blob' }));
      steps.push(
        step('note', {
          text: `redeploy the environment (the guard's next pass, or \`vercel rollback --scope ${options.scope} --yes\` to the previous production deployment) and commit ${EXPECTATION_REL}; the runtime switch without a deploy is \`turboslide admin flag realtime off --to https://www.turboslide.com\`, read within 5 s on every instance (apps/studio/src/server/flags.ts FLAG_CACHE_MS)`,
        }),
      );
      break;
    }
    default:
      throw new UsageError(USAGE);
  }
  return steps;
}

// ---------------------------------------------------------------------------------------------
// running the plan

function describeAdd(s, dry) {
  const src = s.source.file
    ? `value from ${FILES[s.source.file].name} ${s.source.key} on stdin`
    : `value ${s.source.label}`;
  const guard =
    s.when === 'absent' ? (dry ? ' when absent on the environment; --force replaces' : '') : '';
  return `${s.name} ${s.environment} (sensitive, ${src})${guard}`;
}

/**
 * Runs or prints the steps. `io` carries `out(line)`, `vercel(args, input)` (spawnSync's result
 * shape: `{ status, stdout, stderr }`), `mint()` (the hex string of `openssl rand -hex 32`),
 * `writeFile(path, text)` and `root`. Returns the exit code.
 */
export function execute(steps, options, files, io) {
  const dry = options.dryRun;
  const secrets = new Set();
  for (const f of Object.values(files)) for (const v of f.values.values()) secrets.add(v);
  const say = (line) => io.out(scrub(line, secrets));
  const namesCache = new Map();
  const names = (environment) => {
    if (namesCache.has(environment)) return namesCache.get(environment);
    const r = io.vercel(['env', 'ls', environment, '--json', '--scope', options.scope], undefined);
    if (r.status !== 0)
      throw new Error(
        `vercel env ls ${environment} failed (exit ${r.status}): ${scrub(
          String(r.stderr ?? '')
            .trim()
            .split('\n')
            .pop() ?? '',
          secrets,
        )}`,
      );
    const set = namesFromEnvLs(r.stdout);
    namesCache.set(environment, set);
    return set;
  };
  const valueOf = (source) => {
    if (source.file) {
      const v = files[source.file].values.get(source.key);
      if (v === undefined) throw new Error(`${FILES[source.file].name} lacks ${source.key}`);
      return v;
    }
    return source.literal;
  };
  for (const s of steps) {
    switch (s.kind) {
      case 'report': {
        if (dry) {
          say(`would read vercel env ls ${s.environment} --json and report ${s.names.join(', ')}`);
          break;
        }
        const set = names(s.environment);
        say(
          `${s.environment}: ${s.names.map((n) => `${n} ${set.has(n) ? 'present' : 'absent'}`).join(', ')}`,
        );
        break;
      }
      case 'require': {
        if (dry) {
          say(`would require ${s.names.join(', ')} on ${s.environment} (${s.reason})`);
          break;
        }
        const set = names(s.environment);
        const missing = s.names.filter((n) => !set.has(n));
        if (missing.length > 0) {
          say(`${s.environment}: ${missing.join(', ')} absent; ${s.reason}`);
          return 1;
        }
        say(`${s.environment}: ${s.names.join(', ')} present`);
        break;
      }
      case 'mint': {
        const spec = FILES[s.file];
        const path = join(options.configDir, spec.name);
        if (s.when === 'present') {
          say(`${spec.name} ${s.key}: present`);
          break;
        }
        if (dry) {
          say(`would mint ${s.key} with openssl rand -hex 32 into ${path} (mode 600)`);
          break;
        }
        const f = files[s.file];
        if (f.exists && !f.private) {
          say(`${spec.name} has mode ${octal(f.mode)}; chmod 600 ${path} and run again`);
          return 2;
        }
        const value = io.mint();
        if (!/^[0-9a-f]{64}$/.test(value))
          throw new Error('openssl rand -hex 32 answered no 64 hex characters');
        const current = f.exists ? readFileSync(path, 'utf8') : '';
        io.writeFile(
          path,
          `${current}${current && !current.endsWith('\n') ? '\n' : ''}${s.key}=${value}\n`,
        );
        f.values.set(s.key, value);
        f.keys.push(s.key);
        f.exists = true;
        f.private = true;
        secrets.add(value);
        say(`minted ${s.key} into ${path} (mode 600)`);
        break;
      }
      case 'add': {
        if (dry) {
          say(`would set ${describeAdd(s, true)}`);
          break;
        }
        const set = names(s.environment);
        const present = set.has(s.name);
        if (s.when === 'absent' && present && !options.force) {
          say(`skip ${s.name} ${s.environment}: present (pass --force to replace)`);
          break;
        }
        const force = present && (s.force || options.force);
        const args = [
          'env',
          'add',
          s.name,
          s.environment,
          '--sensitive',
          '--yes',
          '--scope',
          options.scope,
        ];
        if (force) args.push('--force');
        const r = io.vercel(args, valueOf(s.source));
        if (r.status !== 0) {
          say(
            `vercel env add ${s.name} ${s.environment} failed (exit ${r.status}): ${
              String(r.stderr ?? '')
                .trim()
                .split('\n')
                .pop() ?? ''
            }`,
          );
          return 2;
        }
        set.add(s.name);
        say(`set ${describeAdd(s, false)}${force ? ', replaced' : ''}`);
        break;
      }
      case 'rm': {
        if (dry) {
          say(`would remove ${s.name} ${s.environment} when present (${s.reason})`);
          break;
        }
        const set = names(s.environment);
        if (!set.has(s.name)) {
          say(`${s.name} ${s.environment}: absent, nothing to remove`);
          break;
        }
        const r = io.vercel(
          ['env', 'rm', s.name, s.environment, '--yes', '--scope', options.scope],
          undefined,
        );
        if (r.status !== 0) {
          say(
            `vercel env rm ${s.name} ${s.environment} failed (exit ${r.status}): ${
              String(r.stderr ?? '')
                .trim()
                .split('\n')
                .pop() ?? ''
            }`,
          );
          return 2;
        }
        set.delete(s.name);
        say(`removed ${s.name} ${s.environment} (${s.reason})`);
        break;
      }
      case 'expect': {
        if (dry) {
          say(`would write ${EXPECTATION_REL} with realtime ${s.realtime}`);
          break;
        }
        const path = writeExpectation(s.realtime, io.root ?? ROOT);
        say(`wrote ${path}: realtime ${s.realtime}`);
        break;
      }
      case 'note':
        say(s.text);
        break;
      case 'stop':
        say(s.text);
        return s.exit;
      default:
        throw new Error(`unknown step ${s.kind}`);
    }
  }
  return 0;
}

/** The `vercel` call: the CLI on PATH, the value on stdin, VERCEL_OIDC_TOKEN out of the child's environment. */
export function spawnVercel(cwd) {
  return (args, input) => {
    const env = { ...process.env };
    delete env.VERCEL_OIDC_TOKEN;
    const r = spawnSync('vercel', args, { cwd, input, encoding: 'utf8', env });
    if (r.error) return { status: 127, stdout: '', stderr: r.error.message };
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
}

export function mintWithOpenssl() {
  const r = spawnSync('openssl', ['rand', '-hex', '32'], { encoding: 'utf8' });
  if (r.status !== 0)
    throw new Error(`openssl rand -hex 32 failed (exit ${r.status ?? r.error?.message})`);
  return r.stdout.trim();
}

function writePrivate(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Reads the three files, checks the link, builds the plan and runs or prints it; returns the exit code. */
export function run(options, io = {}) {
  const out = io.out ?? ((line) => console.log(line));
  const files = Object.fromEntries(
    Object.entries(FILES).map(([k, spec]) => [
      k,
      readSecretFile(join(options.configDir, spec.name)),
    ]),
  );
  const linked = linkedProject(options.cwd);
  out(
    `realtime-env ${options.subcommand}${options.dryRun ? ' --dry-run' : ''} (project ${options.project}, scope ${options.scope}, environments ${options.environments.join(', ')}, config ${options.configDir})`,
  );
  if (linked !== options.project) {
    const line = `the linked project of ${options.cwd} is ${linked ?? 'none (.vercel/project.json absent)'}, not ${options.project}`;
    if (!options.dryRun) {
      out(
        `${line}; refused. Run from a root linked to ${options.project}, or pass --project <name> on purpose`,
      );
      return 2;
    }
    out(`${line}; a real run would refuse`);
  }
  const steps = planFor(options.subcommand, options, files);
  return execute(steps, options, files, {
    out,
    vercel: io.vercel ?? spawnVercel(options.cwd),
    mint: io.mint ?? mintWithOpenssl,
    writeFile: io.writeFile ?? writePrivate,
    root: io.root ?? ROOT,
  });
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof UsageError ? error.message : String(error));
    process.exit(2);
  }
  if (options.help) {
    console.log(USAGE);
    process.exit(0);
  }
  try {
    process.exit(run(options));
  } catch (error) {
    console.error(`realtime-env: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}
