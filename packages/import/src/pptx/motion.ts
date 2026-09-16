// Transitions and animations (gslides-parity SPEC-5 5.1; R04 5.8; R01 6.6): `p:transition` folds
// onto Google's seven kinds (`fade` and `cut` to Fade; `dissolve`, `randomBar`, `checker`,
// `blinds`, `random` and the pattern wipes to Dissolve; `push` and `cover` with `dir="l"` to Slide
// from right and `dir="r"` to Slide from left, the vertical directions to the nearest horizontal
// one with a row; `p14:flip` and `p14:switch` to Flip; `p14:prism`, `p14:doors` and `p14:window`
// to Cube; `p14:gallery` and `p14:conveyor` to Gallery; everything else to Fade with a row), the
// duration from `p14:dur` or `spd` (fast 500, med 750, slow 1000). `p:timing` is walked in main
// sequence order: `entr` 1, 2, 10, 23 and `exit` 1, 2, 10, 23 keep their effect and subtype,
// `emph` 8 is Spin, other entrances become Fade in, other exits Fade out, and `path`, other
// `emph`, `verb` and `mediacall` nodes are dropped with a row; `nodeType` is the trigger,
// `p:bldP build="p"` is By paragraph, `dur` is the length. The targets resolve through the
// slide's shape id map.
import type { Element } from '@xmldom/xmldom';

import type {
  Animation,
  AnimationEffect,
  AnimationTrigger,
  FlyDirection,
  SlideTransition,
  TransitionKind,
} from '@turboslide/schema/motion';
import { DURATION_MS, nextAnimationId } from '@turboslide/schema/motion';

import type { SlideContext } from './context.ts';
import { rowOn } from './context.ts';
import { ROW_CODES } from './report.ts';
import { attr, child, children, descendants, elementChildren, is, path } from './xml.ts';

/** The seconds behind `spd` (R04 5.8, unverified there; SPEC-5 5.1 fixes 500, 750 and 1000 ms). */
export const SPEED_MS: Readonly<Record<string, number>> = { fast: 500, med: 750, slow: 1000 };

const DISSOLVE_NAMES = new Set([
  'dissolve',
  'randomBar',
  'checker',
  'blinds',
  'random',
  'wipe',
  'strips',
  'comb',
  'plus',
  'diamond',
  'circle',
  'wedge',
  'wheel',
  'split',
  'newsflash',
  'zoom',
]);

export type TransitionReading = {
  transition: SlideTransition;
  exact: boolean;
  source: string;
  note?: string;
};

function clampDuration(ms: number): number {
  return Math.max(DURATION_MS.min, Math.min(DURATION_MS.max, Math.round(ms)));
}

