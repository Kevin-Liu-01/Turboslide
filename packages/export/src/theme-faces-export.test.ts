// The catalog faces in Editable text (docs/pptx.md "The catalog faces in Editable text"): the
// landing deck (apps/studio/home-deck) exported natively under --embed-fonts in Coral (Fraunces
// over DM Sans) and Signal (Oswald over Inter), in the appearance each opens in. Every run names a
// family the file embeds, each font part declares the family and style its slot holds, the theme's
// faces are among them, a face left out is named in the residual with its reason, and export check
// reads the file back valid with every face listed. Runs where the Chrome for Testing binary
// exists and the catalog cuts are built; TURBOSLIDE_SKIP_BROWSER_TESTS=1 skips it. One browser at
// a time (AGENTS.md).
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { ThemeId } from '@turboslide/schema/brand';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { resolveExecutable } from '@turboslide/headless/launch';
import { themeRecord } from '@turboslide/theme/themes';

import { checkPptx } from './check.ts';
import { exportPptx } from './export-pptx.ts';
import type { ExportPptxResult } from './export-pptx.ts';
import { listEmbeddedFontParts, listEmbeddedFonts, usedFaceSlots } from './ooxml/fonts.ts';
import type { FontSlot } from './ooxml/fonts.ts';
import { listParts, openPackage, readPart } from './ooxml/zip.ts';
import { loadFontsCatalog } from './pptx/fonts-map.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const DECK_DIR = join(REPO, 'apps/studio/home-deck');
const THEMES = ['coral', 'signal'] as const satisfies readonly ThemeId[];
const catalog = loadFontsCatalog(join(REPO, 'packages/fonts/export'));
const skip =
  process.env.TURBOSLIDE_SKIP_BROWSER_TESTS === '1' ||
  !existsSync(resolveExecutable().path) ||
  !catalog.built ||
  catalog.cuts.cuts.length === 0;

const STYLES: Record<FontSlot, string> = {
  regular: 'Regular',
  bold: 'Bold',
  italic: 'Italic',
  boldItalic: 'Bold Italic',
};

function documentIn(theme: ThemeId): { deck: Deck; slides: Record<string, Slide> } {
  const deck = JSON.parse(readFileSync(join(DECK_DIR, 'deck.json'), 'utf8')) as Deck;
  const slides: Record<string, Slide> = {};
  for (const id of deck.sections.flatMap((s) => s.slideIds))
    slides[id] = JSON.parse(readFileSync(join(DECK_DIR, 'slides', `${id}.json`), 'utf8')) as Slide;
  return {
    deck: {
      ...deck,
      theme,
      defaults: { ...(deck.defaults ?? {}), appearance: themeRecord(theme).defaultAppearance },
    },
    slides,
  };
}

/** The faces every slide's runs name, with the slots they ask for. */
async function namedFaces(file: string): Promise<Map<string, Set<FontSlot>>> {
  const zip = await openPackage(readFileSync(file));
  const used = new Map<string, Set<FontSlot>>();
  for (const part of listParts(zip).filter((p) =>
    /^ppt\/(slides\/slide|charts\/chart)\d+\.xml$/.test(p),
  ))
    usedFaceSlots(await readPart(zip, part), used);
  return used;
}

