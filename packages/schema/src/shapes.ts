// The shape presets (gslides-parity SPEC-2 2.3, decision 0.10): one table covering Google's
// Shapes, Arrows, Callouts and Equation categories, 135 presets, each with its label, its category,
// its ECMA-376 `prstGeom` name and the names of its adjust guides, read from the committed
// definitions file (shapes/definitions.ts, generated from presetShapeDefinitions.xml). The
// geometry (`shapePath`, `textInset`, `sites`) is evaluated by the interpreter in
// shapes/geometry.ts from the same file, so the sheet, the Perfect export and PowerPoint draw one
// shape (SPEC-2 0.57). Until the interpreter lands (merge 1b) the three functions return the
// rectangle: the box as the path, the whole box as the text inset, the eight sites of a rectangle.
// The line kinds (SPEC-2 2.4), the ten line decorations and the six dashes live here too, and the
// picker draws every glyph from `shapePath(48, 36)`; nothing is copied from Google. Imports only
// the definitions module, so blocks.ts and the chrome can import it without a cycle.
import { PRESET_DEFINITIONS } from './shapes/definitions.ts';

export const SHAPE_CATEGORIES = ['shapes', 'arrows', 'callouts', 'equation'] as const;
export type ShapeCategory = (typeof SHAPE_CATEGORIES)[number];

/** Google's category labels (SPEC-2 4.1, insert.shape.*). */
export const SHAPE_CATEGORY_LABELS: Readonly<Record<ShapeCategory, string>> = {
  shapes: 'Shapes',
  arrows: 'Arrows',
  callouts: 'Callouts',
  equation: 'Equation',
};

export type ShapePresetRow = {
  /** The id a block writes in `shape`, which is the ECMA name. */
  id: string;
  label: string;
  category: ShapeCategory;
  /** The `prstGeom` name written to the PPTX; the id itself (0.47: the ECMA spelling, never the pptxgenjs enum). */
  prstGeom: string;
};

type Row = [id: string, label: string];

