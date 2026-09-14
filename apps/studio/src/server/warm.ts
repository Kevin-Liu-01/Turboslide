import { createServerFn } from '@tanstack/react-start';

import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { isUnsavedDraft } from './root';
import { THUMB_WIDTHS, isThumbWidth, warmThumbs } from './thumbs';
import type { WarmInput, WarmResult } from './thumbs';

/**
 * The one server function the editor calls for thumbnails (M3 item 5): every missing capture
 * of a theme in one render job. It lives apart from thumbs.ts on purpose: a createServerFn module
 * reaches the browser with its handler removed, but the plain functions thumbs.ts exports beside
 * it (getThumbnail, downsample, the disk cache) keep their imports in the client transform, and
 * those reach @turboslide/effects/io and node:zlib (measured during the M3 integration: the
 * editor's lazy chunk failed at packages/effects/src/png1.ts in the dev server). The API route
 * apps/studio/src/routes/api/render.$slideId.ts imports thumbs.ts directly; it never leaves the server.
 */
export const warmThumbnails = createServerFn({ method: 'POST' })
  .validator((input: WarmInput) => {
    if (!SLUG_PATTERN.test(input.deckId)) throw new Error('deckId must be a slug');
    // the input is JSON from the client: the type says Theme, the value says whatever was posted
    const theme: string = input.theme;
    if (theme !== 'light' && theme !== 'dark') throw new Error('theme must be light or dark');
    if (input.width !== undefined && !isThumbWidth(input.width))
      throw new Error(`width must be one of ${THUMB_WIDTHS.join(', ')}`);
    if (input.slideIds && !input.slideIds.every((id) => SLUG_PATTERN.test(id)))
      throw new Error('slideIds must be slugs');
    return input;
  })
  .handler(async ({ data }): Promise<WarmResult> => {
    // the job runs detached and the call answers at once (VERIFICATION-3 finding 32): a full
    // deck's first warm renders every capture of a theme in one worker job, which took tens of
    // seconds on a fresh 85 slide copy, and the browser held one of its six connections to the
    // dev server open for the whole answer; with the HMR socket, the three on demand captures and
    // a session call beside it the pool was full and the room's presence and ops posts of the
    // same page waited behind it (measured in the presence spec's trace: a POST issued 100 ms
    // after the stream connected had not left the browser 10 s later). The filmstrip reads the
    // captures through /api/render as they land, so nothing waits on this answer.
    if (await isUnsavedDraft(data.deckId)) return warmThumbs(data);
    void warmThumbs(data).catch((error: unknown) => {
      console.error(
        `turboslide warm: ${data.deckId} ${data.theme}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    return { revision: -1, ready: [], failed: [], rendered: 0, cached: 0, ms: 0, queued: true };
  });
