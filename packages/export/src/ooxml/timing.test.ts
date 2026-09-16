import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { compileMotion, deckMediaLength } from '@turboslide/render/motion';
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { MotionEffect, MotionSchedule } from '@turboslide/schema/motion';
import { blockParagraphCount, motionTargets } from '@turboslide/schema/motion';

import { checkMotionPart } from '../check/motion.ts';
import { renumberShapeIds } from './ids.ts';
import type { MediaNode } from './media.ts';
import {
  effectBehaviours,
  nodeTypeOf,
  PRESET_TRIPLES,
  presetOf,
  readPresets,
  targetResolver,
  textShapeNames,
  writeTiming,
} from './timing.ts';
import { writeTransition } from './transition.ts';

// The timing tree (gslides-parity SPEC-5 0.13, 2.4, 2.6; R01 6.3 to 6.5): the XPath of the five
// levels, the preset triples of the fifteen effects, the click groups per step with the onBegin
// condition on the entry step, the delays, the ids unique, the bldP rows with build="p" under By
// paragraph, the media nodes over B2's MediaNode, the click and manual media forms, and the
// resolver over the object names of a part, against the schedules of decks/fixture/motion.

const REPO = resolve(import.meta.dirname, '../../../..');
const FIXTURE_DIR = join(REPO, 'decks/fixture/motion');

function loadDeck(dir: string): { deck: Deck; slides: Record<string, Slide> } {
  const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Deck;
  const slides: Record<string, Slide> = {};
  for (const file of readdirSync(join(dir, 'slides')))
    slides[file.replace(/\.json$/, '')] = JSON.parse(
      readFileSync(join(dir, 'slides', file), 'utf8'),
    ) as Slide;
  return { deck, slides };
}

const fixture = loadDeck(FIXTURE_DIR);

function scheduleOf(id: string): MotionSchedule {
  const slide = fixture.slides[id];
  if (slide === undefined) throw new Error(id);
  const blocks = motionTargets(slide);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  return compileMotion(
    slide,
    blocks,
    (blockId) => {
      const block = byId.get(blockId);
      return block === undefined ? 0 : blockParagraphCount(block);
    },
    deckMediaLength(fixture.deck, slide),
  );
}

function sp(id: number, name: string, text = true): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr>` +
    (text ? '<p:txBody><a:bodyPr/><a:p><a:r><a:t>x</a:t></a:r></a:p></p:txBody>' : '') +
    '</p:sp>'
  );
}

function pic(id: number, name: string): string {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:spPr/></p:pic>`;
}

