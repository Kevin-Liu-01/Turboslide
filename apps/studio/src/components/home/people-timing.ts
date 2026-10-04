/**
 * The two people band's clock (docs/LANDING.md 2.10, 3.4 P-L). V4's file, kept apart from
 * `live/people.ts` so the band's shell (`HomePeople.tsx`, V1's) writes the caption's figure from it
 * without carrying the band's code: "A staged loop of 14 seconds". It sits outside `live/`, so the
 * route's chunk imports no module under `live/` (v4.md Q20: a driver that blocks `/live/` to load
 * the bare page, `home.present.print`'s, then still hydrates it).
 */

/** One cycle of the staged loop (B's 14 s, `direction-b/landing.js` 1735). */
export const PEOPLE_LOOP_MS = 14_000;

/** The caption's figure: the loop's length rounded to the second. */
export const PEOPLE_LOOP_SECONDS = Math.round(PEOPLE_LOOP_MS / 1000);

/**
 * A person's rhythm (LoveFrom's measured typing, B's `gaps`): the gap before each key, 70 to 240 ms
 * for a letter and 300 to 460 ms for a space, from a fixed hash of the key's place and a seed, so
 * every cycle types the same way and no two people type alike.
 */
export function keyGaps(text: string, seed: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let h = Math.imul(i + seed, 374761393) + Math.imul(seed * 7 + 3, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    out.push(text[i] === ' ' ? 300 + r * 160 : 70 + r * 170);
  }
  return out;
}
