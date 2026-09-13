// The diagram templates (gslides-parity SPEC-2 2.8.3, decision 0.25; R05 A8): Google's Insert >
// Diagram panel offers Grid, Hierarchy, Timeline, Process, Relationship and Cycle, each with a
// count control named for the type and colour variants, and inserts ordinary shapes, text boxes
// and connectors as one group. This module is that data: one template per type with its count
// range, its noun, its three styles and `make`, which returns shape, text and line blocks in the
// dia stroke grammar (1.5 px ink strokes, plate fills, 8 px filled arrow heads) positioned inside
// a box and tagged with one group. `diagram.insert` (apps/cli/src/store-actions.ts) frees the ids,
// stacks the z values and commits the blocks; the Diagram panel (packages/chrome/src/DiagramPanel.tsx)
// draws its preview from the same blocks. Pure data and arithmetic: imports the block types, the
// position type, the sheet constants and the rectangle sites, nothing else, so blocks.ts stays free
// of it and the test runs in Node.
import type { DiagramKind, DiagramStyle } from './actions.ts';
import { DIAGRAM_KINDS, DIAGRAM_STYLES } from './actions.ts';
import type { Block, ShapeBlock, ShapeOrientation, TextBlock } from './blocks.ts';
import type { Color } from './color.ts';
import type { Position } from './position.ts';
import { SHEET_HEIGHT, SHEET_WIDTH } from './render.ts';
import { rectSites } from './shapes.ts';

export { DIAGRAM_KINDS, DIAGRAM_STYLES };
export type { DiagramKind, DiagramStyle };

/** Google's labels for the six types (R05 A8). */
export const DIAGRAM_KIND_LABELS: Readonly<Record<DiagramKind, string>> = {
  grid: 'Grid',
  hierarchy: 'Hierarchy',
  timeline: 'Timeline',
  process: 'Process',
  relationship: 'Relationship',
  cycle: 'Cycle',
};

/** The three styles as the panel names them; the theme has one palette, so the styles are its tones. */
export const DIAGRAM_STYLE_LABELS: Readonly<Record<DiagramStyle, string>> = {
  outline: 'Outline',
  plate: 'Plate',
  ink: 'Ink',
};

/** The box a diagram lands in when none is given: 960 by 540 centred on the sheet (SPEC-2 2.8.2). */
export const DIAGRAM_DEFAULT_BOX: Position = {
  x: (SHEET_WIDTH - 960) / 2,
  y: (SHEET_HEIGHT - 540) / 2,
  w: 960,
  h: 540,
};

export type DiagramCounts = {
  min: number;
  max: number;
  /** the count control's name in Google's panel: Items, Levels, Dates, Steps */
  noun: string;
};

export type DiagramTemplate = {
  kind: DiagramKind;
  label: string;
  counts: DiagramCounts;
  styles: ReadonlyArray<DiagramStyle>;
  /** how many labelled nodes (text blocks) a count gives; the count itself except for a hierarchy */
  nodes: (count: number) => number;
  /** the blocks, positioned inside `box`, every one tagged with `group` */
  make: (count: number, style: DiagramStyle, box: Position, group: string) => Block[];
};

// ---------------------------------------------------------------------------------------------
// The grammar: strokes, fills and text of the three styles

type Look = {
  fill?: Color;
  stroke: Color;
  width: 1.5;
  text: Color;
};

const LOOKS: Readonly<Record<DiagramStyle, Look>> = {
  outline: { stroke: 'ink', width: 1.5, text: 'ink' },
  plate: { fill: 'plate', stroke: 'plate', width: 1.5, text: 'ink' },
  ink: { fill: 'ink', stroke: 'ink', width: 1.5, text: 'paper' },
};

/** The thickness a horizontal or vertical line box carries (the fixture's 8 px). */
const LINE_THICKNESS = 8;
const GAP = 24;
const TEXT_PADDING = 16;

type Box = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function at(box: Box, z: number, group: string): Position {
  return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h), z, group };
}

