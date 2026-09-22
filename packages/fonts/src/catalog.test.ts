import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ACTIONS } from '@turboslide/schema/actions';
import {
  DEFAULT_FONT_ID,
  FONT_CATEGORIES,
  FONT_IDS,
  FONT_LICENCES,
  isFontId,
} from '@turboslide/schema/fonts';

import { CATALOG_FILES } from './catalog-files.ts';
import { fontFileBytes, fontFileDataUri, fontFileUrl, fontFilesWithBytes } from './catalog-node.ts';
import {
  CATEGORY_GENERIC,
  FONT_CATALOG,
  FONT_SOURCES,
  GOOGLE_FONTS_COMMIT,
  STANDARD_WEIGHTS,
  catalogFont,
  catalogSummary,
  fontAssetPath,
  fontFamilyStack,
  fontFamilyVariable,
  fontsInCategory,
  weightsOf,
} from './catalog.ts';
import { INTER, INTER_ITALIC } from './inter.ts';
import {
  FONT_CATALOG_VERSION,
  FONT_CATEGORY_LABELS,
  FONT_NAMES,
  FONT_PATH_VERSION,
  fontFamilyName,
  fontFilePath,
  fontsStylesheetPath,
  parseFilePath,
  parseStylesheetPath,
} from './names.ts';
import { usedFontIds } from './used.ts';
import { CATALOG_LIGHT } from './catalog-light.ts';
import {
  GENERIC_STACKS,
  catalogSummary as lightSummary,
  hasTabularFigures,
  lightFamily,
} from './summary.ts';
import { woff2Facts } from './woff2-names.ts';

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('the font catalog (gslides-parity SPEC-5-amendments A5 item 2)', () => {
  it('has one row per FONT_IDS entry, in the schema order, and no other', () => {
    expect(FONT_CATALOG.map((row) => row.id)).toEqual([...FONT_IDS]);
    expect(FONT_SOURCES.map((row) => row.id)).toEqual([...FONT_IDS]);
    expect(CATALOG_FILES.map((row) => row.id)).toEqual([...FONT_IDS]);
    for (const row of FONT_CATALOG) expect(isFontId(row.id)).toBe(true);
    // the product round's 26 and the features round's eight (docs/FEATURES.md 3.2)
    expect(FONT_IDS).toHaveLength(34);
    expect(FONT_IDS.slice(26)).toEqual([
      'geist',
      'geist-mono',
      'instrument-sans',
      'manrope',
      'bricolage-grotesque',
      'schibsted-grotesk',
      'newsreader',
      'fraunces',
    ]);
    expect(GOOGLE_FONTS_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });

  it('carries the eight families of docs/FEATURES.md 3.2 as variable files under OFL 1.1 with no Reserved Font Name', () => {
    const eight = FONT_IDS.slice(26);
    for (const id of eight) {
      const row = catalogFont(id);
      expect(row.source.take.kind, id).toBe('variable');
      expect(row.licence, id).toBe('OFL 1.1');
      expect(row.reservedFontName, id).toBeNull();
      expect(row.licenceUrl).toBe(
        `https://github.com/google/fonts/blob/${GOOGLE_FONTS_COMMIT}/${row.source.directory}/OFL.txt`,
      );
      expect(existsSync(fileURLToPath(new URL(`../assets/${id}/LICENSE`, import.meta.url)))).toBe(
        true,
      );
    }
    expect(catalogFont('geist').name).toBe('Geist');
    expect(catalogFont('geist').category).toBe('sans');
    expect(catalogFont('geist').italic).toBe(true);
    expect(catalogFont('geist').weights).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
    expect(catalogFont('geist-mono').name).toBe('Geist Mono');
    expect(catalogFont('geist-mono').category).toBe('mono');
    expect(catalogFont('instrument-sans').category).toBe('sans');
    expect(catalogFont('manrope').italic).toBe(false);
    expect(catalogFont('bricolage-grotesque').italic).toBe(false);
    expect(catalogFont('schibsted-grotesk').weights).toEqual([400, 500, 600, 700, 800, 900]);
    expect(catalogFont('newsreader').category).toBe('serif');
    expect(catalogFont('fraunces').category).toBe('serif');
    // the size budget of 3.3: the eight add about 1.76 MB of woff2 (the exact bytes are the table's)
    const bytes = eight.flatMap((id) => catalogFont(id).files).reduce((n, f) => n + f.bytes, 0);
    expect(bytes).toBeGreaterThan(1_700_000);
    expect(bytes).toBeLessThan(1_850_000);
  });

  it('records the tabular figures flag per family from the GSUB tables (docs/FEATURES.md 3.1 item 4)', () => {
    for (const row of CATALOG_FILES) {
      expect(typeof row.tnum, row.id).toBe('boolean');
      expect(Array.isArray(row.features), row.id).toBe(true);
      expect(row.tnum, row.id).toBe(row.features.includes('tnum'));
      // the flag agrees with the committed upright file's own GSUB table
      const upright = row.files.find((file) => file.style === 'normal') ?? row.files[0]!;
      const facts = woff2Facts(fontFileBytes(row.id, upright.file));
      expect(facts.features.includes('tnum'), `${row.id} tnum`).toBe(row.tnum);
      expect(lightFamily(row.id).tnum, row.id).toBe(row.tnum);
      expect(hasTabularFigures(row.id), row.id).toBe(row.tnum);
    }
    expect(hasTabularFigures('inter')).toBe(true);
    expect(hasTabularFigures('bebas-neue')).toBe(true);
    expect(hasTabularFigures('geist')).toBe(true);
    expect(hasTabularFigures('playfair-display')).toBe(false);
    expect(hasTabularFigures('fraunces')).toBe(false);
    expect(hasTabularFigures('geist-mono')).toBe(false);
  });

  it('names every face the way PowerPoint and Google Slides do, with a category, weights, italic and a licence', () => {
    const names = new Set<string>();
    for (const row of FONT_CATALOG) {
      expect(row.name.length, row.id).toBeGreaterThan(0);
      expect(names.has(row.name), `duplicate name ${row.name}`).toBe(false);
      names.add(row.name);
      expect(FONT_CATEGORIES).toContain(row.category);
      expect(FONT_LICENCES).toContain(row.licence);
      expect(row.weights.length, row.id).toBeGreaterThan(0);
      expect(row.weights, row.id).toContain(400);
      expect(
        [...row.weights].sort((a, b) => a - b),
        row.id,
      ).toEqual(row.weights);
      for (const weight of row.weights) expect(STANDARD_WEIGHTS).toContain(weight);
      expect(row.italic).toBe(row.files.some((file) => file.style === 'italic'));
      expect(row.files.length, row.id).toBeGreaterThan(0);
      expect(row.source.id).toBe(row.id);
    }
    // the faces A5 names, by their Google names
    expect(names).toContain('Inter');
    expect(names).toContain('Roboto');
    expect(names).toContain('Source Sans 3');
    expect(names).toContain('Source Serif 4');
    expect(names).toContain('EB Garamond');
    expect(names).toContain('JetBrains Mono');
    expect(names).toContain('IBM Plex Mono');
    expect(catalogFont('bebas-neue').category).toBe('display');
    expect(catalogFont('roboto-mono').category).toBe('mono');
    expect(catalogFont('merriweather').category).toBe('serif');
    expect(catalogFont(DEFAULT_FONT_ID).name).toBe(INTER.family);
  });

  it('ships every file it names, byte for byte, as woff2 beside its licence', () => {
    for (const row of FONT_CATALOG) {
      const seen = new Set<string>();
      for (const file of row.files) {
        expect(seen.has(file.file), `${row.id} names ${file.file} twice`).toBe(false);
        seen.add(file.file);
        const url = fontFileUrl(row.id, file.file);
        expect(existsSync(fileURLToPath(url)), `${row.id}/${file.file} is missing`).toBe(true);
        const bytes = readFileSync(fileURLToPath(url));
        expect(bytes.byteLength, `${row.id}/${file.file} bytes`).toBe(file.bytes);
        expect(sha256(bytes), `${row.id}/${file.file} sha256`).toBe(file.sha256);
        expect(bytes.subarray(0, 4).toString('latin1'), `${row.id}/${file.file} magic`).toBe(
          'wOF2',
        );
        expect(file.source.length).toBeGreaterThan(0);
        expect(file.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(file.sourceBytes).toBeGreaterThan(0);
        // a variable file names its wght range and covers the row's weights; a static cut one weight
        if (Array.isArray(file.weight)) {
          expect(file.weight[0]).toBeLessThan(file.weight[1]);
          expect(file.weight[0]).toBeGreaterThanOrEqual(1);
          expect(file.weight[1]).toBeLessThanOrEqual(1000);
        } else {
          expect(STANDARD_WEIGHTS).toContain(file.weight);
        }
      }
      if (row.source.take.kind === 'present') {
        // Inter's licence text is THIRD_PARTY_NOTICES.md's first section (inter.ts)
        const notices = readFileSync(
          new URL('../../../THIRD_PARTY_NOTICES.md', import.meta.url),
          'utf8',
        );
        expect(notices).toContain('## Inter (SIL Open Font License 1.1)');
        expect(row.files.map((file) => file.file)).toEqual([INTER.file, INTER_ITALIC.file]);
        expect(row.files[0]?.sha256).toBe(INTER.sha256);
        expect(row.files[1]?.sha256).toBe(INTER_ITALIC.sha256);
        continue;
      }
      const licence = new URL(`../assets/${row.id}/LICENSE`, import.meta.url);
      expect(existsSync(fileURLToPath(licence)), `${row.id}/LICENSE is missing`).toBe(true);
      const text = readFileSync(fileURLToPath(licence), 'utf8');
      if (row.licence === 'OFL 1.1') expect(text).toContain('SIL Open Font License, Version 1.1');
      else expect(text).toContain('Apache License');
      // a Reserved Font Name is recorded when the licence text declares one (the files keep it:
      // the woff2 is a format conversion of the source, nothing subset, renamed or instanced)
      const declares = /Reserved Font Names?/.test(text.split('\n').slice(0, 6).join('\n'));
      expect(row.reservedFontName !== null, `${row.id} reserved font name`).toBe(declares);
      if (row.reservedFontName !== null)
        for (const name of row.reservedFontName.split(', '))
          expect(text.includes(name), `${row.id} declares ${name}`).toBe(true);
    }
  });

  it('takes the variable file where the family ships one and static cuts otherwise', () => {
    for (const row of FONT_CATALOG) {
      const take = row.source.take;
      if (take.kind === 'variable') {
        expect(row.files.length).toBeLessThanOrEqual(2);
        for (const file of row.files) expect(Array.isArray(file.weight), row.id).toBe(true);
      } else if (take.kind === 'static') {
        const weights = new Set(row.files.map((file) => file.weight));
        expect([...weights].sort((a, b) => Number(a) - Number(b))).toEqual([...take.weights]);
        for (const file of row.files) expect(typeof file.weight, row.id).toBe('number');
      }
    }
    expect(catalogFont('roboto').source.take.kind).toBe('variable');
    expect(catalogFont('poppins').source.take).toEqual({
      kind: 'static',
      weights: [300, 400, 500, 600, 700],
    });
    expect(catalogFont('bebas-neue').weights).toEqual([400]);
    expect(catalogFont('bebas-neue').italic).toBe(false);
    expect(weightsOf([{ ...catalogFont('oswald').files[0]!, weight: [200, 700] }])).toEqual([
      200, 300, 400, 500, 600, 700,
    ]);
    expect(weightsOf([{ ...catalogFont('lato').files[0]!, weight: 700 }])).toEqual([700]);
  });

  it('writes the font-family stack, the custom property and the asset path per face', () => {
    // the name, then the base sheet's fallbacks for the category, ending in the generic family
    // (docs/FEATURES.md 3.5; audit-fonts 16: one stack for the block path and the kit path)
    expect(fontFamilyStack('roboto')).toBe("'Roboto', 'Helvetica Neue', Arial, sans-serif");
    expect(fontFamilyStack('merriweather')).toBe(
      "'Merriweather', Georgia, 'Times New Roman', serif",
    );
    expect(fontFamilyStack('jetbrains-mono')).toBe(
      "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    );
    expect(fontFamilyStack('bebas-neue')).toBe("'Bebas Neue', 'Helvetica Neue', Arial, sans-serif");
    expect(fontFamilyStack('inter')).toBe(
      "'Inter', 'Inter Fallback', 'Helvetica Neue', Arial, sans-serif",
    );
    for (const generic of Object.values(CATEGORY_GENERIC))
      expect(GENERIC_STACKS[generic]?.endsWith(generic), generic).toBe(true);
    expect(CATEGORY_GENERIC.mono).toBe('monospace');
    expect(fontFamilyVariable('open-sans')).toBe('--ts-font-open-sans');
    expect(fontAssetPath('roboto', 'roboto.woff2')).toBe('assets/roboto/roboto.woff2');
    expect(fontAssetPath('inter', INTER.file)).toBe(`assets/${INTER.file}`);
    expect(() => catalogFont('comic' as never)).toThrow(RangeError);
    for (const category of FONT_CATEGORIES)
      for (const row of fontsInCategory(category)) expect(row.category).toBe(category);
    expect(fontsInCategory('mono').map((row) => row.id)).toEqual([
      'roboto-mono',
      'jetbrains-mono',
      'ibm-plex-mono',
      'fira-code',
      'geist-mono',
    ]);
  });

  it('answers font.list in the shape the action table declares (A5 item 6)', () => {
    const summary = catalogSummary();
    const parsed = ACTIONS['font.list'].output.safeParse(summary);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues[0])).toBe(
      true,
    );
    expect(summary.fonts).toHaveLength(FONT_IDS.length);
    expect(summary.fonts[0]).toEqual({
      id: 'inter',
      name: 'Inter',
      category: 'sans',
      weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
      italic: true,
      licence: 'OFL 1.1',
    });
  });

  it('reads a file for a Node writer as bytes and as a data URI', () => {
    const [first] = catalogFont('roboto').files;
    const bytes = fontFileBytes('roboto', first!.file);
    expect(bytes.byteLength).toBe(first!.bytes);
    expect(fontFileDataUri('roboto', first!.file).startsWith('data:font/woff2;base64,d09GMg')).toBe(
      true,
    );
    const all = fontFilesWithBytes('poppins');
    expect(all).toHaveLength(10);
    for (const { file, bytes: b } of all) expect(b.byteLength).toBe(file.bytes);
    expect(fontFileBytes('inter', INTER.file).byteLength).toBe(INTER.bytes);
  });
});

describe('the light table (catalog-light.ts, generated by scripts/catalog-light.mjs)', () => {
  it('equals the projection of the full table, so the browser graph carries no digest', () => {
    expect(CATALOG_LIGHT).toEqual(
      CATALOG_FILES.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        licence: row.licence,
        tnum: row.tnum,
        files: row.files.map((file) => ({
          file: file.file,
          style: file.style,
          weight: file.weight,
        })),
      })),
    );
    expect(lightSummary()).toEqual(catalogSummary());
    for (const row of FONT_CATALOG) {
      expect(lightFamily(row.id).files.map((file) => file.file)).toEqual(
        row.files.map((file) => file.file),
      );
      expect(row.licenceUrl).toMatch(/^https:\/\/github\.com\//);
      if (row.id !== 'inter')
        expect(row.licenceUrl).toContain(`/${GOOGLE_FONTS_COMMIT}/${row.source.directory}/OFL.txt`);
      else expect(row.licenceUrl).toBe('https://github.com/rsms/inter/blob/v4.1/LICENSE.txt');
    }
  });
});

