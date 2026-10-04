import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { HOME_ASSETS, homeAsset } from './assets';
import { FILLS as AGENTS_FILLS } from './bands/agents.generated';
import { FILLS as CANVAS_FILLS } from './bands/canvas.generated';
import { FILLS as CLOSE_FILLS } from './bands/close.generated';
import { HOME_SLIDE_MARKUP } from './bands/deck.generated';
import { FILLS as EXPORT_FILLS } from './bands/export.generated';
import { LIVE_SLIDE_HTML } from './bands/live.generated';
import { FILLS as PRESENT_FILLS } from './bands/present.generated';
import { FILLS as TAILOR_FILLS } from './bands/tailor.generated';
import { HOME_DECK } from './deck.generated';
import {
  HOME_FIELD_STILLS,
  HOME_SLIDES_SENTINEL,
  HOME_SLIDE_HTML,
  HOME_STILLS_CSS,
} from './slides.generated';

// The landing's files (docs/LANDING.md 4.1, 6.1, the second pass): every file under
// apps/studio/public/home/ is in assets.json at its bytes and sha256 and decodes to the pixels the
// build recorded, nothing else is there, every picture holds its budget, the export pictures are
// the parts the CLI's files hold (their part sha256 recorded), the PDFs have nine pages, the
// inlined stills are 1 bit masks of their cell grids, the document's instances are the first
// screen's ten, and every other instance is in its band's module. scripts/build-home-assets.ts --check also
// re-derives each file from its sources; this test reads the committed files alone.

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const PUBLIC = join(ROOT, 'apps/studio/public/home');

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const BUDGET: Readonly<Record<string, number>> = {
  'lighthouse-still': 24_000,
  'lighthouse-tone': 26_000,
  'field-still': 24_000,
  'pattern-still': 48_000,
  'export-perfect': 60_000,
  'export-editable': 32_000,
};

