// The ship step's pictures of the people round on production (docs/PEOPLE.md 6.2 (3); the prompt
// names the surfaces: the marks with the gap, two people in the roster, the version panel, a
// comment, at 1440 in both appearances with two anonymous contexts). The drive is the verifier's
// `docs/gslides-parity/people/verify/verify.mjs` run with `--tag production --out <scratch>`
// (every scratch deck trashed and deleted forever by id in its finally); this script picks the
// four surfaces from its PNGs and writes them as JPEG files named for the production table under
// docs/gslides-parity/focus/verification/. Nothing here touches the network.
//
//   node docs/gslides-parity/people/build/ship/production-pictures.mjs --from <dir> [--width 1440]
//     [--out docs/gslides-parity/focus/verification]
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import sharp from 'sharp';

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const FROM = resolve(argOf('from', ''));
const WIDTH = argOf('width', '1440');
const OUT = resolve(argOf('out', 'docs/gslides-parity/focus/verification'));
const SURFACES = [
  ['marks', 'zoom-own-chip-A'],
  ['roster', 'roster-B'],
  ['versions', 'versions-A'],
  ['comment', 'comment-card-B'],
];
let written = 0;
for (const [name, source] of SURFACES) {
  for (const appearance of ['light', 'dark']) {
    const png = join(FROM, `people-production-${WIDTH}-${source}-${appearance}.png`);
    if (!existsSync(png)) {
      console.log(`missing ${png}`);
      continue;
    }
    const jpg = join(OUT, `production-people-${name}-${WIDTH}-${appearance}.jpg`);
    await sharp(png).jpeg({ quality: 88 }).toFile(jpg);
    console.log(`wrote ${jpg}`);
    written += 1;
  }
}
console.log(`${written} of ${SURFACES.length * 2} pictures written`);
process.exit(written === SURFACES.length * 2 ? 0 : 1);
