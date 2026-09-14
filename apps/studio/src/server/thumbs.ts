import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { waitUntil } from '@vercel/functions';

import type { RgbaImage } from '@turboslide/effects/image';
import { decodeImage, encodePngRgba } from '@turboslide/effects/io';
import { createWorkerClient } from '@turboslide/render-worker/client';
import type { WorkerClient } from '@turboslide/render-worker/client';
import type { RenderJobResult } from '@turboslide/render-worker/jobs/render';
import type { Slide } from '@turboslide/schema/deck';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { canonicalJson } from '@turboslide/schema/json';
import type { RenderRecord, Theme } from '@turboslide/schema/render';
import type { BlobClient } from '@turboslide/store/blob-store';
import {
  THUMB_KEEP,
  pruneThumbs,
  storedThumbs,
  thumbPathname,
  thumbsPrefix,
} from '@turboslide/store/blob-store';

import {
  ensureDeckAssets,
  exportBlobClient,
  isUnsavedDraft,
  openDeckStore,
  stateDir,
  workerClientOptions,
} from './root';

/**
 * Static thumbnails for the grid, the home cards and the viewer's sidebar (SPEC 5.5, 6.2;
 * MILESTONES M3 item 5). A thumbnail is the render worker's 1x screenshot of a slide
 * (`/api/render/:slideId`, the facade of M2), downsized here by area averaging to one of three
 * widths and named by a stamp: the slide's own content stamp (`slideStamp`, FNV-1a over its
 * canonical JSON, the stamp the editor computes for the same slide) or the name the URL carries as
 * `r` (the deck revision on the home cards). The editor's filmstrip asks for none of this since
 * round four: its cards are live clones (gslides-parity SPEC-4 0.30).
 *
 * Two caches (SPEC-4 0.31, 3.2):
 *
 * 1. This instance's disk, `<state>/thumbs/<deckId>/<stamp>/<theme>@<width>/<slideId>.png` (the
 *    state folder is `.turboslide/` under the repository root in a checkout and under the overlay
 *    when hosted, the one writable place in a function), so a repeated request on one instance is
 *    a file read.
 * 2. The Blob store, `decks/<deckId>/.thumbs/<stamp>/<theme>@<width>/<slideId>.png` on the `blob`
 *    tier, put with a year of `cacheControlMaxAge` because a stamp names its pixels, shared by
 *    every instance: one render per stamp across the deployment instead of one per instance. A
 *    request that names a stamp (`r`) and finds the object answers a 302 to its URL on a public
 *    store and streams the body on a private one; a request without `r` answers the newest stored
 *    thumbnail of the slide at once with `s-maxage=60, stale-while-revalidate=86400` and, when
 *    that stamp is not the slide's current one, renders the current one after the response
 *    (`afterResponse`, Vercel's `waitUntil`). Retention keeps the newest THUMB_KEEP stamps per
 *    slide and theme, pruned after each put in the same `waitUntil`.
 *
 * `warmThumbs` renders every missing slide of a theme in one job, so the first grid does not queue
 * 85 single slide Chromium runs; the editor reaches it through the server function in warm.ts for
 * the grid's first tiles and the home card after its first saved write. The deck's slides come
 * from its store, so a hosted instance syncs the deck before it decides a cache hit. Headless
 * Chromium never runs in this process (SPEC 3.3 item 7): the worker client drives the CLI as a
 * child process or reaches the worker over HTTP, with the hosted decks folder and work folder when
 * there is one (root.ts workerPaths). sharp is reached through `@turboslide/effects/io`, which the
 * Vite configs externalize (AGENTS.md, M2 decision 13).
 */

export const THUMB_WIDTHS = [160, 320, 640] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];
/** 320 px is 0.2x: crisp for the 64 px sidebar mini at any pixel ratio and for a 272 px grid tile at 1x. */
export const DEFAULT_THUMB_WIDTH: ThumbWidth = 320;

/** The sheet's aspect, so a thumbnail is width by width times 9/16 (SPEC 2.1). */
const SHEET = { width: 1600, height: 900 } as const;

