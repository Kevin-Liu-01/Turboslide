// The logo sanitizer (docs/FEATURES.md 4.7; audit-logos 2, 6.2; judge-design rejection 15): an
// allowlist parser over the SVG a logo source answers, so the file the picker draws, the store
// caches and the deck keeps as `sourceFile` holds shapes, gradients, clip paths, masks, patterns and
// the listed filter primitives and nothing else. A small strict XML reader (no DOM library: the
// function has no browser and jsdom is not on the studio's server graph) builds the tree; the
// walk keeps the listed elements and attributes, drops every `on*` attribute, every `href` that
// does not start with `#`, every `url(` that is not `url(#<id>)`, a `style` attribute or element
// that imports or reaches out, `script`, `foreignObject`, `image`, `a`, `iframe`, `text`, the
// animation elements and every element off the list, and records the drop. When a dropped element
// draws (text, an image, a primitive off the list, a subtree with shapes in it) the variant's look
// changed, so `draws` is true and the caller marks the variant unavailable (4.7). A `viewBox` is
// added from `width` and `height` when absent; a file over the cap is refused before parsing with
// the sentence naming the cap; a file that does not parse answers "This logo's file is broken on
// thesvg.org". The mono tint (4.4) rewrites every fill and stroke over the same tree, and the
// attribution `<desc>` of 4.2 is written into a cached file. Pure over strings; logos.test.ts pins
// each rule with a fixture.
import { LOGO_SOURCE, LOGO_WORDS } from '@turboslide/chrome/logo-model';

/** The most bytes the picker reads of one mark (the largest sampled mark is 98,661 bytes). */
export const LOGO_MAX_BYTES = 256 * 1024;

/** The elements kept, SVG's case (4.7). */
export const KEPT_ELEMENTS: ReadonlySet<string> = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'defs',
  'clipPath',
  'mask',
  'linearGradient',
  'radialGradient',
  'stop',
  'title',
  'desc',
  'use',
  'symbol',
  'style',
  'pattern',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feFlood',
  'feGaussianBlur',
  'feMerge',
  'feMergeNode',
  'feOffset',
  'feFuncR',
  'feFuncG',
  'feFuncB',
  'feFuncA',
]);

/** The elements whose drop changes the look (4.7), beside a subtree that holds a shape. */
const DRAWING_DROPS: ReadonlySet<string> = new Set([
  'text',
  'tspan',
  'textPath',
  'image',
  'foreignObject',
  'marker',
  'switch',
]);

/** The elements whose drop changes nothing drawn: metadata, links, scripts, media, animation, an editor's namespaces. */
const SILENT_DROPS: ReadonlySet<string> = new Set([
  'metadata',
  'script',
  'a',
  'iframe',
  'video',
  'audio',
  'set',
  'view',
  'cursor',
  'font',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'glyph',
  'missing-glyph',
  'hkern',
  'vkern',
  'mpath',
  'discard',
]);

/** The shapes: a dropped subtree that holds one changed the look. */
const SHAPES: ReadonlySet<string> = new Set([
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'use',
  'image',
  'text',
  'tspan',
  'textPath',
  'foreignObject',
]);

/** The attributes kept on any element (4.7): the geometry, the presentation attributes, the units, the primitive attributes, the ids and the declarations. */
export const KEPT_ATTRIBUTES: ReadonlySet<string> = new Set([
  'id',
  'class',
  'style',
  'role',
  'xml:space',
  'xmlns',
  'version',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'fx',
  'fy',
  'fr',
  'width',
  'height',
  'd',
  'points',
  'pathLength',
  'transform',
  'gradientTransform',
  'patternTransform',
  'gradientUnits',
  'patternUnits',
  'patternContentUnits',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
  'filterUnits',
  'primitiveUnits',
  'spreadMethod',
  'viewBox',
  'preserveAspectRatio',
  'offset',
  'stop-color',
  'stop-opacity',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'clip-path',
  'clip-rule',
  'mask',
  'filter',
  'color',
  'display',
  'visibility',
  'overflow',
  'vector-effect',
  'shape-rendering',
  'paint-order',
  'mix-blend-mode',
  'isolation',
  'color-interpolation',
  'color-interpolation-filters',
  'enable-background',
  'href',
  'xlink:href',
  'result',
  'in',
  'in2',
  'mode',
  'type',
  'values',
  'tableValues',
  'slope',
  'intercept',
  'amplitude',
  'exponent',
  'k1',
  'k2',
  'k3',
  'k4',
  'operator',
  'flood-color',
  'flood-opacity',
  'stdDeviation',
  'edgeMode',
  'dx',
  'dy',
]);

