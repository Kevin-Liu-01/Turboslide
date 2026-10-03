import type { ShotKind } from './copy';
import { SHOTS_MANIFEST } from './shots';
import type { ShotRecord } from './shots';

/**
 * One product picture of /home (docs/archive/rounds/POLISH.md 3.3 item 1): the two files the capture wrote for
 * a kind, one per appearance (`scripts/build-home-assets.ts --capture` under
 * apps/studio/public/home, content hashed, a 2x and a 1x candidate each), as two `<img>`
 * elements with `width`, `height`, `srcset` and `sizes`, so the layout reserves the box before
 * the bytes arrive (the layout shift row) and the browser picks the candidate for its density.
 * The stored appearance shows one of the two through `home.css` (`.ts-product-only-dark` and
 * `-light`); both are `loading="lazy"`, so the hidden one, which has no box, is never requested,
 * and the shown one loads with the first layout (the hero carries `fetchpriority="high"`). The
 * hero is drawn at the column's 1024 px content width (0.71 of its 1440 px capture) and the crop
 * at the seven column slot's 555 px (0.91 of its 612 px capture) on the wide layouts.
 */
export type ShotProps = {
  kind: ShotKind;
  alt: string;
  /** the `sizes` attribute: what width the slot takes at each viewport */
  sizes: string;
  /** the hero: the first picture of the page and the LCP candidate */
  priority?: boolean;
};

/**
 * The `sizes` of a crop in the seven column slot of a two column band (3.4) inside the 1104 px
 * column and its 40 px gutters (docs/NEXT.md 4.1.2): 555 px from 1136 px, the slot's share of
 * the column below that, and the column's content width under the 1023 px breakpoint (16 px
 * gutters inside 16 px margins under 720).
 */
export const CROP_SIZES =
  '(min-width: 1136px) 556px, (min-width: 1024px) calc((100vw - 184px) * 7 / 12), (min-width: 721px) calc(100vw - 112px), calc(100vw - 64px)';

/** The `sizes` of the hero picture at the column's content width. */
export const HERO_SIZES =
  '(min-width: 1136px) 1024px, (min-width: 721px) calc(100vw - 112px), calc(100vw - 64px)';

const SHOTS: ReadonlyMap<string, ShotRecord> = new Map(
  SHOTS_MANIFEST.shots.map((shot) => [shot.name, shot]),
);

/** The manifest's record for a picture; throws for a name the capture did not write. */
export function shotOf(name: string): ShotRecord {
  const shot = SHOTS.get(name);
  if (shot === undefined) throw new Error(`no picture named ${name} in shots.json`);
  return shot;
}

/** The `srcset` of a picture: every candidate with its width descriptor, the 2x first. */
export function srcsetOf(shot: ShotRecord): string {
  return shot.variants.map((variant) => `${variant.path} ${variant.width}w`).join(', ');
}

/** The default `src`: the 1x candidate, so a browser without srcset support gets the small file. */
export function fallbackSrcOf(shot: ShotRecord): string {
  const smallest = [...shot.variants].sort((a, b) => a.width - b.width)[0];
  if (smallest === undefined) throw new Error(`${shot.name} has no candidate`);
  return smallest.path;
}

export function Shot({ kind, alt, sizes, priority = false }: ShotProps) {
  return (
    <>
      {(['dark', 'light'] as const).map((theme) => {
        const shot = shotOf(`${kind}-${theme}`);
        return (
          <img
            key={theme}
            className={`ts-product-shot-img ts-product-only-${theme}`}
            src={fallbackSrcOf(shot)}
            srcSet={srcsetOf(shot)}
            sizes={sizes}
            width={shot.width}
            height={shot.height}
            loading="lazy"
            decoding="async"
            fetchPriority={priority ? 'high' : undefined}
            alt={alt}
            data-shot={shot.name}
            data-kind={kind}
          />
        );
      })}
    </>
  );
}
