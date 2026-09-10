// A small CSS reader for the parity tests and the renderer's introspection: rules by selector with
// their declarations. It handles the subset the theme files use (comments, selector lists, one
// level of @media, @keyframes) and nothing else.

export type Declarations = Record<string, string>;

export type CssRule = { selector: string; declarations: Declarations; media?: string };

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseDeclarations(body: string): Declarations {
  const out: Declarations = {};
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim();
    const value = part
      .slice(colon + 1)
      .trim()
      .replace(/\s+/g, ' ');
    if (property !== '') out[property] = value;
  }
  return out;
}

/** Every rule in source order; selector lists are split into one rule per selector. */
export function parseCss(css: string): CssRule[] {
  const src = stripComments(css);
  const rules: CssRule[] = [];
  let i = 0;
  let media: string | undefined;
  let keyframes = false;
  while (i < src.length) {
    const ch = src.charAt(i);
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '}') {
      media = undefined;
      keyframes = false;
      i += 1;
      continue;
    }
    if (ch === '@') {
      const brace = src.indexOf('{', i);
      const head = src.slice(i, brace).trim();
      if (head.startsWith('@keyframes')) keyframes = true;
      else media = head;
      i = brace + 1;
      continue;
    }
    const brace = src.indexOf('{', i);
    const close = src.indexOf('}', brace);
    if (brace < 0 || close < 0) break;
    const selectors = src.slice(i, brace);
    const declarations = parseDeclarations(src.slice(brace + 1, close));
    if (!keyframes) {
      for (const selector of selectors.split(',')) {
        const trimmed = normalizeSelector(selector);
        if (trimmed === '') continue;
        rules.push(
          media === undefined
            ? { selector: trimmed, declarations }
            : { selector: trimmed, declarations, media },
        );
      }
    }
    i = close + 1;
  }
  return rules;
}

/** Whitespace collapsed and attribute quotes unified, so a formatter's quote style does not matter. */
export function normalizeSelector(selector: string): string {
  return selector.trim().replace(/\s+/g, ' ').replace(/"/g, "'");
}

/** The merged declarations of every rule with exactly this selector. */
export function declarationsOf(rules: ReadonlyArray<CssRule>, selector: string): Declarations {
  const wanted = normalizeSelector(selector);
  const out: Declarations = {};
  for (const rule of rules) {
    if (rule.selector === wanted) Object.assign(out, rule.declarations);
  }
  return out;
}

/** The custom properties (--name) declared on a selector, keyed without the dashes. */
export function customProperties(
  rules: ReadonlyArray<CssRule>,
  selector: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [property, value] of Object.entries(declarationsOf(rules, selector))) {
    if (property.startsWith('--')) out[property.slice(2)] = value;
  }
  return out;
}
