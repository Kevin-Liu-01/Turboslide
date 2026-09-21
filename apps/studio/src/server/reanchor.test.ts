import { describe, expect, it } from 'vitest';

import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

import { reanchorAll } from './room';

// The room's placement of an entry's `after` anchors (SPEC-3 3.5): an anchor that left re-resolves
// to the end of the section, and an anchor a mutation of the same entry introduces stays, because
// each mutation is placed against the document the mutations before it made. The second rule is
// the undo of a version.restore: its inverse inserts the slides the restore removed, the second
// after the first, and a check against the document from before the entry sent the second slide to
// the end of the section (VERIFICATION.md "Product round, pass 1" finding 4, versions.undo-restore).

/** The worked document's first section: its id and slide order, read rather than assumed. */
function firstSection(document: DeckDocument): { id: string; slideIds: string[] } {
  const section = document.deck.sections[0];
  if (section === undefined) throw new Error('the worked document has no section');
  return { id: section.id, slideIds: [...section.slideIds] };
}

/** The title slide of the worked document under another id, a valid slide to insert. */
function cloneSlide(document: DeckDocument, id: string): Slide {
  const source = document.slides['title'];
  if (source === undefined) throw new Error('the worked document has no title slide');
  return { ...structuredClone(source), id };
}

describe('reanchorAll', () => {
  it('keeps an anchor a mutation of the same entry introduced', () => {
    const document = workedDocument();
    const { id, slideIds } = firstSection(document);
    const entry: Mutation[] = [
      { op: 'slide.insert', sectionId: id, slide: cloneSlide(document, 'restored-a') },
      {
        op: 'slide.insert',
        sectionId: id,
        after: 'restored-a',
        slide: cloneSlide(document, 'restored-b'),
      },
    ];
    const placed = reanchorAll(document, entry);
    expect(placed.mutations[1]).toMatchObject({ after: 'restored-a' });
    expect(placed.document.deck.sections[0]?.slideIds).toEqual([
      'restored-a',
      'restored-b',
      ...slideIds,
    ]);
  });

  it('re-anchors a mutation whose anchor left to the end of the section', () => {
    const document = workedDocument();
    const { id, slideIds } = firstSection(document);
    const last = slideIds[slideIds.length - 1];
    const entry: Mutation[] = [
      { op: 'slide.insert', sectionId: id, after: 'gone', slide: cloneSlide(document, 'late') },
    ];
    const placed = reanchorAll(document, entry);
    expect(placed.mutations[0]).toMatchObject({ after: last });
    expect(placed.document.deck.sections[0]?.slideIds).toEqual([...slideIds, 'late']);
  });

  it('leaves a present anchor and the rest of the entry as they are', () => {
    const document = workedDocument();
    const { id, slideIds } = firstSection(document);
    const entry: Mutation[] = [
      {
        op: 'slide.insert',
        sectionId: id,
        after: 'title',
        slide: cloneSlide(document, 'after-title'),
      },
      { op: 'deck.set', path: '/title', value: 'Renamed' },
    ];
    const placed = reanchorAll(document, entry);
    expect(placed.mutations).toEqual(entry);
    const at = slideIds.indexOf('title');
    expect(placed.document.deck.sections[0]?.slideIds).toEqual([
      ...slideIds.slice(0, at + 1),
      'after-title',
      ...slideIds.slice(at + 1),
    ]);
    expect(placed.document.deck.title).toBe('Renamed');
  });

  it('throws what the reducer throws, so the caller answers the reject', () => {
    const document = workedDocument();
    const { id } = firstSection(document);
    const entry: Mutation[] = [
      { op: 'slide.insert', sectionId: id, slide: cloneSlide(document, 'twice') },
      { op: 'slide.insert', sectionId: id, slide: cloneSlide(document, 'twice') },
    ];
    expect(() => reanchorAll(document, entry)).toThrow(/already exists/);
  });
});
