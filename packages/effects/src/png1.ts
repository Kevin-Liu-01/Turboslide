// A 1-bit PNG encoder in plain Node (SPEC 5.4, 10): bit packing, one filter byte per row,
// zlib deflate, CRC chunks. Measured at 12 ms for 3200 by 1800 against 219 ms for sharp's
// palette path (slides report section 3.2). The default output is grayscale at bit depth 1
// (0 black, 1 white), the form of the deck's two-color files; a two-entry palette writes the
// exact ink and paper of a theme instead.
import { crc32, deflateSync } from 'node:zlib';

import type { BitImage } from './image.ts';

export type Png1Options = {
  /** When set, colour type 3 with this two-entry palette: index 0 for unlit cells, 1 for lit. */
  palette?: [[number, number, number], [number, number, number]];
  /** zlib level, default 6. */
  level?: number;
};

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type: string, body: Uint8Array): Uint8Array {
  const typeBytes = Buffer.from(type, 'latin1');
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  typeBytes.copy(out, 4);
  Buffer.from(body.buffer, body.byteOffset, body.byteLength).copy(out, 8);
  const crc = crc32(
    Buffer.concat([typeBytes, Buffer.from(body.buffer, body.byteOffset, body.byteLength)]),
  );
  out.writeUInt32BE(crc >>> 0, 8 + body.length);
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/** Pack a bit image into PNG scanlines: filter byte 0, then bits most significant first. */
export function packScanlines(bits: BitImage): Uint8Array {
  const stride = Math.ceil(bits.width / 8);
  const out = new Uint8Array((stride + 1) * bits.height);
  for (let y = 0; y < bits.height; y += 1) {
    const rowIn = y * bits.width;
    const rowOut = y * (stride + 1) + 1;
    for (let x = 0; x < bits.width; x += 1) {
      if (bits.bits[rowIn + x])
        out[rowOut + (x >> 3)] = (out[rowOut + (x >> 3)] ?? 0) | (0x80 >> (x & 7));
    }
  }
  return out;
}

export function encodePng1(bits: BitImage, options: Png1Options = {}): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(bits.width, 0);
  ihdr.writeUInt32BE(bits.height, 4);
  ihdr[8] = 1;
  ihdr[9] = options.palette ? 3 : 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const parts: Uint8Array[] = [SIGNATURE, chunk('IHDR', new Uint8Array(ihdr))];
  if (options.palette) {
    const plte = new Uint8Array(6);
    plte.set(options.palette[0], 0);
    plte.set(options.palette[1], 3);
    parts.push(chunk('PLTE', plte));
  }
  const raw = packScanlines(bits);
  const deflated = deflateSync(raw, { level: options.level ?? 6 });
  parts.push(
    chunk('IDAT', new Uint8Array(deflated.buffer, deflated.byteOffset, deflated.byteLength)),
  );
  parts.push(chunk('IEND', new Uint8Array(0)));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
