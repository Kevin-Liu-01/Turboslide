import { describe, expect, it } from 'vitest';

import { FIXTURE_MARKS } from './logo-fixtures/marks';
import {
  KEPT_ATTRIBUTES,
  KEPT_ELEMENTS,
  LogoBrokenError,
  LogoTooLargeError,
  parseSvg,
  sanitizeLogoSvg,
} from './logo-sanitize';
import type { SvgElement, SvgNode } from './logo-sanitize';

// The logo sanitizer's fuzz harness (docs/hardening/HARDENING.md HR-N#2, RUST-5). The sanitizer
// reads untrusted SVG with its own XML reader (logos from thesvg.org, uploads under the 2 MB cap),
// and logos.test.ts pins its rules with hand written fixtures. Here a seeded generator mutates the
// fixture marks and a few hostile files: elements off the list, attributes and their case,
// entities, CDATA, comments, namespaces and prefixes, `url(` and `href` forms with CSS escapes,
// declarations and processing instructions, deep nesting, and byte noise. Every case either is
// refused with the sanitizer's own two errors, or its output, read again by the same reader:
//
// - parses, and every character is one XML allows, so a browser reads the same tree;
// - holds only listed elements (an `image` only with a raster data URI) under an `svg` root;
// - holds only listed attributes (plus `xmlns:` and `aria-`), never an `on` handler;
// - every `href` is `#id` (or the raster data URI of an `image`);
// - every CSS value, read with its escapes decoded, loads nothing: `url(#id)` only, no
//   `@import`, no string in `image-set(`, `image(`, `cross-fade(` or `src(`, no script forms;
// - words sit only in `title`, `desc`, `style` and the text elements;
// - sanitizing the output again gives the same output.
//
// The case of seed s and index i is replayed by `mutate(seedTexts, rngOf(s, i))`. The run records
// the CPU time per sanitize call (process.cpuUsage) for section 6.1's verdict; docs/native.md
// keeps the reading with its load.

/** The recorded seeds: 8 seeds of 2,500 cases, 20,000 cases a run. */
const SEEDS = [
  0x5eed0001, 0x5eed0002, 0x5eed0003, 0x5eed0004, 0x5eed0005, 0x5eed0006, 0x5eed0007, 0x5eed0008,
];
const CASES_PER_SEED = 2_500;

/** The upload's cap, the larger of the two the sanitizer runs under. */
const MAX_BYTES = 2 * 1024 * 1024;

type Rng = () => number;

/** mulberry32: a small seeded generator, the same sequence on every machine. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** The generator of one case, so a failure names the two numbers that replay it. */
function rngOf(seed: number, index: number): Rng {
  return mulberry32(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(index + 1, 0xc2b2ae35));
}

const int = (rng: Rng, n: number): number => Math.floor(rng() * n);
const pick = <T>(rng: Rng, list: readonly T[]): T => list[int(rng, list.length)] as T;

const ROOT_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';

/** Hostile files the mutations start from, beside the fixture marks. */
const HOSTILE_SEEDS = [
  `${ROOT_OPEN}<defs><linearGradient id="a"><stop offset="0" stop-color="#000"/></linearGradient></defs><path d="M0 0h8v8z" fill="url(#a)"/><style>path{fill:#111}</style><text x="1" y="20">Acme</text></svg>`,
  `<?xml version="1.0" encoding="UTF-8"?><!-- a comment --><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24" height="24"><symbol id="s"><circle r="4"/></symbol><use xlink:href="#s" x="4" y="4"/><image width="2" height="2" href="data:image/png;base64,iVBORw0KGgo="/></svg>`,
  `${ROOT_OPEN}<title>A &amp; B</title><desc><![CDATA[a <b> c]]></desc><g clip-path="url(#c)"><clipPath id="c"><rect width="4" height="4"/></clipPath><path d="M1 1h2v2z"/></g><filter id="f"><feGaussianBlur stdDeviation="1"/></filter><text><textPath href="#p">Arc</textPath></text></svg>`,
];

