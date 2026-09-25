// The geometry interpreter (docs/VECTOR.md 2.1; gslides-parity SPEC-2 0.57): the ECMA-376 preset
// definitions the tree carries (definitions.ts, generated from presetShapeDefinitions.xml)
// evaluated at a box's size with a block's adjust values, so every preset draws its own outline
// on the sheet, in the picker's glyph grids, in the PowerPoint and in the PDF. Pure over the
// definitions module and the four numbers of a box: it imports the table and its types and
// nothing else, so shapes.ts keeps importing only the definitions module and the chrome and the
// render import shapes.ts without a cycle. The guide evaluator starts from the built in guides of
// ECMA-376 20.1.10.56 (plus `cd3`, which the file uses once), takes an `avLst` entry from the
// block's adjust values when it carries one and from the entry's `val` otherwise, then evaluates
// the `gdLst` in order with the seventeen formula operations of 20.1.9.11. Each path of the
// `pathLst` becomes one SVG path string on the half pixel grid: a path with its own `w` and `h` is
// scaled into the box, an `arcTo` is converted from its geometric start angle to the parametric
// angle of the ellipse (20.1.9.4) before its end point is computed, and an axis aligned `lnTo`
// writes `H` or `V`, so the paths of `rect`, `roundRect` and `ellipse` equal ship one's hand
// written strings byte for byte (shapes.test.ts pins them). The text rectangle, the connection
// sites and the adjust handles evaluate from the same table.
import { PRESET_DEFINITIONS } from './definitions.ts';
import type { AdjustHandle, PathCommand, PathDefinition, PresetDefinition } from './definitions.ts';

/** A rectangle in the box's space, in px. */
export type Box = { x: number; y: number; w: number; h: number };

/** A connection site on a shape: a point on the outline and the angle a connector leaves at, in degrees. */
export type ConnectionSite = { x: number; y: number; angle: number };

/** The fill mode of a geometry path (ECMA-376 20.1.10.37 ST_PathFillMode). */
export type GeometryFill = 'norm' | 'none' | 'lighten' | 'lightenLess' | 'darken' | 'darkenLess';

/** One path of a preset: its SVG path data, its fill mode and whether it draws an outline. */
export type GeometryPath = { d: string; fill: GeometryFill; stroke: boolean };

/**
 * An adjust handle evaluated at a size: its position in the box's space, the guides it moves and
 * the bounds of each, as numbers; answered and recorded, not drawn (docs/VECTOR.md section 7).
 */
export type AdjustHandlePoint = {
  kind: 'xy' | 'polar';
  x: number;
  y: number;
  gdRefX?: string;
  minX?: number;
  maxX?: number;
  gdRefY?: string;
  minY?: number;
  maxY?: number;
  gdRefR?: string;
  minR?: number;
  maxR?: number;
  gdRefAng?: string;
  minAng?: number;
  maxAng?: number;
};

/** A preset evaluated at a size: its paths, its text rectangle, its sites and its handles. */
export type Geometry = {
  paths: GeometryPath[];
  textRect: Box;
  sites: ConnectionSite[];
  handles: AdjustHandlePoint[];
};

/** One degree in the file's angle unit (ECMA-376 20.1.10.3 ST_Angle: 60000ths of a degree). */
export const DEGREE = 60000;
const HALF_TURN = 180 * DEGREE;
const FULL_TURN = 360 * DEGREE;

const GEOMETRY_FILLS: ReadonlyArray<GeometryFill> = [
  'norm',
  'none',
  'lighten',
  'lightenLess',
  'darken',
  'darkenLess',
];

/** An integer literal operand, negative allowed (`wedgeRectCallout`'s `adj1` is `val -20833`). */
const LITERAL = /^-?\d+$/;

/** A radius below this is a collapsed ellipse; the arc is still computed so its end point lands. */
const RADIUS_FLOOR = 1e-9;

type Point = { x: number; y: number };

function radians(angle: number): number {
  return ((angle / DEGREE) * Math.PI) / 180;
}

