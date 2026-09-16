// The show's stylesheet (gslides-parity SPEC-5 2.2, R05 9.4): `motionCss(schedule, page)` writes
// the rules for one slide's schedule, the present layer and the standalone motion script toggle
// the classes of `MOTION_CLASSES` on the nodes `data-block` (and the stamped `data-para`) name, and
// the browser plays the keyframes. One generator, so the curves the studio's show and the HTML
// export play are equal by construction; the Perfect export, the PDF and every still never load
// it (`__tests__/motion-css.test.ts` asserts no CSS reaches `renderSlide`).
//
// The contract with the layer (build-5/b1.md, day 1):
// - the slide root carries `data-slide="<id>"` (the renderer's) and, in the show, `data-step="<k>"`;
//   the rules of step k match `[data-slide][data-step="k"]`, so a block with two effects in two
//   steps plays the right one;
// - an entrance's target loses `is-hidden` and gains `is-entering` when its step starts; its
//   keyframes begin at the hidden state (opacity 0, off the page, scale 0, `visibility: hidden`)
//   and `animation-fill-mode: both` holds that state through the effect's delay;
// - an exit's target gains `is-leaving` when its step starts and its keyframes end at the hidden
//   state; when the step ends the layer swaps `is-leaving` for `is-hidden`;
// - Spin's target gains `is-emph`; Play has no rule (the media controller starts the element);
// - By paragraph effects address `[data-block] [data-para="<index>"]`, the paragraph nodes
//   `paragraphNodes` lists, which the layer stamps when it mounts the slide;
// - during a transition the ancestor of both mounted slides carries `data-transition="<incoming
//   slide id>"`, the incoming slide root `is-entering` and the outgoing `is-leaving`; going back
//   adds `data-reverse` and the two slides swap keyframes with `animation-direction: reverse`
//   (the outgoing slide's transition reversed at the same duration, SPEC-5 2.2, unverified);
// - `MOTION_BASE_CSS` is loaded once per document beside the per slide rules: the hidden rule,
//   the stacking of the two slides, and the reduced motion rule that sets every duration and
//   delay to 0 (SPEC-5 0.10; the layer keeps the step gates).
//
// The forms per effect are R05 9.4: opacity for the fades, `translate` from the page edge for the
// flies (the offset from the block's box against the page, the page dimension for a flow layout
// block), `scale` about the centre for the zooms, one turn for Spin, a discrete Bayer 8 mask over
// 64 frames for Dissolve (the deck's own permutation, the table `bayer8` of
// `@turboslide/effects/bayer` builds; copied here because the render package does not depend on
// the effects package, with `BAYER8_RANKS` pinned by the test), a crossfade for Fade, a
// `translate` by one page width for the two pushes (a percentage of the slide's own width), a
// `rotateY` in two halves under `backface-visibility: hidden` for Flip, two faces of a cube about
// an axis half a page behind the sheet for Cube, and a translate with a small Y rotation and a
// 0.9 scale at the midpoint for Gallery. The individual transform properties (`translate`,
// `scale`, `rotate`) carry the block effects so a block's own `transform` is untouched; the three
// 3D transitions write `transform` with their own `perspective()` because a perspective must be
// the outermost operation. Easing: `ease-in-out` for transitions, `ease-out` for entrances,
// `ease-in` for exits, `linear` for Spin and the switches (Turboslide's, unverified against Google).
import type { MotionEffect, MotionSchedule, TransitionKind } from '@turboslide/schema/motion';
import { MOTION_ATTRS, MOTION_CLASSES, effectClass } from '@turboslide/schema/motion';
import type { Page } from '@turboslide/schema/render';

const A = MOTION_ATTRS;
const C = MOTION_CLASSES;

/** The perspective the three 3D transitions draw under, in sheet pixels. */
export const MOTION_PERSPECTIVE_PX = 2400;

/** The rules every document with motion loads once (SPEC-5 2.2). */
export const MOTION_BASE_CSS: string = [
  `.${C.hidden}{visibility:hidden!important}`,
  `[${A.transition}] [${A.slide}].${C.leaving}{z-index:1;pointer-events:none}`,
  `[${A.transition}] [${A.slide}].${C.entering}{z-index:2}`,
  `[${A.transition}] [${A.slide}].${C.entering},[${A.transition}] [${A.slide}].${C.leaving}{backface-visibility:hidden;will-change:transform,opacity}`,
  `[${A.slide}] .${C.entering},[${A.slide}] .${C.leaving},[${A.slide}] .${C.emphasis}{will-change:transform,opacity}`,
  `@media (prefers-reduced-motion:reduce){[${A.slide}] .${C.entering},[${A.slide}] .${C.leaving},[${A.slide}] .${C.emphasis},[${A.transition}] [${A.slide}].${C.entering},[${A.transition}] [${A.slide}].${C.leaving}{animation-duration:0s!important;animation-delay:0s!important}}`,
].join('\n');

