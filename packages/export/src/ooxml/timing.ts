// The timing tree of the post process (gslides-parity SPEC-5 0.13, 2.4; R01 6.3 to 6.5; R05 6, 7.4):
// one `p:timing` per slide with animations or media, after the transition element, in the five
// level shape PowerPoint's own files carry and LibreOffice's tests assert: the root `tmRoot`, the
// main sequence (`nextAc="seek"` with `onPrev` and `onNext`), one click group per step of
// `compileMotion`'s schedule (the entry step, when it has effects, with the `onBegin` condition
// so it plays with the slide), one timing group per click group, and one effect `p:par` per
// schedule effect with `presetID`, `presetClass`, `presetSubtype` and `nodeType` from the trigger,
// its `p:stCondLst` delay the effect's delay in the step, and the behaviours of R01 6.4 verbatim
// from the PowerPoint authored samples (Appear and Disappear the 1 ms `p:set`, Fade in and out the
// `p:animEffect`, the flies the two `p:anim` over `ppt_x` and `ppt_y` in PowerPoint's slide
// relative variables, the zooms `p:animScale`, Spin `p:animRot by="21600000"`, Play the
// `mediacall` `p:cmd playFrom(0.0)`). By paragraph targets `p:spTgt > p:txEl > p:pRg` and the
// shape's `p:bldP` reads `build="p"`. The `p:audio` and `p:video` nodes of the media pictures
// (B2's `ooxml/media.ts` answers their data) sit after the sequence with `p:cMediaNode` carrying
// the volume, mute, loop, Stop on slide change and Hide icon; a `manual` medium gets an
// interactive sequence toggling it on click, a `click` medium without a Play row a click step at
// the end of the sequence (Google's "plays when you advance the slide"). Targets are resolved by
// the caller from the renumbered id map (`ooxml/ids.ts`) and the groups (`ooxml/groups.ts`): a
// block written as one shape by its name, a group by the group's own id, a table or chart by its
// frame, a list item by its item shape; a block that exported as no shape is skipped and named.
import type { MotionEffect, MotionSchedule } from '@turboslide/schema/motion';
import { SWITCH_MS, effectClass } from '@turboslide/schema/motion';

import type { MediaNode } from './media.ts';

/**
 * One shape a timing node can target: the id it carries, whether it holds a text body (a `p:bldP`
 * row), and whether a paragraph effect on it addresses a paragraph range (`p:pRg`, a text block's
 * one shape) or the whole shape (a list item's own shape, a ruled row's group).
 */
export type TimingTarget = { spid: number; text: boolean; range?: boolean };

/**
 * The caller's resolver (pptx/build.ts): the shapes of a block on the slide, or of one paragraph
 * of it under By paragraph (a list item's shape, a ruled row's group). `paragraph` undefined asks
 * for the whole block. An empty list means the block exported as no shape.
 */
export type TargetResolver = (blockId: string, paragraph: number | undefined) => TimingTarget[];

/** The preset triple of one effect (SPEC-5 0.13; R01 6.4): PowerPoint's ids, LibreOffice's table. */
export function presetOf(effect: MotionEffect): {
  presetClass: 'entr' | 'exit' | 'emph' | 'mediacall';
  presetID: number;
  presetSubtype: number;
} {
  const kind = effect.animation.effect;
  const direction = effect.animation.direction ?? 'left';
  const subtype = { top: 1, right: 2, bottom: 4, left: 8 }[direction];
  switch (kind) {
    case 'appear':
      return { presetClass: 'entr', presetID: 1, presetSubtype: 0 };
    case 'disappear':
      return { presetClass: 'exit', presetID: 1, presetSubtype: 0 };
    case 'fadeIn':
      return { presetClass: 'entr', presetID: 10, presetSubtype: 0 };
    case 'fadeOut':
      return { presetClass: 'exit', presetID: 10, presetSubtype: 0 };
    case 'flyIn':
      return { presetClass: 'entr', presetID: 2, presetSubtype: subtype };
    case 'flyOut':
      return { presetClass: 'exit', presetID: 2, presetSubtype: subtype };
    case 'zoomIn':
      return { presetClass: 'entr', presetID: 23, presetSubtype: 16 };
    case 'zoomOut':
      return { presetClass: 'exit', presetID: 23, presetSubtype: 32 };
    case 'spin':
      return { presetClass: 'emph', presetID: 8, presetSubtype: 0 };
    case 'playMedia':
      return { presetClass: 'mediacall', presetID: 1, presetSubtype: 0 };
  }
}