const HOSTILE_ELEMENTS = [
  '<script>alert(1)</script>',
  '<script href="https://evil.example/x.js"/>',
  '<foreignObject width="9" height="9"><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></div></foreignObject>',
  '<a href="javascript:alert(1)"><path d="M0 0h1v1z"/></a>',
  '<image href="https://evil.example/x.png" width="4" height="4"/>',
  '<image href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+" width="4" height="4"/>',
  '<image xlink:href="data:image/png;base64,iVBORw0KGgo=" width="4" height="4"/>',
  '<image href=" data:image/gif;base64,R0lGODlh" width="4" height="4"/>',
  '<animate attributeName="href" values="javascript:alert(1)"/>',
  '<set attributeName="onload" to="alert(1)"/>',
  '<iframe src="https://evil.example"/>',
  '<use href="https://evil.example/defs.svg#a"/>',
  '<use xlink:href="//evil.example/defs.svg#a"/>',
  '<use href="#a"/>',
  '<feImage href="https://evil.example/x.png"/>',
  '<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>',
  '<svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script>',
  '<html:script xmlns:html="http://www.w3.org/1999/xhtml">alert(1)</html:script>',
  '<textPath href="https://evil.example/p.svg#a">x</textPath>',
  '<marker id="m"><path d="M0 0h1v1z"/></marker>',
  '<pattern id="p" width="2" height="2"><image href="https://evil.example/x.png"/></pattern>',
  '<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata>',
  '<switch><foreignObject/><path d="M0 0h1v1z"/></switch>',
  '<title>t</title>',
  '<g><path d="M0 0h1v1z"/></g>',
];

const CSS_PAYLOADS = [
  '@import url(https://evil.example/a.css);',
  '@import "https://evil.example/a.css";',
  '@\\69mport "https://evil.example/a.css";',
  '@\\69 mport "https://evil.example/a.css";',
  '@IMPORT url(x.css);',
  'path{fill:url(https://evil.example/x#a)}',
  'path{fill:u\\72l(https://evil.example/x#a)}',
  'path{fill:\\75rl(https://evil.example/x#a)}',
  'path{fill:URL( "https://evil.example/x" )}',
  'path{fill:url(#a)}',
  "path{fill:url('#a')}",
  'svg{background:image-set("https://evil.example/x.png" 1x)}',
  'svg{background:-webkit-image-set("https://evil.example/x.png" 1x)}',
  'svg{background:image("https://evil.example/x.png")}',
  '@font-face{font-family:x;src:url(https://evil.example/f.woff)}',
  '.a{behavior:url(x.htc)}',
  '.a{-moz-binding:url(x.xml#b)}',
  '.a{width:expression(alert(1))}',
  'path{fill:#c8102e;stroke:none}',
  '</style><script>alert(1)</script><style>',
  'a{b:c}/* url(https://evil.example/x) */',
];

const ATTRIBUTE_NAMES = [
  'onload',
  'ONLOAD',
  'onLoad',
  'onclick',
  'onbegin',
  'href',
  'Href',
  'xlink:href',
  'XLINK:HREF',
  'style',
  'fill',
  'stroke',
  'filter',
  'clip-path',
  'mask',
  'marker-end',
  'cursor',
  'src',
  'xml:base',
  'xlink:actuate',
  'xlink:show',
  'attributeName',
  'values',
  'from',
  'to',
  'begin',
  'requiredExtensions',
  'externalResourcesRequired',
  'xmlns',
  'xmlns:xlink',
  'xmlns:x',
  'aria-label',
  'data-x',
  'class',
  'id',
  'font-family',
  'color',
  'display',
  'transform',
];

const ATTRIBUTE_VALUES = [
  'javascript:alert(1)',
  ' javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '&#x6A;avascript:alert(1)',
  '&#106;avascript:alert(1)',
  '#a',
  ' #a',
  '\t#a',
  '#a"><script>alert(1)</script>',
  'https://evil.example/a.svg#a',
  '//evil.example/a',
  'data:image/svg+xml;base64,PHN2Zz4=',
  'data:image/png;base64,iVBORw0KGgo=',
  'data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;',
  'url(#a)',
  'url( "#a" )',
  'url(https://evil.example/x)',
  "url('https://evil.example/x')",
  'URL( "https://evil.example/x" )',
  'url(#a) url(https://evil.example/x)',
  'url(',
  'url(#a',
  'u\\72l(https://evil.example/x)',
  'u\\rl(https://evil.example/x)',
  '\\75 rl(https://evil.example/x)',
  '&#117;rl(https://evil.example/x)',
  'image-set("https://evil.example/x.png" 1x)',
  'fill:url(https://evil.example/x)',
  'fill:u\\72l(https://evil.example/x)',
  'fill:red;background:url(//evil.example/x)',
  'fill:red;background:image-set("https://evil.example/x.png" 1x)',
  '@import "https://evil.example/x.css"',
  'expression(alert(1))',
  'behavior:url(x.htc)',
  '-moz-binding:url(x.xml#b)',
  'red',
  '#123456',
  'none',
  '0 0 10 10',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/2000/svg',
  'alert(1)',
];

