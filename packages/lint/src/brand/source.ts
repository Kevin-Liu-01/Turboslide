// The thirteen gt-ui rules of P:.oxlintrc.json 38 to 50, ported from
// P:scripts/oxlint-plugins/gt-ui.ts onto the TypeScript compiler's syntax tree (the tree has no
// oxlint; its type aware ESLint runs per package, so the brand lint parses each file alone,
// without types). Each rule keeps its source name, its message and its test of a node. Where the
// source reads a Tailwind class list, the test is kept as written (this tree has no Tailwind, so
// it reads nothing today) and the tree's own form is added beside it: the ToolButton label for
// cta-title-case, the theme sprite for icon-tiers, the rail wrapper classes for single-rail.
//
// ESTree to TypeScript: a Literal is a StringLiteral or a NoSubstitutionTemplateLiteral (a JSX
// attribute's string value included), a TemplateElement is a template head, middle or tail, a
// JSXText is a JsxText, a JSXElement is a JsxElement or a JsxSelfClosingElement, a Property is a
// PropertyAssignment, an ImportExpression is a call on the import keyword. Parentheses and type
// assertions, which ESTree drops, are skipped on every walk.
import ts from 'typescript';

import {
  ALTERNATES_OWNERS,
  BUTTON_ELEMENTS,
  BUTTON_LABEL_PROPS,
  NUMERALS_OWNER,
  RADIUS_VALUES,
  RAIL_WRAPPER_CLASSES,
  SCROLLBAR_OWNERS,
  SOURCE_RULES,
  Z_INDEX,
} from './config.ts';
import type { BrandFinding, BrandRuleId, SourceRuleId } from './config.ts';

const MESSAGES: Record<string, string> = {
  emDash:
    'Copy does not use the em dash; end the sentence or use a comma (DECK-GRAMMAR.md:23, plain technical English).',
  eyebrow:
    'No eyebrow labels: a section head is a heading and one lead paragraph. Drop the uppercase tracked line above it (DECK-GRAMMAR.md:23).',
  trailingPeriod:
    'A heading is a plain line with no trailing period (DECK-GRAMMAR.md:22). Drop the period.',
  titleCase:
    'Button labels are Title Case (DECK-GRAMMAR.md:22): capitalise every word except a short function word after the first.',
  monoVoice:
    'Mono is an instrument voice for code, tokens and numbers; a heading or a paragraph is set in Inter (P:BRAND.md section 6).',
  smoothClass:
    'The product does not smooth-scroll (P:deck/slides/39-avoid.html). Remove scroll-smooth.',
  smoothProperty:
    'The product does not smooth-scroll (P:deck/slides/39-avoid.html). Use behavior "auto" or drop the option.',
  scrollLibrary:
    'The product does not smooth-scroll (P:deck/slides/39-avoid.html); a scroll library is not used. Native scrolling only.',
  gifMark: 'Marks are drawn (an SVG or the canvas); a gif is never a mark or a demo frame.',
  lucide:
    'Glyphs come from the theme sprite (`@turboslide/chrome/icons`, Heroicons 20 solid; AGENTS.md code rules); lucide-react is not drawn in this tree.',
  heroicons:
    'Glyphs come from the theme sprite (`@turboslide/chrome/icons` over sprite-ids.json; AGENTS.md code rules), never from the @heroicons/react package.',
  googleFont: 'Type is Inter only (DECK-GRAMMAR.md:24); next/font/google loads another face.',
  localFontFile: 'localFont loads Inter builds only (DECK-GRAMMAR.md:24).',
  fontClass: 'This class sets a face outside Inter (DECK-GRAMMAR.md:24).',
  fontFamilyStyle:
    'An inline fontFamily stays inside the product type: inherit, a --pt- variable, Inter or the mono stack (DECK-GRAMMAR.md:24).',
  flagClass: 'Flags are not drawn from hand written fi / fi-xx sprite classes.',
  emojiFlag: 'Emoji flags render differently on every platform; they are not used.',
  flagImage: 'Flag images are not used.',
  typedTextVar:
    'Tailwind reads an untyped var() in text-[...] as a colour. Write text-[length:var(--x)] or text-[color:var(--x)].',
  hexUtility: 'A hex colour in a utility bypasses the theme tokens; use a --pt- token.',
  hexValue:
    'A hex colour in a style or class attribute bypasses the theme tokens; use a --pt- token.',
  doubleRail:
    'One rail: the column draws its pair once. A band inside it draws no side rails, and the outer pair 10 px outside it is retired.',
  nestedRail:
    'One rail: a rail wrapper inside another rail wrapper draws the column pair twice. Keep one wrapper per page column.',
  stackedRailPairs:
    'One rail: this element stacks two or more full-height side-border children, which is two rail pairs.',
  inlineRadius:
    'An inline radius outside the radius ladder (docs/DESIGN.md 3.1): 0, 50%, var(--pt-radius-sm), var(--pt-radius) or var(--pt-radius-lg).',
  inlineZIndex:
    'An inline z-index off the stacking scale (docs/DESIGN.md 2.6): a value under 5, var(--ts-layer-<name>), or the Layer primitive (packages/chrome/src/Layer.ts) for a floating surface.',
  inlineShadow:
    'An inline shadow with a blur or an offset (docs/DESIGN.md 3.4): a floating plate draws the --pt-edge frame and --pt-ring (.pt-float, .pt-window).',
  inlineScrollbar:
    'An inline scrollbar style (docs/DESIGN.md 6.5): every scroller draws the one scrollbar of tokens.css; only scrollbarWidth "none" hides a bar.',
  scrollbarText:
    'A ::-webkit-scrollbar or scrollbar-color rule in a style string (docs/DESIGN.md 6.5): the one scrollbar lives in tokens.css.',
  inlineNumerals:
    'Tabular figures written by hand (docs/DESIGN.md 4.5): use the .pt-num class or var(--pt-numerals).',
  inlineAlternates:
    "General Translation's alternates cv11 and ss01 belong to its theme's slides (docs/DESIGN.md 4.2); the chrome draws Inter's defaults.",
};

