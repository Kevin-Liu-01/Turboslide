import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RgbaImage } from '@turboslide/effects/image';
import { decodeImage, encodePngRgba } from '@turboslide/effects/io';
import { createWorkerClient } from '@turboslide/render-worker/client';
import type { WorkerClient } from '@turboslide/render-worker/client';
import type { RenderJobResult } from '@turboslide/render-worker/jobs/render';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { RenderRecord, Theme } from '@turboslide/schema/render';

import { ensureDeckAssets, openDeckStore, stateDir, workerClientOptions } from './root';

/**
 * Static thumbnails for the grid and the sidebar (SPEC 5.5, 6.2; MILESTONES M3
 * item 5). A thumbnail is the render worker's 1x screenshot of a slide
 * (`/api/render/:slideId`, the facade of M2), downsized here by area
 * averaging to one of three widths and cached under
 * `<state>/thumbs/<deckId>/<revision>/<theme>@<width>/<slideId>.png`, so a
 * repeated request for the same revision is a file read and a new revision
 * misses the cache by construction. The state folder is `.turboslide/` under
 * the repository root in a checkout and under the overlay when hosted
 * (server/root.ts stateDir), the one writable place in a function. The client
 * (`@turboslide/chrome` Thumb) asks for `thumbUrl()` and shows the live clone
 * until the capture decodes.
 *
 * The facade route serves these when its request carries `w`: the route
 * calls `thumbResponse(await getThumbnail(...))` for `?w=320` and keeps its
 * full-size path otherwise. `warmThumbs` renders every missing slide of a
 * theme in one job, so the first grid does not queue 85 single-slide Chromium
 * runs; the editor reaches it through the server function in warm.ts.
 *
 * The deck's revision and slide order come from its store, so a hosted
 * instance syncs the deck before it decides a cache hit. Headless Chromium
 * never runs in this process (SPEC 3.3 item 7): the worker client drives the
 * CLI as a child process or reaches the worker over HTTP, with the hosted
 * decks folder and work folder when there is one (root.ts workerPaths). sharp
 * is reached through `@turboslide/effects/io`, which the Vite configs
 * externalize (AGENTS.md, M2 decision 13).
 */

export const THUMB_WIDTHS = [160, 320, 640] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];
/** 320 px is 0.2x: crisp for the 64 px sidebar mini at any pixel ratio and for a 272 px grid tile at 1x. */
export const DEFAULT_THUMB_WIDTH: ThumbWidth = 320;

/** The sheet's aspect, so a thumbnail is width by width times 9/16 (SPEC 2.1). */
const SHEET = { width: 1600, height: 900 } as const;

export function isThumbWidth(value: number): value is ThumbWidth {
  return (THUMB_WIDTHS as readonly number[]).includes(value);
}

/** The nearest allowed width for a requested one, so a `?w=300` still hits a cache bucket. */
export function nearestThumbWidth(value: number | null | undefined): ThumbWidth {
  if (value === null || value === undefined || !Number.isFinite(value)) return DEFAULT_THUMB_WIDTH;
  return THUMB_WIDTHS.reduce((best, w) =>
    Math.abs(w - value) < Math.abs(best - value) ? w : best,
  );
}

export type ThumbRequest = {
  deckId: string;
  slideId: string;
  theme: Theme;
  width: ThumbWidth;
};

