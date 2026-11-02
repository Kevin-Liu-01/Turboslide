// The theme's parts in Editable text (docs/DESIGN.md 7.2, docs/pptx.md): the landing deck's title
// and body slides (apps/studio/home-deck) exported natively in each theme that draws parts, in the
// appearance it opens in. The scene reads each part from the slide's pseudo elements and the bar
// over each heading, and the file carries them as the backmost shapes, named
// `ts:<slide>#theme/<n>`, a disc as an ellipse, a hairline as an outline with no fill, and a solid
// part over the whole sheet as the slide's background. General Translation draws none, so its
// scenes carry no parts. Runs where the Chrome for Testing binary exists;
// TURBOSLIDE_SKIP_BROWSER_TESTS=1 skips it. One browser at a time (AGENTS.md).
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Deck, Slide } from '@turboslide/schema/deck';
import type { ThemeId } from '@turboslide/schema/brand';
import { resolveExecutable } from '@turboslide/headless/launch';
import { themeRecord } from '@turboslide/theme/themes';

import { checkPptx } from './check.ts';
import { exportPptx } from './export-pptx.ts';
import type { ExportPptxResult } from './export-pptx.ts';
import { readGeometry } from './ooxml/geometry.ts';
import { openPackage, readPart, slideParts } from './ooxml/zip.ts';
import { loadFontsCatalog } from './pptx/fonts-map.ts';
import { pxToEmu } from './units.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const DECK_DIR = join(REPO, 'apps/studio/home-deck');
const SLIDES = ['title', 'plan'] as const;
const THEMES: readonly ThemeId[] = ['swiss', 'mint', 'coral', 'night', 'slate', 'sand', 'signal'];
const skip =
  process.env.TURBOSLIDE_SKIP_BROWSER_TESTS === '1' || !existsSync(resolveExecutable().path);

function documentIn(theme: ThemeId): { deck: Deck; slides: Record<string, Slide> } {
  const deck = JSON.parse(readFileSync(join(DECK_DIR, 'deck.json'), 'utf8')) as Deck;
  const slides: Record<string, Slide> = {};
  for (const id of SLIDES)
    slides[id] = JSON.parse(readFileSync(join(DECK_DIR, 'slides', `${id}.json`), 'utf8')) as Slide;
  const { brand: _brand, ...rest } = deck;
  return {
    deck: {
      ...rest,
      theme,
      defaults: { ...(deck.defaults ?? {}), appearance: themeRecord(theme).defaultAppearance },
      sections: [{ id: 'deck', name: 'Deck', slideIds: [...SLIDES] }],
    } as Deck,
    slides,
  };
}

/** The slide XML of each exported slide, by slide id in the deck's order. */
async function slideXml(file: string): Promise<Record<string, string>> {
  const zip = await openPackage(readFileSync(file));
  const parts = slideParts(zip);
  const out: Record<string, string> = {};
  for (const [i, part] of parts.entries()) out[SLIDES[i] ?? part] = await readPart(zip, part);
  return out;
}

/** The `<p:sp>` element named `name` in a slide part. */
function shapeNamed(xml: string, name: string): string | undefined {
  return xml.split('<p:sp>').find((sp) => sp.includes(`name="${name}"`));
}