/** A stamp the URL may carry: the editor's eight hex digits, a revision, or a short opaque name. */
const STAMP_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** The cache rule of an answer whose URL names its stamp (`r`): the pixels never change under that name. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** The cache rule of an answer without a stamp: fresh for a minute at the CDN, served stale for a day while the current one renders (SPEC-4 0.31). */
export const REVALIDATE_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=86400';

export function isThumbWidth(value: number): value is ThumbWidth {
  return (THUMB_WIDTHS as readonly number[]).includes(value);
}

/** True for a value the URL's `r` may carry as a stamp. */
export function isThumbStamp(value: string | null | undefined): value is string {
  return typeof value === 'string' && STAMP_PATTERN.test(value);
}

/** The nearest allowed width for a requested one, so a `?w=300` still hits a cache bucket. */
export function nearestThumbWidth(value: number | null | undefined): ThumbWidth {
  if (value === null || value === undefined || !Number.isFinite(value)) return DEFAULT_THUMB_WIDTH;
  return THUMB_WIDTHS.reduce((best, w) =>
    Math.abs(w - value) < Math.abs(best - value) ? w : best,
  );
}

/**
 * A stamp of the slide's content: FNV-1a over its canonical JSON as eight hex digits, the same
 * arithmetic as the editor's `slideStamp` (apps/studio/src/editor/controller.tsx), so the name a
 * page asks for and the name the server stores agree (M3 item 5; SPEC-4 0.31).
 */
export function slideStamp(slide: Slide): string {
  const text = canonicalJson(slide);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export type ThumbRequest = {
  deckId: string;
  slideId: string;
  theme: Theme;
  width: ThumbWidth;
  /** the stamp the URL carries as `r`; null when it carries none */
  r?: string | null;
};

export type ThumbResult = {
  /** `bytes` carries the PNG; `stored` names the Blob URL the route redirects to */
  kind: 'bytes' | 'stored';
  /** the PNG bytes, on their own ArrayBuffer so they can be a Response body */
  png?: Uint8Array<ArrayBuffer>;
  /** the Blob URL of a stored answer */
  url?: string;
  /** the stamp the answer is stored under */
  stamp: string;
  /** the slide's current stamp */
  current: string;
  revision: number;
  /** true when the answer was already in a cache (the disk or the store) */
  cached: boolean;
  source: 'disk' | 'blob' | 'render';
  /** false when an answer without `r` is an older stamp and the current one renders after the response */
  fresh: boolean;
  /** the render record the capture came from; absent on a cache hit */
  record?: RenderRecord;
};

let client: WorkerClient | undefined;

function worker(): WorkerClient {
  client ??= createWorkerClient(workerClientOptions());
  return client;
}

function assertSlug(name: string, value: string): void {
  if (!SLUG_PATTERN.test(value)) throw new RangeError(`${name} must be a slug`);
}

type DeckFacts = { revision: number; order: string[]; slides: Record<string, Slide> };

/** The deck's revision, slide order and slides from its store (SPEC 4.2); RangeError when the deck is missing. */
async function deckFacts(deckId: string): Promise<DeckFacts> {
  assertSlug('deckId', deckId);
  const { document } = await (await openDeckStore(deckId)).read();
  return {
    revision: document.deck.revision,
    order: document.deck.sections.flatMap((section) => section.slideIds),
    slides: document.slides,
  };
}

/** The deck's revision (SPEC 4.2); RangeError when the deck is missing. */
export async function deckRevision(deckId: string): Promise<number> {
  return (await deckFacts(deckId)).revision;
}

/** `<state>/thumbs/<deckId>/<stamp>/<theme>@<width>` under the state folder. */
export function thumbsDir(deckId: string, stamp: string, theme: Theme, width: ThumbWidth): string {
  return join(stateDir(), 'thumbs', deckId, stamp, `${theme}@${width}`);
}

export function thumbPath(
  deckId: string,
  stamp: string,
  theme: Theme,
  width: ThumbWidth,
  slideId: string,
): string {
  return join(thumbsDir(deckId, stamp, theme, width), `${slideId}.png`);
}

/**
 * The URL the client asks: the facade route with `w`, plus the revision as `r` so the browser
 * cache turns over with the document and a thumbnail of the last revision is never shown for
 * the current one, and the page's thumbnail grant as `s` (gslides-parity SPEC-3 8.13; report 04
 * F6: the route verifies it in enforce mode; server/render.ts `thumbGrant` hands the page one).
 */
export function thumbUrl(
  deckId: string,
  slideId: string,
  theme: Theme,
  width: ThumbWidth,
  revision: number,
  grant?: string,
): string {
  const signed = grant !== undefined && grant !== '' ? `&s=${encodeURIComponent(grant)}` : '';
  return `/api/render/${encodeURIComponent(slideId)}?deck=${encodeURIComponent(deckId)}&theme=${theme}&w=${width}&r=${revision}${signed}`;
}

/** Both twins' URLs, the `shot` a ShellItem or a Thumb takes. */
export function thumbShot(
  deckId: string,
  slideId: string,
  revision: number,
  width: ThumbWidth = DEFAULT_THUMB_WIDTH,
  grant?: string,
): { light: string; dark: string } {
  return {
    light: thumbUrl(deckId, slideId, 'light', width, revision, grant),
    dark: thumbUrl(deckId, slideId, 'dark', width, revision, grant),
  };
}

/**
 * Area-averaging downsample of an RGBA image to a width, keeping the aspect: every destination
 * pixel is the mean of the source box it covers, with fractional coverage at the box edges, so
 * 1600 to 640 (2.5 source pixels per destination pixel) is as exact as 1600 to 320 (5).
 */
export function downsample(image: RgbaImage, width: number): RgbaImage {
  const height = Math.max(1, Math.round((image.height * width) / image.width));
  if (width >= image.width) return image;
  const sx = image.width / width;
  const sy = image.height / height;
  const out = new Uint8Array(width * height * 4);
  const src = image.data;
  for (let dy = 0; dy < height; dy += 1) {
    const y0 = dy * sy;
    const y1 = Math.min(image.height, (dy + 1) * sy);
    const yStart = Math.floor(y0);
    const yEnd = Math.ceil(y1);
    for (let dx = 0; dx < width; dx += 1) {
      const x0 = dx * sx;
      const x1 = Math.min(image.width, (dx + 1) * sx);
      const xStart = Math.floor(x0);
      const xEnd = Math.ceil(x1);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      for (let y = yStart; y < yEnd; y += 1) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = xStart; x < xEnd; x += 1) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (y * image.width + x) * 4;
          r += (src[i] ?? 0) * w;
          g += (src[i + 1] ?? 0) * w;
          b += (src[i + 2] ?? 0) * w;
          a += (src[i + 3] ?? 255) * w;
          weight += w;
        }
      }
      const o = (dy * width + dx) * 4;
      if (weight > 0) {
        out[o] = Math.round(r / weight);
        out[o + 1] = Math.round(g / weight);
        out[o + 2] = Math.round(b / weight);
        out[o + 3] = Math.round(a / weight);
      }
    }
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------------------------------------
// The two caches