function fileAngle(rad: number): number {
  return ((rad * 180) / Math.PI) * DEGREE;
}

/** A number on the half pixel grid, the way shapes.ts writes every coordinate. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 2) / 2);
}

/**
 * The built in guides of ECMA-376 20.1.10.56 at a box `w` by `h`: the box, its centre, the
 * fractions of the sides, the shorter and the longer side with their fractions, and the angles
 * in 60000ths of a degree, `cd3` included (the standard's list omits it and `curvedLeftArrow`'s
 * connection site reads it).
 */
export function builtinGuides(w: number, h: number): Map<string, number> {
  const ss = Math.min(w, h);
  return new Map<string, number>([
    ['w', w],
    ['h', h],
    ['l', 0],
    ['t', 0],
    ['r', w],
    ['b', h],
    ['hc', w / 2],
    ['vc', h / 2],
    ['wd2', w / 2],
    ['wd3', w / 3],
    ['wd4', w / 4],
    ['wd5', w / 5],
    ['wd6', w / 6],
    ['wd8', w / 8],
    ['wd10', w / 10],
    ['wd12', w / 12],
    ['wd32', w / 32],
    ['hd2', h / 2],
    ['hd3', h / 3],
    ['hd4', h / 4],
    ['hd5', h / 5],
    ['hd6', h / 6],
    ['hd8', h / 8],
    ['hd10', h / 10],
    ['hd12', h / 12],
    ['ss', ss],
    ['ssd2', ss / 2],
    ['ssd4', ss / 4],
    ['ssd6', ss / 6],
    ['ssd8', ss / 8],
    ['ssd16', ss / 16],
    ['ssd32', ss / 32],
    ['ls', Math.max(w, h)],
    ['cd2', 10800000],
    ['cd4', 5400000],
    ['cd8', 2700000],
    ['3cd4', 16200000],
    ['3cd8', 8100000],
    ['5cd8', 13500000],
    ['7cd8', 18900000],
    ['cd3', 7200000],
  ]);
}

/** An operand: a guide of the table or an integer literal; a name not yet defined is the thrown error of 2.1. */
function operand(
  token: string,
  guides: Map<string, number>,
  preset: string,
  where: string,
): number {
  if (LITERAL.test(token)) return Number(token);
  const value = guides.get(token);
  if (value === undefined)
    throw new RangeError(`${preset}: ${where} reads the guide ${token} before it is defined`);
  return value;
}

/** A quotient with a zero divisor answers 0, so a box with a zero side still evaluates to numbers. */
function divide(x: number, y: number): number {
  return y === 0 ? 0 : x / y;
}

/**
 * One guide formula (ECMA-376 20.1.9.11) over the table so far: the operation, then two or three
 * operands, each a guide name or an integer literal. An unknown operation is a thrown `RangeError`
 * naming the preset and the guide.
 */
export function evaluateFormula(
  fmla: string,
  guides: Map<string, number>,
  preset = 'preset',
  guide = 'guide',
): number {
  const [op = '', ...args] = fmla.trim().split(/\s+/);
  const a = (index: number): number => {
    const token = args[index];
    if (token === undefined)
      throw new RangeError(`${preset}: the guide ${guide} is missing an operand in "${fmla}"`);
    return operand(token, guides, preset, `the guide ${guide}`);
  };
  switch (op) {
    case 'val':
      return a(0);
    case '*/':
      return divide(a(0) * a(1), a(2));
    case '+-':
      return a(0) + a(1) - a(2);
    case '+/':
      return divide(a(0) + a(1), a(2));
    case '?:':
      return a(0) > 0 ? a(1) : a(2);
    case 'abs':
      return Math.abs(a(0));
    case 'at2':
      return fileAngle(Math.atan2(a(1), a(0)));
    case 'cat2':
      return a(0) * Math.cos(Math.atan2(a(2), a(1)));
    case 'sat2':
      return a(0) * Math.sin(Math.atan2(a(2), a(1)));
    case 'cos':
      return a(0) * Math.cos(radians(a(1)));
    case 'sin':
      return a(0) * Math.sin(radians(a(1)));
    case 'tan':
      return a(0) * Math.tan(radians(a(1)));
    case 'max':
      return Math.max(a(0), a(1));
    case 'min':
      return Math.min(a(0), a(1));
    case 'mod':
      return Math.hypot(a(0), a(1), a(2));
    case 'pin': {
      const low = a(0);
      const value = a(1);
      const high = a(2);
      return value < low ? low : value > high ? high : value;
    }
    case 'sqrt':
      return Math.sqrt(Math.max(0, a(0)));
    default:
      throw new RangeError(`${preset}: the guide ${guide} uses an unknown operation "${op}"`);
  }
}

