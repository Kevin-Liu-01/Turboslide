// The six live hues (gslides-parity SPEC-3 4.1; research 11 section 2.2): the one sanctioned
// colour exception of round three, used on live surfaces only (remote carets, pointers, the
// remote selection outline, the Following ring, the 2 px live stripe on a present chip) and
// never on a stored surface. Each passes 3:1 against `#070707`, `#ffffff` and `#f2f2f0`, so the
// same six values serve both themes with no dark remap; hues.test.ts recomputes the WCAG ratios
// and the pairwise CIE76 distances under the protan and deutan simulations and fails below 3:1
// and 20 delta E. Over a dithered picture every hued element carries the two ring halo of
// HALO_INNER inside HALO_OUTER, because no colour passes 3:1 against a 50 percent Bayer field
// in both themes (11 2.1).
//
// Assignment is hash preferred and room resolved (11 3.1): preferredHueSlot is the slot a
// principal asks for in every room; the room grants it if free, else the least used slot with
// the lowest index (assignHueSlot). The grant lives on the presence record so every client draws
// the same colour; no client computes a hue on its own.
import { sha256 } from './sha256.ts';

export type HueSlot = 1 | 2 | 3 | 4 | 5 | 6;

export const HUE_SLOTS: readonly HueSlot[] = [1, 2, 3, 4, 5, 6];

/** Slot 1 is the brand blue; the other five were computed for the CVD floors (11 2.2). */
export const HUES: Readonly<Record<HueSlot, string>> = {
  1: '#2f5ce0',
  2: '#789000',
  3: '#0f6a6a',
  4: '#1d8fc8',
  5: '#148d51',
  6: '#5533ff',
};

/** The two ring halo over pictures: 1 px HALO_INNER inside 1 px HALO_OUTER (11 2.1). */
export const HALO_INNER = '#070707';
export const HALO_OUTER = '#ffffff';

/** The solids every hue is measured against: light ink and dark paper, light paper, dark ink. */
export const HUE_GROUNDS: readonly string[] = ['#070707', '#ffffff', '#f2f2f0'];

export function isHueSlot(value: unknown): value is HueSlot {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
}

/** The hex value of a slot; RangeError outside 1 to 6. */
export function hueFor(slot: number): string {
  if (!isHueSlot(slot)) throw new RangeError(`hue slot must be 1 to 6, got ${String(slot)}`);
  return HUES[slot];
}

/** The slot a principal prefers in every room: sha256(principalId)[0] mod 6, plus one. */
export function preferredHueSlot(principalId: string): HueSlot {
  const first = sha256(principalId)[0] ?? 0;
  return ((first % 6) + 1) as HueSlot;
}

/**
 * The slot a room grants a joining principal: the preferred slot when no live entry holds it,
 * else the slot with the fewest live holders, ties broken by the lowest index (11 3.1 rule 2).
 * `held` lists the slots of the live entries in the roster, repeats included.
 */
export function assignHueSlot(preferred: HueSlot, held: readonly HueSlot[]): HueSlot {
  const counts = new Map<HueSlot, number>(HUE_SLOTS.map((slot) => [slot, 0]));
  for (const slot of held) counts.set(slot, (counts.get(slot) ?? 0) + 1);
  if ((counts.get(preferred) ?? 0) === 0) return preferred;
  let best: HueSlot = 1;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const slot of HUE_SLOTS) {
    const count = counts.get(slot) ?? 0;
    if (count < bestCount) {
      best = slot;
      bestCount = count;
    }
  }
  return best;
}

/** `#rrggbb` to three channels in 0 to 255. */
export function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) throw new RangeError(`not a #rrggbb colour: ${JSON.stringify(hex)}`);
  const n = Number.parseInt(match[1] ?? '000000', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.2 relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.2 contrast ratio between two #rrggbb colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}
