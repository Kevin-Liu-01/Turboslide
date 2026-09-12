import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import { crc32 } from 'node:zlib';

import { createWorkerClient } from '@turboslide/render-worker/client';
import type { PublicJob, WorkerClient } from '@turboslide/render-worker/client';
import type { ExportJobResult, VerifyOutcome } from '@turboslide/render-worker/jobs/export';
import type { ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import type { BlobClient } from '@turboslide/store/blob-store';

import { ensureDeckAssets, exportBlobClient, workerClientOptions } from './root';

/**
 * The synchronous export (docs/hosting-chromium.md): one call runs the export job to completion
 * on the worker client, reads the produced files back and returns their bytes with the
 * ExportReport, so a serverless invocation of POST /api/export/:deckId?sync=1 answers the PPTX
 * (or the PDF of gslides-parity SPEC 7.6, one file per run) itself instead of a job to poll. The worker runs in this process there (cli.ts execMode
 * `inprocess`, a recorded deviation from SPEC 3.3 item 7) or over HTTP when TURBOSLIDE_WORKER_URL
 * is set, in which case the files come from the worker's files route. Two themes produce two files
 * and travel as one stored zip (the PPTX parts are deflated already, SPEC 8.2 post-process). The
 * verify loop ran only where LibreOffice answered; the job result says which, and the report's
 * residual carries the line. On the blob backend the produced files are also stored under
 * `exports/<deckId>/<jobId>/` (storeExportFiles), so a file has a URL that outlives the function
 * invocation that made it; on the tmp backend the URL names this instance's job folder and the
 * editor falls back to a second sync export when another instance answers. No createServerFn here:
 * the route is the adapter.
 */

export type SyncExportInput = {
  format: 'pptx' | 'pdf';
  mode?: 'native' | 'flatten';
  theme?: ('light' | 'dark')[];
  fonts?: 'exact' | 'standard';
  headings?: 'raster';
  rasterScale?: 'auto' | 2 | 3;
  pictureScale?: 2 | 3;
  excludeShareAlike?: boolean;
  baseline?: 'libreoffice' | 'none';
  verify?: boolean;
  embedFonts?: boolean;
  slideIds?: 'all' | string[];
  /** Carry the skipped slides too (gslides-parity SPEC 7.2.1). */
  includeSkipped?: boolean;
  /** Carry the speaker notes (gslides-parity SPEC 7.2.13). */
  includeNotes?: boolean;
};

export type SyncExportFile = {
  /** The base name, as the report lists it. */
  name: string;
  bytes: number;
  sha256: string;
  contentType: string;
  data: Uint8Array<ArrayBuffer>;
  /** Where the file can be fetched again: the Blob URL when stored, else this instance's job file. */
  url?: string;
  /** true when `url` is a stored copy that any instance can serve. */
  stored?: boolean;
};

export type SyncExportResult = {
  jobId: string;
  deckId: string;
  report: ExportReport;
  files: SyncExportFile[];
  verify: VerifyOutcome;
  verifyNote?: string;
  worker: 'local' | 'http';
  exec: string;
  /** The renderer string the export recorded (the `renderer:` residual line), or null. */
  renderer: string | null;
  ms: number;
  /** The job's log lines, for the JSON variant. */
  log: string[];
};

/** The response body cap of a Vercel function (docs/hosting-diagnosis.md section 4). */
export const VERCEL_BODY_CAP = Math.floor(4.5 * 1024 * 1024);

/** Default 13 minutes: under the Pro maximum duration of 800 s with room for the answer. */
export const SYNC_EXPORT_TIMEOUT_MS = 780_000;

const TYPES: Record<string, string> = {
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.png': 'image/png',
};

export function contentTypeOf(name: string): string {
  return TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream';
}

let shared: WorkerClient | undefined;

function defaultClient(): WorkerClient {
  shared ??= createWorkerClient(workerClientOptions());
  return shared;
}

/** The pathname a produced file is stored under on the blob backend. */
export function storedExportPath(deckId: string, jobId: string, name: string): string {
  return `exports/${deckId}/${jobId}/${name}`;
}

/** The route that serves a produced file from the instance that made it (the tmp backend). */
export function jobFileUrl(deckId: string, jobId: string, name: string): string {
  return `/api/export/${deckId}?job=${encodeURIComponent(jobId)}&file=${encodeURIComponent(name)}`;
}

/**
 * Gives every file a URL: on the blob backend the stored copy (uploaded here, overwrite allowed
 * because a job id is unique), otherwise this instance's job file route.
 */
export async function storeExportFiles(
  result: SyncExportResult,
  client: BlobClient | null = null,
): Promise<SyncExportResult> {
  const files: SyncExportFile[] = [];
  for (const file of result.files) {
    if (client === null) {
      files.push({
        ...file,
        url: jobFileUrl(result.deckId, result.jobId, file.name),
        stored: false,
      });
      continue;
    }
    const entry = await client.put(
      storedExportPath(result.deckId, result.jobId, file.name),
      file.data,
      {
        overwrite: true,
        contentType: file.contentType,
      },
    );
    files.push({ ...file, url: entry.url, stored: true });
  }
  return { ...result, files };
}

export type SyncExportOptions = {
  client?: WorkerClient;
  timeoutMs?: number;
  /** false leaves the files without URLs (tests) */
  store?: boolean;
  /** the Blob client for the stored copies; the backend's when omitted, null for none */
  blob?: BlobClient | null;
};

/** The `renderer: ...` residual line the exporter writes, without its prefix. */
export function rendererOf(report: ExportReport): string | null {
  const line = report.residual.find((entry) => entry.startsWith('renderer: '));
  return line ? line.slice('renderer: '.length) : null;
}

/**
 * Runs export.run to completion and returns the files. Throws a RangeError when the deck is
 * missing (the job's message), an Error with the job's message and its job id when the export
 * failed: the message is the CLI's cause line (render-worker jobs/export.ts), and the job record,
 * `GET /api/export/<deckId>?job=<id>` on the instance that ran it, has the whole log.
 */
export async function runSyncExport(
  deckId: string,
  input: SyncExportInput,
  options: SyncExportOptions = {},
): Promise<SyncExportResult> {
  await ensureDeckAssets(deckId);
  const client = options.client ?? defaultClient();
  const t = performance.now();
  const job: PublicJob = await client.runJob(
    'export',
    { deckId, ...input },
    options.timeoutMs ?? SYNC_EXPORT_TIMEOUT_MS,
  );
  if (job.status !== 'done') {
    const message = job.error?.message ?? 'the export job failed';
    if (/^no deck |^deckId must be/.test(message)) throw new RangeError(message);
    throw new Error(
      `${message} (job ${job.id}; its log is GET /api/export/${deckId}?job=${job.id} on the instance that ran it)`,
    );
  }
  const result = job.result as Partial<ExportJobResult> | undefined;
  const parsed = exportReportSchema.safeParse(result?.report);
  if (!parsed.success) throw new Error('the export job finished without an export report');
  const report = parsed.data;
  const files: SyncExportFile[] = [];
  for (const entry of report.files) {
    const name = basename(entry.path);
    // the job writes under <job dir>/export; the report's paths are absolute in the worker's tree
    const data = await client.readJobFile(job.id, `export/${name}`);
    files.push({
      name,
      bytes: data.byteLength,
      sha256: createHash('sha256').update(data).digest('hex'),
      contentType: contentTypeOf(name),
      data,
    });
  }
  const produced: SyncExportResult = {
    jobId: job.id,
    deckId,
    report,
    files,
    verify: result?.verify ?? (input.verify ? 'ran' : 'not-requested'),
    ...(result?.verifyNote ? { verifyNote: result.verifyNote } : {}),
    worker: client.mode,
    exec: client.exec,
    renderer: rendererOf(report),
    ms: Math.round(performance.now() - t),
    log: job.log,
  };
  if (options.store === false) return produced;
  const stored = await storeExportFiles(
    produced,
    options.blob === undefined ? await exportBlobClient() : options.blob,
  );
  // the bytes are in memory (and in the store, when there is one): free the job's disk, which a
  // function shares with the browser and the next export (measured: the second export on one
  // instance failed every file:// navigation once /tmp filled)
  await client.pruneJob(job.id, {
    keepFiles: !stored.files.every((file) => file.stored === true),
  });
  return stored;
}

export type ZipEntry = { name: string; data: Uint8Array };

/** MS-DOS date and time fields of a fixed instant, so two runs of one export zip byte for byte. */
const ZIP_STAMP = { date: ((2026 - 1980) << 9) | (1 << 5) | 1, time: 0 } as const;

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/**
 * A zip with every entry stored (method 0): PPTX files are zips themselves with their media
 * stored and their XML deflated, so a second deflate would cost time and save nothing. Names are
 * flagged UTF-8. Written by hand over node:zlib's crc32 because the studio has no zip dependency
 * and the format for stored entries is thirty bytes of local header, forty six of central
 * directory entry and twenty two of end record.
 */
export function zipStored(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50);
    u16(lv, 4, 20);
    u16(lv, 6, 0x0800);
    u16(lv, 8, 0);
    u16(lv, 10, ZIP_STAMP.time);
    u16(lv, 12, ZIP_STAMP.date);
    u32(lv, 14, crc);
    u32(lv, 18, entry.data.byteLength);
    u32(lv, 22, entry.data.byteLength);
    u16(lv, 26, name.length);
    u16(lv, 28, 0);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50);
    u16(cv, 4, 20);
    u16(cv, 6, 20);
    u16(cv, 8, 0x0800);
    u16(cv, 10, 0);
    u16(cv, 12, ZIP_STAMP.time);
    u16(cv, 14, ZIP_STAMP.date);
    u32(cv, 16, crc);
    u32(cv, 20, entry.data.byteLength);
    u32(cv, 24, entry.data.byteLength);
    u16(cv, 28, name.length);
    u16(cv, 30, 0);
    u16(cv, 32, 0);
    u16(cv, 34, 0);
    u16(cv, 36, 0);
    u32(cv, 38, 0);
    u32(cv, 42, offset);
    central.set(name, 46);
    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + entry.data.byteLength;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50);
  u16(ev, 4, 0);
  u16(ev, 6, 0);
  u16(ev, 8, entries.length);
  u16(ev, 10, entries.length);
  u32(ev, 12, centralSize);
  u32(ev, 16, offset);
  u16(ev, 20, 0);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export type SyncAttachment = { name: string; contentType: string; data: Uint8Array<ArrayBuffer> };

