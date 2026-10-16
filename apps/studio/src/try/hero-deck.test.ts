import { existsSync, statSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { lintStatic } from '@turboslide/lint/lint-static';
import { validateDocument } from '@turboslide/schema/validate';

import { HERO_ASSET_BASE, HERO_DECK_TITLE, HERO_SLIDES, heroDocument } from './hero-deck';

// The presentation of the landing's live editor (docs/SITE.md C.8): it validates, the lint finds
// nothing that must be fixed, and it carries no General Translation picture or mark (the judge's
// correction of the Workbench prototype); its one picture is the Earth on the title slide. The
// competitor guard (packages/lint/src/brand/competitor.ts) reads this folder's sources with the
// rest of apps/studio/src.

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

  it('names no General Translation', () => {
    expect(JSON.stringify(document)).not.toMatch(/general translation|gt-brand|mood-earth/i);
  });

  it('holds one picture, the Earth on the title slide: masked, dithered, credited and served', () => {
    expect(Object.keys(document.deck.assets)).toEqual(['earth']);
    const earth = document.deck.assets.earth!;
    expect(earth.source).toMatchObject({ kind: 'photo', license: 'public domain' });
    const twin = 'neutral' in earth.twins ? earth.twins.neutral : earth.twins.light;
    const file = new URL(`../../public${HERO_ASSET_BASE}${twin}`, import.meta.url);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThan(80_000);
    const title = document.slides[HERO_SLIDES.title]!;
    const blocks = 'slots' in title ? Object.values(title.slots).flat() : [];
    expect(blocks.find((block) => block.id === 'earth')).toMatchObject({
      type: 'picture',
      asset: 'earth',
      mask: 'ellipse',
      dither: { pattern: 'bayer8', polarity: 'same' },
    });
    expect(blocks.find((block) => block.id === 'credit')).toMatchObject({
      type: 'credit',
      text: earth.credit,
    });
    // the agents' first pose (session.ts) selects these two
    expect(blocks.map((block) => block.id)).toEqual(expect.arrayContaining(['heading', 'lead']));
  });

  it('is a fresh copy on every call, so a visit never edits the next one', () => {
    const again = heroDocument('try-test');
    expect(again.slides.title).not.toBe(document.slides.title);
  });
});
