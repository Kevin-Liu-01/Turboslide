// The server side window actions that create a /new draft's deck before they run (docs/FOCUS.md
// rank 6; audit-images row 1: the first upload on a fresh draft answered "No deck in the Blob
// store"): every one writes this deck's document, so the deck must exist first, the way the
// draft's first `writeDeck` creates it; the collection actions name other decks and never do.
import { describe, expect, it } from 'vitest';

import { ACTIONS } from '@turboslide/schema/actions';

import { DRAFT_CREATING_ACTIONS, SERVER_SIDE_WINDOW_ACTIONS, createsDraft } from './agent-actions';

describe('createsDraft', () => {
  it('names the server side actions that write this deck, each a mutating window action', () => {
    for (const action of DRAFT_CREATING_ACTIONS) {
      expect(SERVER_SIDE_WINDOW_ACTIONS).toContain(action);
      expect(ACTIONS[action].mutates).toBe(true);
      expect(createsDraft(action)).toBe(true);
    }
    expect(createsDraft('asset.add')).toBe(true);
    expect(createsDraft('slide.import')).toBe(true);
  });

  it('leaves the collection actions and the reads alone', () => {
    for (const action of [
      'deck.list',
      'deck.copy',
      'deck.trash',
      'deck.restore',
      'deck.remove',
      'material.list',
      'presence.list',
      'comment.add',
    ] as const) {
      expect(createsDraft(action)).toBe(false);
    }
  });
});
