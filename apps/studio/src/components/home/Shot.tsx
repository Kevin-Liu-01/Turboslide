import type { ShotName } from './copy';
import { SHOT_ALT } from './copy';
import { SHOTS_MANIFEST } from './shots';
import type { ShotRecord } from './shots';

/**
 * One picture of the /home page (gslides-parity SPEC-4 2.4, 0.24, 0.28): an `<img>` over the
 * variants `scripts/build-home-assets.ts` wrote to apps/studio/public/home (the source copy, a
 * 1440 px and a 720 px wide variant, content hashed) with `width`, `height`, `srcset` and `sizes`,
 * so the browser picks the small variant for a card and the layout reserves the box before the
 * bytes arrive (the layout shift gate). Everything under the fold passes `loading="lazy"`; the
 * editor pair above it is eager and the LCP candidate. The alt text is `SHOT_ALT`'s sentence.
 */
export type ShotProps = {
  name: ShotName;
  /** the `sizes` attribute: what width the slot takes at each viewport */
  sizes: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  className?: string;
};

type Shot = ShotRecord;

const SHOTS: ReadonlyMap<string, Shot> = new Map(
  SHOTS_MANIFEST.shots.map((shot) => [shot.name, shot]),
);

/** The manifest's record for a picture; throws for a name the build did not write. */
export function shotOf(name: ShotName): Shot {
  const shot = SHOTS.get(name);
  if (shot === undefined) throw new Error(`no picture named ${name} in shots.json`);
  return shot;
}

/** The `srcset` of a picture: every variant with its width descriptor, widest first. */
export function srcsetOf(shot: Shot): string {
  return shot.variants.map((variant) => `${variant.path} ${variant.width}w`).join(', ');
}

/** The default `src`: the smallest variant, so a browser without srcset support still gets a small file. */
export function fallbackSrcOf(shot: Shot): string {
  const smallest = [...shot.variants].sort((a, b) => a.width - b.width)[0];
  if (smallest === undefined) throw new Error(`${shot.name} has no variant`);
  return smallest.path;
}

export function Shot({ name, sizes, loading = 'lazy', fetchPriority, className }: ShotProps) {
  const shot = shotOf(name);
  return (
    <img
      className={className}
      src={fallbackSrcOf(shot)}
      srcSet={srcsetOf(shot)}
      sizes={sizes}
      width={shot.width}
      height={shot.height}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      alt={SHOT_ALT[name]}
      data-shot={name}
    />
  );
}
