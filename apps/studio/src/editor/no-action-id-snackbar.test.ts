// No snackbar names an action id or an asset id (docs/PRODUCT.md section 2 rank 14; section 8.3's
// named unit test for B3; research 07 rule 22: a reason a seller reads is a sentence, never a code
// or an id). The seller audit read `asset.add: product-shot` after a picture upload (audit-seller
// 14); this test reads every `say(` call of the controller's source and refuses an interpolation
// of an action id, an asset id, a deck id, a block id or a template id, and a literal of the
// `<group>.<action>:` shape.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE = join(import.meta.dirname, 'controller.tsx');

/** Every `say(...)` call's argument text, with balanced parentheses, and its line. */
export function sayCalls(source: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const re = /\bsay\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    let quote: string | null = null;
    for (; i < source.length && depth > 0; i += 1) {
      const ch = source[i];
      if (quote !== null) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      else if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    const text = source.slice(match.index + match[0].length, i - 1);
    const line = source.slice(0, match.index).split('\n').length;
    out.push({ line, text });
  }
  return out;
}

/** The identifiers a template placeholder reads. */
function placeholders(text: string): string[] {
  const out: string[] = [];
  const re = /\$\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) out.push(match[1] ?? '');
  return out;
}

/** An id an expression would print: the action id `id`, an asset or deck or block id, a template id, `ids`. */
const ID_EXPRESSION =
  /(^|[^A-Za-z_$.])(id|ids|deckId|blockId|assetId|actionId|slideId|templateId)\b|\.(id|ids|deckId|blockId|assetId|from)\b|\.join\(/;

describe('no snackbar names an action id or an asset id (PRODUCT.md rank 14, 8.3)', () => {
  const source = readFileSync(SOURCE, 'utf8');
  const calls = sayCalls(source);

  it('reads every say( call of the controller', () => {
    expect(calls.length).toBeGreaterThan(10);
    expect(calls.every((call) => call.text.length > 0)).toBe(true);
  });

  it('interpolates no id into a template literal a seller reads', () => {
    const offending = calls.filter((call) =>
      placeholders(call.text).some((expression) => ID_EXPRESSION.test(expression)),
    );
    expect(
      offending.map((call) => `line ${call.line}: say(${call.text})`),
      'a say( with an id interpolated',
    ).toEqual([]);
  });

  it('carries no literal of the action id shape, `<group>.<action>:`, or an action id name', () => {
    const shape = /`[^`]*\b[a-z]+\.[a-zA-Z]+:\s/;
    const named =
      /['"`][^'"`]*\b(asset\.add|block\.insert|slide\.new|deck\.create|text\.replaceAll)\b/;
    const offending = calls.filter((call) => shape.test(call.text) || named.test(call.text));
    expect(offending.map((call) => `line ${call.line}: say(${call.text})`)).toEqual([]);
  });

  it('passes no variable named like an id straight through', () => {
    const offending = calls.filter((call) =>
      /^\s*(id|ids|deckId|blockId|assetId)\s*$/.test(call.text),
    );
    expect(offending.map((call) => `line ${call.line}: say(${call.text})`)).toEqual([]);
  });
});
