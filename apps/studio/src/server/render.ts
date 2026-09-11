import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createServerFn } from '@tanstack/react-start';
import { createWorkerClient } from '@turboslide/render-worker/client';
import type { WorkerClient } from '@turboslide/render-worker/client';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { RenderRecord, Theme } from '@turboslide/schema/render';
import { openFileStore } from '@turboslide/store/file-store';

import { parseJsonInput } from './json';
import type { Untrusted } from './json';
import { slideSelection } from './lint';
import { deckDir } from './root';

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
 * the worker's cache makes that fetch a hit at the same revision.
 */

let client: WorkerClient | undefined;

function worker(): WorkerClient {
  client ??= createWorkerClient();
  return client;
}

export type RenderSlidesInput = {
  deckId: string;
  slideIds: 'all' | string[];
  themes?: Theme[];
  scale?: 1 | 2;
};

export type RenderSlidesResult = { records: RenderRecord[]; images: string[] };

/** The facade URL for one render; the revision names the pixels, so two revisions never share a cache entry. */
function imageUrl(
  deckId: string,
  slideId: string,
  theme: Theme,
  scale: 1 | 2,
  revision: number,
): string {
  return `/api/render/${encodeURIComponent(slideId)}?deck=${encodeURIComponent(deckId)}&theme=${theme}&scale=${scale}&revision=${revision}`;
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
    return { deckId: input.deckId, slideIds: slideSelection(input.slideIds), themes, scale };
  })
  .handler(async ({ data }): Promise<string> => {
    const dir = deckDir(data.deckId);
    if (!existsSync(join(dir, 'deck.json'))) throw new RangeError(`No deck ${data.deckId}`);
    let ids: string[];
    if (data.slideIds === 'all') {
      const { document } = await openFileStore({ dir }).read();
      ids = document.deck.sections.flatMap((section) => section.slideIds);
    } else {
      ids = data.slideIds;
    }
    const scale = data.scale ?? 1;
    const records: RenderRecord[] = [];
    const images: string[] = [];
    // sequential: the local queue runs one Chromium at a time and the machine is shared
    for (const slideId of ids) {
      for (const theme of data.themes ?? ['light', 'dark']) {
        const rendered = await worker().renderSlide({ deckId: data.deckId, slideId, theme, scale });
        const url = imageUrl(data.deckId, slideId, theme, scale, rendered.record.revision);
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
