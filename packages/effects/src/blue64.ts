// The blue noise threshold texture of pattern 'blue64' (gslides-parity SPEC-3 10.2; research-3 06
// 4.2): a 64 by 64 ranking written by the void and cluster method (Ulichney, 1993) on a torus with
// a Gaussian of sigma 1.9 and a seeded start, so it tiles without a seam and every one of the 256
// values appears exactly 16 times. It was generated once, deterministically, by this package's own
// generator (blue64.test.ts reproduces the algorithm and asserts the bytes) and is committed as
// bytes so no host computes a different table: the sha256 of the 4,096 bytes is pinned by the
// test. The threshold of a cell is trunc((v + 0.5) / 256 * 255), the form of the deck's Bayer table
// (bayer.ts bayerThreshold). Browser safe: no node imports; the base64 is decoded with atob when
// Buffer is absent.
export const BLUE64_SIZE = 64;

/** The sha256 hex digest of the 4,096 texture bytes, in row major order. */
export const BLUE64_SHA256 = '91c033afa198bf8102a4774a6900cf79d911527a726d99d2bca010832559d07b';

const BLUE64_BASE64 = [
  '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',
].join('');

function decodeBase64(text: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  const buffer = Buffer.from(text, 'base64');
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

let cached: Uint8Array | undefined;

/** The 4,096 texture values, 0 to 255, row major; decoded once. */
export function blue64Texture(): Uint8Array {
  cached ??= decodeBase64(BLUE64_BASE64);
  return cached;
}

/** The texture value at a cell, tiled. */
export function blue64(r: number, c: number): number {
  const rr = ((r % BLUE64_SIZE) + BLUE64_SIZE) % BLUE64_SIZE;
  const cc = ((c % BLUE64_SIZE) + BLUE64_SIZE) % BLUE64_SIZE;
  return blue64Texture()[rr * BLUE64_SIZE + cc] ?? 0;
}

/** The integer threshold of a cell: trunc((v + 0.5) / 256 * 255), the Bayer table's rule at 256 levels. */
export function blue64Threshold(r: number, c: number): number {
  return Math.trunc(((blue64(r, c) + 0.5) / 256) * 255);
}

let thresholds: Uint8Array | undefined;

/** The 4,096 thresholds, row major, computed once. */
export function blue64Thresholds(): Uint8Array {
  if (thresholds === undefined) {
    const texture = blue64Texture();
    thresholds = new Uint8Array(texture.length);
    for (let i = 0; i < texture.length; i += 1)
      thresholds[i] = Math.trunc((((texture[i] ?? 0) + 0.5) / 256) * 255);
  }
  return thresholds;
}
