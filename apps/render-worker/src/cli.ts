// The worker drives the turboslide binary as a child process (SPEC 3.3 item 7: headless Chromium
// never runs inside the web app, and here not inside the worker process either, so a browser
// crash ends one job, not the queue). The binary is TURBOSLIDE_BIN, else apps/cli/bin/turboslide.mjs
// resolved through the @turboslide/cli workspace package, run by the current Node. `--json` output
// is the one machine result on stdout; human lines arrive on stderr and are forwarded to the job log.
//
// The in-process mode (docs/hosting-chromium.md, a recorded deviation from SPEC 3.3 item 7): inside
// a serverless function the bundle carries the CLI's code but not the @turboslide/cli package and
// its bin/turboslide.mjs, and a child process could not outlive the invocation anyway, so the same
// command runs through runCli() in this process with its two streams captured. The result shape is
// the one the spawn produces, so every job (render, sheet, export, verify, build) works in both
// modes without knowing which one ran. TURBOSLIDE_WORKER_EXEC=spawn|inprocess forces a mode; the
// default is in-process when the process runs inside a function (VERCEL, AWS_LAMBDA_FUNCTION_NAME)
// or when the CLI package cannot be resolved, and spawn otherwise.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type CliCommand = { command: string; args: string[] };

export type ExecMode = 'spawn' | 'inprocess';

/** True inside a Vercel function or a Lambda: the two markers the platforms set. */
export function isServerlessEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VERCEL) || Boolean(env.AWS_LAMBDA_FUNCTION_NAME);
}

/** The @turboslide/cli package.json path, or null when the package is not resolvable (a bundled function). */
export function cliPackagePath(): string | null {
  try {
    const path = fileURLToPath(import.meta.resolve('@turboslide/cli/package.json'));
    return existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

/** How runTurboslide runs a command: the environment's word, else in-process inside a function or without the CLI package, else spawn. */
export function execMode(env: NodeJS.ProcessEnv = process.env): ExecMode {
  const forced = env.TURBOSLIDE_WORKER_EXEC;
  if (forced === 'spawn' || forced === 'inprocess') return forced;
  if (env.TURBOSLIDE_BIN) return 'spawn';
  if (isServerlessEnv(env)) return 'inprocess';
  return cliPackagePath() ? 'spawn' : 'inprocess';
}

export function turboslideBin(env: NodeJS.ProcessEnv = process.env): CliCommand {
  if (env.TURBOSLIDE_BIN) return { command: env.TURBOSLIDE_BIN, args: [] };
  const pkgPath = fileURLToPath(import.meta.resolve('@turboslide/cli/package.json'));
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    bin?: Record<string, string> | string;
  };
  const bin = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin?.turboslide ?? 'bin/turboslide.mjs');
  return { command: process.execPath, args: [join(dirname(pkgPath), bin)] };
}

export type CliRun = {
  code: number;
  stdout: string;
  stderr: string;
  ms: number;
  args: string[];
  /** How the command ran (absent on records written before the in-process mode existed). */
  exec?: ExecMode;
};

export type CliRunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Default 15 minutes: an 85 slide export with verification. Spawn only; an in-process run has no kill, the platform's duration limit is the bound. */
  timeoutMs?: number;
  onStderrLine?: (line: string) => void;
  signal?: AbortSignal;
  /** Overrides execMode(env). */
  exec?: ExecMode;
};

/** Splits a stream's text into complete lines for the log, keeping the unfinished tail. */
function lineSplitter(onLine: (line: string) => void): {
  push: (text: string) => void;
  flush: () => void;
} {
  let pending = '';
  return {
    push(text) {
      pending += text;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) onLine(line);
    },
    flush() {
      if (pending.trim()) onLine(pending);
      pending = '';
    },
  };
}

/** Runs `turboslide <args>` as a child process and captures both streams; rejects only when the process cannot start. */
export function spawnTurboslide(args: string[], options: CliRunOptions = {}): Promise<CliRun> {
  const bin = turboslideBin(options.env);
  const t = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(bin.command, [...bin.args, ...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: options.signal,
    });
    let stdout = '';
    let stderr = '';
    const lines = lineSplitter((line) => options.onStderrLine?.(line));
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      if (options.onStderrLine) lines.push(text);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 900_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (options.onStderrLine) lines.flush();
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        ms: Math.round(performance.now() - t),
        args,
        exec: 'spawn',
      });
    });
  });
}

/**
 * Runs `turboslide <args>` through runCli() in this process. The CLI module is loaded on first use
 * rather than imported at the top: the studio's dev server optimizer crawls static imports of the
 * worker's modules (measured in the M5 integration, vite.config.ts), and the CLI graph carries the
 * MCP SDK and every command. A UsageError is exit 2, a gate failure exit 1, as from the binary.
 */
export async function runTurboslideInProcess(
  args: string[],
  options: CliRunOptions = {},
): Promise<CliRun> {
  const t = performance.now();
  const { runCli } = await import('@turboslide/cli/cli');
  let stdout = '';
  let stderr = '';
  const lines = lineSplitter((line) => options.onStderrLine?.(line));
  const code = await runCli(args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    streams: {
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
        if (options.onStderrLine) lines.push(text);
      },
    },
    stdin: async () => '',
  });
  if (options.onStderrLine) lines.flush();
  return { code, stdout, stderr, ms: Math.round(performance.now() - t), args, exec: 'inprocess' };
}

/** Runs `turboslide <args>` in the mode execMode() selects and captures both streams. */
export function runTurboslide(args: string[], options: CliRunOptions = {}): Promise<CliRun> {
  const mode = options.exec ?? execMode(options.env ?? process.env);
  return mode === 'inprocess'
    ? runTurboslideInProcess(args, options)
    : spawnTurboslide(args, options);
}

/** A Node stack frame on stderr: `    at fn (file:line:col)`, `at async file:///...:line:col`, `at new Promise (<anonymous>)`. */
const STACK_FRAME = /^\s*at (?:async )?(?:new )?\S.*(?::\d+:\d+\)?|\(<anonymous>\)|\(native\))$/;

/**
 * The stderr lines worth repeating in an error message, at most `limit` of them: the CLI's own
 * `turboslide: ...` line first (the first such line is its message, cli.ts runCli), then the
 * last lines that are neither empty nor stack frames. Frames are dropped before counting: under
 * TURBOSLIDE_DEBUG (or a binary from before the CLI printed messages only) the message line is
 * followed by its stack, and the last three lines of stderr were three frames with no cause in
 * them (measured on the first hosted export failures, docs/hosting-chromium.md).
 */
export function failureLines(stderr: string, limit = 3): string[] {
  const lines = stderr
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '' && !STACK_FRAME.test(line));
  const message = lines.find((line) => line.startsWith('turboslide: '));
  const others = lines.filter((line) => line !== message);
  const keep = message === undefined ? limit : limit - 1;
  const tail = keep > 0 ? others.slice(-keep) : [];
  return message === undefined ? tail : [message, ...tail];
}

/** The JSON result of a `--json` run; throws with the CLI's message and the last stderr lines (failureLines) when stdout is not JSON. */
export function parseJsonResult<T>(run: CliRun, what: string): T {
  try {
    return JSON.parse(run.stdout) as T;
  } catch {
    const tail = failureLines(run.stderr, 5).join('\n');
    throw new Error(
      `${what}: turboslide exited ${run.code} without a JSON result${tail ? `\n${tail}` : ''}`,
    );
  }
}
