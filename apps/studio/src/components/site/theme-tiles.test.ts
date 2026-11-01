import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { THEME_RECORDS } from '@turboslide/theme/themes';

import pictures from './theme-pictures.json';
import { THEME_TILES } from './theme-tiles';

// The Themes screen's copy of the theme library (theme-tiles.ts): the same nine themes in the
// picker's order with the same names, each with the renderer's picture of the landing deck's title
// slide in it. scripts/site/theme-tiles.mjs records the sha256 of each theme's record and of the
// slide beside the pictures, so a theme changed without a new picture fails here, and the landing
// never shows a theme the editor no longer draws.

const here = dirname(fileURLToPath(import.meta.url));
const slide = readFileSync(
  join(here, '..', '..', '..', 'home-deck', 'slides', 'title.json'),
  'utf8',
);
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

describe("the Themes screen's tiles", () => {
  it('are the theme records in the picker order', () => {
    expect(THEME_TILES.map(({ id, name }) => ({ id, name }))).toEqual(
      THEME_RECORDS.map((theme) => ({ id: theme.id, name: theme.name })),
    );
  });

  it('show a picture rendered from each theme as it stands', () => {
    expect(Object.keys(pictures)).toEqual(THEME_RECORDS.map((theme) => theme.id));
    for (const theme of THEME_RECORDS) {
      expect(pictures[theme.id as keyof typeof pictures], theme.id).toBe(
        sha(JSON.stringify(theme) + slide),
      );
      const bytes = statSync(join(here, 'pictures', `theme-${theme.id}.webp`)).size;
      expect(bytes, theme.id).toBeLessThanOrEqual(22_000);
    }
  });
});
