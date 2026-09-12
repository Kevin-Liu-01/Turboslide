// A PNG codec in plain Node for the rendered rules (SPEC 7.7): the render records point at the
// sheet screenshots (8-bit RGB, no interlace, from Chromium), and layout/empty-half,
// contrast/both-themes and lines/law read their pixels. Decoding covers every 8-bit color type
// (gray, gray with alpha, RGB, RGBA, palette) without interlace, which is what Chromium and sharp
// write; anything else is refused with a clear message. Encoding writes RGBA with filter 0 and is
// used by the tests and by callers that want to store a sampled crop. No image library: the
// package depends on schema and render only (SPEC 3.3 item 3).
//
// The namespace import, not named bindings: this module reaches the browser through
// @turboslide/lint/run (the editor imports the store actions of @turboslide/cli, which lint the
// document after a write), where Vite replaces node:zlib with a shim that throws on every named
// access at module evaluation. The rendered rules never run in a page, so touching zlib only at
// call time keeps the import inert there (gslides-parity merge 1, docs/gslides-parity/build).
import * as zlib from 'node:zlib';

/** Four bytes per pixel, row major, RGBA. */
export type Bitmap = { width: number; height: number; data: Uint8Array };

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

type Header = {
  width: number;
  height: number;
  depth: number;
  colorType: number;
  interlace: number;
};

function readU32(bytes: Uint8Array, at: number): number {
  return (
    (((bytes[at] ?? 0) << 24) |
      ((bytes[at + 1] ?? 0) << 16) |
      ((bytes[at + 2] ?? 0) << 8) |
      (bytes[at + 3] ?? 0)) >>>
    0
  );
}

function channelsOf(colorType: number): number {
  switch (colorType) {
    case 0:
      return 1;
    case 2:
      return 3;
    case 3:
      return 1;
    case 4:
      return 2;
    case 6:
      return 4;
    default:
      throw new RangeError(`png: unsupported color type ${colorType}`);
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Undo the per-row filters, returning the raw scanlines without filter bytes; one loop per filter type. */
function unfilter(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;
    const prevOut = rowOut - stride;
    switch (filter) {
      case 0:
        out.set(raw.subarray(rowIn, rowIn + stride), rowOut);
        break;
      case 1:
        for (let i = 0; i < stride; i += 1) {
          const a = i >= bpp ? (out[rowOut + i - bpp] ?? 0) : 0;
          out[rowOut + i] = ((raw[rowIn + i] ?? 0) + a) & 255;
        }
        break;
      case 2:
        for (let i = 0; i < stride; i += 1) {
          const b = y > 0 ? (out[prevOut + i] ?? 0) : 0;
          out[rowOut + i] = ((raw[rowIn + i] ?? 0) + b) & 255;
        }
        break;
      case 3:
        for (let i = 0; i < stride; i += 1) {
          const a = i >= bpp ? (out[rowOut + i - bpp] ?? 0) : 0;
          const b = y > 0 ? (out[prevOut + i] ?? 0) : 0;
          out[rowOut + i] = ((raw[rowIn + i] ?? 0) + ((a + b) >> 1)) & 255;
        }
        break;
      case 4:
        for (let i = 0; i < stride; i += 1) {
          const a = i >= bpp ? (out[rowOut + i - bpp] ?? 0) : 0;
          const b = y > 0 ? (out[prevOut + i] ?? 0) : 0;
          const c = y > 0 && i >= bpp ? (out[prevOut + i - bpp] ?? 0) : 0;
          out[rowOut + i] = ((raw[rowIn + i] ?? 0) + paeth(a, b, c)) & 255;
        }
        break;
      default:
        throw new RangeError(`png: unknown filter ${filter} on row ${y}`);
    }
  }
  return out;
}

/** Decode an 8-bit, non-interlaced PNG to RGBA. */
export function decodePng(bytes: Uint8Array): Bitmap {
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (bytes[i] !== SIGNATURE[i]) throw new RangeError('png: not a PNG file');
  }
  let header: Header | undefined;
  let palette: Uint8Array | undefined;
  let alphaTable: Uint8Array | undefined;
  const idat: Uint8Array[] = [];
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = readU32(bytes, at);
    const type = String.fromCharCode(
      bytes[at + 4] ?? 0,
      bytes[at + 5] ?? 0,
      bytes[at + 6] ?? 0,
      bytes[at + 7] ?? 0,
    );
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: readU32(body, 0),
        height: readU32(body, 4),
        depth: body[8] ?? 0,
        colorType: body[9] ?? 0,
        interlace: body[12] ?? 0,
      };
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') alphaTable = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!header) throw new RangeError('png: no IHDR chunk');
  if (header.depth !== 8) throw new RangeError(`png: bit depth ${header.depth} is not supported`);
  if (header.interlace !== 0) throw new RangeError('png: interlaced files are not supported');
  const channels = channelsOf(header.colorType);
  const total = idat.reduce((sum, part) => sum + part.length, 0);
  const compressed = new Uint8Array(total);
  let offset = 0;
  for (const part of idat) {
    compressed.set(part, offset);
    offset += part.length;
  }
  const raw = zlib.inflateSync(compressed);
  const { width, height } = header;
  const expected = (width * channels + 1) * height;
  if (raw.length < expected)
    throw new RangeError(`png: ${raw.length} bytes of scanlines, expected ${expected}`);
  const pixels = unfilter(
    new Uint8Array(raw.buffer, raw.byteOffset, expected),
    width,
    height,
    channels,
  );
  const data = new Uint8Array(width * height * 4);
  const n = width * height;
  switch (header.colorType) {
    case 0:
      for (let i = 0; i < n; i += 1) {
        const g = pixels[i] ?? 0;
        data.set([g, g, g, 255], i * 4);
      }
      break;
    case 2:
      for (let i = 0; i < n; i += 1) {
        data[i * 4] = pixels[i * 3] ?? 0;
        data[i * 4 + 1] = pixels[i * 3 + 1] ?? 0;
        data[i * 4 + 2] = pixels[i * 3 + 2] ?? 0;
        data[i * 4 + 3] = 255;
      }
      break;
    case 3: {
      if (!palette) throw new RangeError('png: palette image without PLTE');
      for (let i = 0; i < n; i += 1) {
        const index = pixels[i] ?? 0;
        data[i * 4] = palette[index * 3] ?? 0;
        data[i * 4 + 1] = palette[index * 3 + 1] ?? 0;
        data[i * 4 + 2] = palette[index * 3 + 2] ?? 0;
        data[i * 4 + 3] = alphaTable?.[index] ?? 255;
      }
      break;
    }
    case 4:
      for (let i = 0; i < n; i += 1) {
        const g = pixels[i * 2] ?? 0;
        data.set([g, g, g, pixels[i * 2 + 1] ?? 255], i * 4);
      }
      break;
    default:
      data.set(pixels.subarray(0, n * 4));
      break;
  }
  return { width, height, data };
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(typeBytes, 4);
  out.set(body, 8);
  const crcInput = new Uint8Array(4 + body.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(body, 4);
  view.setUint32(8 + body.length, zlib.crc32(crcInput) >>> 0);
  return out;
}

/** Encode RGBA as an 8-bit truecolor-with-alpha PNG, filter 0 on every row. */
export function encodePng(bitmap: Bitmap, level = 6): Uint8Array {
  const { width, height, data } = bitmap;
  const stride = width * 4;
  const scanlines = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    scanlines[y * (stride + 1)] = 0;
    scanlines.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const deflated = zlib.deflateSync(scanlines, { level });
  const parts = [
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflated.buffer, deflated.byteOffset, deflated.byteLength)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
