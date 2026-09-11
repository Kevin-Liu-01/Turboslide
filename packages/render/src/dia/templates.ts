// The declared diagram templates (MILESTONES M5 item 4; DECK-GRAMMAR.md:47 "good subjects": flows
// with three to six steps, a before and after pair, a scale or axis, a stacked layer model, a
// timeline; SPEC 4.2 `marks[].iso` for the isometric plate). Each template turns a small spec into
// Diagram data on the half-pixel grid (snap.ts), in the geometry of the four examples on slide 25
// (s25:35-63; 300 units wide, 210 tall with the title line at y 204): 1 px strokes on x.5, 11 px
// markers, 20 px labels in the body tone and 26 px labels in ink, 12 px of clearance, no
// arrowheads. `w` is the diagram width in units; with `fit: 'slot'` one unit is one sheet pixel.
// The palette's Insert group and an agent's `block.insert` read DIA_TEMPLATES; nothing here
// touches a DOM.
import type { Diagram } from '@turboslide/schema/blocks';

import { snapHalf, snapStroke } from './snap.ts';

/** The title line of every example on slide 25: 20 px at y 204 in a 210 unit tall diagram. */
const TITLE_Y = 204;
const TITLE_H = 210;
/** The main line of the flow, scale and timeline examples (s25:36, s25:48). */
const LINE_Y = 70.5;
/** Labels above the line (s25:40-41) and under it (s25:42-44). */
const ABOVE_Y = 52;
const BELOW_Y = 114;

function empty(w: number, h: number): Diagram {
  return { w, h, lines: [], rects: [], markers: [], texts: [], icons: [], marks: [] };
}

function withTitle(data: Diagram, title: string | undefined, bottom: number): Diagram {
  if (title === undefined) return { ...data, h: snapHalf(bottom) };
  const y = Math.max(TITLE_Y, snapHalf(bottom + 33.5));
  return {
    ...data,
    h: y === TITLE_Y ? TITLE_H : snapHalf(y + 6),
    texts: [...data.texts, { x: 0, y, text: title, size: 20 }],
  };
}

/** Evenly spaced marker centers across a line whose markers sit inside the edges (s25:37-39). */
function stations(w: number, count: number): number[] {
  if (count <= 1) return [snapHalf(w / 2)];
  return Array.from({ length: count }, (_, i) => snapHalf(5.5 + (i * (w - 11)) / (count - 1)));
}

function anchorFor(i: number, count: number): 'start' | 'middle' | 'end' | undefined {
  if (count === 1) return 'middle';
  if (i === 0) return undefined;
  return i === count - 1 ? 'end' : 'middle';
}

function anchorX(i: number, count: number, w: number, at: number): number {
  if (count === 1) return at;
  if (i === 0) return 0;
  return i === count - 1 ? w : at;
}

// ---------------------------------------------------------------------------------------------
// Specs

export type FlowSpec = {
  w: number;
  /** Three to six step labels, in reading order (DECK-GRAMMAR.md:47). */
  steps: string[];
  /** What passes between consecutive steps, one fewer than the steps; missing entries stay empty. */
  between?: string[];
  title?: string;
};

export type ScaleSpec = {
  w: number;
  left: string;
  right: string;
  /** Percent from the left end, 0 to 100 (the scales block's value). */
  value: number;
  centerTick?: boolean;
  title?: string;
};

export type LayersSpec = {
  w: number;
  /** Top layer first; `plate` fills the layer with the plate tone (s25:52). */
  layers: { label: string; plate?: boolean }[];
  title?: string;
};

export type TimelineSpec = {
  w: number;
  /** Left to right; a date sits under its marker at 18 px. */
  events: { label: string; date?: string }[];
  title?: string;
};

export type BeforeAfterSpec = {
  w: number;
  before: { label: string; lines: string[] };
  after: { label: string; lines: string[] };
  title?: string;
};

export type IsoPlateSpec = {
  w: number;
  /** Seat the GT mark in the top face (s25:61). */
  mark?: boolean;
  title?: string;
};

// ---------------------------------------------------------------------------------------------
// Templates

