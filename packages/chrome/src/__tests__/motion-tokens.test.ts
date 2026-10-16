// Reduced motion stops every animation and transition of the chrome's and the viewer's sheets from
// one place (the GF-fix of wave 1, after the review's finding that Tools > Preferences > Reduce
// motion left the saving and export pulses, the refused card's shake, the progress bar, the shader
// chevron and the upload sweep moving): tokens.css zeroes every `--pt-dur-*` duration under the
// system's `prefers-reduced-motion: reduce` and under the root's `data-reduce-motion`, so no sheet
// may write its own duration in milliseconds or seconds. Node, reading the sheets on disk.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXIT_COPY_ATTRIBUTE } from '@turboslide/viewer/reduce-motion';

const PACKAGES = resolve(import.meta.dirname, '../../..');
const ROOTS = [join(PACKAGES, 'chrome/src'), join(PACKAGES, 'viewer/src')];
const TOKENS = join(PACKAGES, 'chrome/src/tokens.css');

function sheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sheets(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

/** Splits a declaration's value on its top level commas (never those inside a `var()` or `cubic-bezier()`). */
function layers(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      out.push(value.slice(start, i));
      start = i + 1;
    }
  }
  out.push(value.slice(start));
  return out.map((part) => part.trim());
}

const TIME = /^(\d*\.?\d+)(ms|s)$/;

/**
 * The duration of one layer of an `animation` or `transition` shorthand (its first time; the second
 * is the delay) or of a `-duration` longhand: a literal time over zero is a finding, a token is not.
 */
function literalDuration(layer: string): string | null {
  const words = layer.match(/var\([^()]*\)|[^\s()]+(?:\([^()]*\))?/g) ?? [];
  for (const word of words) {
    if (word.startsWith('var(--pt-dur-')) return null;
    const time = TIME.exec(word);
    if (time !== null) return Number(time[1]) > 0 ? word : null;
  }
  return null;
}

/** Every `animation`, `transition` and duration longhand of a sheet with a literal duration. */
function literalDurations(css: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const declaration =
    /(?:^|[;{\s])(animation|transition|animation-duration|transition-duration)\s*:\s*([^;}]+)/g;
  for (const match of text.matchAll(declaration)) {
    const value = (match[2] ?? '').trim();
    if (/^none\b/.test(value)) continue;
    if (layers(value).some((layer) => literalDuration(layer) !== null)) {
      const line = text.slice(0, match.index).split('\n').length;
      found.push({ line, text: `${match[1]}: ${value.replace(/\s+/g, ' ')}` });
    }
  }
  return found;
}

