import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';

import type { ThemeBundle } from '../deck.ts';
import {
  MOTION_SCRIPT_ID,
  MOTION_STYLE_ID,
  renderStandalone,
  rewriteMediaSources,
  STANDALONE_MOTION_CSS,
} from '../standalone.ts';
import type { StandaloneMotion } from '../standalone.ts';

// The standalone file's motion (gslides-parity SPEC-5 2.3, 2.6; MILESTONES-5 B1 day 6): `#ts-motion`
// and `#ts-motion-css` for the motion fixture alone and never for the GT deck, `data-block` on the
// blocks of a deck with motion, `motion: 'drop'`, `data-autoplay` and `data-loop` on the stage,
// the three media modes, the motion script after the runtime, the used faces at the fonts slot.

const REPO = resolve(import.meta.dirname, '../../../..');
const bundle: ThemeBundle = {
  sheetCss: '',
  stageCss: '',
  sprite: '<svg id="sprite"></svg>',
  fontsCss: '/* inter */',
};

function loadDeck(dir: string): { deck: Deck; slides: Slide[] } {
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Deck;
  const slides = readdirSync(join(dir, 'slides')).map(
    (file) => JSON.parse(readFileSync(join(dir, 'slides', file), 'utf8')) as Slide,
  );
  return { deck, slides };
}

const motion = loadDeck(join(REPO, 'decks/fixture/motion'));
const gt = loadDeck(join(REPO, 'decks/gt-brand'));

function payloadOf(html: string): StandaloneMotion {
  const match = new RegExp(
    `<script type="application/json" id="${MOTION_SCRIPT_ID}">([\\s\\S]*?)</script>`,
  ).exec(html);
  if (match === null) throw new Error('no #ts-motion');
  return JSON.parse(match[1]!) as StandaloneMotion;
}

