import { describe, expect, it } from 'vitest';

import { ROUND_FIVE } from '../menus/strings';
import { SPECIAL_CHARACTERS } from './special-characters-data';
import {
  GLYPH_TEMPLATES,
  featureDistance,
  normalizeStrokes,
  recognizeStrokes,
  strokeFeatures,
  templateStrokes,
} from './stroke-recognizer';
import type { Stroke } from './stroke-recognizer';

// The special characters dialog's drawing box (gslides-parity SPEC-5 0.41, 7.7; MILESTONES-5 B5
// item 6): Turboslide's own recogniser over eight direction histograms, its result list labelled
// "Best guesses". Ten glyphs drawn as their templates with a jitter of a few pixels, moved and
// scaled, are recognised as the first guess; the label is the ROUND_FIVE sentence; every template
// names a character the dialog offers in the Math or Arrows category.

/** A drawing of a glyph the way a hand would make it: the template moved, scaled and jittered. */
function drawn(char: string, seed: number, scale = 1, dx = 0, dy = 0): Stroke[] {
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  return templateStrokes(char, 160, 24).map((stroke) =>
    stroke.map((point) => ({
      x: dx + point.x * scale + (random() - 0.5) * 6,
      y: dy + point.y * scale + (random() - 0.5) * 6,
    })),
  );
}

const TEN = ['→', '←', '↑', '↓', '+', '×', '=', '∞', '√', '∑'];

describe('the drawing box recogniser', () => {
  it('labels its list "Best guesses" and offers every template in the dialog', () => {
    expect(ROUND_FIVE.bestGuesses).toBe('Best guesses');
    const offered = new Set(
      SPECIAL_CHARACTERS.filter(
        (entry) => entry.category === 'Math' || entry.category === 'Arrows',
      ).map((entry) => entry.char),
    );
    const missing = GLYPH_TEMPLATES.filter((template) => !offered.has(template.char)).map(
      (template) => template.char,
    );
    expect(missing).toEqual([]);
    expect(GLYPH_TEMPLATES.length).toBeGreaterThanOrEqual(40);
  });
  it.each(TEN)('recognises a drawn %s as the first guess', (char) => {
    const guesses = recognizeStrokes(drawn(char, 7, 0.8, 12, 9));
    expect(guesses.length).toBe(5);
    expect(guesses[0]?.char).toBe(char);
  });
  it('is size and place invariant and tells a dash from an equals sign', () => {
    const small = strokeFeatures(templateStrokes('→', 60, 5));
    const large = strokeFeatures(templateStrokes('→', 400, 40));
    expect(featureDistance(small, large)).toBeLessThan(1e-6);
    expect(recognizeStrokes(templateStrokes('−'))[0]?.char).toBe('−');
    expect(recognizeStrokes(templateStrokes('='))[0]?.char).toBe('=');
    expect(recognizeStrokes([])).toEqual([]);
  });
  it('normalises the ink into the unit box and reads a dot as ink without a direction', () => {
    const [stroke] = normalizeStrokes([
      [
        { x: 10, y: 10 },
        { x: 110, y: 60 },
      ],
    ]);
    expect(stroke?.[0]).toEqual({ x: 0, y: 0.25 });
    expect(stroke?.[1]).toEqual({ x: 1, y: 0.75 });
    const dot = strokeFeatures([[{ x: 5, y: 5 }]]);
    expect(dot.strokes).toBe(1);
    expect(dot.directions.every((value) => value === 0)).toBe(true);
  });
});
