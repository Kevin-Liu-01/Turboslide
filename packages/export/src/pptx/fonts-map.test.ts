// The files an embed takes (docs/pptx.md "The catalog faces in Editable text"): per family and
// slot the Inter set's file or the catalog cut, the upright for a slot the face has no cut for,
// and per family left out the reason, including a host that carries the theme faces' cuts alone
// (apps/studio/vite.deploy.config.ts). No file of the set is touched; a temporary folder stands
// in for the host's catalog folder.
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import type { FontSlot } from '../ooxml/fonts.ts';
import { MONO_FAMILY, embedList, loadFontsCatalog } from './fonts-map.ts';

const catalog = loadFontsCatalog(resolve(import.meta.dirname, '../../../fonts/export'));
const built = catalog.built && catalog.cuts.cuts.some((c) => c.id === 'oswald');

const used = (entries: [string, FontSlot[]][]): Map<string, Set<FontSlot>> =>
  new Map(entries.map(([family, slots]) => [family, new Set(slots)]));

describe.skipIf(!built)('embedList', () => {
  const host = mkdtempSync(join(tmpdir(), 'turboslide-host-cuts-'));
  afterAll(() => rmSync(host, { recursive: true, force: true }));

  test('takes each slot from its set, the upright where the face has no cut for the slot', () => {
    const list = embedList(
      used([
        ['Inter', ['regular', 'italic']],
        ['Oswald', ['italic', 'bold']],
      ]),
      catalog,
    );
    expect(list.fonts.map((f) => [f.family, f.slot, f.pitchFamily])).toEqual([
      ['Inter', 'regular', 0x22],
      ['Inter', 'italic', 0x22],
      // Oswald ships no italic: the italic run embeds the upright the viewer slants
      ['Oswald', 'regular', 0x22],
      ['Oswald', 'bold', 0x22],
    ]);
    expect([list.missing.size, list.warnings]).toEqual([0, []]);
  });

  test('names a face the host lacks, a refused face and the mono face, with no warning', () => {
    cpSync(join(catalog.cuts.dir, 'oswald'), join(host, 'oswald'), { recursive: true });
    const onHost = { ...catalog, cuts: { ...catalog.cuts, dir: host } };
    const list = embedList(
      used([
        ['Oswald Medium', ['regular']],
        ['Lato', ['regular']],
        ['IBM Plex Sans SemiBold', ['regular']],
        [MONO_FAMILY, ['regular']],
      ]),
      onHost,
    );
    expect(list.fonts.map((f) => f.family)).toEqual(['Oswald Medium']);
    expect(list.warnings).toEqual([]);
    expect(list.missing.get('Lato')).toMatch(/^the cuts of Lato are not on this host/);
    expect(list.missing.get('IBM Plex Sans SemiBold')).toMatch(/Reserved Font Name "Plex"/);
    expect(list.missing.get(MONO_FAMILY)).toMatch(/in no export set/);
  });
});
