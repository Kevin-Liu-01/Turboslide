/**
 * The generated portraits of the title's people (docs/SITE.md B): a head and shoulders in one of
 * five hair cuts and three collars, drawn as one small svg from the person's generated name, so
 * the same name always draws the same portrait. No photo, no real person and no initial: the
 * people of the stack are the anonymous labels the product gives a visitor. The colours are the
 * theme's: each part is a class that site.css fills from the person's live hue (`--ts-hue`) mixed
 * with paper and ink, and the portrait keeps those colours in both appearances, as a picture does.
 */

/** The hair cuts, in the order the hash picks them. */
export const HAIR = ['crop', 'bob', 'bun', 'long', 'curls'] as const;
type Hair = (typeof HAIR)[number];

/** The collars of the garment. */
const COLLARS = ['crew', 'vee', 'shirt'] as const;
type Collar = (typeof COLLARS)[number];

export type PortraitSpec = { hair: Hair; collar: Collar; glasses: boolean };

/** FNV-1a over the name's code units: small, stable and the same in every runtime. */
function hash(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The portrait a name draws. `index` (the person's place in the stack) picks the hair cut, so the
 * five people of the stack never share one; the name's hash picks the collar and the glasses.
 */
export function portraitFor(name: string, index: number): PortraitSpec {
  const h = hash(name);
  return {
    hair: HAIR[((index % HAIR.length) + HAIR.length) % HAIR.length] ?? 'crop',
    collar: COLLARS[h % COLLARS.length] ?? 'crew',
    glasses: ((h >>> 8) & 3) === 0,
  };
}

/** The hair drawn behind the head (long hair falls behind the shoulders). */
const HAIR_BACK: Partial<Record<Hair, string>> = {
  long: 'M10.6 31c-1.9-10.6-.5-22.8 9.4-22.8s11.3 12.2 9.4 22.8z',
  bob: 'M11.4 23.6c-1.7-9 1.5-15.8 8.6-15.8s10.3 6.8 8.6 15.8z',
};

/** The hair drawn over the head. */
const HAIR_FRONT: Record<Hair, string> = {
  crop: 'M12.7 16.4c-.4-5.6 2.9-9.2 7.5-9.2 4.5 0 7.7 3.4 7.2 9-1.5-2.7-4.2-4.1-7.4-4.1-3.2 0-5.8 1.5-7.3 4.3z',
  bob: 'M12.4 17.6c.2-5.8 3.4-9.6 7.8-9.6 4.3 0 7.4 3.6 7.6 9.4-2.6-1.2-4.6-3-5.9-5.4-1.9 2.9-5.3 4.9-9.5 5.6z',
  bun: 'M12.8 16.2c-.3-5.2 3-8.6 7.3-8.6 4.4 0 7.5 3.3 7.1 8.5-1.6-2.4-4.2-3.6-7.2-3.6-3.1 0-5.7 1.2-7.2 3.7zM20 3.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z',
  long: 'M12.5 17c.1-5.9 3.3-9.6 7.6-9.6 4.4 0 7.5 3.7 7.4 9.6-3.1-.6-5.7-2.4-7.4-5-1.8 2.6-4.5 4.4-7.6 5z',
  curls:
    'M13.6 9.8a3.3 3.3 0 0 1 4-2.9 3.4 3.4 0 0 1 4.8 0 3.3 3.3 0 0 1 4 2.9 3.4 3.4 0 0 1 1.9 4.6 3.3 3.3 0 0 1-.6 2.5c-1.6-2.5-4.4-3.9-7.7-3.9s-6.1 1.4-7.7 3.9a3.3 3.3 0 0 1-.6-2.5 3.4 3.4 0 0 1 1.9-4.6z',
};

/** The garment's neckline cut over the shoulders. */
const COLLAR_PATH: Record<Collar, string> = {
  crew: 'M15.6 28.6c1.1 1.6 2.6 2.4 4.4 2.4s3.3-.8 4.4-2.4z',
  vee: 'M15.6 28.6 20 34.2l4.4-5.6z',
  shirt: 'M15.6 28.6 20 32.6l4.4-4zM15.6 28.6l-1.4 3.6 3.6-1.4zM24.4 28.6l1.4 3.6-3.6-1.4z',
};

export function Portrait({ name, index }: { name: string; index: number }) {
  const spec = portraitFor(name, index);
  const back = HAIR_BACK[spec.hair];
  return (
    <svg
      className="site-face"
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
      data-hair={spec.hair}
    >
      <rect className="site-face-bg" width="40" height="40" />
      {back === undefined ? null : <path className="site-face-hair" d={back} />}
      <path className="site-face-cloth" d="M3.4 41c1-8 7.2-12.6 16.6-12.6S35.6 33 36.6 41z" />
      <path className="site-face-collar" d={COLLAR_PATH[spec.collar]} />
      <path
        className="site-face-neck"
        d="M16.9 23.4h6.2v5c0 1.7-1.4 3.1-3.1 3.1s-3.1-1.4-3.1-3.1z"
      />
      <ellipse className="site-face-skin" cx="20" cy="17.6" rx="7" ry="8" />
      <path className="site-face-hair" d={HAIR_FRONT[spec.hair]} />
      {spec.glasses ? (
        <path
          className="site-face-glasses"
          d="M14.6 18.6a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0zM20.8 18.6a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0zM19.2 18.4h1.6"
        />
      ) : null}
    </svg>
  );
}
