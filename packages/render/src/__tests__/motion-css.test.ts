// The show's stylesheet (gslides-parity SPEC-5 2.2, 2.6): `motionCss` over the eleven fixture
// schedules on the 16:9 and the 4:3 page as a text snapshot (the dissolve frames' data URIs
// replaced by their byte counts so the snapshot stays readable; the frames are decoded and
// checked apart), the selectors of the layer's contract, the page dependent rules, the base
// sheet, the Bayer table pinned cell for cell, and the rule that no CSS reaches `renderSlide`
// (MILESTONES-5 B1 day 1).
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import type { MotionSchedule } from '@turboslide/schema/motion';
import { emptySchedule } from '@turboslide/schema/motion';
import { DEFAULT_PAGE, PAGE_PRESET_SIZES } from '@turboslide/schema/render';
import {
  BAYER8_RANKS,
  DISSOLVE_FRAMES,
  MOTION_BASE_CSS,
  dissolveFramePng,
  motionCss,
} from '../motion-css.ts';
import { compileMotion, countParagraphs, deckMediaLength, motionBlocks } from '../motion.ts';
import { renderSlide } from '../slide.ts';
import type { RenderOptions } from '../slide.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE_DIR = join(REPO, 'decks/fixture/motion');
const GT_DIR = join(REPO, 'decks/gt-brand');
const STANDARD = PAGE_PRESET_SIZES['standard-4-3'];

function loadDeck(dir: string): { deck: Deck; slides: Record<string, Slide> } {
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Deck;
  const slides: Record<string, Slide> = {};
  for (const file of readdirSync(join(dir, 'slides')))
    slides[file.replace(/\.json$/, '')] = JSON.parse(
      readFileSync(join(dir, 'slides', file), 'utf8'),
    ) as Slide;
  return { deck, slides };
}

const options: RenderOptions = {
  theme: 'light',
  chrome: false,
  assetBase: 'decks/fixture/motion/',
  blockAttrs: true,
  gtWord: true,
};

const fixture = loadDeck(FIXTURE_DIR);
const order = slideOrder(fixture.deck);

function scheduleOf(id: string): MotionSchedule {
  const slide = fixture.slides[id];
  if (slide === undefined) throw new Error(id);
  const { html } = renderSlide(fixture.deck, slide, options);
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  return compileMotion(
    slide,
    motionBlocks(slide),
    (blockId) => {
      const root = dom.window.document.querySelector(`[data-block="${blockId}"]`);
      return root === null ? 0 : countParagraphs(root);
    },
    deckMediaLength(fixture.deck, slide),
  );
}

/** The data URIs of the dissolve frames replaced by their decoded byte count, for the snapshot. */
function readable(css: string): string {
  return css.replace(
    /url\(data:image\/png;base64,([A-Za-z0-9+/=]+)\)/g,
    (_match, data: string) => `url(<png ${Buffer.from(data, 'base64').length} bytes>)`,
  );
}

