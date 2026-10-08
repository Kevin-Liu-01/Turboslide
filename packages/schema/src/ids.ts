// Identifiers (SPEC 4.2, 4.3). Slides, sections, assets and the deck are addressed by slugs,
// never by numbers: numbers, counts and titles are derived from the manifest's section order.
// A block is addressed as `slideId#blockId`; a run inside a text is a JSON pointer plus a
// character range (SPEC 4.3 "Addressing"). The patterns and the pure helpers live in ./slug.ts,
// without zod, and are re-exported here beside the two schemas.
import { z } from 'zod';

import { BLOCK_ID_PATTERN, SLUG_PATTERN } from './slug.ts';

export type { AssetId, BlockId, SectionId, SlideId } from './slug.ts';
export {
  BLOCK_ID_PATTERN,
  SLUG_PATTERN,
  blockAddress,
  isSlug,
  parseBlockAddress,
  slugify,
} from './slug.ts';

export const slugSchema = z
  .string()
  .regex(SLUG_PATTERN, 'a slug: lower-case letters and digits joined by single hyphens');

export const blockIdSchema = z
  .string()
  .regex(BLOCK_ID_PATTERN, 'a block id: lower-case letters, digits and hyphens');