/** One file as itself; several as one stored zip named for the deck, the revision and the mode. */
export function attachmentOf(result: SyncExportResult): SyncAttachment {
  const [first] = result.files;
  if (!first) throw new Error('the export produced no file');
  if (result.files.length === 1)
    return { name: first.name, contentType: first.contentType, data: first.data };
  const name = `${result.deckId}-r${result.report.revision}-${result.report.mode}.zip`;
  return {
    name,
    contentType: contentTypeOf(name),
    data: zipStored(result.files.map((file) => ({ name: file.name, data: file.data }))),
  };
}

export type ExportSummary = {
  job: string;
  deckId: string;
  revision: number;
  format: ExportReport['format'];
  mode: ExportReport['mode'];
  themes: ('light' | 'dark')[];
  pages: number;
  passed: boolean;
  geometryInBounds: boolean;
  fontsEmbedded: number;
  files: { name: string; bytes: number; sha256: string }[];
  verify: VerifyOutcome;
  renderer: string | null;
  worker: string;
  exec: string;
  ms: number;
  /** true when every file has a stored copy any instance can serve */
  stored: boolean;
};

/** The report's facts a header can carry: everything but the per-slide entries, which the JSON variant serves. */
export function exportSummary(result: SyncExportResult): ExportSummary {
  const themes = [...new Set(result.report.slides.map((s) => s.theme ?? result.report.theme))];
  return {
    job: result.jobId,
    deckId: result.deckId,
    revision: result.report.revision,
    format: result.report.format,
    mode: result.report.mode,
    themes,
    pages: result.report.slides.length,
    passed: result.report.passed,
    geometryInBounds: result.report.geometryInBounds,
    fontsEmbedded: result.report.fonts.embedded.length,
    files: result.files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
    verify: result.verify,
    renderer: result.renderer,
    worker: result.worker,
    exec: result.exec,
    ms: result.ms,
    stored: result.files.length > 0 && result.files.every((file) => file.stored === true),
  };
}