/** The fifteen triples as `class/id/subtype`, the set the check reads the file against. */
export const PRESET_TRIPLES: ReadonlySet<string> = new Set([
  'entr/1/0',
  'exit/1/0',
  'entr/10/0',
  'exit/10/0',
  'entr/2/1',
  'entr/2/2',
  'entr/2/4',
  'entr/2/8',
  'exit/2/1',
  'exit/2/2',
  'exit/2/4',
  'exit/2/8',
  'entr/23/16',
  'exit/23/32',
  'emph/8/0',
  'mediacall/1/0',
  /* the Play (on click) step of a click medium without a row and the manual toggle */
  'mediacall/2/0',
]);

export type TimingNodeType = 'clickEffect' | 'withEffect' | 'afterEffect';

export function nodeTypeOf(effect: MotionEffect): TimingNodeType {
  switch (effect.animation.trigger) {
    case 'click':
      return 'clickEffect';
    case 'withPrevious':
      return 'withEffect';
    case 'afterPrevious':
      return 'afterEffect';
  }
}

type Ids = { next: () => number };

function tgt(target: TimingTarget, paragraph: number | undefined): string {
  if (paragraph === undefined) return `<p:tgtEl><p:spTgt spid="${target.spid}"/></p:tgtEl>`;
  return `<p:tgtEl><p:spTgt spid="${target.spid}"><p:txEl><p:pRg st="${paragraph}" end="${paragraph}"/></p:txEl></p:spTgt></p:tgtEl>`;
}

/** `p:set style.visibility` to a value at a delay, PowerPoint's 1 ms switch. */
function setVisibility(
  ids: Ids,
  target: string,
  value: 'visible' | 'hidden',
  delayMs: number,
): string {
  return (
    `<p:set><p:cBhvr><p:cTn id="${ids.next()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${delayMs}"/></p:stCondLst></p:cTn>` +
    `${target}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>` +
    `<p:to><p:strVal val="${value}"/></p:to></p:set>`
  );
}

function anim(
  ids: Ids,
  target: string,
  attr: 'ppt_x' | 'ppt_y',
  from: string,
  to: string,
  dur: number,
): string {
  return (
    `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${ids.next()}" dur="${dur}" fill="hold"/>` +
    `${target}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr>` +
    `<p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`
  );
}

/** The two `p:anim` of a fly: the off page start (or end) in PowerPoint's slide relative variables (R01 6.4). */
function flyAnims(ids: Ids, target: string, direction: string, into: boolean, dur: number): string {
  const off: Record<string, [string, string]> = {
    left: ['0-#ppt_w/2', '#ppt_x'],
    right: ['1+#ppt_w/2', '#ppt_x'],
    top: ['#ppt_x', '0-#ppt_h/2'],
    bottom: ['#ppt_x', '1+#ppt_h/2'],
  };
  const pair = off[direction] ?? off.left!;
  const horizontal = direction === 'left' || direction === 'right';
  const xFrom = horizontal ? pair[0] : '#ppt_x';
  const yFrom = horizontal ? '#ppt_y' : pair[1];
  const x = into
    ? anim(ids, target, 'ppt_x', xFrom, '#ppt_x', dur)
    : anim(ids, target, 'ppt_x', '#ppt_x', xFrom, dur);
  const y = into
    ? anim(ids, target, 'ppt_y', yFrom, '#ppt_y', dur)
    : anim(ids, target, 'ppt_y', '#ppt_y', yFrom, dur);
  return x + y;
}

