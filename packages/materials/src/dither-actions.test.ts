// The block level dither's store actions (gslides-parity SPEC-3 10.4, 10.5, 10.10): on a scratch
// copy of the export fixture deck, `picture.materialize` names the missing variants under dryRun,
// writes the files and the records in one write, is idempotent, and prunes a variant no picture
// references any more; `slide.setBackgroundPicture` places the covering picture object with its
// dither at the back in one write, replaces it in place, refuses a slide that is not a canvas
// without a dispatcher and converts through one; `asset.add --replace-source` attaches a source.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Asset } from '@turboslide/schema/assets';
import type { PictureBlock } from '@turboslide/schema/blocks';
import type { ContentSlide, DeckDocument } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { openFileStore } from '@turboslide/store/file-store';
import type { FileStore } from '@turboslide/store/file-store';

import {
  NOT_A_CANVAS,
  assetAdd,
  backgroundPictureMutations,
  boxOfDithered,
  coveringPictureOf,
  ditheredPictures,
  pictureMaterialize,
  plateBoxOf,
  slideSetBackgroundPicture,
} from './actions.ts';
import type { AssetActionDeps, AssetWriteContext } from './actions.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const FIXTURE = join(REPO, 'decks/fixture/gslides');
const ROSETTA = join(REPO, 'decks/gt-brand/assets/ref-rosetta.jpg');

const ctx: AssetWriteContext = { author: { kind: 'agent', name: 'b5-test' } };
const photograph = { pattern: 'bayer8' as const, black: 120, white: 230, gamma: 0.9 };

let dir: string;
let store: FileStore;
let deps: AssetActionDeps;

async function document(): Promise<DeckDocument> {
  return (await store.read()).document;
}

async function revision(): Promise<number> {
  return (await document()).deck.revision;
}

/** A canvas slide with a covering dithered picture and a plate group over it, appended to the deck. */
async function addDitherSlide(
  id: string,
  dither: Record<string, unknown>,
  extra: Partial<PictureBlock> = {},
) {
  const slide: ContentSlide = {
    schemaVersion: 1,
    id,
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        {
          id: 'bg',
          type: 'picture',
          asset: 'fixture-photo',
          pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
          dither,
          ...extra,
        } as PictureBlock,
        {
          id: 'plate',
          type: 'box',
          fill: 'plate',
          text: 'A plate',
          pos: { x: 137, y: 500, w: 740, h: 271, z: 1, group: 'plate' },
        } as unknown as ContentSlide['slots']['main'] extends (infer T)[] | undefined ? T : never,
      ],
    },
  };
  const mutations: Mutation[] = [{ op: 'slide.insert', sectionId: 'canvas', slide }];
  const outcome = await store.write({
    baseRevision: await revision(),
    author: ctx.author,
    mutations,
  });
  if (!outcome.ok) throw new Error(outcome.message);
}

/**
 * The fixture deck carries the two dither slides of SPEC-3 10.10 since merge 2 (B1's
 * `background-dither` and `picture-dither-strength`); these tests build their own dithered slide
 * over a fixture with none, so the copy drops those two before the store opens (the integrator at
 * merge 2; the fixture's own rows are covered by the export and CLI suites).
 */
const FIXTURE_DITHER_SLIDES = ['background-dither', 'picture-dither-strength'];

