import { describe, expect, test } from 'vitest';

import { assetIdOf, checkCredits, creditedNames, moodPictures, moodSlides } from './credits.ts';

const FILES = [
  'decks/gt-brand/slides/mood-gloss.json',
  'decks/gt-brand/slides/title.json',
  'decks/gt-brand/assets/mood-gloss-light.jpg',
  'decks/gt-brand/assets/mood-gloss-dark.jpg',
  'decks/gt-brand/slides/tablet.json',
  'decks/gt-brand/assets/clay-tablet-light.jpg',
  'decks/gt-brand/assets/detail-hero-light.jpg',
  'apps/studio/public/mood/gloss.jpg',
  'apps/studio/public/home/editor-1440-light.png',
];

const TEXTS: Record<string, string> = {
  'decks/gt-brand/slides/mood-gloss.json': '{"kind":"mood","picture":{"asset":"mood-gloss"}}',
  'decks/gt-brand/slides/title.json': '{"kind":"title"}',
  'decks/gt-brand/slides/tablet.json': '{"kind":"mood","picture":{"asset":"clay-tablet"}}',
};

const read = (file: string): string | null => TEXTS[file] ?? null;

describe('the credits check (NEXT.md 4.1.2, 4.1.3 item 25)', () => {
  test('a picture is a mood picture by its slide, its name or its folder', () => {
    expect(assetIdOf('decks/gt-brand/assets/mood-gloss-dark.jpg')).toBe('mood-gloss');
    expect(moodSlides(FILES, read)).toEqual([
      { deck: 'decks/gt-brand', asset: 'mood-gloss' },
      { deck: 'decks/gt-brand', asset: 'clay-tablet' },
    ]);
    expect(moodPictures(FILES, moodSlides(FILES, read))).toEqual([
      'decks/gt-brand/assets/mood-gloss-light.jpg',
      'decks/gt-brand/assets/mood-gloss-dark.jpg',
      'decks/gt-brand/assets/clay-tablet-light.jpg',
      'apps/studio/public/mood/gloss.jpg',
    ]);
  });

  test('a credit row names the picture in backticks and states its licence', () => {
    const record = [
      '| Picture | Credit | Licence |',
      '| --- | --- | --- |',
      '| `mood-gloss` | University of Glasgow Library | public domain |',
      '| `clay-tablet` | The Met | to be read |',
      '| `clay-tablet` | Image: The Met, public domain | None stated | kept out |',
      'A line that names `apps/studio/public/mood/gloss.jpg` under CC0 is no table row.',
    ].join('\n');
    expect([...creditedNames(record)]).toEqual(['mood-gloss']);
    const { pictures, findings } = checkCredits(FILES, read, record);
    expect(pictures).toHaveLength(4);
    expect(findings.map((f) => [f.file, f.text])).toEqual([
      ['decks/gt-brand/assets/clay-tablet-light.jpg', 'clay-tablet'],
      ['apps/studio/public/mood/gloss.jpg', 'gloss'],
    ]);
  });

  test('a path or a file name in a row credits a picture outside a deck', () => {
    const record = [
      '| `apps/studio/public/mood/gloss.jpg` | Glasgow | CC BY 4.0 |',
      '| `clay-tablet` | Met | CC0 |',
      '| `mood-gloss` | Glasgow | public domain |',
    ].join('\n');
    expect(checkCredits(FILES, read, record).findings.map((f) => f.text)).toEqual([]);
  });

  test('without the record every mood picture is a finding', () => {
    expect(checkCredits(FILES, read, null).findings).toHaveLength(4);
  });
});
