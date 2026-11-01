import coral from './pictures/theme-coral.webp?url';
import generalTranslation from './pictures/theme-general-translation.webp?url';
import mint from './pictures/theme-mint.webp?url';
import night from './pictures/theme-night.webp?url';
import sand from './pictures/theme-sand.webp?url';
import signal from './pictures/theme-signal.webp?url';
import simple from './pictures/theme-simple.webp?url';
import slate from './pictures/theme-slate.webp?url';
import swiss from './pictures/theme-swiss.webp?url';

/**
 * The nine themes of the library as the Themes screen draws them (ThemesScreen.tsx): each one's
 * id and name in the picker's order, and the renderer's picture of the landing deck's title slide
 * in it (scripts/site/theme-tiles.mjs, 960 by 540). The names are a copy of
 * packages/theme/src/themes.ts THEME_RECORDS, whose import would carry the schema's validators
 * into the landing's script; theme-tiles.test.ts holds the copy equal to the records and each
 * picture to the record it was rendered from (theme-pictures.json).
 */
export type ThemeTile = { id: string; name: string; picture: string };

export const THEME_TILES: readonly ThemeTile[] = [
  { id: 'simple', name: 'Simple', picture: simple },
  { id: 'general-translation', name: 'General Translation', picture: generalTranslation },
  { id: 'swiss', name: 'Swiss', picture: swiss },
  { id: 'mint', name: 'Mint', picture: mint },
  { id: 'coral', name: 'Coral', picture: coral },
  { id: 'night', name: 'Night', picture: night },
  { id: 'slate', name: 'Slate', picture: slate },
  { id: 'sand', name: 'Sand', picture: sand },
  { id: 'signal', name: 'Signal', picture: signal },
];

/** The pictures' size in pixels, written on every tile so the grid holds its height before they load. */
export const THEME_PICTURE = { width: 960, height: 540 } as const;
