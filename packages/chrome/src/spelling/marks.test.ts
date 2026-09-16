// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  MISSPELLING_CLASS,
  MISSPELLING_HIGHLIGHT,
  clearMisspellingMarks,
  markTargetsOf,
  paintMisspellings,
  rangeFor,
  runIdOfFinding,
  supportsHighlightApi,
} from './marks.ts';

// Underline errors as the editor's marks (gslides-parity SPEC-5 7.2; R10 4.7): the plain range to
// DOM Range mapping over a run's text nodes, the Custom Highlight registry when the page has it
// and the decorator span otherwise, both cleared without a trace.

function run(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `<span class="run" data-run="h/text">${html}</span>`;
  document.body.append(root);
  return root.querySelector('.run') as HTMLElement;
}

describe('the range mapping', () => {
  it('finds a plain range inside and across the run’s text nodes', () => {
    const element = run('Teh <i>quick</i> brwn');
    const first = rangeFor(element, 0, 3);
    expect(first?.toString()).toBe('Teh');
    const inside = rangeFor(element, 4, 9);
    expect(inside?.toString()).toBe('quick');
    const last = rangeFor(element, 10, 14);
    expect(last?.toString()).toBe('brwn');
    expect(rangeFor(element, 20, 25)).toBeNull();
    expect(rangeFor(element, 3, 3)).toBeNull();
  });
  it('names the run of a finding the way the renderer does', () => {
    expect(runIdOfFinding({ blockId: 'bullets', path: '/items/0/text' })).toBe(
      'bullets/items/0/text',
    );
    expect(runIdOfFinding({ blockId: 'h', path: '/text' })).toBe('h/text');
    expect(runIdOfFinding({ path: '/heading' })).toBe('heading/text');
    expect(runIdOfFinding({ path: '/notes' })).toBeNull();
  });
});

describe('painting and clearing', () => {
  const finding = (start: number, end: number) => ({
    slideId: 's',
    blockId: 'h',
    path: '/text',
    range: [start, end] as [number, number],
    word: 'x',
    suggestions: [],
  });
  it('wraps the ranges in decorator spans without the Highlight API and unwraps them', () => {
    const scope = {} as typeof globalThis;
    expect(supportsHighlightApi(scope)).toBe(false);
    const element = run('Teh quick brwn');
    const targets = markTargetsOf(element.parentElement as HTMLElement, [
      finding(0, 3),
      finding(10, 14),
    ]);
    expect(targets.length).toBe(1);
    expect(paintMisspellings(targets, scope)).toBe(2);
    const spans = element.querySelectorAll(`span.${MISSPELLING_CLASS}`);
    expect(spans.length).toBe(2);
    expect(spans[0]?.textContent).toBe('Teh');
    expect(spans[1]?.textContent).toBe('brwn');
    expect(element.textContent).toBe('Teh quick brwn');
    clearMisspellingMarks([element], scope);
    expect(element.querySelectorAll('span').length).toBe(0);
    expect(element.innerHTML).toBe('Teh quick brwn');
  });
  it('registers one Highlight over every range where the API exists', () => {
    const registry = new Map<string, unknown>();
    const scope = {
      CSS: {
        highlights: {
          set: (name: string, value: unknown) => void registry.set(name, value),
          delete: (name: string) => registry.delete(name),
        },
      },
      Highlight: class {
        ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      },
    } as unknown as typeof globalThis;
    expect(supportsHighlightApi(scope)).toBe(true);
    const element = run('Teh quick brwn');
    expect(
      paintMisspellings([{ element, findings: [finding(0, 3), finding(10, 14)] }], scope),
    ).toBe(2);
    expect((registry.get(MISSPELLING_HIGHLIGHT) as { ranges: Range[] }).ranges.length).toBe(2);
    expect(element.querySelectorAll('span').length).toBe(0);
    clearMisspellingMarks([element], scope);
    expect(registry.has(MISSPELLING_HIGHLIGHT)).toBe(false);
  });
});
