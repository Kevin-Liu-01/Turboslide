import { inflateSync } from 'node:zlib';

import { describe, expect, test } from 'vitest';

import { hueFor } from './hues.ts';
import { labelFor } from './labels.ts';
import { markSpec } from './marks.ts';
import type { MarkSpec, MarkVariant } from './marks.ts';
import { renderMarkPng1 } from './marks-png.ts';
import {
  MARK_CELL,
  MARK_PREVIEW_SIZES,
  MARK_SIZES,
  bitsOfSvg,
  glyphGrid,
  glyphInk,
  initialsFontSize,
  rampParams,
  renderMarkBits,
  renderMarkSvg,
  seededBits,
} from './marks-render.ts';
import type { MarkBits } from './marks-render.ts';
import type { ResolvedIdentity } from './resolve.ts';
import { sha256 } from './sha256.ts';

const VARIANTS: readonly MarkVariant[] = ['initials', 'glyph', 'dither', 'picture', 'agent'];

/** A deterministic principal id from an index: a v4 shaped UUID from the digest of the index. */
function anonId(i: number): string {
  const d = sha256(`mark-${i}`);
  const hex = [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `anon_${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function identity(i: number, variant: MarkVariant): ResolvedIdentity {
  const principalId = anonId(i);
  const agent = variant === 'agent';
  return {
    principalId,
    kind: agent ? 'agent' : 'anonymous',
    displayName: agent ? 'Agent' : i % 2 === 0 ? `Maya Chen ${i}` : labelFor(principalId),
    label: labelFor(principalId),
    trust: agent ? 'agent' : i % 2 === 0 ? 'guest' : 'label',
    avatar:
      variant === 'agent'
        ? { variant: 'initials' }
        : { variant, salt: i % 7 === 0 ? i : undefined },
    deleted: false,
    admin: false,
  };
}

function spec(i: number): MarkSpec {
  const variant = VARIANTS[i % VARIANTS.length] ?? 'initials';
  return markSpec(identity(i, variant), {
    hueSlot: ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
    presenter: i % 5 === 3,
    self: i % 11 === 0,
    ...(variant === 'picture' ? { pictureUrl: `/u/k${i}/p-32.webp` } : {}),
  });
}

/** Decodes the one bit PNGs this package writes: IHDR, PLTE and one IDAT, filter 0 on every row. */
function decodePng1(png: Uint8Array): MarkBits & { palette: number[][] } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let palette: number[][] = [];
  const idat: Uint8Array[] = [];
  while (offset < png.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      expect(body[8]).toBe(1);
      expect(body[9]).toBe(3);
    }
    if (type === 'PLTE')
      palette = [
        [body[0] ?? 0, body[1] ?? 0, body[2] ?? 0],
        [body[3] ?? 0, body[4] ?? 0, body[5] ?? 0],
      ];
    if (type === 'IDAT') idat.push(body);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat.map((b) => Buffer.from(b))));
  const stride = Math.ceil(width / 8);
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    expect(raw[y * (stride + 1)]).toBe(0);
    for (let x = 0; x < width; x += 1) {
      const byte = raw[y * (stride + 1) + 1 + (x >> 3)] ?? 0;
      bits[y * width + x] = (byte >> (7 - (x & 7))) & 1;
    }
  }
  return { width, height, bits, palette };
}

function count(bits: MarkBits, region?: [number, number, number, number]): number {
  const [x0, y0, x1, y1] = region ?? [0, 0, bits.width, bits.height];
  let n = 0;
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) n += bits.bits[y * bits.width + x] ?? 0;
  return n;
}

describe('renderMarkBits', () => {
  test('the border ring is ink, the plate is inside it, and the cells are 2 px', () => {
    const bits = renderMarkBits(spec(0), 24);
    expect(bits.width).toBe(24);
    for (let i = 0; i < 24; i += 1) {
      expect(bits.bits[i]).toBe(1);
      expect(bits.bits[23 * 24 + i]).toBe(1);
      expect(bits.bits[i * 24]).toBe(1);
      expect(bits.bits[i * 24 + 23]).toBe(1);
    }
    // an initials plate at density d lights about d eighths of its 2 px cells (an 11 by 11 cell
    // window over the 8 by 8 screen is not a whole tile, so the fraction is close, not exact), and
    // a denser plate never unlights a cell of a lighter one
    const initials = markSpec(identity(0, 'initials'));
    const plate = renderMarkBits(initials, 24);
    const fraction = count(plate, [1, 1, 23, 23]) / (22 * 22);
    expect(Math.abs(fraction - initials.density / 8)).toBeLessThan(0.1);
    for (const density of [1, 2, 3] as const) {
      const lighter = renderMarkBits({ ...initials, density }, 24);
      const denser = renderMarkBits({ ...initials, density: (density + 1) as 2 | 3 | 4 }, 24);
      for (let i = 0; i < lighter.bits.length; i += 1)
        if (lighter.bits[i] === 1) expect(denser.bits[i]).toBe(1);
      expect(count(denser)).toBeGreaterThan(count(lighter));
    }
    // every lit pixel's 2 px cell partner is lit too (aligned to the plate's top left)
    for (let y = 1; y < 23; y += 1)
      for (let x = 1; x < 23; x += 1) {
        const cx = 1 + Math.floor((x - 1) / MARK_CELL) * MARK_CELL;
        const cy = 1 + Math.floor((y - 1) / MARK_CELL) * MARK_CELL;
        expect(plate.bits[y * 24 + x]).toBe(plate.bits[cy * 24 + cx]);
      }
  });

  test('the agent mark is a 50 percent field with a centred square and a dashed ring', () => {
    const agent = renderMarkBits(spec(4), 24);
    expect(spec(4).variant).toBe('agent');
    // the ring alternates two on and two off
    expect([...agent.bits.subarray(0, 8)]).toEqual([1, 1, 0, 0, 1, 1, 0, 0]);
    // the centred 8 px square is solid
    for (let y = 8; y < 16; y += 1)
      for (let x = 8; x < 16; x += 1) expect(agent.bits[y * 24 + x]).toBe(1);
    // the field outside the square is about half lit (the 11 by 11 cell window is not a whole tile)
    const outside = (count(agent, [1, 1, 23, 23]) - 64) / (22 * 22 - 64);
    expect(Math.abs(outside - 0.5)).toBeLessThan(0.1);
    // the corners of the dashed ring stay on
    expect(agent.bits[23]).toBe(1);
    expect(agent.bits[23 * 24]).toBe(1);
    expect(agent.bits[23 * 24 + 23]).toBe(1);
    // the human chip never has a dashed ring
    const human = renderMarkBits(spec(0), 24);
    expect([...human.bits.subarray(0, 8)]).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  test('the glyph grid is mirrored and deterministic; the dither ramp reads its seed', () => {
    const grid = glyphGrid(12345);
    expect(grid).toEqual(glyphGrid(12345));
    for (const row of grid) {
      expect(row).toHaveLength(5);
      expect(row[0]).toBe(row[4]);
      expect(row[1]).toBe(row[3]);
    }
    expect(glyphGrid(1)).not.toEqual(glyphGrid(2));
    expect(rampParams(7)).toEqual(rampParams(7));
    expect(rampParams(7)).not.toEqual(rampParams(8));
    const { cx, cy, angle, curve } = rampParams(99);
    expect(cx).toBeGreaterThanOrEqual(0.25);
    expect(cx).toBeLessThanOrEqual(0.75);
    expect(cy).toBeGreaterThanOrEqual(0.25);
    expect(angle).toBeLessThan(Math.PI);
    expect(curve).toBeGreaterThanOrEqual(0.6);
    // the glyph shapes: a dot is the centre quarter, a square the whole cell, a stroke an L
    expect(glyphInk('dot', 0.5, 0.5)).toBe(true);
    expect(glyphInk('dot', 0.1, 0.1)).toBe(false);
    expect(glyphInk('square', 0.05, 0.95)).toBe(true);
    expect(glyphInk('stroke', 0.1, 0.1)).toBe(true);
    expect(glyphInk('stroke', 0.9, 0.1)).toBe(false);
    expect(glyphInk('stroke', 0.9, 0.9)).toBe(true);
    expect(glyphInk('empty', 0.5, 0.5)).toBe(false);
    // the seeded bits are a permutation stream, never constant
    const next = seededBits(0);
    const a = next();
    expect(next()).not.toBe(a);
  });

  test('a presenter carries the badge and a picture mark is a bare plate', () => {
    const presenter = renderMarkBits(spec(3), 24);
    expect(spec(3).presenter).toBe(true);
    // the 6 px triangle points right: its base at x 16 spans rows 16 to 21, its tip at x 21 sits
    // on rows 18 and 19, and the plate's corner under the tip is paper
    expect(presenter.bits[16 * 24 + 16]).toBe(1);
    expect(presenter.bits[21 * 24 + 16]).toBe(1);
    expect(presenter.bits[18 * 24 + 21]).toBe(1);
    expect(presenter.bits[19 * 24 + 21]).toBe(1);
    expect(presenter.bits[21 * 24 + 21]).toBe(0);
    // the 1 px paper gap above and left of the badge is clear
    expect(presenter.bits[15 * 24 + 15]).toBe(0);
    const plain = renderMarkBits({ ...spec(3), presenter: false }, 24);
    expect(count(presenter)).not.toBe(count(plain));
    const picture = renderMarkBits({ ...spec(8), presenter: false }, 24);
    expect(spec(8).variant).toBe('picture');
    expect(count(picture, [1, 1, 23, 23])).toBe(0);
  });

  test('refuses sizes outside 8 to 1024', () => {
    expect(() => renderMarkBits(spec(0), 4)).toThrow(RangeError);
    expect(() => renderMarkBits(spec(0), 24.5)).toThrow(RangeError);
    expect(() => renderMarkBits(spec(0), 2048)).toThrow(RangeError);
  });
});

describe('renderMarkSvg', () => {
  test('carries the accessible name, the variant, the border and the layers a mark needs', () => {
    const s = spec(0);
    const svg = renderMarkSvg(s, 24, 'light', { live: true });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`aria-label="${s.label}"`);
    expect(svg).toContain('class="ts-mark ts-mark-initials ts-mark-self"');
    expect(svg).toContain('class="ts-mark-border"');
    expect(svg).toContain('class="ts-mark-initials"');
    expect(svg).toContain(`fill="${hueFor(1)}"`);
    expect(svg).toContain('font-size="11"');
    expect(initialsFontSize(16)).toBe(8);
    expect(initialsFontSize(14)).toBe(7);
    expect(initialsFontSize(256)).toBe(117);
    // no stripe on a stored surface, and none without a hue
    expect(renderMarkSvg(s, 24, 'light')).not.toContain('ts-mark-stripe');
    expect(renderMarkSvg({ ...s, hue: null }, 24, 'light', { live: true })).not.toContain(
      'ts-mark-stripe',
    );
    // the halo: two rings outside the border, #070707 inside #ffffff
    const halo = renderMarkSvg(s, 24, 'dark', { halo: true });
    expect(halo).toContain('viewBox="-2 -2 28 28"');
    expect(halo).toContain('stroke="#ffffff"');
    expect(halo).toContain('stroke="#070707"');
    // the picture variant embeds the picture and escapes its URL; the agent ring is dashed
    const picture = renderMarkSvg(spec(8), 24, 'light');
    expect(picture).toContain('<image class="ts-mark-picture"');
    expect(picture).toContain('href="/u/k8/p-32.webp"');
    expect(renderMarkSvg(spec(4), 24, 'light')).toContain('stroke-dasharray="2 2"');
    // the initials are text nodes, escaped
    const hostile = renderMarkSvg({ ...s, initials: '<&' }, 24, 'light');
    expect(hostile).toContain('>&lt;&amp;</text>');
    expect(hostile).not.toContain('<&');
  });

  test('a row of five 24 px chips stays under a kilobyte each', () => {
    for (let i = 0; i < 5; i += 1)
      expect(renderMarkSvg(spec(i), 24, 'light').length).toBeLessThan(4096);
  });
});

describe('the SVG and the PNG agree', () => {
  // 1,000 marks rendered twice take about three seconds alone; the budget is for the chain's load
  // (VERIFICATION-3 finding 45, the ship step's step 5 run); the assertions are unchanged
  test(
    '1,000 marks over the chip and preview sizes carry the same raster in both',
    { timeout: 30_000 },
    () => {
      const sizes = [...MARK_SIZES, ...MARK_PREVIEW_SIZES.filter((s) => s !== 24)];
      for (let i = 0; i < 1000; i += 1) {
        const s = spec(i);
        const size = sizes[i % sizes.length] ?? 24;
        const theme = i % 2 === 0 ? 'light' : 'dark';
        const fromSvg = bitsOfSvg(
          renderMarkSvg(s, size, theme, { live: true, halo: i % 3 === 0 }),
          size,
        );
        const png = decodePng1(renderMarkPng1(s, size, theme));
        expect(png.width).toBe(size);
        expect(png.height).toBe(size);
        expect(Buffer.from(png.bits).equals(Buffer.from(fromSvg.bits))).toBe(true);
        expect(png.palette).toEqual(
          theme === 'light'
            ? [
                [255, 255, 255],
                [7, 7, 7],
              ]
            : [
                [7, 7, 7],
                [242, 242, 240],
              ],
        );
      }
    },
  );

  test('the raster is the same for one spec on every call and differs between two people', () => {
    const a = renderMarkBits(spec(1), 24);
    expect(Buffer.from(renderMarkBits(spec(1), 24).bits).equals(Buffer.from(a.bits))).toBe(true);
    const b = renderMarkBits({ ...spec(1), glyphSeed: spec(1).glyphSeed ^ 1 }, 24);
    expect(spec(1).variant).toBe('glyph');
    expect(Buffer.from(b.bits).equals(Buffer.from(a.bits))).toBe(false);
  });
});