describe('the browser half of the catalog (A5 items 3 and 4; names.ts, used.ts)', () => {
  it('names every id the way the generated facts do and carries the catalog version', () => {
    for (const row of FONT_CATALOG) {
      expect(FONT_NAMES[row.id], row.id).toBe(row.name);
      expect(fontFamilyName(row.id)).toBe(row.name);
      expect(fontFamilyStack(row.id).endsWith(CATEGORY_GENERIC[row.category]), row.id).toBe(true);
      expect(fontFamilyStack(row.id).startsWith(`'${row.name}'`), row.id).toBe(true);
    }
    expect(Object.keys(FONT_NAMES).sort()).toEqual([...FONT_IDS].sort());
    expect(FONT_CATALOG_VERSION).toBe(GOOGLE_FONTS_COMMIT);
    expect(FONT_PATH_VERSION).toBe(GOOGLE_FONTS_COMMIT.slice(0, 12));
    for (const category of FONT_CATEGORIES)
      expect(FONT_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
  });

  it('builds and parses the served paths of the faces and the stylesheet', () => {
    const sheet = fontsStylesheetPath(['roboto', 'eb-garamond']);
    expect(sheet).toBe(`/fonts/faces/${FONT_PATH_VERSION}/roboto+eb-garamond.css`);
    expect(parseStylesheetPath(sheet.slice('/fonts/'.length))).toEqual({
      version: FONT_PATH_VERSION,
      ids: ['roboto', 'eb-garamond'],
    });
    const file = fontFilePath('roboto', 'roboto.woff2');
    expect(file).toBe(`/fonts/${FONT_PATH_VERSION}/roboto/roboto.woff2`);
    expect(parseFilePath(file.slice('/fonts/'.length))).toEqual({
      version: FONT_PATH_VERSION,
      id: 'roboto',
      file: 'roboto.woff2',
    });
    expect(parseFilePath('../etc/passwd')).toBeNull();
    expect(parseStylesheetPath('faces/nope/roboto.css')).toBeNull();
    expect(parseFilePath(`${FONT_PATH_VERSION}/roboto/roboto.ttf`)).toBeNull();
  });

  it('lists the families a deck uses from the schema alone, never Inter', () => {
    const block = (id: string, family?: string) => ({
      id,
      type: 'paragraph' as const,
      text: 'A paragraph',
      ...(family === undefined ? {} : { typography: { family: family as never } }),
    });
    const slide = {
      id: 'content-rule',
      kind: 'content' as const,
      layout: { type: 'stack' as const },
      slots: { main: [block('a', 'roboto'), block('b'), block('c', 'inter'), block('d', 'lora')] },
    };
    expect(usedFontIds({}, [slide as never])).toEqual(['roboto', 'lora']);
    expect(usedFontIds({ brand: { fonts: { display: 'oswald' } } }, [])).toEqual(['oswald']);
    expect(usedFontIds({}, [])).toEqual([]);
  });
});