const SHAPES: Row[] = [
  ['rect', 'Rectangle'],
  ['roundRect', 'Rounded rectangle'],
  ['snip1Rect', 'Snip single corner rectangle'],
  ['snip2SameRect', 'Snip same side corner rectangle'],
  ['snip2DiagRect', 'Snip diagonal corner rectangle'],
  ['snipRoundRect', 'Snip and round single corner rectangle'],
  ['round1Rect', 'Round single corner rectangle'],
  ['round2SameRect', 'Round same side corner rectangle'],
  ['round2DiagRect', 'Round diagonal corner rectangle'],
  ['ellipse', 'Ellipse'],
  ['triangle', 'Triangle'],
  ['rtTriangle', 'Right triangle'],
  ['parallelogram', 'Parallelogram'],
  ['trapezoid', 'Trapezoid'],
  ['diamond', 'Diamond'],
  ['pentagon', 'Pentagon'],
  ['hexagon', 'Hexagon'],
  ['heptagon', 'Heptagon'],
  ['octagon', 'Octagon'],
  ['decagon', 'Decagon'],
  ['dodecagon', 'Dodecagon'],
  ['pie', 'Pie'],
  ['chord', 'Chord'],
  ['teardrop', 'Teardrop'],
  ['frame', 'Frame'],
  ['halfFrame', 'Half frame'],
  ['corner', 'Corner'],
  ['diagStripe', 'Diagonal stripe'],
  ['plus', 'Plus'],
  ['plaque', 'Plaque'],
  ['can', 'Can'],
  ['cube', 'Cube'],
  ['bevel', 'Bevel'],
  ['donut', 'Donut'],
  ['noSmoking', '"No" symbol'],
  ['blockArc', 'Block arc'],
  ['foldedCorner', 'Folded corner'],
  ['smileyFace', 'Smiley face'],
  ['heart', 'Heart'],
  ['lightningBolt', 'Lightning bolt'],
  ['sun', 'Sun'],
  ['moon', 'Moon'],
  ['cloud', 'Cloud'],
  ['arc', 'Arc'],
  ['bracketPair', 'Bracket pair'],
  ['bracePair', 'Brace pair'],
  ['leftBracket', 'Left bracket'],
  ['rightBracket', 'Right bracket'],
  ['leftBrace', 'Left brace'],
  ['rightBrace', 'Right brace'],
  ['flowChartProcess', 'Flowchart: process'],
  ['flowChartAlternateProcess', 'Flowchart: alternate process'],
  ['flowChartDecision', 'Flowchart: decision'],
  ['flowChartInputOutput', 'Flowchart: data'],
  ['flowChartPredefinedProcess', 'Flowchart: predefined process'],
  ['flowChartInternalStorage', 'Flowchart: internal storage'],
  ['flowChartDocument', 'Flowchart: document'],
  ['flowChartMultidocument', 'Flowchart: multidocument'],
  ['flowChartTerminator', 'Flowchart: terminator'],
  ['flowChartPreparation', 'Flowchart: preparation'],
  ['flowChartManualInput', 'Flowchart: manual input'],
  ['flowChartManualOperation', 'Flowchart: manual operation'],
  ['flowChartConnector', 'Flowchart: connector'],
  ['flowChartOffpageConnector', 'Flowchart: off-page connector'],
  ['flowChartPunchedCard', 'Flowchart: card'],
  ['flowChartPunchedTape', 'Flowchart: punched tape'],
  ['flowChartSummingJunction', 'Flowchart: summing junction'],
  ['flowChartOr', 'Flowchart: or'],
  ['flowChartCollate', 'Flowchart: collate'],
  ['flowChartSort', 'Flowchart: sort'],
  ['flowChartExtract', 'Flowchart: extract'],
  ['flowChartMerge', 'Flowchart: merge'],
  ['flowChartOfflineStorage', 'Flowchart: offline storage'],
  ['flowChartOnlineStorage', 'Flowchart: stored data'],
  ['flowChartMagneticTape', 'Flowchart: sequential access storage'],
  ['flowChartMagneticDisk', 'Flowchart: magnetic disk'],
  ['flowChartMagneticDrum', 'Flowchart: direct access storage'],
  ['flowChartDelay', 'Flowchart: delay'],
  ['flowChartDisplay', 'Flowchart: display'],
  ['star4', '4 point star'],
  ['star5', '5 point star'],
  ['star6', '6 point star'],
  ['star7', '7 point star'],
  ['star8', '8 point star'],
  ['star10', '10 point star'],
  ['star12', '12 point star'],
  ['star16', '16 point star'],
  ['star24', '24 point star'],
  ['star32', '32 point star'],
  ['irregularSeal1', 'Explosion 1'],
  ['irregularSeal2', 'Explosion 2'],
  ['ribbon', 'Down ribbon'],
  ['ribbon2', 'Up ribbon'],
  ['ellipseRibbon', 'Curved down ribbon'],
  ['ellipseRibbon2', 'Curved up ribbon'],
  ['verticalScroll', 'Vertical scroll'],
  ['horizontalScroll', 'Horizontal scroll'],
  ['wave', 'Wave'],
  ['doubleWave', 'Double wave'],
];

const ARROWS: Row[] = [
  ['rightArrow', 'Right arrow'],
  ['leftArrow', 'Left arrow'],
  ['upArrow', 'Up arrow'],
  ['downArrow', 'Down arrow'],
  ['leftRightArrow', 'Left right arrow'],
  ['upDownArrow', 'Up down arrow'],
  ['quadArrow', 'Quad arrow'],
  ['leftRightUpArrow', 'Left right up arrow'],
  ['bentArrow', 'Bent arrow'],
  ['uturnArrow', 'U-turn arrow'],
  ['leftUpArrow', 'Left up arrow'],
  ['bentUpArrow', 'Bent up arrow'],
  ['curvedRightArrow', 'Curved right arrow'],
  ['curvedLeftArrow', 'Curved left arrow'],
  ['curvedUpArrow', 'Curved up arrow'],
  ['curvedDownArrow', 'Curved down arrow'],
  ['stripedRightArrow', 'Striped right arrow'],
  ['notchedRightArrow', 'Notched right arrow'],
  ['homePlate', 'Pentagon arrow'],
  ['chevron', 'Chevron'],
  ['rightArrowCallout', 'Right arrow callout'],
  ['downArrowCallout', 'Down arrow callout'],
  ['leftArrowCallout', 'Left arrow callout'],
  ['upArrowCallout', 'Up arrow callout'],
  ['leftRightArrowCallout', 'Left right arrow callout'],
  ['quadArrowCallout', 'Quad arrow callout'],
];

