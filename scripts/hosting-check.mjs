#!/usr/bin/env node
// The read only acceptance checks of the hosting move (docs/HOSTING-MOVE.md section 10 item 3 and
// the redirect half of section 7's acceptance), in one command that prints a table and exits 1 on
// a failed or undriven row:
//
//   node scripts/hosting-check.mjs [--from https://turboslide.vercel.app]
//     [--to https://turboslide-general-translation.vercel.app] [--path '/edit/abc?x=1']
//     [--parked docs/gslides-parity/focus/ship-<commit>.json] [--no-inspect]
//     [--inspect-json <file>] [--json <out>] [--timeout <ms>] [--scope <team>]
//
// The rows: a HEAD and a GET of `<from><path>` answer 308 with `location: <to><path>` (the path
// and the query kept; `curl -sI` in section 7); a POST to `<from>/api/actions/deck.info` answers
// 308 to the same path on `<to>` (the method survives a 308); the POST followed once by hand to
// that location, without a bearer, answers the team host's 401 (the function answered the POST;
// the bearer rule holds); `vercel inspect <from> --json` lists no function (no `lambda` or `edge`
// output; `--inspect-json <file>` reads a saved answer instead, `--no-inspect` skips the row by
// request). The smoke and the gate against `<to>` (section 10 items 1 and 2) write scratch decks,
// so this script never runs them: it prints their exact commands, and the authenticated POST
// through the redirect (`turboslide share get <id> --to <from>`, the key read from hosts.json by
// the CLI) the same way. Nothing here creates, changes or deletes anything on Vercel; no token,
// cookie or header value is printed or written. A preview `<to>` behind Vercel Authentication is
// reached with VERCEL_OIDC_TOKEN from the environment as `x-vercel-trusted-oidc-idp-token`, the
// way scripts/hosted-smoke.mjs does; the `<from>` redirect needs none.
//
// Before the cutover the redirect rows read what production answers today (a 404 or a 200 from the
// function, a 401 from the POST) and fail by name: a row this script could not drive (no `vercel`
// on the machine, a network error) is "not driven" with its reason and is never counted as passed.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_FROM = 'https://turboslide.vercel.app';
/** The default address of docs/HOSTING-MOVE.md 2.3; the ship note replaces it with the alias the project receives. */
export const DEFAULT_TO = 'https://turboslide-general-translation.vercel.app';
export const DEFAULT_PATH = '/edit/abc?x=1';
export const POST_PATH = '/api/actions/deck.info';
/** The output types `vercel inspect --json` lists for code that runs on a request. */
const FUNCTION_TYPES = new Set(['lambda', 'edge']);

const USAGE =
  "usage: node scripts/hosting-check.mjs [--from <origin>] [--to <origin>] [--path '/edit/abc?x=1'] [--parked <ship json>] [--no-inspect] [--inspect-json <file>] [--json <out>] [--timeout <ms>] [--scope <team>]";

/** Trims the trailing slash of an origin so `<origin><path>` reads as one address. */
function origin(value) {
  return String(value).replace(/\/+$/, '');
}

export function parseArgs(argv) {
  const out = {
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
    path: DEFAULT_PATH,
    parked: null,
    inspect: true,
    inspectJson: null,
    json: null,
    timeoutMs: 30_000,
    scope: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--from') out.from = origin(argv[++i] ?? out.from);
    else if (arg === '--to') out.to = origin(argv[++i] ?? out.to);
    else if (arg === '--path') {
      const value = argv[++i] ?? out.path;
      out.path = value.startsWith('/') ? value : `/${value}`;
    } else if (arg === '--parked') out.parked = argv[++i] ?? null;
    else if (arg === '--no-inspect') out.inspect = false;
    else if (arg === '--inspect-json') out.inspectJson = argv[++i] ?? null;
    else if (arg === '--json') out.json = argv[++i] ?? null;
    else if (arg === '--timeout') out.timeoutMs = Number(argv[++i] ?? out.timeoutMs);
    else if (arg === '--scope') out.scope = argv[++i] ?? null;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new RangeError(`unknown argument ${arg}\n${USAGE}`);
  }
  return out;
}

/** The location a 308 must carry: the team origin with the path and the query kept. */
export function expectedLocation(to, path) {
  return `${origin(to)}${path}`;
}

/**
 * Judges one answer of the personal address: a 308 whose `location` is the expected address, read
 * as a URL so a trailing slash or an encoded query reads equal. A 307 is named (the WAF rule of
 * section 5 step 7 answers 307 and is not the static deployment); a relative location is the same
 * host and fails; a missing location fails.
 */