describe('public/home', () => {
  it('holds exactly the files of assets.json', () => {
    const present = readdirSync(PUBLIC)
      .filter((name) => !name.startsWith('.'))
      .sort();
    const listed = HOME_ASSETS.map((asset) => asset.path.replace(/^\/home\//, '')).sort();
    expect(present).toEqual(listed);
  });

  it('serves every file at its bytes and sha256, content hashed, within its budget', async () => {
    for (const asset of HOME_ASSETS) {
      const file = join(PUBLIC, asset.path.replace(/^\/home\//, ''));
      expect(existsSync(file), asset.path).toBe(true);
      const bytes = new Uint8Array(readFileSync(file));
      expect(bytes.length, asset.path).toBe(asset.bytes);
      expect(sha256(bytes), asset.path).toBe(asset.sha256);
      expect(asset.path, 'content hashed').toMatch(/-[0-9a-f]{10}\.(webp|png|jpg|pdf)$/);
      expect(asset.path.includes(sha256(bytes).slice(0, 10)), asset.path).toBe(true);
      const limit = BUDGET[asset.role];
      if (limit !== undefined)
        expect(asset.bytes, `${asset.path} budget`).toBeLessThanOrEqual(limit);
      if (asset.pixelsSha256 !== null) {
        const { data, info } = await sharp(bytes)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect(sha256(new Uint8Array(data)), `${asset.path} pixels`).toBe(asset.pixelsSha256);
        expect([info.width, info.height], asset.path).toEqual([asset.width, asset.height]);
      }
    }
  });

  it("carries the export band's files: both appearances, the Perfect picture at 3200 by 1800, PDFs of 9 pages", () => {
    for (const theme of ['light', 'dark'] as const) {
      const perfect = homeAsset('export-perfect', theme);
      expect([perfect.width, perfect.height]).toEqual([3200, 1800]);
      expect(perfect.partSha256).toMatch(/^[0-9a-f]{64}$/);
      const pdf = homeAsset('pdf', theme);
      expect(pdf.pages).toBe(9);
      const bytes = readFileSync(join(PUBLIC, pdf.path.replace(/^\/home\//, '')));
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
    /* the band stills at the two cell grids of 2 px cells */
    expect([
      homeAsset('lighthouse-still', null, 'wide').width,
      homeAsset('lighthouse-still', null, 'wide').height,
    ]).toEqual([512, 288]);
    expect([
      homeAsset('lighthouse-still', null, 'narrow').width,
      homeAsset('lighthouse-still', null, 'narrow').height,
    ]).toEqual([179, 100]);
  });
});

describe('the inlined stills and the slide markup', () => {
  it("inlines two 1 bit stills at their cell grids: the hero frame's slide at both widths", async () => {
    const stills = [HOME_FIELD_STILLS.hero.wide, HOME_FIELD_STILLS.hero.narrow];
    expect(stills.map((s) => [s.cols, s.rows])).toEqual([
      [270, 152],
      [163, 92],
    ]);
    for (const still of stills) {
      expect(still.ink).toMatch(/^data:image\/png;base64,/);
      const bytes = Buffer.from(still.ink.slice(still.ink.indexOf(',') + 1), 'base64');
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height]).toEqual([still.cols, still.rows]);
      /* ink opaque, paper transparent, nothing between (one count, not one expect a pixel: the
         per pixel form took over 5 s for the 214,908 cells at a load of 50 to 90) */
      let between = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0 && data[i] !== 255) between += 1;
      expect(between).toBe(0);
      expect(HOME_STILLS_CSS).toContain(still.ink);
    }
    /* the whole of the inlined stills stays a small part of the document (LANDING.md 4.1) */
    const bytes = stills.reduce((n, s) => n + s.ink.length, 0);
    expect(bytes).toBeLessThan(6000);
  });

  it('marks every server rendered instance and keeps every other in its band', () => {
    const order = HOME_DECK.order;
    /* the document: the hero frame's slide 1 and its nine thumbnails (2.0 "Slides") */
    expect(Object.keys(HOME_SLIDE_HTML)).toEqual([
      'hero',
      ...order.map((id) => `hero-thumb-${id}`),
    ]);
    const all: [string, string, string][] = [
      ...Object.entries(HOME_SLIDE_HTML).map(
        ([i, e]) => [i, e.slide, e.html] as [string, string, string],
      ),
      ...Object.entries({
        ...CANVAS_FILLS,
        ...TAILOR_FILLS,
        ...AGENTS_FILLS,
        ...PRESENT_FILLS,
        ...EXPORT_FILLS,
        ...CLOSE_FILLS,
      })
        .filter(([key]) => !['panel-cli', 'export-editable'].includes(key))
        .map(
          ([i, html]) =>
            [i, /data-slide="([^"]+)"/.exec(html)?.[1] ?? '', html] as [string, string, string],
        ),
      ...Object.entries(HOME_SLIDE_MARKUP).map(
        ([id, html]) => [`slide-${id}`, id, html] as [string, string, string],
      ),
    ];
    for (const [instance, slide, html] of all) {
      expect(html.startsWith('<div class="ts-sheet sheet ts-home-slide'), instance).toBe(true);
      expect(html, instance).toContain(
        `${HOME_SLIDES_SENTINEL} data-slide="${slide}" data-instance="${instance}"`,
      );
      expect(html, instance).not.toContain('data-theme=');
      expect(html, instance).not.toContain('<img');
      expect(html, instance).not.toContain('#gt-mark');
      /* one h1 on the page, the page text h1: every heading in a slide is a div */
      expect(/<h[1-6]\b/.test(html), instance).toBe(false);
      const n = HOME_DECK.slides[slide as keyof typeof HOME_DECK.slides].n;
      expect(html, instance).toContain(`data-counter="${n} / 9"`);
    }
    /* the close's mark in seven pieces, the lighthouse's four objects, slide 1's two */
    for (let i = 0; i < 7; i += 1) expect(CLOSE_FILLS['close']).toContain(`data-mark-piece="${i}"`);
    for (const object of ['lighthouse#plate', 'lighthouse#h', 'lighthouse#p1', 'lighthouse#credit'])
      expect(CANVAS_FILLS['canvas']).toContain(`data-object="${object}"`);
    for (const object of ['title#heading', 'title#lead'])
      expect(HOME_SLIDE_HTML.hero.html).toContain(`data-object="${object}"`);
    expect(HOME_SLIDE_HTML.hero.html).toContain('data-field="hero"');
    /* slide 7 and slide 5's two earlier states travel with their bands */
    expect(LIVE_SLIDE_HTML.field).toContain('data-slide="field"');
    expect(LIVE_SLIDE_HTML.field).toContain('data-still="field-still"');
    expect(LIVE_SLIDE_HTML.nextSteps.placeholders).toContain('data-slide="next-steps"');
    expect(LIVE_SLIDE_HTML.nextSteps.titled).toContain('Next steps with Northwind');
    /* the console's resting screen is the agents chunk's (v3.md R18): no panel fill */
    expect(AGENTS_FILLS['panel-cli']).toBeUndefined();
    expect(EXPORT_FILLS['export-editable']).toContain('data-seam-text');
  });
});
