import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import type { RenderRecord } from '@turboslide/schema/render';

import { createWorkerClient } from './client.ts';
import { turboslideBin } from './cli.ts';
import { exportJobArgs, exportJobInput, verifySkippedNote, verifyToolsFor } from './jobs/export.ts';
import type { RenderJobResult } from './jobs/render.ts';
import { cacheFiles } from './jobs/render.ts';
import { cacheDir, defaultPaths, deckDirOf, readDeckHead } from './paths.ts';
import type { WorkerPaths } from './paths.ts';
import { createQueue } from './queue.ts';
import type { JobContext } from './queue.ts';
import { createWorkerServer } from './server.ts';
import type { Runners } from './server.ts';

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-worker-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** A 1 by 1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function record(
  deckId: string,
  slideId: string,
  theme: 'light' | 'dark',
  image: string,
): RenderRecord {
  return {
    deckId,
    slideId,
    revision: 7,
    theme,
    scale: 1,
    image,
    renderer: 'test',
    pageErrors: [],
    consoleErrors: [],
    overflow: [],
    blocks: {},
    fonts: { status: 'loaded', faces: [] },
    anchors: [],
    rasters: [],
    timing: { readyMs: 1, screenshotMs: 1 },
  };
}

function fakePaths(dir: string): WorkerPaths {
  const decksDir = join(dir, 'decks');
  mkdirSync(join(decksDir, 'demo'), { recursive: true });
  writeFileSync(
    join(decksDir, 'demo', 'deck.json'),
    JSON.stringify({
      id: 'demo',
      revision: 7,
      sections: [{ id: 's', slideIds: ['content-rule', 'thesis', 'why'] }],
    }),
  );
  return { decksDir, workerDir: join(dir, 'work'), env: {} };
}

/** Runners that write a PNG into the cache and return a record, no CLI, no browser. */
function fakeRunners(paths: WorkerPaths): Partial<Runners> {
  return {
    render: async (input: unknown, ctx: JobContext) => {
      const { deckId, slideIds, themes } = input as {
        deckId: string;
        slideIds: string[];
        themes: ('light' | 'dark')[];
      };
      ctx.log('fake render');
      const records: RenderRecord[] = [];
      for (const theme of themes) {
        const dir = cacheDir(paths, deckId, 7, theme, 1);
        await mkdir(dir, { recursive: true });
        for (const slideId of slideIds) {
          const image = join(dir, `${slideId}.png`);
          writeFileSync(image, PNG);
          records.push(record(deckId, slideId, theme, image));
        }
      }
      const result: RenderJobResult = {
        deckId,
        revision: 7,
        renderer: 'test',
        records,
        images: records.map((r) => r.image),
        cached: 0,
        rendered: records.length,
        ms: 1,
      };
      return result;
    },
    export: async (input: unknown) => ({ echoed: input }),
  };
}

describe('queue', () => {
  it('runs jobs one at a time in order and records the outcome', async () => {
    const queue = createQueue({ dir: join(tmp, 'q') });
    const order: string[] = [];
    const a = queue.submit('render', { n: 1 }, async (_i, ctx) => {
      ctx.log('a starts');
      await new Promise((r) => setTimeout(r, 30));
      order.push('a');
      return 'A';
    });
    const b = queue.submit('sheet', { n: 2 }, async () => {
      order.push('b');
      return 'B';
    });
    const c = queue.submit('export', { n: 3 }, async () => {
      throw new Error('boom');
    });
    expect(queue.stats().total).toBe(3);
    const doneA = await queue.wait(a.id);
    expect(doneA.status).toBe('done');
    expect(doneA.result).toBe('A');
    expect(doneA.log).toEqual(['a starts']);
    const doneB = await queue.wait(b.id);
    expect(doneB.result).toBe('B');
    expect(order).toEqual(['a', 'b']);
    const doneC = await queue.wait(c.id);
    expect(doneC.status).toBe('failed');
    expect(doneC.error?.message).toBe('boom');
    expect(queue.list('export')).toHaveLength(1);
    expect(queue.get('nope')).toBeUndefined();
    await expect(queue.wait('nope')).rejects.toThrow(RangeError);
    queue.close();
  });
});