const CALLOUTS: Row[] = [
  ['wedgeRectCallout', 'Rectangular callout'],
  ['wedgeRoundRectCallout', 'Rounded rectangular callout'],
  ['wedgeEllipseCallout', 'Oval callout'],
  ['cloudCallout', 'Cloud callout'],
];

const EQUATION: Row[] = [
  ['mathPlus', 'Plus'],
  ['mathMinus', 'Minus'],
  ['mathMultiply', 'Multiply'],
  ['mathDivide', 'Divide'],
  ['mathEqual', 'Equal'],
  ['mathNotEqual', 'Not equal'],
];

function rows(category: ShapeCategory, list: Row[]): ShapePresetRow[] {
  return list.map(([id, label]) => ({ id, label, category, prstGeom: id }));
}

/** The 135 presets in picker order: Shapes, Arrows, Callouts, Equation (SPEC-2 2.3). */
export const SHAPE_PRESETS: ReadonlyArray<ShapePresetRow> = [
  ...rows('shapes', SHAPES),
  ...rows('arrows', ARROWS),
  ...rows('callouts', CALLOUTS),
  ...rows('equation', EQUATION),
];

export const SHAPE_PRESET_IDS = SHAPE_PRESETS.map((row) => row.id) as readonly string[];

/** A preset id as a type: the union of the 135 names. */
export type ShapePresetId =
  | (typeof SHAPES)[number][0]
  | (typeof ARROWS)[number][0]
  | (typeof CALLOUTS)[number][0]
  | (typeof EQUATION)[number][0];

/** The freeform round's ids, kept so a stored deck reads unchanged; each maps to a preset. */
export const LEGACY_SHAPE_IDS = ['rectangle', 'rounded', 'ellipse', 'line', 'arrow'] as const;
export type LegacyShapeId = (typeof LEGACY_SHAPE_IDS)[number];

/** The legacy closed ids and the preset each one draws. */
export const LEGACY_PRESETS: Readonly<Record<'rectangle' | 'rounded' | 'ellipse', string>> = {
  rectangle: 'rect',
  rounded: 'roundRect',
  ellipse: 'ellipse',
};

/** The line kinds of SPEC-2 2.4: the two legacy ones, the two connectors, the three path kinds. */
export const LINE_KINDS = [
  'line',
  'arrow',
  'elbow',
  'curved',
  'curve',
  'polyline',
  'scribble',
] as const;
export type LineKind = (typeof LINE_KINDS)[number];

/** Google's labels for the line tools (SPEC-2 4.1, insert.line.*). */
export const LINE_KIND_LABELS: Readonly<Record<LineKind, string>> = {
  line: 'Line',
  arrow: 'Arrow',
  elbow: 'Elbow connector',
  curved: 'Curved connector',
  curve: 'Curve',
  polyline: 'Polyline',
  scribble: 'Scribble',
};

/** The line kinds whose ends may attach to a shape's connection site (SPEC-2 2.4.7). */
export const CONNECTOR_KINDS = ['line', 'arrow', 'elbow', 'curved'] as const;
/** The line kinds drawn through `points` (SPEC-2 2.4.3, 2.4.4). */
export const PATH_KINDS = ['curve', 'polyline', 'scribble'] as const;

/** The ECMA connector geometries the two connector kinds export as (SPEC-2 2.4.1, 2.4.2). */
export const CONNECTOR_PRST: Readonly<Record<'elbow' | 'curved', string>> = {
  elbow: 'bentConnector3',
  curved: 'curvedConnector3',
};

export function isLineKind(kind: string): kind is LineKind {
  return (LINE_KINDS as ReadonlyArray<string>).includes(kind);
}

export function isConnectorKind(kind: string): boolean {
  return (CONNECTOR_KINDS as ReadonlyArray<string>).includes(kind);
}

export function isPathKind(kind: string): boolean {
  return (PATH_KINDS as ReadonlyArray<string>).includes(kind);
}

export function isShapePresetId(kind: string): boolean {
  return SHAPE_PRESET_IDS.includes(kind);
}