const ENTITIES = [
  '&amp;',
  '&lt;',
  '&gt;',
  '&quot;',
  '&apos;',
  '&#60;',
  '&#x3C;',
  '&#0;',
  '&#x0;',
  '&#xD800;',
  '&#xDFFF;',
  '&#xFFFE;',
  '&#xFFFF;',
  '&#x10FFFF;',
  '&#x110000;',
  '&#99999999;',
  '&#x7FFFFFFF;',
  '&#1;',
  '&#x1F600;',
  '&bogus;',
  '&',
  '&#;',
  '&#x;',
];

const COMMENTS = [
  '<!-- a comment -->',
  '<!-- <script>alert(1)</script> -->',
  '<!---->',
  '<!-- -- -->',
  '<!--',
  '-->',
  '<!-- url(https://evil.example/x) -->',
];

const CDATA_PAYLOADS = [
  '<script>alert(1)</script>',
  ']]>',
  '@import url(https://evil.example/a.css);',
  'path{fill:url(#a)}',
  'a & b < c',
];

const PROLOGS = [
  '<?xml version="1.0"?>',
  '<?xml-stylesheet href="https://evil.example/x.css" type="text/css"?>',
  '<!DOCTYPE svg>',
  '<!DOCTYPE svg SYSTEM "https://evil.example/x.dtd">',
  '<!DOCTYPE svg [<!ENTITY a "b">]>',
  '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
  '<!ELEMENT svg ANY>',
  '\uFEFF',
  '   ',
];

const ELEMENT_PREFIXES = ['svg:', 'html:', 'x:', 'SVG:'];
const NOISE = ['<', '>', '"', "'", '&', '/', '=', '!', '-', '[', ']', '?', ' ', '\u0000', '\uFFFE'];
const DEPTHS = [1, 3, 20, 255, 256, 257, 400, 2_000, 20_000];

/** The offsets just after a `>`: places where an element or text can go between tags. */
function boundaries(text: string): number[] {
  const out: number[] = [];
  for (let i = text.indexOf('>'); i !== -1; i = text.indexOf('>', i + 1)) out.push(i + 1);
  return out.length > 0 ? out : [text.length];
}

/** The offsets just after an open tag's name, where an attribute can go. */
function tagNameEnds(text: string): number[] {
  const out: number[] = [];
  for (const match of text.matchAll(/<([A-Za-z_:][A-Za-z0-9_:.-]*)/g))
    out.push((match.index ?? 0) + match[0].length);
  return out;
}

const insertAt = (text: string, at: number, piece: string): string =>
  text.slice(0, at) + piece + text.slice(at);

/** A numeric character reference of one character, decimal or hex, sometimes zero padded. */
function entityOf(rng: Rng, ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  const pad = '0'.repeat(int(rng, 3));
  return rng() < 0.5 ? `&#${pad}${code};` : `&#x${pad}${code.toString(16)};`;
}