describe.skipIf(skip)('the catalog faces embedded in Editable text', () => {
  let out = '';
  const results = new Map<ThemeId, ExportPptxResult>();

  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), 'turboslide-theme-faces-'));
    for (const theme of THEMES) {
      const document = documentIn(theme);
      results.set(
        theme,
        await exportPptx({
          deckDir: DECK_DIR,
          document,
          outDir: join(out, theme),
          mode: 'native',
          themes: [themeRecord(theme).defaultAppearance],
          slideIds: document.deck.sections.flatMap((s) => s.slideIds),
          fontsCatalog: catalog,
          embedFonts: true,
        }),
      );
    }
  }, 1_800_000);

  afterAll(async () => {
    if (process.env.TURBOSLIDE_KEEP_EXPORT_TEST !== '1')
      await rm(out, { recursive: true, force: true });
    else console.log(`theme faces export output kept at ${out}`);
  });

  test("embeds the theme's own faces and lists them as the report does", async () => {
    const expected: Record<(typeof THEMES)[number], RegExp[]> = {
      coral: [/^Fraunces Display\b/, /^DM Sans\b/],
      signal: [/^Oswald\b/, /^Inter\b/],
    };
    for (const theme of THEMES) {
      const result = results.get(theme);
      const zip = await openPackage(readFileSync(result?.files[0] ?? ''));
      const listed = await listEmbeddedFonts(zip);
      expect(listed, theme).toEqual(result?.reports[0]?.fonts.embedded);
      for (const pattern of expected[theme])
        expect(
          listed.some((family) => pattern.test(family)),
          `${theme}: ${pattern} in ${listed.join(', ')}`,
        ).toBe(true);
      // the theme's faces never fall back to a name alone
      expect(listed.filter((family) => /^(Times|Arial|Calibri)/.test(family))).toEqual([]);
    }
  });

  test('names in every run a family an embedded part declares, in the slot it asks for', async () => {
    for (const theme of THEMES) {
      const result = results.get(theme);
      const file = result?.files[0] ?? '';
      const zip = await openPackage(readFileSync(file));
      const parts = await listEmbeddedFontParts(zip);
      // each part declares the family and style its slot holds
      for (const part of parts) {
        expect(part.declares, `${theme} ${part.part}`).toBe(part.typeface);
        expect(part.fontFamily, `${theme} ${part.part}`).toBe(part.typeface);
        expect(part.style, `${theme} ${part.part}`).toBe(STYLES[part.slot]);
        expect(part.bytes, `${theme} ${part.part}`).toBeGreaterThan(10_000);
      }
      const embedded = new Set(parts.map((p) => p.typeface));
      const residual = result?.reports[0]?.residual ?? [];
      for (const [family, slots] of await namedFaces(file)) {
        if (embedded.has(family)) {
          // a slot the face has no cut for is the viewer's synthesis over the upright it embeds
          const filled = parts.filter((p) => p.typeface === family).map((p) => p.slot);
          for (const slot of slots)
            expect(
              filled.includes(slot) || filled.includes('regular') || filled.includes('bold'),
              `${theme} ${family} ${slot}`,
            ).toBe(true);
          continue;
        }
        // a face left out is named with its reason
        expect(
          residual.some((line) => line.startsWith(`fonts: ${family} not embedded: `)),
          `${theme}: ${family} has no reason in ${residual.join(' | ')}`,
        ).toBe(true);
      }
      expect(residual.filter((line) => line.startsWith('warning: '))).toEqual([]);
    }
  });

  test('Coral runs name the Fraunces display cut and the DM Sans text cut, Signal Oswald', async () => {
    const coral = [...(await namedFaces(results.get('coral')?.files[0] ?? '')).keys()];
    expect(
      coral.some((f) => f.startsWith('Fraunces Display')),
      coral.join(', '),
    ).toBe(true);
    expect(
      coral.some((f) => /^DM Sans( |$)/.test(f)),
      coral.join(', '),
    ).toBe(true);
    const signal = [...(await namedFaces(results.get('signal')?.files[0] ?? '')).keys()];
    expect(
      signal.some((f) => /^Oswald( |$)/.test(f)),
      signal.join(', '),
    ).toBe(true);
  });

  test('export check reads each file back valid with every face it embeds', async () => {
    for (const theme of THEMES) {
      const result = results.get(theme);
      const check = await checkPptx(result?.files[0] ?? '', { quickLook: false });
      expect(check.issues, theme).toEqual([]);
      expect(check.valid, theme).toBe(true);
      expect(check.embeddedFonts, theme).toEqual(result?.reports[0]?.fonts.embedded);
      expect(check.fontParts?.length, theme).toBeGreaterThan(0);
      expect(
        (check.fontsNotEmbedded ?? []).filter((f) => /^(Fraunces|DM Sans|Oswald)/.test(f)),
        theme,
      ).toEqual([]);
      if (check.pythonPptx.ran) expect(check.pythonPptx.slides, theme).toBe(8);
    }
  });
});
