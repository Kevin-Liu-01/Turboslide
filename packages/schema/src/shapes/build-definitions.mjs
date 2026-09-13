#!/usr/bin/env node
// Turns ECMA-376 Part 1's presetShapeDefinitions.xml (committed beside this file, gslides-parity
// SPEC-2 0.57) into definitions.ts, the data module the geometry interpreter (shapes/geometry.ts)
// evaluates and the picker, the renderer and the export read through shapes.ts. Only the presets
// shapes.ts lists plus the two connector geometries are written, so the module stays small enough
// for the browser bundle. The XML is regular (one element per preset, the DrawingML geometry
// elements inside), so a small tokenizer is enough; no XML library is needed.
//
//   node packages/schema/src/shapes/build-definitions.mjs [--check]
//
// --check exits 1 when definitions.ts differs from a fresh generation. The output is
// deterministic: presets in the order of PRESET_IDS below, attributes in a fixed order.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, 'presetShapeDefinitions.xml');
const OUT = join(here, 'definitions.ts');

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
  const body = JSON.stringify(out, null, 2);
  return [
    '// Generated by build-definitions.mjs from presetShapeDefinitions.xml (ECMA-376 Part 1, the',
    '// file the standard publishes beside its text; gslides-parity SPEC-2 0.57). Do not edit by',
    '// hand: run `node packages/schema/src/shapes/build-definitions.mjs`. One entry per preset',
    '// shapes.ts lists plus the connector geometries: the adjust values (avLst), the guide formulas',
    '// (gdLst), the adjust handles (ahLst), the connection sites (cxnLst), the text rectangle and',
    '// the path list, as the standard writes them. geometry.ts evaluates them at a block size.',
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
    '// The data is parsed from a JSON string so a formatter never reflows half a megabyte of',
    '// definitions; the string holds no backtick and no template placeholder.',
    'export const PRESET_DEFINITIONS: Readonly<Record<string, PresetDefinition>> = JSON.parse(`' +
      body +
      '`) as Readonly<Record<string, PresetDefinition>>;',
    '',
  ].join('\n');
}

const args = new Set(process.argv.slice(2));
const text = generate();
if (args.has('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    current = '';
  }
  if (current !== text) {
    process.stderr.write('build-definitions: definitions.ts is stale; run the script\n');
    process.exit(1);
  }
  process.stderr.write('build-definitions: definitions.ts is current\n');
} else {
  writeFileSync(OUT, text);
  process.stderr.write(`build-definitions: wrote ${OUT} (${PRESET_IDS.length} presets)\n`);
}
