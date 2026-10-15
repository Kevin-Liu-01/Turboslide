// The worker's HTTP surface (SPEC 3.3 item 7, 11 Security): the studio facade enqueues jobs and
// polls them here; nothing else reaches the worker. Routes:
//
//   GET  /healthz                         { ok: true } and nothing else (no bearer)
//   GET  /status                          versions, tools, paths, queue stats
//   POST /jobs                            { kind, ...input } -> 202 with the job record
//                                         (kinds: render, sheet, export, verify, measure)
//   GET  /jobs[?kind=]                    recent records
//   GET  /jobs/:id[/wait?timeout=ms]      one record, optionally after it finishes
//   GET  /jobs/:id/files/<path>           a file the job wrote (confined to the job directory)
//   GET  /cache/<path>                    a cached render (confined to the cache directory)
//   GET  /render/:deckId/:slideId?theme=&scale=&format=png|jpg|json
//                                         one slide: the PNG (or a JPEG at quality 92) with
//                                         X-Turboslide-Record, or JSON
//
// TURBOSLIDE_WORKER_TOKEN is required as a bearer token on every route but /healthz, compared in
// constant time (@turboslide/identity/safe-equal, HR-SA#1). The worker refuses to start without
// it unless it is started with `--local`, which serves 127.0.0.1 alone (`workerStart`, hardening
// HR-PS#11a, CRIT-M8); /healthz names no version, so a scan learns nothing of the tools. The
// route inventory is docs/security.md section 19.
// Bodies are capped at 1 MB. The container has no credentials and reads only the decks directory
// and its own work directory (SPEC 11).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { extname, normalize, relative, resolve, sep } from 'node:path';

import { safeEqual } from '@turboslide/identity/safe-equal';
import type { RenderRecord } from '@turboslide/schema/render';
import { toolVersions } from '@turboslide/export/verify/libreoffice';

import { exportJobInput, runExportJob } from './jobs/export.ts';
import { measureJobInput, runMeasureJob } from './jobs/measure.ts';
import { renderJobInput, runRenderJob } from './jobs/render.ts';
import type { RenderJobResult } from './jobs/render.ts';
import { runSheetJob, sheetJobInput } from './jobs/sheet.ts';
import { runVerifyJob, verifyJobInput } from './jobs/verify.ts';
import { isSlug } from './paths.ts';
import type { WorkerPaths } from './paths.ts';
import { isJobKind } from './queue.ts';
import type { JobContext, JobKind, JobRecord, Queue } from './queue.ts';

export type Runner = (input: unknown, ctx: JobContext) => Promise<unknown>;
export type Runners = Record<JobKind, Runner>;

const BODY_LIMIT = 1024 * 1024;

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Each runner validates its input with the job's Zod schema, then runs over the CLI. */
export function defaultRunners(paths: WorkerPaths): Runners {
  return {
    render: (input, ctx) => runRenderJob(renderJobInput.parse(input), ctx, paths),
    sheet: (input, ctx) => runSheetJob(sheetJobInput.parse(input), ctx, paths),
    export: (input, ctx) => runExportJob(exportJobInput.parse(input), ctx, paths),
    verify: (input, ctx) => runVerifyJob(verifyJobInput.parse(input), ctx, paths),
    // the canvas measurement of the hosted studio (gslides-parity SPEC-2 1.3, 0.104)
    measure: (input, ctx) => runMeasureJob(measureJobInput.parse(input), ctx, paths),
  };
}

export type WorkerServerOptions = {
  queue: Queue;
  paths: WorkerPaths;
  /** the bearer every route but /healthz requires; absent only with `local` */
  token?: string;
  /** a checkout's worker on 127.0.0.1 (`--local`): no bearer when no token is given */
  local?: boolean;
  runners?: Partial<Runners>;
  version?: string;
  log?: (line: string) => void;
};

/** The shortest TURBOSLIDE_WORKER_TOKEN the process starts with, as the studio's own secrets. */
export const WORKER_TOKEN_MIN_LENGTH = 32;
/** The flag that starts a checkout's worker on 127.0.0.1 without a token. */
export const LOCAL_FLAG = '--local';
const LOOPBACK = '127.0.0.1';

export type WorkerStart = {
  host: string;
  port: number;
  /** undefined only for a `--local` worker started without one */
  token: string | undefined;
  local: boolean;
};

