// The CSS checks of the brand lint (docs/NEXT.md 4.1.3 item 25): smooth scrolling, radii outside
// the radius rule, monospace outside the code surfaces, eyebrows, faces outside Inter and the
// retired outer rail, and since the design round (docs/DESIGN.md 2.6, 3.5, 4.2, 4.5, 6.5) the
// stacking scale, drop shadows, the one scrollbar, the numerals token and the chrome's
// alternates, read from the tree's plain stylesheets (AGENTS.md code rules: one tokens.css
// and one small CSS file per component). The gt-ui plugin reads script files alone
// (P:.oxlintrc.json 32 to 35), which is how P:src/components/viewer/BookView.css line 11 kept its
// smooth scroll (audit-brand-source 15.3); these are the same laws over CSS.
//
// The parser is small on purpose: comments out, then every block's prelude and every declaration
// with its line, with nesting resolved (`&` takes the parent's selector) and the enclosing at-rules
// kept. It reads what the tree writes; it is no validator.
import {
  ALTERNATES_OWNERS,
  CODE_SURFACES,
  CSS_RULES,
  NUMERALS_OWNERS,
  RADIUS_EXCEPTIONS,
  SCROLLBAR_OWNERS,
  Z_INDEX,
} from './config.ts';
import type { BrandFinding, BrandRuleId, CssRuleId } from './config.ts';
import {
  alternatesInStyleText,
  breaksAlternates,
  hasTabularLiteral,
  isAlternatesOnly,
  isAllowedRadius,
  isOwnedBy,
  isScaleZIndex,
  shadowHasBlurOrOffset,
  splitTopLevel,
} from './source.ts';

export type CssDeclaration = {
  /** the rule's selector list as written, nesting resolved; '' at the top level */
  selector: string;
  property: string;
  value: string;
  /** 1-based line of the declaration's property */
  line: number;
  column: number;
  /** the preludes of the at-rules around the rule, outermost first */
  atRules: string[];
  /** an index shared by the declarations of one rule block */
  block: number;
};

/** Comments become spaces, newlines kept, so every offset keeps its line. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function resolveNested(parent: string, child: string): string {
  if (!parent) return child;
  const parents = splitTopLevel(parent, /,/);
  const children = splitTopLevel(child, /,/);
  const out: string[] = [];
  for (const c of children)
    for (const p of parents) out.push(c.includes('&') ? c.replace(/&/g, p) : `${p} ${c}`);
  return out.join(', ');
}

/** Every declaration of a stylesheet with its selector, line and at-rules. */
export function parseCss(input: string): CssDeclaration[] {
  const text = stripComments(input);
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') lineStarts.push(i + 1);
  const position = (offset: number): { line: number; column: number } => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - (lineStarts[lo] ?? 0) + 1 };
  };

  type Frame = { kind: 'rule' | 'at'; selector: string; prelude: string; block: number };
  const stack: Frame[] = [];
  const out: CssDeclaration[] = [];
  let blocks = 0;
  let start = 0;
  let quote: string | null = null;
  let depth = 0;

  const currentRule = (): Frame | undefined => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const frame = stack[i];
      if (frame?.kind === 'rule') return frame;
      if (
        frame &&
        !/^@(?:media|supports|container|layer|document|scope|starting-style)\b/.test(frame.prelude)
      )
        return frame;
    }
    return undefined;
  };
  const declare = (from: number, to: number): void => {
    const raw = text.slice(from, to);
    const colon = raw.indexOf(':');
    if (colon < 0) return;
    const property = raw.slice(0, colon).trim().toLowerCase();
    if (!/^(?:--)?[a-z-]+$/.test(property)) return;
    const value = raw.slice(colon + 1).trim();
    const frame = currentRule();
    if (!frame) return;
    const offset = from + raw.search(/\S/);
    const at = position(offset);
    out.push({
      selector: frame.kind === 'rule' ? frame.selector : '',
      property,
      value,
      line: at.line,
      column: at.column,
      atRules: stack.filter((f) => f.kind === 'at').map((f) => f.prelude),
      block: frame.block,
    });
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth > 0) continue;
    if (ch === '{') {
      const prelude = text.slice(start, i).trim();
      blocks += 1;
      if (prelude.startsWith('@')) stack.push({ kind: 'at', selector: '', prelude, block: blocks });
      else {
        const parent = [...stack].reverse().find((f) => f.kind === 'rule');
        stack.push({
          kind: 'rule',
          selector: resolveNested(parent?.selector ?? '', prelude.replace(/\s+/g, ' ')),
          prelude,
          block: blocks,
        });
      }
      start = i + 1;
    } else if (ch === ';') {
      declare(start, i);
      start = i + 1;
    } else if (ch === '}') {
      declare(start, i);
      stack.pop();
      start = i + 1;
    }
  }
  return out;
}