export type ThumbResult = {
  /** the PNG bytes, on their own ArrayBuffer so they can be a Response body */
  png: Uint8Array<ArrayBuffer>;
  revision: number;
  /** true when the file was already in the thumbs cache */
  cached: boolean;
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

type DeckFacts = { revision: number; order: string[] };

/** The deck's revision and slide order from its store (SPEC 4.2); RangeError when the deck is missing. */
async function deckFacts(deckId: string): Promise<DeckFacts> {
  assertSlug('deckId', deckId);
  const { document } = await (await openDeckStore(deckId)).read();
  return {
    revision: document.deck.revision,
    order: document.deck.sections.flatMap((section) => section.slideIds),
  };
}

/** The deck's revision (SPEC 4.2); RangeError when the deck is missing. */
export async function deckRevision(deckId: string): Promise<number> {
  return (await deckFacts(deckId)).revision;
}

/** `<state>/thumbs/<deckId>/<revision>/<theme>@<width>` under the state folder. */
export function thumbsDir(
  deckId: string,
  revision: number,
  theme: Theme,
  width: ThumbWidth,
): string {
  return join(stateDir(), 'thumbs', deckId, String(revision), `${theme}@${width}`);
}

export function thumbPath(
  deckId: string,
  revision: number,
  theme: Theme,
  width: ThumbWidth,
  slideId: string,
): string {
  return join(thumbsDir(deckId, revision, theme, width), `${slideId}.png`);
}

/**
 * The URL the client asks: the facade route with `w`, plus the revision as `r` so the browser
 * cache turns over with the document and a thumbnail of the last revision is never shown for
 * the current one.
 */
export function thumbUrl(
  deckId: string,
  slideId: string,
  theme: Theme,
  width: ThumbWidth,
  revision: number,
): string {
  return `/api/render/${encodeURIComponent(slideId)}?deck=${encodeURIComponent(deckId)}&theme=${theme}&w=${width}&r=${revision}`;
}

/** Both twins' URLs, the `shot` a ShellItem or a Thumb takes. */
export function thumbShot(
  deckId: string,
  slideId: string,
  revision: number,
  width: ThumbWidth = DEFAULT_THUMB_WIDTH,
): { light: string; dark: string } {
  return {
    light: thumbUrl(deckId, slideId, 'light', width, revision),
    dark: thumbUrl(deckId, slideId, 'dark', width, revision),
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

/** One thumbnail: the cache, else the worker's render downsized and stored. */
export async function getThumbnail(request: ThumbRequest): Promise<ThumbResult> {
  assertSlug('deckId', request.deckId);
  assertSlug('slideId', request.slideId);
  const revision = await deckRevision(request.deckId);
  const path = thumbPath(request.deckId, revision, request.theme, request.width, request.slideId);
  if (existsSync(path)) return { png: new Uint8Array(readFileSync(path)), revision, cached: true };
  await ensureDeckAssets(request.deckId);
  const rendered = await worker().renderSlide({
    deckId: request.deckId,
    slideId: request.slideId,
    theme: request.theme,
    scale: 1,
  });
  const png = await writeThumb(rendered.png, path, request.width);
  return { png, revision, cached: false, record: rendered.record };
}

/**
 * The HTTP response for a thumbnail. A request that named the revision (`r`) gets an immutable
 * year; one that did not gets a minute, the same as the full-size facade.
 */
export function thumbResponse(
  result: ThumbResult,
  request: ThumbRequest,
  options: { revisionInUrl: boolean },
): Response {
  const etag = `"${request.deckId}-${result.revision}-${request.slideId}-${request.theme}-${request.width}"`;
  return new Response(result.png, {
    headers: {
      'content-type': 'image/png',
      'content-length': String(result.png.byteLength),
      'cache-control': options.revisionInUrl
        ? 'public, max-age=31536000, immutable'
        : 'private, max-age=60',
      etag,
      'x-turboslide-revision': String(result.revision),
      'x-turboslide-thumb': `${request.width}x${Math.round((request.width * SHEET.height) / SHEET.width)}`,
      'x-turboslide-cached': result.cached ? '1' : '0',
      'x-turboslide-worker': worker().mode,
    },
  });
}

export type WarmInput = { deckId: string; theme: Theme; width?: ThumbWidth; slideIds?: string[] };

export type WarmResult = {
  revision: number;
  /** slide ids whose thumbnail is on disk now */
  ready: string[];
  /** slide ids the worker could not render, with the reason */
  failed: { slideId: string; error: string }[];
  /** how many were rendered by this call, against those already cached */
  rendered: number;
  cached: number;
  ms: number;
};

/**
 * Every missing thumbnail of a theme in one render job (`slideIds` in one CLI run, so Chromium
 * launches once), then downsized from the job's records. In local mode the records point at
 * files in the worker's cache; over HTTP the worker holds them, so each is fetched through
 * `renderSlide`, a cache hit after the job. Called by the editor once per deck open.
 */
export async function warmThumbs(input: WarmInput): Promise<WarmResult> {
  const t = performance.now();
  assertSlug('deckId', input.deckId);
  const width = input.width ?? DEFAULT_THUMB_WIDTH;
  const { revision, order } = await deckFacts(input.deckId);
  const wanted = input.slideIds ? input.slideIds.filter((id) => order.includes(id)) : order;
  const ready: string[] = [];
  const failed: WarmResult['failed'] = [];
  const missing: string[] = [];
  for (const slideId of wanted) {
    if (existsSync(thumbPath(input.deckId, revision, input.theme, width, slideId)))
      ready.push(slideId);
    else missing.push(slideId);
  }
  const cached = ready.length;
  if (missing.length > 0) {
    const w = worker();
    const byId = new Map<string, RenderRecord>();
    try {
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
      const path = thumbPath(input.deckId, revision, input.theme, width, slideId);
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
        await writeThumb(png, path, width);
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