/** A file that does not parse (4.7): the sentence is the seller's. */
export class LogoBrokenError extends Error {
  readonly status = 422;
  constructor(detail?: string) {
    super(LOGO_WORDS.broken);
    this.name = 'LogoBrokenError';
    if (detail !== undefined) this.detail = detail;
  }
  detail?: string;
}

/** A file over the cap, refused before parsing (4.7). */
export class LogoTooLargeError extends Error {
  readonly status = 413;
  constructor(bytes: number) {
    super(LOGO_WORDS.tooLarge(LOGO_MAX_BYTES));
    this.name = 'LogoTooLargeError';
    this.bytes = bytes;
  }
  readonly bytes: number;
}

// ---------------------------------------------------------------------------------------------
// The tree

export type SvgElement = {
  kind: 'element';
  name: string;
  attributes: [string, string][];
  children: SvgNode[];
};
export type SvgText = { kind: 'text'; text: string };
export type SvgNode = SvgElement | SvgText;

const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[A-Za-z0-9_:.-]/;

/** Decodes the five predefined entities and the numeric forms; a bare `&` or an unknown entity is a broken file. */
function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    const amp = text.indexOf('&', i);
    if (amp === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, amp);
    const semi = text.indexOf(';', amp + 1);
    if (semi === -1 || semi - amp > 34) throw new LogoBrokenError('xmlParseEntityRef: no name');
    const body = text.slice(amp + 1, semi);
    if (/^#x[0-9a-fA-F]+$/.test(body))
      out += String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    else if (/^#[0-9]+$/.test(body))
      out += String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    else {
      switch (body) {
        case 'amp':
          out += '&';
          break;
        case 'lt':
          out += '<';
          break;
        case 'gt':
          out += '>';
          break;
        case 'quot':
          out += '"';
          break;
        case 'apos':
          out += "'";
          break;
        default:
          throw new LogoBrokenError(`xmlParseEntityRef: ${body}`);
      }
    }
    i = semi + 1;
  }
  return out;
}

/**
 * Reads one XML document into a tree: the declaration, comments, processing instructions and a
 * plain DOCTYPE are skipped, a DOCTYPE with an internal subset (an entity declaration) is refused,
 * CDATA becomes text, an unclosed or mismatched element is refused. Strict where SVG files are
 * regular and tolerant nowhere an attack could hide.
 */
