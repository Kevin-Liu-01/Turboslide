import { describe, expect, it } from 'vitest';

import { THEME_RECORDS } from '@turboslide/theme/themes';

import { THEME_TILES } from './theme-tiles';

// The Themes screen's copy of the theme library (theme-tiles.ts): the same nine themes in the
// picker's order with the same names, default appearances, compositions, bars, counters, rules
// and colours, so the landing never draws a theme the editor does not have.

describe("the Themes screen's tiles", () => {
  it('are the theme records in the picker order', () => {
    expect(THEME_TILES).toEqual(
      THEME_RECORDS.map((theme) => ({
        id: theme.id,
        name: theme.name,
        appearance: theme.defaultAppearance,
        composition: theme.title.composition,
        accentBar: theme.title.accentBar,
        counter: theme.band.counter,
        rules: { top: theme.frame.top, bottom: theme.frame.bottom, rails: theme.frame.rails },
        colors: theme.colors[theme.defaultAppearance],
      })),
    );
  });
});