function part(shapes: string): string {
  return (
    '<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    shapes +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  );
}

/** The effects slide: fifteen shapes, one per block, as pptxgenjs names them. */
function effectsPart(): string {
  const names = ['h', ...Array.from({ length: 15 }, (_v, i) => `b${i + 1}`)];
  return part(names.map((name, i) => sp(i + 2, `ts:effects#${name}/text`)).join(''));
}

const EFFECT_XPATH =
  /<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="\d+" fill="hold"><p:stCondLst><p:cond delay="indefinite"\/>/;

describe('presetOf and nodeTypeOf', () => {
  const effect = (
    kind: MotionEffect['animation']['effect'],
    direction?: 'left' | 'right' | 'top' | 'bottom',
  ): MotionEffect => ({
    animation: {
      id: 'a1',
      blockId: 'b',
      effect: kind,
      trigger: 'click',
      durationMs: 500,
      ...(direction ? { direction } : {}),
    },
    delayMs: 0,
    durationMs: 500,
  });

  test('the fifteen triples of SPEC-5 0.13', () => {
    expect(presetOf(effect('appear'))).toEqual({
      presetClass: 'entr',
      presetID: 1,
      presetSubtype: 0,
    });
    expect(presetOf(effect('disappear'))).toEqual({
      presetClass: 'exit',
      presetID: 1,
      presetSubtype: 0,
    });
    expect(presetOf(effect('fadeIn'))).toEqual({
      presetClass: 'entr',
      presetID: 10,
      presetSubtype: 0,
    });
    expect(presetOf(effect('fadeOut'))).toEqual({
      presetClass: 'exit',
      presetID: 10,
      presetSubtype: 0,
    });
    expect(presetOf(effect('flyIn', 'top')).presetSubtype).toBe(1);
    expect(presetOf(effect('flyIn', 'right')).presetSubtype).toBe(2);
    expect(presetOf(effect('flyIn', 'bottom')).presetSubtype).toBe(4);
    expect(presetOf(effect('flyIn', 'left'))).toEqual({
      presetClass: 'entr',
      presetID: 2,
      presetSubtype: 8,
    });
    expect(presetOf(effect('flyOut', 'right'))).toEqual({
      presetClass: 'exit',
      presetID: 2,
      presetSubtype: 2,
    });
    expect(presetOf(effect('zoomIn'))).toEqual({
      presetClass: 'entr',
      presetID: 23,
      presetSubtype: 16,
    });
    expect(presetOf(effect('zoomOut'))).toEqual({
      presetClass: 'exit',
      presetID: 23,
      presetSubtype: 32,
    });
    expect(presetOf(effect('spin'))).toEqual({
      presetClass: 'emph',
      presetID: 8,
      presetSubtype: 0,
    });
    expect(presetOf(effect('playMedia'))).toEqual({
      presetClass: 'mediacall',
      presetID: 1,
      presetSubtype: 0,
    });
    expect(PRESET_TRIPLES.size).toBe(17);
  });

  test('the node type follows the trigger', () => {
    expect(nodeTypeOf(effect('appear'))).toBe('clickEffect');
    expect(
      nodeTypeOf({
        ...effect('appear'),
        animation: { ...effect('appear').animation, trigger: 'withPrevious' },
      }),
    ).toBe('withEffect');
    expect(
      nodeTypeOf({
        ...effect('appear'),
        animation: { ...effect('appear').animation, trigger: 'afterPrevious' },
      }),
    ).toBe('afterEffect');
  });

  test('the behaviours are the PowerPoint authored bodies of R01 6.4', () => {
    let n = 10;
    const ids = { next: () => (n += 1) };
    const target = { spid: 6, text: true };
    const fly = effectBehaviours(ids, effect('flyIn', 'left'), target, undefined);
    expect(fly).toContain('<p:attrName>style.visibility</p:attrName>');
    expect(fly).toContain('<p:strVal val="visible"/>');
    expect(fly).toContain('<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base">');
    expect(fly).toContain(
      '<p:tav tm="0"><p:val><p:strVal val="0-#ppt_w/2"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_x"/></p:val></p:tav>',
    );
    expect(fly).toContain(
      '<p:strVal val="#ppt_y"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/>',
    );
    const spin = effectBehaviours(ids, effect('spin'), target, undefined);
    expect(spin).toContain('<p:animRot by="21600000">');
    expect(spin).toContain('<p:attrName>r</p:attrName>');
    const out = effectBehaviours(ids, effect('fadeOut'), target, 2);
    expect(out).toContain('<p:animEffect transition="out" filter="fade">');
    expect(out).toContain('<p:cond delay="499"/>');
    expect(out).toContain('<p:spTgt spid="6"><p:txEl><p:pRg st="2" end="2"/></p:txEl></p:spTgt>');
    expect(out).toContain('<p:strVal val="hidden"/>');
    const zoom = effectBehaviours(ids, effect('zoomIn'), target, undefined);
    expect(zoom).toContain('<p:animScale>');
    expect(zoom).toContain('<p:from x="0" y="0"/><p:to x="100000" y="100000"/>');
    const play = effectBehaviours(ids, effect('playMedia'), { spid: 9, text: false }, undefined);
    expect(play).toContain('<p:cmd type="call" cmd="playFrom(0.0)">');
    const appear = effectBehaviours(ids, { ...effect('appear'), durationMs: 1 }, target, undefined);
    expect(appear).toContain('dur="1"');
  });
});

describe('writeTiming over the fixture schedules', () => {
  test('the effects slide: the five level tree, seven click groups after the empty entry step, every triple, unique ids', () => {
    const renumbered = renumberShapeIds(effectsPart());
    const schedule = scheduleOf('effects');
    const out = writeTiming(
      renumbered.xml,
      schedule,
      targetResolver('effects', renumbered.ids, textShapeNames(renumbered.xml)),
    );
    expect(out.written).toBe(true);
    expect(out.xml).toMatch(EFFECT_XPATH);
    // the entry step is empty: six click groups, none with onBegin
    expect((out.xml.match(/<p:cond delay="indefinite"\/>/g) ?? []).length).toBe(6);
    expect(out.xml).not.toContain('evt="onBegin"');
    expect(out.effects).toBe(15);
    const presets = readPresets(out.xml);
    expect(presets).toHaveLength(15);
    expect(new Set(presets).size).toBe(15);
    for (const triple of presets) expect(PRESET_TRIPLES.has(triple)).toBe(true);
    // the delays of the schedule: b3 after previous at 1 ms, b6 at 1000
    expect(out.xml).toContain('nodeType="afterEffect"><p:stCondLst><p:cond delay="1"/>');
    expect(out.xml).toContain('nodeType="afterEffect"><p:stCondLst><p:cond delay="1000"/>');
    expect(out.xml).toContain(
      '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>',
    );
    expect(out.xml).toContain(
      '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>',
    );
    // fifteen text shapes animated, none By paragraph
    expect(out.bldP).toBe(15);
    expect(out.bldParagraph).toBe(0);
    expect(out.xml).toContain('<p:bldLst><p:bldP spid="3" grpId="0"/>');
    const check = checkMotionPart('ppt/slides/slide9.xml', out.xml);
    expect(check.effects).toBe(15);
    expect(check.duplicateIds).toEqual([]);
    expect(check.danglingTargets).toEqual([]);
    expect(check.unknownPresets).toEqual([]);
    expect(check.nodeTypes).toEqual({
      tmRoot: 1,
      mainSeq: 1,
      clickEffect: 6,
      withEffect: 4,
      afterEffect: 5,
    });
    // document order: the click group, its timing group, then the effect
    expect(out.xml).toMatch(
      /<p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"\/><\/p:stCondLst><p:childTnLst><p:par><p:cTn id="4" fill="hold">[\s\S]*?<p:cTn id="5" presetID="1"/,
    );
    expect(out.skipped).toEqual([]);
  });

  test('a transition slide: the entry step plays on begin, the transition sits before the timing', () => {
    const renumbered = renumberShapeIds(
      part(sp(2, 'ts:t-fade#h/text') + sp(3, 'ts:t-fade#obj/text')),
    );
    const schedule = scheduleOf('t-fade');
    const withTransition = writeTransition(renumbered.xml, schedule.transition);
    const out = writeTiming(
      withTransition.xml,
      schedule,
      targetResolver('t-fade', renumbered.ids, textShapeNames(renumbered.xml)),
    );
    expect(out.xml).toContain(
      '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>',
    );
    expect(out.xml.indexOf('</mc:AlternateContent><p:timing>')).toBeGreaterThan(0);
    expect(out.effects).toBe(1);
    expect(readPresets(out.xml)).toEqual(['entr/2/8']);
    expect(checkMotionPart('ppt/slides/slide3.xml', out.xml)).toMatchObject({
      transition: 'p:fade',
      durationMs: 500,
      fallback: 'p:fade',
      effects: 1,
      bldP: 1,
      requires: { p14: 1 },
    });
  });

  test('By paragraph: the text box takes pRg per paragraph and build="p", the list its item shapes', () => {
    const items = [0, 1, 2, 3].map((i) => sp(4 + i, `ts:paragraphs#list/items/${i}/text`)).join('');
    const renumbered = renumberShapeIds(
      part(sp(2, 'ts:paragraphs#h/text') + sp(3, 'ts:paragraphs#para/text') + items),
    );
    const schedule = scheduleOf('paragraphs');
    const out = writeTiming(
      renumbered.xml,
      schedule,
      targetResolver('paragraphs', renumbered.ids, textShapeNames(renumbered.xml)),
    );
    // the heading (1) + three paragraphs (3) + four items (4) + the list's disappear on four item shapes (4)
    expect(out.effects).toBe(12);
    expect(out.xml).toContain('<p:pRg st="0" end="0"/>');
    expect(out.xml).toContain('<p:pRg st="2" end="2"/>');
    expect(out.xml).not.toContain('<p:pRg st="3" end="3"/>');
    expect(out.xml).toContain('<p:bldP spid="3" grpId="0" build="p"/>');
    expect(out.bldParagraph).toBe(1);
    // the entry step (the heading on begin), three clicks for the paragraphs, one for the disappear: five click groups
    expect((out.xml.match(/<p:cond delay="indefinite"\/>/g) ?? []).length).toBe(5);
    // the list's chained items after the third paragraph: afterEffect with the chained delays
    expect(out.xml).toContain('nodeType="afterEffect"><p:stCondLst><p:cond delay="500"/>');
    expect(out.xml).toContain('nodeType="afterEffect"><p:stCondLst><p:cond delay="503"/>');
    // the disappear on four shapes: the first a clickEffect, the rest with it
    const check = checkMotionPart('ppt/slides/slide10.xml', out.xml);
    expect(check.nodeTypes.clickEffect).toBe(4);
    expect(check.nodeTypes.withEffect).toBe(4);
    expect(check.duplicateIds).toEqual([]);
    expect(check.danglingTargets).toEqual([]);
  });

  test('a block that exported as no shape is skipped and named', () => {
    const renumbered = renumberShapeIds(part(sp(2, 'ts:t-fade#h/text')));
    const schedule = scheduleOf('t-fade');
    const out = writeTiming(
      renumbered.xml,
      schedule,
      targetResolver('t-fade', renumbered.ids, textShapeNames(renumbered.xml)),
    );
    expect(out.written).toBe(false);
    expect(out.effects).toBe(0);
    expect(out.skipped).toEqual([
      { animationId: 'a1', reason: 'block "obj" exported as no shape' },
    ]);
  });

  test('the media slide: the Play step targets the media picture, the audio and video nodes carry the playback, a click medium gets a click step', () => {
    const renumbered = renumberShapeIds(
      part(sp(2, 'ts:media#h/text') + pic(3, 'ts:media#clip') + pic(4, 'ts:media#tone')),
    );
    const schedule = scheduleOf('media');
    const nodes: MediaNode[] = [
      {
        blockId: 'clip',
        kind: 'video',
        shapeName: 'ts:media#clip',
        relationshipId: 'rId5',
        shapeId: 3,
        playback: { start: 'auto' },
        online: false,
      },
      {
        blockId: 'tone',
        kind: 'audio',
        shapeName: 'ts:media#tone',
        relationshipId: 'rId7',
        shapeId: 4,
        playback: { start: 'click', volume: 50 },
        online: false,
      },
    ];
    const out = writeTiming(
      renumbered.xml,
      schedule,
      targetResolver('media', renumbered.ids, textShapeNames(renumbered.xml)),
      nodes,
    );
    expect(out.written).toBe(true);
    expect(out.mediaNodes).toBe(2);
    // the Play row on entry, then the click audio's own step
    expect(out.effects).toBe(2);
    expect(readPresets(out.xml)).toEqual(['mediacall/1/0', 'mediacall/2/0']);
    expect(out.xml).toMatch(
      /<p:cmd type="call" cmd="playFrom\(0\.0\)"><p:cBhvr><p:cTn id="\d+" dur="1" fill="hold"\/><p:tgtEl><p:spTgt spid="3"\/><\/p:tgtEl>/,
    );
    expect(out.xml).toContain('<p:video fullScrn="0"><p:cMediaNode vol="100000">');
    expect(out.xml).toContain('<p:audio><p:cMediaNode vol="50000"><p:cTn id="');
    expect(out.xml).toContain('fill="hold" display="0">');
    expect(out.xml).toContain(
      '<p:cond evt="onStopAudio" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond>',
    );
    expect(out.bldP).toBe(0);
    const check = checkMotionPart('ppt/slides/slide11.xml', out.xml);
    expect(check.audio).toBe(1);
    expect(check.video).toBe(1);
    expect(check.duplicateIds).toEqual([]);
    expect(check.danglingTargets).toEqual([]);
    expect(check.unknownPresets).toEqual([]);
  });

  test('a manual medium takes an interactive sequence; loop, mute, hide icon and stop on slide change ride the media node', () => {
    const renumbered = renumberShapeIds(part(pic(2, 'ts:s#v')));
    const schedule: MotionSchedule = {
      slideId: 's',
      steps: [],
      hiddenAtStart: [],
      transition: null,
      skipped: [],
    };
    const node: MediaNode = {
      blockId: 'v',
      kind: 'video',
      shapeName: 'ts:s#v',
      relationshipId: 'rId3',
      shapeId: 2,
      playback: {
        start: 'manual',
        loop: true,
        mute: true,
        hideIcon: true,
        stopOnSlideChange: false,
        volume: 80,
      },
      online: false,
    };
    const out = writeTiming(
      renumbered.xml,
      schedule,
      targetResolver('s', renumbered.ids, textShapeNames(renumbered.xml)),
      [node],
    );
    expect(out.written).toBe(true);
    expect(out.xml).toContain('nodeType="interactiveSeq"');
    expect(out.xml).toContain('cmd="togglePause"');
    expect(out.xml).toContain(
      '<p:cMediaNode vol="80000" mute="1" showWhenStopped="0" numSld="999">',
    );
    expect(out.xml).toContain('repeatCount="indefinite"');
    expect(out.xml).not.toContain('nodeType="mainSeq"');
    // an online medium writes no node and the show has nothing else: no timing at all
    const online = writeTiming(renumbered.xml, schedule, () => [], [{ ...node, online: true }]);
    expect(online.written).toBe(false);
  });

  test('the resolver: a user group by its own id, a ruled row group per paragraph, the item shapes of a list', () => {
    const ids = new Map<string, number>([
      ['g:pair', 3],
      ['ts:s#a@g:pair', 4],
      ['ts:s#b@g:pair', 5],
      ['ts:s#rows/row/0', 6],
      ['ts:s#rows/items/0/key@rows/row/0', 7],
      ['ts:s#rows/items/0/value@rows/row/0', 8],
      ['rows/row/0', 9],
      ['rows/row/1', 10],
      ['ts:s#list/items/0/text', 11],
      ['ts:s#list/items/1/text', 12],
      ['ts:s#lone', 13],
      ['ts:s#icon:1', 14],
      ['ts:s#rule/0', 15],
    ]);
    const texts = new Set(['ts:s#list/items/0/text', 'ts:s#list/items/1/text', 'ts:s#lone']);
    const resolve = targetResolver('s', ids, texts, new Map([['hr', ['ts:s#rule/0']]]));
    // a raster block by its `<block>:<n>` picture, a rule block by the builder's alias
    expect(resolve('icon', undefined)).toEqual([{ spid: 14, text: false }]);
    expect(resolve('hr', undefined)).toEqual([{ spid: 15, text: false }]);
    expect(resolve('a', undefined)).toEqual([{ spid: 3, text: false }]);
    expect(resolve('rows', undefined)).toEqual([
      { spid: 9, text: false },
      { spid: 10, text: false },
    ]);
    expect(resolve('rows', 0)).toEqual([{ spid: 9, text: false }]);
    expect(resolve('list', undefined)).toEqual([
      { spid: 11, text: true },
      { spid: 12, text: true },
    ]);
    expect(resolve('list', 1)).toEqual([{ spid: 12, text: true }]);
    expect(resolve('lone', 0)).toEqual([{ spid: 13, text: true, range: true }]);
    expect(resolve('missing', undefined)).toEqual([]);
  });
});
