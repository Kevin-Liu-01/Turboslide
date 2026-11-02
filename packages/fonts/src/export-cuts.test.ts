import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { THEME_FACTS } from '@turboslide/schema/brand';
import type { FontId } from '@turboslide/schema/fonts';

import { CATALOG_FILES } from './catalog-files.ts';
import type { CatalogFamilyFacts } from './catalog-files.ts';
import {
  exportCutFamily,
  exportCutFile,
  exportPlan,
  exportPlanFor,
  THEME_FACE_IDS,
  exportRefusal,
  pickExportCut,
} from './export-cuts.ts';
import type { ExportCut } from './export-cuts.ts';

const plan = (id: FontId): ExportCut[] => exportPlanFor(id).cuts;
function facts(id: FontId): CatalogFamilyFacts {
  const row = CATALOG_FILES.find((r) => r.id === id);
  if (!row) throw new RangeError(`no catalog row ${id}`);
  return row;
}

function pick(id: FontId, size: number, weight: number, italic = false) {
  const out = pickExportCut(plan(id), size, weight, italic);
  return (
    out && { family: out.cut.family, slot: out.cut.slot, weight: out.cut.weight, bold: out.bold }
  );
}

describe('the export cuts of a catalog face (docs/pptx.md "The catalog faces in Editable text")', () => {
  it('names weights 400 and 700 after the face and every other weight after the weight', () => {
    expect(exportCutFamily('Fraunces', 400, 'text')).toBe('Fraunces');
    expect(exportCutFamily('Fraunces', 700, 'text')).toBe('Fraunces');
    expect(exportCutFamily('Fraunces', 600, 'display')).toBe('Fraunces Display SemiBold');
    expect(exportCutFamily('Oswald', 300, null)).toBe('Oswald Light');
    expect(exportCutFile('Fraunces Display SemiBold', 'italic')).toBe(
      'FrauncesDisplaySemiBold-Italic.ttf',
    );
  });

  it('cuts an opsz face at 24 for text and at 72, or the axis maximum, for display', () => {
    const fraunces = plan('fraunces');
    // five weights, two styles, two optical sizes
    expect(fraunces).toHaveLength(20);
    expect(new Set(fraunces.map((c) => c.opsz))).toEqual(new Set([24, 72]));
    expect(
      fraunces
        .filter((c) => c.family === 'Fraunces Display')
        .map((c) => c.slot)
        .sort(),
    ).toEqual(['bold', 'boldItalic', 'italic', 'regular']);
    // DM Sans stops at opsz 40, which the browser draws every run of 40 px and over at
    expect(new Set(plan('dm-sans').map((c) => c.opsz))).toEqual(new Set([24, 40]));
    // no opsz axis, no italic: one optical size, uprights only
    const oswald = plan('oswald');
    expect(oswald.map((c) => c.family)).toEqual([
      'Oswald Light',
      'Oswald',
      'Oswald Medium',
      'Oswald SemiBold',
      'Oswald',
    ]);
    expect(oswald.every((c) => c.band === null && !c.italic)).toBe(true);
    // a static face's own weights, decoded as they ship
    expect(plan('pt-serif').map((c) => `${c.family}/${c.slot}`)).toEqual([
      'PT Serif/regular',
      'PT Serif/italic',
      'PT Serif/bold',
      'PT Serif/boldItalic',
    ]);
    expect(plan('pt-serif').every((c) => c.decoded)).toBe(true);
    expect(plan('inter')).toEqual([]);
  });

  it('names the faces the themes draw, the cuts the hosted function carries', () => {
    expect([...THEME_FACE_IDS].sort()).toEqual([
      'bricolage-grotesque',
      'dm-sans',
      'fraunces',
      'ibm-plex-sans',
      'instrument-sans',
      'newsreader',
      'oswald',
      'space-grotesk',
    ]);
  });

  it('refuses an instanced cut of a variable face with a Reserved Font Name, and nothing else', () => {
    expect(exportRefusal(facts('ibm-plex-sans'))).toMatch(/Reserved Font Name "Plex"/);
    expect(exportRefusal(facts('fraunces'))).toBeNull();
    // a static face with a Reserved Font Name is decoded as it ships
    expect(exportRefusal(facts('pt-serif'))).toBeNull();
    for (const row of CATALOG_FILES) {
      const variable = row.files.some((f) => Array.isArray(f.weight));
      expect(exportRefusal(row) !== null, row.id).toBe(variable && row.reservedFontName !== null);
    }
  });

  it('picks the band by size, the italic where one ships and the weight CSS matching picks', () => {
    expect(pick('fraunces', 96, 600)).toEqual({
      family: 'Fraunces Display SemiBold',
      slot: 'regular',
      weight: 600,
      bold: false,
    });
    expect(pick('fraunces', 96, 700)).toEqual({
      family: 'Fraunces Display',
      slot: 'bold',
      weight: 700,
      bold: true,
    });
    expect(pick('fraunces', 22, 400, true)).toMatchObject({ family: 'Fraunces', slot: 'italic' });
    // Oswald ships no italic: the upright, which the viewer slants as the browser does
    expect(pick('oswald', 30, 400, true)).toMatchObject({ family: 'Oswald', slot: 'regular' });
    // a static face: 600 takes the Bold cut above it, a weight between 400 and 500 the one above
    expect(pick('pt-serif', 30, 600)).toMatchObject({
      family: 'PT Serif',
      slot: 'bold',
      bold: true,
    });
    expect(pick('poppins', 30, 450)).toMatchObject({ family: 'Poppins Medium', weight: 500 });
    // Bebas Neue has one cut: 700 is that cut with the bold the browser synthesizes
    expect(pick('bebas-neue', 64, 700)).toEqual({
      family: 'Bebas Neue',
      slot: 'regular',
      weight: 400,
      bold: true,
    });
    // a weight past the cuts takes the nearest the matching algorithm reaches
    expect(pick('fraunces', 96, 900)).toMatchObject({ family: 'Fraunces Display', weight: 700 });
    expect(pick('fraunces', 22, 200)).toMatchObject({ family: 'Fraunces Light', weight: 300 });
  });
});