/**
 * How the worker process starts (hardening HR-PS#11a, CRIT-M8). With TURBOSLIDE_WORKER_TOKEN (at
 * least WORKER_TOKEN_MIN_LENGTH characters) it serves TURBOSLIDE_WORKER_HOST (127.0.0.1 by
 * default; the image sets 0.0.0.0) on TURBOSLIDE_WORKER_PORT (4322). With `--local` it serves
 * 127.0.0.1 whatever the host variable says, with the token when one is set and without a bearer
 * otherwise. Anything else is a TypeError naming the variable: before this a worker started
 * without the token served every job, file and render route to whoever reached its port.
 */
export function workerStart(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): WorkerStart {
  const local = argv.includes(LOCAL_FLAG);
  const port = Number(env.TURBOSLIDE_WORKER_PORT ?? 4322);
  if (!Number.isInteger(port) || port < 0 || port > 65_535)
    throw new TypeError(
      `TURBOSLIDE_WORKER_PORT must be a port number, got ${JSON.stringify(env.TURBOSLIDE_WORKER_PORT)}`,
    );
  const token = env.TURBOSLIDE_WORKER_TOKEN ?? '';
  if (token !== '' && token.length < WORKER_TOKEN_MIN_LENGTH)
    throw new TypeError(
      `TURBOSLIDE_WORKER_TOKEN must be at least ${WORKER_TOKEN_MIN_LENGTH} characters`,
    );
  if (local) return { host: LOOPBACK, port, token: token === '' ? undefined : token, local };
  if (token === '')
    throw new TypeError(
      `The render worker needs TURBOSLIDE_WORKER_TOKEN; start it with ${LOCAL_FLAG} to serve ${LOOPBACK} without one`,
    );
  return { host: env.TURBOSLIDE_WORKER_HOST ?? LOOPBACK, port, token, local };
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > BODY_LIMIT) throw new HttpError(413, `body over ${BODY_LIMIT} bytes`);
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'body is not JSON');
  }
}

/** Serves a file under `base`; a path that escapes the base is a 404. */
function serveFile(
  res: ServerResponse,
  base: string,
  requested: string,
  headers: Record<string, string> = {},
): void {
  const root = resolve(base);
  const file = resolve(root, normalize(requested));
  const rel = relative(root, file);
  if (
    rel.startsWith('..') ||
    rel.includes(`..${sep}`) ||
    !existsSync(file) ||
    !statSync(file).isFile()
  )
    throw new HttpError(404, 'no such file');
  const stat = statSync(file);
  res.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': 'public, max-age=60',
    ...headers,
  });
  createReadStream(file).pipe(res);
}

/** The record as the API returns it: everything but the runner's absolute directory. */
export function publicJob(record: JobRecord): Omit<JobRecord, 'dir'> & { files: string } {
  const { dir: _dir, ...rest } = record;
  return { ...rest, files: `/jobs/${record.id}/files/` };
}

