import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ACTIONS } from '@turboslide/schema/actions';
import { GT_COVER } from '@turboslide/theme/brand/site';

import {
  CALL_TEXTS,
  FIELD_CALLS,
  FIELD_INK,
  FIELD_REACH,
  FIELD_SOURCE,
  callText,
  inkAt,
  reachAt,
} from './-decks-field';

// The start band's field on /decks (-decks-field.tsx; Kevin, 2026-10-30): the band is set in the
// calls its three tiles make. These pin that the text is the agent surface's own (every call a
// valid input of an HTTP action, so a renamed action or field fails here before the band shows a
// call that no longer works), and that the reach and the ink stay in range.

describe("the start band's calls", () => {
  it('are the three tiles in order: Blank, the GT brand deck, the gallery', () => {
    expect(FIELD_CALLS.map((call) => call.id)).toEqual([
      'deck.create',
      'deck.create',
      'template.list',
    ]);
    expect(FIELD_CALLS[0].input.from).toBe('blank');
    expect(FIELD_CALLS[1].input.from).toBe(GT_COVER.deck);
  });

  it('are valid inputs of actions the HTTP transport serves', () => {
    for (const call of FIELD_CALLS) {
      const spec = ACTIONS[call.id];
      expect(spec.transports, call.id).toContain('http');
      expect(spec.input.safeParse(call.input).success, call.id).toBe(true);
    }
  });

  it('read as the request an agent sends', () => {
    expect(callText(FIELD_CALLS[1])).toBe(
      'POST /api/actions/deck.create {"name":"GT brand deck","from":"gt-brand"} ',
    );
    expect(CALL_TEXTS).toHaveLength(FIELD_CALLS.length);
    expect(FIELD_SOURCE).toBe(CALL_TEXTS.join(''));
    expect(FIELD_SOURCE).not.toMatch(/\n/);
  });
});

describe("a tile's reach and a cell's ink", () => {
  it('pulls fully at the plate and not at all at the reach', () => {
    expect(reachAt(0, 0)).toBe(1);
    expect(reachAt(FIELD_REACH.x, 0)).toBe(0);
    expect(reachAt(0, FIELD_REACH.y)).toBe(0);
    expect(reachAt(FIELD_REACH.x * 2, FIELD_REACH.y * 2)).toBe(0);
  });

  it('eases down with the distance', () => {
    let last = 1;
    for (let dx = 0; dx <= FIELD_REACH.x; dx += 8) {
      const at = reachAt(dx, 0);
      expect(at).toBeLessThanOrEqual(last);
      expect(at).toBeGreaterThanOrEqual(0);
      last = at;
    }
  });

  it('rests at its own ink and reads at the revealed ink under the lens', () => {
    expect(inkAt(FIELD_INK.ground, 0)).toBe(FIELD_INK.ground);
    expect(inkAt(FIELD_INK.ground, 1)).toBe(FIELD_INK.revealed);
    expect(inkAt(FIELD_INK.tile, 1)).toBe(FIELD_INK.revealed);
    /* a cell already darker than the revealed ink stays as it is */
    expect(inkAt(0.9, 1)).toBe(0.9);
    expect(FIELD_INK.ground).toBeLessThan(FIELD_INK.tile);
    expect(FIELD_INK.tile).toBeLessThan(FIELD_INK.revealed);
  });
});

// The presentations pages' stylesheets reach every page (a route imports them as modules;
// routes/-home-css.test.ts tells the incident), so every selector names the pages' root. The two
// rules the plain pages share are named here.

const STEPS = /^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/;

function selectors(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...text.matchAll(/([^{};]+)\{/g)]
    .map((m) => (m[1] ?? '').trim())
    .filter((prelude) => !prelude.startsWith('@') && !STEPS.test(prelude))
    .flatMap((prelude) => prelude.split(/,(?![^(]*\))/).map((s) => s.trim()));
}

describe("the presentations pages' stylesheets", () => {
  const SHARED = new Set(['html:has(.ts-home-page)', '.ts-home a:not(.pt-ib)']);

  it('name the root of the pages in every selector of decks.css', () => {
    const all = selectors(readFileSync(new URL('./decks.css', import.meta.url), 'utf8'));
    expect(all.length).toBeGreaterThan(80);
    expect(all.filter((s) => !SHARED.has(s) && !/\.ts-decks-page\b/.test(s))).toEqual([]);
  });

  it('name the gallery root in every selector of decks.templates.css', () => {
    const all = selectors(readFileSync(new URL('./decks.templates.css', import.meta.url), 'utf8'));
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter((s) => !/^\.ts-gallery-page\b/.test(s))).toEqual([]);
  });
});