export function parseSvg(text: string): SvgElement {
  let i = 0;
  const n = text.length;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  const stack: SvgElement[] = [];
  let root: SvgElement | null = null;
  const fail = (why: string): never => {
    throw new LogoBrokenError(`${why} at ${i}`);
  };
  const appendText = (raw: string): void => {
    const top = stack[stack.length - 1];
    if (top === undefined) {
      if (raw.trim() !== '') fail('text outside the root');
      return;
    }
    top.children.push({ kind: 'text', text: raw });
  };
  while (i < n) {
    if (text[i] !== '<') {
      const next = text.indexOf('<', i);
      const end = next === -1 ? n : next;
      const raw = text.slice(i, end);
      if (raw.trim() !== '' || stack.length > 0) appendText(decodeEntities(raw));
      i = end;
      continue;
    }
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end === -1) fail('an unterminated comment');
      i = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      if (end === -1) fail('an unterminated CDATA section');
      appendText(text.slice(i + 9, end));
      i = end + 3;
      continue;
    }
    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end === -1) fail('an unterminated processing instruction');
      i = end + 2;
      continue;
    }
    if (text.startsWith('<!', i)) {
      // a DOCTYPE: plain ones are skipped, an internal subset is refused (an entity is the XXE vector)
      const end = text.indexOf('>', i + 2);
      if (end === -1) fail('an unterminated declaration');
      const head = text.slice(i, end + 1);
      if (head.includes('[') || /<!ENTITY/i.test(head)) fail('a DOCTYPE with an internal subset');
      if (!/^<!DOCTYPE/i.test(head)) fail('an unknown declaration');
      i = end + 1;
      continue;
    }
    if (text.startsWith('</', i)) {
      const end = text.indexOf('>', i + 2);
      if (end === -1) fail('an unterminated close tag');
      const name = text.slice(i + 2, end).trim();
      const top = stack.pop();
      if (top === undefined || top.name !== name) fail(`a close tag </${name}> with no open tag`);
      i = end + 1;
      if (stack.length === 0) {
        // anything after the root but whitespace and comments is a broken file
        const rest = text.slice(i);
        if (rest.replace(/<!--[\s\S]*?-->/g, '').trim() !== '') fail('content after the root');
        break;
      }
      continue;
    }
    // an open tag
    i += 1;
    if (i >= n || !NAME_START.test(text[i] as string)) fail('a tag with no name');
    let j = i;
    while (j < n && NAME_CHAR.test(text[j] as string)) j += 1;
    const name = text.slice(i, j);
    i = j;
    const attributes: [string, string][] = [];
    let selfClosing = false;
    for (;;) {
      while (i < n && /\s/.test(text[i] as string)) i += 1;
      if (i >= n) fail('an unterminated open tag');
      const c = text[i] as string;
      if (c === '>') {
        i += 1;
        break;
      }
      if (c === '/') {
        if (text[i + 1] !== '>') fail('a stray slash in a tag');
        selfClosing = true;
        i += 2;
        break;
      }
      if (!NAME_START.test(c)) fail(`an unexpected character ${JSON.stringify(c)} in a tag`);
      let k = i;
      while (k < n && NAME_CHAR.test(text[k] as string)) k += 1;
      const attribute = text.slice(i, k);
      i = k;
      while (i < n && /\s/.test(text[i] as string)) i += 1;
      if (text[i] !== '=') fail(`the attribute ${attribute} has no value`);
      i += 1;
      while (i < n && /\s/.test(text[i] as string)) i += 1;
      const quote = text[i] as string;
      if (quote !== '"' && quote !== "'") fail(`the attribute ${attribute} is not quoted`);
      const close = text.indexOf(quote, i + 1);
      if (close === -1) fail(`the attribute ${attribute} is not closed`);
      const value = decodeEntities(text.slice(i + 1, close));
      if (attributes.some(([existing]) => existing === attribute))
        fail(`the attribute ${attribute} is repeated`);
      attributes.push([attribute, value]);
      i = close + 1;
    }
    const element: SvgElement = { kind: 'element', name, attributes, children: [] };
    if (stack.length === 0) {
      if (root !== null) fail('a second root');
      root = element;
    } else (stack[stack.length - 1] as SvgElement).children.push(element);
    if (!selfClosing) stack.push(element);
    else if (stack.length === 0) {
      const rest = text.slice(i);
      if (rest.replace(/<!--[\s\S]*?-->/g, '').trim() !== '') fail('content after the root');
      break;
    }
  }
  if (stack.length > 0)
    fail(`the element <${(stack[stack.length - 1] as SvgElement).name}> is not closed`);
  if (root === null) throw new LogoBrokenError('no root element');
  return root;
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
  return escapeText(text).replace(/"/g, '&quot;');
}

/** The tree as SVG text, one line where the source had none. */
export function serializeSvg(node: SvgNode): string {
  if (node.kind === 'text') return escapeText(node.text);
  const attributes = node.attributes
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
  if (node.children.length === 0) return `<${node.name}${attributes}/>`;
  return `<${node.name}${attributes}>${node.children.map(serializeSvg).join('')}</${node.name}>`;
}

// ---------------------------------------------------------------------------------------------
// The walk (4.7)

