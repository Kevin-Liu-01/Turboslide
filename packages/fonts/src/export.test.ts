import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/** The OS/2 fsSelection field of a TrueType file. */
function os2Selection(buffer: Buffer): number {
  const offset = tableOffset(buffer, 'OS/2');
  return offset < 0 ? 0 : buffer.readUInt16BE(offset + 62);
}

/** The head macStyle field of a TrueType file. */
function headMacStyle(buffer: Buffer): number {
  const offset = tableOffset(buffer, 'head');
  return offset < 0 ? 0 : buffer.readUInt16BE(offset + 44);
}

function tableOffset(buffer: Buffer, wanted: string): number {
  const numTables = buffer.readUInt16BE(4);
  for (let i = 0; i < numTables; i += 1) {
    const at = 12 + i * 16;
    if (buffer.toString('latin1', at, at + 4) === wanted) return buffer.readUInt32BE(at + 8);
  }
  return -1;
}
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
    // both sources declare no Reserved Font Name (gslides-parity SPEC-2 0.66)
    expect(fonts.license.reservedFontName).toBeNull();
    expect(fonts.license.italicReservedFontName).toBeNull();
    expect(fonts.source.fsType).toBe(0);
    expect(fonts.source.italic.fsType).toBe(0);
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

  it('carries 34 faces, an italic twin per upright face with the italic name table facts (gslides-parity SPEC-2 7.1)', () => {
    expect(fonts.faces).toHaveLength(34);
    const italics = fonts.faces.filter((f) => f.italic);
    const uprights = fonts.faces.filter((f) => !f.italic);
    expect(italics).toHaveLength(17);
    expect(uprights).toHaveLength(17);
    expect(fonts.version).toBe('4.001+gt.2');
    for (const upright of uprights) {
      const twin = italics.find(
        (f) =>
          f.family === upright.family && f.opsz === upright.opsz && f.weight === upright.weight,
      );
      expect(twin, upright.family).toBeDefined();
      expect(twin?.style).toBe('Italic');
      expect(twin?.postScriptName).toBe(
        `${upright.postScriptName.replace(/-Regular$/, '')}-Italic`,
      );
      expect(twin?.file).toBe(`${twin?.postScriptName}.ttf`);
      expect(twin?.frozen).toEqual(upright.frozen);
      expect(twin?.sets).toEqual(upright.sets);
      const bytes = exportFaceBytes(twin!);
      const names = ttfNames(bytes);
      expect(names.get(4), twin?.file).toBe(`${upright.family} Italic`);
      expect(names.get(16) ?? upright.family).toBe(upright.family);
      expect(names.get(17) ?? 'Italic').toBe('Italic');
      // OS/2.fsSelection italic bit and head.macStyle italic bit
      expect(os2Selection(bytes) & 1, twin?.file).toBe(1);
      expect(headMacStyle(bytes) & 2, twin?.file).toBe(2);
    }
    // the italic source is recorded with its provenance
    expect(fonts.source.italic.file).toBe('packages/fonts/assets/InterVariable-Italic.woff2');
    expect(fonts.source.italic.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fonts.source.italic.release).toContain('rsms/inter/releases/tag/v4.001');
    expect(fonts.source.italic.path).toBe('web/InterVariable-Italic.woff2');
    expect(fonts.source.italic.italicAngle).toBeLessThan(0);
  });

  it('has the SPEC 8.4 families: one display face and both weights at every text size', () => {
    const exact = exportFaces('exact');
    // one display face, and since round two its italic twin beside it
    expect(exact.filter((f) => f.display && !f.italic)).toHaveLength(1);
    expect(exact.filter((f) => f.display && f.italic)).toHaveLength(1);
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
    // the three families, each with an upright and an italic face since round two
    expect([...new Set(standard.map((f) => f.family))].sort()).toEqual(
      ['GT Inter Display', 'Inter', 'Inter Medium'].sort(),
    );
    expect(standard).toHaveLength(6);
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
    // the italic twin keeps the family name and carries the Italic style (gslides-parity SPEC-2 7.1)
    expect(exportFace(22, 400, { italic: true })).toMatchObject({
      family: 'GT Inter Text 22',
      style: 'Italic',
      postScriptName: 'GTInterText22-Italic',
    });
    expect(exportFace(88, 500, { italic: true }).postScriptName).toBe('GTInterDisplay-Italic');
    expect(exportFace(20, 500, { set: 'standard', italic: true }).postScriptName).toBe(
      'InterMedium-Italic',
    );
    expect(exportFace(22, 400).style).toBe('Regular');
    expect(DISPLAY_MIN_PX).toBe(44);
    expect(nearestTextSize(16, [26, 24, 22, 20, 18, 15, 14])).toBe(15);
    expect(nearestTextSize(25, [26, 24, 22, 20, 18, 15, 14])).toBe(24);
  });

  it('names the set version for the export report', () => {
    expect(fontSetVersion()).toBe(`${fonts.version}:exact`);
    expect(fontSetVersion('standard')).toMatch(/^4\.001\+gt\.\d+:standard$/);
  });
});
