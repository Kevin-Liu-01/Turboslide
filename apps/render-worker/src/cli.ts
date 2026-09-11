// The worker drives the turboslide binary as a child process (SPEC 3.3 item 7: headless Chromium
// never runs inside the web app, and here not inside the worker process either, so a browser
// crash ends one job, not the queue). The binary is TURBOSLIDE_BIN, else apps/cli/bin/turboslide.mjs
// resolved through the @turboslide/cli workspace package, run by the current Node. `--json` output
// is the one machine result on stdout; human lines arrive on stderr and are forwarded to the job log.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type CliCommand = { command: string; args: string[] };

export function turboslideBin(env: NodeJS.ProcessEnv = process.env): CliCommand {
  if (env.TURBOSLIDE_BIN) return { command: env.TURBOSLIDE_BIN, args: [] };
  const pkgPath = fileURLToPath(import.meta.resolve('@turboslide/cli/package.json'));
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    bin?: Record<string, string> | string;
  };
  const bin = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin?.turboslide ?? 'bin/turboslide.mjs');
  return { command: process.execPath, args: [join(dirname(pkgPath), bin)] };
}

export type CliRun = { code: number; stdout: string; stderr: string; ms: number; args: string[] };

export type CliRunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Default 15 minutes: an 85 slide export with verification. */
  timeoutMs?: number;
  onStderrLine?: (line: string) => void;
  signal?: AbortSignal;
};

/** Runs `turboslide <args>` and captures both streams; rejects only when the process cannot start. */
export function runTurboslide(args: string[], options: CliRunOptions = {}): Promise<CliRun> {
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
    let pending = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      if (!options.onStderrLine) return;
      pending += text;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) options.onStderrLine(line);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 900_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (pending.trim() && options.onStderrLine) options.onStderrLine(pending);
      resolve({ code: code ?? 1, stdout, stderr, ms: Math.round(performance.now() - t), args });
    });
  });
}

/** The JSON result of a `--json` run; throws with the stderr tail when stdout is not JSON. */
export function parseJsonResult<T>(run: CliRun, what: string): T {
  try {
    return JSON.parse(run.stdout) as T;
  } catch {
    const tail = run.stderr.trim().split('\n').slice(-5).join('\n');
    throw new Error(
      `${what}: turboslide exited ${run.code} without a JSON result${tail ? `\n${tail}` : ''}`,
    );
  }
}
