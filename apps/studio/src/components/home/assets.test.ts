import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { HOME_ASSETS, homeAsset } from './assets';
import { HOME_DECK } from './deck.generated';
import { LIVE_SLIDE_HTML } from './live-slides.generated';
import {
  HOME_FIELD_STILLS,
  HOME_SLIDES_SENTINEL,
  HOME_SLIDE_HTML,
  HOME_STILLS_CSS,
} from './slides.generated';

// The landing's files (docs/LANDING.md 4.1, 6.1; build/integrator.md section 6): every file under
// apps/studio/public/home/ is in assets.json at its bytes and sha256 and decodes to the pixels the
// build recorded, nothing else is there, every picture holds its budget, the export pictures are
// the parts the CLI's files hold (their part sha256 recorded), the PDFs have eight pages, and the
// inlined stills are 1 bit masks of their cell grids. scripts/build-home-assets.ts --check also
// re-derives each file from its sources; this test reads the committed files alone.

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const PUBLIC = join(ROOT, 'apps/studio/public/home');

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const BUDGET: Readonly<Record<string, number>> = {
  'canvas-still': 24_000,
  'canvas-tone': 26_000,
  'field-still': 24_000,
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

  it("carries the export band's files: both appearances, the Perfect picture at 3200 by 1800, PDFs of 8 pages", () => {
    for (const theme of ['light', 'dark'] as const) {
      const perfect = homeAsset('export-perfect', theme);
      expect([perfect.width, perfect.height]).toEqual([3200, 1800]);
      expect(perfect.partSha256).toMatch(/^[0-9a-f]{64}$/);
      const pdf = homeAsset('pdf', theme);
      expect(pdf.pages).toBe(8);
      const bytes = readFileSync(join(PUBLIC, pdf.path.replace(/^\/home\//, '')));
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
    /* the band stills at the two cell grids of 2 px cells */
    expect([
      homeAsset('canvas-still', null, 'wide').width,
      homeAsset('canvas-still', null, 'wide').height,
    ]).toEqual([512, 288]);
    expect([
      homeAsset('canvas-still', null, 'narrow').width,
      homeAsset('canvas-still', null, 'narrow').height,
    ]).toEqual([179, 100]);
  });
});

describe('the inlined stills and the slide markup', () => {
  it('inlines four 1 bit stills at their cell grids', async () => {
    const stills = [
      HOME_FIELD_STILLS.hero.wide,
      HOME_FIELD_STILLS.hero.narrow,
      HOME_FIELD_STILLS.strip.wide,
      HOME_FIELD_STILLS.strip.narrow,
    ];
    expect(stills.map((s) => [s.cols, s.rows])).toEqual([
      [512, 288],
      [179, 100],
      [512, 80],
      [179, 48],
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

  it('marks every server rendered instance and keeps the live markup apart', () => {
    for (const [instance, entry] of Object.entries(HOME_SLIDE_HTML)) {
      expect(entry.html.startsWith('<div class="ts-sheet sheet ts-home-slide'), instance).toBe(
        true,
      );
      expect(entry.html, instance).toContain(
        `${HOME_SLIDES_SENTINEL} data-slide="${entry.slide}" data-instance="${instance}"`,
      );
      expect(entry.html, instance).not.toContain('data-theme=');
      expect(entry.html, instance).not.toContain('<img');
      expect(entry.html, instance).not.toContain('#gt-mark');
      const n = HOME_DECK.slides[entry.slide].n;
      expect(entry.html, instance).toContain(`data-counter="${n} / 8"`);
    }
    /* one h1 on the page: the hero's title, the build's three lines */
    const h1 = Object.values(HOME_SLIDE_HTML).flatMap((e) => e.html.match(/<h1\b/g) ?? []);
    expect(h1.length).toBe(1);
    expect(HOME_SLIDE_HTML.hero.html).toContain('id="ts-product-h1"');
    expect(Object.values(HOME_SLIDE_HTML).some((e) => /<h[2-6]\b/.test(e.html))).toBe(false);
    /* the close's mark in seven pieces, the canvas slide's four objects */
    for (let i = 0; i < 7; i += 1)
      expect(HOME_SLIDE_HTML.close.html).toContain(`data-mark-piece="${i}"`);
    for (const object of ['rosetta#plate', 'rosetta#h', 'rosetta#p1', 'rosetta#credit'])
      expect(HOME_SLIDE_HTML.canvas.html).toContain(`data-object="${object}"`);
    for (const object of ['title#heading', 'title#lead'])
      expect(HOME_SLIDE_HTML.hero.html).toContain(`data-object="${object}"`);
    /* slide 7 and slide 5's two earlier states travel in the live module alone */
    expect(LIVE_SLIDE_HTML.field).toContain('data-slide="field"');
    expect(LIVE_SLIDE_HTML.field).toContain('data-still="field-still"');
    expect(LIVE_SLIDE_HTML.nextSteps.placeholders).toContain('data-slide="next-steps"');
    expect(LIVE_SLIDE_HTML.nextSteps.titled).toContain('Next steps with Northwind');
    expect(Object.values(HOME_SLIDE_HTML).some((e) => e.slide === 'field')).toBe(false);
  });
});
