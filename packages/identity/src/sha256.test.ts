import { describe, expect, test } from 'vitest';

import { digestUint32, sha256, sha256Hex } from './sha256.ts';

// FIPS 180-4 test vectors and the boundary cases of the padding (55, 56 and 64 byte inputs land
// on different block counts).
describe('sha256', () => {
  test('matches the published vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  test('pads 55, 56 and 64 byte inputs correctly', () => {
    expect(sha256Hex('a'.repeat(55))).toBe(
      '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318',
    );
    expect(sha256Hex('a'.repeat(56))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    );
    expect(sha256Hex('a'.repeat(64))).toBe(
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
    );
  });

  test('accepts bytes and reads big endian words', () => {
    const digest = sha256(new TextEncoder().encode('abc'));
    expect(digest.length).toBe(32);
    expect(digestUint32(digest, 0)).toBe(0xba7816bf);
    expect(digestUint32(digest, 4)).toBe(0x8f01cfea);
    expect(digestUint32(digest, 28)).toBe(0xf20015ad);
  });
});
