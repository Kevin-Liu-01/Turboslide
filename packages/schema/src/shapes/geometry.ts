// The shape interpreter (gslides-parity SPEC-5 6.5; SPEC-2 0.57; VERIFICATION-2 item 6):
// `shapePath(preset, box, adjusts)` answers the outline of a preset at a box as evaluated path
// commands, `textInset` the text rectangle and `sites` the connection sites, all read from round
// four's `shapes/definitions.ts`, the committed transcription of ECMA-376's
// presetShapeDefinitions.xml. The guide formulas (`val`, `*/`, `+-`, `+/`, `?:`, `abs`, `at2`,
// `cat2`, `sat2`, `cos`, `sin`, `tan`, `max`, `min`, `mod`, `pin`, `sqrt`) are evaluated over the
// standard's built in guides (`l`, `t`, `r`, `b`, `w`, `h`, `hc`, `vc`, the halves and thirds, `ss`,
// `ls`, the quarter turns), the adjust values in `avLst` order with the caller's overrides, and the
// path list's own coordinate space (`w` and `h` on a path scale its coordinates onto the box).
// Angles are in 60000ths of a degree, clockwise, as the standard writes them. `pathData` turns the
// commands into SVG path data on the half pixel grid, with the `H` and `V` shorthands for the axis
// aligned segments, so the rectangle string is byte identical to the one `shapes.ts` wrote before
// the interpreter ('M0,0 H1600 V900 H0 Z'). A preset the definitions file does not name answers
// its box, as the seam did. The module imports the definitions and the sites type alone, so
// `shapes.ts`, the renderer, the ODP and SVG writers read it without a cycle.
import type { ConnectionSite } from '../shapes.ts';
import { PRESET_DEFINITIONS } from './definitions.ts';
import type {
  PathCommand as DefinitionCommand,
  PathDefinition,
  PresetDefinition,
} from './definitions.ts';

/** A box in sheet pixels: the object's own frame, `x` and `y` usually 0. */
export type ShapeBox = { x: number; y: number; w: number; h: number };

/**
 * One evaluated path command in sheet pixels (the definitions file's formulas resolved): the six
 * operations of `a:custGeom` path lists. Angles are in degrees clockwise; `arcTo` runs from the
 * current point along an ellipse of the two radii.
 */
export type PathCommand =
  | { op: 'moveTo'; x: number; y: number }
  | { op: 'lnTo'; x: number; y: number }
  | { op: 'arcTo'; wR: number; hR: number; stAng: number; swAng: number }
  | { op: 'quadBezTo'; points: [number, number][] }
  | { op: 'cubicBezTo'; points: [number, number][] }
  | { op: 'close' };

/** The fill mode of one path of a preset (ECMA-376 ST_PathFillMode): the shape's fill, none, or a lightened or darkened shade. */
export type ShapeFillMode = 'norm' | 'none' | 'lighten' | 'lightenLess' | 'darken' | 'darkenLess';

/** One path of a preset at a box: its commands, how it is filled and whether it is stroked. */
export type ShapeSubpath = {
  commands: PathCommand[];
  fill: ShapeFillMode;
  stroke: boolean;
};

/** The legacy ids of docs/freeform.md the definitions know under their ECMA names. */
const LEGACY: Readonly<Record<string, string>> = {
  rectangle: 'rect',
  rounded: 'roundRect',
};

/** 60000ths of a degree per degree (ECMA-376 ST_Angle). */
export const ANGLE_UNIT = 60000;

/** The rectangle path of a box: the seam's answer for a preset the definitions do not name. */
export function boxPath(box: ShapeBox): PathCommand[] {
  const { x, y, w, h } = box;
  return [
    { op: 'moveTo', x, y },
    { op: 'lnTo', x: x + w, y },
    { op: 'lnTo', x: x + w, y: y + h },
    { op: 'lnTo', x, y: y + h },
    { op: 'close' },
  ];
}

/** The eight sites of a rectangle at a box: the four side midpoints, then the four corners (SPEC-2 2.4.7). */
export function boxSites(box: ShapeBox): ConnectionSite[] {
  const { x, y, w, h } = box;
  return [
    { x: x + w / 2, y, angle: 270 },
    { x, y: y + h / 2, angle: 180 },
    { x: x + w / 2, y: y + h, angle: 90 },
    { x: x + w, y: y + h / 2, angle: 0 },
    { x, y, angle: 225 },
    { x: x + w, y, angle: 315 },
    { x: x + w, y: y + h, angle: 45 },
    { x, y: y + h, angle: 135 },
  ];
}