/** The behaviours of one effect on one target (R01 6.4 verbatim from the PowerPoint authored samples). */
export function effectBehaviours(
  ids: Ids,
  effect: MotionEffect,
  target: TimingTarget,
  paragraph: number | undefined,
): string {
  const t = tgt(target, paragraph);
  const dur = Math.max(1, Math.round(effect.durationMs));
  const direction = effect.animation.direction ?? 'left';
  switch (effect.animation.effect) {
    case 'appear':
      return setVisibility(ids, t, 'visible', 0);
    case 'disappear':
      return setVisibility(ids, t, 'hidden', 0);
    case 'fadeIn':
      return (
        setVisibility(ids, t, 'visible', 0) +
        `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${ids.next()}" dur="${dur}"/>${t}</p:cBhvr></p:animEffect>`
      );
    case 'fadeOut':
      return (
        `<p:animEffect transition="out" filter="fade"><p:cBhvr><p:cTn id="${ids.next()}" dur="${dur}"/>${t}</p:cBhvr></p:animEffect>` +
        setVisibility(ids, t, 'hidden', Math.max(0, dur - 1))
      );
    case 'flyIn':
      return setVisibility(ids, t, 'visible', 0) + flyAnims(ids, t, direction, true, dur);
    case 'flyOut':
      return (
        flyAnims(ids, t, direction, false, dur) +
        setVisibility(ids, t, 'hidden', Math.max(0, dur - 1))
      );
    case 'zoomIn':
      return (
        setVisibility(ids, t, 'visible', 0) +
        `<p:animScale><p:cBhvr><p:cTn id="${ids.next()}" dur="${dur}" fill="hold"/>${t}</p:cBhvr><p:from x="0" y="0"/><p:to x="100000" y="100000"/></p:animScale>`
      );
    case 'zoomOut':
      return (
        `<p:animScale><p:cBhvr><p:cTn id="${ids.next()}" dur="${dur}" fill="hold"/>${t}</p:cBhvr><p:from x="100000" y="100000"/><p:to x="0" y="0"/></p:animScale>` +
        setVisibility(ids, t, 'hidden', Math.max(0, dur - 1))
      );
    case 'spin':
      return `<p:animRot by="21600000"><p:cBhvr><p:cTn id="${ids.next()}" dur="${dur}" fill="hold"/>${t}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`;
    case 'playMedia':
      return `<p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="${ids.next()}" dur="1" fill="hold"/>${t}</p:cBhvr></p:cmd>`;
  }
}

/** One effect `p:par` (level 5) on one target. */
function effectPar(
  ids: Ids,
  effect: MotionEffect,
  target: TimingTarget,
  nodeType: TimingNodeType,
  delayMs: number,
): string {
  const preset = presetOf(effect);
  const paragraph = effect.paragraph;
  return (
    `<p:par><p:cTn id="${ids.next()}" presetID="${preset.presetID}" presetClass="${preset.presetClass}" presetSubtype="${preset.presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">` +
    `<p:stCondLst><p:cond delay="${Math.max(0, Math.round(delayMs))}"/></p:stCondLst>` +
    `<p:childTnLst>${effectBehaviours(ids, effect, target, paragraph)}</p:childTnLst></p:cTn></p:par>`
  );
}

export type TimingResult = {
  xml: string;
  written: boolean;
  /** the effect `p:par` nodes written */
  effects: number;
  /** the `p:bldP` rows and how many carry `build="p"` */
  bldP: number;
  bldParagraph: number;
  /** the `p:audio` and `p:video` nodes */
  mediaNodes: number;
  /** animations left out because their block exported as no shape */
  skipped: { animationId: string; reason: string }[];
};

/**
 * The media nodes under the root (R05 7.4): `p:audio` for an audio, `p:video` for a video, each
 * with the `p:cMediaNode` of its playback; an online (YouTube) picture carries none, PowerPoint
 * writes its own for the online form.
 */
