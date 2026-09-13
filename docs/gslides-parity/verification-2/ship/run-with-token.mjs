#!/usr/bin/env node
// Runs a command with TURBOSLIDE_TOKEN set from ~/.config/turboslide/hosts.json for one host, so
// the bearer is read in code and never appears on a command line or in a log (docs/hosting.md
// section 7; the ship step's production export):
//
//   node docs/gslides-parity/verification-2/ship/run-with-token.mjs <host> -- <command...>
//
// Exits with the command's exit code. The token's length is the only thing printed about it.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const separator = argv.indexOf('--');
const host = argv[0];
const command = separator >= 0 ? argv.slice(separator + 1) : [];
if (!host || command.length === 0) {
  process.stderr.write('usage: run-with-token.mjs <host> -- <command...>\n');
  process.exit(2);
}
const file = join(homedir(), '.config', 'turboslide', 'hosts.json');
const hosts = JSON.parse(readFileSync(file, 'utf8')).hosts ?? {};
const entry = hosts[host] ?? hosts[host.replace(/\/$/, '')];
if (!entry?.token) {
  process.stderr.write(`no token for ${host} in ${file}\n`);
  process.exit(2);
}
process.stderr.write(
  `token for ${host}: ${entry.token.length} characters, saved ${entry.savedAt}\n`,
);
const result = spawnSync(command[0], command.slice(1), {
  stdio: 'inherit',
  env: { ...process.env, TURBOSLIDE_TOKEN: entry.token },
});
process.exit(result.status ?? 1);