export function judgeRedirect(answer, { to, path }) {
  const expected = expectedLocation(to, path);
  if (answer.status !== 308) {
    const note =
      answer.status === 307
        ? ' (a 307 is the WAF rule or the app, not the static 308 deployment)'
        : '';
    return { ok: false, expected, reason: `status ${answer.status}${note}` };
  }
  if (typeof answer.location !== 'string' || answer.location === '') {
    return { ok: false, expected, reason: '308 without a location header' };
  }
  let got;
  try {
    got = new URL(answer.location, expected);
  } catch {
    return { ok: false, expected, reason: `location ${answer.location} is not an address` };
  }
  if (!/^https?:\/\//.test(answer.location)) {
    return { ok: false, expected, reason: `location ${answer.location} is relative (same host)` };
  }
  const want = new URL(expected);
  if (got.origin !== want.origin) {
    return { ok: false, expected, reason: `location ${answer.location} is on ${got.origin}` };
  }
  if (got.pathname !== want.pathname) {
    return { ok: false, expected, reason: `location ${answer.location} drops the path` };
  }
  if (got.search !== want.search) {
    return { ok: false, expected, reason: `location ${answer.location} drops the query` };
  }
  return { ok: true, expected, reason: `308 to ${answer.location}` };
}

/** The function outputs of a `vercel inspect --json` answer: every `lambda` or `edge` output path. */
export function functionsOfInspect(json) {
  const builds = Array.isArray(json?.builds) ? json.builds : [];
  const out = [];
  for (const build of builds) {
    for (const output of Array.isArray(build?.output) ? build.output : []) {
      if (FUNCTION_TYPES.has(output?.type)) out.push(String(output.path ?? ''));
    }
  }
  return out;
}

