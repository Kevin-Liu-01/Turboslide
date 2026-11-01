import { THEMES_SCREEN } from './copy';
import { ScreenHead } from './ScreenHead';
import { THEME_PICTURE, THEME_TILES } from './theme-tiles';

/**
 * The Themes screen: the title slide of the landing's own deck in each of the library's nine
 * themes, in the picker's order, three a row. Each tile is the renderer's picture of the slide in
 * the theme and the appearance it opens in, whatever the page's, so it shows the theme's own faces,
 * its title shape and its edge as a deck draws them (theme-tiles.ts), with the theme's name under
 * it. Static: no script, and the pictures load as they near the window.
 */
export function ThemesScreen() {
  return (
    <section className="site-claim site-th" id="themes" aria-labelledby="site-themes-title">
      <ScreenHead titleId="site-themes-title" heading={THEMES_SCREEN.heading} />
      <ul className="site-th-grid site-wrap" aria-label={THEMES_SCREEN.name}>
        {THEME_TILES.map((tile) => (
          <li key={tile.id} className="site-th-tile">
            <img
              className="site-th-pic"
              src={tile.picture}
              width={THEME_PICTURE.width}
              height={THEME_PICTURE.height}
              alt={THEMES_SCREEN.alt(tile.name)}
              loading="lazy"
              decoding="async"
            />
            <p className="site-th-name">{tile.name}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
