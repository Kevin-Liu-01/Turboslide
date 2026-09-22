// No snackbar names an action id or an asset id (docs/PRODUCT.md section 2 rank 14; section 8.3's
// named unit test for B3; research 07 rule 22: a reason a seller reads is a sentence, never a code
// or an id). The seller audit read `asset.add: product-shot` after a picture upload (audit-seller
// 14); this test reads every `say(` call of the controller's source and refuses an interpolation
// of an action id, an asset id, a deck id, a block id or a template id, and a literal of the
// `<group>.<action>:` shape. The features round (docs/FEATURES.md 7.3, B3 extended) reads the table,
// chart and logo paths the same way: the editor's `notice(` calls (packages/viewer/src/Editor.tsx,
// the table marks, the arrows, the logo placement) and the Logo dialog's `setError(` calls
// (packages/chrome/src/dialogs/Logo.tsx).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE = join(import.meta.dirname, 'controller.tsx');
/** The other sources a seller's sentence comes from, with the call each one says it through. */
const OTHER_SOURCES: ReadonlyArray<{ file: string; call: string }> = [
  { file: join(import.meta.dirname, '../../../../packages/viewer/src/Editor.tsx'), call: 'notice' },
  {
    file: join(import.meta.dirname, '../../../../packages/chrome/src/dialogs/Logo.tsx'),
    call: 'setError',
  },
];

/** Every `say(...)` call's argument text, with balanced parentheses, and its line. */
export function sayCalls(source: string, call = 'say'): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const re = new RegExp(`\\b${call}\\(`, 'g');
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

describe('the table, chart and logo paths say no id either (docs/FEATURES.md 7.3)', () => {
  for (const { file, call } of OTHER_SOURCES) {
    const calls = sayCalls(readFileSync(file, 'utf8'), call);
    const name = file.slice(file.lastIndexOf('/') + 1);
    it(`reads the ${call}( calls of ${name} and finds no interpolated id and no action id literal`, () => {
      expect(calls.length, `${name} says something`).toBeGreaterThan(0);
      const interpolated = calls.filter((each) =>
        placeholders(each.text).some((expression) => ID_EXPRESSION.test(expression)),
      );
      expect(
        interpolated.map((each) => `${name} line ${each.line}: ${call}(${each.text})`),
      ).toEqual([]);
      const shape = /`[^`]*\b[a-z]+\.[a-zA-Z]+:\s/;
      const named =
        /['"`][^'"`]*\b(asset\.add|block\.insert|slide\.new|deck\.create|text\.replaceAll|logo\.insert|logo\.search)\b/;
      const literal = calls.filter((each) => shape.test(each.text) || named.test(each.text));
      expect(literal.map((each) => `${name} line ${each.line}: ${call}(${each.text})`)).toEqual([]);
      const bare = calls.filter((each) =>
        /^\s*(id|ids|deckId|blockId|assetId|slug)\s*$/.test(each.text),
      );
      expect(bare.map((each) => `${name} line ${each.line}: ${call}(${each.text})`)).toEqual([]);
    });
  }
});
