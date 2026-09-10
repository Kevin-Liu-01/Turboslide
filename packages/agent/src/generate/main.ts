// pnpm generate:contracts (SPEC 7.1, MILESTONES M1 item 4). Writes the committed contract surfaces
// from the action table in @turboslide/schema: packages/agent/generated/{cli,mcp-tools,describe,
// openapi,manifest}.json, docs/grammar.md and the four skills/*/references/*.md tables. The
// acceptance runs this and then `git diff --exit-code` on those paths, so every output is
// committed and current; contracts.test.ts fails when a committed file is stale. `--check` exits 1
// on stale files without writing, `--list` prints the output paths. Runs with Node's type
// stripping: erasable syntax and explicit .ts import extensions only.
import { generateAll, staleFiles, writeAll } from './contracts.ts';

const args = new Set(process.argv.slice(2));

if (args.has('--list')) {
  for (const path of Object.keys(generateAll())) process.stdout.write(`${path}\n`);
  process.exit(0);
}

if (args.has('--check')) {
  const stale = staleFiles();
  if (stale.length === 0) {
    process.stderr.write('generate:contracts: every committed contract is current\n');
    process.exit(0);
  }
  for (const file of stale)
    process.stderr.write(`generate:contracts: ${file.reason}: ${file.path}\n`);
  process.stderr.write('generate:contracts: run `pnpm generate:contracts` and commit the result\n');
  process.exit(1);
}

const changed = writeAll();
const total = Object.keys(generateAll()).length;
process.stderr.write(
  changed.length === 0
    ? `generate:contracts: ${total} files current\n`
    : `generate:contracts: wrote ${changed.length} of ${total} files\n${changed.map((path) => `  ${path}`).join('\n')}\n`,
);