describe('renderStandalone with motion', () => {
  it('writes #ts-motion and #ts-motion-css for the motion fixture, with data-block on the blocks', () => {
    const result = renderStandalone(motion.deck, motion.slides, {
      bundle,
      assetUris: {},
      motionScript: '(function(){window.__tsMotion={}})();',
    });
    // every fixture slide carries motion (t-none has an animation without a transition)
    expect(result.motion).toEqual(slideOrder(motion.deck));
    expect(result.html).toContain(`<style id="${MOTION_STYLE_ID}">`);
    expect(result.html).toContain(STANDALONE_MOTION_CSS);
    expect(result.html).toContain('.is-hidden{visibility:hidden!important}');
    expect(result.html).toContain(
      '[data-slide="effects"][data-step="1"] [data-block="b1"].is-entering',
    );
    expect(result.html).toContain('[data-transition="t-cube"]');
    const payload = payloadOf(result.html);
    expect(payload.page).toMatchObject({ width: 1600, height: 900 });
    expect(payload.order).toEqual(slideOrder(motion.deck));
    expect(Object.keys(payload.schedules).sort()).toEqual([...result.motion].sort());
    expect(payload.schedules.effects?.steps.length).toBe(7);
    expect(payload.schedules.media?.steps[0]?.effects[0]?.durationMs).toBe(1000);
    expect(payload.autoplay).toBeUndefined();
    // the blocks carry data-block for the script, and the script follows the runtime
    expect(result.html).toContain('data-block="b1"');
    expect(result.html.indexOf('window.__tsMotion={}')).toBeGreaterThan(
      result.html.indexOf('</script><script>'),
    );
    expect(result.html).not.toContain('data-autoplay');
    expect(result.html).not.toContain('\\u003c/script');
  });

  it('writes nothing of it for the GT deck, whose file stays as it was', () => {
    const result = renderStandalone(gt.deck, gt.slides, {
      bundle,
      assetUris: {},
      motionScript: 'x',
    });
    expect(result.motion).toEqual([]);
    expect(result.html).not.toContain(MOTION_SCRIPT_ID);
    expect(result.html).not.toContain(MOTION_STYLE_ID);
    expect(result.html).not.toContain('__tsMotion');
    const plain = renderStandalone(gt.deck, gt.slides, { bundle, assetUris: {} });
    expect(plain.html).toBe(result.html);
  });

  it('drops the motion under motion: drop and writes the autoplay attributes under autoplay', () => {
    const dropped = renderStandalone(motion.deck, motion.slides, {
      bundle,
      assetUris: {},
      motion: 'drop',
    });
    expect(dropped.motion).toEqual([]);
    expect(dropped.html).not.toContain(MOTION_STYLE_ID);
    expect(dropped.html).not.toContain(MOTION_SCRIPT_ID);
    expect(dropped.slides.every((entry) => !entry.rendered.html.includes('data-block="b1"'))).toBe(
      true,
    );
    const auto = renderStandalone(motion.deck, motion.slides, {
      bundle,
      assetUris: {},
      autoplay: { intervalMs: 5000, loop: true },
    });
    expect(auto.html).toMatch(/<div[^>]*id="stage"[^>]*data-autoplay="5000" data-loop="">/);
    expect(payloadOf(auto.html).autoplay).toEqual({ intervalMs: 5000, loop: true });
    // autoplay on a still deck: the setting travels for the script, no schedules
    const stillAuto = renderStandalone(gt.deck, gt.slides, {
      bundle,
      assetUris: {},
      autoplay: { intervalMs: 1000 },
    });
    expect(stillAuto.html).toContain('data-autoplay="1000"');
    expect(stillAuto.html).not.toContain('data-loop');
    expect(payloadOf(stillAuto.html).schedules).toEqual({});
    expect(stillAuto.html).not.toContain(MOTION_STYLE_ID);
  });

  it("rewrites a media root's data-src per mode: embedded, a URL, or the poster alone", () => {
    const html =
      '<div class="ts-media" data-media="clip" data-kind="video" data-src="assets/bars-1s.webm" data-play="auto"></div>' +
      '<div class="ts-media" data-media="yt" data-kind="video" data-src="" data-youtube="abc"></div>';
    const embedded = rewriteMediaSources(
      html,
      'embed',
      { 'assets/bars-1s.webm': 'data:video/webm;base64,AAAA' },
      '',
    );
    expect(embedded.html).toContain('data-src="data:video/webm;base64,AAAA"');
    expect(embedded.missing).toEqual([]);
    const missing = rewriteMediaSources(html, 'embed', {}, '');
    expect(missing.html).toContain('data-src=""');
    expect(missing.missing).toEqual(['assets/bars-1s.webm']);
    const url = rewriteMediaSources(html, 'url', {}, 'https://turboslide.vercel.app/decks/motion/');
    expect(url.html).toContain(
      'data-src="https://turboslide.vercel.app/decks/motion/assets/bars-1s.webm"',
    );
    const poster = rewriteMediaSources(html, 'poster', { 'assets/bars-1s.webm': 'data:x' }, '');
    expect(poster.html).toContain('data-media="clip" data-kind="video" data-src=""');
    // an empty src (YouTube) is left as it is in every mode
    expect(poster.html).toContain(
      'data-media="yt" data-kind="video" data-src="" data-youtube="abc"',
    );
  });

  it('inlines the used faces beyond Inter after the Inter faces through fontSrc', () => {
    const deck: Deck = { ...motion.deck, themeEdits: { fonts: { display: 'roboto' } } } as Deck;
    const result = renderStandalone(deck, motion.slides, {
      bundle,
      assetUris: {},
      fontSrc: (id, file) => `data:font/woff2;base64,${id}-${file.file}`,
    });
    expect(result.html).toContain('/* inter */\n@font-face');
    expect(result.html).toContain("font-family: 'Roboto'");
    const plain = renderStandalone(motion.deck, motion.slides, {
      bundle,
      assetUris: {},
      fontSrc: () => 'x',
    });
    expect(plain.html).not.toContain('@font-face');
  });
});
