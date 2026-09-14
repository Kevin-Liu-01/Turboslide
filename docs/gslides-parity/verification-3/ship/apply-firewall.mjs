#!/usr/bin/env node
// Applies `firewall/rules.json` to the linked Vercel project in log mode through the vercel CLI's
// firewall commands (docs/gslides-parity/SPEC-3.md 8.3, 11.5 R0; docs/security.md section 3;
// MILESTONES-3 "Ship step" item 5): every entry of the file's `order` array is staged as a draft
// with `vercel firewall rules add --json <value>` (the bypass first, as the file says), the draft
// is shown with `vercel firewall diff`, and the draft is published with `vercel firewall publish`
// unless `--no-publish` is given. The `value` objects already carry the log mode actions (a rate
// limit rule counts and logs, a challenge or deny rule logs); nothing here changes them. A rule
// the API refuses stops the run before the publish, the answer is printed, and the staged draft
// is discarded with `vercel firewall discard`, so a plan that lacks the feature leaves nothing
// half applied: a refusal is recorded, never worked around. Managed Bot Protection has no CLI
// row here; the file's `managed` entry is reported as Kevin's setting.
//
//   node docs/gslides-parity/verification-3/ship/apply-firewall.mjs [--only bypass-cli] [--no-publish]
//
// Prints one line per rule and exits 0 when every rule staged and the publish answered.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROOT = '/Users/kevinliu/repos/Turboslide';
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const publish = !argv.includes('--no-publish');
const file = JSON.parse(readFileSync(`${ROOT}/firewall/rules.json`, 'utf8'));
const byKey = new Map(file.rules.map((rule) => [rule.key, rule]));
const order = only ? [only] : file.order;

function vercel(args) {
  const result = spawnSync('vercel', [...args, '--non-interactive'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    maxBuffer: 16 * 1024 * 1024,
  });
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`
    .split('\n')
    .filter(
      (line) =>
        !/^Vercel CLI|Did you mean to deploy the subdirectory|Retrieving project/.test(line),
    )
    .join('\n')
    .trim();
  return { status: result.status ?? 1, text };
}

const staged = [];
let refused = null;
for (const key of order) {
  const rule = byKey.get(key);
  if (rule === undefined) {
    console.log(`${key}: not in the file, skipped`);
    continue;
  }
  const value = rule.value;
  const answer = vercel(['firewall', 'rules', 'add', '--json', JSON.stringify(value), '--yes']);
  const one = answer.text.replace(/\s+/g, ' ').slice(0, 400);
  const action = value.action?.mitigate?.rateLimit
    ? `rate_limit ${value.action.mitigate.rateLimit.limit}/${value.action.mitigate.rateLimit.window}s -> ${value.action.mitigate.rateLimit.action}`
    : value.action?.mitigate?.action;
  console.log(
    `${key} (${value.name}; active ${value.active}; ${action}): exit ${answer.status}; ${one}`,
  );
  if (answer.status !== 0) {
    refused = { key, answer: answer.text };
    break;
  }
  staged.push(key);
}

if (refused !== null) {
  console.log(
    `\nrefused at ${refused.key}; the staged draft (${staged.length} rule(s)) is discarded, nothing is published`,
  );
  const discard = vercel(['firewall', 'discard', '--yes']);
  console.log(
    `discard: exit ${discard.status}; ${discard.text.replace(/\s+/g, ' ').slice(0, 300)}`,
  );
  process.exit(2);
}

const diff = vercel(['firewall', 'diff']);
console.log(`\ndiff: exit ${diff.status}\n${diff.text.slice(0, 6000)}`);
if (!publish) {
  console.log('\n--no-publish: the draft stays staged');
  process.exit(0);
}
const published = vercel(['firewall', 'publish', '--yes']);
console.log(
  `\npublish: exit ${published.status}; ${published.text.replace(/\s+/g, ' ').slice(0, 600)}`,
);
const list = vercel(['firewall', 'rules', 'list']);
console.log(`\nrules after the publish: exit ${list.status}\n${list.text.slice(0, 8000)}`);
console.log(
  `\nmanaged Bot Protection (${file.managed.botProtection.mode} mode now, ${file.managed.botProtection.enforce} after the week) has no CLI row here: Kevin's setting in the Firewall tab`,
);
process.exit(published.status === 0 ? 0 : 1);