/** The definition of a preset, by its ECMA name or a legacy id; undefined for a line kind or an unknown name. */
export function presetDefinition(preset: string): PresetDefinition | undefined {
  return PRESET_DEFINITIONS[LEGACY[preset] ?? preset];
}

// ---------------------------------------------------------------------------------------------
// The guide evaluator

/** The built in guides of ECMA-376 20.1.9.11 at a shape size. */
export function builtinGuides(w: number, h: number): Map<string, number> {
  const ss = Math.min(w, h);
  const ls = Math.max(w, h);
  const cd4 = 90 * ANGLE_UNIT;
  const env = new Map<string, number>([
    ['l', 0],
    ['t', 0],
    ['r', w],
    ['b', h],
    ['w', w],
    ['h', h],
    ['hc', w / 2],
    ['vc', h / 2],
    ['ss', ss],
    ['ls', ls],
    ['cd2', 2 * cd4],
    ['cd4', cd4],
    ['cd8', cd4 / 2],
    ['3cd4', 3 * cd4],
    ['3cd8', 1.5 * cd4],
    ['5cd8', 2.5 * cd4],
    ['7cd8', 3.5 * cd4],
  ]);
  for (const n of [2, 3, 4, 5, 6, 8, 10, 12, 32]) {
    env.set(`hd${n}`, h / n);
    env.set(`wd${n}`, w / n);
  }
  for (const n of [2, 4, 6, 8, 16, 32]) env.set(`ssd${n}`, ss / n);
  return env;
}

/** Degrees in 60000ths to radians. */
function rad(angle: number): number {
  return (angle / ANGLE_UNIT) * (Math.PI / 180);
}

/** Radians to degrees in 60000ths. */
function deg60000(radians: number): number {
  return ((radians * 180) / Math.PI) * ANGLE_UNIT;
}

type Resolver = (name: string) => number;

/** One formula of the standard's grammar evaluated over a resolver of its arguments. */
export function evaluateFormula(fmla: string, resolve: Resolver): number {
  const [op, ...rawArgs] = fmla.trim().split(/\s+/);
  const args = rawArgs.map(resolve);
  const [x = 0, y = 0, z = 0] = args;
  switch (op) {
    case 'val':
      return x;
    case '*/':
      return z === 0 ? 0 : (x * y) / z;
    case '+-':
      return x + y - z;
    case '+/':
      return z === 0 ? 0 : (x + y) / z;
    case '?:':
      return x > 0 ? y : z;
    case 'abs':
      return Math.abs(x);
    case 'at2':
      return deg60000(Math.atan2(y, x));
    case 'cat2':
      return x * Math.cos(Math.atan2(z, y));
    case 'sat2':
      return x * Math.sin(Math.atan2(z, y));
    case 'cos':
      return x * Math.cos(rad(y));
    case 'sin':
      return x * Math.sin(rad(y));
    case 'tan':
      return x * Math.tan(rad(y));
    case 'max':
      return Math.max(x, y);
    case 'min':
      return Math.min(x, y);
    case 'mod':
      return Math.sqrt(x * x + y * y + z * z);
    case 'pin':
      return Math.min(z, Math.max(x, y));
    case 'sqrt':
      return Math.sqrt(Math.max(0, x));
    default:
      throw new RangeError(`shapes/geometry: unknown formula operator "${op ?? ''}" in "${fmla}"`);
  }
}

/**
 * Every guide of a preset at a size: the built ins, the adjust values (the caller's in `avLst`
 * order, else the definition's `val`), then `gdLst` in order, each formula resolving the ones
 * before it (or one defined later, evaluated on demand, since a few presets read ahead).
 */