/** A closed shape: a preset or one of the three legacy closed ids; never a line kind. */
export function isClosedShapeKind(kind: string): boolean {
  return kind in LEGACY_PRESETS || isShapePresetId(kind);
}

/** The preset a shape id draws: itself, or the preset behind a legacy id; undefined for a line. */
export function presetOf(kind: string): ShapePresetRow | undefined {
  const id = kind in LEGACY_PRESETS ? LEGACY_PRESETS[kind as keyof typeof LEGACY_PRESETS] : kind;
  return SHAPE_PRESETS.find((row) => row.id === id);
}

/** The adjust guide names of a preset in ECMA order: what `adjust` indexes (SPEC-2 2.3.2). */
export function shapeGuides(kind: string): string[] {
  const preset = presetOf(kind);
  if (preset === undefined) return [];
  return (PRESET_DEFINITIONS[preset.prstGeom]?.avLst ?? []).map((guide) => guide.name);
}

/** The default adjust values of a preset as fractions of 100000, in guide order. */
export function shapeAdjustDefaults(kind: string): number[] {
  const preset = presetOf(kind);
  if (preset === undefined) return [];
  return (PRESET_DEFINITIONS[preset.prstGeom]?.avLst ?? []).map((guide) => {
    const match = /^val\s+(-?\d+)/.exec(guide.fmla);
    return match?.[1] !== undefined ? Number(match[1]) : 0;
  });
}

/** Google's ten line decorations (R05 E2 ArrowStyle; SPEC-2 2.4.5). */
export const LINE_ENDS = [
  'none',
  'fillArrow',
  'stealth',
  'fillCircle',
  'fillSquare',
  'fillDiamond',
  'openArrow',
  'openCircle',
  'openSquare',
  'openDiamond',
] as const;
export type LineEnd = (typeof LINE_ENDS)[number];

export const LINE_END_LABELS: Readonly<Record<LineEnd, string>> = {
  none: 'None',
  fillArrow: 'Filled arrow',
  stealth: 'Stealth arrow',
  fillCircle: 'Filled circle',
  fillSquare: 'Filled square',
  fillDiamond: 'Filled diamond',
  openArrow: 'Open arrow',
  openCircle: 'Open circle',
  openSquare: 'Open square',
  openDiamond: 'Open diamond',
};

/** Google's six dash styles (R05 E2 DashStyle; SPEC-2 0.13), one to one with pptxgenjs dashType. */
export const DASHES = ['solid', 'dot', 'dash', 'dashDot', 'longDash', 'longDashDot'] as const;
export type Dash = (typeof DASHES)[number];

export const DASH_LABELS: Readonly<Record<Dash, string>> = {
  solid: 'Solid',
  dot: 'Dot',
  dash: 'Dash',
  dashDot: 'Dash dot',
  longDash: 'Long dash',
  longDashDot: 'Long dash dot',
};

/** The SVG dash array of a dash at a stroke width (SPEC-2 2.3.3); '' for solid. */
export function dashArray(dash: Dash | undefined, width: number): string {
  const pattern: Readonly<Record<Dash, number[]>> = {
    solid: [],
    dot: [1, 2],
    dash: [4, 3],
    dashDot: [4, 3, 1, 3],
    longDash: [8, 3],
    longDashDot: [8, 3, 1, 3],
  };
  return (pattern[dash ?? 'solid'] ?? []).map((step) => step * width).join(' ');
}

/** The pptxgenjs `dashType` for a dash (SPEC-2 2.3.3). */
export const DASH_PPTX: Readonly<Record<Dash, string>> = {
  solid: 'solid',
  dot: 'sysDot',
  dash: 'dash',
  dashDot: 'dashDot',
  longDash: 'lgDash',
  longDashDot: 'lgDashDot',
};

/** The pptxgenjs arrow head for a decoration, and whether it is a substitution the report names (SPEC-2 2.4.5). */
export const LINE_END_PPTX: Readonly<Record<LineEnd, { head: string; exact: boolean }>> = {
  none: { head: 'none', exact: true },
  fillArrow: { head: 'triangle', exact: true },
  stealth: { head: 'stealth', exact: true },
  fillCircle: { head: 'oval', exact: true },
  fillSquare: { head: 'diamond', exact: false },
  fillDiamond: { head: 'diamond', exact: true },
  openArrow: { head: 'arrow', exact: true },
  openCircle: { head: 'oval', exact: false },
  openSquare: { head: 'diamond', exact: false },
  openDiamond: { head: 'diamond', exact: false },
};

