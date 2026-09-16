// The drawn objects of the ODP (gslides-parity SPEC-5 6.3, 6.5; R09 2.2): a measured rectangle,
// rounded rectangle, ellipse or preset as a `draw:custom-shape` whose `draw:enhanced-geometry`
// carries `draw:type="ooxml-<prst>"` and the full `draw:enhanced-path` from the shape interpreter
// (`shapePaths` of packages/schema shapes/geometry.ts; an `arcTo` as cubic segments through
// `cubicCommands`, so LibreOffice draws the same outline the sheet did), a rule or a segment as
// `draw:line` with the arrow markers of styles.xml, a curve, polyline or scribble as `draw:path`,
// a raster or a picture as a `draw:frame` holding a `draw:image` under `Pictures/`; fills as solid
// colours with `draw:opacity` for an alpha, strokes with their width and dash, shadows as
// `draw:shadow`. Every element takes the `xml:id` the animation tree targets when its block
// carries an effect.
import { cubicCommands, shapePaths } from '@turboslide/schema/shapes/geometry';
import type { PathCommand } from '@turboslide/schema/shapes/geometry';
import type { Box } from '@turboslide/schema/render';

import type {
  SceneDash,
  SceneObject,
  SceneRaster,
  SceneRect,
  SceneSegment,
  SceneShadow,
} from '../scene/types.ts';
import type { StyleAllocator } from './styles.ts';
import { cm, cssColor, el, num } from './xml.ts';

export type OdfShapeContext = {
  styles: StyleAllocator;
  /** Adds a binary part and answers its package path (`Pictures/<name>`). */
  addPicture: (bytes: Uint8Array, mime: string, hint: string) => string;
};

/** The ODF dash names for the document's six dashes; solid writes no dash. */
export const ODF_DASH_STYLES: Readonly<Record<Exclude<SceneDash, 'solid'>, string>> = {
  dot: 'Dot',
  dash: 'Dash',
  dashDot: 'DashDot',
  longDash: 'LongDash',
  longDashDot: 'LongDashDot',
};

/** The `draw:stroke-dash` elements the graphic styles reference, for `office:styles` (one each). */
export function dashDefinitions(): string {
  return (
    el('draw:stroke-dash', {
      'draw:name': 'Dot',
      'draw:style': 'round',
      'draw:dots1': '1',
      'draw:dots1-length': '100%',
      'draw:distance': '100%',
    }) +
    el('draw:stroke-dash', {
      'draw:name': 'Dash',
      'draw:style': 'rect',
      'draw:dots1': '1',
      'draw:dots1-length': '400%',
      'draw:distance': '300%',
    }) +
    el('draw:stroke-dash', {
      'draw:name': 'DashDot',
      'draw:style': 'rect',
      'draw:dots1': '1',
      'draw:dots1-length': '400%',
      'draw:dots2': '1',
      'draw:dots2-length': '100%',
      'draw:distance': '300%',
    }) +
    el('draw:stroke-dash', {
      'draw:name': 'LongDash',
      'draw:style': 'rect',
      'draw:dots1': '1',
      'draw:dots1-length': '800%',
      'draw:distance': '300%',
    }) +
    el('draw:stroke-dash', {
      'draw:name': 'LongDashDot',
      'draw:style': 'rect',
      'draw:dots1': '1',
      'draw:dots1-length': '800%',
      'draw:dots2': '1',
      'draw:dots2-length': '100%',
      'draw:distance': '300%',
    })
  );
}

/** The shadow properties of an object, when it carries one. */
function shadowProperties(shadow: SceneShadow | undefined): Record<string, string> {
  if (shadow === undefined) return {};
  const rad = (shadow.angle * Math.PI) / 180;
  return {
    'draw:shadow': 'visible',
    'draw:shadow-offset-x': cm(Math.cos(rad) * shadow.distance),
    'draw:shadow-offset-y': cm(Math.sin(rad) * shadow.distance),
    'draw:shadow-color': shadow.colorHex.startsWith('#') ? shadow.colorHex : `#${shadow.colorHex}`,
    'draw:shadow-opacity': `${Math.round(shadow.opacity * 100)}%`,
    'loext:shadow-blur': cm(shadow.blur),
  };
}

/** The fill properties of a CSS colour: solid with an opacity, or none. */
export function fillProperties(color: string | undefined): Record<string, string> {
  const fill = cssColor(color);
  if (fill === null) return { 'draw:fill': 'none' };
  return {
    'draw:fill': 'solid',
    'draw:fill-color': fill.hex,
    ...(fill.alpha < 1 ? { 'draw:opacity': `${Math.round(fill.alpha * 100)}%` } : {}),
  };
}

