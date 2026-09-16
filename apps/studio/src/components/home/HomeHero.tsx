import { useEffect, useRef } from 'react';

import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';

import { HERO } from './copy';
import { HomeLink } from './HomeLink';

/**
 * The live monochrome hero's switch (gslides-parity SPEC-5 11; SPEC-4 7): the mount runs only
 * when this is true and the five conditions below hold. Off at merge 2: the second
 * `perf-budget.mjs` run counts the deferred materials chunk against /home's 600 KB JS budget, and
 * the still twin stays until that run shows room (BUILD-STATUS-5.md "Integrator"). The mount
 * runs `paper:liquid-metal` with the capture's recipe (packages/theme/brand/hero.recipe.json) under
 * the twin and crossfades in over `--pt-dur-enter`; a hidden document or reduced motion unmounts it.
 */
export const HERO_LIVE = false;

/** The capture's recipe (hero.recipe.json), spelt here so the page imports no JSON. */
const HERO_RECIPE = {
  materialId: 'paper:liquid-metal',
  uniforms: {
    u_colorBack: '#000000',
    u_colorTint: '#ffffff',
    u_repetition: 3,
    u_softness: 0.05,
    u_distortion: 0.07,
    u_contour: 0.6,
    u_angle: 70,
  },
  anchor: 5500,
} as const;

/** The five conditions of SPEC-5 11 read once, after the largest contentful paint and on idle. */
export function heroMayGoLive(win: Window = window): boolean {
  if (!HERO_LIVE) return false;
  if (win.document.visibilityState !== 'visible') return false;
  if (win.innerWidth < 900) return false;
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const canvas = win.document.createElement('canvas');
  return canvas.getContext('webgl2') !== null;
}

function useLiveHero(host: { current: HTMLDivElement | null }): void {
  useEffect(() => {
    if (typeof window === 'undefined' || !heroMayGoLive()) return;
    let disposed = false;
    let dispose: (() => void) | null = null;
    const idle = (run: () => void): void => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(run);
      else window.setTimeout(run, 1200);
    };
    idle(() => {
      if (disposed || host.current === null) return;
      const mount = document.createElement('div');
      mount.className = 'ts-product-hero-live';
      host.current.appendChild(mount);
      void import('@turboslide/materials/mount').then(async ({ mountMaterial }) => {
        if (disposed) return;
        try {
          const handle = await mountMaterial(mount, HERO_RECIPE, { speed: 1 });
          if (disposed) {
            handle.dispose();
            return;
          }
          mount.setAttribute('data-live', '');
          dispose = () => {
            handle.dispose();
            mount.remove();
          };
        } catch {
          mount.remove();
        }
      });
    });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && dispose !== null) {
        dispose();
        dispose = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      dispose?.();
    };
  }, [host]);
}

/**
 * The hero (gslides-parity SPEC-4 2.3, 0.6, 0.7, 0.21, 0.22): a 640 px band, full width, the
 * still two tone twin of one captured liquid metal frame at its own cells (a 1600 by 900 picture
 * shown at that size, `image-rendering: pixelated`, cropped by the band, never scaled) behind an
 * opaque plate lower left at 740 px, the deck's own opener composition. The plate carries the
 * `h1` lockup (the 48 px solid mark and the word at 66 px as live text), the one sentence at
 * `--ts-lead`, the three buttons (New Presentation as a document navigation, Open the GT Deck as
 * a router `Link`, GitHub in a new tab) and the fact line. Nothing animates. The twin is
 * decorative (`aria-hidden`; the plate's text is the content) and follows the stored theme
 * through the two custom properties `home.tsx` sets from `SITE.twins.hero`, so the light and the
 * dark twin are both B1's files by the paths `site.ts` exports; the credit line sits under the
 * band on the page's ground, where no cell sits behind it.
 */
export function HomeHero() {
  const twin = useRef<HTMLDivElement | null>(null);
  useLiveHero(twin);
  return (
    <>
      <section className="ts-product-hero" aria-labelledby="ts-product-h1">
        <div ref={twin} className="ts-product-hero-twin" aria-hidden="true" data-twin="hero" />
        <div className="ts-product-rail ts-product-hero-rail">
          <div className="ts-product-plate">
            <h1 id="ts-product-h1" className="ts-product-h1">
              <TurboslideMark size={48} aria-hidden="true" className="ts-product-h1-mark" />
              <span className="ts-product-h1-word">{HERO.word}</span>
            </h1>
            <p className="ts-product-lead ts-product-hero-sentence">{HERO.sentence}</p>
            <div className="ts-product-cta">
              <HomeLink
                href={HERO.buttons.newPresentation.href}
                tip={HERO.buttons.newPresentation.tip}
                control="home.hero.new"
                className="pt-ib is-solid"
              >
                {HERO.buttons.newPresentation.label}
              </HomeLink>
              <HomeLink
                href={`/deck/${HERO.buttons.openDeck.deckId}`}
                tip={HERO.buttons.openDeck.tip}
                control="home.hero.deck"
                className="pt-ib"
              >
                {HERO.buttons.openDeck.label}
              </HomeLink>
              <HomeLink
                href={HERO.buttons.github.href}
                external
                tip={HERO.buttons.github.tip}
                control="home.hero.github"
                className="pt-ib"
              >
                {HERO.buttons.github.label}
              </HomeLink>
            </div>
            <p className="ts-product-hero-facts">{HERO.facts}</p>
          </div>
        </div>
      </section>
      <div className="ts-product-rail">
        <p className="ts-product-credit">{HERO.credit}</p>
      </div>
    </>
  );
}
