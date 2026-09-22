import { describe, expect, it } from 'vitest';

import type { PublicJob, WorkerClient } from '@turboslide/render-worker/client';
import type { ExportReport } from '@turboslide/schema/export';
import { immutableCopyPath } from '@turboslide/store/access-store';
import { memoryBlobClient } from '@turboslide/store/blob-fake';

import {
  EXPORT_POLL_CACHE_MS,
  followExportJob,
  followExportProgress,
  forgetExportPollCache,
  pollExportJob,
  readExportJobCached,
  storeFinishedExportJob,
} from './export-batch';
import type { PartStore } from './export-batch';
import {
  EXPORT_JOBS_PREFIX,
  progressOfLog,
  runningExportJob,
  EXPORT_JOB_FILES_GONE,
  EXPORT_JOB_LOST,
  EXPORT_JOB_MISSING,
  EXPORT_JOB_NO_REPORT,
  attachmentUrlOf,
  exportJobKey,
  exportJobStartedAt,
  finishedExportJob,
  isExportJobId,
  isSyncProgressJobId,
  missingExportJobPoll,
  newSyncProgressJobId,
  parseExportJob,
  pollOfExportJob,
  progressLine,
  queuedExportJob,
  staleExportJobPaths,
} from './export-jobs';
import { pruneExportJobs, readExportJob, writeExportJob } from './export-jobs-store';
import { storedExportPath } from './export-sync';

// The record of an editor export job across instances (the focus round, cycle 3 stream fix
// round two; VERIFICATION C3S-F7): its life from the queue to the outcome, the poll's answers
// from it on the instance that never held the job, the refusal for a job no record names, and
// the prune. The runtime half (the part store, the worker client) is a fake here.

/* the fixtures' clock is the real one less ten minutes, whole seconds: the follow prunes records
   older than a day by the store's upload time (export-batch.ts followExportJob, export-jobs.ts
   pruneExportJobs), so an absolute date failed the follow test once the calendar passed it by a
   day (2026-09-19T18:00Z, read by the return round's ship step; the test was written on the 18th) */
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000 - 10 * 60_000).toISOString();
const LATER = new Date(Date.parse(NOW) + 9_000).toISOString();
/** The worker queue's id shape (render-worker queue.ts): base36 time, a dash, six hex. */
const JOB = `${Date.parse(NOW).toString(36)}-0922ac`;

const report: ExportReport = {
  deckId: 'q4-review',
  revision: 12,
  format: 'pptx',
  mode: 'flatten',
  theme: 'dark',
  fontSet: 'exact',
  fontSetVersion: '1',
  files: [
    { path: '/tmp/worker/jobs/x/export/q4-review-r12-dark.pptx', bytes: 4, sha256: 'ab' },
    { path: '/tmp/worker/jobs/x/export/q4-review-r12-light.pptx', bytes: 5, sha256: 'cd' },
  ],
  fonts: { embedded: [], requiredOnViewer: [], substitutedIn: [] },
  slides: [],
  geometryInBounds: true,
  perfect: true,
  passed: true,
  residual: [],
};

const doneJob = (overrides: Partial<PublicJob> = {}): PublicJob => ({
  id: JOB,
  kind: 'export',
  status: 'done',
  input: { deckId: 'q4-review', format: 'pptx' },
  createdAt: NOW,
  finishedAt: LATER,
  ms: 912,
  result: { report },
  log: ['export: pptx flatten (perfect), 2 slide(s) x dark, fonts exact', 'done in 912 ms'],
  files: `/jobs/${JOB}/files/`,
  ...overrides,
});

/** A worker whose job table holds `jobs` and whose files are the report's names with a few bytes. */
function fakeWorker(jobs: PublicJob[]): WorkerClient & { pruned: string[]; reads: string[] } {
  const pruned: string[] = [];
  const reads: string[] = [];
  const table = new Map(jobs.map((job) => [job.id, job]));
  const worker = {
    mode: 'local',
    exec: 'inprocess',
    pruned,
    reads,
    job: async (id: string) => table.get(id) ?? null,
    wait: async (id: string) => {
      const job = table.get(id);
      if (job === undefined) throw new RangeError(`no job ${id}`);
      return job;
    },
    readJobFile: async (id: string, relative: string) => {
      reads.push(`${id}:${relative}`);
      if (!relative.startsWith('export/')) throw new RangeError(`job ${id} wrote no ${relative}`);
      return new Uint8Array(new TextEncoder().encode(relative.slice('export/'.length)).slice(0, 4));
    },
    pruneJob: async (id: string) => {
      pruned.push(id);
    },
  };
  return worker as unknown as WorkerClient & { pruned: string[]; reads: string[] };
}

const stored = (): PartStore & { fake: ReturnType<typeof memoryBlobClient> } => {
  const fake = memoryBlobClient('https://store.local', { now: () => NOW });
  return { client: fake, stored: true, fake };
};