describe('export job (gslides-parity SPEC 7.2.1, 7.3, 7.6)', () => {
  it('passes the parity round flags and the PDF format to the CLI', () => {
    const input = exportJobInput.parse({
      deckId: 'demo',
      format: 'pdf',
      appearance: 'light',
      includeSkipped: true,
      verify: true,
    });
    expect(exportJobArgs(input, '/decks/demo', '/work/out', true)).toEqual([
      'export',
      'pdf',
      '--deck',
      '/decks/demo',
      '--appearance',
      'light',
      '--include-skipped',
      '--verify',
      '--out',
      '/work/out',
      '--json',
    ]);
    const native = exportJobInput.parse({
      deckId: 'demo',
      format: 'pptx',
      mode: 'native',
      theme: ['light', 'dark'],
      tables: 'rows',
      includeNotes: true,
      slideIds: ['title', 'table'],
    });
    const args = exportJobArgs(native, '/decks/demo', '/work/out', false);
    expect(args.slice(0, 4)).toEqual(['export', 'pptx', 'title', 'table']);
    expect(args).toContain('--tables');
    expect(args[args.indexOf('--tables') + 1]).toBe('rows');
    expect(args).toContain('--include-notes');
    expect(args).not.toContain('--verify');
    expect(args).not.toContain('--include-skipped');
  });

  it('gates the verify pass on the tools its format needs', () => {
    const none = { soffice: null, pdftocairo: null, pdftoppm: null };
    expect(verifyToolsFor('pptx', { ...none, soffice: 'LibreOffice 25.2' })).toBe(true);
    expect(verifyToolsFor('pptx', { ...none, pdftoppm: 'pdftoppm 26.08' })).toBe(false);
    expect(verifyToolsFor('pdf', { ...none, pdftoppm: 'pdftoppm 26.08' })).toBe(true);
    expect(verifyToolsFor('pdf', { ...none, pdftocairo: 'pdftocairo 26.08' })).toBe(true);
    expect(verifyToolsFor('pdf', { ...none, soffice: 'LibreOffice 25.2' })).toBe(false);
    expect(verifySkippedNote(undefined, none, 'pdf')).toContain('the page count is the gate');
    expect(verifySkippedNote('native', none, 'pptx')).toContain(
      'native text placement is unverified',
    );
  });

  it('keeps JPEG renders in their own cache folder with the .jpg extension', () => {
    const paths: WorkerPaths = { decksDir: '/d', workerDir: '/w', env: {} };
    expect(cacheDir(paths, 'demo', 7, 'light', 1)).toBe('/w/cache/demo/7/light@1x');
    expect(cacheDir(paths, 'demo', 7, 'dark', 2, 'jpg')).toBe('/w/cache/demo/7/dark@2x-jpg');
    expect(cacheFiles('/c', 'thesis', 'jpg').png).toBe('/c/thesis.jpg');
    expect(cacheFiles('/c', 'thesis').png).toBe('/c/thesis.png');
  });
});

describe('paths', () => {
  it('resolves decks by slug and reads the manifest head', () => {
    const dir = join(tmp, 'paths');
    const deck = join(dir, 'decks', 'demo');
    const paths: WorkerPaths = {
      decksDir: join(dir, 'decks'),
      workerDir: join(dir, 'work'),
      env: {},
    };
    expect(() => deckDirOf(paths, '../etc')).toThrow(RangeError);
    expect(() => deckDirOf(paths, 'demo')).toThrow(RangeError);
    mkdirSync(deck, { recursive: true });
    writeFileSync(
      join(deck, 'deck.json'),
      JSON.stringify({ id: 'demo', revision: 3, sections: [{ id: 's', slideIds: ['a', 'b'] }] }),
    );
    expect(deckDirOf(paths, 'demo')).toBe(deck);
    expect(readDeckHead(deck)).toEqual({ id: 'demo', revision: 3, order: ['a', 'b'] });
    expect(cacheDir(paths, 'demo', 3, 'dark', 2)).toBe(
      join(dir, 'work', 'cache', 'demo', '3', 'dark@2x'),
    );
    const defaults = defaultPaths({
      TURBOSLIDE_ROOT: '/r',
      TURBOSLIDE_DECKS_DIR: '/d',
      TURBOSLIDE_WORKER_DIR: '/w',
    });
    expect(defaults.decksDir).toBe('/d');
    expect(defaults.workerDir).toBe('/w');
    const bin = turboslideBin({});
    expect(bin.args[0]).toMatch(/apps\/cli\/bin\/turboslide\.mjs$/);
    expect(turboslideBin({ TURBOSLIDE_BIN: '/usr/local/bin/turboslide' })).toEqual({
      command: '/usr/local/bin/turboslide',
      args: [],
    });
  });
});

