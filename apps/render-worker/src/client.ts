// The client the studio facade routes use (SPEC 3.4 api/render, api/export): over HTTP when
// TURBOSLIDE_WORKER_URL names a running worker, otherwise a local queue in this process that runs
// the same jobs over the turboslide CLI, as child processes where the binary exists (SPEC 3.3
// item 7) and through runCli() in this process inside a serverless function (cli.ts execMode;
// docs/hosting-chromium.md records the deviation). Both modes expose one interface. `runJob` is
// the synchronous shape a function invocation needs: submit, wait and return the finished record
// in one call; `readJobFile` then reads a file the job wrote, from disk or from the worker's files
// route, so the caller can answer the bytes without a second request.
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile, rm, statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize, relative, resolve, sep } from 'node:path';

import type { RenderRecord, Theme } from '@turboslide/schema/render';

import { execMode, isServerlessEnv } from './cli.ts';
import type { ExecMode } from './cli.ts';
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
  /** How the local queue runs a command: spawn or inprocess; `remote` over HTTP. */
  exec: ExecMode | 'remote';
  url?: string;
  submit: (kind: JobKind, input: unknown) => Promise<PublicJob>;
  job: (id: string) => Promise<PublicJob | null>;
  wait: (id: string, timeoutMs?: number) => Promise<PublicJob>;
  /** Submit and wait in one call: the finished record, done or failed (the caller reads `status`). */
  runJob: (kind: JobKind, input: unknown, timeoutMs?: number) => Promise<PublicJob>;
  /** A file a finished job wrote, by its path relative to the job directory; RangeError when it is not there. */
  readJobFile: (id: string, relativePath: string) => Promise<Uint8Array<ArrayBuffer>>;
  /**
   * Frees a finished job's disk: its `export/work` folder always (the sheet shots, about 38 MB per
   * theme of the GT deck), the whole job directory unless `keepFiles`. A function's /tmp is the
   * one writable place and holds the browser too (docs/hosting-chromium.md); a no-op over HTTP.
   */
  pruneJob: (id: string, options?: { keepFiles?: boolean }) => Promise<void>;
  /** Free bytes on the work directory's volume, or null when the platform does not say. */
  freeBytes: () => Promise<number | null>;
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

/** The worker directory inside a function: the temp directory, the one writable path (docs/hosting-chromium.md). */
export function serverlessWorkerDir(tmp: string = tmpdir()): string {
  return join(tmp, 'turboslide-worker');
}

/**
 * The worker's paths for this environment: defaultPaths, except that inside a function with no
 * TURBOSLIDE_WORKER_DIR the work directory moves under the temp directory, because the bundle's
 * own tree is read-only there.
 */
export function clientPaths(
  env: NodeJS.ProcessEnv,
  overrides: Partial<WorkerPaths> = {},
): WorkerPaths {
  const base = defaultPaths(env);
  const workerDir =
    overrides.workerDir ??
    (isServerlessEnv(env) && !env.TURBOSLIDE_WORKER_DIR ? serverlessWorkerDir() : base.workerDir);
  return { ...base, ...overrides, workerDir, env };
}

/** The size in bytes of a file or a directory tree, bounded to `limit` entries; -1 past the bound. */
export function sizeOf(path: string, limit = 20_000): number {
  let entries = 0;
  const walk = (p: string): number => {
    const stat = statSync(p, { throwIfNoEntry: false });
    if (!stat) return 0;
    entries += 1;
    if (entries > limit) throw new RangeError('bound');
    if (!stat.isDirectory()) return stat.size;
    let sum = 0;
    for (const name of readdirSync(p)) sum += walk(join(p, name));
    return sum;
  };
  try {
    return walk(path);
  } catch {
    return -1;
  }
}

/** The entries of a directory with their tree sizes, largest first: `chromium 197.2 MB, ...`. */
export function describeDirectory(dir: string, top = 8): string {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return `${dir} unreadable`;
  }
  const sized = names
    .map((name) => ({ name, bytes: sizeOf(join(dir, name)) }))
    .sort((a, b) => b.bytes - a.bytes);
  const shown = sized
    .slice(0, top)
    .map(
      ({ name, bytes }) =>
        `${name} ${bytes < 0 ? '>bound' : `${(bytes / 1_048_576).toFixed(1)} MB`}`,
    );
  return `${names.length} entries: ${shown.join(', ')}`;
}

/** Temp-directory entries a finished browser leaves behind; removed ahead of the next job. */
const BROWSER_LEFTOVERS = [
  /^playwright_chromiumdev_profile-/,
  /^\.org\.chromium\.Chromium\./,
  /^core(\..*)?$/,
  /^turboslide-(render|export)-/,
];

export function removeBrowserLeftovers(dir: string, log?: (line: string) => void): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  let removed = 0;
  let bytes = 0;
  for (const name of names) {
    if (!BROWSER_LEFTOVERS.some((pattern) => pattern.test(name))) continue;
    const path = join(dir, name);
    const size = sizeOf(path);
    try {
      rmSync(path, { recursive: true, force: true });
      removed += 1;
      bytes += Math.max(size, 0);
    } catch {
      // a file a live process holds stays
    }
  }
  if (removed > 0)
    log?.(`removed ${removed} browser leftover(s), ${(bytes / 1_048_576).toFixed(1)} MB`);
}

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