const checkout = (): PartStore & { fake: ReturnType<typeof memoryBlobClient> } => {
  const fake = memoryBlobClient('https://folder.local', { now: () => NOW });
  return { client: fake, stored: false, fake };
};

const noAuth = {
  authorize: async () => undefined,
  // the file by the exporter's name, saved as the display name when the poll hands one
  sign: (id: string, name: string, saveAs?: string) =>
    `/api/download/${id}/${name}${saveAs !== undefined ? `/${saveAs}` : ''}`,
};

describe('the export job record', () => {
  it('is written with its immutable copy first and read through the proof, so a stale body never answers (docs/SYNC.md 3.5, invariant 8)', async () => {
    const { client, fake } = stored();
    const queued = queuedExportJob(JOB, 'q4-review', 'pptx', NOW);
    expect(await writeExportJob(client, queued)).toBe(true);
    const key = exportJobKey(JOB);
    const stored1 = fake.blobs.get(key);
    expect(stored1).toBeDefined();
    // the copy under the record's version, put before the record itself
    const copy1 = immutableCopyPath(key, stored1!.version);
    expect(fake.blobs.has(copy1)).toBe(true);
    const puts = fake.calls.filter((call) => call.op === 'put').map((call) => call.pathname);
    expect(puts.indexOf(copy1)).toBeLessThan(puts.indexOf(key));
    // the CDN keeps serving the queued body; the worker's instance writes the record done
    fake.holdGet();
    const done = finishedExportJob(queued, { status: 'done', report, ms: 912 }, LATER);
    expect(await writeExportJob(client, done)).toBe(true);
    fake.calls.length = 0;
    const read = await readExportJob(client, JOB);
    expect(read?.status).toBe('done');
    expect(read).toEqual(done);
    const ops = fake.calls.map((call) => `${call.op} ${call.pathname}`);
    expect(ops[0]).toBe(`head ${key}`);
    expect(ops).toContain(`get ${key}`);
    expect(ops).toContain(`get ${immutableCopyPath(key, fake.blobs.get(key)!.version)}`);
    fake.releaseGet();
    // a record the store never held is null after one head
    fake.calls.length = 0;
    expect(await readExportJob(client, 'never-queued')).toBeNull();
    expect(fake.calls.map((call) => call.op)).toEqual(['head']);
  });

  it('is written at queue time under a folder no deck id can name, and read back as it was', async () => {
    const { client } = stored();
    const record = queuedExportJob(JOB, 'q4-review', 'pptx', NOW);
    expect(record).toEqual({
      v: 1,
      jobId: JOB,
      deckId: 'q4-review',
      format: 'pptx',
      status: 'queued',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(exportJobKey(JOB)).toBe(`${EXPORT_JOBS_PREFIX}${JOB}.json`);
    expect(EXPORT_JOBS_PREFIX.startsWith('exports/.')).toBe(true);
    expect(await writeExportJob(client, record)).toBe(true);
    expect(await readExportJob(client, JOB)).toEqual(record);
    expect(await readExportJob(client, 'never-queued')).toBeNull();
    expect(isExportJobId(JOB)).toBe(true);
    expect(isExportJobId('Not A Job')).toBe(false);
    expect(() => queuedExportJob('bad id', 'q4-review', 'pptx', NOW)).toThrow(TypeError);
    expect(() => queuedExportJob(JOB, 'Bad Deck', 'pptx', NOW)).toThrow(TypeError);
  });

  it('moves to done with the report and the stored files, or to failed with the message, keeping its birth', () => {
    const queued = queuedExportJob(JOB, 'q4-review', 'pdf', NOW);
    const downloads = [
      { name: 'q4-review.pdf', bytes: 9, url: 'https://store.local/x?download=1' },
    ];
    const done = finishedExportJob(
      queued,
      { status: 'done', report, downloads, ms: 912, line: 'done in 912 ms' },
      LATER,
    );
    expect(done).toMatchObject({
      status: 'done',
      createdAt: NOW,
      updatedAt: LATER,
      deckId: 'q4-review',
      format: 'pdf',
      ms: 912,
      line: 'done in 912 ms',
      downloads,
    });
    expect(done.report).toEqual(report);
    expect(done.error).toBeUndefined();
    const failed = finishedExportJob(
      queued,
      { status: 'failed', error: 'the browser crashed' },
      LATER,
    );
    expect(failed).toEqual({
      ...queued,
      status: 'failed',
      updatedAt: LATER,
      error: 'the browser crashed',
    });
  });

  it('reads nothing from a body that is not a record of this shape, and a refused put never throws', async () => {
    const { client, fake } = stored();
    const queued = queuedExportJob(JOB, 'q4-review', 'pptx', NOW);
    expect(parseExportJob({ ...queued, v: 2 })).toBeNull();
    expect(parseExportJob({ ...queued, status: 'lost' })).toBeNull();
    expect(parseExportJob({ ...queued, deckId: 'Bad Deck' })).toBeNull();
    expect(parseExportJob({ ...queued, report: { not: 'a report' } })).toBeNull();
    expect(parseExportJob({ ...queued, downloads: [{ name: 'x' }] })).toBeNull();
    expect(parseExportJob(null)).toBeNull();
    expect(parseExportJob({ ...queued, line: 'a line', ms: 3 })).toEqual({
      ...queued,
      line: 'a line',
      ms: 3,
    });
    await client.put(exportJobKey('corrupt'), new TextEncoder().encode('{not json'), {
      overwrite: true,
      contentType: 'application/json',
    });
    expect(await readExportJob(client, 'corrupt')).toBeNull();
    fake.failNextPut(exportJobKey(JOB), new Error('Vercel Blob: Too many requests'));
    expect(await writeExportJob(client, queued)).toBe(false);
  });

  it('prunes the records older than a day by the upload time, else by the start time the worker id carries', async () => {
    const day = 24 * 60 * 60_000;
    const now = Date.parse(NOW);
    const fresh = `${now.toString(36)}-aaaaaa`;
    const old = `${(now - 2 * day).toString(36)}-bbbbbb`;
    expect(exportJobStartedAt(fresh)).toBe(now);
    expect(exportJobStartedAt('bmu76pmcs-0922ac1d')).toBeNull();
    expect(exportJobStartedAt('plain')).toBeNull();
    const entries = [
      { pathname: exportJobKey(fresh) },
      { pathname: exportJobKey(old) },
      { pathname: exportJobKey('noage') },
      {
        pathname: exportJobKey('uploaded-long-ago'),
        uploadedAt: new Date(now - 3 * day).toISOString(),
      },
      { pathname: exportJobKey('uploaded-now'), uploadedAt: NOW },
      { pathname: `exports/q4-review/${old}/plan.json` },
    ];
    expect(staleExportJobPaths(entries, now)).toEqual(
      [exportJobKey(old), exportJobKey('uploaded-long-ago')].sort(),
    );
    const client = memoryBlobClient('https://store.local', {
      now: () => new Date(now - 3 * day).toISOString(),
    });
    await writeExportJob(client, queuedExportJob(old, 'q4-review', 'pptx', NOW));
    await writeExportJob(client, queuedExportJob(fresh, 'q4-review', 'pptx', NOW));
    // both uploads read three days old on this fake: both go, with the immutable copy each
    // write stored beside its record (docs/SYNC.md 3.5; the copies age with their records)
    expect(await pruneExportJobs(client, now)).toBe(4);
    expect(await readExportJob(client, old)).toBeNull();
    expect(await readExportJob(client, fresh)).toBeNull();
  });
});

describe("the poll's answers from a record", () => {
  const queued = queuedExportJob(JOB, 'q4-review', 'pptx', NOW);
  const downloads = [{ name: 'a.pptx', bytes: 4, url: 'https://store.local/a.pptx?download=1' }];

  it('answers a done record with its report and downloads, and the refusals in the product’s words', () => {
    const done = finishedExportJob(queued, { status: 'done', report, downloads, ms: 912 }, LATER);
    expect(pollOfExportJob(done, { stored: true })).toEqual({
      jobId: JOB,
      status: 'done',
      ms: 912,
      report,
      downloads,
    });
    const gone = finishedExportJob(queued, { status: 'done', report }, LATER);
    expect(pollOfExportJob(gone, { stored: true })).toEqual({
      jobId: JOB,
      status: 'failed',
      error: EXPORT_JOB_FILES_GONE,
    });
    const failed = finishedExportJob(
      queued,
      { status: 'failed', error: 'the browser crashed' },
      LATER,
    );
    expect(pollOfExportJob(failed, { stored: true })).toEqual({
      jobId: JOB,
      status: 'failed',
      error: 'the browser crashed',
    });
    expect(missingExportJobPoll(JOB)).toEqual({
      jobId: JOB,
      status: 'failed',
      error: EXPORT_JOB_MISSING,
    });
  });

  it('answers a queued record as in progress on a shared store and as lost on a checkout’s folder', () => {
    expect(pollOfExportJob(queued, { stored: true })).toEqual({ jobId: JOB, status: 'queued' });
    expect(
      pollOfExportJob({ ...queued, status: 'running', line: 'rendering' }, { stored: true }),
    ).toEqual({
      jobId: JOB,
      status: 'running',
      line: 'rendering',
    });
    expect(pollOfExportJob(queued, { stored: false })).toEqual({
      jobId: JOB,
      status: 'failed',
      error: EXPORT_JOB_LOST,
    });
  });

  it('words every refusal as a sentence the dialog shows and the drivers read as a refusal', () => {
    for (const sentence of [EXPORT_JOB_MISSING, EXPORT_JOB_LOST, EXPORT_JOB_FILES_GONE]) {
      expect(sentence).toMatch(/could not be made/);
      expect(sentence).toMatch(/^[A-Z]/);
      expect(sentence.endsWith('.')).toBe(true);
      expect(sentence).not.toMatch(/—/);
    }
    expect(attachmentUrlOf('https://store.local/a.pptx')).toBe(
      'https://store.local/a.pptx?download=1',
    );
    expect(attachmentUrlOf('https://store.local/a.pptx?x=1')).toBe(
      'https://store.local/a.pptx?x=1&download=1',
    );
    expect(attachmentUrlOf('/api/export/q4-review?job=x&file=a.pptx')).toBe(
      '/api/export/q4-review?job=x&file=a.pptx',
    );
  });
});

describe('the finished job across instances (storeFinishedExportJob, pollExportJob, followExportJob)', () => {
  it('stores the files under the deck’s export prefix, rewrites the record as done with their addresses and frees the job folder, once', async () => {
    const store = stored();
    const worker = fakeWorker([doneJob()]);
    const queued = queuedExportJob(JOB, 'q4-review', 'pptx', NOW);
    await writeExportJob(store.client, queued);
    const done = await storeFinishedExportJob(worker, store, queued, doneJob(), () => LATER);
    expect(done.status).toBe('done');
    expect(done.downloads).toEqual([
      {
        name: 'q4-review (dark).pptx',
        bytes: 4,
        url: `https://store.local/${storedExportPath('q4-review', JOB, 'q4-review (dark).pptx')}?download=1`,
      },
      {
        name: 'q4-review (light).pptx',
        bytes: 4,
        url: `https://store.local/${storedExportPath('q4-review', JOB, 'q4-review (light).pptx')}?download=1`,
      },
    ]);
    expect(done.line).toBe('done in 912 ms');
    expect(done.ms).toBe(912);
    expect(store.fake.blobs.has(storedExportPath('q4-review', JOB, 'q4-review (dark).pptx'))).toBe(
      true,
    );
    expect(await readExportJob(store.client, JOB)).toEqual(done);
    expect(worker.pruned).toEqual([JOB]);
    // a second run (the poll on the same instance beside the follow) answers the record and stores nothing again
    const puts = store.fake.calls.filter((call) => call.op === 'put').length;
    expect(await storeFinishedExportJob(worker, store, queued, doneJob(), () => LATER)).toEqual(
      done,
    );
    expect(store.fake.calls.filter((call) => call.op === 'put').length).toBe(puts);
    expect(worker.pruned).toEqual([JOB]);
  });

  it('records a failed job with its message, a finished job without a report as a failure, and keeps a checkout’s files in the job folder', async () => {
    const store = stored();
    const queued = queuedExportJob(JOB, 'q4-review', 'pptx', NOW);
    const crashed = doneJob({
      status: 'failed',
      error: { message: 'the browser crashed' },
      result: undefined,
    });
    const failed = await storeFinishedExportJob(
      fakeWorker([crashed]),
      store,
      queued,
      crashed,
      () => LATER,
    );
    expect(failed).toMatchObject({
      status: 'failed',
      error: 'the browser crashed',
      updatedAt: LATER,
    });
    const silent = doneJob({ id: 'silent-000001', result: {} });
    const noReport = await storeFinishedExportJob(
      fakeWorker([silent]),
      store,
      queuedExportJob('silent-000001', 'q4-review', 'pptx', NOW),
      silent,
      () => LATER,
    );
    expect(noReport).toMatchObject({ status: 'failed', error: EXPORT_JOB_NO_REPORT });
    const folder = checkout();
    const worker = fakeWorker([doneJob()]);
    const local = await storeFinishedExportJob(worker, folder, queued, doneJob(), () => LATER);
    expect(local.status).toBe('done');
    expect(local.downloads).toBeUndefined();
    expect(worker.pruned).toEqual([]);
    expect(worker.reads).toEqual([]);
  });

  it('polls the job in this process as before on a checkout, with signed job file URLs once done', async () => {
    const folder = checkout();
    const running = doneJob({
      status: 'running',
      result: undefined,
      ms: undefined,
      finishedAt: undefined,
    });
    expect(await pollExportJob(fakeWorker([running]), JOB, noAuth, folder)).toEqual({
      jobId: JOB,
      status: 'running',
      line: 'done in 912 ms',
      // the head line names two slides and no slide line has arrived yet
      progress: { slide: 0, total: 2 },
    });
    const seen: string[] = [];
    const deps = { ...noAuth, authorize: async (deckId: string) => void seen.push(deckId) };
    expect(await pollExportJob(fakeWorker([doneJob()]), JOB, deps, folder)).toEqual({
      jobId: JOB,
      status: 'done',
      line: 'done in 912 ms',
      ms: 912,
      report,
      downloads: [
        {
          name: 'q4-review (dark).pptx',
          bytes: 4,
          url: `/api/download/${JOB}/q4-review-r12-dark.pptx/q4-review (dark).pptx`,
        },
        {
          name: 'q4-review (light).pptx',
          bytes: 5,
          url: `/api/download/${JOB}/q4-review-r12-light.pptx/q4-review (light).pptx`,
        },
      ],
    });
    expect(seen).toEqual(['q4-review']);
    const crashed = doneJob({
      status: 'failed',
      error: { message: 'the browser crashed' },
      result: undefined,
    });
    expect(await pollExportJob(fakeWorker([crashed]), JOB, noAuth, folder)).toMatchObject({
      status: 'failed',
      error: 'the browser crashed',
    });
  });

  it('polls a job this process never held from the record, under the export right on the record’s deck, and refuses a job no record names without throwing', async () => {
    const store = stored();
    const worker = fakeWorker([]);
    const seen: string[] = [];
    const deps = { ...noAuth, authorize: async (deckId: string) => void seen.push(deckId) };
    // no record anywhere: the refusal, never a RangeError (C3S-F7's "No export job")
    expect(await pollExportJob(worker, JOB, deps, store)).toEqual(missingExportJobPoll(JOB));
    expect(seen).toEqual([]);
    // the other instance queued it
    const queued = queuedExportJob(JOB, 'q4-review', 'pptx', NOW);
    await writeExportJob(store.client, queued);
    expect(await pollExportJob(worker, JOB, deps, store)).toEqual({ jobId: JOB, status: 'queued' });
    expect(seen).toEqual(['q4-review']);
    // the other instance finished it: the stored addresses come back from here
    const done = await storeFinishedExportJob(
      fakeWorker([doneJob()]),
      store,
      queued,
      doneJob(),
      () => LATER,
    );
    const poll = await pollExportJob(worker, JOB, deps, store);
    expect(poll.status).toBe('done');
    expect(poll.downloads).toEqual(done.downloads);
    expect(poll.report).toEqual(report);
    // on a checkout the same queued record is a lost job: the one process restarted
    const folder = checkout();
    await writeExportJob(folder.client, queued);
    expect(await pollExportJob(worker, JOB, noAuth, folder)).toEqual({
      jobId: JOB,
      status: 'failed',
      error: EXPORT_JOB_LOST,
    });
  });

  it('polls a done job in this process on a deployment through the stored copies, storing them itself when the follow has not yet', async () => {
    const store = stored();
    const worker = fakeWorker([doneJob()]);
    await writeExportJob(store.client, queuedExportJob(JOB, 'q4-review', 'pptx', NOW));
    const poll = await pollExportJob(worker, JOB, noAuth, store);
    expect(poll.status).toBe('done');
    expect(poll.downloads?.map((file) => file.url)).toEqual([
      `https://store.local/${storedExportPath('q4-review', JOB, 'q4-review (dark).pptx')}?download=1`,
      `https://store.local/${storedExportPath('q4-review', JOB, 'q4-review (light).pptx')}?download=1`,
    ]);
    expect((await readExportJob(store.client, JOB))?.status).toBe('done');
    expect(worker.pruned).toEqual([JOB]);
  });

  it('follows a queued job to its end: the record at queue time, then done with the stored files after the response', async () => {
    const store = stored();
    const worker = fakeWorker([doneJob()]);
    await followExportJob(
      worker,
      doneJob({ status: 'queued', result: undefined }),
      'q4-review',
      'pptx',
      store,
    );
    const started = Date.now();
    let record = await readExportJob(store.client, JOB);
    expect(record?.status === 'queued' || record?.status === 'done').toBe(true);
    while (record?.status !== 'done') {
      if (Date.now() - started > 2000) throw new Error('the follow never finished');
      await new Promise((resolve) => setTimeout(resolve, 5));
      record = await readExportJob(store.client, JOB);
    }
    expect(record.downloads).toHaveLength(2);
    expect(worker.pruned).toEqual([JOB]);
  });

  it('records the wait’s failure when the job never finishes, unless the record is settled already', async () => {
    const store = stored();
    const worker = fakeWorker([]);
    const queued = doneJob({ id: 'lost-000001', status: 'queued', result: undefined });
    await followExportJob(worker, queued, 'q4-review', 'pdf', store);
    const started = Date.now();
    let record = await readExportJob(store.client, 'lost-000001');
    while (record?.status !== 'failed') {
      if (Date.now() - started > 2000) throw new Error('the follow never settled');
      await new Promise((resolve) => setTimeout(resolve, 5));
      record = await readExportJob(store.client, 'lost-000001');
    }
    expect(record.error).toBe('no job lost-000001');
    expect(record.format).toBe('pdf');
  });
});

describe('the file names and the progress of the product round (docs/PRODUCT.md section 2 ranks 7, 8 and 21)', () => {
  it('reads where a PowerPoint export is off the worker’s own log lines, and the PDF’s count alone', () => {
    expect(progressOfLog([])).toBeNull();
    expect(progressOfLog(['turboslide export pptx --deck x'])).toBeNull();
    const head =
      'export: pptx native (editable text), 6 slide(s) x light, fonts exact embedded -> /tmp/j/export';
    expect(progressOfLog([head])).toEqual({ slide: 0, total: 6 });
    expect(
      progressOfLog([
        head,
        '   1 title light 812 ms, 2 text(s), 0 raster(s)',
        '   2 agenda light 402 ms, 4 text(s), 1 raster(s)',
        '   3 pricing-internal light 388 ms, 4 text(s), 0 raster(s)',
      ]),
    ).toEqual({ slide: 3, total: 6, theme: 'light' });
    // a two appearance run counts once per appearance and names which
    expect(
      progressOfLog([
        'export: pptx flatten (perfect), 2 slide(s) x light,dark, fonts exact -> out',
        '   1 title light 812 ms, 2 text(s), 0 raster(s)',
        '   2 agenda light 402 ms, 4 text(s), 1 raster(s)',
        '   1 title dark 700 ms, 2 text(s), 0 raster(s)',
      ]),
    ).toEqual({ slide: 1, total: 2, theme: 'dark' });
    // the PDF is one print: the count and the appearance, no slide moves
    expect(progressOfLog(['export: pdf dark, 85 slide(s) -> /tmp/j/export'])).toEqual({
      slide: 0,
      total: 85,
      theme: 'dark',
    });
    // a slide line before any head line is not progress
    expect(progressOfLog(['   1 title light 812 ms, 2 text(s), 0 raster(s)'])).toBeNull();
  });

  it('carries the title and the progress on the record, round trips them, and drops the progress once the job ended', () => {
    const queued = queuedExportJob(JOB, 'q4-review', 'pptx', NOW, 'GT pitch for Acme');
    expect(queued.title).toBe('GT pitch for Acme');
    expect(queuedExportJob(JOB, 'q4-review', 'pptx', NOW, '').title).toBeUndefined();
    const running = runningExportJob(queued, LATER, {
      line: '   3 pricing light 388 ms, 4 text(s), 0 raster(s)',
      progress: { slide: 3, total: 6, theme: 'light' },
    });
    expect(running.status).toBe('running');
    expect(parseExportJob(JSON.parse(JSON.stringify(running)))).toEqual(running);
    // the poll's line reads the snackbar's words while the worker renders (the fix round)
    expect(pollOfExportJob(running, { stored: true })).toEqual({
      jobId: JOB,
      status: 'running',
      line: 'slide 3 of 6',
      progress: { slide: 3, total: 6, theme: 'light' },
    });
    const done = finishedExportJob(running, { status: 'done', report, downloads: [] }, LATER);
    expect(done.title).toBe('GT pitch for Acme');
    expect(pollOfExportJob(done, { stored: true }).progress).toBeUndefined();
    // a progress that is not two counts is not read back
    expect(
      parseExportJob({ ...queued, progress: { slide: 'three', total: 6 } })?.progress,
    ).toBeUndefined();
  });

  it('stores a finished job’s files under the deck’s title, with the appearance mark when both left one run', async () => {
    const store = stored();
    const worker = fakeWorker([doneJob()]);
    const queued = queuedExportJob(JOB, 'q4-review', 'pptx', NOW, 'GT pitch for Acme');
    await writeExportJob(store.client, queued);
    const done = await storeFinishedExportJob(worker, store, queued, doneJob(), () => LATER);
    expect(done.downloads?.map((file) => file.name)).toEqual([
      'GT pitch for Acme (dark).pptx',
      'GT pitch for Acme (light).pptx',
    ]);
    expect(
      store.fake.blobs.has(storedExportPath('q4-review', JOB, 'GT pitch for Acme (dark).pptx')),
    ).toBe(true);
    // read by the exporter's own names from the job folder
    expect(worker.reads).toEqual([
      `${JOB}:export/q4-review-r12-dark.pptx`,
      `${JOB}:export/q4-review-r12-light.pptx`,
    ]);
    // one file of one appearance carries no mark
    const one = { ...report, files: [report.files[0]!] };
    const store2 = stored();
    const queued2 = queuedExportJob(JOB, 'q4-review', 'pptx', NOW, 'GT pitch for Acme');
    await writeExportJob(store2.client, queued2);
    const done2 = await storeFinishedExportJob(
      fakeWorker([doneJob({ result: { report: one } })]),
      store2,
      queued2,
      doneJob({ result: { report: one } }),
      () => LATER,
    );
    expect(done2.downloads?.map((file) => file.name)).toEqual(['GT pitch for Acme.pptx']);
  });
});

describe('the snackbar’s words and the sync export’s progress record (the product round fix round, the row export.download.progress-per-slide)', () => {
  it('words a running PowerPoint export as "slide k of n", and nothing before the first slide or for a PDF', () => {
    expect(progressLine({ slide: 3, total: 6, theme: 'light' })).toBe('slide 3 of 6');
    expect(progressLine({ slide: 9, total: 6 })).toBe('slide 6 of 6');
    expect(progressLine({ slide: 0, total: 6 })).toBeNull();
    expect(progressLine({ slide: 0, total: 6, theme: 'dark' })).toBeNull();
    expect(progressLine(null)).toBeNull();
    expect(progressLine(undefined)).toBeNull();
  });

  it('answers a running record’s line as the words while it renders, and the worker’s line otherwise', () => {
    const queued = queuedExportJob(JOB, 'q4-review', 'pptx', NOW);
    const running = runningExportJob(queued, LATER, {
      line: '   3 content-x light 812 ms, 4 text(s), 1 raster(s)',
      progress: { slide: 3, total: 6, theme: 'light' },
    });
    expect(pollOfExportJob(running, { stored: true })).toMatchObject({
      status: 'running',
      line: 'slide 3 of 6',
      progress: { slide: 3, total: 6, theme: 'light' },
    });
    const early = runningExportJob(queued, LATER, {
      line: 'export: pptx flatten (perfect), 6 slide(s) x light',
      progress: { slide: 0, total: 6 },
    });
    expect(pollOfExportJob(early, { stored: true }).line).toBe(
      'export: pptx flatten (perfect), 6 slide(s) x light',
    );
    const done = finishedExportJob(
      running,
      { status: 'done', report, downloads: [], line: 'done in 912 ms' },
      LATER,
    );
    expect(pollOfExportJob(done, { stored: true }).line).toBe('done in 912 ms');
  });

  it('mints and recognises the page’s sync progress id, and never the worker queue’s', () => {
    const id = newSyncProgressJobId(Date.parse(NOW));
    expect(isSyncProgressJobId(id)).toBe(true);
    expect(isExportJobId(id)).toBe(true);
    expect(isSyncProgressJobId(JOB)).toBe(false);
    expect(isSyncProgressJobId('sync-')).toBe(false);
    expect(newSyncProgressJobId()).not.toBe(newSyncProgressJobId());
  });

  it('round trips the worker job behind a page named record, and keeps it through the running and finished shapes', () => {
    const queued = queuedExportJob('sync-abc123-0f0f0f0f', 'q4-review', 'pptx', NOW, 'GT pitch');
    const running = runningExportJob(queued, LATER, { workerJobId: JOB });
    expect(running.workerJobId).toBe(JOB);
    expect(parseExportJob(JSON.parse(JSON.stringify(running)))).toEqual(running);
    const done = finishedExportJob(running, { status: 'done', report, downloads: [] }, LATER);
    expect(done.workerJobId).toBe(JOB);
    expect(
      parseExportJob({ ...JSON.parse(JSON.stringify(queued)), workerJobId: 'not a job id!' })
        ?.workerJobId,
    ).toBeUndefined();
  });

  it('follows the worker’s job under the record’s own id, and the poll on the worker’s instance reads the live job by it', async () => {
    const store = stored();
    const job = doneJob({
      status: 'running',
      result: undefined,
      ms: undefined,
      finishedAt: undefined,
      log: ['export: pptx flatten (perfect), 3 slide(s) x light, fonts exact -> out'],
    });
    const worker = fakeWorker([job]);
    const queued = queuedExportJob('sync-abc123-0f0f0f0f', 'q4-review', 'pptx', NOW, 'GT pitch');
    const running = runningExportJob(queued, NOW, { workerJobId: JOB });
    await writeExportJob(store.client, running);
    // the poll by the page's id, on the instance that runs the job: the live log's words
    expect(await pollExportJob(worker, 'sync-abc123-0f0f0f0f', noAuth, store)).toMatchObject({
      jobId: 'sync-abc123-0f0f0f0f',
      status: 'running',
    });
    job.log.push('   2 agenda light 402 ms, 4 text(s), 1 raster(s)');
    forgetExportPollCache(store.client);
    expect(await pollExportJob(worker, 'sync-abc123-0f0f0f0f', noAuth, store)).toMatchObject({
      jobId: 'sync-abc123-0f0f0f0f',
      status: 'running',
      line: 'slide 2 of 3',
      progress: { slide: 2, total: 3, theme: 'light' },
    });
    // the follow writes the record under the page's id from the worker's job
    let end: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      end = resolve;
    });
    const following = followExportProgress(worker, store, running, done, 5, JOB);
    await new Promise((resolve) => setTimeout(resolve, 12));
    end();
    await following;
    const record = await readExportJob(store.client, 'sync-abc123-0f0f0f0f');
    expect(record?.progress).toEqual({ slide: 2, total: 3, theme: 'light' });
    expect(record?.workerJobId).toBe(JOB);
    // another instance, which does not hold the job, reads the words off the record
    forgetExportPollCache(store.client);
    expect(
      await pollExportJob(fakeWorker([]), 'sync-abc123-0f0f0f0f', noAuth, store),
    ).toMatchObject({
      status: 'running',
      line: 'slide 2 of 3',
    });
    // the job done and the sync call about to finish the record: still running, never lost
    job.status = 'done';
    forgetExportPollCache(store.client);
    expect((await pollExportJob(worker, 'sync-abc123-0f0f0f0f', noAuth, store)).status).toBe(
      'running',
    );
  });
});

