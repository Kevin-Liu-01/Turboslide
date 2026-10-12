#!/usr/bin/env node
// Pins the previous release's validator (RELIABILITY-19, hardening HR-O#5). The release
// production serves before a push is the one an Instant Rollback or the guard's promote back lands
// on, so it must read every document the push writes. This script takes that release's
// packages/schema/src out of git, bundles its validate.ts with zod into one module, and writes it
// with its pin record to packages/schema/fixtures/previous-validator/:
//
//   node packages/schema/scripts/pin-previous-validator.mjs <ref>
//
// `validate.mjs` is the bundle (minified; never edited by hand), `PIN.json` names the sha, the zod
// version bundled, the bundle's bytes and its sha256. src/previous-validator.test.ts runs the
// bundle over the documents this release writes. Pin again, to the sha production serves, before
// a push that changes what packages/schema/src accepts or writes; a push that adds a field to a
// document raises SCHEMA_MINOR (deck.ts), which the release pinned here reads only if it is this
// round's or later. Needs git and the workspace's install (rolldown is resolved through vitest).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');
const repo = join(pkg, '..', '..');
const out = join(pkg, 'fixtures', 'previous-validator');

const ref = process.argv[2];
if (ref === undefined || ref.startsWith('-')) {
  console.error('usage: node packages/schema/scripts/pin-previous-validator.mjs <ref>');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const sha = git('rev-parse', '--verify', `${ref}^{commit}`);
const date = git('show', '-s', '--format=%cI', sha);

// the release's sources in a scratch folder inside the package, so the bundler resolves zod from
// the package's own node_modules the way the release did
const scratch = mkdtempSync(join(pkg, '.pin-'));
try {
  const tar = execFileSync('git', ['archive', '--format=tar', sha, 'packages/schema/src'], {
    cwd: repo,
    maxBuffer: 256 * 1024 * 1024,
  });
  execFileSync('tar', ['-x', '-C', scratch], { input: tar });
  const entry = join(scratch, 'packages', 'schema', 'src', 'validate.ts');

  const fromPkg = createRequire(join(pkg, 'package.json'));
  const zodPackage = fromPkg.resolve('zod/package.json');
  const zodVersion = JSON.parse(readFileSync(zodPackage, 'utf8')).version;
  const fromVitest = createRequire(createRequire(join(repo, 'package.json')).resolve('vitest'));
  const fromVite = createRequire(fromVitest.resolve('vite'));
  const { rolldown } = await import(fromVite.resolve('rolldown'));

  const bundle = await rolldown({
    input: entry,
    platform: 'neutral',
    treeshake: true,
    logLevel: 'warn',
  });
  const { output } = await bundle.generate({ format: 'esm', minify: true });
  await bundle.close();
  const chunk = output.find((item) => item.type === 'chunk' && item.isEntry);
  if (chunk === undefined || output.length !== 1) throw new Error('expected one entry chunk');
  const exported = ['validateDeck', 'validateManifest', 'validateSlide'];
  for (const name of exported) {
    if (!chunk.exports.includes(name)) throw new Error(`the bundle does not export ${name}`);
  }
  const code = `// The validator of ${sha} (packages/schema/scripts/pin-previous-validator.mjs); generated, never edited.\n${chunk.code}`;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'validate.mjs'), code);
  const pin = {
    sha,
    date,
    zod: zodVersion,
    bytes: Buffer.byteLength(code),
    sha256: createHash('sha256').update(code).digest('hex'),
  };
  writeFileSync(join(out, 'PIN.json'), `${JSON.stringify(pin, null, 2)}\n`);
  console.log(`pinned ${sha} (${pin.bytes} bytes, zod ${zodVersion}) in ${out}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
