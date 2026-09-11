// Speaker notes (SPEC 8.3): a new slide's notes shape has no id the caller can choose, so notes
// need a second call after the slides exist: presentations.get with a field mask for
// `slideProperties.notesPage.notesProperties.speakerNotesObjectId`, then one insertText per slide
// that carries notes. A dry run plans the same requests against `notes:<page id>` placeholders
// (schema.ts notesPlaceholderSchema) so the JSON is complete and validates; the live run swaps in
// the ids it read back.
import type { PresentationData } from './client.ts';
import type { SlidePlan } from './requests.ts';
import type { SlidesRequest } from './schema.ts';

export const NOTES_FIELDS =
  'presentationId,revisionId,slides(objectId,slideProperties.notesPage.notesProperties.speakerNotesObjectId)';

export type NotesTarget = { slideObjectId: string; speakerNotesObjectId: string };

export function notesPlaceholder(slideObjectId: string): string {
  return `notes:${slideObjectId}`;
}

export function isNotesPlaceholder(objectId: string): boolean {
  return objectId.startsWith('notes:');
}

/** The notes shape id of every slide the presentation read-back lists. */
export function notesTargets(presentation: PresentationData): NotesTarget[] {
  const out: NotesTarget[] = [];
  for (const slide of presentation.slides ?? []) {
    const slideObjectId = slide.objectId;
    const speakerNotesObjectId =
      slide.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
    if (slideObjectId && speakerNotesObjectId) out.push({ slideObjectId, speakerNotesObjectId });
  }
  return out;
}

export type NotesPlan = {
  requests: SlidesRequest[];
  /** Slides with notes whose target was not found; empty in a dry run. */
  unresolved: string[];
  placeholders: boolean;
};

/**
 * insertText requests for every slide plan with notes. Without targets the object ids are
 * placeholders; with them the read-back ids are used and a slide without one is listed.
 */
export function notesRequests(
  slides: readonly SlidePlan[],
  targets?: readonly NotesTarget[],
): NotesPlan {
  const byPage = new Map((targets ?? []).map((t) => [t.slideObjectId, t.speakerNotesObjectId]));
  const requests: SlidesRequest[] = [];
  const unresolved: string[] = [];
  for (const slide of slides) {
    if (!slide.notes) continue;
    let objectId: string;
    if (targets) {
      const found = byPage.get(slide.objectId);
      if (!found) {
        unresolved.push(slide.slideId);
        continue;
      }
      objectId = found;
    } else {
      objectId = notesPlaceholder(slide.objectId);
    }
    requests.push({ insertText: { objectId, insertionIndex: 0, text: slide.notes } });
  }
  return { requests, unresolved, placeholders: targets === undefined };
}
