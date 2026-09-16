// Writes the expected documents and reports of the PPTX import fixtures (gslides-parity SPEC-5
// 5.4; R04 10): `<name>.expected/deck.json`, `<name>.expected/slides/<id>.json` (canonical JSON)
// and `<name>.report.json` beside each `<name>.pptx`, from the reader as it stands. Run once on the
// builder's machine when the reader's mapping changes on purpose, never in the check chain:
//
//     node packages/import/src/__fixtures__/pptx/write-expected.mjs            # every fixture
//     node packages/import/src/__fixtures__/pptx/write-expected.mjs 02-shapes  # one
//
// The tests (`pptx/fixtures.test.ts`) compare the reader's output with these files row for row, so
// a change here is a change of the gate and is recorded in build-5/b3.md.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { importPptxBytes } = await import(join(here, '..', '..', 'pptx', 'read.ts'));
const { canonicalJson } = await import('@turboslide/schema/json');

const FIXED_NOW = '2026-09-15T00:00:00.000Z';
const wanted = process.argv.slice(2);
const names = readdirSync(here)
  .filter((file) => file.endsWith('.pptx'))
  .map((file) => file.replace(/\.pptx$/, ''))
  .filter((name) => wanted.length === 0 || wanted.includes(name))
  .sort();

for (const name of names) {
  const bytes = new Uint8Array(readFileSync(join(here, `${name}.pptx`)));
  const into = name.replace(/^\d+b?-/, '');
  const document = await importPptxBytes(bytes, {
    fileName: `${name}.pptx`,
    into,
    now: () => FIXED_NOW,
  });
  const expected = join(here, `${name}.expected`);
  rmSync(expected, { recursive: true, force: true });
  mkdirSync(join(expected, 'slides'), { recursive: true });
  writeFileSync(join(expected, 'deck.json'), canonicalJson(document.deck));
  for (const slide of document.slides)
    writeFileSync(join(expected, 'slides', `${slide.id}.json`), canonicalJson(slide));
  writeFileSync(join(here, `${name}.report.json`), canonicalJson(document.report));
  const { imported, substituted, dropped } = document.report.summary;
  process.stdout.write(
    `${name}: ${document.slides.length} slides, ${document.shapeCount} source shapes, ${imported} imported, ${substituted} shown differently, ${dropped} dropped, ${document.files.length} asset files, ${document.report.rows.length} rows\n`,
  );
}
