import type { MutableRefObject } from 'react';
import { useRef } from 'react';

import { useMountEffect } from '../useMountEffect';
import { HERO } from './copy';
import { attachHeroBox } from './frame-boxes';
import type { OnPress } from './frame-boxes';
import { ThemePicture } from './ThemePicture';

import heroDarkPhone from './pictures/hero-358-dark.webp?url';
import heroLightPhone from './pictures/hero-358-light.webp?url';
import heroDark from './pictures/hero-1280-dark.webp?url';
import heroLight from './pictures/hero-1280-light.webp?url';

/**
 * The hero's box (docs/SITE.md A.3, C.11): the poster, a capture of the live editor in each
 * appearance, in a box whose size never changes. `attachHeroBox` (frame-boxes.ts) loads the live
 * editor over it after the page's `load` and swaps it in; this component calls it on mount, and on
 * /home's static load the page's script does (home-entry.ts). A press on an avatar of the title
 * (`press`) reaches the live editor through it.
 */
export function HeroBox({ press }: { press?: MutableRefObject<OnPress | null> }) {
  const box = useRef<HTMLDivElement>(null);
  useMountEffect(() => {
    if (box.current === null) return undefined;
    const hero = attachHeroBox(box.current);
    if (press !== undefined) press.current = hero.press;
    return () => {
      if (press !== undefined) press.current = null;
      hero.detach();
    };
  });
  return (
    <div
      ref={box}
      className="site-hero-box"
      data-hero-box=""
      data-state="poster"
      data-frame-title={HERO.figure.frameTitle}
    >
      <ThemePicture
        light={{ wide: heroLight, phone: heroLightPhone }}
        dark={{ wide: heroDark, phone: heroDarkPhone }}
        wideSize={[2560, 1280]}
        phoneSize={[716, 1120]}
        alt={HERO.figure.alt}
        priority
      />
    </div>
  );
}
