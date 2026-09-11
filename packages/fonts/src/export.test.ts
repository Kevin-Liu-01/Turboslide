import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DISPLAY_MIN_PX,
  exportFace,
  exportFaceBytes,
  exportFaces,
  exportFamily,
  fontSetVersion,
  loadExportFonts,
  nearestTextSize,
  ttfNames,
} from './export.ts';

describe('the export font set', () => {
  const fonts = loadExportFonts();

  it('is the committed build of scripts/build-fonts.py, byte for byte', () => {
    expect(fonts.generatedBy).toBe('scripts/build-fonts.py');
    expect(fonts.license.reservedFontName).toBeNull();
    expect(fonts.source.fsType).toBe(0);
    for (const face of fonts.faces) {
      const bytes = exportFaceBytes(face);
      expect(bytes.byteLength, face.file).toBe(face.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), face.file).toBe(face.sha256);
      // a static TrueType file: sfnt version 0x00010000, no fvar
      expect(bytes.readUInt32BE(0)).toBe(0x00010000);
      const names = ttfNames(bytes);
      expect(names.get(1), face.file).toBe(face.family);
      expect(names.get(2), face.file).toBe(face.style);
      expect(names.get(6), face.file).toBe(face.postScriptName);
      // the OFL notices survive the rename
      expect(names.get(0)).toContain('The Inter Project Authors');
      expect(names.get(13)).toContain('SIL Open Font License');
    }
  });

  it('has the SPEC 8.4 families: one display face and both weights at every text size', () => {
    const exact = exportFaces('exact');
    expect(exact.filter((f) => f.display)).toHaveLength(1);
    expect(exact.find((f) => f.display)?.family).toBe('GT Inter Display');
    expect(exact.find((f) => f.display)?.frozen).toEqual(['cv11', 'ss01']);
    for (const size of fonts.textSizes) {
      expect(
        exact.some((f) => f.opsz === size && f.weight === 400),
        String(size),
      ).toBe(true);
      expect(
        exact.some((f) => f.opsz === size && f.weight === 500),
        String(size),
      ).toBe(true);
    }
    // the acceptance counts fc-list lines: 12 or more faces named GT Inter
    expect(
      fonts.faces.filter((f) => f.family.startsWith('GT Inter')).length,
    ).toBeGreaterThanOrEqual(12);
    const standard = exportFaces('standard');
    expect(standard.map((f) => f.family).sort()).toEqual(
      ['GT Inter Display', 'Inter', 'Inter Medium'].sort(),
    );
  });

  it('maps a run to its family', () => {
    expect(exportFamily(22, 400)).toBe('GT Inter Text 22');
    expect(exportFamily(22, 500)).toBe('GT Inter Text 22 Medium');
    expect(exportFamily(44, 500)).toBe('GT Inter Display');
    expect(exportFamily(88, 500)).toBe('GT Inter Display');
    expect(exportFamily(13, 400)).toBe('GT Inter Text 14');
    expect(exportFamily(16, 400)).toBe('GT Inter Text 15');
    expect(exportFamily(17, 400)).toBe('GT Inter Text 18');
    expect(exportFamily(20, 500, { display: true })).toBe('GT Inter Display');
    expect(exportFamily(22, 400, { set: 'standard' })).toBe('Inter');
    expect(exportFamily(20, 500, { set: 'standard' })).toBe('Inter Medium');
    expect(exportFamily(44, 500, { set: 'standard' })).toBe('GT Inter Display');
    expect(exportFace(26, 500).opsz).toBe(26);
    expect(DISPLAY_MIN_PX).toBe(44);
    expect(nearestTextSize(16, [26, 24, 22, 20, 18, 15, 14])).toBe(15);
    expect(nearestTextSize(25, [26, 24, 22, 20, 18, 15, 14])).toBe(24);
  });

  it('names the set version for the export report', () => {
    expect(fontSetVersion()).toBe(`${fonts.version}:exact`);
    expect(fontSetVersion('standard')).toMatch(/^4\.001\+gt\.\d+:standard$/);
  });
});