/** The function rows of the text form of `vercel inspect` (each `λ <name> (<size>) [<region>]`). */
export function functionsOfInspectText(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = /λ\s+(\S+)/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/** The hosted smoke of section 10 item 1, as the command to run (it writes one deck with --template-copy). */
export function smokeCommand(to) {
  return `node scripts/hosted-smoke.mjs ${origin(to)} --token-env TURBOSLIDE_TOKEN --template-copy`;
}

/** The core gate of section 10 item 2, as the command to run (it writes scratch decks and removes them). */
export function gateCommand(to, parked) {
  return `node scripts/probes/core-gate.mjs --base ${origin(to)} --parked ${parked ?? 'docs/gslides-parity/focus/ship-<commit>.json'}`;
}

/**
 * The authenticated call through the redirect (section 7's acceptance), as the commands Kevin runs:
 * `share get` is a read of the access record over `POST /api/actions/share.get` with the bearer of
 * the host entry in ~/.config/turboslide/hosts.json (the CLI reads it; nothing here does). Through
 * the 308 the bearer is stripped and the team host answers 401; against the team host with the new
 * entry it answers 200.
 */
export function authenticatedPostCommand(from, to) {
  return `turboslide share get gt-brand --to ${origin(from)}  # 401 through the 308 (the bearer does not survive); then: turboslide share get gt-brand --to ${origin(to)}  # 200 after turboslide login --to ${origin(to)}`;
}

/** Every driven row passed and no row was left undriven. */
export function verdictOf(rows) {
  const counted = rows.filter((row) => !row.skipped);
  const failed = counted.filter((row) => row.driven && !row.ok).length;
  const undriven = counted.filter((row) => !row.driven).length;
  const passed = counted.filter((row) => row.driven && row.ok).length;
  return { passed, failed, undriven, total: counted.length, ok: failed === 0 && undriven === 0 };
}

function protectionHeaders(url, to) {
  const token = process.env.VERCEL_OIDC_TOKEN;
  return token && url.startsWith(origin(to)) ? { 'x-vercel-trusted-oidc-idp-token': token } : {};
}

async function request(url, init, timeoutMs, to) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), ...protectionHeaders(url, to) },
      redirect: 'manual',
      signal: controller.signal,
    });
    await response.arrayBuffer().catch(() => undefined);
    return {
      status: response.status,
      location: response.headers.get('location'),
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      status: 0,
      location: null,
      ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function redirectRow(name, method, path, args, body) {
  const url = `${args.from}${path}`;
  const init =
    body === undefined
      ? { method }
      : { method, headers: { 'content-type': 'application/json' }, body };
  const answer = await request(url, init, args.timeoutMs, args.to);
  if (answer.error !== undefined) {
    return {
      name,
      expect: `308 to ${expectedLocation(args.to, path)}`,
      driven: false,
      ok: false,
      reason: answer.error,
      ms: answer.ms,
      status: 0,
    };
  }
  const judged = judgeRedirect(answer, { to: args.to, path });
  return {
    name,
    expect: `308 to ${judged.expected}`,
    driven: true,
    ok: judged.ok,
    reason: judged.reason,
    status: answer.status,
    location: answer.location,
    ms: answer.ms,
  };
}

async function followedPostRow(postRow, args) {
  const name = 'post through the redirect';
  const expect = '401 from the team host without a bearer';
  if (
    !postRow.driven ||
    typeof postRow.location !== 'string' ||
    !/^https?:\/\//.test(postRow.location)
  ) {
    return {
      name,
      expect,
      driven: false,
      ok: false,
      skipped: true,
      reason: 'no absolute location to follow',
      status: 0,
      ms: 0,
    };
  }
  const answer = await request(
    postRow.location,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    args.timeoutMs,
    args.to,
  );
  if (answer.error !== undefined) {
    return {
      name,
      expect,
      driven: false,
      ok: false,
      reason: answer.error,
      status: 0,
      ms: answer.ms,
    };
  }
  return {
    name,
    expect,
    driven: true,
    ok: answer.status === 401,
    reason: `status ${answer.status} from ${new URL(postRow.location).origin}`,
    status: answer.status,
    ms: answer.ms,
  };
}

function inspectRow(args) {
  const name = 'inspect';
  const expect = 'no function in the deployment';
  if (!args.inspect)
    return {
      name,
      expect,
      driven: false,
      ok: false,
      skipped: true,
      reason: 'skipped by --no-inspect',
      status: '-',
      ms: 0,
    };
  let json;
  const started = performance.now();
  if (args.inspectJson !== null) {
    try {
      json = JSON.parse(readFileSync(resolve(ROOT, args.inspectJson), 'utf8'));
    } catch (error) {
      return {
        name,
        expect,
        driven: false,
        ok: false,
        reason: `could not read ${args.inspectJson}: ${error instanceof Error ? error.message : String(error)}`,
        status: '-',
        ms: 0,
      };
    }
  } else {
    const cli = spawnSync(
      'vercel',
      ['inspect', args.from, '--json', ...(args.scope ? ['--scope', args.scope] : [])],
      { encoding: 'utf8', timeout: args.timeoutMs },
    );
    if (cli.error) {
      return {
        name,
        expect,
        driven: false,
        ok: false,
        reason: `vercel did not run: ${cli.error.message}`,
        status: '-',
        ms: Math.round(performance.now() - started),
      };
    }
    if (cli.status !== 0) {
      const line =
        (cli.stderr || cli.stdout || '').split('\n').find((l) => /error/i.test(l)) ??
        `exit ${cli.status}`;
      return {
        name,
        expect,
        driven: false,
        ok: false,
        reason: `vercel inspect failed: ${line.trim()}`,
        status: '-',
        ms: Math.round(performance.now() - started),
      };
    }
    try {
      json = JSON.parse(cli.stdout);
    } catch {
      // an older CLI prints the text form; read the λ rows from it
      const names = functionsOfInspectText(cli.stdout);
      return {
        name,
        expect,
        driven: true,
        ok: names.length === 0,
        reason: names.length === 0 ? 'no λ row' : `${names.length} λ row(s): ${names.join(', ')}`,
        functions: names,
        status: '-',
        ms: Math.round(performance.now() - started),
      };
    }
  }
  const names = functionsOfInspect(json);
  const state = typeof json?.readyState === 'string' ? `${json.readyState}, ` : '';
  return {
    name,
    expect,
    driven: true,
    ok: names.length === 0,
    reason:
      names.length === 0
        ? `${state}no function output`
        : `${state}${names.length} function(s): ${names.join(', ')}`,
    functions: names,
    deployment: typeof json?.url === 'string' ? json.url : undefined,
    status: '-',
    ms: Math.round(performance.now() - started),
  };
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  const rows = [];
  rows.push(await redirectRow('redirect head', 'HEAD', args.path, args));
  rows.push(await redirectRow('redirect get', 'GET', args.path, args));
  const post = await redirectRow('redirect post', 'POST', POST_PATH, args, '{}');
  rows.push(post);
  rows.push(await followedPostRow(post, args));
  rows.push(inspectRow(args));
  const commands = {
    smoke: smokeCommand(args.to),
    gate: gateCommand(args.to, args.parked),
    authenticatedPost: authenticatedPostCommand(args.from, args.to),
  };
  const width = Math.max(...rows.map((row) => row.name.length), 4);
  console.log(`${pad('row', width)}  status  ms     result      detail`);
  for (const row of rows) {
    const result = row.skipped ? 'skip' : row.driven ? (row.ok ? 'pass' : 'FAIL') : 'not driven';
    const detail = row.ok ? row.reason : `expected ${row.expect}; ${row.reason}`;
    console.log(
      `${pad(row.name, width)}  ${pad(row.status ?? '-', 6)}  ${pad(row.ms ?? 0, 5)}  ${pad(result, 10)}  ${detail}`,
    );
  }
  const verdict = verdictOf(rows);
  console.log(
    `${verdict.passed}/${verdict.total} passed against ${args.from} (${verdict.failed} failed, ${verdict.undriven} not driven); the redirect's destination is ${args.to}`,
  );
  console.log(
    'next, by hand (they write scratch decks or read the CLI token; never run from here):',
  );
  console.log(`  ${commands.smoke}`);
  console.log(`  ${commands.gate}`);
  console.log(`  ${commands.authenticatedPost}`);
  if (args.json !== null) {
    const out = {
      checkedAt: new Date().toISOString(),
      from: args.from,
      to: args.to,
      path: args.path,
      rows,
      commands,
      verdict,
    };
    writeFileSync(resolve(ROOT, args.json), `${JSON.stringify(out, null, 2)}\n`);
  }
  process.exit(verdict.ok ? 0 : 1);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