function centre(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function shapeBlock(
  id: string,
  shape: ShapeBlock['shape'],
  box: Box,
  look: Look,
  z: number,
  group: string,
): ShapeBlock {
  return {
    id,
    type: 'shape',
    shape,
    ...(look.fill === undefined ? {} : { fill: look.fill }),
    stroke: look.stroke,
    width: look.width,
    pos: at(box, z, group),
  };
}

function textBlock(
  id: string,
  text: string,
  box: Box,
  look: Look,
  z: number,
  group: string,
): TextBlock {
  return {
    id,
    type: 'text',
    text,
    typography: { align: 'center', weight: 500 },
    ...(look.text === 'ink' ? {} : { color: look.text }),
    valign: 'middle',
    padding: TEXT_PADDING,
    pos: at(box, z, group),
  };
}

/**
 * A straight line from one point to another as a line shape: a horizontal or vertical box of the
 * line thickness when the points align, else the box the two points span with the diagonal that
 * joins them (the same rules connect.ts `connectorBetween` applies to a drawn connector).
 */
function segment(
  start: Point,
  end: Point,
): { box: Box; orientation: ShapeOrientation; swapped: boolean } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dy) < 1) {
    return {
      box: {
        x: Math.min(start.x, end.x),
        y: start.y - LINE_THICKNESS / 2,
        w: Math.max(1, Math.abs(dx)),
        h: LINE_THICKNESS,
      },
      orientation: 'horizontal',
      swapped: dx < 0,
    };
  }
  if (Math.abs(dx) < 1) {
    return {
      box: {
        x: start.x - LINE_THICKNESS / 2,
        y: Math.min(start.y, end.y),
        w: LINE_THICKNESS,
        h: Math.max(1, Math.abs(dy)),
      },
      orientation: 'vertical',
      swapped: dy < 0,
    };
  }
  return {
    box: {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(dx),
      h: Math.abs(dy),
    },
    orientation: dx * dy > 0 ? 'diagonal-down' : 'diagonal-up',
    swapped: dx < 0,
  };
}

