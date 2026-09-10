// Identifiers (SPEC 4.2, 4.3). Slides, sections, assets and the deck are addressed by slugs,
// never by numbers: numbers, counts and titles are derived from the manifest's section order.
// A block is addressed as `slideId#blockId`; a run inside a text is a JSON pointer plus a
// character range (SPEC 4.3 "Addressing").
import { z } from 'zod';

export type SlideId = string;
export type BlockId = string;
export type AssetId = string;
export type SectionId = string;

/** Lower-case words joined by single hyphens: 'why-the-redesign', 'gt-brand'. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A block id is unique within its slide: 'h', 'p1', 'list', 'fig'. Hyphens are allowed. */
export const BLOCK_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const slugSchema = z
  .string()
  .regex(SLUG_PATTERN, 'a slug: lower-case letters and digits joined by single hyphens');

export const blockIdSchema = z
  .string()
  .regex(BLOCK_ID_PATTERN, 'a block id: lower-case letters, digits and hyphens');

export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/** Turns free text into a slug: 'The production site' becomes 'the-production-site'. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `slideId#blockId`, the block address used by the CLI and the findings (SPEC 4.3). */
export function blockAddress(slideId: SlideId, blockId: BlockId): string {
  return `${slideId}#${blockId}`;
}

export function parseBlockAddress(address: string): { slideId: SlideId; blockId: BlockId } {
  const hash = address.indexOf('#');
  if (hash <= 0 || hash === address.length - 1) {
    throw new RangeError(`Expected slideId#blockId, got ${JSON.stringify(address)}`);
  }
  return { slideId: address.slice(0, hash), blockId: address.slice(hash + 1) };
}
