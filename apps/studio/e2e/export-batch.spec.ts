import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

// The batched Perfect export (gslides-parity SPEC-2 8.1; MILESTONES-2 B6 item 6): the http form of
// export.run's `batch` and `merge` on `POST /api/export/:deckId`, driven the way the Download
// dialog's `runBatchedExport` drives the server functions. Against a dev server started with
// `TURBOSLIDE_STORE=tmp TURBOSLIDE_EXPORT_BATCH=3` on the builder's port, over a scratch copy of
// decks/fixture/gslides (11.2's total; the play list is read from the fixture, SPEC-2 0.42, so the
// counts follow it: 29 slides with one skipped make 28 pages and 10 batches of 3 since the two
// dither slides of round three joined the fixture): the plan answers the batches, every batch
// renders into the job, a repeat of a batch answers the same shape (idempotent), the merge
// answers the JSON variant's body with `perfect: true` and the merge's peak memory, `turboslide
// export check` accepts the file, a replaced twin makes a batch answer `stale: 'asset'`, and
// cancel removes the job. A cancel carries the cancel token the plan minted (`?ct=`, SPEC-3 8.13):
// the job id alone is refused with 403. The deck is seeded into the server's decks folder
// (TURBOSLIDE_E2E_DECKS_DIR, the tmp overlay's, SPEC-2 0.43) and removed afterwards.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const DECKS = process.env['TURBOSLIDE_E2E_DECKS_DIR'] ?? join(ROOT, 'decks');
const DECK = 'e2e-batch';
const DECK_DIR = join(DECKS, DECK);
const OUT = join(ROOT, '.turboslide', 'e2e-batch');
const FIXTURE = join(ROOT, 'decks', 'fixture', 'gslides');
/** The batch size the server was started with (TURBOSLIDE_EXPORT_BATCH=3 in the acceptance line). */
const BATCH = Number(process.env['TURBOSLIDE_EXPORT_BATCH'] ?? 3);
/** The fixture's unskipped slides in order: the pages of the export (SPEC-2 0.42, 11.2). */
const PLAY = playOf(FIXTURE).length;
const BATCHES = Math.ceil(PLAY / BATCH);

function playOf(dir: string): string[] {
  const manifest = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as {
    sections: { slideIds: string[] }[];
  };
  return manifest.sections
    .flatMap((section) => section.slideIds)
    .filter((id) => {
      const slide = JSON.parse(readFileSync(join(dir, 'slides', `${id}.json`), 'utf8')) as {
        skip?: boolean;
      };
      return slide.skip !== true;
    });
}

type Start = {
  jobId: string;
  /** the capability of `?cancel=` (SPEC-3 8.13) */
  cancelToken: string;
  revision: number;
  batches: string[][];
  batchSize: number;
  total: number;
};
type Batch = { index: number; slides: number; ms: number; renderer: string } | { stale: string };
type Merge = {
  sync: true;
  summary: { pages: number; passed: boolean; job: string; ms: number };
  report: { perfect: boolean; passed: boolean; slides: { slideId: string }[]; residual: string[] };
  files: { name: string; bytes: number; url: string | null; stored: boolean }[];
  peakMb: number;
  batches: number;
};

function seedDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
  mkdirSync(DECK_DIR, { recursive: true });
  cpSync(join(FIXTURE, 'slides'), join(DECK_DIR, 'slides'), { recursive: true });
  if (existsSync(join(FIXTURE, 'assets')))
    cpSync(join(FIXTURE, 'assets'), join(DECK_DIR, 'assets'), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(FIXTURE, 'deck.json'), 'utf8')) as {
    id: string;
    title: string;
  };
  manifest.id = DECK;
  manifest.title = 'Batch fixture';
  writeFileSync(join(DECK_DIR, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
}

function removeDeck(): void {
  rmSync(DECK_DIR, { recursive: true, force: true });
}

async function post<T>(request: APIRequestContext, query: string, body: unknown = {}): Promise<T> {
  const response = await request.post(`/api/export/${DECK}?${query}`, {
    data: body,
    timeout: 240_000,
  });
  const text = await response.text();
  expect(response.ok(), `POST ?${query}: ${response.status()} ${text.slice(0, 300)}`).toBe(true);
  return JSON.parse(text) as T;
}

test.describe('the batched Perfect export over the http route (SPEC-2 8.1)', () => {
  test.beforeAll(() => {
    seedDeck();
  });
  test.afterAll(() => {
    removeDeck();
  });

  test('the batches of 3 and one merge produce a perfect file that export check accepts', async ({
    request,
  }) => {
    test.setTimeout(600_000);
    const started = await post<Start>(request, 'start=1', { mode: 'flatten', theme: ['light'] });
    expect(started.jobId).toMatch(/^b[0-9a-z]+-[0-9a-f]{8}$/);
    expect(started.total).toBe(PLAY);
    expect(started.batchSize).toBe(BATCH);
    expect(started.cancelToken).toMatch(/^[0-9a-f]{16,}$/);
    expect(started.batches).toHaveLength(BATCHES);
    expect(started.batches.flat()).toHaveLength(PLAY);
    expect(started.batches.flat()).not.toContain('skipped');
    const times: number[] = [];
    let rendered = 0;
    for (let index = 0; index < started.batches.length; index += 1) {
      const result = await post<Batch>(request, `batch=${index}&job=${started.jobId}`);
      expect('stale' in result, `batch ${index} stale`).toBe(false);
      if ('stale' in result) return;
      expect(result.index).toBe(index);
      expect(result.slides).toBe(started.batches[index]!.length);
      expect(result.renderer).toMatch(/Chrom|chrome|SwiftShader|ANGLE/);
      times.push(result.ms);
      rendered += result.slides;
    }
    expect(rendered).toBe(PLAY);
    test.info().annotations.push({
      type: 'batches',
      description: `${times.length} batches, ${times.join(' ')} ms`,
    });
    /* a repeat of a finished batch rewrites the same parts and answers the same shape */
    const again = await post<Batch>(request, `batch=0&job=${started.jobId}`);
    expect('stale' in again).toBe(false);
    if (!('stale' in again)) expect(again.slides).toBe(started.batches[0]!.length);
    /* the body form of the action's `batch` field works the same */
    const viaBody = await post<Batch>(request, 'x=1', {
      batch: { index: 1, of: started.batches.length, jobId: started.jobId },
    });
    expect('stale' in viaBody).toBe(false);

    const merged = await post<Merge>(request, `merge=${started.jobId}`);
    expect(merged.sync).toBe(true);
    expect(merged.batches).toBe(started.batches.length);
    expect(merged.summary.pages).toBe(PLAY);
    expect(merged.report.slides.map((s) => s.slideId)).toEqual(started.batches.flat());
    expect(merged.report.perfect).toBe(true);
    expect(merged.report.passed).toBe(true);
    expect(
      merged.report.residual.some((line) => line.startsWith(`batched: ${BATCHES} batch(es)`)),
    ).toBe(true);
    expect(merged.peakMb).toBeGreaterThan(0);
    test.info().annotations.push({
      type: 'merge',
      description: `${merged.summary.ms} ms, peak ${merged.peakMb} MiB`,
    });
    expect(merged.files).toHaveLength(1);
    const file = merged.files[0]!;
    expect(file.name).toBe(`${DECK}-light.pptx`);
    expect(file.url).not.toBeNull();

    /* the stored file streams from the route and passes export check */
    const download = await request.get(file.url!, { timeout: 60_000 });
    expect(download.ok()).toBe(true);
    const bytes = await download.body();
    expect(bytes.byteLength).toBe(file.bytes);
    const path = join(OUT, file.name);
    writeFileSync(path, bytes);
    const check = execFileSync(
      process.execPath,
      [join(ROOT, 'apps', 'cli', 'bin', 'turboslide.mjs'), 'export', 'check', path],
      {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 120_000,
      },
    );
    expect(check).toMatch(/valid/i);
    /* the reports sit beside the file in the job */
    const report = await request.get(
      `/api/export/${DECK}?job=${started.jobId}&file=export-report.json`,
    );
    expect(report.ok()).toBe(true);
    expect(((await report.json()) as { perfect: boolean }).perfect).toBe(true);

    /* cancel without the token is refused (SPEC-3 8.13); with it the job goes and the file is gone */
    const bare = await request.post(`/api/export/${DECK}?cancel=${started.jobId}`, { data: {} });
    expect(bare.status()).toBe(403);
    const cancelled = await post<{ jobId: string; removed: number }>(
      request,
      `cancel=${started.jobId}&ct=${started.cancelToken}`,
    );
    expect(cancelled.removed).toBeGreaterThan(0);
    const gone = await request.get(file.url!);
    expect(gone.status()).toBe(404);
  });

  test('a replaced twin makes a batch answer stale, and a missing job is 404', async ({
    request,
  }) => {
    test.setTimeout(240_000);
    const assets = join(DECK_DIR, 'assets');
    const twins = existsSync(assets) ? readFileSync(join(FIXTURE, 'deck.json'), 'utf8') : '';
    test.skip(twins === '', 'the fixture has no twin to replace');
    const started = await post<Start>(request, 'start=1', {
      mode: 'flatten',
      theme: ['light'],
      slideIds: ['background-picture', 'canvas-opener'],
    });
    expect(started.batches).toHaveLength(1);
    /* the picture the slides show changes on disk during the download */
    const twin = readFileSync(join(FIXTURE, 'deck.json'), 'utf8').match(/"assets\/([^"]+)"/)?.[1];
    expect(twin).toBeTruthy();
    const file = join(assets, twin!);
    const original = readFileSync(file);
    writeFileSync(file, Buffer.concat([original, Buffer.from([0])]));
    try {
      const result = await post<Batch>(request, `batch=0&job=${started.jobId}`);
      expect(result).toEqual({ stale: 'asset' });
    } finally {
      writeFileSync(file, original);
    }
    await post(request, `cancel=${started.jobId}&ct=${started.cancelToken}`);
    const missing = await request.post(`/api/export/${DECK}?batch=0&job=${started.jobId}`, {
      data: {},
    });
    expect(missing.status()).toBe(404);
    const badIndex = await request.post(`/api/export/${DECK}?batch=x&job=${started.jobId}`, {
      data: {},
    });
    expect(badIndex.status()).toBe(400);
    /* the PDF stays a single call */
    const pdf = await request.post(`/api/export/${DECK}?start=1`, { data: { format: 'pdf' } });
    expect(pdf.status()).toBe(400);
  });
});
