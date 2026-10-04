// The fix round's correction 6 (round1/build/b4.md, section "Round 1 fix round"): adds the scoped
// residual rules that draw each typed speed mark slide as the Prototemplate source draws it, before
// and after the canvas conversion, and writes the ASCII drawing's aspect out. Reads correction 5's
// slides from <src> (the git ignored payload .turboslide/round1/b4/b4b-typed/template/slides) and
// writes the seven files to <dst> (decks/templates/gt-brand/slides).
// Usage: node speed-corrections.mjs <src> <dst>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [src, dst] = process.argv.slice(2);
// the source's `.row { align-items: baseline }` with no later `start` (P:deck/slides 18, 20 to 23)
const BASELINE = new Set(['speed-lockup', 'speed-double-cut', 'speed-livery', 'speed-dithered', 'speed-ascii']);
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
for (const id of ['speed-monogram', 'speed-lockup', 'speed-plate', 'speed-double-cut', 'speed-livery', 'speed-dithered', 'speed-ascii']) {
  const file = `${id}.json`;
  const slide = JSON.parse(readFileSync(join(src, file), 'utf8'));
  const s = `.ts-x-${id}`;
  const add = [`${s} .row p + p { margin-top: 0; }`];
  if (BASELINE.has(id)) add.push(`${s} .row { align-items: baseline; }`);
  add.push(id === 'speed-lockup' ? `${s} .set svg.dia { width: auto; height: auto; }` : `${s} .body svg.dia { width: auto; height: auto; }`);
  if (id === 'speed-ascii') add.push(`${s} svg.dia text { font-family: ${MONO}; font-size: 10px; fill: currentColor; }`);
  slide.ext.import.css = `${slide.ext.import.css}\n${add.join('\n')}`;
  if (id === 'speed-ascii') {
    // the glyph rows keep their aspect when the object's box is rounded or resized: the default
    // value written out, so the canvas renderer does not add preserveAspectRatio="none"
    const dia = slide.slots.body[0];
    if (dia.type !== 'dia' || /preserveAspectRatio/.test(dia.svg)) throw new Error('ascii svg');
    dia.svg = dia.svg.replace(' viewBox="0 0 960 230"', ' viewBox="0 0 960 230" preserveAspectRatio="xMidYMid meet"');
  }
  writeFileSync(join(dst, file), `${JSON.stringify(slide, null, 2)}\n`);
  console.log(id, add.length);
}
