// The exporter end to end without a browser or credentials: a dry run over the fixture scenes
// writes requests.json, images.json, dry-run.json and the reports with no presentationId and
// passes; a dry run over a synthesized 85-slide deck (the gt-brand and fixture scenes cycled to
// the deck's size, every raster pointed at a real PNG) finishes under four seconds; a live run
// against a fake Slides client creates the presentation, sends every batch with the chained
// revision id, writes the notes in a second call together with the default slide's removal, and
// reports the presentationId and URL; a live run without credentials fails with the named
// environment variable and creates nothing; a live run whose local image host has a loopback
// origin (the default http://localhost:4321) is refused before the browser pass and before the
// presentation exists, naming TURBOSLIDE_ASSET_BASE_URL and TURBOSLIDE_GCS_BUCKET, while a dry
// run keeps the loopback default because nothing is sent.
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { encodePngRgba } from '@turboslide/effects/io';
import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { exportReportSchema } from '@turboslide/schema/export';

import type { Scene } from '../scene/types.ts';
import { MissingCredentialsError } from './auth.ts';
import { exportGslides } from './build.ts';
import type { PresentationData, SlidesClient } from './client.ts';
import { planBatches } from './client.ts';
import { UnreachableImageHostError, assetBaseUrlProblem, createLocalStaticHost } from './images.ts';
import { RatePacer } from './pace.ts';
import { planPresentation } from './requests.ts';
import type { SlidesRequest } from './schema.ts';

type Fixture = { deckId: string; revision: number; scenes: Scene[] };

const REPO = join(import.meta.dirname, '../../../..');

/** A public origin for the live-run tests; Google could fetch from it, so the gate lets it through. */
const PUBLIC_ORIGIN = 'https://studio.example.test';

function fixture(name: string): Fixture {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, '__fixtures__', `${name}.json`), 'utf8'),
  ) as Fixture;
}

let dir = '';
let png = '';

/** The scene's file references pointed at one real PNG so the host finds them. */
function withFiles(scene: Scene, file: string): Scene {
  const copy = JSON.parse(JSON.stringify(scene)) as Scene;
  for (const raster of copy.rasters) if (raster.file) raster.file = file;
  if (copy.sheetImage) copy.sheetImage = file;
  if (copy.pictureFile) copy.pictureFile = file;
  return copy;
}

function documentFor(scenes: Scene[], id: string, revision: number): DeckDocument {
  const deck: Deck = {
    schemaVersion: 1,
    id,
    title: `Deck ${id}`,
    theme: 'gt-ink-paper',
    sections: [{ id: 'all', name: 'All', slideIds: scenes.map((s) => s.slideId) }],
    assets: {},
    revision,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    defaults: { notes: 'Default notes for the run.' },
  };
  const slides: Record<string, Slide> = {};
  return { deck, slides };
}

/** 85 scenes from the five real ones, with unique slide ids and the deck numbering. */
function synthesizeDeck(mode: 'native' | 'flatten'): Scene[] {
  const pool = [
    ...fixture(`gt-brand-${mode}-light`).scenes,
    ...fixture(`fixture-${mode}-light`).scenes,
  ];
  const out: Scene[] = [];
  for (let n = 1; n <= 85; n += 1) {
    const base = withFiles(pool[(n - 1) % pool.length] as Scene, png);
    out.push({
      ...base,
      slideId: `${base.slideId}-${n}`,
      n,
      total: 85,
      notes: n % 2 ? `Notes ${n}` : undefined,
    });
  }
  return out;
}

class FakeSlides implements SlidesClient {
  created: string[] = [];
  batches: { presentationId: string; requests: SlidesRequest[]; revision?: string }[] = [];
  gets: string[] = [];
  private revision = 0;

  async create(title: string): Promise<PresentationData> {
    this.created.push(title);
    this.revision += 1;
    return {
      presentationId: `p${this.created.length}`,
      revisionId: `r${this.revision}`,
      pageSize: {
        width: { magnitude: 9_144_000, unit: 'EMU' },
        height: { magnitude: 5_143_500, unit: 'EMU' },
      },
      slides: [{ objectId: 'default_slide_1' }],
    };
  }

