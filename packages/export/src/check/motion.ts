// The motion section of `export check` (gslides-parity SPEC-5 2.6, 16.7 step 33; R05 10 leg 1):
// the round five read back of an Editable text file. Per slide part: the transition element and
// its `p14:dur` inside the `mc:AlternateContent` wrapper of 0.12 (a `p14` kind with its fade
// Fallback), the effect `p:cTn` nodes with their preset triples against the fifteen of 0.13 (plus
// the two media call forms), the `nodeType` histogram, the `p:bldP` count and how many carry
// `build="p"`, the `p:audio` and `p:video` nodes, the `mc:AlternateContent` wrappers by their
// `Requires`, the `p:cTn` ids unique within the part and every `p:spTgt spid` naming a shape the
// part holds. The section fails on a repeated id, a dangling target or an unknown preset; the
// counts are reported either way. B1 filled it on day 5 (MILESTONES-5 B1).
import type { ExportCheckSection } from '@turboslide/schema/export';

import { shapeIdsOf } from '../ooxml/ids.ts';
import { PRESET_TRIPLES, readPresets } from '../ooxml/timing.ts';
import { readTransition } from '../ooxml/transition.ts';
import type { Package } from '../ooxml/zip.ts';
import { readPart, slideParts } from '../ooxml/zip.ts';

export type MotionSlideCheck = {
  part: string;
  transition: string | null;
  durationMs: number | null;
  fallback: string | null;
  effects: number;
  nodeTypes: Record<string, number>;
  bldP: number;
  bldParagraph: number;
  audio: number;
  video: number;
  requires: Record<string, number>;
  duplicateIds: number[];
  danglingTargets: number[];
  unknownPresets: string[];
};

/** The facts of one slide part. */
export function checkMotionPart(part: string, xml: string): MotionSlideCheck {
  const transition = readTransition(xml);
  const timing = /<p:timing>[\s\S]*?<\/p:timing>/.exec(xml)?.[0] ?? '';
  const presets = readPresets(timing);
  const nodeTypes: Record<string, number> = {};
  for (const match of timing.matchAll(/\snodeType="([a-zA-Z]+)"/g))
    nodeTypes[match[1]!] = (nodeTypes[match[1]!] ?? 0) + 1;
  const requires: Record<string, number> = {};
  for (const match of xml.matchAll(/<mc:Choice\b[^>]*\sRequires="([^"]+)"/g))
    requires[match[1]!] = (requires[match[1]!] ?? 0) + 1;
  const ids = [...timing.matchAll(/<p:cTn\b[^>]*?\sid="(\d+)"/g)].map((m) => Number(m[1]));
  const seen = new Set<number>();
  const duplicateIds: number[] = [];
  for (const id of ids) {
    if (seen.has(id) && !duplicateIds.includes(id)) duplicateIds.push(id);
    seen.add(id);
  }
  const shapeIds = new Set(shapeIdsOf(xml));
  const danglingTargets = [...timing.matchAll(/<p:spTgt spid="(\d+)"/g)]
    .map((m) => Number(m[1]))
    .filter((id, at, all) => !shapeIds.has(id) && all.indexOf(id) === at);
  return {
    part,
    transition: transition === null ? null : transition.element,
    durationMs: transition?.durationMs ?? null,
    fallback: transition?.fallback ?? null,
    effects: presets.length,
    nodeTypes,
    bldP: (timing.match(/<p:bldP\b/g) ?? []).length,
    bldParagraph: (timing.match(/<p:bldP\b[^>]*\sbuild="p"/g) ?? []).length,
    audio: (timing.match(/<p:audio>/g) ?? []).length,
    video: (timing.match(/<p:video\b/g) ?? []).length,
    requires,
    duplicateIds,
    danglingTargets,
    unknownPresets: presets.filter((triple) => !PRESET_TRIPLES.has(triple)),
  };
}

export async function checkMotion(zip: Package): Promise<ExportCheckSection> {
  const slides: MotionSlideCheck[] = [];
  for (const part of slideParts(zip)) slides.push(checkMotionPart(part, await readPart(zip, part)));
  const transitions = slides.filter((s) => s.transition !== null && s.transition !== '');
  const kinds = new Map<string, number>();
  for (const slide of transitions)
    kinds.set(slide.transition!, (kinds.get(slide.transition!) ?? 0) + 1);
  const effects = slides.reduce((n, s) => n + s.effects, 0);
  const bldP = slides.reduce((n, s) => n + s.bldP, 0);
  const bldParagraph = slides.reduce((n, s) => n + s.bldParagraph, 0);
  const audio = slides.reduce((n, s) => n + s.audio, 0);
  const video = slides.reduce((n, s) => n + s.video, 0);
  const nodeTypes: Record<string, number> = {};
  const requires: Record<string, number> = {};
  for (const slide of slides) {
    for (const [type, count] of Object.entries(slide.nodeTypes))
      nodeTypes[type] = (nodeTypes[type] ?? 0) + count;
    for (const [key, count] of Object.entries(slide.requires))
      requires[key] = (requires[key] ?? 0) + count;
  }
  const histogram = (record: Record<string, number>): string =>
    Object.entries(record)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => `${key} ${count}`)
      .join(', ') || 'none';
  const lines: string[] = [
    `round five: ${transitions.length} transition(s) on ${slides.length} slide(s)` +
      (transitions.length > 0
        ? ` (${[...kinds.entries()].map(([kind, n]) => `${kind} ${n}`).join(', ')}; durations ${transitions.map((s) => s.durationMs ?? '?').join(', ')} ms)`
        : '') +
      `; ${effects} effect node(s) (${histogram(nodeTypes)}); ${bldP} bldP with ${bldParagraph} build="p"; ${audio} p:audio and ${video} p:video node(s); mc:AlternateContent by Requires: ${histogram(requires)}`,
  ];
  const problems: string[] = [];
  for (const slide of slides) {
    if (slide.duplicateIds.length > 0)
      problems.push(`${slide.part}: repeated p:cTn id(s) ${slide.duplicateIds.join(', ')}`);
    if (slide.danglingTargets.length > 0)
      problems.push(`${slide.part}: p:spTgt names no shape: ${slide.danglingTargets.join(', ')}`);
    if (slide.unknownPresets.length > 0)
      problems.push(
        `${slide.part}: preset(s) outside the fifteen of SPEC-5 0.13: ${slide.unknownPresets.join(', ')}`,
      );
    if (
      slide.transition !== null &&
      slide.transition.startsWith('p14:') &&
      slide.fallback !== 'p:fade'
    )
      problems.push(`${slide.part}: a p14 transition without the p:fade Fallback`);
  }
  return {
    ok: problems.length === 0,
    lines: [...lines, ...problems],
    counts: {
      transitions: transitions.length,
      effects,
      bldP,
      bldParagraph,
      audio,
      video,
      p14: requires.p14 ?? 0,
    },
  };
}