/** The `p:transition` of a slide read through its `mc:AlternateContent`, or undefined when the slide has none. */
export function transitionElement(slideRoot: Element): Element | undefined {
  for (const node of elementChildren(slideRoot)) {
    if (is(node, 'p', 'transition')) return node;
    if (is(node, 'mc', 'AlternateContent')) {
      for (const branch of elementChildren(node)) {
        const found = elementChildren(branch).find((el) => is(el, 'p', 'transition'));
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

/** Reads the transition of a slide; undefined when the slide writes none. */
export function readTransition(slideRoot: Element, ctx: SlideContext): SlideTransition | undefined {
  const el = transitionElement(slideRoot);
  if (el === undefined) return undefined;
  const reading = foldTransition(el);
  if (reading === undefined) return undefined;
  if (!reading.exact) {
    ctx.report.substitute({
      ...rowOn(ctx, 'transition'),
      code:
        reading.note?.startsWith('direction') === true
          ? ROW_CODES.transitionDirection
          : ROW_CODES.transitionKind,
      message: reading.note ?? `The ${reading.source} transition became ${reading.transition.kind}`,
    });
  }
  const advTm = attr(el, 'advTm');
  if (advTm !== undefined)
    ctx.report.row('kept', {
      ...rowOn(ctx, 'transition'),
      code: 'transition.advance',
      message: `An automatic advance after ${advTm} ms was kept out; the show advances on a click`,
    });
  return reading.transition;
}

/** The fold of R01 6.6 over one `p:transition` element. */
export function foldTransition(el: Element): TransitionReading | undefined {
  const children_ = elementChildren(el).filter(
    (node) => !is(node, 'p', 'sndAc') && !is(node, 'p', 'extLst'),
  );
  const effect = children_[0];
  const spd = attr(el, 'spd') ?? 'fast';
  const dur = attr(el, 'dur') ?? undefined;
  const p14Dur = Number(
    el.getAttributeNS('http://schemas.microsoft.com/office/powerpoint/2010/main', 'dur') ??
      dur ??
      '',
  );
  const durationMs = clampDuration(
    Number.isFinite(p14Dur) && p14Dur > 0 ? p14Dur : (SPEED_MS[spd] ?? 500),
  );
  if (effect === undefined)
    return { transition: { kind: 'fade', durationMs }, exact: true, source: 'fade' };
  const name = effect.localName ?? '';
  const ns = effect.namespaceURI ?? '';
  const isP14 = ns.includes('powerpoint/2010') || ns.includes('powerpoint/2012');
  const make = (kind: TransitionKind, exact: boolean, note?: string): TransitionReading => ({
    transition: { kind, durationMs },
    exact,
    source: name,
    ...(note !== undefined ? { note } : {}),
  });
  if (!isP14) {
    switch (name) {
      case 'fade':
        if (attr(effect, 'thruBlk') === '1' || attr(effect, 'thruBlk') === 'true')
          return make('fade', false, 'A fade through black became a fade');
        return make('fade', true);
      case 'cut':
        return make('fade', attr(effect, 'thruBlk') === undefined, 'A cut became a fade');
      case 'push':
      case 'cover':
      case 'pull': {
        const dir = attr(effect, 'dir') ?? 'l';
        if (dir === 'l') return make('slideRight', true);
        if (dir === 'r') return make('slideLeft', true);
        // a vertical direction becomes the nearest horizontal one (R01 6.6)
        return make(
          dir === 'u' || dir === 'ld' || dir === 'lu' ? 'slideRight' : 'slideLeft',
          false,
          `direction ${dir} of the ${name} transition became a horizontal slide`,
        );
      }
      default:
        if (DISSOLVE_NAMES.has(name))
          return make(
            'dissolve',
            name === 'dissolve',
            name === 'dissolve' ? undefined : `The ${name} transition became a dissolve`,
          );
        return make('fade', false, `The ${name} transition became a fade`);
    }
  }
  switch (name) {
    case 'flip':
    case 'switch':
      return make(
        'flip',
        name === 'flip',
        name === 'flip' ? undefined : 'The switch transition became a flip',
      );
    case 'prism':
    case 'doors':
    case 'window':
      return make(
        'cube',
        name === 'prism',
        name === 'prism' ? undefined : `The ${name} transition became a cube`,
      );
    case 'gallery':
    case 'conveyor':
      return make(
        'gallery',
        name === 'gallery',
        name === 'gallery' ? undefined : 'The conveyor transition became a gallery',
      );
    case 'flythrough':
    case 'ferris':
    case 'reveal':
    case 'wheelReverse':
    case 'vortex':
    case 'shred':
    case 'ripple':
    case 'honeycomb':
    case 'glitter':
    case 'warp':
    case 'pan':
    default:
      return make('fade', false, `The ${name} transition became a fade`);
  }
}

/** The preset ids the reader keeps with their subtypes (R01 6.6; R04 5.8). */
const ENTRANCE: Readonly<Record<number, AnimationEffect>> = {
  1: 'appear',
  2: 'flyIn',
  10: 'fadeIn',
  23: 'zoomIn',
};
const EXIT: Readonly<Record<number, AnimationEffect>> = {
  1: 'disappear',
  2: 'flyOut',
  10: 'fadeOut',
  23: 'zoomOut',
};

/** The Fly In and Fly Out side from `presetSubtype` (PowerPoint's direction bits: 1 top, 2 right, 4 bottom, 8 left). */
export function flyDirection(subtype: number, exit: boolean): FlyDirection {
  const from: FlyDirection =
    subtype & 8 ? 'left' : subtype & 2 ? 'right' : subtype & 1 ? 'top' : 'bottom';
  void exit;
  return from;
}

function triggerOf(nodeType: string | undefined): AnimationTrigger {
  switch (nodeType) {
    case 'withEffect':
    case 'withGroup':
      return 'withPrevious';
    case 'afterEffect':
    case 'afterGroup':
      return 'afterPrevious';
    default:
      return 'click';
  }
}

/** The behaviours' `dur` of an effect node, in ms; undefined for `indefinite` or none. */
function effectDuration(cTn: Element): number | undefined {
  const durations: number[] = [];
  for (const behaviour of descendants(cTn, 'p', 'cTn')) {
    const dur = attr(behaviour, 'dur');
    if (dur === undefined || dur === 'indefinite') continue;
    const n = Number(dur);
    if (Number.isFinite(n) && n > 0) durations.push(n);
  }
  return durations.length === 0 ? undefined : Math.max(...durations);
}

/**
 * Reads `p:timing` into the slide's animations (R04 5.8): every effect `p:par/p:cTn` with a
 * `presetClass` under the main sequence, in document order.
 */
export function readAnimations(
  slideRoot: Element,
  ctx: SlideContext,
  byParagraphOf: Set<number>,
): Animation[] {
  const timing = child(slideRoot, 'p', 'timing');
  if (timing === undefined) return [];
  const tnLst = child(timing, 'p', 'tnLst');
  if (tnLst === undefined) return [];
  const animations: Animation[] = [];
  const sequences = descendants(tnLst, 'p', 'seq');
  const main =
    sequences.find((seq) => {
      const cTn = child(seq, 'p', 'cTn');
      return cTn !== undefined && attr(cTn, 'nodeType') === 'mainSeq';
    }) ?? sequences[0];
  const interactive = sequences.filter((seq) => seq !== main);
  if (interactive.length > 0)
    ctx.report.row('kept', {
      ...rowOn(ctx, 'timing'),
      code: ROW_CODES.animationDropped,
      message: `${interactive.length} triggered animation sequence${interactive.length === 1 ? '' : 's'} (a click on another shape) were dropped`,
    });
  if (main === undefined) return [];
  let pendingTrigger: AnimationTrigger = 'click';
  for (const cTn of descendants(main, 'p', 'cTn')) {
    const presetClass = attr(cTn, 'presetClass');
    const nodeType = attr(cTn, 'nodeType');
    if (nodeType === 'clickPar' || nodeType === 'clickEffect') pendingTrigger = 'click';
    if (presetClass === undefined) continue;
    const presetId = Number(attr(cTn, 'presetID') ?? '0');
    const subtype = Number(attr(cTn, 'presetSubtype') ?? '0');
    const trigger = triggerOf(nodeType);
    const targets = descendants(cTn, 'p', 'spTgt').map((el) => Number(attr(el, 'spid') ?? '0'));
    const spid = targets[0];
    const blockId = spid === undefined ? undefined : ctx.shapeIds.get(spid);
    const object = spid === undefined ? 'timing' : `shape ${spid}`;
    if (presetClass === 'path' || presetClass === 'verb' || presetClass === 'mediacall') {
      ctx.report.row('kept', {
        ...rowOn(ctx, object),
        code: ROW_CODES.animationDropped,
        message: `A ${presetClass === 'path' ? 'motion path' : presetClass} animation was dropped`,
      });
      continue;
    }
    if (blockId === undefined) {
      ctx.report.row('kept', {
        ...rowOn(ctx, object),
        code: ROW_CODES.animationDropped,
        message: 'An animation on an object that was not imported was dropped',
      });
      continue;
    }
    let effect: AnimationEffect | undefined;
    let direction: FlyDirection | undefined;
    if (presetClass === 'entr') {
      effect = ENTRANCE[presetId];
      if (effect === undefined) {
        effect = 'fadeIn';
        ctx.report.row('kept', {
          ...rowOn(ctx, object),
          code: ROW_CODES.animationEffect,
          message: `The entrance effect ${presetId} became Fade in`,
        });
      }
      if (effect === 'flyIn') direction = flyDirection(subtype, false);
    } else if (presetClass === 'exit') {
      effect = EXIT[presetId];
      if (effect === undefined) {
        effect = 'fadeOut';
        ctx.report.row('kept', {
          ...rowOn(ctx, object),
          code: ROW_CODES.animationEffect,
          message: `The exit effect ${presetId} became Fade out`,
        });
      }
      if (effect === 'flyOut') direction = flyDirection(subtype, true);
    } else if (presetClass === 'emph') {
      if (presetId === 8) {
        effect = 'spin';
      } else {
        ctx.report.row('kept', {
          ...rowOn(ctx, object),
          code: ROW_CODES.animationDropped,
          message: `The emphasis effect ${presetId} was dropped`,
        });
        continue;
      }
    } else {
      ctx.report.row('kept', {
        ...rowOn(ctx, object),
        code: ROW_CODES.animationDropped,
        message: `A ${presetClass} animation was dropped`,
      });
      continue;
    }
    const repeat = attr(cTn, 'repeatCount');
    if ((repeat !== undefined && repeat !== '1000') || attr(cTn, 'autoRev') === '1')
      ctx.report.row('kept', {
        ...rowOn(ctx, object),
        code: 'animation.repeat',
        message: 'A repeat or auto reverse on the animation was dropped',
      });
    const dur = effectDuration(cTn);
    const durationMs =
      effect === 'appear' || effect === 'disappear'
        ? DURATION_MS.defaultAnimation
        : clampDuration(dur ?? DURATION_MS.defaultAnimation);
    const animation: Animation = {
      id: nextAnimationId(animations),
      blockId,
      effect,
      trigger: trigger === 'click' ? pendingTrigger : trigger,
      durationMs,
    };
    if (direction !== undefined) animation.direction = direction;
    if (spid !== undefined && byParagraphOf.has(spid)) animation.byParagraph = true;
    animations.push(animation);
    pendingTrigger = 'click';
  }
  return animations;
}

/** The `spid`s whose `p:bldP build="p"` builds by paragraph (R04 5.8); other build kinds are reported. */
export function paragraphBuilds(slideRoot: Element, ctx: SlideContext): Set<number> {
  const out = new Set<number>();
  const bldLst = path(slideRoot, ['p', 'timing'], ['p', 'bldLst']);
  if (bldLst === undefined) return out;
  for (const node of elementChildren(bldLst)) {
    if (is(node, 'p', 'bldP')) {
      if (attr(node, 'build') === 'p') {
        const spid = Number(attr(node, 'spid') ?? '');
        if (Number.isFinite(spid)) out.add(spid);
      }
    } else if (
      is(node, 'p', 'bldGraphic') ||
      is(node, 'p', 'bldDgm') ||
      is(node, 'p', 'bldOleChart')
    ) {
      ctx.report.row('kept', {
        ...rowOn(ctx, `shape ${attr(node, 'spid') ?? '?'}`),
        code: 'animation.build',
        message: `A ${node.localName} build (by element of a graphic) was dropped; the object animates whole`,
      });
    }
  }
  return out;
}

/** The `p:timing` element's children, for tests. */
export function timingOf(slideRoot: Element): Element[] {
  const timing = child(slideRoot, 'p', 'timing');
  return timing === undefined ? [] : children(timing, 'p', 'tnLst');
}