// ---------------------------------------------------------------------------------------------
// The tests of gt-ui.ts, kept as written (each names its source line in that file).

function tailwindUtility(className: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < className.length; i += 1) {
    const ch = className[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) start = i + 1;
  }
  return className.slice(start).replace(/^!/, '');
}

function utilities(value: string): string[] {
  return value.split(/\s+/).filter(Boolean).map(tailwindUtility);
}

/** gt-ui.ts 533 to 537 */
export function hasEmDash(text: string): boolean {
  return text.includes('—');
}

/** gt-ui.ts 541 to 552 */
export function isEyebrowClassList(value: string): boolean {
  const list = utilities(value);
  const uppercase = list.includes('uppercase');
  const tracked = list.some(
    (u) =>
      u === 'tracking-wide' ||
      u === 'tracking-wider' ||
      u === 'tracking-widest' ||
      /^tracking-\[(?:0\.\d+em|\d+px)\]$/.test(u),
  );
  return uppercase && tracked;
}

type StyleValue = string | number | null;

/** gt-ui.ts 697 to 713 */
export function isEyebrowStyleEntries(
  entries: readonly (readonly [string, StyleValue])[],
): boolean {
  const uppercase = entries.some(
    ([name, value]) => name === 'textTransform' && value === 'uppercase',
  );
  const tracked = entries.some(([name, value]) => {
    if (name !== 'letterSpacing' || value === null) return false;
    if (typeof value === 'number') return value > 0;
    return value !== 'normal' && !/^-|^0(?:[a-z%]+)?$/.test(value.trim());
  });
  return uppercase && tracked;
}

/** gt-ui.ts 563 to 570 */
export function untypedTextVarClasses(value: string): string[] {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => tailwindUtility(c).startsWith('text-[var('));
}

const HEX_IN_UTILITY =
  /\b[a-z-]+-\[[^\]]*#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z])[^\]]*\]|\[[a-z-]+:#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z])[^\]]*\]/;
