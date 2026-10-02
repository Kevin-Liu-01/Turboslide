// A browser free preview of the monogram and the 16 px candidates, for choosing the form while
// the machine's load keeps Playwright off (the round's load rule). It rasterises the polygons of
// mark-lib.mjs by supersampled coverage and writes one grayscale PNG with node's zlib alone.
//
//   node docs/gslides-parity/round1/sheet/preview.mjs <out.png> [variants json]
//
// The variants argument is a JSON object of named parameter overrides, for example
// '{"bottom 16":{"bottomIn":16}}'. The PNG is a working picture, not a sheet picture.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

import { DEFAULTS, ROWS16_CANDIDATES, box, coverage, fit, polygons } from './mark-lib.mjs';

const out = process.argv[2];
const variants = { default: {}, ...(process.argv[3] ? JSON.parse(process.argv[3]) : {}) };

/* ---------- a gray canvas: 1 is paper, 0 is ink ---------- */
const W = 1400;
let H = 0;
const ops = [];
function paint(x, y, w, h, cov, scale = 1) {
  ops.push({ x, y, w, h, cov, scale });
  H = Math.max(H, y + h * scale + 20);
}

let y = 20;
for (const [name, over] of Object.entries(variants)) {
  const p = { ...DEFAULTS, ...over };
  const polys = polygons(p);
  const b = box(polys);
  let x = 20;
  for (const size of [180, 32, 24]) {
    const t = fit(b, size, 0);
    const cov = coverage(polys, size, size, t, size >= 64 ? 3 : 8);
    paint(x, y, size, size, cov, 1);
    x += size + 20;
    if (size < 64) {
      paint(x, y, size, size, cov, 4);
      x += size * 4 + 30;
    }
  }
  console.log(name, JSON.stringify(over), 'aspect', (b.w / b.h).toFixed(3));
  y += 200;
}

/* the 16 px candidates at 1x and 8x, and the vector fit to the same 12 px cap for comparison */
{
  let x = 20;
  const polys = polygons(DEFAULTS);
  const b = box(polys);
  /* the vector at a 12 px cap, centred in 16 px */
  const s = 12 / 120;
  const t = { s, tx: (16 - b.w * s) / 2 - b.minX * s, ty: 2 - 40 * s };
  const vec = coverage(polys, 16, 16, t, 8);
  paint(x, y, 16, 16, vec, 1);
  paint(x + 30, y, 16, 16, vec, 8);
  x += 30 + 128 + 30;
  for (const rows of Object.values(ROWS16_CANDIDATES)) {
    const cov = new Float64Array(256);
    rows.forEach((row, ry) => [...row].forEach((ch, rx) => (cov[ry * 16 + rx] = ch === '#' ? 1 : 0)));
    paint(x, y, 16, 16, cov, 1);
    paint(x + 30, y, 16, 16, cov, 8);
    x += 30 + 128 + 30;
  }
  console.log('16 px candidates, left to right: the vector at a 12 px cap,', Object.keys(ROWS16_CANDIDATES).join(', '));
}

const gray = new Uint8Array(W * H).fill(255);
for (const { x, y: oy, w, h, cov, scale } of ops)
  for (let j = 0; j < h * scale; j++)
    for (let i = 0; i < w * scale; i++) {
      const c = cov[Math.floor(j / scale) * w + Math.floor(i / scale)];
      gray[(oy + j) * W + x + i] = Math.round(255 * (1 - c));
    }

/* ---------- PNG, 8 bit grayscale ---------- */
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((W + 1) * H);
for (let r = 0; r < H; r++) {
  raw[r * (W + 1)] = 0;
  Buffer.from(gray.buffer, r * W, W).copy(raw, r * (W + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 0;
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
console.log('wrote', out, W, 'by', H);