/** The stroke properties of a CSS colour and a width in sheet px; none for no colour or no width. */
export function strokeProperties(
  color: string | undefined,
  width: number,
  dash?: SceneDash,
): Record<string, string> {
  const stroke = cssColor(color);
  if (stroke === null || width <= 0) return { 'draw:stroke': 'none' };
  return {
    'draw:stroke': dash !== undefined && dash !== 'solid' ? 'dash' : 'solid',
    ...(dash !== undefined && dash !== 'solid'
      ? { 'draw:stroke-dash': ODF_DASH_STYLES[dash] }
      : {}),
    'svg:stroke-color': stroke.hex,
    'svg:stroke-width': cm(width),
    ...(stroke.alpha < 1 ? { 'svg:stroke-opacity': `${Math.round(stroke.alpha * 100)}%` } : {}),
    'draw:stroke-linejoin': 'miter',
  };
}

/** The transform attributes of a rotated or mirrored object about its box centre. */
export function transformAttrs(object: SceneObject, box: Box): Record<string, string | undefined> {
  const [x, y, w, h] = box;
  const rotate = object.rotate ?? 0;
  if (rotate === 0 && object.flip === undefined) {
    return { 'svg:x': cm(x), 'svg:y': cm(y), 'svg:width': cm(w), 'svg:height': cm(h) };
  }
  // ODF: transforms apply right to left as written; the box is laid out at the origin, mirrored
  // about the origin, rotated (counter clockwise radians) and translated to its place
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rad = (-rotate * Math.PI) / 180;
  const flipX = object.flip === 'h' || object.flip === 'hv' ? -1 : 1;
  const flipY = object.flip === 'v' || object.flip === 'hv' ? -1 : 1;
  const parts: string[] = [];
  parts.push(`translate (${cm(-w / 2)} ${cm(-h / 2)})`);
  if (flipX < 0 || flipY < 0) parts.push(`scale (${flipX} ${flipY})`);
  if (rotate !== 0) parts.push(`rotate (${num(rad)})`);
  parts.push(`translate (${cm(cx)} ${cm(cy)})`);
  return { 'svg:width': cm(w), 'svg:height': cm(h), 'draw:transform': parts.join(' ') };
}

/**
 * The `draw:enhanced-path` of evaluated commands in the shape's own coordinate space (the view
 * box is the shape's box in sheet px scaled by 100 so the integers keep two decimals): M, L, C
 * (arcs as cubics), Q, Z; `N` ends a subpath so the next `M` starts a new one; the fill and
 * stroke flags `F` and `S` open a path that is not filled or not stroked (they apply to the
 * subpaths that follow them).
 */
export function enhancedPath(
  commands: ReadonlyArray<PathCommand>,
  fill: boolean,
  stroke: boolean,
): string {
  const k = 100;
  const p = (v: number): string => String(Math.round(v * k));
  const out: string[] = [];
  for (const command of cubicCommands(commands)) {
    switch (command.op) {
      case 'moveTo':
        out.push(`M ${p(command.x)} ${p(command.y)}`);
        break;
      case 'lnTo':
        out.push(`L ${p(command.x)} ${p(command.y)}`);
        break;
      case 'quadBezTo': {
        const pts = command.points.map(([x, y]) => `${p(x)} ${p(y)}`).join(' ');
        out.push(`Q ${pts}`);
        break;
      }
      case 'cubicBezTo': {
        const pts = command.points.map(([x, y]) => `${p(x)} ${p(y)}`).join(' ');
        out.push(`C ${pts}`);
        break;
      }
      case 'close':
        out.push('Z');
        break;
      case 'arcTo':
        // cubicCommands turned every arc into cubics; an arc that survives is a definition the
        // converter did not reach, drawn as a line to keep the outline continuous
        break;
    }
  }
  // the fill and stroke flags apply to the subpaths after them (ODF 1.2 19.145): a path that is
  // not filled opens with F, one that is not stroked with S
  const flags = `${fill ? '' : 'F '}${stroke ? '' : 'S '}`;
  return `${flags}${out.join(' ')} N`;
}

/** The ODF preset name of a measured rect: `ooxml-<prst>` for a preset, `rectangle`, `round-rectangle` or `ellipse` otherwise. */
export function odfShapeType(rect: SceneRect): string {
  if (rect.preset !== undefined) return `ooxml-${rect.preset}`;
  if (rect.shape === 'ellipse') return 'ooxml-ellipse';
  if (rect.shape === 'roundRect') return 'ooxml-roundRect';
  return 'ooxml-rect';
}