/** A three-step flow (s25:35-45): one ink line, a marker per step, the stages between them. */
export function flowTemplate(spec: FlowSpec): Diagram {
  const w = snapHalf(spec.w);
  const data = empty(w, TITLE_H);
  const count = spec.steps.length;
  const xs = stations(w, count);
  data.lines.push({ x1: 5.5, y1: LINE_Y, x2: snapStroke(w - 5.5), y2: LINE_Y, stroke: 'ink' });
  xs.forEach((x, i) => {
    data.markers.push({ x, y: LINE_Y });
    const anchor = anchorFor(i, count);
    data.texts.push({
      x: anchorX(i, count, w, x),
      y: BELOW_Y,
      text: spec.steps[i] ?? '',
      size: 20,
      ...(anchor ? { anchor } : {}),
    });
    const between = spec.between?.[i];
    const next = xs[i + 1];
    if (between && next !== undefined) {
      data.texts.push({
        x: snapHalf((x + next) / 2),
        y: ABOVE_Y,
        text: between,
        size: 20,
        anchor: 'middle',
      });
    }
  });
  return withTitle(data, spec.title, BELOW_Y + 6);
}

/** A scale with a marker (s25:47-53): a hairline, an optional center tick, the value as a square. */
export function scaleTemplate(spec: ScaleSpec): Diagram {
  const w = snapHalf(spec.w);
  const data = empty(w, TITLE_H);
  data.lines.push({ x1: 0, y1: LINE_Y, x2: w, y2: LINE_Y, stroke: 'hair' });
  if (spec.centerTick) {
    const cx = snapStroke(w / 2);
    data.lines.push({ x1: cx, y1: LINE_Y - 4, x2: cx, y2: LINE_Y + 5, stroke: 'mid' });
  }
  const value = Math.max(0, Math.min(100, spec.value));
  data.markers.push({ x: snapHalf((w * value) / 100), y: LINE_Y });
  data.texts.push({ x: 0, y: BELOW_Y, text: spec.left, size: 20 });
  data.texts.push({ x: w, y: BELOW_Y, text: spec.right, size: 20, anchor: 'end' });
  return withTitle(data, spec.title, BELOW_Y + 6);
}

/** The layer height of the stacked model (s25:54-58: 54 units per layer, the first at y 8.5). */
export const LAYER_H = 54;
const LAYER_TOP = 8.5;

/** A stacked layer model (s25:54-60): an outline, hair separators, plate fills, labels at x 16. */
export function layersTemplate(spec: LayersSpec): Diagram {
  const w = snapHalf(spec.w);
  const count = spec.layers.length;
  const bottom = LAYER_TOP + LAYER_H * count;
  const data = empty(w, TITLE_H);
  // plate fills first so the outline and separators draw over them
  spec.layers.forEach((layer, i) => {
    if (!layer.plate) return;
    data.rects.push({ x: 0.5, y: LAYER_TOP + LAYER_H * i, w: w - 1, h: LAYER_H, fill: 'plate' });
  });
  data.rects.push({
    x: 0.5,
    y: LAYER_TOP,
    w: w - 1,
    h: LAYER_H * count,
    fill: 'none',
    stroke: 'hair',
  });
  for (let i = 1; i < count; i += 1) {
    const y = LAYER_TOP + LAYER_H * i;
    data.lines.push({ x1: 0.5, y1: y, x2: snapStroke(w - 0.5), y2: y, stroke: 'hair' });
  }
  spec.layers.forEach((layer, i) => {
    data.texts.push({
      x: 16,
      y: snapHalf(LAYER_TOP + LAYER_H * i + 33.5),
      text: layer.label,
      size: 20,
    });
  });
  return withTitle(data, spec.title, bottom);
}

/** The timeline's labels sit over their markers, so they keep the clearance above and below the square. */
const TIMELINE_LABEL_Y = 44;
const TIMELINE_DATE_Y = 104;

/** A timeline: a hairline with a marker per event, labels above, dates under at 18 px. */
export function timelineTemplate(spec: TimelineSpec): Diagram {
  const w = snapHalf(spec.w);
  const data = empty(w, TITLE_H);
  const count = spec.events.length;
  const xs = stations(w, count);
  data.lines.push({ x1: 0, y1: LINE_Y, x2: w, y2: LINE_Y, stroke: 'hair' });
  xs.forEach((x, i) => {
    const event = spec.events[i];
    if (!event) return;
    data.markers.push({ x, y: LINE_Y });
    const anchor = anchorFor(i, count);
    const labelX = anchorX(i, count, w, x);
    data.texts.push({
      x: labelX,
      y: TIMELINE_LABEL_Y,
      text: event.label,
      size: 20,
      ...(anchor ? { anchor } : {}),
    });
    if (event.date) {
      data.texts.push({
        x: labelX,
        y: TIMELINE_DATE_Y,
        text: event.date,
        size: 18,
        ...(anchor ? { anchor } : {}),
      });
    }
  });
  return withTitle(data, spec.title, TIMELINE_DATE_Y + 6);
}

