// The CLI's start cost (hardening HR-N#3, RUST-6; docs/hardening/HARDENING.md 8.4): `--help` and
// `info` on the GT deck spend at most 300 ms of CPU, the process's own user and system time from
// start to exit, because each command's module loads only when it runs (cli.ts COMMANDS).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = fileURLToPath(new URL('./cli.ts', import.meta.url));

/** The CPU the command spends in a fresh Node process, in milliseconds. */
function cpuMs(argv: string[]): number {
  const script = [
    `const { runCli } = await import(${JSON.stringify(CLI)});`,
    `const quiet = () => undefined;`,
    `await runCli(${JSON.stringify(argv)}, { cwd: ${JSON.stringify(ROOT)}, streams: { stdout: quiet, stderr: quiet } });`,
    `const { user, system } = process.cpuUsage();`,
    `process.stdout.write(String((user + system) / 1000));`,
  ].join('\n');
  // the first run fills the compile cache, the second is the reading
  const args = ['--input-type=module', '-e', script];
  const env = {
    ...process.env,
    NODE_COMPILE_CACHE: fileURLToPath(new URL('../.turboslide/compile-cache', import.meta.url)),
  };
  spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8' });
  const run = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  return Number(run.stdout);
}

describe('the CLI start cost', () => {
  test('--help and info spend at most 300 ms of CPU', () => {
    expect(cpuMs(['--help'])).toBeLessThanOrEqual(300);
    expect(cpuMs(['info', '--deck', 'decks/gt-brand'])).toBeLessThanOrEqual(300);
  }, 60_000);
});