export type Box = { x: number; y: number; w: number; h: number };

/** A connection site on a shape: a point on the outline and the angle a connector leaves at, in degrees. */
export type ConnectionSite = { x: number; y: number; angle: number };

function fmt(n: number): string {
  return String(Math.round(n * 2) / 2);
}

/**
 * The SVG path data of a shape at a size, on the half pixel grid, with the adjust values applied.
 * Until shapes/geometry.ts lands (merge 1b) every preset draws its box; the interpreter then
 * evaluates the preset's path list exactly (SPEC-2 0.57).
 */
export function shapePath(
  kind: string,
  w: number,
  h: number,
  _adjust: ReadonlyArray<number> = [],
): string {
  void presetOf(kind);
  return `M0,0 H${fmt(w)} V${fmt(h)} H0 Z`;
}

/** The text rectangle of a shape at a size (SPEC-2 2.2.17); the whole box until the interpreter lands. */
export function textInset(
  kind: string,
  w: number,
  h: number,
  _adjust: ReadonlyArray<number> = [],
): Box {
  void presetOf(kind);
  return { x: 0, y: 0, w, h };
}

/** The eight sites of a rectangle: the four side midpoints, then the four corners (SPEC-2 2.4.7). */
export function rectSites(w: number, h: number): ConnectionSite[] {
  return [
    { x: w / 2, y: 0, angle: 270 },
    { x: 0, y: h / 2, angle: 180 },
    { x: w / 2, y: h, angle: 90 },
    { x: w, y: h / 2, angle: 0 },
    { x: 0, y: 0, angle: 225 },
    { x: w, y: 0, angle: 315 },
    { x: w, y: h, angle: 45 },
    { x: 0, y: h, angle: 135 },
  ];
}

/**
 * The connection sites of a shape at a size, in the order the definitions file lists them, which
 * `connect.site` indexes (SPEC-2 2.4.7). A box, a picture, a chart, a table or a text box uses
 * the eight sites of a rectangle; until the interpreter lands every preset does too.
 */
export function sites(
  kind: string,
  w: number,
  h: number,
  _adjust: ReadonlyArray<number> = [],
): ConnectionSite[] {
  void presetOf(kind);
  return rectSites(w, h);
}

/**
 * The marker path of a line decoration, drawn with the line's end at the origin pointing along
 * +x, at `size` px (8 for the arrows, 6 for the others; SPEC-2 2.4.5); the fill variants are
 * filled, the open ones stroked. 'none' is the empty path.
 */
export function lineEndPath(
  kind: LineEnd,
  size = kind.includes('Arrow') || kind === 'stealth' ? 8 : 6,
): string {
  const s = size;
  const half = s / 2;
  switch (kind) {
    case 'none':
      return '';
    case 'fillArrow':
    case 'openArrow':
      return `M0,0 L${fmt(-s)},${fmt(-half)} L${fmt(-s)},${fmt(half)} Z`;
    case 'stealth':
      return `M0,0 L${fmt(-s)},${fmt(-half)} L${fmt(-s * 0.7)},0 L${fmt(-s)},${fmt(half)} Z`;
    case 'fillCircle':
    case 'openCircle':
      return `M${fmt(-half)},${fmt(-half)} a${fmt(half)},${fmt(half)} 0 1 0 0,${fmt(s)} a${fmt(half)},${fmt(half)} 0 1 0 0,${fmt(-s)} Z`;
    case 'fillSquare':
    case 'openSquare':
      return `M${fmt(-s)},${fmt(-half)} H0 V${fmt(half)} H${fmt(-s)} Z`;
    case 'fillDiamond':
    case 'openDiamond':
      return `M0,0 L${fmt(-half)},${fmt(-half)} L${fmt(-s)},0 L${fmt(-half)},${fmt(half)} Z`;
  }
}

/** True for the filled decorations; the open ones draw the outline in the line colour. */
export function lineEndFilled(kind: LineEnd): boolean {
  return kind.startsWith('fill') || kind === 'stealth';
}