  async get(presentationId: string, fields?: string): Promise<PresentationData> {
    this.gets.push(fields ?? '');
    const pages = this.batches
      .filter((b) => b.presentationId === presentationId)
      .flatMap((b) => b.requests)
      .flatMap((r) => ('createSlide' in r ? [r.createSlide.objectId] : []));
    return {
      presentationId,
      revisionId: `r${this.revision}`,
      slides: [
        ...pages.map((objectId) => ({
          objectId,
          slideProperties: {
            notesPage: { notesProperties: { speakerNotesObjectId: `${objectId}:notes` } },
          },
        })),
        { objectId: 'default_slide_1' },
      ],
    };
  }

  async batchUpdate(
    presentationId: string,
    requests: readonly SlidesRequest[],
    writeControl?: { requiredRevisionId: string },
  ) {
    if (writeControl && writeControl.requiredRevisionId !== `r${this.revision}`)
      throw Object.assign(new Error('stale revision'), { status: 400 });
    this.batches.push({
      presentationId,
      requests: [...requests],
      revision: writeControl?.requiredRevisionId,
    });
    this.revision += 1;
    return { presentationId, writeControl: { requiredRevisionId: `r${this.revision}` } };
  }

  async getThumbnail(): Promise<{ contentUrl: string; width: number; height: number }> {
    return { contentUrl: 'https://example.invalid/thumb.png', width: 1600, height: 900 };
  }