export function evaluateGuides(
  definition: PresetDefinition,
  w: number,
  h: number,
  adjusts: ReadonlyArray<number> = [],
): Map<string, number> {
  const env = builtinGuides(w, h);
  const pending = new Map<string, string>();
  definition.avLst.forEach((guide, index) => {
    const given = adjusts[index];
    if (given !== undefined && Number.isFinite(given)) env.set(guide.name, given);
    else pending.set(guide.name, guide.fmla);
  });
  for (const guide of definition.gdLst) pending.set(guide.name, guide.fmla);
  const visiting = new Set<string>();
  const resolve: Resolver = (token) => {
    const literal = Number(token);
    if (Number.isFinite(literal) && /^-?\d+(?:\.\d+)?$/.test(token)) return literal;
    const known = env.get(token);
    if (known !== undefined) return known;
    const fmla = pending.get(token);
    if (fmla === undefined || visiting.has(token)) return 0;
    visiting.add(token);
    const value = evaluateFormula(fmla, resolve);
    visiting.delete(token);
    env.set(token, value);
    return value;
  };
  for (const name of pending.keys()) resolve(name);
  return env;
}

// ---------------------------------------------------------------------------------------------
// The paths, the text rectangle and the sites

function scaledCommands(
  path: PathDefinition,
  env: Map<string, number>,
  box: ShapeBox,
): PathCommand[] {
  const sx = path.w !== undefined && path.w > 0 ? box.w / path.w : 1;
  const sy = path.h !== undefined && path.h > 0 ? box.h / path.h : 1;
  const value = (token: string): number => {
    const literal = Number(token);
    if (Number.isFinite(literal) && /^-?\d+(?:\.\d+)?$/.test(token)) return literal;
    return env.get(token) ?? 0;
  };
  const px = (token: string): number => box.x + value(token) * sx;
  const py = (token: string): number => box.y + value(token) * sy;
  const out: PathCommand[] = [];
  for (const command of path.commands as DefinitionCommand[]) {
    switch (command.op) {
      case 'moveTo':
        out.push({ op: 'moveTo', x: px(command.x), y: py(command.y) });
        break;
      case 'lnTo':
        out.push({ op: 'lnTo', x: px(command.x), y: py(command.y) });
        break;
      case 'arcTo':
        out.push({
          op: 'arcTo',
          wR: value(command.wR) * sx,
          hR: value(command.hR) * sy,
          stAng: value(command.stAng) / ANGLE_UNIT,
          swAng: value(command.swAng) / ANGLE_UNIT,
        });
        break;
      case 'quadBezTo':
        out.push({
          op: 'quadBezTo',
          points: command.points.map(([x, y]): [number, number] => [px(x), py(y)]),
        });
        break;
      case 'cubicBezTo':
        out.push({
          op: 'cubicBezTo',
          points: command.points.map(([x, y]): [number, number] => [px(x), py(y)]),
        });
        break;
      case 'close':
        out.push({ op: 'close' });
        break;
    }
  }
  return out;
}

/**
 * The paths of a preset at a box with its adjust values applied (SPEC-5 6.5), each with its fill
 * mode and stroke flag as the definitions state them: a shape like `can` or `cube` draws its
 * shaded faces and its inner edges from these, and the ODP writer's `draw:enhanced-path` keeps
 * the `F` and `S` flags. A preset the definitions do not name answers one path, the box.
 */
export function shapePaths(
  preset: string,
  box: ShapeBox,
  adjusts: ReadonlyArray<number> = [],
): ShapeSubpath[] {
  const definition = presetDefinition(preset);
  if (definition === undefined || definition.pathLst.length === 0)
    return [{ commands: boxPath(box), fill: 'norm', stroke: true }];
  const env = evaluateGuides(definition, box.w, box.h, adjusts);
  return definition.pathLst.map((path) => ({
    commands: scaledCommands(path, env, box),
    fill: (path.fill ?? 'norm') as ShapeFillMode,
    stroke: path.stroke !== false,
  }));
}

/**
 * The outline of a preset at a box with its adjust values applied: every path's commands in
 * order, the form one `<path d>` draws (the sheet's single element shape, the picture mask).
 */
export function shapePath(
  preset: string,
  box: ShapeBox,
  adjusts: ReadonlyArray<number> = [],
): PathCommand[] {
  return shapePaths(preset, box, adjusts).flatMap((path) => path.commands);
}

