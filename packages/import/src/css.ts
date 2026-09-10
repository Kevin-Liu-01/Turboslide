// A small CSS rule reader for the slides' scoped <style> blocks (DECK-GRAMMAR.md:50-53), with a
// consumption ledger: the mapper takes the declarations it turns into block properties, and whatever
// is left becomes the slide's residual CSS under `ext.import.css` and a line in import-report.json
// ("rules consumed, rules left over", SPEC 9).

export type Declaration = { prop: string; value: string; consumed: boolean };
export type Rule = {
  selector: string;
  declarations: Declaration[];
  /** The selector with the section's stale scope class replaced by a placeholder. */
  key: string;
  consumed: boolean;
};

export type StyleSheet = { rules: Rule[]; scope?: string };

/** Parses `.s08 .scale .bar::after { content: ''; ... }` blocks. Comments are dropped. */
export function parseRules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const selector = text.slice(i, open).trim();
    const close = findClose(text, open);
    const body = text.slice(open + 1, close);
    i = close + 1;
    if (!selector) continue;
    const declarations: Declaration[] = [];
    for (const part of splitDeclarations(body)) {
      const at = part.indexOf(':');
      if (at < 0) continue;
      const prop = part.slice(0, at).trim();
      const value = part.slice(at + 1).trim();
      if (prop) declarations.push({ prop, value, consumed: false });
    }
    rules.push({ selector, declarations, key: selector, consumed: false });
  }
  return rules;
}

function findClose(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

/** Splits on `;` outside quotes and parentheses (`content: ''`, `url(...)`). */
function splitDeclarations(body: string): string[] {
  const out: string[] = [];
  let buffer = '';
  let quote: string | undefined;
  let depth = 0;
  for (const ch of body) {
    if (quote) {
      buffer += ch;
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      buffer += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ';' && depth === 0) {
      out.push(buffer);
      buffer = '';
      continue;
    }
    buffer += ch;
  }
  if (buffer.trim()) out.push(buffer);
  return out;
}

/**
 * The section's own scope class: the class on `<section>` that is not `slide`, a kind class or a
 * kind-scoped class (`s-opener`, `s-mood`, `s-closing`, `s-opener-brand`).
 */
export function scopeClassOf(classes: string[]): string | undefined {
  return classes.find(
    (c) => c !== 'slide' && c !== 'opener' && c !== 'mood' && !c.startsWith('s-'),
  );
}

/** Builds the sheet, rewriting the scope class in every selector to `SCOPE` so lookups are stable. */
export function readStyleSheet(css: string, scope: string | undefined): StyleSheet {
  const rules = parseRules(css);
  if (scope) {
    const re = new RegExp(`\\.${escapeRegExp(scope)}(?![\\w-])`, 'g');
    for (const rule of rules) rule.key = rule.selector.replace(re, 'SCOPE');
  }
  return { rules, scope };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Finds rules whose scope-normalized selector matches exactly. */
export function rulesFor(sheet: StyleSheet, key: string): Rule[] {
  return sheet.rules.filter((rule) => rule.key === key);
}

/** Takes one declaration from the rules matching a selector key, marking it consumed. */
export function take(sheet: StyleSheet, key: string, prop: string): string | undefined {
  for (const rule of rulesFor(sheet, key)) {
    const declaration = rule.declarations.find((d) => d.prop === prop);
    if (declaration) {
      declaration.consumed = true;
      if (rule.declarations.every((d) => d.consumed)) rule.consumed = true;
      return declaration.value;
    }
  }
  return undefined;
}

/** Marks every declaration of the rules matching a key as consumed. */
export function consumeRule(sheet: StyleSheet, key: string): boolean {
  let any = false;
  for (const rule of rulesFor(sheet, key)) {
    for (const d of rule.declarations) d.consumed = true;
    rule.consumed = true;
    any = true;
  }
  return any;
}

/** Marks a rule as consumed when its declarations equal the expected text (a known style block). */
export function consumeKnown(
  sheet: StyleSheet,
  key: string,
  expected: Record<string, string>,
): boolean {
  let matched = false;
  for (const rule of rulesFor(sheet, key)) {
    const ok = rule.declarations.every(
      (d) => normalize(expected[d.prop] ?? '') === normalize(d.value),
    );
    if (ok) {
      for (const d of rule.declarations) d.consumed = true;
      rule.consumed = true;
      matched = true;
    }
  }
  return matched;
}

function normalize(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*([,()/])\s*/g, '$1')
    .trim()
    .toLowerCase();
}

/** The rules and declarations nobody consumed, as CSS with the scope class rewritten. */
export function leftover(
  sheet: StyleSheet,
  scopeReplacement: string,
): { css: string; rules: string[] } {
  const out: string[] = [];
  const names: string[] = [];
  for (const rule of sheet.rules) {
    const remaining = rule.declarations.filter((d) => !d.consumed);
    if (remaining.length === 0) continue;
    const selector = rule.key.split('SCOPE').join(scopeReplacement);
    out.push(`${selector} { ${remaining.map((d) => `${d.prop}: ${d.value};`).join(' ')} }`);
    names.push(`${rule.selector} { ${remaining.map((d) => d.prop).join(', ')} }`);
  }
  return { css: out.join('\n'), rules: names };
}

export function consumedCount(sheet: StyleSheet): number {
  let count = 0;
  for (const rule of sheet.rules) for (const d of rule.declarations) if (d.consumed) count += 1;
  return count;
}
