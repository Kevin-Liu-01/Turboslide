import type { ShotKind } from './copy';
import { SHOTS_MANIFEST } from './shots';
import type { ShotRecord } from './shots';

/**
 * One product picture of /home (docs/POLISH.md 3.3 item 1): the two files the capture wrote for
 * a kind, one per appearance (`scripts/build-home-assets.ts --capture` under
 * apps/studio/public/home, content hashed, a 2x and a 1x candidate each), as two `<img>`
 * elements with `width`, `height`, `srcset` and `sizes`, so the layout reserves the box before
 * the bytes arrive (the layout shift row) and the browser picks the candidate for its density.
 * The stored appearance shows one of the two through `home.css` (`.ts-product-only-dark` and
 * `-light`); both are `loading="lazy"`, so the hidden one, which has no box, is never requested,
 * and the shown one loads with the first layout (the hero carries `fetchpriority="high"`). The
 * hero is drawn at the rail's 1120 px (0.78 of its 1440 px capture); the crops at 1:1 of their
 * capture on the wide layouts.
 */
export type ShotProps = {
  kind: ShotKind;
  alt: string;
  /** the `sizes` attribute: what width the slot takes at each viewport */
  sizes: string;
  /** the hero: the first picture of the page and the LCP candidate */
  priority?: boolean;
};

/** The `sizes` of a crop in the seven column slot of a two column band (3.4). */
export const CROP_SIZES =
  '(min-width: 1168px) 611px, (min-width: 761px) calc((100vw - 120px) * 7 / 12), calc(100vw - 40px)';

/** The `sizes` of the hero picture at the rail's width. */
export const HERO_SIZES =
  '(min-width: 1168px) 1120px, (min-width: 761px) calc(100vw - 48px), calc(100vw - 40px)';

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