/** The absolute path of a file under a job directory; RangeError when the relative path escapes it. */
export function jobFilePath(jobDir: string, relativePath: string): string {
  const root = resolve(jobDir);
  const file = resolve(root, normalize(relativePath));
  const rel = relative(root, file);
  if (rel === '' || rel.startsWith('..') || rel.includes(`..${sep}`))
    throw new RangeError(`"${relativePath}" is not inside the job directory`);
  return file;
}

function createLocalClient(options: WorkerClientOptions): WorkerClient {
  const env = options.env ?? process.env;
  const paths = clientPaths(env, options.paths);
  const queue = localQueue(paths, options.log);
  const runners: Runners = { ...defaultRunners(paths), ...options.runners };
  const freeBytes = async (): Promise<number | null> => {
    try {
      const stats = await statfs(paths.workerDir);
      return Number(stats.bavail) * Number(stats.bsize);
    } catch {
      return null;
    }
  };
  // the work volume ahead of every job, in the job log: free and total, and inside a function
  // the largest entries of the temp directory, because a full /tmp made the browser fail every
  // file:// navigation with net::ERR_FAILED on the hosted previews (9 MB free after one render);
  // browser leftovers (Playwright profiles, Chromium shared memory, crash files) go first
  const noteSpace = async (): Promise<void> => {
    if (isServerlessEnv(env)) removeBrowserLeftovers(tmpdir(), options.log);
    const free = await freeBytes();
    if (free === null) return;
    let total = '';
    try {
      const stats = await statfs(paths.workerDir);
      total = ` of ${Math.round((Number(stats.blocks) * Number(stats.bsize)) / 1_048_576)} MB`;
    } catch {
      // the total is informational
    }
    options.log?.(`work volume: ${Math.round(free / 1_048_576)} MB free${total}`);
    if (isServerlessEnv(env)) options.log?.(`temp directory: ${describeDirectory(tmpdir())}`);
  };
  const submit = async (kind: JobKind, input: unknown): Promise<PublicJob> => {
    await noteSpace();
    return publicJob(queue.submit(kind, input, (i: unknown, ctx) => runners[kind](i, ctx)));
  };
  return {
    mode: 'local',
    exec: execMode(env),
    submit,
    job: async (id) => {
      const record = queue.get(id);
      return record ? publicJob(record) : null;
    },
    wait: async (id, timeoutMs) => publicJob(await queue.wait(id, timeoutMs)),
    runJob: async (kind, input, timeoutMs) => {
      await noteSpace();
      return publicJob(
        await queue.run(kind, input, (i: unknown, ctx) => runners[kind](i, ctx), timeoutMs),
      );
    },
    readJobFile: async (id, relativePath) => {
      const record = queue.get(id);
      if (!record) throw new RangeError(`no job ${id}`);
      const file = jobFilePath(record.dir, relativePath);
      if (!existsSync(file)) throw new RangeError(`job ${id} wrote no ${relativePath}`);
      return new Uint8Array(await readFile(file));
    },
    pruneJob: async (id, pruneOptions = {}) => {
      const record = queue.get(id);
      if (!record) return;
      if (pruneOptions.keepFiles)
        await rm(join(record.dir, 'export', 'work'), { recursive: true, force: true });
      else await rm(record.dir, { recursive: true, force: true });
    },
    freeBytes,
    list: async (kind) => queue.list(kind).map(publicJob),
    health: async () => ({
      ok: true,
      mode: 'local',
      exec: execMode(env),
      queue: queue.stats(),
      decksDir: paths.decksDir,
      workerDir: paths.workerDir,
    }),
    renderSlide: async (request) => {
      const done = await queue.run(
        'render',
        {
          deckId: request.deckId,
          slideIds: [request.slideId],
          themes: [request.theme],
          scale: request.scale,
        },
        (i: unknown, ctx) => runners.render(i, ctx),
        300_000,
      );
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
  const submit = (kind: JobKind, input: unknown): Promise<PublicJob> =>
    getJson<PublicJob>('/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, ...(input as Record<string, unknown>) }),
    });
  const wait = (id: string, timeoutMs = 600_000): Promise<PublicJob> =>
    getJson<PublicJob>(`/jobs/${encodeURIComponent(id)}/wait?timeout=${timeoutMs}`);
  return {
    mode: 'http',
    exec: 'remote',
    url: base,
    submit,
    job: async (id) => {
      const response = await fetch(`${base}/jobs/${encodeURIComponent(id)}`, {
        headers: headers(),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`worker /jobs/${id}: ${response.status}`);
      return (await response.json()) as PublicJob;
    },
    wait,
    runJob: async (kind, input, timeoutMs) => wait((await submit(kind, input)).id, timeoutMs),
    readJobFile: async (id, relativePath) => {
      const path = `/jobs/${encodeURIComponent(id)}/files/${relativePath
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`;
      const response = await fetch(`${base}${path}`, { headers: headers() });
      if (response.status === 404) throw new RangeError(`job ${id} wrote no ${relativePath}`);
      if (!response.ok) throw new Error(`worker ${path}: ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
    list: (kind) => getJson<PublicJob[]>(`/jobs${kind ? `?kind=${kind}` : ''}`),
    pruneJob: async () => undefined,
    freeBytes: async () => null,
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