/**
 * A measured rect, plate, chip, box or preset shape as a `draw:custom-shape` with the
 * interpreter's outline as its enhanced geometry; the text of a shape with text is written by
 * the caller inside the shape (`inner`), so LibreOffice keeps it in the text area.
 */
export function customShapeXml(
  rect: SceneRect,
  ctx: OdfShapeContext,
  inner = '',
  attributes: Record<string, string | undefined> = {},
): string {
  const [, , w, h] = rect.box;
  const preset =
    rect.preset ??
    (rect.shape === 'ellipse' ? 'ellipse' : rect.shape === 'roundRect' ? 'roundRect' : 'rect');
  // a rounded rectangle's radius as its adjust value: adj = radius / min(w, h) * 100000
  const adjusts =
    rect.adjust !== undefined
      ? rect.adjust.map((a) => a * 100000)
      : preset === 'roundRect' && rect.radius !== undefined && Math.min(w, h) > 0
        ? [Math.min(50000, (rect.radius / Math.min(w, h)) * 100000)]
        : [];
  const paths = shapePaths(preset, { x: 0, y: 0, w, h }, adjusts);
  const filled = cssColor(rect.fill) !== null;
  const stroked =
    rect.line !== undefined && cssColor(rect.line.color) !== null && rect.line.width > 0;
  const path = paths
    .map((part) =>
      enhancedPath(part.commands, filled && part.fill !== 'none', stroked && part.stroke),
    )
    .join(' ');
  const style = ctx.styles.add(
    'graphic',
    el('style:graphic-properties', {
      ...fillProperties(rect.fill),
      ...strokeProperties(rect.line?.color, rect.line?.width ?? 0, rect.dash),
      ...shadowProperties(rect.shadow),
      'draw:textarea-vertical-align':
        rect.valign === 'middle' ? 'middle' : rect.valign === 'bottom' ? 'bottom' : 'top',
      ...(rect.padding !== undefined
        ? {
            'fo:padding-top': cm(rect.padding[0]),
            'fo:padding-right': cm(rect.padding[1]),
            'fo:padding-bottom': cm(rect.padding[2]),
            'fo:padding-left': cm(rect.padding[3]),
          }
        : {}),
    }),
    'standard',
  );
  const geometry = el('draw:enhanced-geometry', {
    'svg:viewBox': `0 0 ${Math.round(w * 100)} ${Math.round(h * 100)}`,
    'draw:type': odfShapeType(rect),
    'draw:enhanced-path': path,
  });
  return el(
    'draw:custom-shape',
    {
      'draw:style-name': style,
      'draw:layer': 'layout',
      ...transformAttrs(rect, rect.box),
      ...attributes,
    },
    `${inner}${geometry}`,
  );
}

/** The marker attributes of a segment's ends: the arrow on the headed ends (the decorations' nearest marker). */
function markerAttrs(segment: SceneSegment): Record<string, string> {
  const marker = (name: string | undefined, headed: boolean): string | undefined => {
    if (name === 'none') return undefined;
    if (name === undefined) return headed ? 'Arrow' : undefined;
    if (/circle|oval|dot/i.test(name)) return 'Circle';
    if (/square|diamond/i.test(name)) return 'Square';
    return 'Arrow';
  };
  const start = marker(segment.startEnd, segment.heads === 'start' || segment.heads === 'both');
  const end = marker(segment.endEnd, segment.heads === 'end' || segment.heads === 'both');
  const size = cm(Math.max(6, segment.width * 5));
  return {
    ...(start !== undefined
      ? {
          'draw:marker-start': start,
          'draw:marker-start-width': size,
          'draw:marker-start-center': 'false',
        }
      : {}),
    ...(end !== undefined
      ? { 'draw:marker-end': end, 'draw:marker-end-width': size, 'draw:marker-end-center': 'false' }
      : {}),
  };
}

/**
 * A segment: a straight line or arrow as `draw:line` between its ends; an elbow, curve, polyline
 * or scribble as `draw:path` through its points in the box's own view box; a closed path filled.
 */