export function createWorkerServer(options: WorkerServerOptions): Server {
  if (!options.token && options.local !== true)
    throw new TypeError(
      `The render worker needs a bearer token unless it serves ${LOOPBACK} alone (${LOCAL_FLAG})`,
    );
  const runners: Runners = { ...defaultRunners(options.paths), ...options.runners };
  const log = options.log ?? (() => {});
  const versions = toolVersions().catch(() => ({ soffice: null, pdftoppm: null }));

  const authorize = (req: IncomingMessage): void => {
    if (!options.token) return;
    const header = req.headers.authorization ?? '';
    if (!safeEqual(header, `Bearer ${options.token}`))
      throw new HttpError(401, 'bearer token required');
  };

  const submit = (kind: string, input: unknown): JobRecord => {
    if (!isJobKind(kind)) throw new HttpError(400, `unknown job kind ${JSON.stringify(kind)}`);
    const runner = runners[kind];
    return options.queue.submit(kind, input, (i: unknown, ctx) => runner(i, ctx));
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://worker');
    const parts = url.pathname.split('/').filter(Boolean);
    const method = req.method ?? 'GET';
    if (parts[0] === 'healthz' && method === 'GET') {
      json(res, 200, { ok: true });
      return;
    }
    authorize(req);
    if (parts[0] === 'status' && method === 'GET') {
      json(res, 200, {
        ok: true,
        name: '@turboslide/render-worker',
        version: options.version ?? '0.0.0',
        node: process.version,
        chrome: options.paths.env.TURBOSLIDE_CHROME ?? null,
        gpu: options.paths.env.TURBOSLIDE_GPU ?? null,
        tools: await versions,
        decksDir: options.paths.decksDir,
        queue: options.queue.stats(),
      });
      return;
    }
    if (parts[0] === 'jobs') {
      if (parts.length === 1 && method === 'POST') {
        const body = await readBody(req);
        if (
          !body ||
          typeof body !== 'object' ||
          typeof (body as { kind?: unknown }).kind !== 'string'
        )
          throw new HttpError(400, 'body wants { kind, ...input }');
        const { kind, ...input } = body as { kind: string } & Record<string, unknown>;
        const record = submit(kind, input);
        log(`queued ${record.kind} ${record.id}`);
        res.setHeader('location', `/jobs/${record.id}`);
        json(res, 202, publicJob(record));
        return;
      }
      if (parts.length === 1 && method === 'GET') {
        const kind = url.searchParams.get('kind') ?? undefined;
        json(
          res,
          200,
          options.queue
            .list(kind && isJobKind(kind) ? kind : undefined)
            .slice(0, 100)
            .map(publicJob),
        );
        return;
      }
      const id = parts[1] ?? '';
      const record = options.queue.get(id);
      if (!record) throw new HttpError(404, `no job ${id}`);
      if (parts.length === 2 && method === 'GET') {
        json(res, 200, publicJob(record));
        return;
      }
      if (parts[2] === 'wait' && method === 'GET') {
        const timeout = Number(url.searchParams.get('timeout') ?? 600_000);
        json(
          res,
          200,
          publicJob(await options.queue.wait(id, Number.isFinite(timeout) ? timeout : 600_000)),
        );
        return;
      }
      if (parts[2] === 'files' && method === 'GET') {
        serveFile(res, record.dir, decodeURIComponent(parts.slice(3).join('/')));
        return;
      }
      throw new HttpError(404, 'not found');
    }
    if (parts[0] === 'cache' && method === 'GET') {
      serveFile(
        res,
        resolve(options.paths.workerDir, 'cache'),
        decodeURIComponent(parts.slice(1).join('/')),
      );
      return;
    }
    if (parts[0] === 'render' && method === 'GET' && parts.length === 3) {
      const [, deckId = '', slideId = ''] = parts;
      if (!isSlug(deckId) || !isSlug(slideId))
        throw new HttpError(400, 'deckId and slideId must be slugs');
      const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
      const scale = url.searchParams.get('scale') === '2' ? 2 : 1;
      const wanted = url.searchParams.get('format');
      const format = wanted === 'json' ? 'json' : wanted === 'jpg' ? 'jpg' : 'png';
      const record = submit('render', {
        deckId,
        slideIds: [slideId],
        themes: [theme],
        scale,
        ...(format === 'jpg' ? { format: 'jpg' } : {}),
      });
      const done = await options.queue.wait(record.id, 300_000);
      if (done.status !== 'done') throw new HttpError(500, done.error?.message ?? 'render failed');
      const result = done.result as RenderJobResult;
      const first = result.records[0];
      if (!first) throw new HttpError(500, 'render returned no record');
      if (format === 'json') {
        json(res, 200, {
          job: done.id,
          record: first,
          imageUrl: `/cache/${relative(resolve(options.paths.workerDir, 'cache'), first.image).split(sep).join('/')}`,
          cached: result.cached > 0,
        });
        return;
      }
      const cache = resolve(options.paths.workerDir, 'cache');
      const rel = relative(cache, first.image);
      const base = rel.startsWith('..') ? done.dir : cache;
      const requested = rel.startsWith('..') ? relative(done.dir, first.image) : rel;
      serveFile(res, base, requested, {
        'x-turboslide-record': JSON.stringify(first as RenderRecord),
        'x-turboslide-job': done.id,
        'x-turboslide-cached': result.cached > 0 ? '1' : '0',
      });
      return;
    }
    throw new HttpError(404, 'not found');
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      const status =
        error instanceof HttpError ? error.status : error instanceof RangeError ? 404 : 500;
      const message = error instanceof Error ? error.message : String(error);
      if (status >= 500) log(`error: ${message}`);
      if (!res.headersSent) json(res, status, { error: { message, status } });
      else res.end();
    });
  });
  return server;
}
