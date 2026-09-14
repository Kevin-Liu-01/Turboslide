// Decoding and encoding at the package boundary through sharp (SPEC 3.2: RGBA decode, JPEG and
// PNG encode, libvips). Everything between decode and encode is the pure pipeline, so a worker
// or the native module can replace either end without touching the stages.
import { readFile, writeFile } from 'node:fs/promises';

import sharp from 'sharp';

import type { BitImage, RgbaImage } from './image.ts';

// The untrusted loaders are blocked at module load (gslides-parity SPEC-3 0.29, 8.5; report 04
// F17): HEIF and JXL never decode here, so `decodeImage` on a kept source file is covered as the
// intake path is (packages/headless blockUntrustedLoaders runs the same call on its side).
sharp.block({ operation: ['VipsForeignLoadHeif', 'VipsForeignLoadJxl'] });
import { encodePng1 } from './png1.ts';
import type { Png1Options } from './png1.ts';

/** Decode a PNG or JPEG file or buffer to RGBA. Alpha is kept as stored; the tone stage ignores it. */
export async function decodeImage(input: string | Uint8Array): Promise<RgbaImage> {
  const source = typeof input === 'string' ? await readFile(input) : input;
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  };
}

/** Encode RGBA to PNG through libvips (measured the fastest RGBA PNG encoder, slides report 3.2). */
export async function encodePngRgba(image: RgbaImage, compressionLevel = 6): Promise<Uint8Array> {
  const out = await sharp(
    Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    {
      raw: { width: image.width, height: image.height, channels: 4 },
    },
  )
    .png({ compressionLevel })
    .toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/** Write a one-bit image as a 1-bit PNG. */
export async function writePng1(
  path: string,
  bits: BitImage,
  options?: Png1Options,
): Promise<number> {
  const bytes = encodePng1(bits, options);
  await writeFile(path, bytes);
  return bytes.length;
}

// The dither's variant files (dither-io.ts) are reachable through this subpath until the package's
// exports carry `./dither-io` (a request of build-3/b5.md); the module imports sharp as this one does.
export * from './dither-io.ts';
