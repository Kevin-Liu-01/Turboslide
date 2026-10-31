// The viewer's restyle (deck.$deckId.css) and its deck strip (-deck-strip.tsx). The shell's
// components are shared with /embed and the editor, and a stylesheet a route imports as a module
// can reach every page (-home-css.test.ts says how Landing 1 learned it), so every selector of
// the sheet names the viewer's root; the strip's ticks follow the shell's paging order.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stripTicks, tickClass } from './-deck-strip';

const here = dirname(fileURLToPath(import.meta.url));

const STEPS = /^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/;

function selectors(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...text.matchAll(/([^{};]+)\{/g)]
    .map((m) => (m[1] ?? '').trim())
    .filter((prelude) => !prelude.startsWith('@') && !STEPS.test(prelude))
    .flatMap((prelude) => prelude.split(/,(?![^(]*\))/).map((s) => s.replace(/\s+/g, ' ').trim()));
}

describe("the viewer's stylesheet", () => {
  const css = readFileSync(join(here, 'deck.$deckId.css'), 'utf8');

  it('names the route root in every selector', () => {
    const list = selectors(css);
    expect(list.length).toBeGreaterThan(40);
    const loose = list.filter(
      (s) =>
        !/^(?::root\[data-theme='dark'\] )?(?:\.ts-deckview\b|body:has\(\.ts-deckview\))/.test(s),
    );
    expect(loose).toEqual([]);
  });

  it('draws no negative letter spacing and no hand written tabular figures', () => {
    expect(css).not.toMatch(/letter-spacing:\s*-/);
    expect(css).not.toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});

describe('the deck strip', () => {
  const deck = {
    sections: [
      { id: 'a', name: 'Brand', slideIds: ['one', 'two', 'gone'] },
      { id: 'b', name: 'Website', slideIds: ['three'] },
    ],
    slides: [
      { id: 'three', n: 3, title: 'Three' },
      { id: 'one', n: 1, title: 'One' },
      { id: 'two', n: 2, title: '  Two\n words ' },
    ],
  } as unknown as Parameters<typeof stripTicks>[0];

  it('lists the slides in section order with each section start marked', () => {
    expect(stripTicks(deck)).toEqual([
      { id: 'one', n: '01', title: 'One', start: true },
      { id: 'two', n: '02', title: 'Two words', start: false },
      { id: 'three', n: '03', title: 'Three', start: true },
    ]);
  });

  it('marks the ticks before the place as past and the place as on', () => {
    const [one, two, three] = stripTicks(deck);
    if (!one || !two || !three) throw new Error('three ticks');
    expect(tickClass(one, 0, 1)).toBe('ts-deck-tick is-start is-past');
    expect(tickClass(two, 1, 1)).toBe('ts-deck-tick is-on');
    expect(tickClass(three, 2, 1)).toBe('ts-deck-tick is-start');
    expect(tickClass(one, 0, -1)).toBe('ts-deck-tick is-start');
  });
});