export function mediaNodeXml(ids: Ids, node: MediaNode): string {
  if (node.online) return '';
  const playback = node.playback;
  const volume = Math.round(Math.max(0, Math.min(100, playback.volume ?? 100)) * 1000);
  const attrs = [
    `vol="${volume}"`,
    playback.mute === true ? 'mute="1"' : '',
    playback.hideIcon === true ? 'showWhenStopped="0"' : '',
    playback.stopOnSlideChange === false ? 'numSld="999"' : '',
  ]
    .filter((a) => a !== '')
    .join(' ');
  const repeat = playback.loop === true ? ' repeatCount="indefinite"' : '';
  const display = node.kind === 'audio' ? ' display="0"' : '';
  const open = node.kind === 'audio' ? '<p:audio>' : '<p:video fullScrn="0">';
  const close = node.kind === 'audio' ? '</p:audio>' : '</p:video>';
  return (
    `${open}<p:cMediaNode ${attrs}><p:cTn id="${ids.next()}" fill="hold"${display}${repeat}>` +
    `<p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>` +
    `<p:endCondLst><p:cond evt="onStopAudio" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:endCondLst></p:cTn>` +
    `<p:tgtEl><p:spTgt spid="${node.shapeId}"/></p:tgtEl></p:cMediaNode>${close}`
  );
}

/** A `manual` medium's interactive sequence: a click on the shape toggles it (R05 7.4). */
function interactiveSequence(ids: Ids, node: MediaNode): string {
  const target = `<p:tgtEl><p:spTgt spid="${node.shapeId}"/></p:tgtEl>`;
  return (
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${ids.next()}" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq">` +
    `<p:stCondLst><p:cond evt="onClick" delay="0">${target}</p:cond></p:stCondLst>` +
    `<p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync>` +
    `<p:childTnLst><p:par><p:cTn id="${ids.next()}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="${ids.next()}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="${ids.next()}" presetID="2" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="clickEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst>` +
    `<p:childTnLst><p:cmd type="call" cmd="togglePause"><p:cBhvr><p:cTn id="${ids.next()}" dur="1" fill="hold"/>${target}</p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par>` +
    `</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn>` +
    `<p:nextCondLst><p:cond evt="onClick" delay="0">${target}</p:cond></p:nextCondLst></p:seq>`
  );
}

/** A click step that plays the `click` media without a Play row (Google's "plays when you advance the slide"). */
function clickMediaStep(ids: Ids, nodes: MediaNode[]): string {
  const effects = nodes
    .map(
      (node) =>
        `<p:par><p:cTn id="${ids.next()}" presetID="2" presetClass="mediacall" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst>` +
        `<p:childTnLst><p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="${ids.next()}" dur="1" fill="hold"/><p:tgtEl><p:spTgt spid="${node.shapeId}"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par>`,
    )
    .join('');
  return (
    `<p:par><p:cTn id="${ids.next()}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>` +
    `<p:par><p:cTn id="${ids.next()}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par>` +
    `</p:childTnLst></p:cTn></p:par>`
  );
}

/**
 * Writes the timing tree of a slide part from its schedule. A slide with no effects and no media
 * node is left without `p:timing`; an existing `p:timing` is replaced. The tree goes before
 * `</p:sld>` (after the transition, PowerPoint's element order).
 */