// ---------------------------------------------------------------------------------------------
// The Bayer 8 dissolve

const B4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const Q: readonly number[] = [0, 2, 3, 1];

/**
 * The 8 by 8 Bayer screen, row major, 0 to 63: the deck's own permutation (the 4 by 4 matrix,
 * each entry times four, plus an offset by quadrant), equal to `BAYER8` of
 * `@turboslide/effects/bayer` cell for cell (the test pins the sixty four values).
 */
export const BAYER8_RANKS: readonly number[] = Array.from({ length: 64 }, (_cell, index) => {
  const r = Math.floor(index / 8);
  const c = index % 8;
  const b = B4[r % 4]?.[c % 4] ?? 0;
  const q = Q[Math.floor(r / 4) * 2 + Math.floor(c / 4)] ?? 0;
  return b * 4 + q;
});

/** The frames of the dissolve: frame k shows the incoming slide through the cells ranked up to k. */
export const DISSOLVE_FRAMES = 64;

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function chunk(type: string, data: number[]): number[] {
  const typeBytes = Array.from(type, (ch) => ch.charCodeAt(0));
  const crc = crc32(Uint8Array.from([...typeBytes, ...data]));
  return [...u32(data.length), ...typeBytes, ...data, ...u32(crc)];
}

/** A zlib stream with one stored block, the form a decoder accepts without any compression. */
function zlibStored(data: number[]): number[] {
  const length = data.length;
  return [
    0x78,
    0x01,
    0x01,
    length & 0xff,
    (length >>> 8) & 0xff,
    ~length & 0xff,
    (~length >>> 8) & 0xff,
    ...data,
    ...u32(adler32(Uint8Array.from(data))),
  ];
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += BASE64[(triple >>> 18) & 63];
    out += BASE64[(triple >>> 12) & 63];
    out += b === undefined ? '=' : BASE64[(triple >>> 6) & 63];
    out += c === undefined ? '=' : BASE64[triple & 63];
  }
  return out;
}

/**
 * One 8 by 8 frame of the dissolve as a 1 bit palette PNG (index 1 opaque black, index 0
 * transparent through `tRNS`), about 120 bytes: the cells whose Bayer rank is at most `frame`
 * are opaque, so the incoming slide shows through them under `mask-image`.
 */
export function dissolveFramePng(frame: number): number[] {
  const rows: number[] = [];
  for (let r = 0; r < 8; r += 1) {
    let byte = 0;
    for (let c = 0; c < 8; c += 1) if ((BAYER8_RANKS[r * 8 + c] ?? 0) <= frame) byte |= 0x80 >>> c;
    rows.push(0, byte);
  }
  const ihdr = [...u32(8), ...u32(8), 1, 3, 0, 0, 0];
  return [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', ihdr),
    ...chunk('PLTE', [0, 0, 0, 0, 0, 0]),
    ...chunk('tRNS', [0, 255]),
    ...chunk('IDAT', zlibStored(rows)),
    ...chunk('IEND', []),
  ];
}

let dissolveKeyframes: string | undefined;

/** The 64 discrete `mask-image` stops of the dissolve, built once. */
function dissolveKeyframeBody(): string {
  if (dissolveKeyframes === undefined) {
    const stops: string[] = [];
    for (let frame = 0; frame < DISSOLVE_FRAMES; frame += 1) {
      const at = percent((frame / (DISSOLVE_FRAMES - 1)) * 100);
      stops.push(`${at}{mask-image:url(data:image/png;base64,${base64(dissolveFramePng(frame))})}`);
    }
    dissolveKeyframes = stops.join('');
  }
  return dissolveKeyframes;
}

function percent(value: number): string {
  const text = value.toFixed(3).replace(/\.?0+$/, '');
  return `${text}%`;
}

// ---------------------------------------------------------------------------------------------
// Keyframes

const EFFECT_KEYFRAMES: Readonly<Record<string, string>> = {
  'ts-appear': 'from{visibility:hidden}to{visibility:visible}',
  'ts-disappear': 'from{visibility:visible}to{visibility:hidden}',
  'ts-fade-in': 'from{opacity:0}to{opacity:1}',
  'ts-fade-out': 'from{opacity:1}to{opacity:0}',
  'ts-zoom-in': 'from{scale:0}to{scale:1}',
  'ts-zoom-out': 'from{scale:1}to{scale:0}',
  'ts-spin': 'from{rotate:0deg}to{rotate:360deg}',
};

const P = `perspective(${MOTION_PERSPECTIVE_PX}px)`;

