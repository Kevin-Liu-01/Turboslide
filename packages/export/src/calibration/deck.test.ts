import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { loadThemeBundle } from '@turboslide/render/theme-node';
import { renderSlide } from '@turboslide/render/slide';
import { validateDeck } from '@turboslide/schema/validate';

import {
  CALIBRATION_SLIDE_IDS,
  calibrationDeck,
  calibrationPicture,
  calibrationShot,
  writeCalibrationDeck,
} from './deck.ts';

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-calibration-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('the calibration deck', () => {
  it('validates with no blocking issue and one slide per archetype', () => {
    const document = calibrationDeck();
    const result = validateDeck({ deck: document.deck, slides: document.slides });
    expect(result.issues.filter((i) => i.severity === 3)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(Object.keys(result.slides).sort()).toEqual([...CALIBRATION_SLIDE_IDS].sort());
    const kinds = Object.values(document.slides).map((s) => s.kind);
    expect(kinds).toContain('mood');
    expect(kinds.filter((k) => k === 'content')).toHaveLength(4);
  });

  it('renders every slide in both themes without a warning', () => {
    const document = calibrationDeck();
    // the theme bundle is not needed for the slide markup; renderSlide takes the deck and slide
    expect(() => loadThemeBundle({ inlineFonts: false })).not.toThrow();
    for (const slide of Object.values(document.slides)) {
      for (const theme of ['light', 'dark'] as const) {
        const rendered = renderSlide(document.deck, slide, {
          theme,
          chrome: true,
          assetBase: '',
          blockAttrs: true,
          gtWord: true,
        });
        expect(rendered.warnings, `${slide.id} ${theme}`).toEqual([]);
        expect(rendered.html).toContain('data-block');
      }
    }
  });

  it('writes the deck with deterministic assets', async () => {
    const written = await writeCalibrationDeck(join(tmp, 'deck'));
    expect(written.files.map((f) => f.replace(`${written.dir}/`, '')).sort()).toEqual(
      [
        'assets/cal-picture-dark.png',
        'assets/cal-picture-light.png',
        'assets/cal-shot.png',
        'deck.json',
        ...CALIBRATION_SLIDE_IDS.map((id) => `slides/${id}.json`),
      ].sort(),
    );
    const manifest = JSON.parse(readFileSync(join(written.dir, 'deck.json'), 'utf8')) as {
      revision: number;
    };
    expect(manifest.revision).toBe(1);
    const light = calibrationPicture('light');
    const dark = calibrationPicture('dark');
    // the plate quarter is paper in both twins
    const at = (image: { width: number; data: Uint8Array }, x: number, y: number): number =>
      image.data[(y * image.width + x) * 4] ?? -1;
    expect(at(light, 1500, 800)).toBe(255);
    expect(at(dark, 1500, 800)).toBe(7);
    // the upper left is mostly ink
    let ink = 0;
    for (let y = 0; y < 100; y += 1)
      for (let x = 0; x < 100; x += 1) if (at(light, x, y) === 7) ink += 1;
    expect(ink).toBeGreaterThan(9000);
    const shot = calibrationShot();
    expect(at(shot, 50, 7)).toBe(210);
    expect(at(shot, 400, 225)).toBe(7);
    expect(at(shot, 26, 27)).toBe(255);
  });
});
