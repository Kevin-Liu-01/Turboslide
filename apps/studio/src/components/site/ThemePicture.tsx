/**
 * A capture in each appearance (docs/SITE.md A.3, A.5). The pages follow `html[data-theme]`, which
 * a `<picture>` media query cannot read, so this draws one `<picture>` per appearance and site.css
 * shows the one the root names; the other is `display: none` and lazy, so the browser never
 * fetches it until the appearance changes. Each `<picture>` takes the phone capture at 720 px and
 * under (BRAND_NARROW_MAX_PX). The two have the same alt text; the hidden one is out of the
 * accessibility tree.
 */
type PictureFiles = { wide: string; phone: string };

export type ThemePictureProps = {
  light: PictureFiles;
  dark: PictureFiles;
  /** the wide capture's pixel size, for the box's ratio before it loads */
  wideSize: readonly [number, number];
  phoneSize: readonly [number, number];
  alt: string;
  /** the page's first picture: fetched at high priority once the browser starts it */
  priority?: boolean;
};

export function ThemePicture({
  light,
  dark,
  wideSize,
  phoneSize,
  alt,
  priority = false,
}: ThemePictureProps) {
  return (
    <>
      {(['light', 'dark'] as const).map((appearance) => {
        const files = appearance === 'light' ? light : dark;
        return (
          <picture key={appearance} className={`site-pic is-${appearance}`}>
            <source
              media="(max-width: 720px)"
              srcSet={files.phone}
              width={phoneSize[0]}
              height={phoneSize[1]}
            />
            <img
              src={files.wide}
              width={wideSize[0]}
              height={wideSize[1]}
              alt={alt}
              loading="lazy"
              decoding="async"
              {...(priority ? { fetchPriority: 'high' as const } : {})}
            />
          </picture>
        );
      })}
    </>
  );
}
