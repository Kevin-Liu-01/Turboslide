#!/usr/bin/env node
// Runs a command with TURBOSLIDE_TOKEN (the bearer of ~/.config/turboslide/hosts.json for the
// production host; the previews share it) and VERCEL_OIDC_TOKEN (the development token pulled by
// `vercel env pull` into .turboslide/dev.env) in the environment, read in code and never printed.
//   node with-preview-env.mjs -- <command...>
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const command = sep >= 0 ? argv.slice(sep + 1) : argv;
const hosts =
  JSON.parse(readFileSync(join(homedir(), '.config', 'turboslide', 'hosts.json'), 'utf8')).hosts ??
  {};
const bearer = hosts['https://turboslide.vercel.app']?.token ?? '';
const envFile = readFileSync('/Users/kevinliu/repos/Turboslide/.turboslide/dev.env', 'utf8');
const m = /^VERCEL_OIDC_TOKEN="?([^"\n]+)"?$/m.exec(envFile);
const oidc = m ? m[1] : '';
process.stderr.write(`bearer ${bearer.length} chars; oidc ${oidc.length} chars\n`);
const result = spawnSync(command[0], command.slice(1), {
  stdio: 'inherit',
  env: { ...process.env, TURBOSLIDE_TOKEN: bearer, VERCEL_OIDC_TOKEN: oidc },
});
process.exit(result.status ?? 1);