describe('the progress on the record while the job runs, and the poll cache (the product round)', () => {
  it('writes the record’s progress from the worker’s log once per tick when the slide moved, and stops when the job ends', async () => {
    const store = stored();
    const job = doneJob({
      status: 'running',
      result: undefined,
      ms: undefined,
      finishedAt: undefined,
      log: ['export: pptx flatten (perfect), 3 slide(s) x light, fonts exact -> out'],
    });
    const worker = fakeWorker([job]);
    const queued = queuedExportJob(JOB, 'q4-review', 'pptx', NOW, 'GT pitch for Acme');
    await writeExportJob(store.client, queued);
    let end: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      end = resolve;
    });
    const following = followExportProgress(worker, store, queued, done, 5);
    await new Promise((resolve) => setTimeout(resolve, 12));
    job.log.push('   1 title light 812 ms, 2 text(s), 0 raster(s)');
    await new Promise((resolve) => setTimeout(resolve, 12));
    job.log.push('   2 agenda light 402 ms, 4 text(s), 1 raster(s)');
    await new Promise((resolve) => setTimeout(resolve, 12));
    end();
    await following;
    const record = await readExportJob(store.client, JOB);
    expect(record?.status).toBe('running');
    expect(record?.progress).toEqual({ slide: 2, total: 3, theme: 'light' });
    expect(record?.title).toBe('GT pitch for Acme');
    // one put per change of the slide: the queue write, then 0 of 3, 1 of 3, 2 of 3
    const puts = store.fake.calls.filter(
      (call) => call.op === 'put' && call.pathname === exportJobKey(JOB),
    );
    expect(puts.length).toBeLessThanOrEqual(4);
    expect(puts.length).toBeGreaterThanOrEqual(3);
    // a poll elsewhere reads the slide off the record
    expect(pollOfExportJob(record!, { stored: true }).progress).toEqual({
      slide: 2,
      total: 3,
      theme: 'light',
    });
    // a checkout's folder store is not written to: the one process that runs the job answers live
    const folder = checkout();
    await followExportProgress(fakeWorker([job]), folder, queued, Promise.resolve(), 1);
    expect(folder.fake.calls.filter((call) => call.op === 'put')).toHaveLength(0);
  });

  it('reads a running record from the store at most once per two seconds per job on this instance, a queued one each time, and a settled one once', async () => {
    const store = stored();
    forgetExportPollCache(store.client);
    const queued = queuedExportJob(JOB, 'q4-review', 'pptx', NOW);
    await writeExportJob(store.client, queued);
    let t = 0;
    const now = () => t;
    const gets = () =>
      store.fake.calls.filter((call) => call.op === 'get' && call.pathname === exportJobKey(JOB))
        .length;
    // queued: read each time, so the move to running or done is seen within the poll
    await readExportJobCached(store.client, JOB, now);
    await readExportJobCached(store.client, JOB, now);
    expect(gets()).toBe(2);
    await writeExportJob(
      store.client,
      runningExportJob(queued, NOW, { progress: { slide: 1, total: 3, theme: 'light' } }),
    );
    store.fake.calls.length = 0;
    await readExportJobCached(store.client, JOB, now);
    await readExportJobCached(store.client, JOB, now);
    t = 1_000;
    await readExportJobCached(store.client, JOB, now);
    expect(gets()).toBe(1);
    t = EXPORT_POLL_CACHE_MS;
    await readExportJobCached(store.client, JOB, now);
    expect(gets()).toBe(2);
    // a missing record is asked again each time: the job may have been queued elsewhere a moment ago
    expect(await readExportJobCached(store.client, 'no-such-job-0922ac', now)).toBeNull();
    expect(await readExportJobCached(store.client, 'no-such-job-0922ac', now)).toBeNull();
    // a settled record is kept for the process
    await writeExportJob(
      store.client,
      finishedExportJob(queued, { status: 'failed', error: 'x' }, LATER),
    );
    t = 2 * EXPORT_POLL_CACHE_MS;
    expect((await readExportJobCached(store.client, JOB, now))?.status).toBe('failed');
    t = 10 * EXPORT_POLL_CACHE_MS;
    await readExportJobCached(store.client, JOB, now);
    expect(gets()).toBe(3);
    forgetExportPollCache(store.client);
  });
});
