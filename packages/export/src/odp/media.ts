// A media block of the ODP (gslides-parity SPEC-5 3.6, 6.3; R09 2.2): a `draw:frame` at the
// block's box holding a `draw:plugin` with the stored file under `Media/` (`xlink:href`), the
// LibreOffice media mime type the reader binds its player to (`draw:mime-type`), and the playback
// as `draw:param` rows (Loop, Mute, VolumeDB); under `media: 'poster'` or for YouTube the poster
// picture frames the box instead and the report row says so.
import type { MediaExportMode } from '@turboslide/schema/export';

import type { SceneMedia } from '../scene/types.ts';
import type { OdfShapeContext } from './shapes.ts';
import { pictureFrameXml } from './shapes.ts';
import { cm, el } from './xml.ts';

/** The mime type LibreOffice binds its media player to, whatever the file's own. */
export const LIBREOFFICE_MEDIA_MIME = 'application/vnd.sun.star.media';

export type OdfMediaInput = {
  media: SceneMedia;
  /** The stored file's bytes and its mime, when the mode embeds it and the file was read. */
  file?: { bytes: Uint8Array; mime: string; name: string };
  /** The poster's PNG bytes, when the scene shot one. */
  poster?: Uint8Array;
  mode: MediaExportMode;
  /** Adds a binary part under `Media/` and answers its package path. */
  addMedia: (bytes: Uint8Array, mime: string, name: string) => string;
};

/** The frame of a media block, and the report row for what travelled. */
export function mediaFrameXml(
  input: OdfMediaInput,
  ctx: OdfShapeContext,
  attributes: Record<string, string | undefined> = {},
): { xml: string; row: { code: string; message: string } } {
  const { media } = input;
  const poster = (): string =>
    input.poster !== undefined
      ? pictureFrameXml(
          ctx.addPicture(input.poster, 'image/png', `${media.blockId}-poster`),
          media.box,
          ctx,
          {},
          attributes,
          `${media.kind} ${media.blockId}`,
        )
      : '';
  if (media.youtube !== undefined) {
    return {
      xml: poster(),
      row: {
        code: 'media.poster-only',
        message: `${media.blockId}: a YouTube video travels as its poster; the ODP holds no embedded player`,
      },
    };
  }
  if (input.mode !== 'embed' || input.file === undefined) {
    return {
      xml: poster(),
      row: {
        code: 'media.poster-only',
        message: `${media.blockId}: the ${media.kind} travels as its poster (${input.mode === 'embed' ? 'the file was not read' : `media mode ${input.mode}`})`,
      },
    };
  }
  const href = input.addMedia(input.file.bytes, input.file.mime, input.file.name);
  const params: string[] = [];
  if (media.playback.loop === true)
    params.push(el('draw:param', { 'draw:name': 'Loop', 'draw:value': 'true' }));
  if (media.playback.mute === true)
    params.push(el('draw:param', { 'draw:name': 'Mute', 'draw:value': 'true' }));
  if (media.playback.volume !== undefined) {
    // LibreOffice's VolumeDB runs from -40 (silent) to 0 (full); a linear map of the percentage
    const db = Math.round(-40 + (Math.max(0, Math.min(100, media.playback.volume)) / 100) * 40);
    params.push(el('draw:param', { 'draw:name': 'VolumeDB', 'draw:value': String(db) }));
  }
  const style = ctx.styles.add(
    'graphic',
    el('style:graphic-properties', { 'draw:stroke': 'none', 'draw:fill': 'none' }),
    'standard',
  );
  const [x, y, w, h] = media.box;
  const xml = el(
    'draw:frame',
    {
      'draw:style-name': style,
      'draw:layer': 'layout',
      'svg:x': cm(x),
      'svg:y': cm(y),
      'svg:width': cm(w),
      'svg:height': cm(h),
      ...attributes,
    },
    el(
      'draw:plugin',
      {
        'xlink:href': href,
        'xlink:type': 'simple',
        'xlink:show': 'embed',
        'xlink:actuate': 'onLoad',
        'draw:mime-type': LIBREOFFICE_MEDIA_MIME,
      },
      params.join(''),
    ),
  );
  return {
    xml,
    row: {
      code: 'media.embedded',
      message: `${media.blockId}: the ${media.kind} travels as ${href} (${input.file.mime}, ${input.file.bytes.byteLength} bytes) with playback ${media.playback.start}${media.playback.loop ? ', loop' : ''}${media.playback.mute ? ', muted' : ''}`,
    },
  };
}