describe.skipIf(skip)("the theme's parts in Editable text", () => {
  let out = '';
  const results = new Map<ThemeId | 'general-translation', ExportPptxResult>();
  const catalog = loadFontsCatalog(
    process.env.TURBOSLIDE_TEST_TTF_DIR ?? join(REPO, 'packages/fonts/export'),
  );

  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), 'turboslide-theme-parts-'));
    for (const theme of [...THEMES, 'general-translation' as const])
      results.set(
        theme,
        await exportPptx({
          deckDir: DECK_DIR,
          document: documentIn(theme),
          outDir: join(out, theme),
          mode: 'native',
          themes: [themeRecord(theme).defaultAppearance],
          slideIds: [...SLIDES],
          fontsCatalog: catalog,
          writeScenes: true,
        }),
      );
  }, 1_800_000);

  afterAll(async () => {
    if (process.env.TURBOSLIDE_KEEP_EXPORT_TEST !== '1')
      await rm(out, { recursive: true, force: true });
    else console.log(`theme parts export output kept at ${out}`);
  });

  test("measures each slide's parts where the theme draws them, and none in General Translation", () => {
    for (const theme of THEMES) {
      const record = themeRecord(theme);
      const scenes = results.get(theme)?.scenes ?? [];
      const title = scenes.find((s) => s.slideId === 'title');
      const plan = scenes.find((s) => s.slideId === 'plan');
      // the bar over each heading: the title's h1 and the body slide's h2
      const bar = record.title.accentBar ? 1 : 0;
      expect(title?.themeParts?.length, `${theme} title`).toBe(record.title.parts.length + bar);
      expect(plan?.themeParts?.length, `${theme} plan`).toBe(record.parts.length + bar);
      // the measured boxes are the records' boxes on the sheet, a hairline grown by its border
      record.title.parts.forEach((part, i) => {
        const [x, y, w, h] = part.box;
        const grow = part.fill === 'line' ? 2 : 0;
        expect(title?.themeParts?.[i]?.box, `${theme} title part ${i}`).toEqual([
          x,
          y,
          w + grow,
          h + grow,
        ]);
        expect(title?.themeParts?.[i]?.shape, `${theme} title part ${i}`).toBe(
          part.round === true ? 'ellipse' : undefined,
        );
      });
    }
    for (const scene of results.get('general-translation')?.scenes ?? [])
      expect(scene.themeParts, scene.slideId).toBeUndefined();
  });

  test('writes the parts as the backmost shapes, a disc as an ellipse and a hairline as an outline', async () => {
    for (const theme of THEMES) {
      const record = themeRecord(theme);
      const xml = await slideXml(results.get(theme)?.files[0] ?? '');
      for (const slide of SLIDES) {
        const parts = slide === 'title' ? record.title.parts : record.parts;
        const body = xml[slide] ?? '';
        // the first shape of the slide after the hidden title is a theme part, unless every
        // part went to the background
        const named = [...body.matchAll(/<p:cNvPr id="\d+" name="([^"]+)"/g)].map((m) => m[1]);
        const first = named.find((name) => !name?.endsWith('#title'));
        parts.forEach((part, i) => {
          const name = `ts:${slide}#theme/${i}`;
          const [x, y, w, h] = part.box;
          const sheet = x === 0 && y === 0 && w === 1600 && h === 900;
          if (sheet && part.fill !== 'line' && part.round !== true) {
            // a flooded title or a card's ground is the slide's background
            expect(body, `${theme} ${slide} background`).toContain('<p:bg>');
            expect(shapeNamed(body, name), `${theme} ${slide} ${name}`).toBeUndefined();
            return;
          }
          const sp = shapeNamed(body, name);
          expect(sp, `${theme} ${slide} ${name}`).toBeDefined();
          expect(sp, `${theme} ${slide} ${name}`).toContain(
            `<a:prstGeom prst="${part.round === true ? 'ellipse' : 'rect'}">`,
          );
          // a hairline is an outline and no fill; every other part a fill and no outline
          const outline = /<a:ln w="\d+"><a:solidFill>/.test(sp ?? '');
          const fill = /<a:solidFill>/.test((sp ?? '').replace(/<a:ln[\s\S]*?<\/a:ln>/, ''));
          expect([outline, fill], `${theme} ${slide} ${name}`).toEqual(
            part.fill === 'line' ? [true, false] : [false, true],
          );
        });
        if (parts.some((part) => !(part.box[2] === 1600 && part.box[3] === 900)))
          expect(first, `${theme} ${slide}: the first shape`).toMatch(/#theme\/\d+$/);
      }
    }
  });

  test('writes the title flood of Signal and Slate as the slide background in its own colour', async () => {
    for (const theme of ['signal', 'slate'] as const) {
      const record = themeRecord(theme);
      const appearance = record.defaultAppearance;
      const flood = record.title.colors?.[appearance].paper.replace('#', '');
      const xml = await slideXml(results.get(theme)?.files[0] ?? '');
      expect(xml.title, theme).toMatch(
        new RegExp(`<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${flood}"`, 'i'),
      );
    }
    // Mint's card on its green ground: the ground is the background, the card a rectangle 40 px in
    const mint = await slideXml(results.get('mint')?.files[0] ?? '');
    const accent = themeRecord('mint').colors.light.accent.replace('#', '');
    expect(mint.plan).toMatch(
      new RegExp(`<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${accent}"`, 'i'),
    );
    expect(shapeNamed(mint.plan ?? '', 'ts:plan#theme/1')).toContain(`<a:off x="${pxToEmu(40)}"`);
  });

  test('keeps every file valid with every shape on the page or crossing its edge', async () => {
    for (const theme of THEMES) {
      const file = results.get(theme)?.files[0] ?? '';
      const check = await checkPptx(file, { quickLook: false });
      expect(check.valid, `${theme}: ${check.issues.join('; ')}`).toBe(true);
      const zip = await openPackage(readFileSync(file));
      for (const g of await readGeometry(zip))
        expect(g.inBounds, `${theme} ${g.part} ${g.name}`).toBe(true);
    }
  });
});
