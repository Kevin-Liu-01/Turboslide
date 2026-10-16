import type { CSSProperties } from 'react';

import { FIGURE_SIZES } from '../../docs/figures';
import { figureSource } from '../../docs/markdown';
import { Frame } from './Frame';

/**
 * A crop of the product on a site page: one of the docs' figures (public/docs/figures, written by
 * scripts/site/capture.mjs), in the square frame with corner crosses, at its native width at most,
 * one `<picture>` per appearance (the other never fetched, as ThemePicture draws it) with the
 * phone cut at 720 px and under where the capture has one.
 */
export function ProductCrop({
  name,
  alt,
  caption,
}: {
  name: string;
  alt: string;
  caption: string;
}) {
  const size = FIGURE_SIZES[name];
  if (size === undefined) return null;
  const vars = { '--crop-w': `${size.width}px` } as CSSProperties;
  return (
    <figure className="site-crop" data-figure={name} style={vars}>
      <Frame className="site-crop-frame">
        {(['light', 'dark'] as const).map((appearance) => (
          <picture key={appearance} className={`site-pic is-${appearance}`}>
            {size.phone === undefined ? null : (
              <source
                media="(max-width: 720px)"
                srcSet={figureSource(name, appearance, true)}
                width={size.phone.width}
                height={size.phone.height}
              />
            )}
            <img
              src={figureSource(name, appearance, false)}
              width={size.width}
              height={size.height}
              alt={alt}
              loading="lazy"
              decoding="async"
            />
          </picture>
        ))}
      </Frame>
      <figcaption className="t-small">{caption}</figcaption>
    </figure>
  );
}
