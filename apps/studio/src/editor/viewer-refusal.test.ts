// The viewer owner's refusal sentence (SPEC-3 6.8; the objects round's fix round, VERIFICATION.md
// pass 1 finding 6): the walk's fresh deck was trashed under it by another lane's store sweep on
// the shared Blob store, the editor went read only under its banner as SPEC 6.4 says, and every
// window API write answered "needs Editing mode", a cause the page did not have, so 183 rows read
// as not driven behind it. The sentence now names the trash and the way back.
import { describe, expect, it } from 'vitest';

import { HOME, REFUSALS } from '@turboslide/chrome/menus/strings';

import { viewerRefusal } from './controller';

describe('viewerRefusal', () => {
  it('tells an editor whose presentation is in the trash that, with Restore and deck.restore', () => {
    const sentence = viewerRefusal('block.insert', { write: true, trashed: true });
    expect(sentence).toBe(
      'This presentation is in the trash, so "block.insert" is refused; Restore it from the banner or with deck.restore first.',
    );
    expect(sentence).not.toMatch(/Editing mode/);
    expect(sentence.startsWith(HOME.inTrash.split(' · ')[0] ?? '')).toBe(true);
  });

  it('tells an editor in Viewing or Commenting mode where the mode switch is', () => {
    expect(viewerRefusal('slide.new', { write: true, trashed: false })).toBe(
      '"slide.new" needs Editing mode; switch View > Mode to Editing for it.',
    );
  });

  it('tells a person without the write capability what they can do and what to ask for, trash or not', () => {
    const viewOnly = `${REFUSALS.viewOnly}. ${REFUSALS.requestEditAccess} to change it.`;
    expect(viewerRefusal('block.insert', { write: false, trashed: false })).toBe(viewOnly);
    expect(viewerRefusal('block.insert', { write: false, trashed: true })).toBe(viewOnly);
    expect(viewOnly).not.toMatch(/viewer|role|trash/i);
  });

  it('keeps every sentence inside the copy rules (one full sentence, no em dash)', () => {
    for (const facts of [
      { write: true, trashed: true },
      { write: true, trashed: false },
      { write: false, trashed: false },
    ]) {
      const sentence = viewerRefusal('block.set', facts);
      expect(sentence).not.toMatch(/[—!]/);
      expect(sentence).toMatch(/\.$/);
    }
  });
});