function stripFixtureDitherSlides(copy: string): void {
  const manifestPath = join(copy, 'deck.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    sections: { slideIds: string[] }[];
    assets: Record<string, { variants?: Record<string, { twins: Record<string, string> }> }>;
  };
  for (const section of manifest.sections)
    section.slideIds = section.slideIds.filter((id) => !FIXTURE_DITHER_SLIDES.includes(id));
  // the fixture's materialized variants (files and records) go with the two slides
  for (const asset of Object.values(manifest.assets)) {
    for (const variant of Object.values(asset.variants ?? {}))
      for (const file of Object.values(variant.twins)) rmSync(join(copy, file), { force: true });
    delete asset.variants;
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const id of FIXTURE_DITHER_SLIDES)
    rmSync(join(copy, 'slides', `${id}.json`), { force: true });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ts-b5-dither-'));
  cpSync(FIXTURE, dir, { recursive: true });
  stripFixtureDitherSlides(dir);
  store = openFileStore({ dir });
  deps = { store, cwd: REPO, allowPaths: true, hosted: false };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('picture.materialize', () => {
  it('names the missing variant under dryRun, writes the files and the record once, and is idempotent', async () => {
    await addDitherSlide('bg-dither', photograph);
    const targets = ditheredPictures(await document());
    expect(targets.map((t) => `${t.slideId}#${t.block.id}`)).toEqual(['bg-dither#bg']);
    expect(targets[0]?.box).toEqual([1600, 900]);
    expect(targets[0]?.plate).toEqual([137, 500, 740, 271]);
    const dry = await pictureMaterialize(deps, ctx, {
      baseRevision: await revision(),
      dryRun: true,
    });
    expect(dry.missing).toHaveLength(1);
    expect(dry.written).toEqual([]);
    expect(dry.missing[0]?.key).toBe(targets[0]?.key);
    const before = await revision();
    const written = await pictureMaterialize(deps, ctx, { baseRevision: before, scale: 1 });
    expect(written.revision).toBe(before + 1);
    expect(written.written).toHaveLength(1);
    const files = written.written[0]?.files ?? [];
    expect(files).toHaveLength(2);
    for (const file of files) expect(existsSync(join(dir, file))).toBe(true);
    expect(files[0]).toMatch(/^assets\/fixture-photo\.dither-[0-9a-f]{12}-light\.png$/);
    const asset = (await document()).deck.assets['fixture-photo'] as Asset;
    const variant = asset.variants?.[targets[0]?.key ?? ''];
    expect(variant).toBeDefined();
    expect(variant?.size).toEqual([1600, 900]);
    expect(variant?.scale).toBe(1);
    expect(variant?.metrics?.litFraction).toBeGreaterThan(0);
    expect(variant?.metrics?.plateClear?.plate).toEqual([137, 500, 740, 271]);
    // the second run has nothing to write and moves no revision
    const again = await pictureMaterialize(deps, ctx, { baseRevision: written.revision });
    expect(again.written).toEqual([]);
    expect(again.missing).toEqual([]);
    expect(again.revision).toBe(written.revision);
    // the variant file is a 1-bit palette PNG (two colours, about 4 KB at cell 2 for the fixture geometry)
    const bytes = readFileSync(join(dir, files[0] as string));
    expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(bytes.byteLength).toBeLessThan(120_000);
  }, 60_000);

  it('prunes a variant no picture references after the dither changes, removing its files', async () => {
    await addDitherSlide('bg-dither', photograph);
    const first = await pictureMaterialize(deps, ctx, { baseRevision: await revision(), scale: 1 });
    const oldFiles = first.written[0]?.files ?? [];
    const oldKey = first.written[0]?.key ?? '';
    // the ink point moves: a new key, the old variant stale
    const outcome = await store.write({
      baseRevision: first.revision,
      author: ctx.author,
      mutations: [
        {
          op: 'block.set',
          slideId: 'bg-dither',
          blockId: 'bg',
          path: '/dither',
          value: { ...photograph, black: 60 },
        },
      ],
    });
    if (!outcome.ok) throw new Error(outcome.message);
    const second = await pictureMaterialize(deps, ctx, {
      baseRevision: outcome.revision,
      scale: 1,
      prune: true,
    });
    expect(second.written).toHaveLength(1);
    expect(second.pruned).toEqual([{ assetId: 'fixture-photo', key: oldKey }]);
    for (const file of oldFiles) expect(existsSync(join(dir, file))).toBe(false);
    const asset = (await document()).deck.assets['fixture-photo'] as Asset;
    expect(Object.keys(asset.variants ?? {})).toEqual([second.written[0]?.key]);
  }, 60_000);

  it('refuses a dither over an asset without a continuous source with the fixed sentence', async () => {
    const outcome = await store.write({
      baseRevision: await revision(),
      author: ctx.author,
      mutations: [
        {
          op: 'asset.set',
          asset: {
            ...((await document()).deck.assets['fixture-photo'] as Asset),
            treatment: {
              kind: 'two-tone',
              crop: [0, 0, 1600, 900],
              autocontrast: 0.5,
              polarity: 'dark-ground',
              cell: 2,
              bayer: 8,
              resampler: 'lanczos3',
            },
          },
        },
      ],
    });
    if (!outcome.ok) throw new Error(outcome.message);
    // the store's validator refuses the write first (B1's `dither` issue); the action guards the same sentence
    await expect(addDitherSlide('bg-dither', photograph)).rejects.toThrow(
      /no continuous source \(sourceFile\); the committed twins are already dithered/,
    );
    const doc = await document();
    const forced: DeckDocument = {
      ...doc,
      slides: {
        ...doc.slides,
        forced: {
          schemaVersion: 1,
          id: 'forced',
          kind: 'content',
          layout: { type: 'freeform' },
          slots: {
            main: [
              {
                id: 'bg',
                type: 'picture',
                asset: 'fixture-photo',
                pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
                dither: photograph,
              } as PictureBlock,
            ],
          },
        },
      },
    };
    expect(() => ditheredPictures(forced, ['forced'])).toThrow(/no continuous source/);
  });

  it('sizes a positioned picture by its box and a flow shot by the content width at the asset ratio', async () => {
    const asset = (await document()).deck.assets['fixture-photo'] as Asset;
    expect(
      boxOfDithered(
        {
          id: 'p',
          type: 'picture',
          asset: asset.id,
          pos: { x: 0, y: 0, w: 400, h: 225, z: 0 },
        } as PictureBlock,
        asset,
      ),
    ).toEqual([400, 225]);
    expect(boxOfDithered({ id: 's', type: 'shot', asset: asset.id } as never, asset)).toEqual([
      1326,
      (1326 * 900) / 1600,
    ]);
    expect(
      plateBoxOf({
        schemaVersion: 1,
        id: 'x',
        kind: 'content',
        layout: { type: 'freeform' },
        slots: { main: [] },
      }),
    ).toBeUndefined();
  });
});

describe('slide.setBackgroundPicture', () => {
  it('places the covering picture object with its dither at the back in one write, then replaces it in place', async () => {
    const before = await revision();
    const placed = await slideSetBackgroundPicture(deps, ctx, {
      baseRevision: before,
      slideIds: ['canvas-title'],
      assetId: 'fixture-photo',
      dither: photograph,
    });
    expect(placed.revision).toBe(before + 1);
    expect(placed.assetId).toBe('fixture-photo');
    expect(placed.slides).toEqual([{ slideId: 'canvas-title', blockId: 'picture' }]);
    const slide = (await document()).slides['canvas-title'] as ContentSlide;
    const block = coveringPictureOf(slide);
    expect(block?.id).toBe('picture');
    expect(block?.dither).toEqual(photograph);
    const zs = (slide.slots.main ?? []).map((b) => b.pos?.z ?? 0);
    expect(Math.min(...zs)).toBe(block?.pos?.z);
    // a second call replaces the covering picture in place: the same block id, the dither removed
    const replaced = await slideSetBackgroundPicture(deps, ctx, {
      baseRevision: placed.revision,
      slideIds: ['canvas-title'],
      assetId: 'fixture-photo',
    });
    expect(replaced.slides).toEqual([{ slideId: 'canvas-title', blockId: 'picture' }]);
    const after = coveringPictureOf((await document()).slides['canvas-title'] as ContentSlide);
    expect(after?.dither).toBeUndefined();
    expect(
      (await document()).slides['canvas-title'] &&
        canvasCount((await document()).slides['canvas-title'] as ContentSlide),
    ).toBe(canvasCount(slide));
    // replace off stacks a second object under the first
    const stacked = await slideSetBackgroundPicture(deps, ctx, {
      baseRevision: replaced.revision,
      slideIds: ['canvas-title'],
      assetId: 'fixture-photo',
      replace: false,
    });
    expect(stacked.slides[0]?.blockId).toBe('picture-2');
  });

  it('refuses a slide that is not a canvas without a dispatcher, and converts through one', async () => {
    await expect(
      slideSetBackgroundPicture(deps, ctx, {
        baseRevision: await revision(),
        slideIds: ['title'],
        assetId: 'fixture-photo',
      }),
    ).rejects.toThrow(NOT_A_CANVAS('title'));
    const calls: string[] = [];
    const converting: AssetActionDeps = {
      ...deps,
      dispatch: async (id, input) => {
        calls.push(id);
        // a stand in for slide.toCanvas: the slide becomes a canvas with one text object
        const { slideIds, baseRevision } = input as { slideIds: string[]; baseRevision: number };
        const slideId = slideIds[0] as string;
        const outcome = await store.write({
          baseRevision,
          author: ctx.author,
          mutations: [
            {
              op: 'slide.replace',
              slideId,
              slide: {
                schemaVersion: 1,
                id: slideId,
                kind: 'content',
                layout: { type: 'freeform' },
                slots: {
                  main: [
                    {
                      id: 'heading',
                      type: 'heading',
                      level: 'h1',
                      text: 'Title',
                      pos: { x: 137, y: 400, w: 900, h: 90, z: 0 },
                    } as never,
                  ],
                },
              },
            },
          ],
        });
        if (!outcome.ok) throw new Error(outcome.message);
        return { revision: outcome.revision };
      },
    };
    const placed = await slideSetBackgroundPicture(converting, ctx, {
      baseRevision: await revision(),
      slideIds: ['title'],
      assetId: 'fixture-photo',
      dither: photograph,
    });
    expect(calls).toEqual(['slide.toCanvas']);
    const slide = (await document()).slides.title as ContentSlide;
    expect(coveringPictureOf(slide)?.dither).toEqual(photograph);
    expect(placed.slides[0]?.blockId).toBe('picture');
  });

  it('plans one block.insert under the lowest z, or two block.set writes on the covering picture', () => {
    const slide: ContentSlide = {
      schemaVersion: 1,
      id: 'cv',
      kind: 'content',
      layout: { type: 'freeform' },
      slots: {
        main: [
          { id: 't', type: 'text', text: 'x', pos: { x: 0, y: 0, w: 100, h: 50, z: -3 } } as never,
        ],
      },
    };
    const inserted = backgroundPictureMutations(slide, 'fixture-photo', photograph, true);
    expect(inserted.mutations).toHaveLength(1);
    expect(inserted.mutations[0]?.op).toBe('block.insert');
    expect((inserted.mutations[0] as { block: PictureBlock }).block.pos?.z).toBe(-4);
    const covered: ContentSlide = {
      ...slide,
      slots: {
        main: [
          {
            id: 'bg',
            type: 'picture',
            asset: 'a',
            pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
          } as PictureBlock,
        ],
      },
    };
    const replaced = backgroundPictureMutations(covered, 'fixture-photo', undefined, true);
    expect(replaced.mutations.map((m) => m.op)).toEqual(['block.set', 'block.set']);
    expect(replaced.blockId).toBe('bg');
    expect('value' in (replaced.mutations[1] as object)).toBe(false);
  });
});

describe('asset.add --replace-source', () => {
  it('attaches the file as the asset’s continuous source under a digest name and changes nothing else', async () => {
    const before = (await document()).deck.assets['fixture-photo'] as Asset;
    const asset = await assetAdd(deps, ctx, {
      baseRevision: await revision(),
      file: ROSETTA,
      replaceSource: 'fixture-photo',
      role: 'other',
      alt: 'ignored',
    });
    expect(asset.id).toBe('fixture-photo');
    expect(asset.sourceFile).toMatch(/^assets\/fixture-photo\.source\.[0-9a-f]{8}\.jpg$/);
    expect(existsSync(join(dir, asset.sourceFile as string))).toBe(true);
    expect(asset.twins).toEqual(before.twins);
    expect(asset.alt).toBe(before.alt);
    // the dither key follows the source: a dithered picture over it now derives from the source file
    await addDitherSlide('bg-dither', photograph);
    const target = ditheredPictures(await document())[0];
    expect(target?.source).toBe(asset.sourceFile);
  }, 30_000);
});

function canvasCount(slide: ContentSlide): number {
  return (slide.slots.main ?? []).length;
}