/**
 * The guide table of a preset at a box `w` by `h`: the built in guides, then the `avLst` (the
 * block's adjust value at the entry's index when it is a finite number, the entry's `val` default
 * otherwise), then the `gdLst` in the file's order. `name` labels a thrown error.
 */
export function evaluateGuides(
  def: PresetDefinition,
  w: number,
  h: number,
  adjust: ReadonlyArray<number>,
  name = 'preset',
): Map<string, number> {
  const guides = builtinGuides(w, h);
  def.avLst.forEach((guide, index) => {
    const given = adjust[index];
    guides.set(
      guide.name,
      typeof given === 'number' && Number.isFinite(given)
        ? given
        : evaluateFormula(guide.fmla, guides, name, guide.name),
    );
  });
  for (const guide of def.gdLst)
    guides.set(guide.name, evaluateFormula(guide.fmla, guides, name, guide.name));
  return guides;
}

/** An axis aligned line writes `H` or `V` (compared on the half pixel grid); any other writes `L`. */
function lineTo(from: Point, x: number, y: number): string {
  const X = fmt(x);
  const Y = fmt(y);
  if (Y === fmt(from.y)) return `H${X}`;
  if (X === fmt(from.x)) return `V${Y}`;
  return `L${X},${Y}`;
}

/** The parametric angle of the point on the ellipse `rx` by `ry` at the geometric angle `theta` (radians). */
function parametric(theta: number, rx: number, ry: number): number {
  return Math.atan2(rx * Math.sin(theta), ry * Math.cos(theta));
}

/**
 * An `arcTo` (ECMA-376 20.1.9.4): from the current point along the ellipse of radii `wR` by `hR`
 * whose outline passes through the current point at the geometric angle `stAng`, sweeping
 * `swAng`, both in 60000ths of a degree, clockwise positive in the sheet's y down space. A
 * geometric angle θ is converted to the parametric angle t = atan2(wR sin θ, hR cos θ) before the
 * point on the ellipse is computed (the two agree on a circle and at multiples of 90 degrees,
 * which is why ship one's hand written `roundRect` and `ellipse` needed no such step): the centre
 * is the current point less (wR cos t₀, hR sin t₀) and the end point is the centre plus the same
 * at the parametric angle of the geometric end angle `stAng + swAng`, converted on its own rather
 * than as t₀ plus the sweep, so a pie's arc ends where its own guides put the end angle's point
 * (`x2`, `y2`, the second adjust handle) on a wide ellipse too. `large` is 1 when the sweep exceeds
 * 180 degrees (the conversion keeps a half turn a half turn, so the flag reads the same in both
 * angles) and `sweep` 1 when it is positive; a sweep of 360 degrees or more is written as two
 * arcs, since one SVG arc whose ends coincide draws nothing. Two collapsed radii move nowhere and
 * write nothing; one collapsed radius still lands its end point and writes a flat arc, which SVG
 * draws as a line.
 */
