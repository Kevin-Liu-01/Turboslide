// The identity's dithered assets, through the repository's own pipeline (@turboslide/effects on the napi
// addon on this machine; TwoToneResult.backend records which implementation cut each screen).
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const sharp = require('sharp');
const E = '/Users/kevinliu/repos/Turboslide/packages/effects/src';
const { decodeImage } = await import(`${E}/io.ts`);
const { twoTone } = await import(`${E}/two-tone.ts`);
const { encodePng1 } = await import(`${E}/png1.ts`);
const { PLATE_BOXES } = await import(`${E}/metrics.ts`);
const { toGray, autocontrast, tone } = await import(`${E}/tone.ts`);
const { ditherGray } = await import(`${E}/bayer.ts`);
const { scaleNearest } = await import(`${E}/resample.ts`);
const OUT = '/Users/kevinliu/repos/Turboslide/docs/gslides-parity/design-4/shader/previews';
const record = { date: '2026-09-13', assets: [] };

async function twins(frame, name, params, plate) {
  const rgba = await decodeImage(`frames/${frame}.png`);
  const t0 = performance.now();
  const r = twoTone(rgba, params, plate ? { plate } : {});
  const ms = +(performance.now() - t0).toFixed(1);
  writeFileSync(`${OUT}/${name}-dark.png`, r.dark.png);
  writeFileSync(`${OUT}/${name}-light.png`, r.light.png);
  record.assets.push({
    name,
    frame: `${frame}.png`,
    params: r.params,
    backend: r.backend,
    ms,
    litFraction: r.metrics.litFraction,
    plateClear: r.metrics.plateClear ?? null,
    warnings: r.metrics.warnings,
    bytes: { dark: r.dark.png.length, light: r.light.png.length },
  });
  return r;
}

// the hero: liquid metal field, frame 5500 ms, white point 120 so the field is ink and the contour bands paper
const hero = await twins(
  'lm-field-5500',
  'hero',
  { autocontrast: 0.5, white: 120, gamma: 1, polarity: 'light-ground', cell: 2 },
  PLATE_BOXES.opener,
);
// the 800 by 450 screen at one cell per pixel, for viewports under 900 px and the pipeline figure
writeFileSync(
  `${OUT}/hero-screen-dark.png`,
  encodePng1(
    hero.positive.width
      ? {
          ...hero.positive,
          bits:
            hero.dark.bits.length === 1600 * 900
              ? downsampleBits(hero.dark.bits)
              : hero.positive.bits,
        }
      : hero.positive,
  ),
);
function downsampleBits(bits) {
  // the dark twin at cell 2 back to one bit per cell
  const out = new Uint8Array(800 * 450);
  for (let y = 0; y < 450; y += 1)
    for (let x = 0; x < 800; x += 1) out[y * 800 + x] = bits[y * 2 * 1600 + x * 2];
  return out;
}
// the social image band: the same frame at 8 px cells (report 02 section 5.4: a cell under 2 output pixels is a gradient,
// so the card's screen is cut at 70 by 79 cells and drawn 8 px each), with the same tone stages and the same screen
{
  const raw = await sharp('frames/lm-field-rep2-7000.png')
    .resize(70, 79, { fit: 'cover', position: 'right', kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let gray = toGray(
    {
      width: 70,
      height: 79,
      data: new Uint8Array(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength),
    },
    'gray',
  );
  gray = autocontrast(gray, 0.5);
  gray = tone(gray, 0, 90, 1);
  const bits = ditherGray(gray);
  // light-ground polarity: the bright field is ink, the bands paper
  const inv = { ...bits, bits: bits.bits.map((b) => 1 - b) };
  const big = scaleNearest(inv, 8);
  writeFileSync(`${OUT}/og-band-dark.png`, encodePng1(big));
  const lit = inv.bits.reduce((a, b) => a + b, 0) / inv.bits.length;
  record.assets.push({
    name: 'og-band',
    frame: 'lm-field-rep2-7000.png',
    cells: '70 by 79 at 8 px',
    stages:
      'lanczos3 cover crop (sharp), toGray, autocontrast 0.5, tone white 90, ditherGray, inverted',
    litFraction: +lit.toFixed(4),
  });
}
// the figure: gem smoke in ink and paper, the empty state, the 404 and the curtain
await twins('gs-ink-metaballs-6000', 'figure', {
  autocontrast: 0.5,
  black: 10,
  gamma: 1,
  polarity: 'dark-ground',
  cell: 2,
});
// the continuous frames the pipeline band shows: the monochrome frame and the brand blue live frame
await sharp('frames/lm-field-5500.png').jpeg({ quality: 82 }).toFile(`${OUT}/hero-frame.jpg`);
await sharp('frames/lm-field-backblue-tintlight-5500.png')
  .jpeg({ quality: 82 })
  .toFile(`${OUT}/hero-live.jpg`);
writeFileSync(`${OUT}/dither-record.json`, JSON.stringify(record, null, 2) + '\n');
console.log(
  JSON.stringify(
    record.assets.map((a) => ({
      name: a.name,
      backend: a.backend,
      ms: a.ms,
      lit: a.litFraction,
      bytes: a.bytes,
    })),
    null,
    0,
  ),
);