/** Every `url(` in a value is `url(#<id>)`, quotes and spaces allowed; false for any other form. */
export function urlsAreLocal(value: string): boolean {
  const pattern = /url\(\s*(['"]?)\s*([^)'"]*)\s*\1\s*\)/gi;
  let match: RegExpExecArray | null;
  let seen = false;
  const lower = value.toLowerCase();
  while ((match = pattern.exec(value)) !== null) {
    seen = true;
    if (!(match[2] ?? '').trim().startsWith('#')) return false;
  }
  // a `url(` the pattern did not read as a call (an unbalanced one) is refused too
  const calls = (lower.match(/url\(/g) ?? []).length;
  if (calls > 0 && !seen) return false;
  return true;
}

/** A style value that imports, reaches out or runs anything. */
function styleReachesOut(value: string): boolean {
  const lower = value.toLowerCase();
  if (lower.includes('@import') || lower.includes('expression(') || lower.includes('javascript:'))
    return true;
  if (lower.includes('behavior:') || lower.includes('-moz-binding')) return true;
  return !urlsAreLocal(value);
}

function elementDraws(element: SvgElement): boolean {
  if (DRAWING_DROPS.has(element.name)) return true;
  if (element.name.startsWith('fe')) return true;
  const stack = [...element.children];
  while (stack.length > 0) {
    const node = stack.pop() as SvgNode;
    if (node.kind !== 'element') continue;
    if (SHAPES.has(node.name) || DRAWING_DROPS.has(node.name)) return true;
    stack.push(...node.children);
  }
  return false;
}

export type SanitizedSvg = {
  /** the sanitized file as text, `<svg` first */
  svg: string;
  /** the names of the elements dropped, once each, in document order */
  removed: string[];
  /** true when a drop changed the look, so the variant is unavailable (4.7) */
  draws: boolean;
  /** the intrinsic aspect from the viewBox, else width and height; [w, h] in user units */
  size: [number, number];
  /** the sanitized bytes' length */
  bytes: number;
};

function parseLength(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = /^\s*([0-9]*\.?[0-9]+)\s*(px|pt|em|rem|%|mm|cm|in)?\s*$/.exec(value);
  if (match === null) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function attributeOf(element: SvgElement, name: string): string | undefined {
  return element.attributes.find(([key]) => key === name)?.[1];
}

function setAttribute(element: SvgElement, name: string, value: string): void {
  const entry = element.attributes.find(([key]) => key === name);
  if (entry !== undefined) entry[1] = value;
  else element.attributes.push([name, value]);
}

/** The viewBox as four numbers, or null. */
export function viewBoxOf(element: SvgElement): [number, number, number, number] | null {
  const raw = attributeOf(element, 'viewBox');
  if (raw === undefined) return null;
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return null;
  const [x, y, w, h] = parts as [number, number, number, number];
  if (w <= 0 || h <= 0) return null;
  return [x, y, w, h];
}

function keepAttribute(name: string, value: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('on')) return false;
  if (name.startsWith('xmlns:')) return true;
  if (name.startsWith('aria-')) return true;
  if (!KEPT_ATTRIBUTES.has(name)) return false;
  if (name === 'href' || name === 'xlink:href') return value.trim().startsWith('#');
  if (name === 'style') return !styleReachesOut(value);
  return urlsAreLocal(value);
}

/**
 * The allowlist walk over a parsed tree: kept elements keep their kept attributes and their
 * children; every other element leaves with its subtree and is recorded; a `<style>` whose text
 * imports or reaches out leaves too (its rules drew colours, so it counts as a draw); text stays
 * only inside `title`, `desc` and `style`.
 */
export function sanitizeTree(root: SvgElement): {
  root: SvgElement;
  removed: string[];
  draws: boolean;
} {
  if (root.name !== 'svg') throw new LogoBrokenError(`the root is <${root.name}>, not <svg>`);
  const removed: string[] = [];
  let draws = false;
  const note = (name: string, drew: boolean): void => {
    if (!removed.includes(name)) removed.push(name);
    if (drew) draws = true;
  };
  const walk = (element: SvgElement): SvgElement => {
    const attributes = element.attributes.filter(([name, value]) => keepAttribute(name, value));
    const children: SvgNode[] = [];
    for (const child of element.children) {
      if (child.kind === 'text') {
        if (element.name === 'title' || element.name === 'desc') children.push(child);
        else if (element.name === 'style') children.push(child);
        continue;
      }
      if (!KEPT_ELEMENTS.has(child.name)) {
        note(child.name, !SILENT_DROPS.has(child.name) && elementDraws(child));
        continue;
      }
      if (child.name === 'svg') {
        // a nested svg is not on the list as a child; it draws its subtree
        note('svg', elementDraws(child));
        continue;
      }
      if (child.name === 'style') {
        const text = child.children.map((c) => (c.kind === 'text' ? c.text : '')).join('');
        if (styleReachesOut(text)) {
          note('style', true);
          continue;
        }
      }
      children.push(walk(child));
    }
    return { kind: 'element', name: element.name, attributes, children };
  };
  const clean = walk(root);
  if (attributeOf(clean, 'xmlns') === undefined)
    clean.attributes.unshift(['xmlns', 'http://www.w3.org/2000/svg']);
  return { root: clean, removed, draws };
}

/**
 * Sanitizes one logo file (4.7): the cap before parsing, the parse, the walk, the viewBox from
 * width and height when absent, the size. Throws LogoTooLargeError or LogoBrokenError.
 */
export function sanitizeLogoSvg(input: Uint8Array | string): SanitizedSvg {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength > LOGO_MAX_BYTES) throw new LogoTooLargeError(bytes.byteLength);
  const text = typeof input === 'string' ? input : new TextDecoder('utf-8').decode(bytes);
  if (
    !/^\uFEFF?\s*(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(
      text,
    )
  )
    throw new LogoBrokenError('not an svg document');
  const parsed = parseSvg(text);
  const { root, removed, draws } = sanitizeTree(parsed);
  let viewBox = viewBoxOf(root);
  if (viewBox === null) {
    const w = parseLength(attributeOf(root, 'width'));
    const h = parseLength(attributeOf(root, 'height'));
    if (w === null || h === null) throw new LogoBrokenError('no viewBox and no width and height');
    viewBox = [0, 0, w, h];
    setAttribute(root, 'viewBox', `0 0 ${w} ${h}`);
  }
  const svg = serializeSvg(root);
  return {
    svg,
    removed,
    draws,
    size: [viewBox[2], viewBox[3]],
    bytes: new TextEncoder().encode(svg).byteLength,
  };
}

// ---------------------------------------------------------------------------------------------
// The mono tint (4.4) and the attribution (4.2)

const PAINT_NONE = /^\s*(none|transparent)\s*$/i;

function tintDeclarations(css: string, colour: string): string {
  return css.replace(
    /(fill|stroke)\s*:\s*([^;}"']+)/gi,
    (whole, property: string, value: string) =>
      PAINT_NONE.test(value) || /url\(/i.test(value) ? whole : `${property}:${colour}`,
  );
}

/**
 * Writes the kit's text colour into every fill and stroke of a sanitized mono mark (4.4;
 * judge-design addition 13): every `fill` and `stroke` attribute that is not `none`, every `fill:`
 * and `stroke:` declaration in `style` attributes and `<style>` rules, `currentColor` included,
 * and a `fill` on the root so a shape that inherits draws in the colour too. A paint that
 * references a gradient or a pattern is left as it is (such a file is not offered as Mono).
 */
export function tintLogoSvg(svg: string, colour: string): string {
  const root = parseSvg(svg);
  const walk = (element: SvgElement): void => {
    for (const entry of element.attributes) {
      const [name, value] = entry;
      if (
        (name === 'fill' || name === 'stroke') &&
        !PAINT_NONE.test(value) &&
        !/url\(/i.test(value)
      )
        entry[1] = colour;
      else if (name === 'color') entry[1] = colour;
      else if (name === 'style') entry[1] = tintDeclarations(value, colour);
    }
    for (const child of element.children) {
      if (child.kind === 'element') {
        if (child.name === 'style') {
          for (const text of child.children)
            if (text.kind === 'text') text.text = tintDeclarations(text.text, colour);
        } else walk(child);
      }
    }
  };
  walk(root);
  if (attributeOf(root, 'fill') === undefined) root.attributes.push(['fill', colour]);
  if (attributeOf(root, 'color') === undefined) root.attributes.push(['color', colour]);
  return serializeSvg(root);
}

/** The attribution sentence a cached file carries as its `<desc>` (4.2). */
export function attributionOf(title: string, license: string): string {
  return `${title} logo, from ${LOGO_SOURCE} under ${license.trim() === '' ? 'no recorded licence' : license.trim()}; the mark belongs to its owner`;
}

/** Writes the attribution `<desc>` as the root's first child, replacing an existing desc. */
export function withAttribution(svg: string, title: string, license: string): string {
  const root = parseSvg(svg);
  root.children = root.children.filter(
    (child) => child.kind !== 'element' || child.name !== 'desc',
  );
  root.children.unshift({
    kind: 'element',
    name: 'desc',
    attributes: [],
    children: [{ kind: 'text', text: attributionOf(title, license) }],
  });
  return serializeSvg(root);
}

/** The `<desc>` text of a file, or null. */
export function descOf(svg: string): string | null {
  const root = parseSvg(svg);
  const desc = root.children.find(
    (child): child is SvgElement => child.kind === 'element' && child.name === 'desc',
  );
  if (desc === undefined) return null;
  return desc.children.map((c) => (c.kind === 'text' ? c.text : '')).join('');
}

/** True when the bytes look like an SVG document: the root tag after the prologue. */
export function sniffSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 4096));
  return /^\uFEFF?\s*(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(
    head,
  );
}
