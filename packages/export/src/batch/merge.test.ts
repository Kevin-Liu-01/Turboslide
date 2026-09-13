// The batched export's parts and merge (gslides-parity SPEC-2 8.1, 11.5 `batch/merge.test.ts`):
// a scene relocated to part names and back, the idempotent batch rewrite (the same parts under
// the same names twice), the merge over parts streamed from a stand in store to disk building
// through an injected builder in play order per theme with the report lines and the zip, a
// missing scene refused, and the memory sample. The real builder runs once over two tiny
// scenes so the file and the report are the export's own.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Scene } from '../scene/types.ts';
import { loadFontsCatalog } from '../pptx/fonts-map.ts';
import type { BuildResult, buildPptx } from '../pptx/build.ts';
import {
  localizeScene,
  mergeParts,
  readSceneParts,
  relocateScene,
  scenePartName,
  wordmarkPartName,
} from './merge.ts';
import type { BatchRecord } from './merge.ts';
import { planBatches } from './plan.ts';
import type { ExportPlan } from './plan.ts';

/** A small opaque white PNG (the sheet shot and the raster stand in), made once through sharp. */
let PNG: Buffer;
beforeAll(async () => {
  PNG = await sharp({ create: { width: 32, height: 18, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer();
});

function scene(slideId: string, n: number, theme: 'light' | 'dark', work: string): Scene {
  const sheet = join(work, 'sheets', theme, `${String(n).padStart(2, '0')}-${slideId}@2x.png`);
  const raster = join(
    work,
    'rasters',
    theme,
    `${String(n).padStart(2, '0')}-${slideId}-icon@2x.png`,
  );
  mkdirSync(join(work, 'sheets', theme), { recursive: true });
  mkdirSync(join(work, 'rasters', theme), { recursive: true });
  writeFileSync(sheet, PNG);
  writeFileSync(raster, PNG);
  return {
    slideId,
    n,
    total: 3,
    theme,
    kind: 'content',
    title: `Slide ${n}`,
    sheet: [0, 0, 1600, 900],
    paper: theme === 'dark' ? 'rgb(7, 7, 7)' : 'rgb(255, 255, 255)',
    ink: theme === 'dark' ? 'rgb(242, 242, 240)' : 'rgb(7, 7, 7)',
    frame: { rules: [], crosses: [], crossColor: 'rgb(0, 0, 0)' },
    plates: [],
    chips: [],
    texts: [],
    rules: [],
    rects: [],
    rasters: [
      {
        id: 'icon',
        blockId: 'icon',
        kind: 'icon',
        selector: '[data-block="icon"]',
        box: [100, 100, 40, 40],
        alpha: true,
        file: raster,
        scale: 2,
      },
    ],
    blocks: [{ blockId: 'icon', type: 'icon', box: [100, 100, 40, 40], native: false }],
    fonts: [],
    sheetImage: sheet,
    warnings: [],
  };
}

function planOf(ids: string[], themes: ('light' | 'dark')[]): ExportPlan {
  return {
    version: 1,
    jobId: 'b1-00000000',
    deckId: 'fixture',
    deckTitle: 'The fixture',
    revision: 7,
    startedAt: '2026-09-12T00:00:00.000Z',
    input: { format: 'pptx', mode: 'flatten', theme: themes },
    mode: 'flatten',
    themes,
    play: ids,
    ids,
    omitted: [],
    batches: planBatches(ids, 2),
    assets: [],
  };
}

/** The part store a batch uploads to and the merge streams from: a Map, as the fake Blob is. */
class PartStore {
  readonly blobs = new Map<string, Uint8Array>();
  readonly puts: string[] = [];
  put(name: string, bytes: Uint8Array): void {
    this.puts.push(name);
    this.blobs.set(name, new Uint8Array(bytes));
  }
  /** streams every part to a folder one file at a time, as mergeExport does */
  stream(dir: string): { scenes: string[]; records: BatchRecord[] } {
    const scenes: string[] = [];
    const records: BatchRecord[] = [];
    for (const [name, bytes] of this.blobs) {
      const file = join(dir, ...name.split('/'));
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, bytes);
      if (name.endsWith('.scene.json')) scenes.push(file);
      if (/^batch-\d+\.json$/.test(name))
        records.push(JSON.parse(new TextDecoder().decode(bytes)) as BatchRecord);
    }
    return { scenes, records };
  }
}

/** What exportBatch does with one extracted batch: relocate, upload the files, upload the scenes. */
function uploadBatch(store: PartStore, index: number, scenes: Scene[], wordmark?: string): void {
  const uploaded = new Set<string>();
  for (const s of scenes) {
    const { scene: part, uploads } = relocateScene(s);
    for (const upload of uploads) {
      if (uploaded.has(upload.to)) continue;
      uploaded.add(upload.to);
      store.put(upload.to, new Uint8Array(readFileSync(upload.from)));
    }
    store.put(scenePartName(part), new TextEncoder().encode(JSON.stringify(part)));
  }
  if (wordmark !== undefined)
    store.put(wordmarkPartName('light'), new Uint8Array(readFileSync(wordmark)));
  const record: BatchRecord = {
    index,
    slides: [...new Set(scenes.map((s) => s.slideId))],
    ms: 1000 + index,
    renderer: 'test renderer',
    warnings: [],
    wordmark: wordmark === undefined ? [] : ['light'],
  };
  store.put(
    `batch-${String(index).padStart(3, '0')}.json`,
    new TextEncoder().encode(JSON.stringify(record)),
  );
}

describe('parts', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-merge-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('relocates a scene’s files to part names under the theme and localizes them back', () => {
    const work = join(root, 'work');
    const s = scene('a', 1, 'light', work);
    s.pictureFile = join(work, 'pictures', 'light', 'photo@2x.png');
    const { scene: part, uploads } = relocateScene(s);
    expect(part.sheetImage).toBe('sheets/light/01-a@2x.png');
    expect(part.pictureFile).toBe('pictures/light/photo@2x.png');
    expect(part.rasters[0]?.file).toBe('rasters/light/01-a-icon@2x.png');
    expect(uploads.map((u) => u.to).sort()).toEqual([
      'pictures/light/photo@2x.png',
      'rasters/light/01-a-icon@2x.png',
      'sheets/light/01-a@2x.png',
    ]);
    expect(uploads.find((u) => u.to === 'sheets/light/01-a@2x.png')?.from).toBe(s.sheetImage);
    const local = localizeScene(part, join(root, 'parts'));
    expect(local.sheetImage).toBe(join(root, 'parts', 'sheets', 'light', '01-a@2x.png'));
    expect(local.rasters[0]?.file).toBe(
      join(root, 'parts', 'rasters', 'light', '01-a-icon@2x.png'),
    );
    // the geometry and the texts travel untouched
    expect(local.rasters[0]?.box).toEqual([100, 100, 40, 40]);
    expect(scenePartName(part)).toBe('01-a.light.scene.json');
    // a scene without a sheet keeps none
    const native = relocateScene({ ...s, sheetImage: undefined }).scene;
    expect('sheetImage' in native).toBe(false);
  });

  it('a rerun of a batch rewrites the same names with the same bytes (idempotent)', () => {
    const work = join(root, 'work');
    const scenes = [scene('a', 1, 'light', work), scene('b', 2, 'light', work)];
    const store = new PartStore();
    uploadBatch(store, 0, scenes);
    const first = new Map([...store.blobs].map(([k, v]) => [k, Buffer.from(v).toString('base64')]));
    uploadBatch(store, 0, scenes);
    expect(store.blobs.size).toBe(first.size);
    for (const [name, bytes] of store.blobs)
      expect(Buffer.from(bytes).toString('base64')).toBe(first.get(name));
    expect(store.puts.filter((p) => p === '01-a.light.scene.json')).toHaveLength(2);
    expect([...store.blobs.keys()].sort()).toEqual([
      '01-a.light.scene.json',
      '02-b.light.scene.json',
      'batch-000.json',
      'rasters/light/01-a-icon@2x.png',
      'rasters/light/02-b-icon@2x.png',
      'sheets/light/01-a@2x.png',
      'sheets/light/02-b@2x.png',
    ]);
  });
});

describe('mergeParts', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-merge-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('builds per theme from the streamed parts in play order with an injected builder, and reports the batches', async () => {
    const work = join(root, 'work');
    const ids = ['a', 'b', 'c'];
    const plan = planOf(ids, ['light', 'dark']);
    const store = new PartStore();
    // two batches, the second uploaded first: the order on disk is not the play order
    uploadBatch(store, 1, [scene('c', 3, 'light', work), scene('c', 3, 'dark', work)]);
    uploadBatch(store, 0, [
      scene('a', 1, 'light', work),
      scene('b', 2, 'light', work),
      scene('a', 1, 'dark', work),
      scene('b', 2, 'dark', work),
    ]);
    const partsDir = join(root, 'parts');
    const { scenes, records } = store.stream(partsDir);
    expect(scenes).toHaveLength(6);
    expect(records.map((r) => r.index).sort()).toEqual([0, 1]);
    const byTheme = await readSceneParts({ partsDir, scenes, records });
    expect(byTheme.get('light')?.map((s) => s.slideId)).toEqual(['a', 'b', 'c']);
    expect(byTheme.get('dark')?.map((s) => s.slideId)).toEqual(['a', 'b', 'c']);
    // every localized path exists on disk
    for (const list of byTheme.values())
      for (const s of list) {
        expect(existsSync(s.sheetImage!)).toBe(true);
        expect(existsSync(s.rasters[0]!.file!)).toBe(true);
      }
    const calls: { theme: string; ids: string[]; revision: number; title: string }[] = [];
    const build: typeof buildPptx = async (sceneList, options) => {
      calls.push({
        theme: options.theme,
        ids: sceneList.map((s) => s.slideId),
        revision: options.revision,
        title: options.deckTitle,
      });
      return fakeBuilt(sceneList);
    };
    const outDir = join(root, 'out');
    const result = await mergeParts({ partsDir, scenes, records }, plan, {
      outDir,
      build,
      fontsCatalog: loadFontsCatalog(),
      sampleMs: 5,
    });
    expect(calls).toEqual([
      { theme: 'light', ids: ['a', 'b', 'c'], revision: 7, title: 'The fixture' },
      { theme: 'dark', ids: ['a', 'b', 'c'], revision: 7, title: 'The fixture' },
    ]);
    expect(result.files.map((f) => basename(f))).toEqual([
      'fixture-light.pptx',
      'fixture-dark.pptx',
    ]);
    expect(result.zipPath && basename(result.zipPath)).toBe('fixture-both.zip');
    expect(existsSync(result.zipPath!)).toBe(true);
    expect(result.reports.map((r) => r.theme)).toEqual(['light', 'dark']);
    expect(result.merged.files.map((f) => basename(f.path))).toEqual([
      'fixture-light.pptx',
      'fixture-dark.pptx',
      'fixture-both.zip',
    ]);
    expect(result.merged.slides).toHaveLength(6);
    expect(result.merged.revision).toBe(7);
    expect(result.merged.residual.some((line) => line.startsWith('renderer: test renderer'))).toBe(
      true,
    );
    expect(
      result.merged.residual.some((line) =>
        /^batched: 2 batch\(es\) of at most 2 slides/.test(line),
      ),
    ).toBe(true);
    expect(result.renderer).toBe('test renderer');
    expect(result.peakMb).toBeGreaterThan(0);
    expect(existsSync(join(outDir, 'export-report.json'))).toBe(true);
    expect(existsSync(join(outDir, 'export-report-dark.json'))).toBe(true);
    // the per slide entries name the sheet shot and the theme
    const first = result.merged.slides[0]!;
    expect(first.theme).toBe('light');
    expect(first.sheet).toMatch(/01-a@2x\.png$/);
  });

  it('refuses a plan whose slide has no scene part (a batch did not finish)', async () => {
    const work = join(root, 'work');
    const plan = planOf(['a', 'b', 'c'], ['light']);
    const store = new PartStore();
    uploadBatch(store, 0, [scene('a', 1, 'light', work), scene('b', 2, 'light', work)]);
    const partsDir = join(root, 'parts');
    const { scenes, records } = store.stream(partsDir);
    await expect(
      mergeParts({ partsDir, scenes, records }, plan, {
        outDir: join(root, 'out'),
        build: async (list) => fakeBuilt(list),
      }),
    ).rejects.toThrow(/no light scene for 1 slide\(s\) of the plan \(c\)/);
  });

  it('the real builder produces a valid flatten file from two stored scenes', async () => {
    const work = join(root, 'work');
    const plan = planOf(['a', 'b'], ['light']);
    const store = new PartStore();
    uploadBatch(store, 0, [scene('a', 1, 'light', work), scene('b', 2, 'light', work)]);
    const partsDir = join(root, 'parts');
    const { scenes, records } = store.stream(partsDir);
    const result = await mergeParts({ partsDir, scenes, records }, plan, {
      outDir: join(root, 'out'),
      zip: false,
    });
    expect(result.files).toHaveLength(1);
    const bytes = readFileSync(result.files[0]!);
    // a zip: the PPTX package's local header signature
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(result.merged.slides.map((s) => s.slideId)).toEqual(['a', 'b']);
    expect(
      result.merged.residual.some((line) =>
        /^package: \d+ parts, \d+ relationships, valid/.test(line),
      ),
    ).toBe(true);
    expect(result.merged.mode).toBe('flatten');
  }, 60_000);
});

/** A stand in for buildPptx's result: the shape without the OOXML work. */
function fakeBuilt(scenes: Scene[]): BuildResult {
  return {
    bytes: new TextEncoder().encode(`pptx:${scenes.map((s) => s.slideId).join(',')}`),
    families: ['Inter'],
    embedded: [],
    slides: scenes.map((s) => ({
      slideId: s.slideId,
      title: s.title ?? s.slideId,
      native: [],
      raster: ['icon'],
    })),
    geometry: [],
    geometryInBounds: true,
    groups: 0,
    perfect: true,
    validation: {
      parts: 10,
      relationships: 12,
      valid: true,
    } as unknown as BuildResult['validation'],
    contentTypes: { removed: 0 } as unknown as BuildResult['contentTypes'],
    stripped: { kern: 0, extLst: 0, custGeom: 0 },
    tables: [],
    links: { written: 0, unresolved: [] },
    residual: [],
    warnings: [],
  };
}
