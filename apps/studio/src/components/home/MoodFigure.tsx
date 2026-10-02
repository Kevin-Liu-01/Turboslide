import { MOOD_PICTURES } from '@turboslide/theme/brand/site';
import type { MoodPicture } from '@turboslide/theme/brand/site';

import './mood.css';

/**
 * One of the deck's mood pictures on a page outside the editor (docs/NEXT.md 4.1.3 item 11 and
 * question 5: Not found and the empty /decks state, never /home's first screen): the picture's
 * two tone twin at its own pixels in a 1 px `--pt-edge` frame, cropped to the frame and never
 * scaled (a twin is 1600 by 900 at 2 px cells), the stored appearance's twin alone requested,
 * and the deck's plate under it: the picture's name and its credit as `packages/theme/brand/
 * site.ts` `MOOD_PICTURES` carries them, a picture whose licence lane B4 read on its source page
 * (docs/brand.md section 8). `size` names the frame: the page's (the column's width, 360 px tall
 * * over 1023 px) or the empty state's (its container's width, 240 px tall); both are 220 px tall under
 * the breakpoint. The frame crops the twin from its left edge around its middle row (mood.css).
 */
export function MoodFigure({
  picture = MOOD_PICTURES.earth,
  size = 'page',
  control,
}: {
  picture?: MoodPicture;
  size?: 'page' | 'empty';
  control?: string;
}) {
  return (
    <figure className={`ts-mood ts-mood-${size}`} data-control={control} data-mood={picture.from}>
      <span className="ts-mood-frame">
        {(['light', 'dark'] as const).map((theme) => (
          <img
            key={theme}
            className={`ts-mood-img ts-mood-only-${theme}`}
            src={picture[theme]}
            width={1600}
            height={900}
            alt={picture.alt}
            loading="lazy"
            decoding="async"
            data-theme-twin={theme}
          />
        ))}
      </span>
      <figcaption className="ts-mood-plate">
        <span className="ts-mood-title">{picture.title}</span>
        <span className="ts-mood-credit">{picture.credit}</span>
      </figcaption>
    </figure>
  );
}