/** The transition keyframes that do not read the page; Cube reads the page width. */
const TRANSITION_KEYFRAMES: Readonly<Record<string, string>> = {
  'ts-t-fade-in': 'from{opacity:0}to{opacity:1}',
  'ts-t-fade-out': 'from{opacity:1}to{opacity:0}',
  'ts-t-slideRight-in': 'from{translate:100% 0}to{translate:0 0}',
  'ts-t-slideRight-out': 'from{translate:0 0}to{translate:-100% 0}',
  'ts-t-slideLeft-in': 'from{translate:-100% 0}to{translate:0 0}',
  'ts-t-slideLeft-out': 'from{translate:0 0}to{translate:100% 0}',
  'ts-t-flip-in': `0%,50%{transform:${P} rotateY(90deg)}100%{transform:${P} rotateY(0)}`,
  'ts-t-flip-out': `0%{transform:${P} rotateY(0)}50%,100%{transform:${P} rotateY(-90deg)}`,
  'ts-t-gallery-in': `0%{transform:${P} translateX(100%) rotateY(-8deg)}50%{transform:${P} translateX(50%) rotateY(-8deg) scale(.9)}100%{transform:${P} translateX(0) rotateY(0) scale(1)}`,
  'ts-t-gallery-out': `0%{transform:${P} translateX(0) rotateY(0) scale(1)}50%{transform:${P} translateX(-50%) rotateY(8deg) scale(.9)}100%{transform:${P} translateX(-100%) rotateY(8deg)}`,
};

function cubeKeyframes(page: Page, direction: 'in' | 'out'): [string, string] {
  const half = Math.round(page.width / 2);
  const face = (angle: string): string =>
    `transform:${P} translateZ(-${half}px) rotateY(${angle}) translateZ(${half}px)`;
  const name = `ts-t-cube-${direction}-${half}`;
  return direction === 'in'
    ? [name, `from{${face('90deg')}}to{${face('0')}}`]
    : [name, `from{${face('0')}}to{${face('-90deg')}}`];
}

// ---------------------------------------------------------------------------------------------
// The generator

type Sheet = { rules: string[]; keyframes: Map<string, string> };

function keyframe(sheet: Sheet, name: string, body: string): string {
  if (!sheet.keyframes.has(name)) sheet.keyframes.set(name, `@keyframes ${name}{${body}}`);
  return name;
}

/** The fly offset of an effect against the page (R05 9.4): to the page edge from the block's box, else by the page. */
function flyOffset(effect: MotionEffect, page: Page): { dx: number; dy: number } {
  const direction = effect.animation.direction ?? 'left';
  const box = effect.box;
  switch (direction) {
    case 'left':
      return { dx: -(box === undefined ? page.width : Math.round(box[0] + box[2])), dy: 0 };
    case 'right':
      return { dx: box === undefined ? page.width : Math.round(page.width - box[0]), dy: 0 };
    case 'top':
      return { dx: 0, dy: -(box === undefined ? page.height : Math.round(box[1] + box[3])) };
    case 'bottom':
      return { dx: 0, dy: box === undefined ? page.height : Math.round(page.height - box[1]) };
  }
}

/** The keyframe name, easing and body for one effect; null for Play, which has no rule. */
function effectAnimation(
  sheet: Sheet,
  effect: MotionEffect,
  page: Page,
): { name: string; easing: string } | null {
  const kind = effect.animation.effect;
  switch (kind) {
    case 'appear':
      return {
        name: keyframe(sheet, 'ts-appear', EFFECT_KEYFRAMES['ts-appear'] ?? ''),
        easing: 'linear',
      };
    case 'disappear':
      return {
        name: keyframe(sheet, 'ts-disappear', EFFECT_KEYFRAMES['ts-disappear'] ?? ''),
        easing: 'linear',
      };
    case 'fadeIn':
      return {
        name: keyframe(sheet, 'ts-fade-in', EFFECT_KEYFRAMES['ts-fade-in'] ?? ''),
        easing: 'ease-out',
      };
    case 'fadeOut':
      return {
        name: keyframe(sheet, 'ts-fade-out', EFFECT_KEYFRAMES['ts-fade-out'] ?? ''),
        easing: 'ease-in',
      };
    case 'zoomIn':
      return {
        name: keyframe(sheet, 'ts-zoom-in', EFFECT_KEYFRAMES['ts-zoom-in'] ?? ''),
        easing: 'ease-out',
      };
    case 'zoomOut':
      return {
        name: keyframe(sheet, 'ts-zoom-out', EFFECT_KEYFRAMES['ts-zoom-out'] ?? ''),
        easing: 'ease-in',
      };
    case 'spin':
      return {
        name: keyframe(sheet, 'ts-spin', EFFECT_KEYFRAMES['ts-spin'] ?? ''),
        easing: 'linear',
      };
    case 'flyIn': {
      const { dx, dy } = flyOffset(effect, page);
      const direction = effect.animation.direction ?? 'left';
      const name = `ts-fly-in-${direction}-${Math.abs(dx || dy)}`;
      return {
        name: keyframe(sheet, name, `from{translate:${dx}px ${dy}px}to{translate:0 0}`),
        easing: 'ease-out',
      };
    }
    case 'flyOut': {
      const { dx, dy } = flyOffset(effect, page);
      const direction = effect.animation.direction ?? 'left';
      const name = `ts-fly-out-${direction}-${Math.abs(dx || dy)}`;
      return {
        name: keyframe(sheet, name, `from{translate:0 0}to{translate:${dx}px ${dy}px}`),
        easing: 'ease-in',
      };
    }
    case 'playMedia':
      return null;
  }
}

