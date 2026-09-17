// The sentence of a refused write (the focus round, cycle 2; VERIFICATION C2-F1): a `block.set
// /typography` on a `plain` list block fails the slide's schema, the validator leaves the slide out
// of its map and adds the manifest's "No slide file" reference issue, and the sort by file name
// put that consequence first. The refusal names the cause, the slide's own issue.
import { describe, expect, it } from 'vitest';

import type { Issue } from '@turboslide/schema/validate';
import { validateDocument } from '@turboslide/schema/validate';
import { applyMutations } from '@turboslide/schema/reduce';
import type { DeckDocument } from '@turboslide/schema/deck';

import { refusalIssue, refusalMessage } from './room';

const reference: Issue = {
  code: 'reference',
  severity: 3,
  file: 'deck.json',
  pointer: '/sections/0/slideIds/1',
  message: 'No slide file for "blank-1" (slides/blank-1.json)',
};
const unknownField: Issue = {
  code: 'unknown_field',
  severity: 3,
  file: 'slides/blank-1.json',
  pointer: '/slots/main/0/typography',
  message:
    'Unknown field "typography"; unknown data survives only under ext on a slide, a block or an asset (SPEC 4.1)',
};
const warning: Issue = {
  code: 'migrated',
  severity: 1,
  file: 'slides/blank-1.json',
  pointer: '/schemaVersion',
  message: 'Migrated to schemaVersion 2; the file changes on save',
};

describe('refusalIssue', () => {
  it('names the touched slide’s own issue before the manifest’s reference to it', () => {
    expect(refusalIssue([reference, unknownField], ['blank-1'])).toBe(unknownField);
    expect(refusalIssue([warning, reference, unknownField], ['blank-1'])).toBe(unknownField);
  });

  it('prefers any non reference issue when the write touched another slide', () => {
    expect(refusalIssue([reference, unknownField], ['title'])).toBe(unknownField);
  });

  it('falls back to the reference issue when it is the only blocking one', () => {
    expect(refusalIssue([warning, reference], ['blank-1'])).toBe(reference);
    expect(refusalIssue([warning], ['blank-1'])).toBeUndefined();
  });
});

describe('refusalMessage', () => {
  it('puts the slide file before the pointer and keeps the manifest issue as pointer and message', () => {
    expect(refusalMessage(unknownField)).toBe(
      'slides/blank-1.json /slots/main/0/typography: Unknown field "typography"; unknown data survives only under ext on a slide, a block or an asset (SPEC 4.1)',
    );
    expect(refusalMessage(reference)).toBe(
      '/sections/0/slideIds/1: No slide file for "blank-1" (slides/blank-1.json)',
    );
  });
});

describe('the walk’s reject (C2-F1) through the validator', () => {
  const document: DeckDocument = {
    deck: {
      schemaVersion: 1,
      id: 'walk',
      title: 'Walk',
      theme: 'gt-ink-paper',
      revision: 3,
      createdAt: '2026-09-16T00:00:00.000Z',
      updatedAt: '2026-09-16T00:00:00.000Z',
      assets: {},
      sections: [{ id: 'deck', name: 'Deck', slideIds: ['title', 'blank-1'] }],
    } as DeckDocument['deck'],
    slides: {
      title: {
        schemaVersion: 1,
        id: 'title',
        kind: 'title',
        mark: { w: 132, h: 84 },
        heading: 'Walk',
        lead: '',
        template: 'title',
      } as DeckDocument['slides'][string],
      /* the shape of decks/gt-brand/slides/avoid.json: a heading beside a plain list */
      'blank-1': {
        schemaVersion: 1,
        id: 'blank-1',
        kind: 'content',
        layout: { type: 'cols', ratio: '5/7', gap: 72, align: 'center' },
        slots: {
          left: [{ id: 'h', type: 'heading', level: 'h2', text: 'Onboarding' }],
          right: [{ id: 'text', type: 'plain', items: [{ text: 'Onboarding plan for Acme' }] }],
        },
      } as unknown as DeckDocument['slides'][string],
    },
  };

  it('names the plain block’s unknown typography field, not the missing slide file', () => {
    const before = validateDocument(document);
    expect(before.ok, before.issues.map((issue) => issue.message).join('; ')).toBe(true);
    const { document: next } = applyMutations(document, [
      {
        op: 'block.set',
        slideId: 'blank-1',
        blockId: 'text',
        path: '/typography',
        value: { align: 'right' },
      },
    ]);
    const validation = validateDocument(next);
    expect(validation.ok).toBe(false);
    const sorted = validation.issues.filter((issue) => issue.severity === 3);
    expect(sorted[0]?.code, 'the validator’s own order puts the reference first').toBe('reference');
    const issue = refusalIssue(validation.issues, ['blank-1']);
    expect(issue?.code).toBe('unknown_field');
    expect(refusalMessage(issue!)).toMatch(
      /^slides\/blank-1\.json \/.*typography.*Unknown field "typography"/,
    );
  });
});
