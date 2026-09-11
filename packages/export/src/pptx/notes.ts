// Speaker notes (SPEC 4.2: `Slide.notes` is the only place notes live; SPEC 8.2: `addNotes`
// writes one notesSlideN.xml part per slide). The deck default applies when a slide has none.
import type PptxGenJS from 'pptxgenjs';

export function addSceneNotes(
  slide: PptxGenJS.Slide,
  notes: string | undefined,
  fallback: string | undefined,
): boolean {
  const text = (notes ?? fallback ?? '').trim();
  if (text.length === 0) return false;
  slide.addNotes(text);
  return true;
}
