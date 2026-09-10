// Raw image buffers shared by every stage of the effects pipeline (SPEC 5.4). The pipeline runs
// on plain typed arrays so the same code runs in Node, in a worker and later beside the native
// module (SPEC 10): no library type crosses a stage boundary.

/** One byte per pixel, row major, 0 to 255. */
export type GrayImage = { width: number; height: number; data: Uint8Array };

/** Four bytes per pixel, row major, RGBA. */
export type RgbaImage = { width: number; height: number; data: Uint8Array };

/** One byte per pixel, 0 or 1. 1 is a lit cell (paper on the dark twin). */
export type BitImage = { width: number; height: number; bits: Uint8Array };

/** Left, top, right, bottom in pixels. Right and bottom are exclusive. */
export type Box4 = [number, number, number, number];

/** Left, top, width, height in sheet pixels, the Box of SPEC 4.2. */
export type Box = [number, number, number, number];

export function createGray(width: number, height: number): GrayImage {
  return { width, height, data: new Uint8Array(width * height) };
}

export function createBits(width: number, height: number): BitImage {
  return { width, height, bits: new Uint8Array(width * height) };
}

export function invertBits(bits: BitImage): BitImage {
  const out = new Uint8Array(bits.bits.length);
  for (let i = 0; i < out.length; i += 1) out[i] = bits.bits[i] === 0 ? 1 : 0;
  return { width: bits.width, height: bits.height, bits: out };
}

/** The fraction of lit cells in a bit image. */
export function litFraction(bits: BitImage): number {
  let lit = 0;
  for (const b of bits.bits) lit += b;
  return bits.bits.length === 0 ? 0 : lit / bits.bits.length;
}