function stateClass(effect: MotionEffect): string {
  switch (effectClass(effect.animation.effect)) {
    case 'entrance':
      return C.entering;
    case 'exit':
      return C.leaving;
    default:
      return C.emphasis;
  }
}

function transitionRules(sheet: Sheet, schedule: MotionSchedule, page: Page): void {
  const transition = schedule.transition;
  if (transition === null) return;
  const scope = `[${A.transition}="${schedule.slideId}"]`;
  const entering = `${scope} [${A.slide}].${C.entering}`;
  const leaving = `${scope} [${A.slide}].${C.leaving}`;
  const rEntering = `${scope}[${A.reverse}] [${A.slide}].${C.entering}`;
  const rLeaving = `${scope}[${A.reverse}] [${A.slide}].${C.leaving}`;
  const D = `${transition.durationMs}ms`;
  const kind: TransitionKind = transition.kind;
  if (kind === 'none') return;
  if (kind === 'dissolve') {
    const name = keyframe(sheet, 'ts-t-dissolve-in', dissolveKeyframeBody());
    const mask = 'mask-size:8px 8px;mask-repeat:repeat';
    sheet.rules.push(`${entering}{${mask};animation:${name} ${D} linear 0ms both}`);
    sheet.rules.push(`${rEntering}{animation:none}`);
    sheet.rules.push(
      `${rLeaving}{z-index:3;${mask};animation:${name} ${D} linear 0ms reverse both}`,
    );
    return;
  }
  let inName: string;
  let outName: string;
  if (kind === 'cube') {
    const [inKey, inBody] = cubeKeyframes(page, 'in');
    const [outKey, outBody] = cubeKeyframes(page, 'out');
    inName = keyframe(sheet, inKey, inBody);
    outName = keyframe(sheet, outKey, outBody);
  } else {
    inName = keyframe(sheet, `ts-t-${kind}-in`, TRANSITION_KEYFRAMES[`ts-t-${kind}-in`] ?? '');
    outName = keyframe(sheet, `ts-t-${kind}-out`, TRANSITION_KEYFRAMES[`ts-t-${kind}-out`] ?? '');
  }
  sheet.rules.push(`${entering}{animation:${inName} ${D} ease-in-out 0ms both}`);
  sheet.rules.push(`${leaving}{animation:${outName} ${D} ease-in-out 0ms both}`);
  sheet.rules.push(`${rEntering}{animation:${outName} ${D} ease-in-out 0ms reverse both}`);
  sheet.rules.push(`${rLeaving}{animation:${inName} ${D} ease-in-out 0ms reverse both}`);
}

function effectRules(sheet: Sheet, schedule: MotionSchedule, page: Page): void {
  schedule.steps.forEach((step, index) => {
    for (const effect of step.effects) {
      const animation = effectAnimation(sheet, effect, page);
      if (animation === null) continue;
      const block = `[${A.block}="${effect.animation.blockId}"]`;
      const target =
        effect.paragraph === undefined ? block : `${block} [${A.paragraph}="${effect.paragraph}"]`;
      sheet.rules.push(
        `[${A.slide}="${schedule.slideId}"][${A.step}="${index}"] ${target}.${stateClass(effect)}{animation:${animation.name} ${effect.durationMs}ms ${animation.easing} ${effect.delayMs}ms both}`,
      );
    }
  });
}

/**
 * The rules of one slide's schedule on a page: the transition's four rules (forward and reversed,
 * incoming and outgoing), one rule per effect keyed by step, then the keyframes each rule named,
 * once each. An empty schedule answers the empty string, so a still deck loads nothing.
 */
export function motionCss(schedule: MotionSchedule, page: Page): string {
  const sheet: Sheet = { rules: [], keyframes: new Map() };
  transitionRules(sheet, schedule, page);
  effectRules(sheet, schedule, page);
  if (sheet.rules.length === 0) return '';
  return [...sheet.rules, ...sheet.keyframes.values()].join('\n');
}