/** The index of the rectangle site nearest a point (the eight of `rectSites`), for `connect`. */
function nearestSiteIndex(box: Box, point: Point): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, site] of rectSites(box.w, box.h).entries()) {
    const distance = Math.hypot(box.x + site.x - point.x, box.y + site.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function sitePoint(box: Box, site: number): Point {
  const found = rectSites(box.w, box.h)[site] ?? { x: box.w / 2, y: box.h / 2, angle: 0 };
  return { x: box.x + found.x, y: box.y + found.y };
}

/**
 * A connector line between two boxes, attached to the sites that face each other, with a filled
 * arrow head at the end (the process fixture's `link-n`: `lineEnd: 'fillArrow'`, `connect`).
 */
function link(
  id: string,
  from: { id: string; box: Box },
  to: { id: string; box: Box },
  z: number,
  group: string,
  arrow: boolean,
): ShapeBlock {
  const startSite = nearestSiteIndex(from.box, centre(to.box));
  const endSite = nearestSiteIndex(to.box, centre(from.box));
  const start = sitePoint(from.box, startSite);
  const end = sitePoint(to.box, endSite);
  const placed = segment(start, end);
  const connect = placed.swapped
    ? { start: { block: to.id, site: endSite }, end: { block: from.id, site: startSite } }
    : { start: { block: from.id, site: startSite }, end: { block: to.id, site: endSite } };
  const head = placed.swapped
    ? { lineStart: 'fillArrow' as const }
    : { lineEnd: 'fillArrow' as const };
  return {
    id,
    type: 'shape',
    shape: 'line',
    stroke: 'ink',
    width: 1.5,
    ...(arrow ? head : {}),
    orientation: placed.orientation,
    connect,
    pos: at(placed.box, z, group),
  };
}

/** A labelled node: the shape and the text box over the same box. */
function node(
  ids: { shape: string; text: string },
  shape: ShapeBlock['shape'],
  label: string,
  box: Box,
  look: Look,
  z: number,
  group: string,
): [ShapeBlock, TextBlock] {
  return [
    shapeBlock(ids.shape, shape, box, look, z, group),
    textBlock(ids.text, label, box, look, z + 1, group),
  ];
}

function clampCount(template: Pick<DiagramTemplate, 'counts'>, count: number): number {
  return Math.max(template.counts.min, Math.min(template.counts.max, Math.round(count)));
}

// ---------------------------------------------------------------------------------------------
// Grid: 2 to 6 items as cards in one or two rows

function makeGrid(count: number, style: DiagramStyle, box: Box, group: string): Block[] {
  const look = LOOKS[style];
  const columns = count <= 3 ? count : 3;
  const rows = Math.ceil(count / columns);
  const cardW = (box.w - GAP * (columns - 1)) / columns;
  const cardH = (box.h - GAP * (rows - 1)) / rows;
  const out: Block[] = [];
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    /* a last row with fewer cards is centred */
    const inRow = row === rows - 1 ? count - row * columns : columns;
    const rowLeft = box.x + (box.w - (inRow * cardW + GAP * (inRow - 1))) / 2;
    const card: Box = {
      x: rowLeft + column * (cardW + GAP),
      y: box.y + row * (cardH + GAP),
      w: cardW,
      h: cardH,
    };
    out.push(
      ...node(
        { shape: `item-${index + 1}`, text: `label-${index + 1}` },
        'roundRect',
        `Item ${index + 1}`,
        card,
        look,
        out.length,
        group,
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Hierarchy: 2 to 5 levels, one box at the top and two on every level below it, joined by lines

function hierarchyNodes(levels: number): number {
  return 1 + 2 * (levels - 1);
}

function makeHierarchy(levels: number, style: DiagramStyle, box: Box, group: string): Block[] {
  const look = LOOKS[style];
  const rowGap = Math.min(64, Math.max(GAP, box.h * 0.12));
  const rowH = (box.h - rowGap * (levels - 1)) / levels;
  const nodeW = Math.min(360, (box.w - GAP) / 2);
  const left = box.x + (box.w - (nodeW * 2 + GAP)) / 2;
  const columns = [left, left + nodeW + GAP];
  const top: Box = { x: box.x + (box.w - nodeW) / 2, y: box.y, w: nodeW, h: rowH };
  const out: Block[] = [];
  const placed: { id: string; box: Box }[][] = [];
  out.push(
    ...node({ shape: 'level-1', text: 'label-1' }, 'roundRect', 'Level 1', top, look, 0, group),
  );
  placed.push([{ id: 'level-1', box: top }]);
  let n = 1;
  for (let level = 2; level <= levels; level += 1) {
    const row: { id: string; box: Box }[] = [];
    for (const [column, x] of columns.entries()) {
      n += 1;
      const b: Box = { x, y: box.y + (level - 1) * (rowH + rowGap), w: nodeW, h: rowH };
      out.push(
        ...node(
          { shape: `level-${n}`, text: `label-${n}` },
          'roundRect',
          `Level ${level}`,
          b,
          look,
          out.length,
          group,
        ),
      );
      row.push({ id: `level-${n}`, box: b });
      /* the parent: the box above in the same column, or the top box on the second level */
      const parents = placed[placed.length - 1] ?? [];
      const parent = level === 2 ? parents[0] : (parents[column] ?? parents[0]);
      if (parent !== undefined) {
        const from = parent.box;
        const start: Point = { x: from.x + from.w / 2, y: from.y + from.h };
        const end: Point = { x: b.x + b.w / 2, y: b.y };
        const seg = segment(start, end);
        out.push({
          id: `link-${n - 1}`,
          type: 'shape',
          shape: 'line',
          stroke: 'ink',
          width: 1.5,
          orientation: seg.orientation,
          connect: {
            start: { block: parent.id, site: 2 },
            end: { block: `level-${n}`, site: 0 },
          },
          pos: at(seg.box, out.length, group),
        });
      }
    }
    placed.push(row);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Timeline: 3 to 6 dates as dots on a rule with a label under each

function makeTimeline(count: number, style: DiagramStyle, box: Box, group: string): Block[] {
  const look = LOOKS[style];
  const dot = 24;
  const lineY = box.y + box.h * 0.4;
  const out: Block[] = [];
  const rule = segment({ x: box.x, y: lineY }, { x: box.x + box.w, y: lineY });
  out.push({
    id: 'rule',
    type: 'shape',
    shape: 'line',
    stroke: 'ink',
    width: 1.5,
    orientation: rule.orientation,
    pos: at(rule.box, 0, group),
  });
  const labelW = Math.min(240, box.w / count);
  const step = (box.w - labelW) / (count - 1);
  for (let index = 0; index < count; index += 1) {
    const cx = box.x + labelW / 2 + index * step;
    const dotBox: Box = { x: cx - dot / 2, y: lineY - dot / 2, w: dot, h: dot };
    out.push(
      shapeBlock(
        `date-${index + 1}`,
        'ellipse',
        dotBox,
        look.fill === undefined ? { ...look, fill: 'paper' } : look,
        out.length,
        group,
      ),
    );
    const label: Box = {
      x: cx - labelW / 2,
      y: lineY + dot,
      w: labelW,
      h: box.y + box.h - (lineY + dot),
    };
    out.push(
      textBlock(
        `label-${index + 1}`,
        `Date ${index + 1}`,
        label,
        { ...look, text: 'ink' },
        out.length,
        group,
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Process: 3 to 6 steps in a row, joined by arrows (the fixture's shape)

function makeProcess(count: number, style: DiagramStyle, box: Box, group: string): Block[] {
  const look = LOOKS[style];
  const gap = Math.min(82, Math.max(GAP, box.w * 0.06));
  const stepW = (box.w - gap * (count - 1)) / count;
  const stepH = Math.min(160, box.h * 0.4);
  const y = box.y + (box.h - stepH) / 2;
  const out: Block[] = [];
  let previous: { id: string; box: Box } | undefined;
  for (let index = 0; index < count; index += 1) {
    const b: Box = { x: box.x + index * (stepW + gap), y, w: stepW, h: stepH };
    const id = `step-${index + 1}`;
    if (previous !== undefined)
      out.push(link(`link-${index}`, previous, { id, box: b }, out.length, group, true));
    out.push(
      ...node(
        { shape: id, text: `label-${index + 1}` },
        'roundRect',
        `Step ${index + 1}`,
        b,
        look,
        out.length,
        group,
      ),
    );
    previous = { id, box: b };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Relationship: 2 to 5 items as overlapping ellipses in a row

function makeRelationship(count: number, style: DiagramStyle, box: Box, group: string): Block[] {
  const look = LOOKS[style];
  const overlap = 0.2;
  const d = Math.min(box.h, box.w / (count - (count - 1) * overlap));
  const total = d * (count - (count - 1) * overlap);
  const left = box.x + (box.w - total) / 2;
  const y = box.y + (box.h - d) / 2;
  const out: Block[] = [];
  for (let index = 0; index < count; index += 1) {
    const b: Box = { x: left + index * d * (1 - overlap), y, w: d, h: d };
    out.push(
      ...node(
        { shape: `item-${index + 1}`, text: `label-${index + 1}` },
        'ellipse',
        `Item ${index + 1}`,
        b,
        look,
        out.length,
        group,
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Cycle: 3 to 6 steps around a ring, each joined to the next by an arrow

function makeCycle(count: number, style: DiagramStyle, box: Box, group: string): Block[] {
  const look = LOOKS[style];
  const stepW = Math.min(240, box.w / 3);
  const stepH = Math.min(96, box.h / 4);
  const rx = (box.w - stepW) / 2;
  const ry = (box.h - stepH) / 2;
  const c = centre(box);
  const boxes: { id: string; box: Box }[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const b: Box = {
      x: c.x + rx * Math.cos(angle) - stepW / 2,
      y: c.y + ry * Math.sin(angle) - stepH / 2,
      w: stepW,
      h: stepH,
    };
    boxes.push({ id: `step-${index + 1}`, box: b });
  }
  const out: Block[] = [];
  for (const [index, entry] of boxes.entries()) {
    out.push(
      ...node(
        { shape: entry.id, text: `label-${index + 1}` },
        'roundRect',
        `Step ${index + 1}`,
        entry.box,
        look,
        out.length,
        group,
      ),
    );
  }
  for (const [index, entry] of boxes.entries()) {
    const next = boxes[(index + 1) % count];
    if (next !== undefined)
      out.push(link(`link-${index + 1}`, entry, next, out.length, group, true));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The table

function template(
  kind: DiagramKind,
  counts: DiagramCounts,
  build: (count: number, style: DiagramStyle, box: Box, group: string) => Block[],
  nodes: (count: number) => number = (count) => count,
): DiagramTemplate {
  const entry: DiagramTemplate = {
    kind,
    label: DIAGRAM_KIND_LABELS[kind],
    counts,
    styles: DIAGRAM_STYLES,
    nodes: (count) => nodes(clampCount({ counts }, count)),
    make: (count, style, box, group) =>
      build(
        clampCount({ counts }, count),
        style,
        { x: box.x, y: box.y, w: box.w, h: box.h },
        group,
      ),
  };
  return entry;
}

/** The six templates by kind (SPEC-2 2.8.3): counts, styles and `make`. */
export const DIAGRAM_TEMPLATES: Readonly<Record<DiagramKind, DiagramTemplate>> = {
  grid: template('grid', { min: 2, max: 6, noun: 'Items' }, makeGrid),
  hierarchy: template(
    'hierarchy',
    { min: 2, max: 5, noun: 'Levels' },
    makeHierarchy,
    hierarchyNodes,
  ),
  timeline: template('timeline', { min: 3, max: 6, noun: 'Dates' }, makeTimeline),
  process: template('process', { min: 3, max: 6, noun: 'Steps' }, makeProcess),
  relationship: template('relationship', { min: 2, max: 5, noun: 'Items' }, makeRelationship),
  cycle: template('cycle', { min: 3, max: 6, noun: 'Steps' }, makeCycle),
};

export function isDiagramKind(kind: string): kind is DiagramKind {
  return (DIAGRAM_KINDS as ReadonlyArray<string>).includes(kind);
}

export function isDiagramStyle(style: string): style is DiagramStyle {
  return (DIAGRAM_STYLES as ReadonlyArray<string>).includes(style);
}

/** A count inside the template's range (the panel's stepper and the CLI clamp the same way). */
export function clampDiagramCount(kind: DiagramKind, count: number): number {
  return clampCount(DIAGRAM_TEMPLATES[kind], count);
}

/**
 * The blocks of a template at a count and style inside a box, tagged with a group: the shape
 * `diagram.insert` binds as its `deps.diagrams` (store-actions.ts `DiagramMaker`). An unknown kind
 * or style is a TypeError, so a transport that passed the schema never reaches it and a caller
 * that skipped the schema hears why.
 */
export function makeDiagram(
  kind: string,
  count: number,
  style: string,
  box: Position,
  group: string,
): Block[] {
  if (!isDiagramKind(kind))
    throw new TypeError(
      `Unknown diagram type ${JSON.stringify(kind)}; one of ${DIAGRAM_KINDS.join(', ')}`,
    );
  if (!isDiagramStyle(style))
    throw new TypeError(
      `Unknown diagram style ${JSON.stringify(style)}; one of ${DIAGRAM_STYLES.join(', ')}`,
    );
  return DIAGRAM_TEMPLATES[kind].make(count, style, box, group);
}
