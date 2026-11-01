import type { CSSProperties } from 'react';

import { THEMES_SCREEN } from './copy';
import { PRESENT_DECK_TOTAL, PRESENT_SLIDES } from './present-deck';
import { ScreenHead } from './ScreenHead';
import { THEME_TILES } from './theme-tiles';
import type { ThemeTile, TileColors } from './theme-tiles';

/** The landing deck's title slide, whose words every tile draws. */
const TITLE = PRESENT_SLIDES.find((slide) => slide.kind === 'title');

/** A theme's colours in the appearance it opens in, as the custom properties site.css reads. */
function colours(c: TileColors): CSSProperties {
  return {
    '--th-paper': c.paper,
    '--th-ink': c.ink,
    '--th-ink-2': c['ink-2'],
    '--th-hint': c.hint,
    '--th-accent': c.accent,
  } as CSSProperties;
}

/** The counter a theme prints on the first slide of the deck. */
function counter(tile: ThemeTile): string | null {
  if (tile.counter === 'none') return null;
  return tile.counter === 'n' ? '1' : `1 / ${PRESENT_DECK_TOTAL}`;
}

/**
 * The Themes screen: the title slide of the landing's own deck in each of the library's nine
 * themes, in the picker's order, three a row. Each tile draws the theme in the appearance it opens
 * in, whatever the page's, with its title composition, its accent bar, its rules and rails and its
 * counter (theme-tiles.ts, held to the theme records by its test), in the deck's Inter, with the
 * theme's name under it. Static: no script.
 */
export function ThemesScreen() {
  if (TITLE === undefined) return null;
  return (
    <section className="site-claim site-th" id="themes" aria-labelledby="site-themes-title">
      <ScreenHead titleId="site-themes-title" heading={THEMES_SCREEN.heading} />
      <ul className="site-th-grid site-wrap" aria-label={THEMES_SCREEN.name}>
        {THEME_TILES.map((tile) => {
          const count = counter(tile);
          return (
            <li key={tile.id} className="site-th-tile" style={colours(tile.colors)}>
              <div
                className="site-mini site-th-sheet"
                data-compose={tile.composition}
                data-appearance={tile.appearance}
              >
                {tile.rules.rails ? (
                  <>
                    <i className="site-th-rail is-left" />
                    <i className="site-th-rail is-right" />
                  </>
                ) : null}
                {tile.rules.top ? <i className="site-th-rule is-top" /> : null}
                {tile.rules.bottom ? <i className="site-th-rule is-bottom" /> : null}
                <div className="site-th-copy">
                  {tile.accentBar ? <i className="site-th-bar" /> : null}
                  <p className="site-th-h">{TITLE.heading}</p>
                  <p className="site-th-lead">{TITLE.lead}</p>
                </div>
                {count === null ? null : <span className="site-th-count">{count}</span>}
              </div>
              <p className="site-th-name">{tile.name}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
