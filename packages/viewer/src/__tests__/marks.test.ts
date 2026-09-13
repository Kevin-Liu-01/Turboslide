import { describe, expect, it } from 'vitest';

import { parseText, serializeRuns } from '@turboslide/schema/text';

import { runsFromNode, textFromNode } from '../InlineText';
import type { RunNode } from '../InlineText';
import {
  boldOfRange,
  colorFromCss,
  colorRange,
  marksAt,
  marksOf,
  rangeHasMark,
  setBoldRange,
  toggleMark,
  wordRangeAt,
} from '../marks';

// The run marks of inline editing (gslides-parity SPEC-2 6.2 "Text marks", 7.2, 0.54): the toggles
// on the run model, the word at the caret, the pressed state, the elements read back.

function text(value: string): RunNode {
  return { nodeType: 3, nodeName: '#text', nodeValue: value, childNodes: [] };
}

function el(
  name: string,
  children: RunNode[],
  attrs: Record<string, string> = {},
  classes: string[] = [],
): RunNode {
  return {
    nodeType: 1,
    nodeName: name,
    childNodes: children,
    getAttribute: (attr) => attrs[attr] ?? null,
    classList: { contains: (cls) => classes.includes(cls) },
  };
}

describe('toggling marks over a range', () => {
  it('sets a mark over part of a plain text and clears it when every run has it', () => {
    expect(toggleMark('Hello world', [0, 5], 'i')).toBe('[Hello]{i} world');
    expect(toggleMark('[Hello]{i} world', [0, 5], 'i')).toBe('Hello world');
    expect(rangeHasMark('[Hello]{i} world', [0, 5], 'i')).toBe(true);
    expect(rangeHasMark('[Hello]{i} world', [0, 8], 'i')).toBe(false);
    /* a mixed range sets the mark on the rest */
    expect(toggleMark('[Hello]{i} world', [0, 11], 'i')).toBe('[Hello world]{i}');
  });

  it('keeps sup and sub exclusive and stacks the other marks in canonical order', () => {
    expect(toggleMark('x2', [1, 2], 'sup')).toBe('x[2]{sup}');
    expect(toggleMark('x[2]{sup}', [1, 2], 'sub')).toBe('x[2]{sub}');
    const both = toggleMark(toggleMark('word', [0, 4], 'u'), [0, 4], 'i');
    expect(both).toBe('[word]{i u}');
    expect(toggleMark('one\ntwo', [0, 7], 's')).toBe('[one]{s}\n[two]{s}');
  });

  it('toggles bold through the display run, never execCommand', () => {
    expect(setBoldRange('Hello world', [0, 5], true)).toBe('*Hello* world');
    expect(boldOfRange('*Hello* world', [0, 5])).toBe(true);
    expect(boldOfRange('*Hello* world', [0, 7])).toBe(false);
    expect(toggleMark('*Hello* world', [0, 5], 'b')).toBe('Hello world');
    expect(toggleMark('Hello world', [6, 11], 'b')).toBe('Hello *world*');
    /* the mark span nests inside the display run in canonical form */
    expect(toggleMark('*Hello* world', [0, 5], 'i')).toBe('*[Hello]{i}* world');
  });

  it('writes and clears a text or highlight colour', () => {
    expect(colorRange('Hello world', [0, 5], 'color', 'red')).toBe('[Hello]{c:red} world');
    expect(colorRange('[Hello]{c:red} world', [0, 5], 'color', null)).toBe('Hello world');
    expect(colorRange('Hello', [0, 5], 'highlight', 'amber')).toBe('[Hello]{h:amber}');
  });

  it('expands the caret to the word around it and reads the pressed state', () => {
    expect(wordRangeAt('Hello world', 2)).toEqual([0, 5]);
    expect(wordRangeAt('Hello world', 5)).toEqual([0, 5]);
    expect(wordRangeAt('Hello world', 6)).toEqual([6, 11]);
    expect(wordRangeAt('a  b', 2)).toEqual([2, 2]);
    expect(marksAt('[Hello]{i u} world', 2)).toEqual({ i: true, u: true });
    expect(marksAt('*Hello* world', 2)).toEqual({ b: true });
    expect(marksOf('[Hello]{i} world', [0, 5])).toEqual({ i: true });
    expect(marksOf('[Hello]{i} world', [0, 11])).toEqual({});
  });
});

describe('reading the elements back (7.2)', () => {
  it('reads i, u, s, sup, sub, a colour span and a mark into the runs', () => {
    const node = el('P', [
      el('I', [text('a')]),
      el('U', [text('b')]),
      el('S', [text('c')]),
      el('SUP', [text('d')]),
      el('SUB', [text('e')]),
      el('SPAN', [text('f')], { style: 'color:var(--red)' }),
      el('MARK', [text('g')], { style: 'background:#f0a020' }),
      el('B', [el('I', [text('h')])]),
    ]);
    const runs = runsFromNode(node);
    expect(runs).toEqual([
      { t: 'a', i: true },
      { t: 'b', u: true },
      { t: 'c', s: true },
      { t: 'd', sup: true },
      { t: 'e', sub: true },
      { t: 'f', color: 'red' },
      { t: 'g', hl: 'amber' },
      { t: 'h', b: true, i: true },
    ]);
    const markup = textFromNode(node);
    expect(markup).toBe('[a]{i}[b]{u}[c]{s}[d]{sup}[e]{sub}[f]{c:red}[g]{h:amber}*[h]{i}*');
    /* the round trip through the parser keeps every mark */
    expect(serializeRuns(parseText(markup))).toBe(markup);
  });

  it('reads the renderer’s colours back to palette tokens and hexes', () => {
    expect(colorFromCss('var(--ink)')).toBe('ink');
    expect(colorFromCss('#12a37a')).toBe('green');
    expect(colorFromCss('#ABCDEF')).toBe('#abcdef');
    expect(colorFromCss('rgb(18, 163, 122)')).toBe('green');
    expect(colorFromCss('var(--nothing)')).toBeNull();
    expect(colorFromCss('blue')).toBeNull();
  });
});
