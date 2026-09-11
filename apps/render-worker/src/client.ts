// The client the studio facade routes use (SPEC 3.4 api/render, api/export): over HTTP when
// TURBOSLIDE_WORKER_URL names a running worker, otherwise a local queue in this process that runs
// the same jobs over the turboslide CLI as child processes, so Chromium and LibreOffice still never
// run inside the web app (SPEC 3.3 item 7). Both modes expose one interface.
import { readFile } from 'node:fs/promises';

import type { RenderRecord, Theme } from '@turboslide/schema/render';

import type { RenderJobResult } from './jobs/render.ts';
import { defaultPaths } from './paths.ts';
import type { WorkerPaths } from './paths.ts';
import { createQueue } from './queue.ts';
import type { JobKind, Queue } from './queue.ts';
import { defaultRunners, publicJob } from './server.ts';
import type { Runners } from './server.ts';

export type PublicJob = ReturnType<typeof publicJob>;

export type RenderSlideRequest = { deckId: string; slideId: string; theme: Theme; scale: 1 | 2 };

export type RenderSlideResponse = {
  record: RenderRecord;
  png: Uint8Array<ArrayBuffer>;
  jobId: string;
  cached: boolean;
};

export type WorkerClient = {
  mode: 'http' | 'local';
  url?: string;
  submit: (kind: JobKind, input: unknown) => Promise<PublicJob>;
  job: (id: string) => Promise<PublicJob | null>;
  wait: (id: string, timeoutMs?: number) => Promise<PublicJob>;
  list: (kind?: JobKind) => Promise<PublicJob[]>;
  renderSlide: (request: RenderSlideRequest) => Promise<RenderSlideResponse>;
  health: () => Promise<unknown>;
};

export type WorkerClientOptions = {
  env?: NodeJS.ProcessEnv;
  paths?: Partial<WorkerPaths>;
  /** Replaces job runners in local mode (tests). */
  runners?: Partial<Runners>;
  log?: (line: string) => void;
};

const localQueues = new Map<string, Queue>();

/** One local queue per work directory for the life of the process. */
export function localQueue(paths: WorkerPaths, log?: (line: string) => void): Queue {
  let queue = localQueues.get(paths.workerDir);
  if (!queue) {
    queue = createQueue({ dir: paths.workerDir, log });
    localQueues.set(paths.workerDir, queue);
  }
  return queue;
}

function createLocalClient(options: WorkerClientOptions): WorkerClient {
  const env = options.env ?? process.env;
  const paths: WorkerPaths = { ...defaultPaths(env), ...options.paths, env };
  const queue = localQueue(paths, options.log);
  const runners: Runners = { ...defaultRunners(paths), ...options.runners };
  const submit = async (kind: JobKind, input: unknown): Promise<PublicJob> =>
    publicJob(queue.submit(kind, input, (i: unknown, ctx) => runners[kind](i, ctx)));
  return {
    mode: 'local',
    submit,
    job: async (id) => {
      const record = queue.get(id);
      return record ? publicJob(record) : null;
    },
    wait: async (id, timeoutMs) => publicJob(await queue.wait(id, timeoutMs)),
    list: async (kind) => queue.list(kind).map(publicJob),
    health: async () => ({
      ok: true,
      mode: 'local',
      queue: queue.stats(),
      decksDir: paths.decksDir,
    }),
    renderSlide: async (request) => {
      const job = await submit('render', {
        deckId: request.deckId,
        slideIds: [request.slideId],
        themes: [request.theme],
        scale: request.scale,
      });
      const done = await queue.wait(job.id, 300_000);
      if (done.status !== 'done') throw new Error(done.error?.message ?? 'render failed');
      const result = done.result as RenderJobResult;
      const record = result.records[0];
      if (!record) throw new Error('render returned no record');
      return {
        record,
        png: new Uint8Array(await readFile(record.image)),
        jobId: done.id,
        cached: result.cached > 0,
      };
    },
  };
}

function createHttpClient(url: string, options: WorkerClientOptions): WorkerClient {
  const env = options.env ?? process.env;
  const base = url.replace(/\/+$/, '');
  const headers = (): Record<string, string> => {
    const token = env.TURBOSLIDE_WORKER_TOKEN;
    return token ? { authorization: `Bearer ${token}` } : {};
  };
  const getJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers(), ...(init?.headers as Record<string, string> | undefined) },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`worker ${path}: ${response.status} ${text.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  };
  return {
    mode: 'http',
    url: base,
    submit: (kind, input) =>
      getJson<PublicJob>('/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, ...(input as Record<string, unknown>) }),
      }),
    job: async (id) => {
      const response = await fetch(`${base}/jobs/${encodeURIComponent(id)}`, {
        headers: headers(),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`worker /jobs/${id}: ${response.status}`);
      return (await response.json()) as PublicJob;
    },
    wait: (id, timeoutMs = 600_000) =>
      getJson<PublicJob>(`/jobs/${encodeURIComponent(id)}/wait?timeout=${timeoutMs}`),
    list: (kind) => getJson<PublicJob[]>(`/jobs${kind ? `?kind=${kind}` : ''}`),
    health: () => getJson<unknown>('/healthz'),
    renderSlide: async (request) => {
      const path = `/render/${encodeURIComponent(request.deckId)}/${encodeURIComponent(request.slideId)}?theme=${request.theme}&scale=${request.scale}`;
      const response = await fetch(`${base}${path}`, { headers: headers() });
      if (!response.ok)
        throw new Error(
          `worker ${path}: ${response.status} ${(await response.text()).slice(0, 300)}`,
        );
      const header = response.headers.get('x-turboslide-record');
      if (!header) throw new Error(`worker ${path}: no X-Turboslide-Record header`);
      return {
        record: JSON.parse(header) as RenderRecord,
        png: new Uint8Array(await response.arrayBuffer()),
        jobId: response.headers.get('x-turboslide-job') ?? '',
        cached: response.headers.get('x-turboslide-cached') === '1',
      };
    },
  };
}

/** HTTP when TURBOSLIDE_WORKER_URL is set, else the in-process queue over the CLI. */
export function createWorkerClient(options: WorkerClientOptions = {}): WorkerClient {
  const env = options.env ?? process.env;
  const url = env.TURBOSLIDE_WORKER_URL;
  return url ? createHttpClient(url, options) : createLocalClient(options);
}