describe('motionCss over decks/fixture/motion (SPEC-5 2.6)', () => {
  for (const id of order) {
    it(`writes the pinned rules for ${id} on the 16:9 and the 4:3 page`, () => {
      const schedule = scheduleOf(id);
      const wide = motionCss(schedule, DEFAULT_PAGE);
      const standard = motionCss(schedule, STANDARD);
      // the media slide's one effect is Play, which the media controller starts without a rule
      if (id === 'media') expect(wide).toBe('');
      else expect(wide.length).toBeGreaterThan(0);
      expect(readable(wide)).toMatchSnapshot('16:9');
      expect(readable(standard)).toMatchSnapshot('4:3');
    });
  }

  it('answers nothing for an empty schedule and for every GT deck slide', () => {
    expect(motionCss(emptySchedule('s', undefined), DEFAULT_PAGE)).toBe('');
    expect(motionCss(emptySchedule('s', { kind: 'none', durationMs: 500 }), DEFAULT_PAGE)).toBe('');
    const gt = loadDeck(GT_DIR);
    for (const id of slideOrder(gt.deck)) {
      const slide = gt.slides[id];
      if (slide === undefined) throw new Error(id);
      expect(
        motionCss(
          compileMotion(slide, motionBlocks(slide), () => 1),
          DEFAULT_PAGE,
        ),
      ).toBe('');
    }
  });

  it('keys every effect rule by the slide, the step and the block, By paragraph by the stamped node', () => {
    const css = motionCss(scheduleOf('paragraphs'), DEFAULT_PAGE);
    expect(css).toContain(
      '[data-slide="paragraphs"][data-step="1"] [data-block="para"] [data-para="0"].is-entering{animation:ts-fade-in 500ms ease-out 0ms both}',
    );
    expect(css).toContain(
      '[data-slide="paragraphs"][data-step="3"] [data-block="list"] [data-para="3"].is-entering{animation:ts-appear 1ms linear 503ms both}',
    );
    expect(css).toContain(
      '[data-slide="paragraphs"][data-step="4"] [data-block="list"].is-leaving{animation:ts-disappear 1ms linear 0ms both}',
    );
    // the heading flies in from the top of a flow layout by the page height
    expect(css).toContain(
      '[data-slide="paragraphs"][data-step="0"] [data-block="h"].is-entering{animation:ts-fly-in-top-900 600ms ease-out 0ms both}',
    );
    expect(css).toContain(
      '@keyframes ts-fly-in-top-900{from{translate:0px -900px}to{translate:0 0}}',
    );
  });

  it('flies a positioned block to the page edge from its box, so the 4:3 page changes the right and bottom offsets only', () => {
    const wide = motionCss(scheduleOf('effects'), DEFAULT_PAGE);
    const standard = motionCss(scheduleOf('effects'), STANDARD);
    // b5 at x 1213 w 240 flies in from the left by 1453 on either page
    expect(wide).toContain('ts-fly-in-left-1453');
    expect(standard).toContain('ts-fly-in-left-1453');
    // b6 at x 137 flies in from the right by page width minus x
    expect(wide).toContain(
      '@keyframes ts-fly-in-right-1463{from{translate:1463px 0px}to{translate:0 0}}',
    );
    expect(standard).toContain(
      '@keyframes ts-fly-in-right-1063{from{translate:1063px 0px}to{translate:0 0}}',
    );
    // b8 at y 430 h 180 flies in from the bottom by page height minus y, the same 900 on both
    expect(wide).toContain('ts-fly-in-bottom-470');
    expect(standard).toContain('ts-fly-in-bottom-470');
    expect(wide).not.toBe(standard);
    // a slide with no page dependent rule reads the same on both pages
    expect(motionCss(scheduleOf('t-none'), DEFAULT_PAGE)).toBe(
      motionCss(scheduleOf('t-none'), STANDARD),
    );
  });

  it('writes the transition’s four rules and no rule for None', () => {
    const fade = motionCss(scheduleOf('t-fade'), DEFAULT_PAGE);
    expect(fade).toContain(
      '[data-transition="t-fade"] [data-slide].is-entering{animation:ts-t-fade-in 500ms ease-in-out 0ms both}',
    );
    expect(fade).toContain(
      '[data-transition="t-fade"] [data-slide].is-leaving{animation:ts-t-fade-out 500ms ease-in-out 0ms both}',
    );
    expect(fade).toContain(
      '[data-transition="t-fade"][data-reverse] [data-slide].is-entering{animation:ts-t-fade-out 500ms ease-in-out 0ms reverse both}',
    );
    expect(fade).toContain(
      '[data-transition="t-fade"][data-reverse] [data-slide].is-leaving{animation:ts-t-fade-in 500ms ease-in-out 0ms reverse both}',
    );
    expect(motionCss(scheduleOf('t-none'), DEFAULT_PAGE)).not.toContain('data-transition');
    const cube = motionCss(scheduleOf('t-cube'), DEFAULT_PAGE);
    expect(cube).toContain('ts-t-cube-in-800 999ms');
    expect(cube).toContain('translateZ(-800px) rotateY(90deg) translateZ(800px)');
    expect(motionCss(scheduleOf('t-cube'), STANDARD)).toContain('ts-t-cube-in-600 999ms');
    const push = motionCss(scheduleOf('t-slide-right'), DEFAULT_PAGE);
    expect(push).toContain(
      '@keyframes ts-t-slideRight-in{from{translate:100% 0}to{translate:0 0}}',
    );
    expect(push).toContain(
      '@keyframes ts-t-slideRight-out{from{translate:0 0}to{translate:-100% 0}}',
    );
    const flip = motionCss(scheduleOf('t-flip'), DEFAULT_PAGE);
    expect(flip).toContain('ts-t-flip-in 2000ms');
    expect(flip).toContain('rotateY(90deg)');
    const gallery = motionCss(scheduleOf('t-gallery'), DEFAULT_PAGE);
    expect(gallery).toContain('ts-t-gallery-in 5000ms');
    expect(gallery).toContain('scale(.9)');
  });

  it('dissolves through 64 discrete Bayer frames on the incoming slide, reversed on the outgoing when going back', () => {
    const css = motionCss(scheduleOf('t-dissolve'), DEFAULT_PAGE);
    expect(css).toContain(
      '[data-transition="t-dissolve"] [data-slide].is-entering{mask-size:8px 8px;mask-repeat:repeat;animation:ts-t-dissolve-in 500ms linear 0ms both}',
    );
    expect(css).toContain(
      '[data-transition="t-dissolve"][data-reverse] [data-slide].is-entering{animation:none}',
    );
    expect(css).toContain(
      '[data-transition="t-dissolve"][data-reverse] [data-slide].is-leaving{z-index:3;mask-size:8px 8px;mask-repeat:repeat;animation:ts-t-dissolve-in 500ms linear 0ms reverse both}',
    );
    const frames = css.match(/url\(data:image\/png;base64,[A-Za-z0-9+/=]+\)/g) ?? [];
    expect(frames).toHaveLength(DISSOLVE_FRAMES);
    expect(new Set(frames).size).toBe(DISSOLVE_FRAMES);
    expect(css).toContain('@keyframes ts-t-dissolve-in{0%{mask-image:url(');
    expect(css).toContain('100%{mask-image:url(');
  });

  it('encodes each dissolve frame as an 8 by 8 one bit palette PNG whose set cells are the ranks up to the frame', () => {
    for (let frame = 0; frame < DISSOLVE_FRAMES; frame += 1) {
      const png = Uint8Array.from(dissolveFramePng(frame));
      expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      // IHDR: width 8, height 8, bit depth 1, colour type 3
      expect(Array.from(png.slice(16, 29))).toEqual([0, 0, 0, 8, 0, 0, 0, 8, 1, 3, 0, 0, 0]);
      const idat = png.indexOf(0x49) === -1 ? -1 : findChunk(png, 'IDAT');
      expect(idat).toBeGreaterThan(0);
      // the stored zlib block: 2 header bytes, 5 block header bytes, then 8 rows of filter + byte
      const rows = png.slice(idat + 8 + 7, idat + 8 + 7 + 16);
      const lit: number[] = [];
      for (let r = 0; r < 8; r += 1) {
        expect(rows[r * 2]).toBe(0);
        const byte = rows[r * 2 + 1] ?? 0;
        for (let c = 0; c < 8; c += 1) if (byte & (0x80 >>> c)) lit.push(r * 8 + c);
      }
      const expected = BAYER8_RANKS.map((rank, cell) => (rank <= frame ? cell : -1)).filter(
        (cell) => cell >= 0,
      );
      expect(lit).toEqual(expected);
      expect(lit).toHaveLength(frame + 1);
    }
  });

  it('pins the deck’s Bayer 8 permutation cell for cell (effects/bayer.ts)', () => {
    expect(BAYER8_RANKS).toEqual([
      0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60,
      28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15,
      47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
    ]);
    expect([...BAYER8_RANKS].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 64 }, (_cell, index) => index),
    );
  });

  it('loads the hidden rule, the stacking and the reduced motion rule once per document', () => {
    expect(MOTION_BASE_CSS).toContain('.is-hidden{visibility:hidden!important}');
    expect(MOTION_BASE_CSS).toContain('[data-transition] [data-slide].is-entering{z-index:2}');
    expect(MOTION_BASE_CSS).toContain('@media (prefers-reduced-motion:reduce)');
    expect(MOTION_BASE_CSS).toContain(
      'animation-duration:0s!important;animation-delay:0s!important',
    );
  });

  it('lets no CSS reach renderSlide (SPEC-5 0.3): the rendered slides carry the resting document alone', () => {
    for (const id of order) {
      const slide = fixture.slides[id];
      if (slide === undefined) throw new Error(id);
      const { html } = renderSlide(fixture.deck, slide, options);
      expect(html).not.toContain('@keyframes');
      expect(html).not.toContain('is-entering');
      expect(html).not.toContain('is-hidden');
      expect(html).not.toContain('animation:');
      expect(html).not.toContain('<style');
      expect(html).not.toContain('data-step');
    }
  });
});

/** The offset of a chunk's length field in a PNG, by its four letter type. */
function findChunk(png: Uint8Array, type: string): number {
  let at = 8;
  while (at + 8 <= png.length) {
    const length =
      ((png[at] ?? 0) << 24) |
      ((png[at + 1] ?? 0) << 16) |
      ((png[at + 2] ?? 0) << 8) |
      (png[at + 3] ?? 0);
    const name = String.fromCharCode(...png.slice(at + 4, at + 8));
    if (name === type) return at;
    at += 12 + length;
  }
  return -1;
}