export function writeTiming(
  xml: string,
  schedule: MotionSchedule,
  resolve: TargetResolver,
  media: readonly MediaNode[] = [],
): TimingResult {
  const stripped = xml.replace(/<p:timing>[\s\S]*?<\/p:timing>/, '');
  const result: TimingResult = {
    xml: stripped,
    written: false,
    effects: 0,
    bldP: 0,
    bldParagraph: 0,
    mediaNodes: 0,
    skipped: [...schedule.skipped],
  };
  let counter = 0;
  const ids: Ids = { next: () => (counter += 1) };
  /** the text shapes animated, and whether one of their effects addresses a paragraph */
  const builds = new Map<number, boolean>();
  const mediaById = new Map(media.map((node) => [node.blockId, node]));
  const playedMedia = new Set<string>();

  const clickGroups: string[] = [];
  const rootId = ids.next(); // 1
  const seqId = ids.next(); // 2
  schedule.steps.forEach((step, index) => {
    if (step.effects.length === 0) return;
    // the click group and its timing group take their ids before the effects, document order
    const clickId = ids.next();
    const groupId = ids.next();
    const effects: string[] = [];
    for (const effect of step.effects) {
      const blockId = effect.animation.blockId;
      let targets: TimingTarget[];
      if (effect.animation.effect === 'playMedia') {
        const node = mediaById.get(blockId);
        targets = node === undefined ? [] : [{ spid: node.shapeId, text: false }];
        if (node !== undefined) playedMedia.add(blockId);
      } else targets = resolve(blockId, effect.paragraph);
      if (targets.length === 0) {
        const reason =
          effect.paragraph === undefined
            ? `block "${blockId}" exported as no shape`
            : `paragraph ${effect.paragraph} of block "${blockId}" exported as no shape`;
        if (
          !result.skipped.some(
            (row) => row.animationId === effect.animation.id && row.reason === reason,
          )
        )
          result.skipped.push({ animationId: effect.animation.id, reason });
        continue;
      }
      const nodeType = nodeTypeOf(effect);
      targets.forEach((target, at) => {
        // a block that exported as several shapes plays them together: the second onwards with the first
        const type: TimingNodeType = at === 0 ? nodeType : 'withEffect';
        // a paragraph range needs the text block's one shape; a list item's own shape plays whole
        const paragraph = target.range === true && target.text ? effect.paragraph : undefined;
        effects.push(effectPar(ids, { ...effect, paragraph }, target, type, effect.delayMs));
        result.effects += 1;
        if (target.text && effectClass(effect.animation.effect) !== 'media')
          builds.set(target.spid, (builds.get(target.spid) ?? false) || paragraph !== undefined);
      });
    }
    if (effects.length === 0) return;
    const onBegin =
      index === 0 ? `<p:cond evt="onBegin" delay="0"><p:tn val="${seqId}"/></p:cond>` : '';
    clickGroups.push(
      `<p:par><p:cTn id="${clickId}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/>${onBegin}</p:stCondLst><p:childTnLst>` +
        `<p:par><p:cTn id="${groupId}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects.join('')}</p:childTnLst></p:cTn></p:par>` +
        `</p:childTnLst></p:cTn></p:par>`,
    );
  });
  // the click media without a Play row: one click step after the schedule's (R11 5.4)
  const clickMedia = media.filter(
    (node) =>
      !node.online &&
      !playedMedia.has(node.blockId) &&
      (node.playback.start ?? 'click') === 'click',
  );
  if (clickMedia.length > 0) {
    clickGroups.push(clickMediaStep(ids, clickMedia));
    result.effects += clickMedia.length;
  }
  const manual = media.filter((node) => !node.online && node.playback.start === 'manual');
  const mediaXml = media.map((node) => mediaNodeXml(ids, node)).join('');
  result.mediaNodes = media.filter((node) => !node.online).length;
  if (clickGroups.length === 0 && result.mediaNodes === 0) return result;

  const sequence =
    clickGroups.length === 0
      ? ''
      : `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${seqId}" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${clickGroups.join('')}</p:childTnLst></p:cTn>` +
        `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>` +
        `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>`;
  const interactive = manual.map((node) => interactiveSequence(ids, node)).join('');
  const bldLst =
    builds.size === 0
      ? ''
      : `<p:bldLst>${[...builds.entries()]
          .map(
            ([spid, byParagraph]) =>
              `<p:bldP spid="${spid}" grpId="0"${byParagraph ? ' build="p"' : ''}/>`,
          )
          .join('')}</p:bldLst>`;
  result.bldP = builds.size;
  result.bldParagraph = [...builds.values()].filter(Boolean).length;
  const timing =
    `<p:timing><p:tnLst><p:par><p:cTn id="${rootId}" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>` +
    `${sequence}${interactive}${mediaXml}</p:childTnLst></p:cTn></p:par></p:tnLst>${bldLst}</p:timing>`;
  const end = stripped.lastIndexOf('</p:sld>');
  if (end < 0) return result;
  result.xml = stripped.slice(0, end) + timing + stripped.slice(end);
  result.written = true;
  return result;
}

