// The motion of the ODP (gslides-parity SPEC-5 2.4, 6.3; R09 2.2; b1.md request 11): the slide
// transition as the drawing page style's SMIL attributes (`smil:type`, `smil:subtype`,
// `smil:direction`, `presentation:transition-speed` quantised to slow, medium and fast with the
// quantisation recorded in `residual`), and the click steps of B1's `MotionSchedule` as
// LibreOffice's animation tree: `anim:par` timing root, `anim:seq` main sequence, one `anim:par`
// per click step, one effect node per animated element with `presentation:node-type` from the
// trigger, `presentation:preset-class` and `presentation:preset-id` from LibreOffice's preset
// table (pinned from the container probe of R05), `anim:set visibility` for appear and disappear,
// an `anim:animate opacity` for the fades, an `anim:animateTransform` for zoom and spin, a
// translate for the flies, and `anim:sub-item="text"` on a paragraph build. A transition
// LibreOffice cannot draw (flip, cube, gallery) arrives as a fade with a `transition.fallback`
// row, the one fallback the fixer round admits.
import type { MotionEffect, MotionSchedule, SlideTransition } from '@turboslide/schema/motion';
import { DURATION_MS } from '@turboslide/schema/motion';
import type { ExportReportRow } from '@turboslide/schema/export';

import { el } from './xml.ts';

/** The transition attributes and any report row. */
export type OdfTransition = {
  attributes: Record<string, string>;
  rows: ExportReportRow[];
};

/** `presentation:transition-speed` from a duration: 500 ms or under is fast, 1400 or under medium, else slow (the speed words of ODF). */
export function spdOf(durationMs: number): 'slow' | 'medium' | 'fast' {
  if (durationMs <= 600) return 'fast';
  if (durationMs <= 1400) return 'medium';
  return 'slow';
}

/** The milliseconds a speed word plays for in LibreOffice, for the residual's quantisation note. */
export const SPEED_MS: Readonly<Record<'slow' | 'medium' | 'fast', number>> = {
  fast: DURATION_MS.fast,
  medium: DURATION_MS.medium,
  slow: DURATION_MS.slow,
};

/**
 * The SMIL transition of a slide (R09 2.2): fade and dissolve are their own; the two slides are
 * a `slideWipe` from the side the new slide enters from; flip, cube and gallery have no SMIL
 * transition LibreOffice draws and arrive as a fade with a row.
 */
export function transitionOf(
  slideId: string,
  transition: SlideTransition | undefined,
): OdfTransition {
  if (transition === undefined || transition.kind === 'none') return { attributes: {}, rows: [] };
  const speed = spdOf(transition.durationMs);
  const rows: ExportReportRow[] = [];
  if (SPEED_MS[speed] !== transition.durationMs)
    rows.push({
      slideId,
      code: 'transition.speed',
      message: `${slideId}: the ${transition.durationMs} ms transition plays at LibreOffice's ${speed} speed (${SPEED_MS[speed]} ms)`,
    });
  const base: Record<string, string> = {
    'presentation:transition-type': 'manual',
    'presentation:transition-speed': speed,
  };
  switch (transition.kind) {
    case 'fade':
      return { attributes: { ...base, 'smil:type': 'fade', 'smil:subtype': 'crossfade' }, rows };
    case 'dissolve':
      return { attributes: { ...base, 'smil:type': 'dissolve' }, rows };
    case 'slideRight':
      return {
        attributes: { ...base, 'smil:type': 'slideWipe', 'smil:subtype': 'fromRight' },
        rows,
      };
    case 'slideLeft':
      return {
        attributes: { ...base, 'smil:type': 'slideWipe', 'smil:subtype': 'fromLeft' },
        rows,
      };
    case 'flip':
    case 'cube':
    case 'gallery':
      rows.push({
        slideId,
        code: 'transition.fallback',
        message: `${slideId}: LibreOffice has no ${transition.kind} transition; the file carries a fade`,
      });
      return { attributes: { ...base, 'smil:type': 'fade', 'smil:subtype': 'crossfade' }, rows };
  }
}