/** Runs `work` after the response: inside Vercel's `waitUntil` when a request context exists, as a detached promise otherwise (a checkout). */
export function afterResponse(work: Promise<unknown>, label: string): void {
  const settled = work.catch((error: unknown) => {
    console.error(
      `turboslide thumbs: ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  try {
    waitUntil(settled);
  } catch {
    // no request context (the dev server, a test): the promise runs on its own
  }
}

/**
 * The store's access as the route must read it: `private` when `TURBOSLIDE_BLOB_ACCESS` says so or
 * the documents store of layout v2 is configured (`TURBOSLIDE_BLOB_PRIVATE_TOKEN`; the split client
 * of packages/store/src/migrate.ts routes `.thumbs/` with the documents, so its URLs are not
 * public), `public` otherwise. The names are blob-vercel.ts's; that module stays out of this
 * file's graph because the client transform of warm.ts keeps this file's imports.
 */
export function thumbStoreAccess(
  env: Record<string, string | undefined> = process.env,
): 'public' | 'private' {
  if (env.TURBOSLIDE_BLOB_ACCESS === 'private') return 'private';
  const documents = env.TURBOSLIDE_BLOB_PRIVATE_TOKEN;
  if (documents !== undefined && documents !== '') return 'private';
  return 'public';
}

/** A year: the stamp names the pixels, so the stored body never changes under its name (SPEC-4 0.31). */
export const THUMB_BLOB_MAX_AGE_S = 31_536_000;

async function writeThumb(
  png: Uint8Array,
  path: string,
  width: ThumbWidth,
): Promise<Uint8Array<ArrayBuffer>> {
  const image = await decodeImage(png);
  const small = downsample(image, width);
  const bytes = new Uint8Array(await encodePngRgba(small));
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, bytes);
  return bytes;
}

/** Puts a thumbnail to the store under its stamp and prunes the slide's older stamps after it. */
async function storeThumb(
  blob: BlobClient,
  request: ThumbRequest,
  stamp: string,
  bytes: Uint8Array,
): Promise<void> {
  await blob.put(
    thumbPathname(request.deckId, stamp, request.theme, request.width, request.slideId),
    bytes,
    {
      overwrite: true,
      contentType: 'image/png',
      cacheControlMaxAge: THUMB_BLOB_MAX_AGE_S,
    },
  );
  await pruneThumbs(blob, request.deckId, request.slideId, request.theme, THUMB_KEEP);
}

/** Renders the slide at the deck's current state, writes the disk cache under `stamp` and, with a store, puts it there. */
async function renderThumb(
  request: ThumbRequest,
  stamp: string,
  blob: BlobClient | null,
): Promise<{ png: Uint8Array<ArrayBuffer>; record: RenderRecord }> {
  await ensureDeckAssets(request.deckId);
  const rendered = await worker().renderSlide({
    deckId: request.deckId,
    slideId: request.slideId,
    theme: request.theme,
    scale: 1,
  });
  const path = thumbPath(request.deckId, stamp, request.theme, request.width, request.slideId);
  const png = await writeThumb(rendered.png, path, request.width);
  if (blob !== null) {
    // the put is what other instances read; it is awaited so a 302 issued next answers, the
    // prune is retention and runs behind the response
    await blob.put(
      thumbPathname(request.deckId, stamp, request.theme, request.width, request.slideId),
      png,
      { overwrite: true, contentType: 'image/png', cacheControlMaxAge: THUMB_BLOB_MAX_AGE_S },
    );
    afterResponse(
      pruneThumbs(blob, request.deckId, request.slideId, request.theme, THUMB_KEEP),
      `prune ${request.deckId}/${request.slideId}`,
    );
  }
  return { png, record: rendered.record };
}

/**
 * One thumbnail: the disk, the store, else the worker's render downsized and stored (SPEC-4 0.31).
 * `blob` is the store's client when the studio runs on the `blob` tier (root.ts exportBlobClient),
 * null on the file and tmp tiers; `access` decides whether a stored answer is a URL or bytes.
 */
export async function getThumbnail(
  request: ThumbRequest,
  options: { blob?: BlobClient | null; access?: 'public' | 'private' } = {},
): Promise<ThumbResult> {
  assertSlug('deckId', request.deckId);
  assertSlug('slideId', request.slideId);
  // an unsaved draft (gslides-parity SPEC 6.1) has no folder yet: opening its store would create
  // one, and a visit to /new must write nothing; the page keeps its live clone on the 404
  if (await isUnsavedDraft(request.deckId))
    throw new RangeError(`no deck ${request.deckId} until its first write`);
  const facts = await deckFacts(request.deckId);
  const slide = facts.slides[request.slideId];
  if (slide === undefined) throw new RangeError(`no slide ${request.slideId} in ${request.deckId}`);
  const current = slideStamp(slide);
  const named = isThumbStamp(request.r) ? request.r : null;
  const stamp = named ?? current;
  const blob = options.blob === undefined ? await exportBlobClient() : options.blob;
  const access = options.access ?? thumbStoreAccess();
  const { revision } = facts;

  // 1. this instance's disk
  const path = thumbPath(request.deckId, stamp, request.theme, request.width, request.slideId);
  if (existsSync(path)) {
    return {
      kind: 'bytes',
      png: new Uint8Array(readFileSync(path)),
      stamp,
      current,
      revision,
      cached: true,
      source: 'disk',
      fresh: true,
    };
  }

  // 2. the store, under the asked stamp
  if (blob !== null) {
    const pathname = thumbPathname(
      request.deckId,
      stamp,
      request.theme,
      request.width,
      request.slideId,
    );
    const stored = await blob.head(pathname);
    if (stored !== null) {
      if (access === 'public') {
        return {
          kind: 'stored',
          url: stored.url,
          stamp,
          current,
          revision,
          cached: true,
          source: 'blob',
          fresh: true,
        };
      }
      const fetched = await blob.get(pathname);
      if (fetched !== null) {
        const png = new Uint8Array(fetched.bytes);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, png);
        return {
          kind: 'bytes',
          png,
          stamp,
          current,
          revision,
          cached: true,
          source: 'blob',
          fresh: true,
        };
      }
    }
    // 3. no stamp named: the newest stored thumbnail of the slide answers now and the current one
    // renders behind the response when it is not that one (stale while revalidate)
    if (named === null) {
      const newest = storedThumbs(
        await blob.list(thumbsPrefix(request.deckId)),
        request.deckId,
        request.slideId,
        request.theme,
        request.width,
      )[0];
      if (newest !== undefined) {
        afterResponse(
          renderThumb(request, current, blob),
          `refresh ${request.deckId}/${request.slideId}@${request.width}`,
        );
        if (access === 'public') {
          return {
            kind: 'stored',
            url: newest.url,
            stamp: newest.key.stamp,
            current,
            revision,
            cached: true,
            source: 'blob',
            fresh: false,
          };
        }
        const fetched = await blob.get(newest.pathname);
        if (fetched !== null) {
          return {
            kind: 'bytes',
            png: new Uint8Array(fetched.bytes),
            stamp: newest.key.stamp,
            current,
            revision,
            cached: true,
            source: 'blob',
            fresh: false,
          };
        }
      }
    }
  }

  // 4. the render, now
  const rendered = await renderThumb(request, stamp, blob);
  return {
    kind: 'bytes',
    png: rendered.png,
    stamp,
    current,
    revision,
    cached: false,
    source: 'render',
    fresh: true,
    record: rendered.record,
  };
}

/** The cache rule for a request: immutable when its URL names a stamp, stale while revalidate otherwise (SPEC-4 0.31). */
export function thumbCacheControl(options: { revisionInUrl: boolean }): string {
  return options.revisionInUrl ? IMMUTABLE_CACHE_CONTROL : REVALIDATE_CACHE_CONTROL;
}

/** The response headers every thumbnail answer carries, redirect or body. */
export function thumbHeaders(
  result: ThumbResult,
  request: ThumbRequest,
  options: { revisionInUrl: boolean },
): Record<string, string> {
  return {
    'cache-control': thumbCacheControl(options),
    etag: `"${request.deckId}-${result.stamp}-${request.slideId}-${request.theme}-${request.width}"`,
    'x-turboslide-revision': String(result.revision),
    'x-turboslide-stamp': result.stamp,
    'x-turboslide-fresh': result.fresh ? '1' : '0',
    'x-turboslide-thumb': `${request.width}x${Math.round((request.width * SHEET.height) / SHEET.width)}`,
    'x-turboslide-cached': result.cached ? '1' : '0',
    'x-turboslide-source': result.source,
    'x-turboslide-worker': worker().mode,
  };
}

/**
 * The HTTP response for a thumbnail: a 302 to the store's URL for a stored answer on a public
 * store, the PNG body otherwise. A request that named the stamp (`r`) gets an immutable year; one
 * that did not gets a minute at the CDN and a day of stale service while the current one renders.
 */
export function thumbResponse(
  result: ThumbResult,
  request: ThumbRequest,
  options: { revisionInUrl: boolean },
): Response {
  const headers = thumbHeaders(result, request, options);
  if (result.kind === 'stored' && result.url !== undefined) {
    return new Response(null, { status: 302, headers: { ...headers, location: result.url } });
  }
  const png = result.png ?? new Uint8Array(new ArrayBuffer(0));
  return new Response(png, {
    headers: {
      ...headers,
      'content-type': 'image/png',
      'content-length': String(png.byteLength),
    },
  });
}

// ---------------------------------------------------------------------------------------------
// The warm

export type WarmInput = { deckId: string; theme: Theme; width?: ThumbWidth; slideIds?: string[] };

export type WarmResult = {
  revision: number;
  /** slide ids whose thumbnail is in a cache now */
  ready: string[];
  /** slide ids the worker could not render, with the reason */
  failed: { slideId: string; error: string }[];
  /** how many were rendered by this call, against those already cached */
  rendered: number;
  cached: number;
  ms: number;
  /** the editor's warm call answered before the job ran; the captures land through /api/render (warm.ts) */
  queued?: boolean;
};

/**
 * Every missing thumbnail of a theme in one render job (`slideIds` in one CLI run, so Chromium
 * launches once), then downsized from the job's records and stored under each slide's current
 * stamp, on this instance's disk and in the store when there is one. In local mode the records
 * point at files in the worker's cache; over HTTP the worker holds them, so each is fetched
 * through `renderSlide`, a cache hit after the job. Called by the editor for the grid's first
 * tiles on the first entry into grid mode and for the home card after the first saved write.
 */
export async function warmThumbs(
  input: WarmInput,
  options: { blob?: BlobClient | null } = {},
): Promise<WarmResult> {
  const t = performance.now();
  assertSlug('deckId', input.deckId);
  // an unsaved draft (gslides-parity SPEC 6.1) has nothing the worker can read: the page keeps
  // its live clones until the first write creates the deck and the editor warms again
  if (await isUnsavedDraft(input.deckId)) {
    return {
      revision: 0,
      ready: [],
      failed: [],
      rendered: 0,
      cached: 0,
      ms: Math.round(performance.now() - t),
    };
  }
  const width = input.width ?? DEFAULT_THUMB_WIDTH;
  const { revision, order, slides } = await deckFacts(input.deckId);
  const wanted = input.slideIds ? input.slideIds.filter((id) => order.includes(id)) : order;
  const blob = options.blob === undefined ? await exportBlobClient() : options.blob;
  const stampOf = (slideId: string): string | null => {
    const slide = slides[slideId];
    return slide === undefined ? null : slideStamp(slide);
  };
  const ready: string[] = [];
  const failed: WarmResult['failed'] = [];
  const missing: string[] = [];
  for (const slideId of wanted) {
    const stamp = stampOf(slideId);
    if (stamp === null) continue;
    if (existsSync(thumbPath(input.deckId, stamp, input.theme, width, slideId)))
      ready.push(slideId);
    else if (
      blob !== null &&
      (await blob.head(thumbPathname(input.deckId, stamp, input.theme, width, slideId))) !== null
    )
      ready.push(slideId);
    else missing.push(slideId);
  }
  const cached = ready.length;
  if (missing.length > 0) {
    const w = worker();
    const byId = new Map<string, RenderRecord>();
    try {
      await ensureDeckAssets(input.deckId);
      const job = await w.submit('render', {
        deckId: input.deckId,
        slideIds: missing,
        themes: [input.theme],
        scale: 1,
      });
      const done = await w.wait(job.id, 300_000);
      if (done.status !== 'done')
        throw new Error(done.error?.message ?? `render job ${done.id} ${done.status}`);
      const result = done.result as RenderJobResult | undefined;
      for (const record of result?.records ?? []) byId.set(record.slideId, record);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const slideId of missing) failed.push({ slideId, error: message });
      return {
        revision,
        ready,
        failed,
        rendered: 0,
        cached,
        ms: Math.round(performance.now() - t),
      };
    }
    for (const slideId of missing) {
      const stamp = stampOf(slideId);
      if (stamp === null) continue;
      const path = thumbPath(input.deckId, stamp, input.theme, width, slideId);
      try {
        const record = byId.get(slideId);
        let png: Uint8Array | undefined;
        if (record && existsSync(record.image)) png = new Uint8Array(readFileSync(record.image));
        else {
          const rendered = await w.renderSlide({
            deckId: input.deckId,
            slideId,
            theme: input.theme,
            scale: 1,
          });
          png = rendered.png;
        }
        const bytes = await writeThumb(png, path, width);
        if (blob !== null) {
          await storeThumb(
            blob,
            { deckId: input.deckId, slideId, theme: input.theme, width },
            stamp,
            bytes,
          );
        }
        ready.push(slideId);
      } catch (error) {
        failed.push({ slideId, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return {
    revision,
    ready,
    failed,
    rendered: ready.length - cached,
    cached,
    ms: Math.round(performance.now() - t),
  };
}
