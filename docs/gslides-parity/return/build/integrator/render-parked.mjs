// The parked list of the return round rendered from the runs (docs/RETURN.md section 1 rule 2:
// "rendered from the run and never typed"): `parkedFeaturesOf` over the results of each core
// gate run, written beside this file as parked-rendered.json. Node only.
//   node docs/gslides-parity/return/build/integrator/render-parked.mjs <run>=<core-gate.json> ...
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parkedFeaturesOf } from '../../../../../scripts/probes/core-matrix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = { renderedAt: new Date().toISOString(), runs: {} };
for (const arg of process.argv.slice(2)) {
  const [name, file] = arg.split('=');
  const run = JSON.parse(readFileSync(file, 'utf8'));
  const parking = parkedFeaturesOf(run.results);
  out.runs[name] = {
    base: run.base,
    startedAt: run.startedAt,
    commit: run.commit,
    rows: run.rows,
    passed: run.passed,
    failed: run.failed,
    notDriven: run.notDriven,
    parkedFeatures: parking.parked,
    parkedRows: parking.parkedRows,
    blocking: parking.blocking,
  };
}
writeFileSync(path.join(here, 'parked-rendered.json'), `${JSON.stringify(out, null, 2)}\n`);
for (const [name, run] of Object.entries(out.runs))
  console.log(
    `${name}: features ${run.parkedFeatures.join(', ') || 'none'}; rows ${run.parkedRows.map((r) => `${r.id} (${r.parks.join(', ')}) ${r.result}`).join('; ') || 'none'}; blocking ${run.blocking.map((b) => `${b.id} ${b.result}`).join(', ') || 'none'}`,
  );