/** LibreOffice's preset ids per effect (the container probe of R05 10, leg 2), with the class. */
export const ODF_PRESETS: Readonly<
  Record<MotionEffect['animation']['effect'], { presetClass: string; presetId: string }>
> = {
  appear: { presetClass: 'entrance', presetId: 'ooo-entrance-appear' },
  fadeIn: { presetClass: 'entrance', presetId: 'ooo-entrance-fade-in' },
  flyIn: { presetClass: 'entrance', presetId: 'ooo-entrance-fly-in' },
  zoomIn: { presetClass: 'entrance', presetId: 'ooo-entrance-zoom' },
  disappear: { presetClass: 'exit', presetId: 'ooo-exit-disappear' },
  fadeOut: { presetClass: 'exit', presetId: 'ooo-exit-fade-out' },
  flyOut: { presetClass: 'exit', presetId: 'ooo-exit-fly-out' },
  zoomOut: { presetClass: 'exit', presetId: 'ooo-exit-zoom' },
  spin: { presetClass: 'emphasis', presetId: 'ooo-emphasis-spin' },
  playMedia: { presetClass: 'media', presetId: 'ooo-media-start' },
};

function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(3).replace(/\.?0+$/, '')}s`;
}

/** The node type of an effect from its trigger; the first effect of a click step is `on-click`. */
export function nodeTypeOf(effect: MotionEffect, first: boolean): string {
  if (first) return 'on-click';
  return effect.animation.trigger === 'withPrevious' ? 'with-previous' : 'after-previous';
}

/** The inner animation elements of one effect on one target. */
function effectBody(effect: MotionEffect, target: string, durS: string): string {
  const kind = effect.animation.effect;
  const common = {
    'smil:targetElement': target,
    ...(effect.paragraph !== undefined ? { 'anim:sub-item': 'text' } : {}),
  };
  const entrance = ODF_PRESETS[kind].presetClass === 'entrance';
  const exit = ODF_PRESETS[kind].presetClass === 'exit';
  const visibility = entrance
    ? el('anim:set', {
        ...common,
        'smil:begin': '0s',
        'smil:dur': '0.001s',
        'smil:fill': 'hold',
        'smil:attributeName': 'visibility',
        'smil:to': 'visible',
      })
    : exit
      ? el('anim:set', {
          ...common,
          'smil:begin': durS,
          'smil:dur': '0.001s',
          'smil:fill': 'hold',
          'smil:attributeName': 'visibility',
          'smil:to': 'hidden',
        })
      : '';
  switch (kind) {
    case 'appear':
    case 'disappear':
      return visibility;
    case 'fadeIn':
      return (
        visibility +
        el('anim:animate', {
          ...common,
          'smil:begin': '0s',
          'smil:dur': durS,
          'smil:fill': 'hold',
          'smil:attributeName': 'opacity',
          'smil:values': '0;1',
          'smil:keyTimes': '0;1',
        })
      );
    case 'fadeOut':
      return (
        el('anim:animate', {
          ...common,
          'smil:begin': '0s',
          'smil:dur': durS,
          'smil:fill': 'hold',
          'smil:attributeName': 'opacity',
          'smil:values': '1;0',
          'smil:keyTimes': '0;1',
        }) + visibility
      );
    case 'flyIn': {
      const direction = effect.animation.direction ?? 'bottom';
      const from =
        direction === 'left'
          ? 'x-width/2'
          : direction === 'right'
            ? '1+width/2'
            : direction === 'top'
              ? 'y-height/2'
              : '1+height/2';
      const attr = direction === 'left' || direction === 'right' ? 'x' : 'y';
      const to = attr === 'x' ? 'x' : 'y';
      return (
        visibility +
        el('anim:animate', {
          ...common,
          'smil:begin': '0s',
          'smil:dur': durS,
          'smil:fill': 'hold',
          'smil:attributeName': attr,
          'smil:values': `${from};${to}`,
          'smil:keyTimes': '0;1',
          'anim:formula': attr === 'x' ? 'x' : 'y',
        })
      );
    }
    case 'flyOut': {
      const direction = effect.animation.direction ?? 'bottom';
      const to =
        direction === 'left'
          ? 'x-width/2'
          : direction === 'right'
            ? '1+width/2'
            : direction === 'top'
              ? 'y-height/2'
              : '1+height/2';
      const attr = direction === 'left' || direction === 'right' ? 'x' : 'y';
      return (
        el('anim:animate', {
          ...common,
          'smil:begin': '0s',
          'smil:dur': durS,
          'smil:fill': 'hold',
          'smil:attributeName': attr,
          'smil:values': `${attr};${to}`,
          'smil:keyTimes': '0;1',
        }) + visibility
      );
    }
    case 'zoomIn':
      return (
        visibility +
        el('anim:animateTransform', {
          ...common,
          'smil:begin': '0s',
          'smil:dur': durS,
          'smil:fill': 'hold',
          'smil:attributeName': 'transform',
          'smil:type': 'scale',
          'smil:values': '0,0;1,1',
          'smil:keyTimes': '0;1',
        })
      );
    case 'zoomOut':
      return (
        el('anim:animateTransform', {
          ...common,
          'smil:begin': '0s',
          'smil:dur': durS,
          'smil:fill': 'hold',
          'smil:attributeName': 'transform',
          'smil:type': 'scale',
          'smil:values': '1,1;0,0',
          'smil:keyTimes': '0;1',
        }) + visibility
      );
    case 'spin':
      return el('anim:animateTransform', {
        ...common,
        'smil:begin': '0s',
        'smil:dur': durS,
        'smil:fill': 'hold',
        'smil:attributeName': 'transform',
        'smil:type': 'rotate',
        'smil:by': '360',
      });
    case 'playMedia':
      return el('anim:command', { ...common, 'smil:begin': '0s', 'anim:command': 'play' });
  }
}

/**
 * The animation tree of a page from the schedule (SPEC-5 6.3): one click step per `anim:par`
 * under the main sequence, one effect node per element of every animated block; `idsOf` answers
 * the element ids a block drew as (several when a block is a shape with text, none when the
 * block drew nothing, which drops the effect with a row).
 */
export function animationTreeXml(
  schedule: MotionSchedule | undefined,
  idsOf: (blockId: string) => readonly string[],
): { xml: string; effects: number; rows: ExportReportRow[] } {
  if (schedule === undefined || schedule.steps.length === 0)
    return { xml: '', effects: 0, rows: [] };
  const rows: ExportReportRow[] = [];
  let effects = 0;
  const steps = schedule.steps
    .map((step) => {
      const nodes = step.effects
        .flatMap((effect, index) => {
          const targets = idsOf(effect.animation.blockId);
          if (targets.length === 0) {
            rows.push({
              slideId: schedule.slideId,
              blockId: effect.animation.blockId,
              code: 'animation.dropped',
              message: `${schedule.slideId}#${effect.animation.blockId}: the block drew no element the animation tree could target`,
            });
            return [];
          }
          const preset = ODF_PRESETS[effect.animation.effect];
          const durS = seconds(effect.durationMs);
          return targets.map((target, ti) => {
            effects += 1;
            return el(
              'anim:par',
              {
                'presentation:node-type': nodeTypeOf(effect, index === 0 && ti === 0),
                'presentation:preset-class': preset.presetClass,
                'presentation:preset-id': preset.presetId,
                ...(effect.animation.direction !== undefined
                  ? { 'presentation:preset-property': effect.animation.direction }
                  : {}),
                'smil:begin': ti === 0 && index === 0 ? '0s' : seconds(effect.delayMs),
                'smil:fill': 'hold',
              },
              effectBody(effect, target, durS),
            );
          });
        })
        .join('');
      if (nodes === '') return '';
      return el(
        'anim:par',
        { 'smil:begin': 'next', 'smil:fill': 'hold' },
        el('anim:par', { 'smil:begin': '0s', 'smil:fill': 'hold' }, nodes),
      );
    })
    .join('');
  if (steps === '') return { xml: '', effects: 0, rows };
  const xml = el(
    'anim:par',
    { 'presentation:node-type': 'timing-root' },
    el('anim:seq', { 'presentation:node-type': 'main-sequence' }, steps),
  );
  return { xml, effects, rows };
}