/** A header value: one line of JSON, ASCII only (a header field takes no other bytes). */
export function headerJson(value: unknown): string {
  return JSON.stringify(value).replace(/[^\x20-\x7e]/g, '?');
}

/** `attachment; filename="..."` with the quote and control characters removed from the name. */
export function contentDisposition(name: string): string {
  return `attachment; filename="${name.replace(/["\\\r\n]/g, '')}"`;
}

/** The names of the files a report lists, without directories. */
export function fileNames(report: ExportReport): string[] {
  return report.files.map((file) => basename(file.path));
}

/** The two facts a caller sees when a body cannot leave a function: the cap and the size. */
export function overBodyCap(bytes: number, cap: number = VERCEL_BODY_CAP): boolean {
  return bytes > cap;
}

/** The result without the bytes, for the JSON variant. */
export function jsonBody(result: SyncExportResult): {
  sync: true;
  summary: ExportSummary;
  report: ExportReport;
  files: {
    name: string;
    bytes: number;
    sha256: string;
    contentType: string;
    url: string | null;
    stored: boolean;
  }[];
  verify: VerifyOutcome;
  verifyNote: string | null;
  log: string[];
} {
  return {
    sync: true,
    summary: exportSummary(result),
    report: result.report,
    files: result.files.map(({ name, bytes, sha256, contentType, url, stored }) => ({
      name,
      bytes,
      sha256,
      contentType,
      url: url ?? null,
      stored: stored === true,
    })),
    verify: result.verify,
    verifyNote: result.verifyNote ?? null,
    log: result.log,
  };
}