/** The gap between the two panels of a before and after pair. */
export const PAIR_GAP = 40;
const PANEL_TOP = 8.5;
const PANEL_LABEL_Y = 40;
const PANEL_LINE_H = 32;

/** A before and after pair: two hairline panels, a 26 px label in each, 20 px lines under it. */
export function beforeAfterTemplate(spec: BeforeAfterSpec): Diagram {
  const w = snapHalf(spec.w);
  const panelW = snapHalf((w - PAIR_GAP) / 2);
  const lines = Math.max(spec.before.lines.length, spec.after.lines.length);
  // the last line's box ends 12 units clear of the panel's bottom edge
  const panelH = snapHalf(PANEL_LABEL_Y + 16 + PANEL_LINE_H * lines + 24);
  const data = empty(w, TITLE_H);
  const panels = [
    { x: 0.5, side: spec.before },
    { x: snapStroke(panelW + PAIR_GAP + 0.5), side: spec.after },
  ];
  for (const panel of panels) {
    data.rects.push({
      x: panel.x,
      y: PANEL_TOP,
      w: panelW - 1,
      h: panelH,
      fill: 'none',
      stroke: 'hair',
    });
    data.texts.push({
      x: panel.x + 15.5,
      y: PANEL_TOP + PANEL_LABEL_Y,
      text: panel.side.label,
      size: 26,
    });
    panel.side.lines.forEach((line, i) => {
      data.texts.push({
        x: panel.x + 15.5,
        y: snapHalf(PANEL_TOP + PANEL_LABEL_Y + 16 + PANEL_LINE_H * (i + 1) - 8),
        text: line,
        size: 20,
      });
    });
  }
  return withTitle(data, spec.title, PANEL_TOP + panelH);
}

/** The three face tones of the isometric plate (DECK-GRAMMAR.md:44: 4, 9 and 15 percent). */
export const ISO_FACES = { top: 0.04, left: 0.09, right: 0.15 } as const;
/** tan 30 degrees: the rise of an isometric edge per unit of run. */
const ISO_RISE = Math.tan(Math.PI / 6);

/**
 * An isometric plate (s25:56-62): a 30 degree projection whose top face spans 0.8 of the width,
 * 24 units deep, the faces shaded 4, 9 and 15 percent, mid outlines, the mark seated in the top
 * face at 0.55 opacity. The numbers at w 300 are the slide's to the hundredth.
 */
export function isoPlateTemplate(spec: IsoPlateSpec): Diagram {
  const w = snapHalf(spec.w);
  const cx = w / 2;
  const half = w * 0.4;
  const top = 8;
  const rise = Math.round(half * ISO_RISE * 100) / 100;
  const depth = 24;
  const mid = top + rise;
  const bottom = top + 2 * rise;
  const left = cx - half;
  const right = cx + half;
  const round = (v: number): number => Math.round(v * 100) / 100;
  const data = empty(w, TITLE_H);
  data.polygons = [
    {
      points: [
        [cx, top],
        [right, round(mid)],
        [cx, round(bottom)],
        [left, round(mid)],
      ],
      fill: 'ink',
      opacity: ISO_FACES.top,
    },
    {
      points: [
        [right, round(mid)],
        [cx, round(bottom)],
        [cx, round(bottom + depth)],
        [right, round(mid + depth)],
      ],
      fill: 'ink',
      opacity: ISO_FACES.right,
    },
    {
      points: [
        [left, round(mid)],
        [cx, round(bottom)],
        [cx, round(bottom + depth)],
        [left, round(mid + depth)],
      ],
      fill: 'ink',
      opacity: ISO_FACES.left,
    },
    {
      points: [
        [cx, top],
        [right, round(mid)],
        [right, round(mid + depth)],
        [cx, round(bottom + depth)],
        [left, round(mid + depth)],
        [left, round(mid)],
      ],
      fill: 'none',
      stroke: 'mid',
    },
  ];
  data.lines.push(
    { x1: left, y1: round(mid), x2: cx, y2: round(bottom), stroke: 'mid' },
    { x1: cx, y1: round(bottom), x2: right, y2: round(mid), stroke: 'mid' },
    { x1: cx, y1: round(bottom), x2: cx, y2: round(bottom + depth), stroke: 'mid' },
  );
  if (spec.mark !== false) {
    // the mark seated in the top face (s25:61): 84 by 54 at w 300, centered a little above the face center
    const mw = round(w * 0.28);
    data.marks.push({
      x: cx,
      y: round(top + rise * 0.9525),
      w: mw,
      h: round(mw / 1.5556),
      iso: true,
    });
  }
  return withTitle(data, spec.title, bottom + depth);
}

