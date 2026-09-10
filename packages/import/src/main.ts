// Runs the importer from Node without the CLI package:
//   node packages/import/src/main.ts /Users/kevinliu/repos/Prototemplate/deck --into gt-brand [--decks decks] [--json]
// The CLI (apps/cli) wraps importDeck the same way and prints the report as `--json` does
// (AGENTS.md, contracts between builders: `{ slides, sections, htmlBlocks, ... }` on stdout).
import { resolve } from 'node:path';

import { importDeck } from './import-deck.ts';

const argv = process.argv.slice(2);
const positional = argv.filter(
  (arg, i) =>
    !arg.startsWith('--') &&
    (i === 0 || !argv[i - 1]?.startsWith('--') || ['--json'].includes(argv[i - 1] ?? '')),
);
const value = (name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};
const from = positional[0];
const into = value('--into');
if (!from || !into) {
  process.stderr.write(
    'usage: node packages/import/src/main.ts <deck dir> --into <deckId> [--decks <dir>] [--json]\n',
  );
  process.exit(2);
}
const report = importDeck({
  from: resolve(from),
  into,
  decksDir: value('--decks') ? resolve(value('--decks') ?? '') : undefined,
});
if (argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(
    `import: ${report.slides} slides, ${report.sections} sections, ${report.htmlBlocks} html blocks, ${report.blocks} blocks, ${report.assets} assets (${report.files} files, ${report.filesCopied} copied), ${report.rulesConsumed} rules consumed, ${report.rulesLeftOver} left over on ${report.slidesWithResidualCss.length} slides, ${report.inlineLeftOver} inline residuals\n`,
  );
  for (const row of report.rows)
    if (row.html) process.stdout.write(`  escape ${row.n} ${row.id}: ${row.html.reason}\n`);
  for (const warning of report.warnings) process.stderr.write(`  warning: ${warning}\n`);
}