const HEX_VALUE = /^#[0-9a-fA-F]{3,8}$/;
const HEX_TOKEN = /(?:^|[\s(,])#[0-9a-fA-F]{3,8}(?=$|[\s),;])/;

/** gt-ui.ts 720 to 734 */
export function hasHexColorUtility(value: string): boolean {
  return HEX_IN_UTILITY.test(value);
}
export function hasHexColorToken(value: string): boolean {
  return HEX_VALUE.test(value.trim()) || HEX_TOKEN.test(value);
}

const VOICE_ELEMENTS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p']);
const MONO_FONT_FAMILY = /mono|menlo|courier|consolas|sf mono/i;

/**
 * gt-ui.ts 739 to 756, with the tree's classes: a class token `font-mono`, `font-tc-mono` or one
 * that ends in `-mono` (`ts-asset-mono`) sets the mono stack.
 */
export function isMonoVoice(tag: string, className: string): boolean {
  if (!VOICE_ELEMENTS.has(tag)) return false;
  return utilities(className).some(
    (u) => u === 'font-mono' || u === 'font-tc-mono' || /^[a-z][a-z0-9-]*-mono$/.test(u),
  );
}

const SIDE_BORDER_WIDTH = /^border-(x|l|r)(?:-\d+(?:\.\d+)?|-\[\d[^\]]*\])?$/;
const ARBITRARY_BORDER_INLINE = /^\[border-inline(?:-width)?:/;

function drawsSideRails(list: readonly string[]): boolean {
  const sides = new Set<string>();
  for (const u of list) {
    const m = SIDE_BORDER_WIDTH.exec(u);
    if (m?.[1]) sides.add(m[1]);
    else if (ARBITRARY_BORDER_INLINE.test(u)) sides.add('x');
  }
  return sides.has('x') || (sides.has('l') && sides.has('r'));
}

/** gt-ui.ts 776 to 783, with the tree's `rail-outer` class or token in any prefix. */
export function isDoubleRailClassList(value: string): boolean {
  const list = utilities(value);
  const inRail = list.includes('tc-sec') || list.includes('tc-band');
  return (inRail && drawsSideRails(list)) || list.some((u) => u.includes('rail-outer'));
}

function hasRailWrapper(value: string): boolean {
  const list = utilities(value);
  return RAIL_WRAPPER_CLASSES.some((c) => list.includes(c));
}

/** gt-ui.ts 784 to 791, over the tree's rail wrapper classes. */
export function isNestedRailWrapper(value: string, ancestors: readonly string[]): boolean {
  return hasRailWrapper(value) && ancestors.some(hasRailWrapper);
}

/** gt-ui.ts 794 to 807 */
export function isRailPairClassList(value: string): boolean {
  const list = utilities(value);
  const positioned = list.includes('absolute') || list.includes('fixed');
  const fullHeight =
    list.includes('inset-y-0') ||
    list.includes('inset-0') ||
    list.includes('h-full') ||
    (list.includes('top-0') && list.includes('bottom-0'));
  return positioned && fullHeight && drawsSideRails(list);
}

const SCROLL_LIBRARIES = new Set([
  'lenis',
  'lenis/react',
  '@studio-freight/lenis',
  '@studio-freight/react-lenis',
  'locomotive-scroll',
  'smooth-scrollbar',
  'react-smooth-scroll',
  'react-scroll',
]);
const PAGE_SCROLL_OBJECTS = new Set(['window', 'globalThis', 'document']);

type MemberCall = { method: string | null; objectName: string | null };

/** gt-ui.ts 828 to 852 */
export function isPageSmoothScroll(
  property: string | null,
  value: string,
  call: MemberCall | null,
): boolean {
  if (value !== 'smooth') return false;
  if (property === 'scrollBehavior') return true;
  if (property !== 'behavior' || !call) return false;
  if (call.method === 'scrollIntoView') return true;
  return (
    (call.method === 'scrollTo' || call.method === 'scroll' || call.method === 'scrollBy') &&
    call.objectName !== null &&
    PAGE_SCROLL_OBJECTS.has(call.objectName)
  );
}

/** gt-ui.ts 892 to 895 */
export function endsWithPeriod(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.endsWith('.') && !trimmed.endsWith('..');
}

const GIF_SOURCE = /\.gif(?:$|[?#])/i;
const MEDIA_ELEMENTS = new Set(['img', 'Image', 'video', 'source', 'picture']);
const MEDIA_SOURCE_ATTRIBUTES = ['src', 'poster', 'srcSet'];

const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'with',
]);

/** gt-ui.ts 934 to 949 */
export function isTitleCaseLabel(label: string): boolean {
  const words = label.trim().split(/\s+/).filter(Boolean);
  return words.every((word, index) => {
    if (word.startsWith('{')) return true;
    const stripped = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (!stripped || !/^[A-Za-z]/.test(stripped)) return true;
    if (index > 0 && SMALL_WORDS.has(stripped.toLowerCase())) return true;
    return /^[A-Z]/.test(stripped);
  });
}

const ALLOWED_GOOGLE_FONTS = new Set(['Geist_Mono']);
const ALLOWED_FONT_FAMILY_VALUE = /^(?:inherit|initial|unset)$|inter|geist|var\(--|monospace/i;

/** gt-ui.ts 458 to 477 */
export function nonInterFontClasses(value: string): string[] {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => {
      const u = tailwindUtility(c);
      if (u === 'font-serif') return true;
      if (u.startsWith('font-[')) {
        const inner = u.slice('font-['.length, -1);
        return !/^\d+(?:\.\d+)?$/.test(inner) && inner !== 'inherit';
      }
      return false;
    });
}

const FLAG_SPRITE_CLASS = /(?:^|\s)!?fi(?:s)?(?:\s|$)|(?:^|\s)!?fi-[a-z]{2}(?:-[a-z]+)?(?:\s|$)/;
const REGIONAL_INDICATOR_PAIR = /[\u{1F1E6}-\u{1F1FF}]{2}/u;
const FLAG_IMAGE_SOURCE = /flag/i;

const INLINE_RADIUS_PROPERTIES = new Set([
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
  'borderStartStartRadius',
  'borderStartEndRadius',
  'borderEndStartRadius',
  'borderEndEndRadius',
]);

/** True when a radius value (a CSS value or an inline style's) is inside the radius rule. */
export function isAllowedRadius(value: string | number): boolean {
  if (typeof value === 'number') return value === 0;
  const parts = splitTopLevel(value.replace(/\s*!important\s*$/i, '').trim(), /[\s/]/);
  return (
    parts.length > 0 &&
    parts.every((part) => RADIUS_VALUES.some((re) => re.test(part.replace(/\s+/g, ''))))
  );
}

// ---------------------------------------------------------------------------------------------
// The design round's value tests (docs/DESIGN.md 2.6, 3.5, 4.2, 4.5, 6.5), shared by the CSS
// checks (css.ts) and the inline style forms below.

const LAYER_VALUE = /^var\(--ts-layer-([a-z]+)\)$/;
const CSS_KEYWORD = /^(?:auto|inherit|initial|unset|revert|revert-layer)$/;

/**
 * True when a z-index is on the scale: a keyword, an integer under the local limit (order inside
 * one stacking context), or `var(--ts-layer-<name>)` naming one of the ten layers.
 */
export function isScaleZIndex(value: string | number): boolean {
  if (typeof value === 'number') return value < Z_INDEX.localLimit;
  const v = value
    .replace(/\s*!important\s*$/i, '')
    .trim()
    .replace(/\s+/g, '');
  if (CSS_KEYWORD.test(v)) return true;
  if (/^-?\d+$/.test(v)) return Number(v) < Z_INDEX.localLimit;
  const layer = LAYER_VALUE.exec(v);
  return layer !== null && Z_INDEX.layers.includes(layer[1] ?? '');
}

const LENGTH = /^-?(?:\d+|\d*\.\d+)(?:px|em|rem|%|vh|vw|ch)?$/;
const ZERO = /^-?0*(?:\.0+)?(?:px|em|rem|%|vh|vw|ch)?$/;

/**
 * True when a box-shadow draws a shadow, a blur or an offset outside the box, in any of its layers
 * (docs/DESIGN.md 3.4: the plates separate by the frame and a ring of spreads alone; the two drop
 * shadows go). A layer's lengths are read in order, offset x, offset y, blur, spread; a length
 * written as var() or calc() is not read. An inset layer with no blur is a rule drawn inside the
 * box (a table's seam, a terminal's head line), not a shadow, so its offset is allowed.
 */
export function shadowHasBlurOrOffset(value: string): boolean {
  const v = value.replace(/\s*!important\s*$/i, '').trim();
  if (v === 'none' || CSS_KEYWORD.test(v)) return false;
  for (const layer of splitTopLevel(v, /,/)) {
    const tokens = splitTopLevel(layer, /\s/);
    const lengths = tokens.filter((token) => LENGTH.test(token));
    const [x, y, blur] = lengths;
    const drawn = (length: string | undefined): boolean =>
      length !== undefined && !ZERO.test(length);
    if (drawn(blur)) return true;
    if (!tokens.includes('inset') && (drawn(x) || drawn(y))) return true;
  }
  return false;
}

/** True when a feature list turns on General Translation's alternates `cv11` or `ss01`. */
export function hasAlternates(value: string): boolean {
  return /\b(?:cv11|ss01)\b/.test(value);
}

/** True when a file path sits under one of the owners (a file, or a folder ending in `/`). */
export function isOwnedBy(file: string, owners: readonly string[]): boolean {
  return owners.some((owner) => (owner.endsWith('/') ? file.startsWith(owner) : file === owner));
}

/** True when a value writes tabular figures by hand: `tabular-nums`, or `tnum` in a feature list. */
export function hasTabularLiteral(value: string): boolean {
  return /\btabular-nums\b/.test(value) || /(['"])tnum\1/.test(value);
}

/** Splits a CSS value on a separator outside parentheses and quotes. */
export function splitTopLevel(value: string, separator: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of value) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && separator.test(ch)) {
      if (current.trim()) out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

// ---------------------------------------------------------------------------------------------
// The syntax tree helpers (gt-ui.ts 33 to 128, 505 to 691, 856 to 887, 951 to 1018).

function unwrap(node: ts.Node): ts.Node {
  let n = node;
  while (
    ts.isParenthesizedExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isSatisfiesExpression(n) ||
    ts.isNonNullExpression(n) ||
    ts.isTypeAssertionExpression(n)
  )
    n = n.expression;
  return n;
}

/** The value of a string literal, a template without substitutions or a template part. */
function stringValue(node: ts.Node | undefined): string | null {
  if (!node) return null;
  const n = unwrap(node);
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) return n.text;
  return null;
}

function propertyName(name: ts.PropertyName | undefined): string | null {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  if (ts.isComputedPropertyName(name)) return stringValue(name.expression);
  return null;
}

type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function elementName(opening: Opening): string | null {
  return ts.isIdentifier(opening.tagName) ? opening.tagName.text : null;
}

function attributeOf(opening: Opening, names: readonly string[]): ts.JsxAttribute | null {
  for (const attribute of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) continue;
    const name = ts.isIdentifier(attribute.name) ? attribute.name.text : null;
    if (name !== null && names.includes(name)) return attribute;
  }
  return null;
}

function attributeString(attribute: ts.JsxAttribute | null): string | null {
  const init = attribute?.initializer;
  if (!init) return null;
  if (ts.isJsxExpression(init)) return stringValue(init.expression);
  return stringValue(init);
}

function staticClassName(opening: Opening): string | null {
  return attributeString(attributeOf(opening, ['className', 'class']));
}

function styleObject(opening: Opening): ts.ObjectLiteralExpression | null {
  const init = attributeOf(opening, ['style'])?.initializer;
  if (!init || !ts.isJsxExpression(init) || !init.expression) return null;
  const expression = unwrap(init.expression);
  return ts.isObjectLiteralExpression(expression) ? expression : null;
}

function styleEntries(object: ts.ObjectLiteralExpression | null): [string, StyleValue][] {
  const out: [string, StyleValue][] = [];
  for (const property of object?.properties ?? []) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyName(property.name);
    if (!name) continue;
    const value = unwrap(property.initializer);
    out.push([name, ts.isNumericLiteral(value) ? Number(value.text) : stringValue(value)]);
  }
  return out;
}