/** The `--pt-dur-*` names a stretch of CSS declares, each with its last value. */
function durationTokens(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of css.matchAll(/(--pt-dur-[a-z]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    /* a reduced block's 0ms never hides the value the root gave the name */
    if (name !== undefined && value !== undefined && !(out.has(name) && value.trim() === '0ms'))
      out.set(name, value.trim());
  }
  return out;
}

/** The body of the first block after `head` (balanced braces). */
function blockAfter(css: string, head: string): string {
  const at = css.indexOf(head);
  expect(at, head).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unclosed block after ${head}`);
}

describe('the motion tokens', () => {
  it('no sheet of the chrome or the viewer writes a duration of its own', () => {
    const findings = ROOTS.flatMap((root) =>
      sheets(root).flatMap((file) =>
        literalDurations(readFileSync(file, 'utf8')).map(
          ({ line, text }) => `${relative(PACKAGES, file)}:${line} ${text}`,
        ),
      ),
    );
    expect(findings).toEqual([]);
  });

  it('both reduced motion blocks zero every duration token the root declares', () => {
    const css = readFileSync(TOKENS, 'utf8');
    /* the names declared with a duration anywhere in the file, the reduced blocks aside */
    const declared = [...durationTokens(css)]
      .filter(([, value]) => value !== '0ms')
      .map(([n]) => n);
    expect(declared).toContain('--pt-dur-fast');
    expect(declared).toContain('--pt-dur-loop');
    for (const head of ['@media (prefers-reduced-motion: reduce)', ':root[data-reduce-motion] {']) {
      const zeroed = durationTokens(blockAfter(css, head));
      for (const name of declared) expect(zeroed.get(name), `${head} ${name}`).toBe('0ms');
    }
  });

  it('finds a literal duration in a shorthand and a longhand, and passes tokens, delays and none', () => {
    const css = [
      '.a { animation: spin 1.2s linear infinite; }',
      '.b { transition: opacity var(--pt-dur-fast) ease-out, transform 160ms ease-out; }',
      '.c { transition-duration: 90ms; }',
      '.d { animation: pt-view-in var(--pt-dur-enter) var(--pt-ease-out) 60ms both; }',
      '.e { transition: none; animation: none; }',
      '.f { transition: transform var(--pt-dur-fast) cubic-bezier(0.2, 0, 0, 1); }',
      '/* animation: commented 1s; */',
      '.g { transition: opacity 0ms; }',
    ].join('\n');
    expect(literalDurations(css).map((f) => f.line)).toEqual([1, 2, 3]);
  });
});

// The exit copies of Layer.ts (the Glyphfield port, PLAN.md wave 2 item 7): a closed menu, search
// card or dialog leaves an inert copy marked `data-exiting`, and its own sheet animates the copy
// with opacity and transform alone at the leave duration, so the reduced blocks above stop it too.
describe('the exit copies (PLAN.md wave 2 item 7)', () => {
  const read = (name: string) => readFileSync(join(PACKAGES, 'chrome/src', name), 'utf8');
  /** The declarations of the first rule whose selector list names `selector`. */
  const ruleOf = (css: string, selector: string): string | undefined => {
    const at = css.indexOf(selector);
    if (at < 0) return undefined;
    const open = css.indexOf('{', at);
    return css.slice(open + 1, css.indexOf('}', open));
  };
  /** The properties a keyframes block sets. */
  const keyframeProps = (css: string, name: string): string[] => {
    const at = css.indexOf(`@keyframes ${name} {`);
    const end = css.indexOf('\n}', at);
    return [...css.slice(at, end).matchAll(/([a-z-]+):/g)].map((m) => m[1] ?? '');
  };

  it('animates each copy and its card at --pt-dur-leave with opacity and transform alone', () => {
    expect(EXIT_COPY_ATTRIBUTE).toBe('data-exiting');
    const rows: Array<[string, string, string]> = [
      ['Menu.css', '.ts-menu[data-exiting]', 'pt-fade-out'],
      ['Palette.css', '.pt-search[data-exiting] {', 'pt-fade-out'],
      ['Palette.css', '.pt-search[data-exiting] .pt-search-card', 'pt-search-out'],
      ['Dialog.css', '.ts-dialog-float[data-exiting] {', 'pt-fade-out'],
      ['Dialog.css', '.ts-dialog-float[data-exiting] .ts-dialog', 'ts-dialog-out'],
    ];
    for (const [sheet, selector, keyframes] of rows) {
      const css = read(sheet);
      expect(ruleOf(css, selector), `${sheet} ${selector}`).toContain(
        `animation: ${keyframes} var(--pt-dur-leave) var(--pt-ease-in) both;`,
      );
      const props = keyframeProps(
        keyframes === 'pt-fade-out' ? read('tokens.css') : css,
        keyframes,
      );
      expect(props.length, keyframes).toBeGreaterThan(0);
      for (const prop of props)
        expect(['opacity', 'transform'], `${keyframes} ${prop}`).toContain(prop);
    }
    expect(read('Dialog.css')).toContain(
      '.ts-dialog-scrim[data-exiting],\n.ts-dialog-float[data-exiting] {',
    );
  });

  it('stops every part inside a copy and takes the pointer off it, from tokens.css', () => {
    const css = read('tokens.css');
    expect(ruleOf(css, '[data-exiting] {')).toContain('pointer-events: none;');
    expect(ruleOf(css, '[data-exiting] * {')).toContain('animation: none;');
    expect(css).toMatch(/--pt-ease-in: ease-in;/);
  });
});
