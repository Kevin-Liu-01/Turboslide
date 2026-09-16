#!/usr/bin/env node
// The draft of a docs/updates.md entry (gslides-parity SPEC-5 7.6, 0.40; MILESTONES-5 B5 item 5):
// the menu rows whose status changed since a git ref and the actions added, read from the two
// source files at the ref and in the working tree by text (the `now(`, `later(` and `omit(`
// calls of packages/chrome/src/menus/model.ts and the `id: '<action>'` rows of
// packages/schema/src/actions.ts), so the script runs with Node alone and never imports the
// editor. Read only: nothing is written. The integrator pastes the rows it prints into the
// entry of the ship step; a row's label comes from the model, never typed here.
//
//   node scripts/updates-from-model.mjs <ref>            the rows since <ref> as markdown
//   node scripts/updates-from-model.mjs <ref> --json     the same as JSON
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const MODEL = 'packages/chrome/src/menus/model.ts';
const ACTIONS = 'packages/schema/src/actions.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const ref = args.find((arg) => !arg.startsWith('--'));
if (ref === undefined) {
  console.error('usage: node scripts/updates-from-model.mjs <ref> [--json]');
  process.exit(2);
}

/** The file's text at a git ref; '' when the file did not exist there. */
function atRef(path) {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

/** The menu rows of a model source: id to { status, label }. */
export function menuRowsOf(source) {
  const rows = new Map();
  const pattern = /\b(now|later|omit)\(\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'/gu;
  for (const match of source.matchAll(pattern)) {
    rows.set(match[2], { status: match[1], label: match[3].replace(/\\'/gu, "'") });
  }
  return rows;
}

/** The action ids of an actions source: the `id: '<a.b>'` rows inside the ACTIONS table. */
export function actionIdsOf(source) {
  const ids = new Set();
  for (const match of source.matchAll(/^\s+id: '([a-zA-Z]+\.[a-zA-Z.]+)',$/gmu)) ids.add(match[1]);
  return ids;
}

const before = { rows: menuRowsOf(atRef(MODEL)), actions: actionIdsOf(atRef(ACTIONS)) };
const after = {
  rows: menuRowsOf(readFileSync(resolve(ROOT, MODEL), 'utf8')),
  actions: actionIdsOf(readFileSync(resolve(ROOT, ACTIONS), 'utf8')),
};

const flipped = [];
for (const [id, row] of after.rows) {
  const previous = before.rows.get(id);
  if (previous === undefined) {
    if (row.status === 'now') flipped.push({ id, label: row.label, from: 'absent', to: 'now' });
    continue;
  }
  if (previous.status !== row.status)
    flipped.push({ id, label: row.label, from: previous.status, to: row.status });
}
const added = [...after.actions].filter((id) => !before.actions.has(id)).sort();
const removed = [...before.actions].filter((id) => !after.actions.has(id)).sort();

const result = { ref, flipped, actionsAdded: added, actionsRemoved: removed };
if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`## ${new Date().toISOString().slice(0, 10)}`);
  console.log('');
  console.log(`Rows whose status changed since ${ref} (${flipped.length}), from ${MODEL}:`);
  console.log('');
  for (const row of flipped)
    console.log(`- ${row.label} (\`${row.id}\`): ${row.from} to ${row.to}`);
  if (flipped.length === 0) console.log('- none');
  console.log('');
  console.log(`Actions added since ${ref} (${added.length}), from ${ACTIONS}:`);
  console.log('');
  console.log(added.length === 0 ? '- none' : added.map((id) => `\`${id}\``).join(', '));
  if (removed.length > 0) {
    console.log('');
    console.log(
      `Actions removed (${removed.length}): ${removed.map((id) => `\`${id}\``).join(', ')}`,
    );
  }
}
