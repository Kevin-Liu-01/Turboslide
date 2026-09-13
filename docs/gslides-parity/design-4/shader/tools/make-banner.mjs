// The CLI banner: the 16 px mark as half block characters from its own bitmap (research-4 report 01, 6.4
// item 19), the wordmark as text, the version and the deck line. No colour is needed for it to read.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const sharp = require('sharp');
const { markSvg } = await import('./mark.mjs');
const { data, info } = await sharp(Buffer.from(markSvg(16, { plate: '#ffffff', ink: '#000000' }))).raw().toBuffer({ resolveWithObject: true });
const ink = (x, y) => data[(y * info.width + x) * info.channels] < 128;
const rows = [];
for (let y = 4; y < 12; y += 2) { // the frame occupies rows 4 to 11
  let line = '';
  for (let x = 0; x < 16; x += 1) {
    const t = ink(x, y), b = ink(x, y + 1);
    line += t && b ? '█' : t ? '▀' : b ? '▄' : ' ';
  }
  rows.push(line.replace(/\s+$/, ''));
}
const right = ['Turboslide 0.1.0', 'decks/gt-brand · revision 31 · 85 slides', 'effects backend: native (crates/turboslide-native 0.1.0)', 'https://turboslide.vercel.app'];
const banner = rows.map((l, i) => l.padEnd(18) + (right[i] ?? '')).join('\n') + '\n';
writeFileSync('/Users/kevinliu/repos/Turboslide/docs/gslides-parity/design-4/shader/previews/cli-banner.txt', banner);
process.stdout.write(banner);
