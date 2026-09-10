// The turboslide binary (SPEC 7.2). Commands land in commands/*.ts (MILESTONES M1 item 10):
// import, validate, info, slides, slide get, render, sheet, lint, build, generate.
// Global flags: --deck <dir>, --json (machine output on stdout, human output on stderr),
// --author <name>. Exit codes: 0; 1 for findings at the gate or a verify failure; 2 for a usage
// or validation error.
//
// Scaffold placeholder: prints usage and exits 2 on any command until the CLI builder lands.

const USAGE = `turboslide <command> [options]

Commands (M1): import, validate, info, slides, slide get, render, sheet, lint, build, generate
Global flags: --deck <dir>  --json  --author <name>

The scaffold ships no commands yet; see MILESTONES M1 item 10.`;

const [command] = process.argv.slice(2);

if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

process.stderr.write(`turboslide: command '${command}' is not implemented yet\n`);
process.exit(2);
