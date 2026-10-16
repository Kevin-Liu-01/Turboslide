import { describe, expect, it } from 'vitest';

import {
  angleOf,
  discsOf,
  fanBox,
  labelAngles,
  labelBox,
  orbitFor,
  pointAt,
  STEP_MIN,
} from './orbit';
import type { Box, Orbit, OrbitInput } from './orbit';

// The title's orbits (orbit.ts; Kevin, 2026-10-16): each stack sits on a circle centred on its
// letter's bowl, at rest and with its fan open every avatar is clear of the letter, of every other
// glyph, of the stacks placed before it and of the bounds, and the fan centres on the preferred
// angle when the circle has the room. The boxes are the glyphs of "people and" at 72 px as the
// page measured them (the e at the origin of its own bowl), and of the phone's three lines.

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });

/** "ople and" around the e of "people" at 72 px, y down, in px from the e's bowl centre. */
const E = box(-17, -19, 17, 19);
const DESKTOP: Box[] = [
  box(-108, -19, -72, 19), // o
  box(-68, -19, -33, 33), // p, its descender
  box(-29, -34, -22, 19), // l, its ascender
  box(86, -19, 118, 19), // a, after the room the margin keeps
  box(122, -19, 152, 19), // n
  box(156, -34, 190, 19), // d
];
const DESKTOP_BOUNDS = box(-600, -110, 700, 46);

/** The phone's "people" alone on its 44 px line, between "Presentations for" and "and agents". */
const PHONE_E = box(-9, -10, 9, 10);
const PHONE: Box[] = [
  box(-89, -54, 167, -34), // "Presentations for", down to its baseline
  box(-89, -18, -12, 10), // "peopl", up to the l
  box(-89, 34, 79, 54), // "and agents" from its x-height
  box(45, 30, 55, 54), // the t of "agents"
];
const PHONE_BOUNDS = box(-89, -82, 269, 82);

function avatars(orbit: Orbit, n: number, step: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) =>
    pointAt(orbit.cx, orbit.cy, orbit.r, angleOf(i, n, orbit.mid, step)),
  );
}

function distance(x: number, y: number, b: Box): number {
  return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
}

function expectClear(input: OrbitInput, orbit: Orbit): void {
  const half = input.s / 2;
  const rho = Math.max(input.letter.x1 - input.letter.x0, input.letter.y1 - input.letter.y0) / 2;
  for (const step of [orbit.rest, orbit.open])
    for (const p of avatars(orbit, input.n, step)) {
      expect(Math.hypot(p.x - orbit.cx, p.y - orbit.cy)).toBeGreaterThanOrEqual(rho + half);
      for (const glyph of input.glyphs) expect(distance(p.x, p.y, glyph)).toBeGreaterThan(half);
      for (const disc of input.discs)
        expect(Math.hypot(p.x - disc.x, p.y - disc.y)).toBeGreaterThan(half + disc.r);
      expect(p.x - half).toBeGreaterThanOrEqual(input.bounds.x0);
      expect(p.x + half).toBeLessThanOrEqual(input.bounds.x1);
      expect(p.y - half).toBeGreaterThanOrEqual(input.bounds.y0);
      expect(p.y + half).toBeLessThanOrEqual(input.bounds.y1);
    }
}

describe('the orbit of a stack', () => {
  const people: OrbitInput = {
    letter: E,
    glyphs: DESKTOP,
    discs: [],
    bounds: DESKTOP_BOUNDS,
    n: 5,
    s: 36,
    prefer: 45,
  };

  it('centres on the letter’s bowl and keeps every avatar clear at rest and open', () => {
    const orbit = orbitFor(people);
    expect(orbit.cx).toBe(0);
    expect(orbit.cy).toBe(0);
    expect(orbit.rest).toBeGreaterThan(0);
    expect(orbit.open).toBeGreaterThanOrEqual(orbit.rest);
    /* the steps show each face: at least STEP_MIN avatars apart along the arc */
    expect((orbit.rest * Math.PI * orbit.r) / 180).toBeGreaterThanOrEqual(STEP_MIN * 36 - 0.01);
    expectClear(people, orbit);
  });

  it('runs from over the letter down its right side, between the l and the next word', () => {
    const orbit = orbitFor(people);
    const first = angleOf(0, 5, orbit.mid, orbit.rest);
    const last = angleOf(4, 5, orbit.mid, orbit.rest);
    expect(first).toBeGreaterThan(75);
    expect(last).toBeLessThan(0);
    /* close enough to read as orbiting: within one avatar of the letter */
    expect(orbit.r).toBeLessThan(19 + 36 + 8);
  });

  it('keeps the next stack clear of the avatars placed before it', () => {
    const first = orbitFor(people);
    const discs = discsOf(first, 5, 36);
    const agents: OrbitInput = { ...people, letter: box(104, -19, 136, 19), discs, n: 4 };
    const orbit = orbitFor({ ...agents, glyphs: [] });
    expectClear({ ...agents, glyphs: [] }, orbit);
  });

  it('fits between the lines of the phone’s title, on the right of the letter', () => {
    const input: OrbitInput = {
      letter: PHONE_E,
      glyphs: PHONE,
      discs: [],
      bounds: PHONE_BOUNDS,
      n: 5,
      s: 22,
      prefer: 10,
    };
    const orbit = orbitFor(input);
    expectClear(input, orbit);
    for (const p of avatars(orbit, 5, orbit.rest)) expect(p.x).toBeGreaterThan(-12);
  });

  it('centres the fan on the preferred angle when the circle has the room', () => {
    const open: OrbitInput = { ...people, glyphs: [], prefer: 60 };
    expect(orbitFor(open).mid).toBe(60);
  });

  it('turns a name label off its radius where the radius lays it over a letter', () => {
    const orbit = orbitFor(people);
    const sizes = Array.from({ length: 5 }, () => ({ w: 90, h: 20 }));
    const angles = labelAngles(orbit, 5, 36, sizes, DESKTOP, DESKTOP_BOUNDS);
    const overlaps = (b: Box): boolean =>
      DESKTOP.some((g) => b.x0 < g.x1 && b.x1 > g.x0 && b.y0 < g.y1 && b.y1 > g.y0);
    let turned = 0;
    angles.forEach((theta, i) => {
      for (const step of [orbit.open, orbit.rest]) {
        const phi = angleOf(i, 5, orbit.mid, step);
        const c = pointAt(orbit.cx, orbit.cy, orbit.r, phi);
        expect(overlaps(labelBox(c, phi, 36, theta, sizes[i]!, true))).toBe(false);
      }
      const radius = angleOf(i, 5, orbit.mid, orbit.open);
      if (theta !== radius) turned += 1;
      /* on its radius the label of the avatar beside "and" would cover the a */
      if (i === 3) {
        const c = pointAt(orbit.cx, orbit.cy, orbit.r, radius);
        expect(overlaps(labelBox(c, radius, 36, radius, sizes[i]!, true))).toBe(true);
      }
    });
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThan(5);
  });

  it('gives the open fan a hit area that covers every avatar', () => {
    const orbit = orbitFor(people);
    const hit = fanBox(orbit, 5, 36);
    for (const step of [orbit.rest, orbit.open])
      for (const p of avatars(orbit, 5, step)) {
        expect(p.x - 18).toBeGreaterThanOrEqual(hit.x0 - 0.001);
        expect(p.x + 18).toBeLessThanOrEqual(hit.x1 + 0.001);
        expect(p.y - 18).toBeGreaterThanOrEqual(hit.y0 - 0.001);
        expect(p.y + 18).toBeLessThanOrEqual(hit.y1 + 0.001);
      }
  });
});
