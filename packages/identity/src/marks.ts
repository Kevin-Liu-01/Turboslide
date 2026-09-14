// The identity mark (gslides-parity SPEC-3 4.1; research 11 sections 3.2, 6.1, 7.1): one
// MarkSpec per principal, computed once and drawn by one function at 24, 16 and 14 px. This
// module computes the spec (the variant, the initials, the Bayer density from two hash bits, the
// glyph seed, the hue when the room granted one, the trust state); the renderers
// (`renderMarkSvg`, `renderMarkBits`, `renderMarkPng1`) land with the `@turboslide/effects`
// dependency (bayer8, encodePng1) once the package is installed, in marks-render.ts, and the PNG
// path in a separate subpath so the browser safe entry never imports node:zlib.
//
// The hue is a second channel for live surfaces only and comes from the room's grant
// (hues.ts assignHueSlot), never from this function alone: `hue` is null unless the caller
// passes the granted slot, so a stored surface (comments, versions, Show changes) never colours.
import type { HueSlot } from './hues.ts';
import { hueFor, isHueSlot } from './hues.ts';
import type { ResolvedIdentity, Trust } from './resolve.ts';
import { digestUint32, sha256 } from './sha256.ts';

export type MarkVariant = 'initials' | 'glyph' | 'dither' | 'picture' | 'agent';
export type MarkDensity = 1 | 2 | 3 | 4;

export type MarkSpec = {
  variant: MarkVariant;
  /** One or two upper case letters; empty for the glyph, dither, picture and agent variants. */
  initials: string;
  /** The plate's Bayer density in eighths, 1 to 4, from two hash bits (11 6.1). */
  density: MarkDensity;
  /** The seed of the glyph field and the dither ramp, salted by the builder's "Another". */
  glyphSeed: number;
  pictureUrl?: string;
  presenter: boolean;
  self: boolean;
  hue: { slot: HueSlot; hex: string } | null;
  trust: Trust;
  /** The accessible name: the display name and the trust word (SPEC-3 4.9). */
  label: string;
};

export type MarkOptions = {
  /** The slot the room granted this session; null or absent on stored surfaces. */
  hueSlot?: HueSlot | null;
  presenter?: boolean;
  self?: boolean;
  /** The public URL of the 32 or 64 px picture when the variant is `picture`. */
  pictureUrl?: string;
};

const LETTER = /\p{L}|\p{Nd}/u;

/**
 * One or two letters from a display name: the first letter of the first two words, or the first
 * two letters of a one word name, upper cased. A label's chip carries the label's initial alone
 * (SPEC-3 4.2), so a label gives one letter.
 */
export function initialsFor(displayName: string, trust: Trust): string {
  const words = displayName
    .split(/\s+/u)
    .map((w) => [...w].find((ch) => LETTER.test(ch)) ?? '')
    .filter((ch) => ch.length > 0);
  if (words.length === 0) return '';
  if (trust === 'label') return (words[0] ?? '').toUpperCase();
  if (words.length >= 2) return `${words[0]}${words[1]}`.toUpperCase();
  const letters = [...(displayName.trim().split(/\s+/u)[0] ?? '')].filter((ch) => LETTER.test(ch));
  return letters.slice(0, 2).join('').toUpperCase();
}

/** The density and seed a principal id gives: byte 8's low two bits and bytes 12 to 15. */
export function markHash(
  principalId: string,
  salt = 0,
): { density: MarkDensity; glyphSeed: number } {
  const digest = sha256(principalId);
  const density = (((digest[8] ?? 0) & 3) + 1) as MarkDensity;
  const glyphSeed = (digestUint32(digest, 12) ^ (salt >>> 0)) >>> 0;
  return { density, glyphSeed };
}

/** The accessible name of a chip: the name and the trust word (research 11 5.2). */
export function accessibleName(identity: ResolvedIdentity): string {
  switch (identity.trust) {
    case 'guest':
      return `${identity.displayName}, guest`;
    case 'agent':
      return identity.runId ? `Agent, ${identity.runId}` : `Agent, ${identity.displayName}`;
    case 'label':
    case 'verified':
      return identity.displayName;
  }
}

/** The mark for a resolved identity (research 11 7.1). */
export function markSpec(identity: ResolvedIdentity, options: MarkOptions = {}): MarkSpec {
  const salt = identity.avatar.salt ?? 0;
  const { density, glyphSeed } = markHash(identity.principalId, salt);
  const hue =
    options.hueSlot !== undefined && options.hueSlot !== null && isHueSlot(options.hueSlot)
      ? { slot: options.hueSlot, hex: hueFor(options.hueSlot) }
      : null;
  const base = {
    density,
    glyphSeed,
    presenter: options.presenter ?? false,
    self: options.self ?? false,
    trust: identity.trust,
    label: accessibleName(identity),
  };
  if (identity.trust === 'agent') {
    return { ...base, variant: 'agent', initials: '', hue: null };
  }
  const chosen = identity.avatar.variant;
  if (chosen === 'picture' && options.pictureUrl) {
    return { ...base, variant: 'picture', initials: '', pictureUrl: options.pictureUrl, hue };
  }
  if (chosen === 'glyph' || chosen === 'dither') {
    return { ...base, variant: chosen, initials: '', hue };
  }
  const typed = identity.avatar.initials?.trim();
  const initials =
    typed && typed.length > 0
      ? [...typed]
          .filter((ch) => LETTER.test(ch))
          .slice(0, 2)
          .join('')
          .toUpperCase()
      : initialsFor(identity.displayName, identity.trust);
  return { ...base, variant: 'initials', initials, hue };
}