const MESSAGES: Record<CssRuleId, string> = {
  'css/no-smooth-scroll':
    'The product does not smooth-scroll (P:deck/slides/39-avoid.html; audit-brand-source 14.4). Remove scroll-behavior: smooth.',
  'css/radius':
    'A radius outside the radius rule (DECK-GRAMMAR.md:39; NEXT.md 4.1.2 "Corners"): 0, 50%, var(--pt-radius) or a named exception in packages/lint/src/brand/config.ts.',
  'css/mono-outside-code':
    'Monospace outside a code surface (DECK-GRAMMAR.md:31 "Nothing else uses monospace"; P:BRAND.md section 6): set it in Inter, or name the surface in CODE_SURFACES if it shows code, a token or a file path.',
  'css/no-eyebrow':
    'No eyebrow labels (DECK-GRAMMAR.md:23): uppercase text with positive letter spacing is the tracked label above a heading.',
  'css/inter-only':
    'Type is Inter only (DECK-GRAMMAR.md:24): this face is outside Inter and its fallbacks.',
  'css/single-rail':
    'One rail: the outer pair 10 px outside the column (--tc-rail-outer) is retired (P:.oxlintrc.json gt-ui/single-rail).',
  'css/z-index':
    'A z-index off the stacking scale (docs/DESIGN.md 2.6): a value under 5 is local order; a floating surface reads var(--ts-layer-<name>) or enters its layer through the Layer primitive.',
  'css/no-shadow':
    'A shadow with a blur or an offset (docs/DESIGN.md 3.4): a floating plate draws the --pt-edge frame and --pt-ring (.pt-float, .pt-window); the brand deck uses no shadows.',
  'css/scrollbar':
    'A scrollbar style outside tokens.css (docs/DESIGN.md 6.5): every scroller draws the one scrollbar; a ::-webkit-scrollbar rule here may only set display: none, and scrollbar-width only none.',
  'css/numerals':
    'Tabular figures written by hand (docs/DESIGN.md 4.5): use the .pt-num class or font-variant-numeric: var(--pt-numerals).',
  'css/chrome-alternates':
    "A stylistic set, a character variant (ss01 to ss20, cv01 to cv99, salt, swsh, aalt), a font-variant-alternates or var(--display-features) outside a .ts-sheet rule: General Translation's alternates belong to its theme's slides (docs/DESIGN.md 4.2, docs/POLISH-2.md 2.3); the chrome, the pages, the landing, the marks and the card draw Inter's defaults.",
};

/** The ladder's three tokens, declared once in tokens.css. */
const RADIUS_TOKEN_NAMES = new Set(['--pt-radius', '--pt-radius-sm', '--pt-radius-lg']);

const RADIUS_PROPERTY =
  /^border(?:-(?:top|bottom)-(?:left|right)|-(?:start|end)-(?:start|end))?-radius$/;