  async fetchBytes(): Promise<Uint8Array> {
    return new Uint8Array();
  }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'turboslide-gslides-build-'));
  png = join(dir, 'raster.png');
  await writeFile(
    png,
    await encodePngRgba({ width: 4, height: 4, data: new Uint8Array(64).fill(128) }),
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('dry run', () => {
  test('writes requests.json, images.json, dry-run.json and reports with no presentationId, and passes', async () => {
    const scenes = fixture('gt-brand-native-light').scenes.map((s) => withFiles(s, png));
    const out = join(dir, 'dry-native');
    const result = await exportGslides({
      deckDir: join(REPO, 'decks/gt-brand'),
      document: documentFor(scenes, 'gt-brand', 13),
      outDir: out,
      mode: 'native',
      themes: ['light'],
      dryRun: true,
      scenes,
      wordmark: { light: png },
      renderer: 'fixture',
      imageHost: createLocalStaticHost({ dir: join(out, 'assets'), stage: false }),
    });
    expect(result.dryRun).toBe(true);
    expect(result.merged.passed).toBe(true);
    expect(result.merged.format).toBe('gslides');
    expect(result.merged.presentationId).toBeUndefined();
    expect(result.merged.geometryInBounds).toBe(true);
    expect(result.merged.slides.map((s) => s.slideId)).toEqual([
      'opener-brand',
      'audience',
      'site',
    ]);
    expect(result.merged.residual.some((l) => l.startsWith('fidelity: no letter spacing'))).toBe(
      true,
    );
    expect(result.merged.residual.some((l) => l.includes('page size is fixed'))).toBe(true);
    for (const path of [
      result.requestsPath,
      result.imagesPath,
      result.dryRunPath ?? '',
      result.reportPath,
      join(out, 'export-report-light.json'),
    ])
      expect(existsSync(path)).toBe(true);
    const requests = JSON.parse(readFileSync(result.requestsPath, 'utf8')) as {
      dryRun: boolean;
      presentations: {
        theme: string;
        presentationId: null;
        batches: { requests: unknown[] }[];
        notes: { placeholders: boolean; requests: { insertText: { objectId: string } }[] };
        validation: unknown[];
      }[];
    };
    expect(requests.dryRun).toBe(true);
    expect(requests.presentations).toHaveLength(1);
    const p = requests.presentations[0];
    expect(p?.presentationId).toBeNull();
    expect(p?.validation).toEqual([]);
    expect(p?.batches.length).toBeGreaterThanOrEqual(1);
    expect(p?.notes.placeholders).toBe(true);
    // the deck default applies to every slide without notes
    expect(p?.notes.requests).toHaveLength(3);
    expect(p?.notes.requests[0]?.insertText.objectId).toBe('notes:ts_opener-brand');
    const dryRun = JSON.parse(readFileSync(result.dryRunPath ?? '', 'utf8')) as {
      presentationId: null;
      passed: boolean;
    };
    expect(dryRun.presentationId).toBeNull();
    expect(dryRun.passed).toBe(true);
    const images = JSON.parse(readFileSync(result.imagesPath, 'utf8')) as {
      theme: string;
      images: unknown[];
      staged: boolean;
    }[];
    expect(images[0]?.staged).toBe(false);
    expect(images[0]?.images).toHaveLength(1);
    expect(existsSync(join(out, 'assets'))).toBe(false);
    const report = exportReportSchema.parse(JSON.parse(readFileSync(result.reportPath, 'utf8')));
    expect(report.files.map((f) => f.path)).toEqual([result.requestsPath, result.imagesPath]);
  });

  test('a missing raster file is a warning and fails the report', async () => {
    const scenes = fixture('fixture-native-light').scenes;
    const out = join(dir, 'dry-missing');
    const result = await exportGslides({
      deckDir: join(REPO, 'decks/fixture'),
      document: documentFor(scenes, 'fixture', 1),
      outDir: out,
      mode: 'native',
      themes: ['light'],
      dryRun: true,
      scenes,
      imageHost: createLocalStaticHost({ dir: join(out, 'assets'), stage: false }),
    });
    expect(result.merged.passed).toBe(false);
    expect(result.merged.residual.filter((l) => l.startsWith('warning:')).length).toBeGreaterThan(
      0,
    );
  });

  test('a whole 85-slide deck plans, validates and writes in under four seconds', async () => {
    const scenes = synthesizeDeck('native');
    const out = join(dir, 'dry-deck');
    const started = performance.now();
    const result = await exportGslides({
      deckDir: join(REPO, 'decks/gt-brand'),
      document: documentFor(scenes, 'gt-brand', 13),
      outDir: out,
      mode: 'native',
      themes: ['light'],
      dryRun: true,
      scenes,
      wordmark: { light: png },
      imageHost: createLocalStaticHost({ dir: join(out, 'assets'), stage: false }),
    });
    const ms = performance.now() - started;
    expect(result.merged.passed).toBe(true);
    expect(result.merged.slides).toHaveLength(85);
    const theme = result.themes[0];
    expect(theme?.plan.requests.length).toBeGreaterThan(85 * 20);
    expect(theme?.batches.length).toBeGreaterThanOrEqual(1);
    expect(theme?.notes.requests).toBe(85);
    expect(ms).toBeLessThan(4000);
  });

  test('flatten mode: the sheet raster per slide and the text layer in the paper color', async () => {
    const scenes = fixture('gt-brand-flatten-light').scenes.map((s) => withFiles(s, png));
    const out = join(dir, 'dry-flatten');
    const result = await exportGslides({
      deckDir: join(REPO, 'decks/gt-brand'),
      document: documentFor(scenes, 'gt-brand', 13),
      outDir: out,
      mode: 'flatten',
      themes: ['light'],
      dryRun: true,
      scenes,
      imageHost: createLocalStaticHost({ dir: join(out, 'assets'), stage: false }),
    });
    expect(result.merged.passed).toBe(true);
    const theme = result.themes[0];
    expect(theme?.plan.slides.every((s) => s.counts.images === 1 && s.counts.lines === 0)).toBe(
      true,
    );
    expect(result.merged.residual.some((l) => l.startsWith('flatten:'))).toBe(true);
  });
});

describe('batches', () => {
  test('slides never split and the caps pack as few batches as they allow', () => {
    const scenes = synthesizeDeck('native');
    const plan = planPresentation(scenes, {
      mode: 'native',
      theme: 'light',
      resolveUrl: () => 'https://example.invalid/x.png',
    });
    const one = planBatches(plan, { maxBytes: 100_000_000, maxRequests: 1_000_000 });
    expect(one.batches).toHaveLength(1);
    expect(one.batches[0]?.requests).toHaveLength(plan.requests.length);
    const capped = planBatches(plan, { maxBytes: 100_000_000, maxRequests: 500 });
    expect(capped.batches.length).toBeGreaterThan(1);
    for (const batch of capped.batches) {
      expect(batch.requests.length).toBeLessThanOrEqual(500);
      // every slide's createSlide and its last request sit in the same batch
      for (const id of batch.slideIds) {
        const slide = plan.slides.find((s) => s.slideId === id);
        expect(batch.requests).toContain(slide?.requests[0]);
        expect(batch.requests).toContain(slide?.requests[slide.requests.length - 1]);
      }
    }
    expect(capped.batches.flatMap((b) => b.slideIds)).toEqual(plan.slides.map((s) => s.slideId));
    const tiny = planBatches(plan, { maxBytes: 10, maxRequests: 1 });
    expect(tiny.oversized).toHaveLength(85);
    expect(tiny.batches).toHaveLength(85);
  });
});

describe('live run', () => {
  test('creates the presentation, chains the revision id, writes notes second, removes the default slide, reports the id and URL', async () => {
    const scenes = fixture('gt-brand-native-light').scenes.map((s) => withFiles(s, png));
    const out = join(dir, 'live');
    const client = new FakeSlides();
    const pacer = new RatePacer({ now: () => 0, sleep: async () => {} });
    const result = await exportGslides({
      deckDir: join(REPO, 'decks/gt-brand'),
      document: documentFor(scenes, 'gt-brand', 13),
      outDir: out,
      mode: 'native',
      themes: ['light'],
      scenes,
      wordmark: { light: png },
      client,
      pacer,
      batch: { maxRequests: 200 },
      imageHost: createLocalStaticHost({
        dir: join(out, 'assets'),
        baseUrl: PUBLIC_ORIGIN,
        stage: true,
      }),
      title: 'GT brand (test)',
    });
    expect(result.dryRun).toBe(false);
    expect(client.created).toEqual(['GT brand (test)']);
    expect(result.merged.presentationId).toBe('p1');
    expect(result.merged.url).toBe('https://docs.google.com/presentation/d/p1/edit');
    expect(result.merged.passed).toBe(true);
    const theme = result.themes[0];
    expect(theme?.live?.batchesSent).toBe(theme?.batches.length);
    expect(theme?.batches.length).toBeGreaterThan(1);
    // every batch carried the revision the previous call returned
    expect(client.batches.map((b) => b.revision)).toEqual(
      client.batches.map((_, i) => `r${i + 1}`),
    );
    const last = client.batches[client.batches.length - 1];
    const notes =
      last?.requests.filter((r) => 'insertText' in r && r.insertText.objectId.endsWith(':notes')) ??
      [];
    expect(notes).toHaveLength(3);
    expect(
      last?.requests.some(
        (r) => 'deleteObject' in r && r.deleteObject.objectId === 'default_slide_1',
      ),
    ).toBe(true);
    expect(client.gets[0]).toMatch(/speakerNotesObjectId/);
    expect(theme?.live?.pageSizeOk).toBe(true);
    expect(theme?.manifest.staged).toBe(true);
    expect(
      theme?.manifest.images.every((i) => i.url.startsWith(`${PUBLIC_ORIGIN}/api/assets/`)),
    ).toBe(true);
    expect(existsSync(join(out, 'assets'))).toBe(true);
    expect(pacer.stats.calls.write).toBe(client.batches.length + 1);
    expect(pacer.stats.calls.read).toBe(1);
  });

  test('a live run without credentials names TURBOSLIDE_GOOGLE_CREDENTIALS and creates nothing', async () => {
    const scenes = fixture('fixture-native-light').scenes.map((s) => withFiles(s, png));
    const out = join(dir, 'live-nocreds');
    await expect(
      exportGslides({
        deckDir: join(REPO, 'decks/fixture'),
        document: documentFor(scenes, 'fixture', 1),
        outDir: out,
        mode: 'native',
        themes: ['light'],
        scenes,
        wordmark: { light: png },
        env: { XDG_CONFIG_HOME: join(dir, 'xdg') },
        imageHost: createLocalStaticHost({
          dir: join(out, 'assets'),
          baseUrl: PUBLIC_ORIGIN,
          stage: true,
        }),
      }),
    ).rejects.toThrow(MissingCredentialsError);
    expect(existsSync(join(out, 'requests.json'))).toBe(false);
  });
});

describe('image host reachability', () => {
  test('assetBaseUrlProblem names loopback, unspecified and non-http origins and passes public ones', () => {
    const refused = [
      'http://localhost:4321',
      'http://LOCALHOST:4321/',
      'http://app.localhost:3000',
      'http://127.0.0.1:4321',
      'http://127.1:4321',
      'http://127.255.0.9',
      'http://[::1]:4321',
      'http://0.0.0.0:4321',
      'http://[::]:4321',
      'ftp://assets.example.test',
      'file:///tmp/assets',
      'localhost:4321',
      'not a url',
    ];
    for (const url of refused) expect(assetBaseUrlProblem(url), url).toBeDefined();
    expect(assetBaseUrlProblem('http://localhost:4321')).toMatch(/loopback host localhost/);
    expect(assetBaseUrlProblem('http://0.0.0.0:4321')).toMatch(/unspecified address 0\.0\.0\.0/);
    expect(assetBaseUrlProblem('ftp://assets.example.test')).toMatch(/uses ftp, not http or https/);
    expect(assetBaseUrlProblem('not a url')).toBe('is not an absolute URL');
    const allowed = [
      PUBLIC_ORIGIN,
      'https://abc-def.trycloudflare.com',
      'http://studio.example.test:4321',
      'https://storage.googleapis.com/bucket',
      'http://10.0.0.5:4321',
    ];
    for (const url of allowed) expect(assetBaseUrlProblem(url), url).toBeUndefined();
  });

  test('a live run with the default loopback origin is refused before the browser pass and creates nothing', async () => {
    const out = join(dir, 'live-loopback');
    const client = new FakeSlides();
    // no scenes: a run that passed the gate would try to launch Chromium over a deck that is not
    // there; the refusal comes first, so the rejection is the gate's
    const run = exportGslides({
      deckDir: join(dir, 'no-such-deck'),
      document: documentFor([], 'gt-brand', 13),
      outDir: out,
      mode: 'native',
      themes: ['light'],
      client,
      env: { XDG_CONFIG_HOME: join(dir, 'xdg') },
    });
    await expect(run).rejects.toThrow(UnreachableImageHostError);
    await expect(run).rejects.toThrow(/http:\/\/localhost:4321 has the loopback host localhost/);
    await expect(run).rejects.toThrow(/TURBOSLIDE_ASSET_BASE_URL/);
    await expect(run).rejects.toThrow(/TURBOSLIDE_GCS_BUCKET/);
    await expect(run).rejects.toThrow(/docs\/google-slides\.md/);
    expect(client.created).toEqual([]);
    expect(client.batches).toEqual([]);
    expect(existsSync(join(out, 'requests.json'))).toBe(false);
    expect(existsSync(join(out, 'work'))).toBe(false);
  });

  test('TURBOSLIDE_ASSET_BASE_URL and assetBaseUrl on a loopback address are refused the same way', async () => {
    const scenes = fixture('fixture-native-light').scenes.map((s) => withFiles(s, png));
    const out = join(dir, 'live-loopback-env');
    const client = new FakeSlides();
    await expect(
      exportGslides({
        deckDir: join(REPO, 'decks/fixture'),
        document: documentFor(scenes, 'fixture', 1),
        outDir: out,
        mode: 'native',
        themes: ['light'],
        scenes,
        wordmark: { light: png },
        client,
        env: {
          XDG_CONFIG_HOME: join(dir, 'xdg'),
          TURBOSLIDE_ASSET_BASE_URL: 'http://127.0.0.1:4321',
        },
      }),
    ).rejects.toThrow(UnreachableImageHostError);
    await expect(
      exportGslides({
        deckDir: join(REPO, 'decks/fixture'),
        document: documentFor(scenes, 'fixture', 1),
        outDir: out,
        mode: 'native',
        themes: ['light'],
        scenes,
        wordmark: { light: png },
        client,
        env: { XDG_CONFIG_HOME: join(dir, 'xdg') },
        assetBaseUrl: 'http://[::1]:4321',
      }),
    ).rejects.toThrow(/loopback host \[::1\]/);
    expect(client.created).toEqual([]);
    expect(existsSync(join(out, 'requests.json'))).toBe(false);
  });

  test('an injected local host with a loopback origin is refused for a live run', async () => {
    const scenes = fixture('fixture-native-light').scenes.map((s) => withFiles(s, png));
    const out = join(dir, 'live-loopback-injected');
    const client = new FakeSlides();
    await expect(
      exportGslides({
        deckDir: join(REPO, 'decks/fixture'),
        document: documentFor(scenes, 'fixture', 1),
        outDir: out,
        mode: 'native',
        themes: ['light'],
        scenes,
        wordmark: { light: png },
        client,
        imageHost: createLocalStaticHost({ dir: join(out, 'assets'), stage: true }),
      }),
    ).rejects.toThrow(UnreachableImageHostError);
    expect(client.created).toEqual([]);
    expect(existsSync(join(out, 'assets'))).toBe(false);
  });

  test('a dry run keeps the loopback default and plans localhost URLs without staging', async () => {
    const scenes = fixture('fixture-native-light').scenes.map((s) => withFiles(s, png));
    const out = join(dir, 'dry-loopback');
    const result = await exportGslides({
      deckDir: join(REPO, 'decks/fixture'),
      document: documentFor(scenes, 'fixture', 1),
      outDir: out,
      mode: 'native',
      themes: ['light'],
      dryRun: true,
      scenes,
      wordmark: { light: png },
      env: { XDG_CONFIG_HOME: join(dir, 'xdg') },
    });
    expect(result.merged.passed).toBe(true);
    const theme = result.themes[0];
    expect(theme?.manifest.kind).toBe('local');
    expect(theme?.manifest.staged).toBe(false);
    expect(theme?.manifest.images.length).toBeGreaterThan(0);
    expect(
      theme?.manifest.images.every((i) => i.url.startsWith('http://localhost:4321/api/assets/')),
    ).toBe(true);
  });

  test('a public TURBOSLIDE_ASSET_BASE_URL resolves into the planned URLs', async () => {
    const scenes = fixture('fixture-native-light').scenes.map((s) => withFiles(s, png));
    const out = join(dir, 'dry-public');
    const result = await exportGslides({
      deckDir: join(REPO, 'decks/fixture'),
      document: documentFor(scenes, 'fixture', 1),
      outDir: out,
      mode: 'native',
      themes: ['light'],
      dryRun: true,
      scenes,
      wordmark: { light: png },
      env: { XDG_CONFIG_HOME: join(dir, 'xdg'), TURBOSLIDE_ASSET_BASE_URL: `${PUBLIC_ORIGIN}/` },
    });
    expect(result.merged.passed).toBe(true);
    const theme = result.themes[0];
    expect(
      theme?.manifest.images.every((i) => i.url.startsWith(`${PUBLIC_ORIGIN}/api/assets/`)),
    ).toBe(true);
    expect(theme?.manifest.host).toMatch(
      new RegExp(`^local static host: ${PUBLIC_ORIGIN}/api/assets/`),
    );
  });
});