function openingOf(node: ts.Node): Opening | null {
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return null;
}

function ancestorClassLists(node: ts.Node): string[] {
  const out: string[] = [];
  for (let n = node.parent as ts.Node | undefined; n; n = n.parent) {
    const opening = openingOf(n);
    const className = opening ? staticClassName(opening) : null;
    if (className) out.push(className);
  }
  return out;
}

const STOP_AT_ATTRIBUTE = new Set([
  ts.SyntaxKind.JsxOpeningElement,
  ts.SyntaxKind.JsxSelfClosingElement,
  ts.SyntaxKind.JsxElement,
  ts.SyntaxKind.JsxFragment,
  ts.SyntaxKind.SourceFile,
]);

/** gt-ui.ts 575 to 598 */
function enclosingJsxAttributeName(node: ts.Node): string | null {
  for (let n = node.parent as ts.Node | undefined; n; n = n.parent) {
    if (ts.isJsxAttribute(n)) return ts.isIdentifier(n.name) ? n.name.text : null;
    if (STOP_AT_ATTRIBUTE.has(n.kind)) return null;
  }
  return null;
}

const STOP_AT_PROPERTY = new Set([
  ts.SyntaxKind.ObjectLiteralExpression,
  ts.SyntaxKind.ArrayLiteralExpression,
  ts.SyntaxKind.CallExpression,
  ts.SyntaxKind.JsxAttribute,
  ts.SyntaxKind.JsxElement,
  ts.SyntaxKind.JsxSelfClosingElement,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.SourceFile,
]);