const MONO = /mono|menlo|courier|consolas/i;
/** A rule whose subject is a code element: the last compound selector names one. */
const CODE_SUBJECT = /(?:^|[\s>+~])(?:code|pre|kbd|samp|tt)(?=$|[.:#[])/;
/** The faces a font stack may name beside Inter: its fallbacks and the generic families. */
const SANS_FALLBACKS = new Set([
  'inter',
  'inter fallback',
  'inter variable',
  'intervariable',
  'helvetica neue',
  'helvetica',
  'arial',
  'sans-serif',
  'system-ui',
  'ui-sans-serif',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'roboto',
  'inherit',
  'initial',
  'unset',
  'revert',
]);
const NON_INTER_GENERIC =
  /(?:^|[\s,])(?:serif|cursive|fantasy|ui-serif|ui-rounded|math)(?=$|[\s,;])/i;

function normalizeSelector(selector: string): string {
  return selector
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~,])\s*/g, '$1')
    .trim();
}

function lastCompound(selector: string): string {
  const parts = selector.trim().split(/\s*[\s>+~]\s*/);
  return parts[parts.length - 1] ?? '';
}

function isCodeSurface(file: string, selector: string): boolean {
  const named = CODE_SURFACES.filter((s) => s.file === file).map((s) =>
    normalizeSelector(s.selector),
  );
  return splitTopLevel(selector, /,/).every(
    (one) =>
      named.includes(normalizeSelector(one)) ||
      CODE_SUBJECT.test(` ${lastCompound(one).replace(/::?[a-z-]+(\([^)]*\))?$/, '')}`),
  );
}

function radiusException(file: string, selector: string, value: string): boolean {
  return RADIUS_EXCEPTIONS.some(
    (e) =>
      e.file === file &&
      normalizeSelector(e.selector) === normalizeSelector(selector) &&
      e.value.replace(/\s+/g, '') === value.replace(/\s+/g, ''),
  );
}

