import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SHOT_ALT } from './copy';
import type { ShotName } from './copy';
import { fallbackSrcOf, shotOf, srcsetOf } from './Shot';
import { SHOTS_MANIFEST } from './shots';

// The pictures of the /home page (gslides-parity SPEC-4 2.4, 0.24, 0.28): the manifest
// scripts/build-home-assets.ts writes holds the fifteen README shots and the pipeline's frame,
// each with its source copy and the 720 px and 1440 px variants under apps/studio/public/home,
// and the module twin the page imports equals the JSON. `node scripts/build-home-assets.ts
// --check` proves the bytes; this test proves the page's view of them so a deleted file fails
// `pnpm test` before the build runs.

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const PUBLIC = join(ROOT, 'apps/studio/public/home');
const JSON_PATH = join(import.meta.dirname, 'shots.json');

describe('shots.json and its module', () => {
  it('agree', () => {
    const json = JSON.parse(readFileSync(JSON_PATH, 'utf8')) as unknown;
    expect(JSON.stringify(json)).toBe(JSON.stringify(SHOTS_MANIFEST));
  });

  it('holds the fifteen README pictures and the frame, each with three widths', () => {
    expect(SHOTS_MANIFEST.shots.length).toBe(16);
    const names = new Set(SHOTS_MANIFEST.shots.map((shot) => shot.name));
    for (const name of Object.keys(SHOT_ALT)) expect(names.has(name), name).toBe(true);
    for (const shot of SHOTS_MANIFEST.shots) {
      const widths = shot.variants.map((v) => v.width);
      expect(widths[0], shot.name).toBe(shot.width);
      expect(widths, shot.name).toContain(720);
      expect(widths, shot.name).toContain(1440);
      for (const variant of shot.variants) {
        expect(variant.path.startsWith('/home/'), variant.path).toBe(true);
        expect(existsSync(join(PUBLIC, variant.path.slice('/home/'.length))), variant.path).toBe(
          true,
        );
        /* the same 16:10 frame at every width, so the cards' boxes never crop */
        expect(
          Math.abs(variant.width / variant.height - shot.width / shot.height),
          variant.path,
        ).toBeLessThan(0.01);
      }
    }
  });

  it('gives an <img> a srcset with width descriptors and the smallest file as its src', () => {
    const shot = shotOf('01-new-presentation' as ShotName);
    expect(srcsetOf(shot)).toMatch(
      /^\/home\/01-new-presentation-[0-9a-f]{10}\.jpg 2880w, \/home\/01-new-presentation-1440-[0-9a-f]{10}\.jpg 1440w, \/home\/01-new-presentation-720-[0-9a-f]{10}\.jpg 720w$/,
    );
    expect(fallbackSrcOf(shot)).toMatch(/-720-/);
    expect(() => shotOf('no-such-shot' as ShotName)).toThrow(/no picture named/);
  });

  it('keeps the small variants small enough for the image budget (SPEC-4 0.28)', () => {
    /* every card picks a 720 variant at 1x; fifteen of them and the two full width pictures at
       1440 stay under the 2,000 KB after a full scroll, with room */
    const small = SHOTS_MANIFEST.shots.reduce(
      (sum, shot) => sum + (shot.variants.find((v) => v.width === 720)?.bytes ?? 0),
      0,
    );
    const wide = SHOTS_MANIFEST.shots.reduce(
      (sum, shot) => sum + (shot.variants.find((v) => v.width === 1440)?.bytes ?? 0),
      0,
    );
    expect(small).toBeLessThan(600_000);
    expect(wide).toBeLessThan(1_600_000);
  });
});