// ---------------------------------------------------------------------------------------------
// The registry

export type DiaTemplateId =
  'flow' | 'scale' | 'layers' | 'timeline' | 'before-and-after' | 'iso-plate';

export type DiaTemplate<S> = {
  id: DiaTemplateId;
  label: string;
  doc: string;
  source: string;
  /** The slide 25 example at a width, for the palette's Insert group. */
  example: (w: number) => S;
  make: (spec: S) => Diagram;
};

export const DIA_TEMPLATES: {
  flow: DiaTemplate<FlowSpec>;
  scale: DiaTemplate<ScaleSpec>;
  layers: DiaTemplate<LayersSpec>;
  timeline: DiaTemplate<TimelineSpec>;
  'before-and-after': DiaTemplate<BeforeAfterSpec>;
  'iso-plate': DiaTemplate<IsoPlateSpec>;
} = {
  flow: {
    id: 'flow',
    label: 'Flow',
    doc: 'Three to six steps on one ink line with a marker per step and the stages between them.',
    source: 's25:35-45; DECK-GRAMMAR.md:47',
    example: (w) => ({
      w,
      steps: ['Source', 'Translate', 'Deploy'],
      between: ['Strings', 'Translations'],
      title: 'A three-step flow',
    }),
    make: flowTemplate,
  },
  scale: {
    id: 'scale',
    label: 'Scale',
    doc: 'A hairline between two labels with an 11 px marker at a percent and an optional center tick.',
    source: 's25:47-53',
    example: (w) => ({
      w,
      left: 'Reserved',
      right: 'Playful',
      value: 22,
      centerTick: true,
      title: 'A scale with a marker',
    }),
    make: scaleTemplate,
  },
  layers: {
    id: 'layers',
    label: 'Layers',
    doc: 'A stacked layer model: hair separators in one outline, plate fills on the highlighted layers.',
    source: 's25:54-60',
    example: (w) => ({
      w,
      layers: [
        { label: 'Customer apps' },
        { label: 'Open-source libraries', plate: true },
        { label: 'Platform', plate: true },
      ],
      title: 'A stacked layer model',
    }),
    make: layersTemplate,
  },
  timeline: {
    id: 'timeline',
    label: 'Timeline',
    doc: 'A hairline with a marker per event, labels above and 18 px dates under.',
    source: 'DECK-GRAMMAR.md:47',
    example: (w) => ({
      w,
      events: [
        { label: 'Redesign', date: 'June' },
        { label: 'Launch', date: 'August' },
        { label: 'Review', date: 'September' },
      ],
      title: 'A timeline',
    }),
    make: timelineTemplate,
  },
  'before-and-after': {
    id: 'before-and-after',
    label: 'Before and after',
    doc: 'Two hairline panels with a 26 px label each and 20 px lines under it.',
    source: 'DECK-GRAMMAR.md:47',
    example: (w) => ({
      w,
      before: { label: 'Before', lines: ['Nine surfaces', 'Four type families'] },
      after: { label: 'After', lines: ['One system', 'Inter'] },
      title: 'A before and after pair',
    }),
    make: beforeAfterTemplate,
  },
  'iso-plate': {
    id: 'iso-plate',
    label: 'Isometric plate',
    doc: 'A 30 degree plate with faces shaded 4, 9 and 15 percent and the mark seated in the top face.',
    source: 's25:56-62; DECK-GRAMMAR.md:44',
    example: (w) => ({ w, mark: true, title: 'An isometric plate' }),
    make: isoPlateTemplate,
  },
};

export const DIA_TEMPLATE_IDS = Object.keys(DIA_TEMPLATES) as DiaTemplateId[];

/** The Diagram of a template's slide 25 example at a width. */
export function diaTemplateExample(id: DiaTemplateId, w: number): Diagram {
  switch (id) {
    case 'flow':
      return flowTemplate(DIA_TEMPLATES.flow.example(w));
    case 'scale':
      return scaleTemplate(DIA_TEMPLATES.scale.example(w));
    case 'layers':
      return layersTemplate(DIA_TEMPLATES.layers.example(w));
    case 'timeline':
      return timelineTemplate(DIA_TEMPLATES.timeline.example(w));
    case 'before-and-after':
      return beforeAfterTemplate(DIA_TEMPLATES['before-and-after'].example(w));
    case 'iso-plate':
      return isoPlateTemplate(DIA_TEMPLATES['iso-plate'].example(w));
  }
}
