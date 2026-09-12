// The worker's HTTP surface (SPEC 3.3 item 7, 11 Security): the studio facade enqueues jobs and
// polls them here; nothing else reaches the worker. Routes:
//
//   GET  /healthz                         versions, tools, queue stats
//   POST /jobs                            { kind, ...input } -> 202 with the job record
//   GET  /jobs[?kind=]                    recent records
//   GET  /jobs/:id[/wait?timeout=ms]      one record, optionally after it finishes
//   GET  /jobs/:id/files/<path>           a file the job wrote (confined to the job directory)
//   GET  /cache/<path>                    a cached render (confined to the cache directory)
//   GET  /render/:deckId/:slideId?theme=&scale=&format=png|jpg|json
//                                         one slide: the PNG (or a JPEG at quality 92) with
//                                         X-Turboslide-Record, or JSON
//
// TURBOSLIDE_WORKER_TOKEN, when set, is required as a bearer token on every route but /healthz.
// Bodies are capped at 1 MB. The container has no credentials and reads only the decks directory
// and its own work directory (SPEC 11).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { extname, normalize, relative, resolve, sep } from 'node:path';

import type { RenderRecord } from '@turboslide/schema/render';
import { toolVersions } from '@turboslide/export/verify/libreoffice';

import { exportJobInput, runExportJob } from './jobs/export.ts';
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
  };
}

export type WorkerServerOptions = {
  queue: Queue;
  paths: WorkerPaths;
  token?: string;
  runners?: Partial<Runners>;
  version?: string;
  log?: (line: string) => void;
};

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
  const runners: Runners = { ...defaultRunners(options.paths), ...options.runners };
  const log = options.log ?? (() => {});
  const versions = toolVersions().catch(() => ({ soffice: null, pdftoppm: null }));

  const authorize = (req: IncomingMessage): void => {
    if (!options.token) return;
    const header = req.headers.authorization ?? '';
    if (header !== `Bearer ${options.token}`) throw new HttpError(401, 'bearer token required');
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
    authorize(req);
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
