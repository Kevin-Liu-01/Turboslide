import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { lintStatic } from '@turboslide/lint/lint-static';
import { validateDocument } from '@turboslide/schema/validate';

import {
  HERO_ASSET_BASE,
  HERO_DECK_TITLE,
  HERO_PICTURE,
  HERO_SLIDES,
  heroDocument,
} from './hero-deck';

// The presentation of the landing's live editor (docs/SITE.md C.8): it validates, the lint finds
// nothing that must be fixed, and it carries no General Translation picture or mark (the judge's
// correction of the Workbench prototype). It holds two pictures, served from the site's public
// folder: the Earth on the title slide, and the drawing made for it, which no slide shows until
// Claude Code places it. The competitor guard (packages/lint/src/brand/competitor.ts) reads this
// folder's sources with the rest of apps/studio/src.

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

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

  it('names no General Translation and holds the Earth and its own drawing, the drawing on no slide yet', () => {
    const text = JSON.stringify(document);
    expect(text).not.toMatch(/general translation|gt-brand|mood-earth/i);
    expect(Object.keys(document.deck.assets).sort()).toEqual(['earth', HERO_PICTURE].sort());
    expect(JSON.stringify(document.slides)).not.toContain(`"asset":"${HERO_PICTURE}"`);
  });

  it('serves its pictures from the site’s own files', () => {
    for (const asset of Object.values(document.deck.assets)) {
      for (const path of Object.values(asset.twins as Record<string, string>))
        expect(existsSync(join(PUBLIC, HERO_ASSET_BASE, path)), path).toBe(true);
    }
  });

  it('shows the Earth on the title slide: masked, dithered, credited and small', () => {
    const earth = document.deck.assets.earth!;
    expect(earth.source).toMatchObject({ kind: 'photo', license: 'public domain' });
    const twin = 'neutral' in earth.twins ? earth.twins.neutral : earth.twins.light;
    expect(statSync(join(PUBLIC, HERO_ASSET_BASE, twin)).size).toBeLessThan(80_000);
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
