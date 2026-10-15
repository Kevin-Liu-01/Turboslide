import { describe, expect, it } from 'vitest';

import { lintStatic } from '@turboslide/lint/lint-static';
import { validateDocument } from '@turboslide/schema/validate';

import { HERO_DECK_TITLE, HERO_SLIDES, heroDocument } from './hero-deck';

// The presentation of the landing's live editor (docs/SITE.md C.8): it validates, the lint finds
// nothing that must be fixed, and it carries no General Translation picture or mark (the judge's
// correction of the Workbench prototype). The competitor guard (packages/lint/src/brand/
// competitor.ts) reads this folder's sources with the rest of apps/studio/src.

describe('the hero deck', () => {
  const document = heroDocument('try-test', new Date('2026-10-14T00:00:00.000Z'));

  it('validates and starts at revision 0 under the id it was given', () => {
    const result = validateDocument(document);
    expect(result.issues.filter((issue) => issue.severity === 3)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(document.deck.id).toBe('try-test');
    expect(document.deck.revision).toBe(0);
    expect(document.deck.title).toBe(HERO_DECK_TITLE);
    expect(document.deck.theme).toBe('swiss');
  });

  it('holds the five slides the script names, in order', () => {
    expect(document.deck.sections.flatMap((section) => section.slideIds)).toEqual(
      Object.values(HERO_SLIDES),
    );
  });

  it('has no finding that must be fixed', () => {
    const blocking = lintStatic(document).filter((finding) => finding.severity === 3);
    expect(blocking).toEqual([]);
  });

  it('names no General Translation and holds no picture', () => {
    const text = JSON.stringify(document);
    expect(text).not.toMatch(/general translation|gt-brand|mood-earth/i);
    expect(document.deck.assets).toEqual({});
  });

  it('is a fresh copy on every call, so a visit never edits the next one', () => {
    const again = heroDocument('try-test');
    expect(again.slides.title).not.toBe(document.slides.title);
  });
});