const CATALOG_DIR = new URL('../export/catalog/', import.meta.url);
const MANIFEST = new URL('catalog.json', CATALOG_DIR);

type Manifest = {
  faces: Record<
    string,
    {
      refused: string | null;
      cuts: (ExportCut & { sha256: string; bytes: number; spacing?: Record<string, number> })[];
      skipped: { file: string; reason: string }[];
    }
  >;
};

function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
}

describe.skipIf(!existsSync(MANIFEST))('the committed export cuts (build-export-cuts.mjs)', () => {
  it('holds every planned cut of every face the licence allows, and none of a refused face', () => {
    const manifest = readManifest();
    for (const row of CATALOG_FILES) {
      if (row.id === 'inter') continue;
      const face = manifest.faces[row.id];
      const planned = exportPlan(row);
      expect(face?.refused ?? null, row.id).toBe(planned.refused);
      expect(face?.skipped ?? [], row.id).toEqual([]);
      const built = (face?.cuts ?? [])
        .map((c) => `${c.family}/${c.slot}/${c.opsz}/${c.file}`)
        .sort();
      const expected =
        planned.refused === null
          ? planned.cuts.map((c) => `${c.family}/${c.slot}/${c.opsz}/${c.file}`).sort()
          : [];
      expect(built, row.id).toEqual(expected);
    }
  });

  it('matches the files on disk by sha256, with the face licence beside them', () => {
    const manifest = readManifest();
    for (const [id, face] of Object.entries(manifest.faces)) {
      if (face.cuts.length === 0) continue;
      expect(existsSync(new URL(`${id}/LICENSE`, CATALOG_DIR)), id).toBe(true);
      for (const cut of face.cuts) {
        const bytes = readFileSync(fileURLToPath(new URL(`${id}/${cut.file}`, CATALOG_DIR)));
        expect(bytes.byteLength, cut.file).toBe(cut.bytes);
        expect(createHash('sha256').update(bytes).digest('hex'), cut.file).toBe(cut.sha256);
      }
    }
  });

  it("carries a cut for every theme's faces or the reason it cannot", () => {
    const manifest = readManifest();
    for (const theme of Object.values(THEME_FACTS))
      for (const id of [theme.fonts.display, theme.fonts.text]) {
        if (id === 'inter') continue;
        const face = manifest.faces[id];
        expect((face?.cuts.length ?? 0) > 0 || typeof face?.refused === 'string', id).toBe(true);
      }
    // the opsz faces record how much wider each cut draws than the browser, size by size
    const display = manifest.faces.fraunces?.cuts.find(
      (c) => c.file === 'FrauncesDisplay-Regular.ttf',
    );
    expect(Object.keys(display?.spacing ?? {}).length).toBeGreaterThan(50);
  });
});
