import { createServerFn } from '@tanstack/react-start';

import { SLUG_PATTERN } from '@turboslide/schema/ids';

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
  .handler(async ({ data }): Promise<WarmResult> => warmThumbs(data));
