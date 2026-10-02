// Lane B6's one-off split of docs/gslides-parity/focus/VERIFICATION.md (docs/NEXT.md 5.2 item 3):
// each top-level section (a `# ` heading, one verifier pass, ship step or production table) moves
// to its own file under focus/verification/<round>/, numbered in the file's order, and
// VERIFICATION.md becomes the index of the passes with each heading as it was written. The text
// of every pass is moved byte for byte. Run once from the repository root:
//
//   node docs/gslides-parity/round1/build/b6/split-verification.mjs [--write]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const FOCUS = join(ROOT, 'docs', 'gslides-parity', 'focus');
const SOURCE = join(FOCUS, 'VERIFICATION.md');
const WRITE = process.argv.includes('--write');

const text = readFileSync(SOURCE, 'utf8');
const lines = text.split('\n');
const starts = lines.flatMap((line, i) => (/^# /.test(line) ? [i] : []));
if (starts[0] !== 0) throw new Error('VERIFICATION.md does not open with a pass heading');

/** The round a pass belongs to, read from its heading. */
const ROUND_OF = [
  [/^Turboslide focus round|^Cycle /, 'focus'],
  [/^Return round/, 'return'],
  [/^Product round/, 'product'],
  [/^Sync and costs round/, 'sync'],
  [/^Features round/, 'features'],
  [/^Vector round/, 'vector'],
  [/^Objects round/, 'objects'],
  [/^Polish round/, 'polish'],
  [/^People round/, 'people'],
];
const slug = (heading) =>
  heading
    .replace(/\(the verifier, [^)]*\)|\(the ship step, [^)]*\)|\([0-9-]+\)/g, '')
    .replace(/^Turboslide focus round, verification/, 'cycle 1')
    .replace(/^(Return|Product|Sync and costs|Features|Vector|Objects|Polish|People) round,? ?/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const passes = starts.map((start, n) => {
  const end = n + 1 < starts.length ? starts[n + 1] : lines.length;
  const heading = lines[start].slice(2).trim();
  const round = ROUND_OF.find(([pattern]) => pattern.test(heading))?.[1];
  if (!round) throw new Error(`no round for "${heading}"`);
  const file = `${String(n + 1).padStart(2, '0')}-${slug(heading)}.md`;
  const body = lines.slice(start, end);
  while (body.length && body[body.length - 1] === '') body.pop();
  return { heading, round, path: `verification/${round}/${file}`, body, lines: end - start };
});

const index = [
  '# Verification passes',
  '',
  'The verifiers\x27 passes, ship steps and production tables of every round from the focus round to the polish round, one file per pass since Round 1 (`docs/NEXT.md` 5.2 item 3). Each file holds the text of its pass unchanged. A citation such as "VERIFICATION C2-F29" or "VERIFICATION.md, Polish round, the production table" names a pass by a heading below. A new pass is a new file in its round\x27s folder under `verification/`, and the run files of a round go into the same folder (`docs/gslides-parity/README.md`, rule 7).',
  '',
  '| Pass, as its heading reads | File | Lines |',
  '| --- | --- | ---: |',
  ...passes.map((p) => `| ${p.heading} | [${p.path}](${p.path}) | ${p.lines} |`),
  '',
];

for (const p of passes) console.log(`${p.path} ${p.lines} lines`);
if (WRITE) {
  for (const p of passes) {
    const target = join(FOCUS, p.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${p.body.join('\n')}\n`);
  }
  writeFileSync(SOURCE, index.join('\n'));
}
const moved = passes.reduce((n, p) => n + p.body.join('\n').length + 1, 0);
console.log(
  `${passes.length} passes; ${text.length} bytes before, ${index.join('\n').length} after in VERIFICATION.md; ${moved} bytes moved`,
);
