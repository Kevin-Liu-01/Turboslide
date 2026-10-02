// Direction C field twins: the mood pictures of the GT sign in plate (Prototemplate/public/brand/mood, the 8 bit tone
// grids cut by the dashboard's mood-tone.mjs) screened through the product's own 8 by 8 Bayer permutation
// (packages/effects/src/bayer.ts ditherGray) at 2 px cells (--ts-cell), with the ramp applied to the tone and not as an
// opacity mask (P:DESIGN.md 251: tonal ramps use dither instead of opacity), written as two colour PNGs by the product's
// encoder (packages/effects/src/png1.ts) in each appearance's exact paper and ink. Reads Prototemplate, writes only
// brand-c/mock/assets/.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../../..');
const require = createRequire(join(root, 'package.json'));
const sharp = require('sharp');
const { ditherGray } = await import(join(root, 'packages/effects/src/bayer.ts'));
const { encodePng1 } = await import(join(root, 'packages/effects/src/png1.ts'));

const MOOD = '/Users/kevinliu/repos/Prototemplate/public/brand/mood';
const CELL = 2;
const PALETTES = {
  light: [[255, 255, 255], [7, 7, 7]],
  dark: [[7, 7, 7], [242, 242, 240]],
};

/**
 * One field: the picture covers a box of `w` by `h` CSS px at `focus`, the ramp runs from 0 at the `ramp.edge` side to
 * 1 after `ramp.share` of the box, multiplied into the tone before the screen.
 */
async function field({ name, picture, w, h, focusX, focusY, ramp, gain = 1, scale }) {
  const cw = Math.round(w / CELL);
  const ch = Math.round(h / CELL);
  const meta = await sharp(join(MOOD, `mood-${picture}.jpg`)).metadata();
  // cover the box, or a fixed cells per source pixel so a band shows the picture at the wide field's scale
  const s = scale ?? Math.max(cw / meta.width, ch / meta.height);
  const sw = Math.max(cw, Math.round(meta.width * s));
  const sh = Math.max(ch, Math.round(meta.height * s));
  const left = Math.round((sw - cw) * focusX);
  const top = Math.round((sh - ch) * focusY);
  const { data } = await sharp(join(MOOD, `mood-${picture}.jpg`))
    .greyscale()
    .resize(sw, sh, { kernel: 'lanczos3', fit: 'fill' })
    .extract({ left, top, width: cw, height: ch })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tone = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      let t = 1;
      if (ramp) {
        const along =
          ramp.edge === 'left' ? x / cw : ramp.edge === 'bottom' ? (ch - 1 - y) / ch : ramp.edge === 'top' ? y / ch : (cw - 1 - x) / cw;
        t = Math.min(1, Math.max(0, along / ramp.share));
      }
      tone[y * cw + x] = Math.min(255, Math.round((data[y * cw + x] ?? 0) * gain * t));
    }
  }
  const bits = ditherGray({ width: cw, height: ch, data: tone });
  // whole pixel cells: each cell is CELL by CELL device pixels at 1x, so the page shows the file at its size
  const big = new Uint8Array(cw * CELL * ch * CELL);
  for (let y = 0; y < ch * CELL; y += 1)
    for (let x = 0; x < cw * CELL; x += 1) big[y * cw * CELL + x] = bits.bits[Math.floor(y / CELL) * cw + Math.floor(x / CELL)];
  let lit = 0;
  for (const b of bits.bits) lit += b;
  for (const [theme, palette] of Object.entries(PALETTES)) {
    const file = `field-${name}-${theme}.png`;
    writeFileSync(join(here, '../mock/assets', file), encodePng1({ width: cw * CELL, height: ch * CELL, bits: big }, { palette }));
  }
  console.log(`${name}: ${picture} ${cw} by ${ch} cells at ${CELL} px, ${((lit / (cw * ch)) * 100).toFixed(1)} percent lit`);
}

// /home at 1440 by 900: the field takes the hero band right of the plate edge at x 720, 720 by 720 CSS px; the ramp is
// 0.42 of the field's width, the plate's --field-ramp-length (Prototemplate plate.css 566).
await field({ name: 'home-wide', picture: 'gloss', w: 720, h: 720, focusX: 1, focusY: 0.5, ramp: { edge: 'left', share: 0.42 } });
// /home under the 1023 px breakpoint of slide 49: a band under the navigation, 1024 by 184, shown right aligned and
// cropped, fading into the paper toward the text below it
await field({ name: 'home-band', picture: 'gloss', w: 1024, h: 184, focusX: 1, focusY: 0.42, ramp: { edge: 'bottom', share: 0.5 }, scale: 0.4 });
// the Sign in dialog at 1440: the field takes the dialog's right 360 by 480
await field({ name: 'signin-wide', picture: 'dictionary', w: 360, h: 480, focusX: 1, focusY: 0.5, ramp: { edge: 'left', share: 0.42 } });
// the Sign in sheet under 800 px: a band at the sheet's head, 800 by 176, shown right aligned and cropped
await field({ name: 'signin-band', picture: 'dictionary', w: 800, h: 176, focusX: 1, focusY: 0.22, ramp: { edge: 'bottom', share: 0.5 }, scale: 240 / 900 });