/**
 * The resolver over a renumbered part (pptx/build.ts): a block's shapes by their object names
 * (`ts:<slide>#<block>`, `.../<pointer>`, `...@<group keys>`), a group's own id when the block sits in
 * a user group or a ruled row group, a list item's shapes for a paragraph of a list, the one text
 * shape (whole) for a paragraph of a text block. `texts` marks the names whose shape holds a text body.
 */
export function targetResolver(
  slideId: string,
  ids: ReadonlyMap<string, number>,
  texts: ReadonlySet<string>,
  aliases: ReadonlyMap<string, readonly string[]> = new Map(),
): TargetResolver {
  const prefix = `ts:${slideId}#`;
  return (blockId, paragraph) => {
    const own = `${prefix}${blockId}`;
    const extra = new Set(aliases.get(blockId) ?? []);
    // a block's shapes: its own name, a pointer under it (`/text`, `/items/0/text`), a raster of
    // it (`:1`, images.ts names a raster `<block>:<n>`), a group key on it, or an alias the
    // builder named (a rule block's `rule/<i>`)
    const entries = [...ids.entries()].filter(
      ([name]) =>
        name === own ||
        name.startsWith(`${own}/`) ||
        name.startsWith(`${own}@`) ||
        name.startsWith(`${own}:`) ||
        extra.has(name),
    );
    if (entries.length === 0) return [];
    /** the group keys of a name: `@g:<tag>@<block>/row/<i>` */
    const keysOf = (name: string): string[] => {
      const at = name.indexOf('@');
      return at < 0
        ? []
        : name
            .slice(at + 1)
            .split('@')
            .filter((k) => k !== '');
    };
    const pointerOf = (name: string): string => {
      const bare = name.split('@')[0] ?? name;
      return bare.startsWith(own) && bare.length > own.length ? bare.slice(own.length + 1) : '';
    };
    // a paragraph of a list block: the item's shapes (or its row group)
    if (paragraph !== undefined) {
      const items = entries.filter(([name]) => pointerOf(name).startsWith(`items/${paragraph}/`));
      if (items.length > 0) {
        const rowKey = `${blockId}/row/${paragraph}`;
        const group = ids.get(rowKey);
        if (group !== undefined) return [{ spid: group, text: false }];
        return items.map(([name, spid]) => ({ spid, text: texts.has(name) }));
      }
      const rowGroup = ids.get(`${blockId}/row/${paragraph}`);
      if (rowGroup !== undefined) return [{ spid: rowGroup, text: false }];
      // a text block: the one text shape, addressed by its paragraph range
      const text = entries.find(([name]) => texts.has(name));
      return text === undefined ? [] : [{ spid: text[1], text: true, range: true }];
    }
    // the whole block: its user group when it has one and the group exists, else its row
    // groups, else its own shapes
    const outer = keysOf(entries[0]![0])[0];
    if (outer !== undefined && outer.startsWith('g:')) {
      const group = ids.get(outer);
      if (group !== undefined) return [{ spid: group, text: false }];
    }
    const rows = [...ids.entries()].filter(([name]) =>
      new RegExp(`^${blockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/row/\\d+$`).test(name),
    );
    if (rows.length > 0) return rows.map(([, spid]) => ({ spid, text: false }));
    return entries.map(([name, spid]) => ({ spid, text: texts.has(name) }));
  };
}

/** The names of the shapes of a part whose element holds a text body, for the resolver. */
export function textShapeNames(xml: string): Set<string> {
  const out = new Set<string>();
  for (const match of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    const shape = match[0];
    if (!shape.includes('<p:txBody>')) continue;
    const name = /<p:cNvPr\b[^>]*?\sname="([^"]*)"/.exec(shape)?.[1];
    if (name !== undefined)
      out.add(
        name
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'"),
      );
  }
  return out;
}

/** The read back of the check: every `p:cTn` preset triple of a part as `class/id/subtype`. */
export function readPresets(xml: string): string[] {
  return [
    ...xml.matchAll(
      /<p:cTn\b[^>]*\spresetID="(\d+)"[^>]*\spresetClass="([a-z]+)"[^>]*\spresetSubtype="(\d+)"/g,
    ),
  ].map((m) => `${m[2]}/${m[1]}/${m[3]}`);
}

export { SWITCH_MS };
