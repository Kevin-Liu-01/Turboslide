// The turboslide binary (SPEC 7.2): the file transport that needs no browser page. bin/turboslide.mjs
// runs this source through Node's type stripping; tsdown bundles it for distribution.
import { runCli } from './cli.ts';

const code = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  streams: {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
});
process.exitCode = code;
