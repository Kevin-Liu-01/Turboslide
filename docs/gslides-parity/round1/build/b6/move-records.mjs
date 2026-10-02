// Lane B6's one-off record move (docs/NEXT.md 5.2 item 4): moves a set of documents and folders
// into docs/archive/ and rewrites every citation of their old paths in the tracked text files it
// is given. Two sets:
//
//   status  the eight status and superseded documents, the five early evidence folders and
//           scripts/editor-depth-drive.mjs, to docs/archive/status/ (push 4, B6b)
//   rounds  the eight closed round specifications to docs/archive/rounds/ and the 19 top-level
//           parity files to docs/archive/gslides-parity/ (push 21, B6c)
//
//   node docs/gslides-parity/round1/build/b6/move-records.mjs --set status            (dry run)
//   node docs/gslides-parity/round1/build/b6/move-records.mjs --set status --write    (move, rewrite)
//   ... --only docs/,AGENTS.md   rewrite only paths under these prefixes (a lane's own files)
//   ... --skip README.md          leave these paths out of the rewrite
//
// The scope is every tracked text file outside the evidence folder (docs/gslides-parity/** is a
// record of its day and keeps the paths it was written with), docs/NEXT.md (the plan, which names
// the files it moves) and the generated contracts (packages/agent/generated/**, docs/grammar.md,
// which `generate:contracts` writes from the rewritten sources). A citation is the old path
// preceded by the start of a line or a character that cannot end a path, so a rewrite never
// matches inside a path that already moved and a second run changes nothing. Nothing is staged:
// the caller stages the moved and rewritten paths by an explicit list.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const SET = flag('--set');
const WRITE = argv.includes('--write');
const ONLY = flag('--only')?.split(',').filter(Boolean);
const SKIP = new Set(flag('--skip')?.split(',').filter(Boolean) ?? []);

const STATUS = [
  'M1-STATUS.md',
  'M2-STATUS.md',
  'M3-STATUS.md',
  'M4-M5-STATUS.md',
  'HOSTED-STATUS.md',
  'EDITOR-DEPTH-STATUS.md',
  'hosting-diagnosis.md',
  'sessions-polling.md',
  'm2-evidence',
  'm3-evidence',
  'm4-m5-evidence',
  'hosted-evidence',
  'editor-depth-evidence',
];
const ROUNDS = ['RETURN', 'PRODUCT', 'FEATURES', 'SYNC', 'VECTOR', 'OBJECTS', 'POLISH', 'PEOPLE'];
const PARITY = [
  'SPEC.md',
  'SPEC-2.md',
  'SPEC-3.md',
  'SPEC-4.md',
  'SPEC-5.md',
  'SPEC-5-amendments.md',
  'MILESTONES.md',
  'MILESTONES-2.md',
  'MILESTONES-3.md',
  'MILESTONES-4.md',
  'MILESTONES-5.md',
  'BUILD-STATUS.md',
  'BUILD-STATUS-2.md',
  'BUILD-STATUS-3.md',
  'BUILD-STATUS-4.md',
  'VERIFICATION.md',
  'VERIFICATION-2.md',
  'VERIFICATION-3.md',
  'VERIFICATION-4.md',
];

/** [old path, new path] pairs, repository relative. */
const MOVES = {
  status: [
    ...STATUS.map((name) => [`docs/${name}`, `docs/archive/status/${name}`]),
    ['scripts/editor-depth-drive.mjs', 'docs/archive/status/editor-depth-drive.mjs'],
  ],
  rounds: [
    ...ROUNDS.map((name) => [`docs/${name}.md`, `docs/archive/rounds/${name}.md`]),
    ...PARITY.map((name) => [`docs/gslides-parity/${name}`, `docs/archive/gslides-parity/${name}`]),
  ],
}[SET];
if (!MOVES) throw new Error('--set status or --set rounds');

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* the old path, not inside a longer path: no path character before it, none that continues a name after it */
const PATTERNS = MOVES.map(([from, to]) => [
  new RegExp(`(?<![\\w/.-])${escape(from)}(?![\\w-])`, 'g'),
  to,
  from,
]);

const TEXT = /\.(md|mdx|mjs|cjs|js|jsx|ts|tsx|mts|json|jsonc|yaml|yml|css|html|txt|sh|toml)$/i;
const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], {
  encoding: 'utf8',
  maxBuffer: 1 << 26,
})
  .split('\0')
  .filter(Boolean);
const inScope = (path) =>
  TEXT.test(path) &&
  !path.startsWith('docs/gslides-parity/') &&
  path !== 'docs/NEXT.md' &&
  path !== 'docs/grammar.md' &&
  !path.startsWith('packages/agent/generated/') &&
  !SKIP.has(path) &&
  (!ONLY || ONLY.some((prefix) => path.startsWith(prefix)));

/* a tracked file under a moved folder or a moved file is read at its new path */
const newPathOf = (path) => {
  for (const [from, to] of MOVES)
    if (path === from || path.startsWith(`${from}/`)) return to + path.slice(from.length);
  return path;
};

let moves = 0;
for (const [from, to] of MOVES) {
  const source = join(ROOT, from);
  if (!existsSync(source)) {
    if (!existsSync(join(ROOT, to))) console.log(`missing: ${from}`);
    continue;
  }
  if (WRITE) {
    mkdirSync(dirname(join(ROOT, to)), { recursive: true });
    renameSync(source, join(ROOT, to));
  }
  moves += 1;
  console.log(`${WRITE ? 'moved' : 'would move'}: ${from} -> ${to}`);
}

const changed = [];
let total = 0;
for (const path of tracked) {
  /* the scope is read at the file's path after the move: a parity file that leaves the evidence
     folder for docs/archive/ is rewritten like any other document */
  const at = newPathOf(path);
  if (!inScope(at)) continue;
  const file = join(ROOT, WRITE ? at : path);
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  let count = 0;
  let out = text;
  for (const [pattern, to] of PATTERNS)
    out = out.replace(pattern, () => {
      count += 1;
      return to;
    });
  /* a relative Markdown link: resolved from the file's old folder, written from its new one, so
     a link to a moved file and a link inside a moved file both still resolve */
  if (/\.md$/i.test(path))
    out = out.replace(/\]\(([^)\s#]+)(#[^)\s]*)?\)/g, (whole, target, hash = '') => {
      if (/^[a-z]+:/i.test(target) || target.startsWith('/')) return whole;
      const resolved = posix.normalize(posix.join(posix.dirname(path), target));
      const moved = newPathOf(resolved.replace(/\/$/, '')) + (target.endsWith('/') ? '/' : '');
      let next = posix.relative(posix.dirname(at), moved.replace(/\/$/, ''));
      if (target.endsWith('/')) next += '/';
      if (!next.startsWith('.') && target.startsWith('./')) next = `./${next}`;
      if (next === target) return whole;
      count += 1;
      return `](${next}${hash})`;
    });
  if (!count) continue;
  total += count;
  changed.push([newPathOf(path), count]);
  if (WRITE) writeFileSync(file, out);
}
changed.sort((a, b) => b[1] - a[1]);
for (const [path, count] of changed) console.log(`${String(count).padStart(5)} ${path}`);
console.log(
  `${WRITE ? 'rewrote' : 'would rewrite'} ${total} citations in ${changed.length} files; ${moves} moves`,
);
