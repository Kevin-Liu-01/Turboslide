// The typography a fixed kind's text field carries of its own (the field fonts hotfix,
// docs/gslides-parity/features/build/field-fonts.md section 2): the cover's heading and lead
// and a statement's big line take a face from the Font dropdown the way a block does, written as
// `slide.set /typography/<field>` (deck.ts `TitleSlide.typography`, `StatementSlide.typography`,
// the block record per field). This module holds the reads the render, the used family walks and
// the chrome share, and the one write: `fieldTypographyMutation` lands the value at the
// shallowest ancestor the slide lacks, the way `brandWriteMutation` writes the kit (brand.ts),
// so the reducer's inverse removes exactly what the write made and one Undo takes the face back;
// an empty record removes the field, or the map when the field was its last key. Imports the
// deck and mutation modules and nothing above them.
import type { Slide } from './deck.ts';
import type { FontId } from './fonts.ts';
import { DEFAULT_FONT_ID, isFontId } from './fonts.ts';
import type { Mutation, SlideFieldId } from './mutations.ts';
import { SLIDE_FIELD_IDS, slideFieldOf } from './mutations.ts';
import { cloneJson } from './pointer.ts';
import type { Typography } from './typography.ts';

/** The slide pointer the field records live under. */
export const FIELD_TYPOGRAPHY_ROOT = '/typography';

/** The map a slide carries, by field id; empty for a kind without text fields. */
function fieldMap(slide: Slide): Partial<Record<SlideFieldId, Typography>> {
  if (slide.kind === 'title' || slide.kind === 'statement')
    return (slide.typography ?? {}) as Partial<Record<SlideFieldId, Typography>>;
  return {};
}

/** The record a field carries, or undefined for the kit's face and the grammar's defaults. */
export function slideFieldTypography(slide: Slide, field: SlideFieldId): Typography | undefined {
  if (slideFieldOf(slide, field) === null) return undefined;
  return fieldMap(slide)[field];
}

/** The catalog face a field names of its own, or null for the kit's face (the theme's id counts as none). */
export function slideFieldFamily(slide: Slide, field: SlideFieldId): FontId | null {
  const family = slideFieldTypography(slide, field)?.family;
  return family !== undefined && isFontId(family) && family !== DEFAULT_FONT_ID ? family : null;
}

/** Every field record a slide carries, in field order, for the used family walks. */
export function slideFieldTypographies(slide: Slide): Typography[] {
  const map = fieldMap(slide);
  const out: Typography[] = [];
  for (const field of SLIDE_FIELD_IDS) {
    const record = map[field];
    if (record !== undefined) out.push(record);
  }
  return out;
}

/**
 * The one `slide.set` that gives a field a typography record, or takes it away for an empty
 * record: at `/typography` with `{ <field>: record }` when the slide carries no map yet (the
 * inverse removes the map whole), else at `/typography/<field>`; an empty record removes the
 * field, or the map when the field was its last key; null when there is nothing to write. Throws
 * TypeError for a field the slide's kind does not carry.
 */
export function fieldTypographyMutation(
  slide: Slide,
  field: SlideFieldId,
  typography: Typography | Record<string, unknown>,
): Mutation | null {
  if (slideFieldOf(slide, field) === null)
    throw new TypeError(`A ${slide.kind} slide has no field "${field}"`);
  const map = fieldMap(slide);
  const hasMap =
    (slide.kind === 'title' || slide.kind === 'statement') && slide.typography !== undefined;
  const fieldPath = `${FIELD_TYPOGRAPHY_ROOT}/${field}`;
  if (Object.keys(typography).length === 0) {
    if (map[field] === undefined) return null;
    const others = Object.keys(map).filter((key) => key !== field);
    return others.length === 0
      ? { op: 'slide.set', slideId: slide.id, path: FIELD_TYPOGRAPHY_ROOT }
      : { op: 'slide.set', slideId: slide.id, path: fieldPath };
  }
  if (!hasMap)
    return {
      op: 'slide.set',
      slideId: slide.id,
      path: FIELD_TYPOGRAPHY_ROOT,
      value: { [field]: cloneJson(typography) },
    };
  return { op: 'slide.set', slideId: slide.id, path: fieldPath, value: cloneJson(typography) };
}
