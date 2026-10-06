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

  it('carries 38 faces, an italic twin per upright face with the italic name table facts (gslides-parity SPEC-2 7.1)', () => {
    expect(fonts.faces).toHaveLength(38);
    const italics = fonts.faces.filter((f) => f.italic);
    const uprights = fonts.faces.filter((f) => !f.italic);
    expect(italics).toHaveLength(19);
    expect(uprights).toHaveLength(19);
    expect(fonts.version).toBe('4.001+build.3');
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
    expect(fonts.source.italic.release).toContain('rsms/inter/releases/tag/v4.1');
    expect(fonts.source.italic.path).toBe('web/InterVariable-Italic.woff2');
    expect(fonts.source.italic.italicAngle).toBeLessThan(0);
  });

  it('names the upstream families and Inter Text by size, and no name carries GT (docs/DESIGN.md 4.3)', () => {
    for (const face of fonts.faces) {
      expect(face.family, face.file).toMatch(/^Inter( |$)/);
      expect(face.file, face.family).not.toMatch(/^GT/);
      expect(ttfNames(exportFaceBytes(face)).get(3), face.file).not.toMatch(/\bGT\b/);
    }
    const standard = exportFaces('standard');
    expect([...new Set(standard.map((f) => f.family))].sort()).toEqual(
      [
        'Inter',
        'Inter Medium',
        'Inter Display',
        'Inter Display Medium',
        'Inter Display Alternates',
      ].sort(),
    );
    // each family with an upright and an italic face
    expect(standard).toHaveLength(10);
    const exact = exportFaces('exact');
    for (const size of fonts.textSizes) {
      expect(exact.some((f) => f.family === `Inter Text ${size}`), String(size)).toBe(true);
      expect(exact.some((f) => f.family === `Inter Text ${size} Medium`), String(size)).toBe(true);
    }
    const display = exact.filter((f) => f.display && !f.italic);
    expect(display.map((f) => [f.family, f.weight, f.opsz, f.frozen])).toEqual([
      ['Inter Display Alternates', 500, 32, ['cv11', 'ss01']],
      ['Inter Display', 400, 32, []],
      ['Inter Display Medium', 500, 32, []],
    ]);
    expect(fonts.display).toEqual({ '400': 'Inter Display', '500': 'Inter Display Medium' });
    expect(fonts.alternates).toBe('Inter Display Alternates');
  });

  it('records the standard set width over the browser per size (research-type 1.5)', () => {
    const inter = fonts.spacing['Inter'];
    const medium = fonts.spacing['Inter Medium'];
    expect(Object.keys(inter ?? {})).toHaveLength(29);
    // the opsz 14 design is wider than the optical size the browser draws above 14 px
    expect(inter?.['18']).toBeCloseTo(0.0194, 2);
    expect(inter?.['22']).toBeCloseTo(0.04, 2);
    expect(inter?.['26']).toBeCloseTo(0.0613, 2);
    expect(medium?.['22']).toBeCloseTo(0.0359, 2);
    // the axis stops at opsz 32, so the share is constant from 32 px to 43 px
    expect(inter?.['43']).toBe(inter?.['32']);
    for (const value of Object.values(inter ?? {})) expect(value).toBeGreaterThan(0);
  });

  it('maps a run to its family', () => {
    // the standard set is the default
    expect(exportFamily(22, 400)).toBe('Inter');
    expect(exportFamily(22, 500)).toBe('Inter Medium');
    expect(exportFamily(44, 500)).toBe('Inter Display Medium');
    expect(exportFamily(88, 400)).toBe('Inter Display');
    expect(exportFamily(88, 500, { alternates: true })).toBe('Inter Display Alternates');
    expect(exportFamily(88, 400, { alternates: true })).toBe('Inter Display');
    expect(exportFamily(20, 500, { display: true })).toBe('Inter Display Medium');
    expect(exportFamily(22, 400, { set: 'exact' })).toBe('Inter Text 22');
    expect(exportFamily(22, 500, { set: 'exact' })).toBe('Inter Text 22 Medium');
    expect(exportFamily(13, 400, { set: 'exact' })).toBe('Inter Text 14');
    expect(exportFamily(16, 400, { set: 'exact' })).toBe('Inter Text 15');
    expect(exportFamily(17, 400, { set: 'exact' })).toBe('Inter Text 18');
    expect(exportFamily(44, 500, { set: 'exact' })).toBe('Inter Display Medium');
    expect(exportFace(26, 500, { set: 'exact' }).opsz).toBe(26);
    // the italic twin keeps the family name and carries the Italic style (gslides-parity SPEC-2 7.1)
    expect(exportFace(22, 400, { set: 'exact', italic: true })).toMatchObject({
      family: 'Inter Text 22',
      style: 'Italic',
      postScriptName: 'InterText22-Italic',
    });
    expect(exportFace(88, 500, { italic: true, alternates: true }).postScriptName).toBe(
      'InterDisplayAlternates-Italic',
    );
    expect(exportFace(20, 500, { italic: true }).postScriptName).toBe('InterMedium-Italic');
    expect(exportFace(22, 400).style).toBe('Regular');
    expect(DISPLAY_MIN_PX).toBe(44);
    expect(nearestTextSize(16, [26, 24, 22, 20, 18, 15, 14])).toBe(15);
    expect(nearestTextSize(25, [26, 24, 22, 20, 18, 15, 14])).toBe(24);
  });

  it('names the set version for the export report', () => {
    expect(fontSetVersion()).toBe(`${fonts.version}:standard`);
    expect(fontSetVersion('exact')).toMatch(/^4\.001\+build\.\d+:exact$/);
  });
});
