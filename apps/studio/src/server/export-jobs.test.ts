import { describe, expect, it } from 'vitest';

import type { PublicJob, WorkerClient } from '@turboslide/render-worker/client';
import type { ExportReport } from '@turboslide/schema/export';
import { memoryBlobClient } from '@turboslide/store/blob-fake';

import { followExportJob, pollExportJob, storeFinishedExportJob } from './export-batch';
import type { PartStore } from './export-batch';
import {
  EXPORT_JOBS_PREFIX,
  EXPORT_JOB_FILES_GONE,
  EXPORT_JOB_LOST,
  EXPORT_JOB_MISSING,
  EXPORT_JOB_NO_REPORT,
  attachmentUrlOf,
  exportJobKey,
  exportJobStartedAt,
  finishedExportJob,
  isExportJobId,
  missingExportJobPoll,
  parseExportJob,
  pollOfExportJob,
  pruneExportJobs,
  queuedExportJob,
  readExportJob,
  staleExportJobPaths,
  writeExportJob,
} from './export-jobs';
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
  sign: (id: string, name: string) => `/api/download/${id}/${name}`,
};

describe('the export job record', () => {
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
    // both uploads read three days old on this fake: both go
    expect(await pruneExportJobs(client, now)).toBe(2);
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
        name: 'q4-review-r12-dark.pptx',
        bytes: 4,
        url: `https://store.local/${storedExportPath('q4-review', JOB, 'q4-review-r12-dark.pptx')}?download=1`,
      },
      {
        name: 'q4-review-r12-light.pptx',
        bytes: 4,
        url: `https://store.local/${storedExportPath('q4-review', JOB, 'q4-review-r12-light.pptx')}?download=1`,
      },
    ]);
    expect(done.line).toBe('done in 912 ms');
    expect(done.ms).toBe(912);
    expect(
      store.fake.blobs.has(storedExportPath('q4-review', JOB, 'q4-review-r12-dark.pptx')),
    ).toBe(true);
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
          name: 'q4-review-r12-dark.pptx',
          bytes: 4,
          url: `/api/download/${JOB}/q4-review-r12-dark.pptx`,
        },
        {
          name: 'q4-review-r12-light.pptx',
          bytes: 5,
          url: `/api/download/${JOB}/q4-review-r12-light.pptx`,
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
      `https://store.local/${storedExportPath('q4-review', JOB, 'q4-review-r12-dark.pptx')}?download=1`,
      `https://store.local/${storedExportPath('q4-review', JOB, 'q4-review-r12-light.pptx')}?download=1`,
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
