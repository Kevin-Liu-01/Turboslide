import { createServerFn } from '@tanstack/react-start';
import { createWorkerClient } from '@turboslide/render-worker/client';
import type { WorkerClient } from '@turboslide/render-worker/client';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { RenderRecord, Theme } from '@turboslide/schema/render';

import { parseJsonInput } from './json';
import type { Untrusted } from './json';
import { slideSelection } from './lint';
import { ensureDeckAssets, openDeckStore, workerClientOptions } from './root';

/**
 * The one renderer the studio calls (SPEC 5.2, 5.3): @turboslide/render's
 * renderSlide, so the viewer shows the same HTML the CLI screenshots and the
 * exporters measure. The studio reads the RenderedSlide shape only.
 */
export { renderSlide, slideOrder, slideTitle } from '@turboslide/render/slide';
export type { RenderOptions, RenderedSlide } from '@turboslide/render/slide';
export type { Deck, Slide } from '@turboslide/schema/deck';

/**
 * render.slide for the editor (MILESTONES M3 item 4): the worker facade the /api/render route
 * uses, as a server function the window API's `invoke('render.slide', …)` reaches. The worker
 * runs over HTTP when TURBOSLIDE_WORKER_URL is set and in this process otherwise, driving the
 * turboslide CLI as a child process, so headless Chromium never runs inside the web app (SPEC 3.3
 * item 7). Records come back with `image` rewritten to the /api/render URL the browser can fetch;
 * the worker's cache makes that fetch a hit at the same revision. The deck is opened through the
 * hosted store before anything is read or rendered, so the overlay the worker renders from holds
 * the store's current document and its twins, not what this instance last pulled (the editor
 * depth round; lint.ts says why).
 *
 * Round three (gslides-parity SPEC-3 6.2, 8.3, 8.13): `authorize(read)` first, the renders per
 * hour quota, and `thumbGrant`, the short lived grant the page appends to its thumbnail URLs so
 * the `?w=` variant of the render route can refuse an unsigned request in enforce mode (report 04
 * F6). The grant carries the deck and the caller's role; the width and revision stay in the URL.
 */

let client: WorkerClient | undefined;

function worker(): WorkerClient {
  client ??= createWorkerClient(workerClientOptions());
  return client;
}

export type RenderSlidesInput = {
  deckId: string;
  slideIds: 'all' | string[];
  themes?: Theme[];
  scale?: 1 | 2;
  /** PNG (default) or a JPEG at quality 92 (render.slide `format`, gslides-parity SPEC 7.6). */
  format?: 'png' | 'jpg';
};

export type RenderSlidesResult = { records: RenderRecord[]; images: string[] };