/** The value with some of its characters written as character references. */
function encodeSome(rng: Rng, value: string): string {
  return [...value]
    .map((ch) => (/[A-Za-z:(]/.test(ch) && rng() < 0.3 ? entityOf(rng, ch) : ch))
    .join('');
}

const MUTATIONS: ReadonlyArray<(text: string, rng: Rng) => string> = [
  // an element off the list (or on it) between two tags
  (text, rng) => insertAt(text, pick(rng, boundaries(text)), pick(rng, HOSTILE_ELEMENTS)),
  // an attribute on an open tag, its value quoted either way and sometimes entity encoded
  (text, rng) => {
    const ends = tagNameEnds(text);
    if (ends.length === 0) return text;
    const quote = rng() < 0.8 ? '"' : "'";
    let value = pick(rng, ATTRIBUTE_VALUES).replaceAll(quote, quote === '"' ? '&quot;' : '&apos;');
    if (rng() < 0.3) value = encodeSome(rng, value);
    return insertAt(
      text,
      pick(rng, ends),
      ` ${pick(rng, ATTRIBUTE_NAMES)}=${quote}${value}${quote}`,
    );
  },
  // a style element, its text sometimes in CDATA
  (text, rng) => {
    const css = pick(rng, CSS_PAYLOADS);
    const body = rng() < 0.3 ? `<![CDATA[${css}]]>` : css.replaceAll('<', '&lt;');
    return insertAt(text, pick(rng, boundaries(text)), `<style>${body}</style>`);
  },
  // an entity anywhere: in text, in a value, in a name, between tags
  (text, rng) => insertAt(text, int(rng, text.length + 1), pick(rng, ENTITIES)),
  // a CDATA section between tags or inside a text element
  (text, rng) =>
    insertAt(text, pick(rng, boundaries(text)), `<![CDATA[${pick(rng, CDATA_PAYLOADS)}]]>`),
  // a comment between tags or at any offset
  (text, rng) =>
    insertAt(
      text,
      rng() < 0.7 ? pick(rng, boundaries(text)) : int(rng, text.length + 1),
      pick(rng, COMMENTS),
    ),
  // a declaration or processing instruction before the root
  (text, rng) => pick(rng, PROLOGS) + text,
  // a prefix on an element's name (the close tag keeps its old name half the time)
  (text, rng) => {
    const ends = tagNameEnds(text);
    if (ends.length === 0) return text;
    const end = pick(rng, ends);
    const start = text.lastIndexOf('<', end) + 1;
    const name = text.slice(start, end);
    const prefixed = `${pick(rng, ELEMENT_PREFIXES)}${name.replace(/^[^:]*:/, '')}`;
    let out = text.slice(0, start) + prefixed + text.slice(end);
    if (rng() < 0.5) out = out.replace(`</${name}>`, `</${prefixed}>`);
    return out;
  },
  // nesting: the root's content wrapped in groups, sometimes deeper than a parser allows
  (text, rng) => {
    const open = text.indexOf('>', text.search(/<svg[\s>]/i));
    const close = text.lastIndexOf('</');
    if (open === -1 || close <= open) return text;
    const depth = pick(rng, DEPTHS);
    return (
      text.slice(0, open + 1) +
      '<g>'.repeat(depth) +
      text.slice(open + 1, close) +
      '</g>'.repeat(depth) +
      text.slice(close)
    );
  },
  // a slice between two boundaries copied to a third
  (text, rng) => {
    const marks = boundaries(text);
    const a = pick(rng, marks);
    const b = pick(rng, marks);
    const [from, to] = a < b ? [a, b] : [b, a];
    return insertAt(text, pick(rng, marks), text.slice(from, Math.min(to, from + 4_000)));
  },
  // byte noise: a character removed or a markup character inserted
  (text, rng) => {
    const at = int(rng, text.length);
    return rng() < 0.5
      ? text.slice(0, at) + text.slice(at + 1)
      : insertAt(text, at, pick(rng, NOISE));
  },
  // a name's case flipped, so a lower case rule meets an upper case name
  (text, rng) => {
    const ends = tagNameEnds(text);
    if (ends.length === 0) return text;
    const end = pick(rng, ends);
    const start = text.lastIndexOf('<', end) + 1;
    return text.slice(0, start) + text.slice(start, end).toUpperCase() + text.slice(end);
  },
];

/** One case: a seed file with one to four mutations. */
function mutate(seedTexts: readonly string[], rng: Rng): string {
  let text = pick(rng, seedTexts);
  const count = 1 + int(rng, 4);
  for (let i = 0; i < count; i += 1) text = pick(rng, MUTATIONS)(text, rng);
  return text;
}

// ---------------------------------------------------------------------------------------------
// The oracle, written apart from the sanitizer's own helpers

/** True for every code point XML 1.0 allows in a document (production 2, Char). */
function isXmlChar(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/** A CSS value with its escapes decoded (CSS Syntax 4.3.7), lower cased. */
function cssUnescaped(value: string): string {
  return value
    .replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?|\\([\s\S])/g, (_m, hex: string, ch: string) => {
      if (hex === undefined) return ch === '\n' ? '' : ch;
      const code = Number.parseInt(hex, 16);
      return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
        ? '\uFFFD'
        : String.fromCodePoint(code);
    })
    .toLowerCase();
}

/**
 * Why a CSS value would load or run something, or null. Every CSS value is read for a `url(`
 * that leaves the file; a stylesheet (a `style` attribute or element) also for `@import`, the
 * script forms and a quoted address in the functions that load a string.
 */
function cssReach(value: string, stylesheet: boolean): string | null {
  const css = cssUnescaped(value);
  for (const match of css.matchAll(/url\(\s*(['"]?)\s*([^)'"]*)/g))
    if (!(match[2] ?? '').trim().startsWith('#')) return `url(${match[2] ?? ''}`;
  if (!stylesheet) return null;
  if (css.includes('@import')) return '@import';
  if (/expression\s*\(/.test(css)) return 'expression(';
  if (css.includes('javascript:')) return 'javascript:';
  if (/behavior\s*:/.test(css)) return 'behavior:';
  if (css.includes('-moz-binding')) return '-moz-binding';
  for (const match of css.matchAll(
    /(?<![a-z0-9_-])(?:-webkit-)?(?:image-set|image|cross-fade|src)\(\s*(['"])([^'"]*)/g,
  ))
    if (!(match[2] ?? '').trim().startsWith('#')) return `a string in ${match[0]}`;
  return null;
}

/** The kept attributes a browser never reads as CSS: names, numbers, geometry and references. */
const NOT_CSS = new Set([
  'id',
  'class',
  'role',
  'version',
  'xml:space',
  'xmlns',
  'href',
  'xlink:href',
  'd',
  'points',
  'viewBox',
  'preserveAspectRatio',
  'in',
  'in2',
  'result',
  'type',
  'values',
  'tableValues',
  'mode',
  'operator',
  'method',
  'spacing',
  'side',
  'lengthAdjust',
  'rotate',
]);

const RASTER_DATA = /^\s*data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]*$/i;
const WORD_HOLDERS = new Set(['title', 'desc', 'style', 'text', 'tspan', 'textPath']);

/** Every way the output breaks the invariant; empty when it holds. */
function violations(svg: string): string[] {
  const out: string[] = [];
  for (const ch of svg)
    if (!isXmlChar(ch.codePointAt(0) ?? 0)) {
      out.push(`a character XML does not allow: U+${(ch.codePointAt(0) ?? 0).toString(16)}`);
      break;
    }
  let root: SvgElement;
  try {
    root = parseSvg(svg);
  } catch (error) {
    return [...out, `the output does not parse again: ${String(error)}`];
  }
  if (root.name !== 'svg') out.push(`the root is <${root.name}>`);
  const walk = (element: SvgElement, depth: number): void => {
    const { name } = element;
    if (depth > 0 && name === 'svg') out.push('a nested <svg>');
    if (!KEPT_ELEMENTS.has(name) && name !== 'image') out.push(`the element <${name}>`);
    for (const [attribute, value] of element.attributes) {
      if (/^on/i.test(attribute)) out.push(`the handler ${attribute}`);
      else if (
        !KEPT_ATTRIBUTES.has(attribute) &&
        !attribute.startsWith('xmlns:') &&
        !attribute.startsWith('aria-')
      )
        out.push(`the attribute ${attribute} on <${name}>`);
      if (attribute === 'href' || attribute === 'xlink:href') {
        if (!value.trim().startsWith('#') && !(name === 'image' && RASTER_DATA.test(value)))
          out.push(`the ${attribute} ${JSON.stringify(value.slice(0, 80))} on <${name}>`);
      } else if (
        !NOT_CSS.has(attribute) &&
        !attribute.startsWith('xmlns:') &&
        !attribute.startsWith('aria-')
      ) {
        const reach = cssReach(value, attribute === 'style');
        if (reach !== null) out.push(`${attribute} on <${name}> reaches out: ${reach}`);
      }
    }
    if (name === 'image') {
      const href =
        element.attributes.find(([key]) => key === 'href')?.[1] ??
        element.attributes.find(([key]) => key === 'xlink:href')?.[1];
      if (href === undefined || !RASTER_DATA.test(href))
        out.push('an <image> without a raster data URI');
    }
    for (const child of element.children as SvgNode[]) {
      if (child.kind === 'text') {
        if (!WORD_HOLDERS.has(name) && child.text.trim() !== '')
          out.push(`words in <${name}>: ${JSON.stringify(child.text.slice(0, 40))}`);
        if (name === 'style') {
          const reach = cssReach(child.text, true);
          if (reach !== null) out.push(`a <style> reaches out: ${reach}`);
        }
      } else walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

// ---------------------------------------------------------------------------------------------

type Failure = { seed: string; index: number; why: string[]; input: string };

describe('the logo sanitizer under generated input (HR-N#2)', () => {
  const seedTexts = [...Object.values(FIXTURE_MARKS), ...HOSTILE_SEEDS];

  it('reads the fixtures and the hostile seeds', () => {
    expect(Object.keys(FIXTURE_MARKS).length).toBeGreaterThanOrEqual(20);
    for (const text of seedTexts) expect(violations(sanitizeLogoSvg(text).svg)).toEqual([]);
  });

  it(
    'refuses each of 20,000 cases with its own two errors, or answers a file that keeps the rules',
    { timeout: 1_200_000 },
    () => {
      const failures: Failure[] = [];
      let accepted = 0;
      let refused = 0;
      let cpuMicros = 0;
      let calls = 0;
      for (const seed of SEEDS)
        for (let index = 0; index < CASES_PER_SEED; index += 1) {
          const input = mutate(seedTexts, rngOf(seed, index));
          const fail = (why: string[]): void => {
            if (failures.length < 20)
              failures.push({
                seed: `0x${seed.toString(16)}`,
                index,
                why,
                input: input.slice(0, 400),
              });
          };
          const before = process.cpuUsage();
          let svg: string;
          try {
            svg = sanitizeLogoSvg(input, { maxBytes: MAX_BYTES }).svg;
          } catch (error) {
            if (error instanceof LogoBrokenError || error instanceof LogoTooLargeError) {
              refused += 1;
              continue;
            }
            fail([`threw ${String(error).slice(0, 200)}`]);
            continue;
          } finally {
            const used = process.cpuUsage(before);
            cpuMicros += used.user + used.system;
            calls += 1;
          }
          accepted += 1;
          const why = violations(svg);
          try {
            const again = sanitizeLogoSvg(svg, { maxBytes: MAX_BYTES }).svg;
            if (again !== svg) why.push('a second sanitize changes the output');
          } catch (error) {
            why.push(`a second sanitize refuses the output: ${String(error).slice(0, 200)}`);
          }
          if (why.length > 0) fail(why);
        }
      // the reading for docs/native.md: CPU per sanitize call, over every call of the run
      console.log(
        `logo-sanitize fuzz: ${SEEDS.length * CASES_PER_SEED} cases, ${accepted} answered, ${refused} refused; ` +
          `CPU ${(cpuMicros / 1000).toFixed(0)} ms over ${calls} calls, ${(cpuMicros / calls).toFixed(1)} us per call`,
      );
      expect(failures).toEqual([]);
      expect(accepted).toBeGreaterThan(1_000);
      expect(refused).toBeGreaterThan(1_000);
    },
  );

  it('records the CPU per sanitize of each unmutated fixture', () => {
    const rows: string[] = [];
    let total = 0;
    let bytes = 0;
    const rounds = 50;
    for (const text of Object.values(FIXTURE_MARKS)) {
      sanitizeLogoSvg(text);
      const before = process.cpuUsage();
      for (let i = 0; i < rounds; i += 1) sanitizeLogoSvg(text);
      const used = process.cpuUsage(before);
      total += used.user + used.system;
      bytes += text.length;
      rows.push(String(text.length));
    }
    const count = Object.keys(FIXTURE_MARKS).length;
    console.log(
      `logo-sanitize fixtures: ${count} files, ${bytes} characters in all, ${(total / (count * rounds)).toFixed(1)} us of CPU per sanitize (mean of ${rounds} rounds each)`,
    );
    expect(rows.length).toBe(count);
  });
});