describe('server and clients', () => {
  it('serves health, jobs, files and one slide render over HTTP, with the token when set', async () => {
    const dir = join(tmp, 'server');
    const paths = fakePaths(dir);
    const queue = createQueue({ dir: paths.workerDir });
    const server = createWorkerServer({
      queue,
      paths,
      token: 'secret',
      runners: fakeRunners(paths),
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    try {
      const health = (await (await fetch(`${base}/healthz`)).json()) as {
        ok: boolean;
        queue: { total: number };
      };
      expect(health.ok).toBe(true);
      expect((await fetch(`${base}/jobs`)).status).toBe(401);
      const auth = { authorization: 'Bearer secret' };
      const bad = await fetch(`${base}/jobs`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'nope' }),
      });
      expect(bad.status).toBe(400);
      const submitted = await fetch(`${base}/jobs`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'export', deckId: 'demo', format: 'pptx' }),
      });
      expect(submitted.status).toBe(202);
      const job = (await submitted.json()) as { id: string; status: string; files: string };
      expect(job.status).toBe('queued');
      const done = (await (
        await fetch(`${base}/jobs/${job.id}/wait`, { headers: auth })
      ).json()) as { status: string; result: unknown };
      expect(done.status).toBe('done');
      expect(done.result).toEqual({ echoed: { deckId: 'demo', format: 'pptx' } });
      expect((await fetch(`${base}/jobs/zzz`, { headers: auth })).status).toBe(404);
      expect(
        (await fetch(`${base}/jobs/${job.id}/files/../../../etc/passwd`, { headers: auth })).status,
      ).toBe(404);

      const png = await fetch(`${base}/render/demo/content-rule?theme=dark`, { headers: auth });
      expect(png.status).toBe(200);
      expect(png.headers.get('content-type')).toBe('image/png');
      const header = JSON.parse(png.headers.get('x-turboslide-record') ?? '{}') as RenderRecord;
      expect(header.slideId).toBe('content-rule');
      expect(header.theme).toBe('dark');
      expect(Buffer.from(await png.arrayBuffer()).equals(PNG)).toBe(true);
      const asJson = (await (
        await fetch(`${base}/render/demo/content-rule?format=json`, { headers: auth })
      ).json()) as { imageUrl: string; record: RenderRecord };
      expect(asJson.imageUrl).toBe('/cache/demo/7/light@1x/content-rule.png');
      const cached = await fetch(`${base}${asJson.imageUrl}`, { headers: auth });
      expect(cached.status).toBe(200);
      expect((await fetch(`${base}/render/demo/..x`, { headers: auth })).status).toBe(400);

      // the HTTP client speaks the same protocol
      const client = createWorkerClient({
        env: { TURBOSLIDE_WORKER_URL: base, TURBOSLIDE_WORKER_TOKEN: 'secret' },
      });
      expect(client.mode).toBe('http');
      const rendered = await client.renderSlide({
        deckId: 'demo',
        slideId: 'thesis',
        theme: 'light',
        scale: 1,
      });
      expect(rendered.record.slideId).toBe('thesis');
      expect(Buffer.from(rendered.png).equals(PNG)).toBe(true);
      const listed = await client.list('render');
      expect(listed.length).toBeGreaterThanOrEqual(3);
      expect(await client.job('missing')).toBeNull();
    } finally {
      queue.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('runs the same jobs in process when no worker URL is set', async () => {
    const dir = join(tmp, 'local');
    const paths = fakePaths(dir);
    const client = createWorkerClient({ env: {}, paths, runners: fakeRunners(paths) });
    expect(client.mode).toBe('local');
    const job = await client.submit('export', { deckId: 'demo' });
    const done = await client.wait(job.id);
    expect(done.status).toBe('done');
    expect((await client.job(job.id))?.id).toBe(job.id);
    const rendered = await client.renderSlide({
      deckId: 'demo',
      slideId: 'why',
      theme: 'light',
      scale: 1,
    });
    expect(rendered.record.image).toMatch(/why\.png$/);
    expect(Buffer.from(rendered.png).equals(PNG)).toBe(true);
    const health = (await client.health()) as { mode: string };
    expect(health.mode).toBe('local');
  });
});