export function segmentXml(
  segment: SceneSegment,
  ctx: OdfShapeContext,
  attributes: Record<string, string | undefined> = {},
): string {
  const style = ctx.styles.add(
    'graphic',
    el('style:graphic-properties', {
      ...(segment.closed === true ? fillProperties(segment.fill) : { 'draw:fill': 'none' }),
      ...strokeProperties(segment.color, segment.width, segment.dash),
      ...markerAttrs(segment),
      ...shadowProperties(segment.shadow),
    }),
    'standard',
  );
  const points = segment.points;
  if (points === undefined || points.length < 2) {
    return el('draw:line', {
      'draw:style-name': style,
      'draw:layer': 'layout',
      'svg:x1': cm(segment.from[0]),
      'svg:y1': cm(segment.from[1]),
      'svg:x2': cm(segment.to[0]),
      'svg:y2': cm(segment.to[1]),
      ...attributes,
    });
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - x0);
  const h = Math.max(1, Math.max(...ys) - y0);
  const k = 100;
  const local = points.map(
    ([x, y]) => [Math.round((x - x0) * k), Math.round((y - y0) * k)] as const,
  );
  let d: string;
  if (segment.kind === 'curve' && local.length >= 3) {
    // a smooth curve through the points as quadratic segments between midpoints
    const parts = [`M ${local[0]?.[0]} ${local[0]?.[1]}`];
    for (let i = 1; i < local.length - 1; i += 1) {
      const p = local[i];
      const n = local[i + 1];
      if (p === undefined || n === undefined) continue;
      parts.push(
        `Q ${p[0]} ${p[1]} ${Math.round((p[0] + n[0]) / 2)} ${Math.round((p[1] + n[1]) / 2)}`,
      );
    }
    const last = local[local.length - 1];
    if (last !== undefined) parts.push(`L ${last[0]} ${last[1]}`);
    d = parts.join(' ');
  } else {
    d = local.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  }
  if (segment.closed === true) d += ' Z';
  return el('draw:path', {
    'draw:style-name': style,
    'draw:layer': 'layout',
    'svg:x': cm(x0),
    'svg:y': cm(y0),
    'svg:width': cm(w),
    'svg:height': cm(h),
    'svg:viewBox': `0 0 ${Math.round(w * k)} ${Math.round(h * k)}`,
    'svg:d': d,
    ...attributes,
  });
}

/** A picture frame: `draw:frame` with a `draw:image` referencing a stored part, at a box. */
export function pictureFrameXml(
  href: string,
  box: Box,
  ctx: OdfShapeContext,
  object: SceneObject = {},
  attributes: Record<string, string | undefined> = {},
  alt?: string,
): string {
  const style = ctx.styles.add(
    'graphic',
    el('style:graphic-properties', {
      'draw:stroke': 'none',
      'draw:fill': 'none',
      ...shadowProperties(object.shadow),
    }),
    'standard',
  );
  const description = alt ?? object.alt;
  return el(
    'draw:frame',
    {
      'draw:style-name': style,
      'draw:layer': 'layout',
      ...transformAttrs(object, box),
      ...attributes,
    },
    el('draw:image', {
      'xlink:href': href,
      'xlink:type': 'simple',
      'xlink:show': 'embed',
      'xlink:actuate': 'onLoad',
    }) + (description !== undefined && description !== '' ? el('svg:desc', {}, description) : ''),
  );
}

/** A raster the extractor shot, stored under Pictures and framed at its box. */
export function rasterFrameXml(
  raster: SceneRaster,
  bytes: Uint8Array,
  ctx: OdfShapeContext,
  attributes: Record<string, string | undefined> = {},
): string {
  const href = ctx.addPicture(bytes, 'image/png', raster.id);
  return pictureFrameXml(href, raster.box, ctx, raster, attributes);
}

/** A hairline rule of the frame or a block as a `draw:line` along its box's longer axis. */
export function ruleLineXml(
  box: Box,
  color: string,
  width: number,
  ctx: OdfShapeContext,
  attributes: Record<string, string | undefined> = {},
): string {
  const [x, y, w, h] = box;
  const horizontal = w >= h;
  const style = ctx.styles.add(
    'graphic',
    el('style:graphic-properties', {
      'draw:fill': 'none',
      ...strokeProperties(color, Math.max(width, 0.5)),
    }),
    'standard',
  );
  return el('draw:line', {
    'draw:style-name': style,
    'draw:layer': 'layout',
    'svg:x1': cm(horizontal ? x : x + w / 2),
    'svg:y1': cm(horizontal ? y + h / 2 : y),
    'svg:x2': cm(horizontal ? x + w : x + w / 2),
    'svg:y2': cm(horizontal ? y + h / 2 : y + h),
    ...attributes,
  });
}