/** gt-ui.ts 604 to 630 */
function enclosingPropertyName(node: ts.Node): string | null {
  for (let n = node.parent as ts.Node | undefined; n; n = n.parent) {
    if (ts.isPropertyAssignment(n)) return propertyName(n.name);
    if (STOP_AT_PROPERTY.has(n.kind)) return null;
  }
  return null;
}

const STOP_AT_CALL = new Set([
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.JsxElement,
  ts.SyntaxKind.SourceFile,
]);

/** gt-ui.ts 856 to 887 */
function enclosingMemberCall(node: ts.Node): MemberCall | null {
  let n = node.parent as ts.Node | undefined;
  while (n && !ts.isCallExpression(n)) {
    if (STOP_AT_CALL.has(n.kind)) return null;
    n = n.parent;
  }
  if (!n || !ts.isCallExpression(n)) return null;
  const callee = unwrap(n.expression);
  if (!ts.isPropertyAccessExpression(callee)) return null;
  let object: ts.Node = unwrap(callee.expression);
  while (ts.isPropertyAccessExpression(object) || ts.isElementAccessExpression(object))
    object = unwrap(object.expression);
  return {
    method: callee.name.text,
    objectName: ts.isIdentifier(object) ? object.text : null,
  };
}

/** gt-ui.ts 953 to 988: the static labels an expression can produce. */
function staticLabels(node: ts.Node | undefined): string[] {
  if (!node) return [];
  const n = unwrap(node);
  const value = stringValue(n);
  if (value !== null) return [value];
  if (ts.isCallExpression(n)) {
    const callee = unwrap(n.expression);
    if (ts.isIdentifier(callee) && (callee.text === 'gt' || callee.text === 't'))
      return staticLabels(n.arguments[0]);
    return [];
  }
  if (ts.isConditionalExpression(n))
    return [...staticLabels(n.whenTrue), ...staticLabels(n.whenFalse)];
  if (ts.isBinaryExpression(n)) {
    const op = n.operatorToken.kind;
    if (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken
    )
      return [...staticLabels(n.left), ...staticLabels(n.right)];
    return [];
  }
  if (ts.isJsxExpression(n)) return staticLabels(n.expression);
  return [];
}

const INLINE_TEXT_WRAPPERS = new Set(['T', 'span', 'em', 'strong', 'b', 'i']);

/** gt-ui.ts 992 to 1018: the static text pieces of an element's children, in order. */
function childText(children: ts.NodeArray<ts.JsxChild>): string[] {
  const pieces: string[] = [];
  for (const child of children) {
    if (ts.isJsxText(child)) {
      if (child.text.trim()) pieces.push(child.text);
      continue;
    }
    if (ts.isJsxExpression(child)) {
      pieces.push(...staticLabels(child.expression));
      continue;
    }
    if (ts.isJsxElement(child)) {
      const name = elementName(child.openingElement);
      if (name && INLINE_TEXT_WRAPPERS.has(name)) pieces.push(...childText(child.children));
    }
  }
  return pieces;
}

/**
 * The labels a button's children draw, when every piece of them is static: one label per branch of
 * a conditional, the text around inline wrappers joined. A button whose children mix static words
 * with data (`{count} slides`, `{name} by {author}`) draws a label this lint cannot read, so it
 * answers null; the rendered row `chrome.buttons.one-rule` reads those (NEXT.md 4.1.5).
 */
function buttonLabels(children: ts.NodeArray<ts.JsxChild>): string[] | null {
  let text = '';
  const branches: string[] = [];
  for (const child of children) {
    if (ts.isJsxText(child)) {
      text += child.text;
      continue;
    }
    if (ts.isJsxExpression(child)) {
      if (!child.expression) continue;
      const labels = staticLabels(child.expression);
      const e = unwrap(child.expression);
      const fullyStatic =
        stringValue(e) !== null ||
        (ts.isConditionalExpression(e) &&
          stringValue(e.whenTrue) !== null &&
          stringValue(e.whenFalse) !== null);
      if (!fullyStatic) return null;
      if (labels.length === 1) text += labels[0];
      else branches.push(...labels);
      continue;
    }
    if (ts.isJsxElement(child)) {
      const name = elementName(child.openingElement);
      if (!name || !INLINE_TEXT_WRAPPERS.has(name)) continue;
      const inner = buttonLabels(child.children);
      if (inner === null) return null;
      if (inner.length === 1) text += ` ${inner[0]} `;
      else branches.push(...inner);
    }
  }
  const joined = text.replace(/\s+/g, ' ').trim();
  return joined ? [joined, ...branches] : branches;
}

// ---------------------------------------------------------------------------------------------
// The walk.

/** The CSS checks the walk reads in their inline forms: style objects and style strings. */
type InlineCssRuleId =
  | 'css/radius'
  | 'css/z-index'
  | 'css/no-shadow'
  | 'css/scrollbar'
  | 'css/numerals'
  | 'css/chrome-alternates';

