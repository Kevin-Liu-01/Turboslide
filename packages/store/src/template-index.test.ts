// The template index (gslides-parity SPEC-5 4.1, 4.3, 4.6; MILESTONES-5 B3 day 7): the committed
// templates.json equals the folders, its order puts the four fixed ids first, every row carries a
// category of the gallery's three, and deck.create copies any template of the index, the Sales
// pitch with its demo clip and media record.
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TEMPLATE_CATEGORIES } from '@turboslide/schema/building-blocks';
import { playRowsFor } from '@turboslide/schema/blocks/media';
import { afterAll, describe, expect, it } from 'vitest';

import {
  TEMPLATE_INDEX_ORDER,
  buildTemplateIndex,
  createDeck,
  isKnownTemplateId,
  listTemplates,
  readTemplateIndex,
  templateIds,
  templateSlideCount,
} from './templates.ts';

const decksDir = join(import.meta.dirname, '..', '..', '..', 'decks');
const tmp = mkdtempSync(join(tmpdir(), 'turboslide-template-index-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('decks/templates/templates.json (SPEC-5 4.3)', () => {
  const rows = readTemplateIndex(decksDir);

  it('equals the folders, the four fixed ids first, then the rest by name', () => {
    expect(rows).toEqual(buildTemplateIndex(decksDir));
    expect(rows.slice(0, 4).map((row) => row.id)).toEqual([...TEMPLATE_INDEX_ORDER]);
    expect(rows.length).toBeGreaterThanOrEqual(11);
    const rest = rows.slice(4).map((row) => row.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it('carries a category, a cover and the folder’s slide count on every row', () => {
    const byId = new Map(listTemplates(decksDir).map((template) => [template.record.id, template]));
    for (const row of rows) {
      expect(TEMPLATE_CATEGORIES).toContain(row.category);
      expect(row.cover).toBeDefined();
      expect(row.slides).toBe(templateSlideCount(byId.get(row.id)!));
      expect(row.description?.length ?? 0).toBeLessThanOrEqual(400);
    }
    expect(rows.find((row) => row.id === 'sales-pitch')).toMatchObject({
      category: 'work',
      slides: 15,
      theme: 'ts-plate',
    });
    expect(rows.filter((row) => row.theme === 'ts-plate').length).toBeGreaterThanOrEqual(9);
    for (const category of TEMPLATE_CATEGORIES)
      expect(rows.some((row) => row.category === category)).toBe(true);
  });

  it('names the ids deck.create accepts', () => {
    expect(templateIds(decksDir)).toContain('sales-pitch');
    expect(templateIds(decksDir)).toContain('blank');
    expect(isKnownTemplateId(decksDir, 'lesson-plan')).toBe(true);
    expect(isKnownTemplateId(decksDir, 'nope')).toBe(false);
  });
});

describe('deck.create --from <index id> (SPEC-5 4.6)', () => {
  it('copies the Sales pitch with its fifteen slides, its assets folder, the demo clip and the media record', () => {
    const decks = join(tmp, 'decks');
    cpSync(join(decksDir, 'templates', 'sales-pitch'), join(decks, 'templates', 'sales-pitch'), {
      recursive: true,
    });
    cpSync(join(decksDir, 'templates', 'blank'), join(decks, 'templates', 'blank'), {
      recursive: true,
    });
    cpSync(
      join(decksDir, 'templates', 'templates.json'),
      join(decks, 'templates', 'templates.json'),
    );
    const created = createDeck(
      decks,
      { name: 'Acme pitch', from: 'sales-pitch' },
      { now: () => '2026-09-15T00:00:00.000Z' },
    );
    expect(created.deckId).toBe('acme-pitch');
    expect(created.counts.slides).toBe(15);
    const dir = join(decks, 'acme-pitch');
    const manifest = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as {
      title: string;
      theme: string;
      revision: number;
      media?: Record<string, { file: string }>;
    };
    expect(manifest.title).toBe('Acme pitch');
    expect(manifest.theme).toBe('ts-plate');
    expect(manifest.revision).toBe(0);
    const clip = manifest.media?.demo?.file;
    expect(clip).toMatch(/^assets\/demo\.[0-9a-f]{8}\.webm$/);
    expect(existsSync(join(dir, clip!))).toBe(true);
    expect(readdirSync(join(dir, 'slides'))).toHaveLength(15);
  });

  it('copies a template whose assets folder is the shared starter set', () => {
    const decks = join(tmp, 'decks-shared');
    cpSync(join(decksDir, 'templates', 'book-report'), join(decks, 'templates', 'book-report'), {
      recursive: true,
    });
    cpSync(join(decksDir, 'templates', 'blank'), join(decks, 'templates', 'blank'), {
      recursive: true,
    });
    const created = createDeck(decks, { name: 'My book', from: 'book-report' });
    expect(created.counts.slides).toBe(6);
    expect(existsSync(join(decks, 'my-book', 'assets', 'opener-closing-light.jpg'))).toBe(true);
  });
});

describe('the Sales pitch’s Product demo slide (SPEC-5 0.22, 4 row 6; VERIFICATION-5 finding 13)', () => {
  // The demo clip is a media block on Play (on click) with no `playMedia` row, by design: SPEC-5
  // 2.1 writes the row for `auto` alone (`playRowsFor` removes a block's rows when its start
  // leaves `auto`); the show plays a click block with no row on the first click after the slide's
  // own steps (R11 5.4: Slideshow `advance` and the media controller's `playClickMedia`); the
  // timing writer adds the same click step to the file (`clickMediaStep`). A click row would list
  // a Play row Google shows for automatic media alone and would leave the click after the step to
  // `playClickMedia` again (`play()` never marks the entry clicked), so the slide would need one
  // more click to move on. The verifier's S2b miss is the browser render context's empty
  // `data-src` (finding 12), not this slide; b3.md section 9.
  const dir = join(decksDir, 'templates', 'sales-pitch');
  const slide = JSON.parse(readFileSync(join(dir, 'slides', 'product-demo.json'), 'utf8')) as {
    slots: {
      main: { id: string; type: string; kind?: string; source?: unknown; playback?: unknown }[];
    };
    animations?: {
      id: string;
      blockId: string;
      effect: string;
      trigger: string;
      durationMs: number;
    }[];
  };

  it('carries the demo clip on Play (on click) with no Play row, the state media.setPlayback leaves for click', () => {
    const demo = slide.slots.main.find((block) => block.id === 'demo');
    expect(demo).toMatchObject({
      type: 'media',
      kind: 'video',
      source: { asset: 'demo' },
      playback: { start: 'click' },
    });
    expect((slide.animations ?? []).filter((row) => row.effect === 'playMedia')).toEqual([]);
    // the row rule of SPEC-5 2.1 leaves a click block's list as it is (null means unchanged)
    expect(playRowsFor(slide.animations, 'demo', 'click')).toBeNull();
    // and appends the row only when the block is set to play automatically
    expect(playRowsFor(slide.animations, 'demo', 'auto')).toMatchObject([
      { blockId: 'demo', effect: 'playMedia', trigger: 'withPrevious' },
    ]);
  });

  it('names the bundled clip in the media record the show and the file read', () => {
    const manifest = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as {
      media?: Record<string, { kind: string; file: string; durationMs?: number }>;
    };
    expect(manifest.media?.demo).toMatchObject({ kind: 'video', durationMs: 5000 });
    expect(manifest.media?.demo?.file).toMatch(/^assets\/demo\.[0-9a-f]{8}\.webm$/);
    expect(existsSync(join(dir, manifest.media!.demo!.file))).toBe(true);
  });
});
