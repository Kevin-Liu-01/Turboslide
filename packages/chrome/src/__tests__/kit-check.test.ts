// The Brand kit check (kit-check.ts; the Glyphfield port, wave 2 item 6, from Glyphfield's
// brandHealth.ts): every shipped theme passes in both appearances, a kit colour under its ratio is
// one finding with a Fix that reaches the ratio, a role that follows another is not counted twice,
// and the logo is measured on its pixels.
import { describe, expect, it } from 'vitest';

import { deckTokens } from '@turboslide/render/theme-css';
import type { ThemeDeck } from '@turboslide/render/theme-css';
import type { BrandKit } from '@turboslide/schema/brand';
import { contrastRatio } from '@turboslide/theme/contrast';
import { THEME_RECORDS } from '@turboslide/theme/themes';

import { kitContrastFindings, logoContrast, logoFinding, ratioText } from '../kit-check';

const deckOf = (brand?: BrandKit): ThemeDeck =>
  ({ theme: 'simple', ...(brand === undefined ? {} : { brand }) }) as ThemeDeck;

describe('kitContrastFindings', () => {
  it('finds nothing in any shipped theme in either appearance', () => {
    for (const record of THEME_RECORDS) {
      expect(kitContrastFindings({ theme: record.id } as ThemeDeck), record.id).toEqual([]);
    }
  });

  it('finds Text under 4.5:1 on light slides with a Fix that reaches it', () => {
    const deck = deckOf({ colors: { light: { text: '#9aa3b5' } } });
    const findings = kitContrastFindings(deck);
    const text = findings.find((finding) => finding.id === 'contrast.light.text');
    const measured = contrastRatio('#9aa3b5', deckTokens(deck, 'light').paper);
    expect(text?.sentence).toBe(
      `Text on Background measures ${ratioText(measured)}:1 on light slides; it needs 4.5:1`,
    );
    expect(text?.fix?.pointer).toBe('/colors/light/text');
    const value = text?.fix?.value ?? '#000000';
    expect(value).toMatch(/^#[0-9a-f]{6}$/);
    expect(text?.fix?.doc).toContain(value);
    /* after the fix the row is gone */
    const fixed = deckOf({ colors: { light: { text: value } } });
    expect(kitContrastFindings(fixed).map((finding) => finding.id)).not.toContain(
      'contrast.light.text',
    );
    expect(contrastRatio(value, deckTokens(fixed, 'light').paper)).toBeGreaterThanOrEqual(4.5);
    /* the dark appearance is its own: nothing is found there */
    expect(findings.some((finding) => finding.id.startsWith('contrast.dark.'))).toBe(false);
  });

  it('reads Accent once when it follows Primary, and lightens on dark slides', () => {
    const deck = deckOf({ colors: { dark: { primary: '#1d2a5e' } } });
    const findings = kitContrastFindings(deck);
    expect(findings.map((finding) => finding.id)).toEqual(['contrast.dark.primary']);
    const value = findings[0]?.fix?.value ?? '#000000';
    expect(contrastRatio(value, deckTokens(deck, 'dark').paper)).toBeGreaterThanOrEqual(3);
    /* an Accent of its own is read on its own */
    const both = deckOf({ colors: { dark: { primary: '#1d2a5e', accent: '#2a1d1d' } } });
    expect(kitContrastFindings(both).map((finding) => finding.id)).toEqual([
      'contrast.dark.primary',
      'contrast.dark.accent',
    ]);
  });

  it('reads a ratio down to one decimal, so 4.49 never reads as 4.5', () => {
    expect(ratioText(4.49)).toBe('4.4');
    expect(ratioText(3)).toBe('3');
  });
});

describe('the logo', () => {
  const pixels = (...rgba: number[][]) => new Uint8ClampedArray(rgba.flat());

  it('measures the median of the pixels at least half opaque on the ground', () => {
    /* two white pixels and one black on a dark ground; a clear pixel is not read */
    const ratio = logoContrast(
      pixels([255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255], [0, 0, 0, 0]),
      '#0b0b0c',
    );
    expect(ratio).toBeCloseTo(contrastRatio('#ffffff', '#0b0b0c'), 5);
    expect(logoContrast(pixels([0, 0, 0, 10]), '#ffffff')).toBeNull();
    expect(logoContrast(pixels([0, 0, 0, 255]), 'paper')).toBeNull();
  });

  it('is a finding under 3:1 and none at 3:1 or with no reading', () => {
    expect(logoFinding(1.43, 'dark')).toEqual({
      id: 'logo.dark',
      sentence: 'The logo measures 1.4:1 on the dark Background; it needs 3:1',
    });
    expect(logoFinding(3, 'dark')).toBeNull();
    expect(logoFinding(null, 'light')).toBeNull();
  });
});