/** The family names a font-family value or a font shorthand names, lowercased and unquoted. */
function families(property: string, value: string): string[] {
  if (property === 'font-family')
    return splitTopLevel(value, /,/).map((f) =>
      f
        .replace(/^['"]|['"]$/g, '')
        .trim()
        .toLowerCase(),
    );
  // the shorthand: only the quoted names are read; a bare word may be a weight or a style
  return [...value.matchAll(/(['"])(.*?)\1/g)].map((m) => (m[2] ?? '').trim().toLowerCase());
}

/** True when a letter spacing is positive: not normal, not zero, not negative. */
function positiveSpacing(value: string): boolean {
  const v = value.trim();
  return v !== 'normal' && !/^-|^0(?:[a-z%]+)?$/.test(v) && !/^(?:inherit|initial|unset)$/.test(v);
}

/** Runs the CSS rules over one stylesheet. */
export function lintCss(
  file: string,
  text: string,
  rules: ReadonlySet<BrandRuleId> = new Set(CSS_RULES),
): BrandFinding[] {
  const out: BrandFinding[] = [];
  const decls = parseCss(text);
  const alternatesOnly = isAlternatesOnly(file);
  const on = (rule: CssRuleId): boolean =>
    rules.has(rule) && (!alternatesOnly || rule === 'css/chrome-alternates');
  const report = (rule: CssRuleId, decl: CssDeclaration): void => {
    out.push({
      rule,
      file,
      line: decl.line,
      column: decl.column,
      message: MESSAGES[rule],
      text: `${decl.selector || '(top level)'} { ${decl.property}: ${decl.value} }`.slice(0, 160),
    });
  };
  const byBlock = new Map<number, CssDeclaration[]>();
  for (const decl of decls) {
    const list = byBlock.get(decl.block) ?? [];
    list.push(decl);
    byBlock.set(decl.block, list);
  }

  for (const decl of decls) {
    const { property, value, selector } = decl;
    if (on('css/no-smooth-scroll') && property === 'scroll-behavior' && /\bsmooth\b/.test(value))
      report('css/no-smooth-scroll', decl);
    if (on('css/radius')) {
      const custom =
        property.startsWith('--') &&
        property.includes('radius') &&
        !RADIUS_TOKEN_NAMES.has(property);
      if (
        (RADIUS_PROPERTY.test(property) || custom) &&
        !isAllowedRadius(value) &&
        !radiusException(file, selector, value)
      )
        report('css/radius', decl);
    }
    if (
      (property === 'font-family' || property === 'font') &&
      !decl.atRules.some((a) => a.startsWith('@font-face'))
    ) {
      if (on('css/mono-outside-code') && MONO.test(value) && !isCodeSurface(file, selector))
        report('css/mono-outside-code', decl);
      if (on('css/inter-only')) {
        const outside = families(property, value).some(
          (f) => f && !f.startsWith('var(') && !SANS_FALLBACKS.has(f) && !MONO.test(f),
        );
        if (outside || NON_INTER_GENERIC.test(value)) report('css/inter-only', decl);
      }
    }
    if (
      on('css/inter-only') &&
      property === 'font-family' &&
      decl.atRules.some((a) => a.startsWith('@font-face'))
    ) {
      const face = families(property, value)[0] ?? '';
      if (!face.startsWith('inter')) report('css/inter-only', decl);
    }
    if (
      on('css/no-eyebrow') &&
      property === 'text-transform' &&
      /\buppercase\b/.test(value) &&
      (byBlock.get(decl.block) ?? []).some(
        (d) => d.property === 'letter-spacing' && positiveSpacing(d.value),
      )
    )
      report('css/no-eyebrow', decl);
    if (
      on('css/single-rail') &&
      (property.includes('rail-outer') ||
        /rail-outer/.test(selector) ||
        /--[a-z-]*rail-outer/.test(value))
    )
      report('css/single-rail', decl);
    if (
      on('css/z-index') &&
      property === 'z-index' &&
      file !== Z_INDEX.tokensFile &&
      !isScaleZIndex(value)
    )
      report('css/z-index', decl);
    if (on('css/no-shadow') && property === 'box-shadow' && shadowHasBlurOrOffset(value))
      report('css/no-shadow', decl);
    if (on('css/scrollbar') && !isOwnedBy(file, SCROLLBAR_OWNERS)) {
      const hidesOnly =
        /::-webkit-scrollbar\b/.test(selector) &&
        (byBlock.get(decl.block) ?? []).every(
          (d) => d.property === 'display' && d.value.trim() === 'none',
        );
      if (
        (/::-webkit-scrollbar/.test(selector) && !hidesOnly) ||
        property === 'scrollbar-color' ||
        (property === 'scrollbar-width' && value.trim() !== 'none')
      )
        report('css/scrollbar', decl);
    }
    if (
      on('css/numerals') &&
      !isOwnedBy(file, NUMERALS_OWNERS) &&
      (property === 'font-variant-numeric' || property === 'font-feature-settings') &&
      hasTabularLiteral(value)
    )
      report('css/numerals', decl);
    if (
      on('css/chrome-alternates') &&
      !isOwnedBy(file, ALTERNATES_OWNERS) &&
      breaksAlternates(property, value, selector)
    )
      report('css/chrome-alternates', decl);
  }
  return out;
}

/**
 * `css/chrome-alternates` over a file read as text (docs/POLISH-2.md 2.3 item 4): the generated
 * HTML and SVG under packages/theme/brand, whose style blocks and `style` attributes are read
 * declaration by declaration.
 */
export function lintAlternatesText(
  file: string,
  text: string,
  rules: ReadonlySet<BrandRuleId> = new Set(CSS_RULES),
): BrandFinding[] {
  if (!rules.has('css/chrome-alternates') || isOwnedBy(file, ALTERNATES_OWNERS)) return [];
  const body = stripComments(text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' ')));
  return alternatesInStyleText(body).map(({ index, property, value }) => {
    const before = body.slice(0, index);
    const line = before.split('\n').length;
    return {
      rule: 'css/chrome-alternates',
      file,
      line,
      column: index - before.lastIndexOf('\n'),
      message: MESSAGES['css/chrome-alternates'],
      text: `${property}: ${value}`.slice(0, 160),
    };
  });
}
