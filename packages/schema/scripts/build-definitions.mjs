#!/usr/bin/env node
// Turns ECMA-376 Part 1's presetShapeDefinitions.xml (committed beside definitions.ts under
// src/shapes/, gslides-parity SPEC-2 0.57) into two modules: definitions.ts, the data module the
// geometry interpreter (shapes/geometry.ts) evaluates and the picker, the renderer and the export
// read through shapes.ts, and ids.ts, the list of the preset names the table holds, which the
// validators can import without the table. Only the presets shapes.ts lists plus the three
// connector geometries are written, so the module stays small enough for the browser bundle. The
// XML is regular (one element per preset, the DrawingML geometry elements inside), so a small
// tokenizer is enough; no XML library is needed.
//
//   node packages/schema/scripts/build-definitions.mjs [--check]
//
// --check exits 1 when definitions.ts or ids.ts differs from a fresh generation. The output is
// deterministic: presets in the order of PRESET_IDS below, attributes in a fixed order.
//
// Round four (gslides-parity SPEC-4 0.44, 3.12; PP 7 row 3): the table is one compact JSON string
// parsed at load (`JSON.parse` of a large literal parses faster than an object literal and skips
// the lazy parse pass, v8.dev "Faster apps with JSON.parse"), where the earlier generation wrote
// the same data pretty printed (528,840 bytes of source for about 300 KB of data). The string is
// written with `JSON.stringify` once and escaped for a single quoted literal; it holds no
// backtick, backslash or quote of its own, and the check asserts the round trip.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHAPES = join(here, '..', 'src', 'shapes');
const SOURCE = join(SHAPES, 'presetShapeDefinitions.xml');
const OUT = join(SHAPES, 'definitions.ts');
const IDS_OUT = join(SHAPES, 'ids.ts');

/** The presets shapes.ts lists (gslides-parity SPEC-2 2.3) plus the connector geometries of 2.4. */
export const PRESET_IDS = [
  // Shapes
  'rect',
  'roundRect',
  'snip1Rect',
  'snip2SameRect',
  'snip2DiagRect',
  'snipRoundRect',
  'round1Rect',
  'round2SameRect',
  'round2DiagRect',
  'ellipse',
  'triangle',
  'rtTriangle',
  'parallelogram',
  'trapezoid',
  'diamond',
  'pentagon',
  'hexagon',
  'heptagon',
  'octagon',
  'decagon',
  'dodecagon',
  'pie',
  'chord',
  'teardrop',
  'frame',
  'halfFrame',
  'corner',
  'diagStripe',
  'plus',
  'plaque',
  'can',
  'cube',
  'bevel',
  'donut',
  'noSmoking',
  'blockArc',
  'foldedCorner',
  'smileyFace',
  'heart',
  'lightningBolt',
  'sun',
  'moon',
  'cloud',
  'arc',
  'bracketPair',
  'bracePair',
  'leftBracket',
  'rightBracket',
  'leftBrace',
  'rightBrace',
  'flowChartProcess',
  'flowChartAlternateProcess',
  'flowChartDecision',
  'flowChartInputOutput',
  'flowChartPredefinedProcess',
  'flowChartInternalStorage',
  'flowChartDocument',
  'flowChartMultidocument',
  'flowChartTerminator',
  'flowChartPreparation',
  'flowChartManualInput',
  'flowChartManualOperation',
  'flowChartConnector',
  'flowChartOffpageConnector',
  'flowChartPunchedCard',
  'flowChartPunchedTape',
  'flowChartSummingJunction',
  'flowChartOr',
  'flowChartCollate',
  'flowChartSort',
  'flowChartExtract',
  'flowChartMerge',
  'flowChartOfflineStorage',
  'flowChartOnlineStorage',
  'flowChartMagneticTape',
  'flowChartMagneticDisk',
  'flowChartMagneticDrum',
  'flowChartDelay',
  'flowChartDisplay',
  'star4',
  'star5',
  'star6',
  'star7',
  'star8',
  'star10',
  'star12',
  'star16',
  'star24',
  'star32',
  'irregularSeal1',
  'irregularSeal2',
  'ribbon',
  'ribbon2',
  'ellipseRibbon',
  'ellipseRibbon2',
  'verticalScroll',
  'horizontalScroll',
  'wave',
  'doubleWave',
  // Arrows
  'rightArrow',
  'leftArrow',
  'upArrow',
  'downArrow',
  'leftRightArrow',
  'upDownArrow',
  'quadArrow',
  'leftRightUpArrow',
  'bentArrow',
  'uturnArrow',
  'leftUpArrow',
  'bentUpArrow',
  'curvedRightArrow',
  'curvedLeftArrow',
  'curvedUpArrow',
  'curvedDownArrow',
  'stripedRightArrow',
  'notchedRightArrow',
  'homePlate',
  'chevron',
  'rightArrowCallout',
  'downArrowCallout',
  'leftArrowCallout',
  'upArrowCallout',
  'leftRightArrowCallout',
  'quadArrowCallout',
  // Callouts
  'wedgeRectCallout',
  'wedgeRoundRectCallout',
  'wedgeEllipseCallout',
  'cloudCallout',
  // Equation
  'mathPlus',
  'mathMinus',
  'mathMultiply',
  'mathDivide',
  'mathEqual',
  'mathNotEqual',
  // Connectors (gslides-parity SPEC-2 2.4.1, 2.4.2)
  'straightConnector1',
  'bentConnector3',
  'curvedConnector3',
];