/** The text rectangle of a preset at a box (SPEC-2 2.2.17): the definition's `rect` guides; the whole box without one. */
export function textInset(
  preset: string,
  box: ShapeBox,
  adjusts: ReadonlyArray<number> = [],
): ShapeBox {
  const definition = presetDefinition(preset);
  if (definition === undefined || definition.rect === undefined) return { ...box };
  const env = evaluateGuides(definition, box.w, box.h, adjusts);
  const at = (token: string): number => {
    const literal = Number(token);
    if (Number.isFinite(literal) && /^-?\d+(?:\.\d+)?$/.test(token)) return literal;
    return env.get(token) ?? 0;
  };
  const l = at(definition.rect.l);
  const t = at(definition.rect.t);
  const r = at(definition.rect.r);
  const b = at(definition.rect.b);
  // the rectangle clipped to the frame: a text area never reaches past the shape's own box, and
  // a rectangle the guides collapse or push out of the frame (the pie at its default adjusts, 0
  // to 270 degrees, at a small size) answers the whole box so the shape's text keeps a place
  const x0 = Math.max(0, Math.min(l, r));
  const y0 = Math.max(0, Math.min(t, b));
  const x1 = Math.min(box.w, Math.max(l, r));
  const y1 = Math.min(box.h, Math.max(t, b));
  if (!(x1 - x0 > 0) || !(y1 - y0 > 0)) return { ...box };
  return { x: box.x + x0, y: box.y + y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The connection sites of a preset at a box in the definitions' order (SPEC-2 2.4.7), which
 * `connect.site` indexes; a rectangle (and the legacy `rectangle`) keeps the eight sites of a box,
 * whose first four are the definitions' own in the same order, so a stored connection holds.
 */
export function sites(
  preset: string,
  box: ShapeBox,
  adjusts: ReadonlyArray<number> = [],
): ConnectionSite[] {
  const name = LEGACY[preset] ?? preset;
  const definition = PRESET_DEFINITIONS[name];
  if (name === 'rect' || definition === undefined || definition.cxnLst.length === 0)
    return boxSites(box);
  const env = evaluateGuides(definition, box.w, box.h, adjusts);
  const at = (token: string): number => {
    const literal = Number(token);
    if (Number.isFinite(literal) && /^-?\d+(?:\.\d+)?$/.test(token)) return literal;
    return env.get(token) ?? 0;
  };
  return definition.cxnLst.map((site) => ({
    x: box.x + at(site.pos[0]),
    y: box.y + at(site.pos[1]),
    angle: (((at(site.ang) / ANGLE_UNIT) % 360) + 360) % 360,
  }));
}

/** A coordinate on the half pixel grid, as `shapes.ts` has always written it. */
function fmt(n: number): string {
  const v = Math.round(n * 2) / 2;
  return String(Object.is(v, -0) ? 0 : v);
}

/** A point of an arc at an angle in degrees on an ellipse centred at `cx, cy`. */
function arcPoint(
  cx: number,
  cy: number,
  wR: number,
  hR: number,
  degrees: number,
): [number, number] {
  const r = (degrees * Math.PI) / 180;
  return [cx + wR * Math.cos(r), cy + hR * Math.sin(r)];
}

/**
 * The commands as SVG path data: `M`, `L` (or `H` and `V` for an axis aligned segment), `Q`, `C`,
 * `Z`; an `arcTo` as SVG arcs of at most 90 degrees each, from the current point. The current
 * point is tracked so the shorthands and the arcs know where they start.
 */
export function pathData(commands: ReadonlyArray<PathCommand>): string {
  const out: string[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const command of commands) {
    switch (command.op) {
      case 'moveTo':
        out.push(`M${fmt(command.x)},${fmt(command.y)}`);
        cx = command.x;
        cy = command.y;
        sx = cx;
        sy = cy;
        break;
      case 'lnTo':
        if (command.y === cy) out.push(`H${fmt(command.x)}`);
        else if (command.x === cx) out.push(`V${fmt(command.y)}`);
        else out.push(`L${fmt(command.x)},${fmt(command.y)}`);
        cx = command.x;
        cy = command.y;
        break;
      case 'arcTo': {
        // the current point lies on the ellipse at stAng; the centre follows from it
        const start = arcPoint(0, 0, command.wR, command.hR, command.stAng);
        const centreX = cx - start[0];
        const centreY = cy - start[1];
        let remaining = command.swAng;
        let angle = command.stAng;
        const sweep = remaining >= 0 ? 1 : 0;
        if (command.wR <= 0 || command.hR <= 0) {
          const [ex, ey] = arcPoint(centreX, centreY, command.wR, command.hR, angle + remaining);
          out.push(`L${fmt(ex)},${fmt(ey)}`);
          cx = ex;
          cy = ey;
          break;
        }
        while (Math.abs(remaining) > 1e-9) {
          const step = Math.sign(remaining) * Math.min(90, Math.abs(remaining));
          angle += step;
          remaining -= step;
          const [ex, ey] = arcPoint(centreX, centreY, command.wR, command.hR, angle);
          out.push(`A${fmt(command.wR)},${fmt(command.hR)} 0 0 ${sweep} ${fmt(ex)},${fmt(ey)}`);
          cx = ex;
          cy = ey;
        }
        break;
      }
      case 'quadBezTo': {
        const points = command.points.map(([x, y]) => `${fmt(x)},${fmt(y)}`);
        out.push(`Q${points.join(' ')}`);
        const last = command.points[command.points.length - 1];
        if (last) [cx, cy] = last;
        break;
      }
      case 'cubicBezTo': {
        const points = command.points.map(([x, y]) => `${fmt(x)},${fmt(y)}`);
        out.push(`C${points.join(' ')}`);
        const last = command.points[command.points.length - 1];
        if (last) [cx, cy] = last;
        break;
      }
      case 'close':
        out.push('Z');
        cx = sx;
        cy = sy;
        break;
    }
  }
  return out.join(' ');
}

/**
 * The commands as cubic segments and lines alone: every `arcTo` becomes cubic Bezier segments of
 * at most a quarter turn each (the ODF `draw:enhanced-path` writer's `C` form, SPEC-5 6.5) and
 * every `quadBezTo` a cubic, so a reader without elliptical arcs draws the same outline.
 */
export function cubicCommands(commands: ReadonlyArray<PathCommand>): PathCommand[] {
  const out: PathCommand[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const command of commands) {
    switch (command.op) {
      case 'moveTo':
        out.push(command);
        cx = command.x;
        cy = command.y;
        sx = cx;
        sy = cy;
        break;
      case 'lnTo':
        out.push(command);
        cx = command.x;
        cy = command.y;
        break;
      case 'arcTo': {
        const start = arcPoint(0, 0, command.wR, command.hR, command.stAng);
        const centreX = cx - start[0];
        const centreY = cy - start[1];
        let remaining = command.swAng;
        let angle = command.stAng;
        while (Math.abs(remaining) > 1e-9) {
          const step = Math.sign(remaining) * Math.min(90, Math.abs(remaining));
          const a0 = (angle * Math.PI) / 180;
          const a1 = ((angle + step) * Math.PI) / 180;
          // the cubic approximation of an elliptical arc: the handles along the tangents at
          // 4/3 tan(step/4) of the radii
          const k = (4 / 3) * Math.tan((a1 - a0) / 4);
          const p0: [number, number] = [
            centreX + command.wR * Math.cos(a0),
            centreY + command.hR * Math.sin(a0),
          ];
          const p3: [number, number] = [
            centreX + command.wR * Math.cos(a1),
            centreY + command.hR * Math.sin(a1),
          ];
          const p1: [number, number] = [
            p0[0] - k * command.wR * Math.sin(a0),
            p0[1] + k * command.hR * Math.cos(a0),
          ];
          const p2: [number, number] = [
            p3[0] + k * command.wR * Math.sin(a1),
            p3[1] - k * command.hR * Math.cos(a1),
          ];
          out.push({ op: 'cubicBezTo', points: [p1, p2, p3] });
          angle += step;
          remaining -= step;
          cx = p3[0];
          cy = p3[1];
        }
        break;
      }
      case 'quadBezTo': {
        const [c, end] = command.points;
        if (c && end) {
          out.push({
            op: 'cubicBezTo',
            points: [
              [cx + (2 / 3) * (c[0] - cx), cy + (2 / 3) * (c[1] - cy)],
              [end[0] + (2 / 3) * (c[0] - end[0]), end[1] + (2 / 3) * (c[1] - end[1])],
              end,
            ],
          });
          cx = end[0];
          cy = end[1];
        }
        break;
      }
      case 'cubicBezTo': {
        out.push(command);
        const last = command.points[command.points.length - 1];
        if (last) [cx, cy] = last;
        break;
      }
      case 'close':
        out.push(command);
        cx = sx;
        cy = sy;
        break;
    }
  }
  return out;
}