export const INLINE_CSS_RULES: readonly InlineCssRuleId[] = [
  'css/radius',
  'css/z-index',
  'css/no-shadow',
  'css/scrollbar',
  'css/numerals',
  'css/chrome-alternates',
];

/** A z-index written as an expression is on the scale when it reads LAYERS or a layer token. */
function expressionOnScale(text: string): boolean {
  return /\bLAYERS\b|--ts-layer-/.test(text);
}

/** A style string that hides a scrollbar and does nothing else to it. */
const HIDDEN_SCROLLBAR = /::-webkit-scrollbar\s*\{\s*display\s*:\s*none\s*;?\s*\}/g;

/** Parses one file and runs every rule of `rules` over it. A parse error is a `brand/parse` finding. */
export function lintSource(
  file: string,
  text: string,
  rules: ReadonlySet<BrandRuleId> = new Set<BrandRuleId>([...SOURCE_RULES, ...INLINE_CSS_RULES]),
): BrandFinding[] {
  const kind =
    file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out: BrandFinding[] = [];
  const parseDiagnostics = (source as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  for (const diagnostic of parseDiagnostics ?? []) {
    const at = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    out.push({
      rule: 'brand/parse',
      file,
      line: at.line + 1,
      column: at.character + 1,
      message: `The file does not parse: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
      text: '',
    });
  }
  if (out.length > 0) return out;

  const on = (rule: SourceRuleId | InlineCssRuleId): boolean => rules.has(rule);
  const report = (rule: BrandRuleId, node: ts.Node, message: string, snippet?: string): void => {
    const at = source.getLineAndCharacterOfPosition(node.getStart(source));
    const raw = snippet ?? node.getText(source);
    out.push({
      rule,
      file,
      line: at.line + 1,
      column: at.character + 1,
      message,
      text: raw.replace(/\s+/g, ' ').trim().slice(0, 160),
    });
  };

  const checkString = (node: ts.Node, value: string, template: boolean): void => {
    if (on('css/numerals') && file !== NUMERALS_OWNER && hasTabularLiteral(value))
      report('css/numerals', node, MESSAGES.inlineNumerals ?? '');
    if (
      on('css/chrome-alternates') &&
      !isOwnedBy(file, ALTERNATES_OWNERS) &&
      (/font-feature-settings\s*:[^;}]*\b(?:cv11|ss01)\b/.test(value) ||
        (enclosingPropertyName(node) === 'fontFeatureSettings' && hasAlternates(value)))
    )
      report('css/chrome-alternates', node, MESSAGES.inlineAlternates ?? '');
    if (on('css/scrollbar') && !isOwnedBy(file, SCROLLBAR_OWNERS)) {
      const rest = value.replace(HIDDEN_SCROLLBAR, '');
      if (/::-webkit-scrollbar|scrollbar-color\s*:|scrollbar-width\s*:\s*(?!none)/.test(rest))
        report('css/scrollbar', node, MESSAGES.scrollbarText ?? '');
    }
    if (on('gt-ui/single-rail') && isDoubleRailClassList(value))
      report('gt-ui/single-rail', node, MESSAGES.doubleRail ?? '');
    if (on('gt-ui/no-em-dash') && hasEmDash(value))
      report('gt-ui/no-em-dash', node, MESSAGES.emDash ?? '');
    if (on('gt-ui/no-eyebrow') && isEyebrowClassList(value))
      report('gt-ui/no-eyebrow', node, MESSAGES.eyebrow ?? '');
    if (on('gt-ui/typed-text-var'))
      for (const className of untypedTextVarClasses(value))
        report('gt-ui/typed-text-var', node, MESSAGES.typedTextVar ?? '', className);
    if (on('gt-ui/inter-only'))
      for (const className of nonInterFontClasses(value))
        report('gt-ui/inter-only', node, MESSAGES.fontClass ?? '', className);
    if (on('gt-ui/no-raw-locale-flags')) {
      // a sprite class is a class: read in a className or class attribute alone, since this tree
      // spells locale codes ('fi', the spell check and logo slugs) as data strings
      const attribute = enclosingJsxAttributeName(node);
      if ((attribute === 'className' || attribute === 'class') && FLAG_SPRITE_CLASS.test(value))
        report('gt-ui/no-raw-locale-flags', node, MESSAGES.flagClass ?? '');
      if (REGIONAL_INDICATOR_PAIR.test(value))
        report('gt-ui/no-raw-locale-flags', node, MESSAGES.emojiFlag ?? '');
    }
    if (on('gt-ui/no-hex-colors')) {
      if (hasHexColorUtility(value)) report('gt-ui/no-hex-colors', node, MESSAGES.hexUtility ?? '');
      else {
        const attribute = enclosingJsxAttributeName(node);
        if (
          (attribute === 'style' || attribute === 'className' || attribute === 'class') &&
          hasHexColorToken(value)
        )
          report('gt-ui/no-hex-colors', node, MESSAGES.hexValue ?? '');
      }
    }
    if (on('gt-ui/no-smooth-scroll')) {
      if (utilities(value).includes('scroll-smooth'))
        report('gt-ui/no-smooth-scroll', node, MESSAGES.smoothClass ?? '');
      else if (!template && value === 'smooth') {
        if (isPageSmoothScroll(enclosingPropertyName(node), value, enclosingMemberCall(node)))
          report('gt-ui/no-smooth-scroll', node, MESSAGES.smoothProperty ?? '');
        else {
          // element.style.scrollBehavior = 'smooth'
          let parent = node.parent as ts.Node | undefined;
          while (parent && ts.isParenthesizedExpression(parent)) parent = parent.parent;
          if (
            parent &&
            ts.isBinaryExpression(parent) &&
            parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isPropertyAccessExpression(parent.left) &&
            parent.left.name.text === 'scrollBehavior'
          )
            report('gt-ui/no-smooth-scroll', node, MESSAGES.smoothProperty ?? '');
        }
      }
    }
  };

  const checkImport = (node: ts.ImportDeclaration): void => {
    const from = stringValue(node.moduleSpecifier);
    if (from === null) return;
    if (on('gt-ui/no-smooth-scroll') && SCROLL_LIBRARIES.has(from))
      report('gt-ui/no-smooth-scroll', node, MESSAGES.scrollLibrary ?? '');
    if (on('gt-ui/no-gif-mark') && GIF_SOURCE.test(from.trim()))
      report('gt-ui/no-gif-mark', node, MESSAGES.gifMark ?? '');
    if (on('gt-ui/icon-tiers')) {
      if (from === 'lucide-react') report('gt-ui/icon-tiers', node, MESSAGES.lucide ?? '');
      else if (from.startsWith('@heroicons/react'))
        report('gt-ui/icon-tiers', node, MESSAGES.heroicons ?? '');
    }
    if (on('gt-ui/inter-only') && from === 'next/font/google') {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings))
        for (const element of bindings.elements) {
          const name = (element.propertyName ?? element.name).text;
          if (!ALLOWED_GOOGLE_FONTS.has(name))
            report('gt-ui/inter-only', element, MESSAGES.googleFont ?? '');
        }
    }
  };

  const checkCall = (node: ts.CallExpression): void => {
    const callee = unwrap(node.expression);
    if (!on('gt-ui/inter-only') || !ts.isIdentifier(callee) || callee.text !== 'localFont') return;
    const options = node.arguments[0] ? unwrap(node.arguments[0]) : null;
    if (!options || !ts.isObjectLiteralExpression(options)) return;
    for (const property of options.properties) {
      if (!ts.isPropertyAssignment(property) || propertyName(property.name) !== 'src') continue;
      const value = unwrap(property.initializer);
      const entries = ts.isArrayLiteralExpression(value) ? [...value.elements] : [value];
      for (const entry of entries) {
        let path: string | null = null;
        const e = unwrap(entry);
        if (ts.isObjectLiteralExpression(e)) {
          const p = e.properties.find(
            (item): item is ts.PropertyAssignment =>
              ts.isPropertyAssignment(item) && propertyName(item.name) === 'path',
          );
          path = p ? stringValue(p.initializer) : null;
        } else path = stringValue(e);
        if (path && !/inter/i.test(path))
          report('gt-ui/inter-only', entry, MESSAGES.localFontFile ?? '');
      }
    }
  };

  const checkProperty = (node: ts.PropertyAssignment): void => {
    const name = propertyName(node.name);
    if (!name) return;
    const value = unwrap(node.initializer);
    if (on('gt-ui/inter-only') && name === 'fontFamily') {
      const family = stringValue(value);
      if (family !== null && !ALLOWED_FONT_FAMILY_VALUE.test(family.trim()))
        report('gt-ui/inter-only', node, MESSAGES.fontFamilyStyle ?? '');
    }
    if (on('css/radius') && INLINE_RADIUS_PROPERTIES.has(name)) {
      const radius = ts.isNumericLiteral(value) ? Number(value.text) : stringValue(value);
      if (radius !== null && !isAllowedRadius(radius))
        report('css/radius', node, MESSAGES.inlineRadius ?? '');
    }
    if (on('css/z-index') && name === 'zIndex' && !zIndexOnScale(value))
      report('css/z-index', node, MESSAGES.inlineZIndex ?? '');
    if (on('css/no-shadow') && name === 'boxShadow') {
      const shadow = stringValue(value);
      if (shadow !== null && shadowHasBlurOrOffset(shadow))
        report('css/no-shadow', node, MESSAGES.inlineShadow ?? '');
    }
    if (on('css/scrollbar') && !isOwnedBy(file, SCROLLBAR_OWNERS)) {
      const width = name === 'scrollbarWidth' ? stringValue(value) : null;
      if (name === 'scrollbarColor' || (name === 'scrollbarWidth' && width !== 'none'))
        report('css/scrollbar', node, MESSAGES.inlineScrollbar ?? '');
    }
  };

  /** A z-index value node: a number, a string, a negative number, or an expression on LAYERS. */
  const zIndexOnScale = (value: ts.Node): boolean => {
    if (ts.isNumericLiteral(value)) return isScaleZIndex(Number(value.text));
    if (
      ts.isPrefixUnaryExpression(value) &&
      value.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(value.operand)
    )
      return true;
    const text = stringValue(value);
    if (text !== null) return isScaleZIndex(text);
    return expressionOnScale(value.getText(source));
  };

  /** `element.style.zIndex = <value>`: the same scale as a style object's zIndex. */
  const checkAssignment = (node: ts.BinaryExpression): void => {
    if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
    const left = unwrap(node.left);
    if (!ts.isPropertyAccessExpression(left)) return;
    const name = left.name.text;
    const value = unwrap(node.right);
    if (on('css/z-index') && name === 'zIndex' && !zIndexOnScale(value))
      report('css/z-index', node, MESSAGES.inlineZIndex ?? '');
    if (on('css/no-shadow') && name === 'boxShadow') {
      const shadow = stringValue(value);
      if (shadow !== null && shadowHasBlurOrOffset(shadow))
        report('css/no-shadow', node, MESSAGES.inlineShadow ?? '');
    }
  };

  const checkOpening = (node: Opening): void => {
    const name = elementName(node);
    if (!name) return;
    if (on('gt-ui/mono-is-not-voice') && VOICE_ELEMENTS.has(name)) {
      const className = staticClassName(node);
      const family = styleEntries(styleObject(node)).find(([p]) => p === 'fontFamily')?.[1];
      if (
        (className && isMonoVoice(name, className)) ||
        (typeof family === 'string' && MONO_FONT_FAMILY.test(family))
      )
        report('gt-ui/mono-is-not-voice', node, MESSAGES.monoVoice ?? '');
    }
    if (on('gt-ui/no-eyebrow') && isEyebrowStyleEntries(styleEntries(styleObject(node))))
      report('gt-ui/no-eyebrow', node, MESSAGES.eyebrow ?? '');
    if (on('gt-ui/no-gif-mark') && MEDIA_ELEMENTS.has(name))
      for (const attribute of MEDIA_SOURCE_ATTRIBUTES) {
        const src = attributeString(attributeOf(node, [attribute]));
        if (src && GIF_SOURCE.test(src.trim())) {
          report('gt-ui/no-gif-mark', node, MESSAGES.gifMark ?? '');
          break;
        }
      }
    if (on('gt-ui/no-raw-locale-flags') && (name === 'img' || name === 'Image')) {
      const src = attributeString(attributeOf(node, ['src']));
      if (src && FLAG_IMAGE_SOURCE.test(src))
        report('gt-ui/no-raw-locale-flags', node, MESSAGES.flagImage ?? '');
    }
    const labelProp = BUTTON_LABEL_PROPS[name];
    if (on('gt-ui/cta-title-case') && labelProp) {
      const attribute = attributeOf(node, [labelProp]);
      const init = attribute?.initializer;
      const labels = !init
        ? []
        : ts.isJsxExpression(init)
          ? staticLabels(init.expression)
          : staticLabels(init);
      for (const label of labels)
        if (label.trim() && !isTitleCaseLabel(label))
          report('gt-ui/cta-title-case', node, MESSAGES.titleCase ?? '', label.trim());
    }
  };

  const checkElement = (node: ts.JsxElement | ts.JsxSelfClosingElement): void => {
    const opening = openingOf(node);
    if (!opening) return;
    const name = elementName(opening);
    const className = staticClassName(opening);
    if (
      on('gt-ui/single-rail') &&
      className &&
      isNestedRailWrapper(className, ancestorClassLists(node))
    )
      report('gt-ui/single-rail', opening, MESSAGES.nestedRail ?? '');
    if (!ts.isJsxElement(node)) return;
    if (on('gt-ui/single-rail')) checkRailChildren(node.children, opening);
    if (on('gt-ui/no-heading-period') && name && /^h[1-6]$/.test(name)) {
      const pieces = childText(node.children);
      const last = pieces[pieces.length - 1];
      if (typeof last === 'string' && endsWithPeriod(last))
        report('gt-ui/no-heading-period', opening, MESSAGES.trailingPeriod ?? '', last.trim());
    }
    if (on('gt-ui/cta-title-case') && name && BUTTON_ELEMENTS.includes(name))
      for (const label of buttonLabels(node.children) ?? [])
        if (label.trim() && !isTitleCaseLabel(label))
          report('gt-ui/cta-title-case', opening, MESSAGES.titleCase ?? '', label.trim());
  };

  const checkRailChildren = (children: ts.NodeArray<ts.JsxChild>, at: ts.Node): void => {
    const lists = children
      .map((child) => openingOf(child))
      .filter((opening): opening is Opening => opening !== null)
      .map((opening) => staticClassName(opening))
      .filter((className): className is string => className !== null);
    if (lists.filter(isRailPairClassList).length >= 2)
      report('gt-ui/single-rail', at, MESSAGES.stackedRailPairs ?? '');
  };

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // an import's module name is the import rules' business alone
      if (!ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent))
        checkString(node, node.text, ts.isNoSubstitutionTemplateLiteral(node));
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      checkString(node, node.text, true);
    } else if (ts.isJsxText(node)) {
      if (on('gt-ui/no-em-dash') && hasEmDash(node.text))
        report('gt-ui/no-em-dash', node, MESSAGES.emDash ?? '');
      if (on('gt-ui/no-raw-locale-flags') && REGIONAL_INDICATOR_PAIR.test(node.text))
        report('gt-ui/no-raw-locale-flags', node, MESSAGES.emojiFlag ?? '');
    } else if (ts.isImportDeclaration(node)) {
      checkImport(node);
    } else if (ts.isCallExpression(node)) {
      checkCall(node);
    } else if (ts.isPropertyAssignment(node)) {
      checkProperty(node);
    } else if (ts.isBinaryExpression(node)) {
      checkAssignment(node);
    } else if (ts.isJsxFragment(node)) {
      if (on('gt-ui/single-rail')) checkRailChildren(node.children, node.openingFragment);
    }
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      checkElement(node);
      checkOpening(openingOf(node) as Opening);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}