/** A minimal element tree from the regular XML the standard publishes. */
function parseXml(text) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const tag = /<\/?([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
  let match;
  while ((match = tag.exec(text)) !== null) {
    const [whole, name, rawAttrs, selfClose] = match;
    if (whole.startsWith('</')) {
      stack.pop();
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
      if (a[1] === 'xmlns') continue;
      attrs[a[1]] = a[2];
    }
    const node = { name, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (selfClose !== '/') stack.push(node);
  }
  return root;
}

function child(node, name) {
  return node.children.find((c) => c.name === name);
}

function children(node, name) {
  return node.children.filter((c) => c.name === name);
}

function guides(list) {
  if (!list) return [];
  return children(list, 'gd').map((gd) => ({ name: gd.attrs.name, fmla: gd.attrs.fmla }));
}

function pos(node) {
  const p = child(node, 'pos');
  return [p.attrs.x, p.attrs.y];
}

function handles(list) {
  if (!list) return [];
  return list.children.map((h) => {
    if (h.name === 'ahXY') {
      const out = { kind: 'xy', pos: pos(h) };
      for (const key of ['gdRefX', 'minX', 'maxX', 'gdRefY', 'minY', 'maxY'])
        if (h.attrs[key] !== undefined) out[key] = h.attrs[key];
      return out;
    }
    const out = { kind: 'polar', pos: pos(h) };
    for (const key of ['gdRefR', 'minR', 'maxR', 'gdRefAng', 'minAng', 'maxAng'])
      if (h.attrs[key] !== undefined) out[key] = h.attrs[key];
    return out;
  });
}

function connections(list) {
  if (!list) return [];
  return children(list, 'cxn').map((cxn) => ({ ang: cxn.attrs.ang, pos: pos(cxn) }));
}

function textRect(node) {
  if (!node) return undefined;
  return { l: node.attrs.l, t: node.attrs.t, r: node.attrs.r, b: node.attrs.b };
}

function points(node) {
  return children(node, 'pt').map((pt) => [pt.attrs.x, pt.attrs.y]);
}

function paths(list) {
  if (!list) return [];
  return children(list, 'path').map((path) => {
    const out = {};
    if (path.attrs.w !== undefined) out.w = Number(path.attrs.w);
    if (path.attrs.h !== undefined) out.h = Number(path.attrs.h);
    if (path.attrs.fill !== undefined) out.fill = path.attrs.fill;
    if (path.attrs.stroke === 'false') out.stroke = false;
    if (path.attrs.extrusionOk !== undefined) out.extrusionOk = path.attrs.extrusionOk === 'true';
    out.commands = path.children.map((command) => {
      switch (command.name) {
        case 'moveTo':
        case 'lnTo': {
          const [p] = points(command);
          return { op: command.name, x: p[0], y: p[1] };
        }
        case 'arcTo':
          return {
            op: 'arcTo',
            wR: command.attrs.wR,
            hR: command.attrs.hR,
            stAng: command.attrs.stAng,
            swAng: command.attrs.swAng,
          };
        case 'quadBezTo':
        case 'cubicBezTo':
          return { op: command.name, points: points(command) };
        case 'close':
          return { op: 'close' };
        default:
          throw new Error(`unknown path command ${command.name}`);
      }
    });
    return out;
  });
}

export function generate() {
  const xml = readFileSync(SOURCE, 'utf8');
  const sha256 = createHash('sha256').update(xml).digest('hex');
  const root = parseXml(xml);
  const definitions = root.children[0];
  const byName = new Map(definitions.children.map((node) => [node.name, node]));
  const out = {};
  for (const id of PRESET_IDS) {
    const node = byName.get(id);
    if (node === undefined) throw new Error(`presetShapeDefinitions.xml has no ${id}`);
    const definition = {
      avLst: guides(child(node, 'avLst')),
      gdLst: guides(child(node, 'gdLst')),
      ahLst: handles(child(node, 'ahLst')),
      cxnLst: connections(child(node, 'cxnLst')),
      pathLst: paths(child(node, 'pathLst')),
    };
    const rect = textRect(child(node, 'rect'));
    if (rect !== undefined) definition.rect = rect;
    out[id] = definition;
  }
  const body = JSON.stringify(out);
  if (/[`\\']/.test(body))
    throw new Error('the definitions JSON holds a quote, a backtick or a backslash');
  return [
    '// Generated by packages/schema/scripts/build-definitions.mjs from presetShapeDefinitions.xml',
    '// (ECMA-376 Part 1, the file the standard publishes beside its text; gslides-parity SPEC-2 0.57).',
    '// Do not edit by hand: run `node packages/schema/scripts/build-definitions.mjs`. One entry per',
    '// preset shapes.ts lists plus the connector geometries: the adjust values (avLst), the guide',
    '// formulas (gdLst), the adjust handles (ahLst), the connection sites (cxnLst), the text rectangle',
    '// and the path list, as the standard writes them. geometry.ts evaluates them at a block size.',
    '// The data is one compact JSON string parsed at load (gslides-parity SPEC-4 0.44, 3.12): a',
    '// formatter never reflows it and V8 parses the literal faster than an object literal would be.',
    '// The preset names are in ids.ts, beside this file, for the modules that need the names alone.',
    'export const PRESET_DEFINITIONS_SHA256 =',
    `  '${sha256}';`,
    '',
    'export type GuideDefinition = { name: string; fmla: string };',
    '',
    'export type AdjustHandle =',
    '  | {',
    "      kind: 'xy';",
    '      pos: [string, string];',
    '      gdRefX?: string;',
    '      minX?: string;',
    '      maxX?: string;',
    '      gdRefY?: string;',
    '      minY?: string;',
    '      maxY?: string;',
    '    }',
    '  | {',
    "      kind: 'polar';",
    '      pos: [string, string];',
    '      gdRefR?: string;',
    '      minR?: string;',
    '      maxR?: string;',
    '      gdRefAng?: string;',
    '      minAng?: string;',
    '      maxAng?: string;',
    '    };',
    '',
    'export type ConnectionSite = { ang: string; pos: [string, string] };',
    '',
    'export type PathCommand =',
    "  | { op: 'moveTo'; x: string; y: string }",
    "  | { op: 'lnTo'; x: string; y: string }",
    "  | { op: 'arcTo'; wR: string; hR: string; stAng: string; swAng: string }",
    "  | { op: 'quadBezTo'; points: [string, string][] }",
    "  | { op: 'cubicBezTo'; points: [string, string][] }",
    "  | { op: 'close' };",
    '',
    'export type PathDefinition = {',
    '  /** The coordinate space the path is drawn in; the shape box when absent. */',
    '  w?: number;',
    '  h?: number;',
    '  /** none, norm, lighten, lightenLess, darken or darkenLess; norm when absent. */',
    '  fill?: string;',
    '  /** false when the path draws no outline. */',
    '  stroke?: boolean;',
    '  extrusionOk?: boolean;',
    '  commands: PathCommand[];',
    '};',
    '',
    'export type PresetDefinition = {',
    '  avLst: GuideDefinition[];',
    '  gdLst: GuideDefinition[];',
    '  ahLst: AdjustHandle[];',
    '  cxnLst: ConnectionSite[];',
    '  rect?: { l: string; t: string; r: string; b: string };',
    '  pathLst: PathDefinition[];',
    '};',
    '',
    '// prettier-ignore',
    "export const PRESET_DEFINITIONS: Readonly<Record<string, PresetDefinition>> = JSON.parse('" +
      body +
      "') as Readonly<Record<string, PresetDefinition>>;",
    '',
  ].join('\n');
}

/** The names module: the table's keys in table order, split by the role shapes.ts gives them. */
export function generateIds() {
  const connectors = PRESET_IDS.filter((id) => /Connector\d$/.test(id));
  const shapes = PRESET_IDS.filter((id) => !/Connector\d$/.test(id));
  const list = (ids) => ids.map((id) => `  '${id}',`).join('\n');
  return [
    '// Generated by packages/schema/scripts/build-definitions.mjs beside definitions.ts (gslides-parity',
    '// SPEC-4 0.44, 3.12): the names of the presets the definitions table holds, in table order, so a',
    '// module that needs the names alone (a validator, an action input) imports this file and not the',
    '// table. shapes.ts derives SHAPE_PRESET_IDS from its labelled rows and shapes.test.ts asserts the',
    '// two lists agree. Do not edit by hand.',
    '',
    '/** The presets of the picker in table order (gslides-parity SPEC-2 2.3): 135 names. */',
    'export const SHAPE_GEOMETRY_IDS = [',
    list(shapes),
    '] as const;',
    'export type ShapeGeometryId = (typeof SHAPE_GEOMETRY_IDS)[number];',
    '',
    '/** The connector geometries of gslides-parity SPEC-2 2.4.1 and 2.4.2. */',
    'export const CONNECTOR_GEOMETRY_IDS = [',
    list(connectors),
    '] as const;',
    'export type ConnectorGeometryId = (typeof CONNECTOR_GEOMETRY_IDS)[number];',
    '',
    '/** Every key of PRESET_DEFINITIONS, in table order. */',
    'export const PRESET_DEFINITION_IDS: readonly string[] = [',
    '  ...SHAPE_GEOMETRY_IDS,',
    '  ...CONNECTOR_GEOMETRY_IDS,',
    '];',
    '',
  ].join('\n');
}

const args = new Set(process.argv.slice(2));
const text = generate();
const ids = generateIds();
const read = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};
if (args.has('--check')) {
  const stale = [
    ...(read(OUT) === text ? [] : ['definitions.ts']),
    ...(read(IDS_OUT) === ids ? [] : ['ids.ts']),
  ];
  if (stale.length > 0) {
    process.stderr.write(`build-definitions: ${stale.join(' and ')} stale; run the script\n`);
    process.exit(1);
  }
  process.stderr.write('build-definitions: definitions.ts and ids.ts are current\n');
} else {
  writeFileSync(OUT, text);
  writeFileSync(IDS_OUT, ids);
  process.stderr.write(
    `build-definitions: wrote ${OUT} (${PRESET_IDS.length} presets, ${text.length} bytes) and ${IDS_OUT}\n`,
  );
}