/** The facade URL for one render; the revision names the pixels, so two revisions never share a cache entry. */
function imageUrl(
  deckId: string,
  slideId: string,
  theme: Theme,
  scale: 1 | 2,
  revision: number,
  format: 'png' | 'jpg' = 'png',
): string {
  return `/api/render/${encodeURIComponent(slideId)}?deck=${encodeURIComponent(deckId)}&theme=${theme}&scale=${scale}&revision=${revision}${format === 'jpg' ? '&format=jpg' : ''}`;
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

const renderSlideImagesFn = createServerFn({ method: 'POST' })
  .validator((raw: string): RenderSlidesInput => {
    const input = parseJsonInput<Untrusted<RenderSlidesInput>>(raw);
    if (typeof input.deckId !== 'string' || !SLUG_PATTERN.test(input.deckId)) {
      throw new TypeError('deckId must be a slug');
    }
    const themes: unknown = input.themes ?? ['light', 'dark'];
    if (!Array.isArray(themes) || themes.length === 0 || !themes.every(isTheme)) {
      throw new TypeError('themes must name light, dark or both');
    }
    const scale: unknown = input.scale ?? 1;
    if (scale !== 1 && scale !== 2) throw new TypeError('scale must be 1 or 2');
    const format: unknown = input.format ?? 'png';
    if (format !== 'png' && format !== 'jpg') throw new TypeError('format must be png or jpg');
    return {
      deckId: input.deckId,
      slideIds: slideSelection(input.slideIds),
      themes,
      scale,
      format,
    };
  })
  .handler(async ({ data }): Promise<string> => {
    // authorize(read) first (SPEC-3 6.2), then the renders per hour quota (8.3) counted per render;
    // the security modules load here (DeckViewer imports this module for its client stubs)
    const { authorizeRequest, identityLabel } = await import('./authorize');
    const { assertQuota, tierOf } = await import('./ratelimit');
    const { ctx } = await authorizeRequest(data.deckId, 'read', { action: 'render.slide' });
    // a RangeError when the deck is missing; the open syncs the store's copy, the twins follow
    const store = await openDeckStore(data.deckId);
    await ensureDeckAssets(data.deckId);
    let ids: string[];
    if (data.slideIds === 'all') {
      const { document } = await store.read();
      ids = document.deck.sections.flatMap((section) => section.slideIds);
    } else {
      ids = data.slideIds;
    }
    const themes = data.themes ?? ['light', 'dark'];
    await assertQuota(
      'rendersPerHour',
      {
        identity: identityLabel(ctx) ?? 'anonymous',
        tier: tierOf(ctx),
        deckId: data.deckId,
        action: 'render.slide',
        transport: 'window',
      },
      Math.max(1, ids.length * themes.length),
    );
    const scale = data.scale ?? 1;
    const format = data.format ?? 'png';
    const records: RenderRecord[] = [];
    const images: string[] = [];
    // sequential: the local queue runs one Chromium at a time and the machine is shared
    for (const slideId of ids) {
      for (const theme of themes) {
        const rendered = await worker().renderSlide({
          deckId: data.deckId,
          slideId,
          theme,
          scale,
          ...(format === 'jpg' ? { format: 'jpg' as const } : {}),
        });
        const url = imageUrl(data.deckId, slideId, theme, scale, rendered.record.revision, format);
        records.push({ ...rendered.record, image: url });
        images.push(url);
      }
    }
    const result: RenderSlidesResult = { records, images };
    return JSON.stringify(result);
  });

/** render.slide through the worker; JSON text on the wire (see write.ts on why). */
export async function renderSlideImages(input: RenderSlidesInput): Promise<RenderSlidesResult> {
  return JSON.parse(
    await renderSlideImagesFn({ data: JSON.stringify(input) }),
  ) as RenderSlidesResult;
}

export type ThumbGrantResult = {
  /** The value for the `s` parameter of every thumbnail URL of the deck (server/thumbs.ts thumbUrl). */
  grant: string;
  /** When the grant expires, in ms since the epoch; the page asks again before then. */
  expiresAt: number;
  role: string;
};

const thumbGrantFn = createServerFn({ method: 'POST' })
  .validator((raw: string): { deckId: string } => {
    const input = parseJsonInput<{ deckId: unknown }>(raw);
    if (typeof input.deckId !== 'string' || !SLUG_PATTERN.test(input.deckId))
      throw new TypeError('deckId must be a slug');
    return { deckId: input.deckId };
  })
  .handler(async ({ data }): Promise<string> => {
    const { authorizeRequest } = await import('./authorize');
    const { THUMB_GRANT_TTL_MS, signThumbGrant } = await import('./tokens');
    const { decision } = await authorizeRequest(data.deckId, 'read', { action: 'render.thumb' });
    const now = Date.now();
    const role = decision.ok ? decision.role : 'viewer';
    const result: ThumbGrantResult = {
      grant: signThumbGrant(data.deckId, role, now),
      expiresAt: now + THUMB_GRANT_TTL_MS,
      role,
    };
    return JSON.stringify(result);
  });

/**
 * The thumbnail grant of a deck for the page (SPEC-3 8.13): `authorize(read)` decides, the grant
 * carries the deck and the role for ten minutes, and the filmstrip appends it to its thumbnail
 * URLs (`thumbUrl(..., grant)`); the render route refuses an unsigned `?w=` request in enforce
 * mode. The editor route asks once per deck open and again before the expiry.
 */
export async function thumbGrant(input: { deckId: string }): Promise<ThumbGrantResult> {
  return JSON.parse(await thumbGrantFn({ data: JSON.stringify(input) })) as ThumbGrantResult;
}
