import { describe, expect, test } from 'vitest';

import type { AvatarChoice } from './principal.ts';
import { PICTURE_MARK_SIZE, PICTURE_SIZES, pictureUrlAt, pictureUrlOf } from './picture.ts';

// The picture URL grammar (docs/PEOPLE.md 4.4, 6.5): `<base>/<digest>-<size>.webp`, the 64 px file
// on the mark, every other size derived from it by the path alone.

const DIGEST = 'a'.repeat(64);
const BASE = 'https://store.example.test/u/AbCdEfGhIjKlMnOpQrStUv';
const CHOICE: AvatarChoice = {
  variant: 'picture',
  picture: { avatarKey: 'AbCdEfGhIjKlMnOpQrStUv', digest: DIGEST, sizes: [32, 64, 128, 256], base: BASE },
};

describe('pictureUrlOf', () => {
  test('answers the file of each size from a picture choice with a base', () => {
    for (const size of PICTURE_SIZES)
      expect(pictureUrlOf(CHOICE, size)).toBe(`${BASE}/${DIGEST}-${size}.webp`);
  });

  test('answers undefined for a non picture choice, a picture without a base, or no choice', () => {
    expect(pictureUrlOf({ variant: 'initials' }, 64)).toBeUndefined();
    expect(pictureUrlOf({ variant: 'glyph', salt: 3 }, 64)).toBeUndefined();
    const { base: _base, ...picture } = CHOICE.picture!;
    expect(pictureUrlOf({ variant: 'picture', picture }, 64)).toBeUndefined();
    expect(pictureUrlOf(null, 64)).toBeUndefined();
    expect(pictureUrlOf(undefined, 64)).toBeUndefined();
  });
});

describe('pictureUrlAt', () => {
  const mark = pictureUrlOf(CHOICE, PICTURE_MARK_SIZE);

  test('answers each size from the 64 px URL', () => {
    expect(mark).toBe(`${BASE}/${DIGEST}-64.webp`);
    for (const size of PICTURE_SIZES) expect(pictureUrlAt(mark, size)).toBe(`${BASE}/${DIGEST}-${size}.webp`);
  });

  test('keeps a checkout route base as it is', () => {
    const local = `/api/avatar/u/AbCdEfGhIjKlMnOpQrStUv/${DIGEST}-64.webp`;
    expect(pictureUrlAt(local, 32)).toBe(`/api/avatar/u/AbCdEfGhIjKlMnOpQrStUv/${DIGEST}-32.webp`);
  });

  test('answers undefined for anything else', () => {
    expect(pictureUrlAt(undefined, 64)).toBeUndefined();
    expect(pictureUrlAt('', 64)).toBeUndefined();
    expect(pictureUrlAt(`${BASE}/${DIGEST}-64.png`, 64)).toBeUndefined();
    expect(pictureUrlAt(`${BASE}/${DIGEST}-48.webp`, 64)).toBeUndefined();
    expect(pictureUrlAt(`${BASE}/not-a-digest-64.webp`, 64)).toBeUndefined();
    expect(pictureUrlAt(mark, 48 as never)).toBeUndefined();
    expect(pictureUrlAt('https://example.test/picture.webp', 64)).toBeUndefined();
  });
});