function arcTo(
  from: Point,
  wR: number,
  hR: number,
  stAng: number,
  swAng: number,
): { commands: string[]; end: Point } {
  if (wR <= 0 && hR <= 0) return { commands: [], end: from };
  const rx = Math.max(wR, RADIUS_FLOOR);
  const ry = Math.max(hR, RADIUS_FLOOR);
  const theta = radians(stAng);
  const t0 = parametric(theta, rx, ry);
  const cx = from.x - rx * Math.cos(t0);
  const cy = from.y - ry * Math.sin(t0);
  const pieces = Math.abs(swAng) >= FULL_TURN ? 2 : 1;
  const step = radians(swAng) / pieces;
  const large = Math.abs(swAng) / pieces > HALF_TURN ? 1 : 0;
  const direction = swAng > 0 ? 1 : 0;
  const commands: string[] = [];
  let end = from;
  for (let piece = 1; piece <= pieces; piece += 1) {
    const t = parametric(theta + step * piece, rx, ry);
    end = { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
    commands.push(`A${fmt(rx)},${fmt(ry)} 0 ${large} ${direction} ${fmt(end.x)},${fmt(end.y)}`);
  }
  return { commands, end };
}

/** The points of a Bezier command in groups of `size`, each written `x,y`. */
function bezier(
  letter: 'Q' | 'C',
  size: 2 | 3,
  points: [string, string][],
  at: (x: string, y: string) => Point,
): { commands: string[]; end: Point | undefined } {
  const commands: string[] = [];
  let end: Point | undefined;
  for (let index = 0; index + size <= points.length; index += size) {
    const group = points.slice(index, index + size).map(([x, y]) => at(x, y));
    commands.push(`${letter}${group.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ')}`);
    end = group[group.length - 1];
  }
  return { commands, end };
}

/**
 * One path of the `pathLst` as SVG path data in the box's space: a path with its own `w` and `h`
 * (28 presets, every flowchart preset among them) has every x, y, `wR` and `hR`, literal or guide,
 * multiplied by w/path.w and h/path.h; a path without them is in the box's space. `moveTo` writes
 * `M`, `lnTo` `H`, `V` or `L`, `quadBezTo` `Q`, `cubicBezTo` `C`, `close` `Z` (the current point
 * returns to the subpath's start) and `arcTo` the arcs of `arcTo` above.
 */
export function pathData(
  path: PathDefinition,
  guides: Map<string, number>,
  w: number,
  h: number,
  preset = 'preset',
): string {
  const sx = path.w !== undefined && path.w > 0 ? w / path.w : 1;
  const sy = path.h !== undefined && path.h > 0 ? h / path.h : 1;
  const read = (token: string) => operand(token, guides, preset, 'the path');
  const at = (x: string, y: string): Point => ({ x: read(x) * sx, y: read(y) * sy });
  const out: string[] = [];
  let current: Point = { x: 0, y: 0 };
  let start: Point = current;
  const apply = (command: PathCommand) => {
    switch (command.op) {
      case 'moveTo': {
        const point = at(command.x, command.y);
        out.push(`M${fmt(point.x)},${fmt(point.y)}`);
        current = point;
        start = point;
        return;
      }
      case 'lnTo': {
        const point = at(command.x, command.y);
        out.push(lineTo(current, point.x, point.y));
        current = point;
        return;
      }
      case 'quadBezTo': {
        const drawn = bezier('Q', 2, command.points, at);
        out.push(...drawn.commands);
        if (drawn.end !== undefined) current = drawn.end;
        return;
      }
      case 'cubicBezTo': {
        const drawn = bezier('C', 3, command.points, at);
        out.push(...drawn.commands);
        if (drawn.end !== undefined) current = drawn.end;
        return;
      }
      case 'arcTo': {
        const drawn = arcTo(
          current,
          read(command.wR) * sx,
          read(command.hR) * sy,
          read(command.stAng),
          read(command.swAng),
        );
        out.push(...drawn.commands);
        current = drawn.end;
        return;
      }
      case 'close':
        out.push('Z');
        current = start;
        return;
    }
  };
  for (const command of path.commands) apply(command);
  return out.join(' ');
}

function fillOf(fill: string | undefined): GeometryFill {
  return fill !== undefined && (GEOMETRY_FILLS as ReadonlyArray<string>).includes(fill)
    ? (fill as GeometryFill)
    : 'norm';
}

/**
 * The text rectangle `rect { l, t, r, b }` in the box's space. The file's `pie` entry names its
 * guides in the wrong order (`l="il" t="ir" r="it" b="ib"`), which inverts the rectangle; an
 * inverted or empty rectangle answers the whole box so the label stays visible.
 */
function textRectOf(
  def: PresetDefinition,
  guides: Map<string, number>,
  w: number,
  h: number,
  preset: string,
): Box {
  if (def.rect === undefined) return { x: 0, y: 0, w, h };
  const read = (token: string) => operand(token, guides, preset, 'the text rectangle');
  const l = read(def.rect.l);
  const t = read(def.rect.t);
  const r = read(def.rect.r);
  const b = read(def.rect.b);
  if (!(r > l) || !(b > t)) return { x: 0, y: 0, w, h };
  return { x: l, y: t, w: r - l, h: b - t };
}

function handleOf(
  handle: AdjustHandle,
  guides: Map<string, number>,
  preset: string,
): AdjustHandlePoint {
  const read = (token: string | undefined): number | undefined =>
    token === undefined ? undefined : operand(token, guides, preset, 'an adjust handle');
  const bound = (key: string, token: string | undefined): Record<string, number> => {
    const value = read(token);
    return value === undefined ? {} : { [key]: value };
  };
  const point = { x: read(handle.pos[0]) ?? 0, y: read(handle.pos[1]) ?? 0 };
  if (handle.kind === 'xy')
    return {
      kind: 'xy',
      ...point,
      ...(handle.gdRefX !== undefined ? { gdRefX: handle.gdRefX } : {}),
      ...bound('minX', handle.minX),
      ...bound('maxX', handle.maxX),
      ...(handle.gdRefY !== undefined ? { gdRefY: handle.gdRefY } : {}),
      ...bound('minY', handle.minY),
      ...bound('maxY', handle.maxY),
    };
  return {
    kind: 'polar',
    ...point,
    ...(handle.gdRefR !== undefined ? { gdRefR: handle.gdRefR } : {}),
    ...bound('minR', handle.minR),
    ...bound('maxR', handle.maxR),
    ...(handle.gdRefAng !== undefined ? { gdRefAng: handle.gdRefAng } : {}),
    ...bound('minAng', handle.minAng),
    ...bound('maxAng', handle.maxAng),
  };
}

/**
 * A preset of the definitions file evaluated at a box `w` by `h` with a block's adjust values
 * (fractions of 100000 in `avLst` order; a missing or non finite entry takes the default): one
 * SVG path string per `pathLst` entry with its fill mode and stroke flag, the text rectangle, the
 * connection sites in the file's order with the angle in degrees, and the adjust handles. A name
 * the file does not hold is a thrown `RangeError`; shapes.ts guards with `presetOf` first.
 */
export function presetGeometry(
  prstGeom: string,
  w: number,
  h: number,
  adjust: ReadonlyArray<number>,
): Geometry {
  const def = PRESET_DEFINITIONS[prstGeom];
  if (def === undefined)
    throw new RangeError(`${prstGeom} is not a preset of the definitions file`);
  const guides = evaluateGuides(def, w, h, adjust, prstGeom);
  const read = (token: string, where: string) => operand(token, guides, prstGeom, where);
  return {
    paths: def.pathLst.map((path) => ({
      d: pathData(path, guides, w, h, prstGeom),
      fill: fillOf(path.fill),
      stroke: path.stroke !== false,
    })),
    textRect: textRectOf(def, guides, w, h, prstGeom),
    sites: def.cxnLst.map((site) => ({
      x: read(site.pos[0], 'a connection site'),
      y: read(site.pos[1], 'a connection site'),
      angle: read(site.ang, 'a connection site') / DEGREE,
    })),
    handles: def.ahLst.map((handle) => handleOf(handle, guides, prstGeom)),
  };
}
