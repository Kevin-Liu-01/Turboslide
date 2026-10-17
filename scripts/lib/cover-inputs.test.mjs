// The GT cover's inputs (scripts/lib/cover-inputs.ts; hardening HR-PS#10): the committed cover was
// rendered from the seed deck as it is now, so an edit to the slide it pictures, that slide's
// picture or the deck's settings fails `pnpm test` until `node scripts/build-brand.ts --cover`
// renders the cover again; step 29 (`build-brand.ts --check`) refuses the same. On a copy of the
// inputs: what moves the digest and what leaves it alone.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GT_COVER } from '../../packages/theme/brand/site.ts';
import { coverInputs } from './cover-inputs.ts';

const SEED = fileURLToPath(new URL(`../../decks/${GT_COVER.deck}`, import.meta.url));
const SLIDE = `slides/${GT_COVER.slide}.json`;
const PICTURE = 'assets/opener-brand-dark.jpg';

describe('the GT cover against its seed deck', () => {
  it('was rendered from the deck as it is now (run node scripts/build-brand.ts --cover otherwise)', () => {
    expect(coverInputs(SEED, GT_COVER.slide)).toBe(GT_COVER.inputs);
  });
});

describe('what the digest reads (coverInputs)', () => {
  let dir = '';
  const json = (relative) => JSON.parse(readFileSync(join(dir, relative), 'utf8'));
  const write = (relative, value, indent = 2) =>
    writeFileSync(join(dir, relative), `${JSON.stringify(value, null, indent)}\n`);
  const digest = () => coverInputs(dir, GT_COVER.slide);

  beforeEach(() => {
    // the inputs the digest reads, and a second slide that is not one of them
    dir = mkdtempSync(join(tmpdir(), 'turboslide-cover-inputs-'));
    mkdirSync(join(dir, 'slides'));
    mkdirSync(join(dir, 'assets'));
    for (const relative of [
      'deck.json',
      SLIDE,
      'slides/title.json',
      PICTURE,
      'assets/opener-brand-light.jpg',
    ])
      copyFileSync(join(SEED, relative), join(dir, relative));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is the seed deck’s on a copy of its inputs', () => {
    expect(digest()).toBe(coverInputs(SEED, GT_COVER.slide));
  });

  it('stays through a write elsewhere: the bookkeeping, the formatting, another slide, another picture', () => {
    const before = digest();
    const deck = json('deck.json');
    const { revision, updatedAt, ...rest } = deck;
    write(
      'deck.json',
      { updatedAt: '2026-10-17T00:00:00.000Z', ...rest, revision: revision + 7 },
      4,
    );
    const title = json('slides/title.json');
    write('slides/title.json', { ...title, edited: 'another slide' });
    const other = Object.keys(deck.assets).find((id) => id !== 'opener-brand');
    write('deck.json', {
      ...json('deck.json'),
      assets: { ...deck.assets, [other]: { ...deck.assets[other], alt: 'changed' } },
    });
    expect(updatedAt).toBeDefined();
    expect(digest()).toBe(before);
  });

  it('moves with the slide’s words, its picture’s bytes, its picture’s entry and the deck’s theme', () => {
    const before = digest();
    const seen = new Set([before]);
    const slide = json(SLIDE);
    write(SLIDE, { ...slide, plate: { ...slide.plate, maxWidth: slide.plate.maxWidth + 1 } });
    seen.add(digest());
    write(SLIDE, slide);
    expect(digest()).toBe(before);

    const bytes = readFileSync(join(dir, PICTURE));
    bytes[bytes.length - 3] ^= 0xff;
    writeFileSync(join(dir, PICTURE), bytes);
    seen.add(digest());
    copyFileSync(join(SEED, PICTURE), join(dir, PICTURE));

    const deck = json('deck.json');
    write('deck.json', {
      ...deck,
      assets: { ...deck.assets, 'opener-brand': { ...deck.assets['opener-brand'], gamma: 1 } },
    });
    seen.add(digest());
    write('deck.json', { ...deck, theme: 'gt-ink-paper' });
    seen.add(digest());
    write('deck.json', deck);
    expect(digest()).toBe(before);
    expect(seen.size).toBe(5);
  });

  it('refuses a missing input by its path', () => {
    rmSync(join(dir, PICTURE));
    expect(() => digest()).toThrow(`${join(dir, PICTURE)} is missing`);
  });
});
