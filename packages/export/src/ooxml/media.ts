// The media rewrite of the post process (gslides-parity SPEC-5 0.20, 2.4, 3.6; R05 7.1, 7.2;
// MILESTONES-5 B2 day 5): for every `SceneMedia` of a slide, `rewriteMedia` turns the poster
// `p:pic` pptxgenjs wrote by name (`ts:<slide>#<raster id>`, the shot raster of the poster root)
// into the media picture PowerPoint reads: the `ppaction://media` click on `p:cNvPr`, an
// `a:audioFile` or `a:videoFile` in `p:nvPr` linked to the stored part, the `p14:media` extension
// embedding the same part (PowerPoint 2010 and later play from it; LibreOffice reads the ECMA
// element, R05 7.5), and `p14:trim` for Start at and End at (durations removed from the start and
// the end, milliseconds). The bytes go into the zip once as a stored part named by their digest
// (`ppt/media/media-<sha8>.<ext>`), so one file used on two slides is one part; the two
// relationships point at it from the slide's `.rels`. A YouTube block travels as pptxgenjs's
// online form: an external `video` relationship to `https://www.youtube.com/embed/<id>` and the
// poster blip, no `p14:media`. Under `media: 'poster'`, or once the embedded bytes would pass the
// deck's media cap, the poster picture alone travels and the block is named in `posterOnly` for
// the residual. The `p:audio` and `p:video` timing nodes are B1's (`ooxml/timing.ts`) from the
// `nodes` this rewrite answers: the block, the kind, the shape name and the media relationship.
// Called at the fixed position of SPEC-5 2.4 (after the alt text, before the equations and the
// grouping) by `pptx/build.ts`.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { DECK_MEDIA_BYTES_MAX, effectivePlayback } from '@turboslide/schema/blocks/media';
import type { MediaExportMode } from '@turboslide/schema/export';

import type { Scene, SceneMedia } from '../scene/types.ts';
import { listShapes } from './groups.ts';
import { hasPart, listParts, readPart, readPartBytes, writePart } from './zip.ts';
import type { Package } from './zip.ts';

export type MediaRewriteOptions = {
  /** embed the files (the default under the cap) or the posters alone; `url` is the web page's and reads as poster here */
  media?: MediaExportMode;
  /** the deck's media cap in bytes; nothing embeds above it (SPEC-5 0.18 `DECK_CAPS.mediaBytes`) */
  capBytes?: number;
  /** the slide part the xml belongs to (`ppt/slides/slide3.xml`); `ppt/slides/slide<scene.n>.xml` when absent */
  slidePart?: string;
};

export type MediaNode = {
  blockId: string;
  kind: 'audio' | 'video';
  /** the shape's `p:cNvPr name`, the target of the timing node's `p:spTgt` by id */
  shapeName: string;
  /** the `a:audioFile` or `a:videoFile` relationship id */
  relationshipId: string;
  /** the shape's `p:cNvPr id` */
  shapeId: number;
  /** the stored playback, for the `p:cMediaNode` attributes (volume, mute, loop, numSld, showWhenStopped) */
  playback: SceneMedia['playback'];
  /** true for a YouTube block's online form */
  online: boolean;
};

export type MediaRewriteResult = {
  xml: string;
  /** the media pictures written */
  written: number;
  /** the blocks whose poster alone travelled, with the reason */
  posterOnly: { blockId: string; reason: string }[];
  /** the node data B1's timing writer emits as p:audio and p:video */
  nodes: MediaNode[];
  /** the parts this call added, `ppt/media/media-<sha8>.<ext>` */
  parts: string[];
};

/** The relationship types of the media picture (R05 7.1). */
export const MEDIA_REL_TYPES = {
  audio: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio',
  video: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/video',
  media: 'http://schemas.microsoft.com/office/2007/relationships/media',
} as const;

/** The `p14:media` extension's uri (ECMA-376 part 1 and [MS-PPTX] 2.3.6). */
export const P14_MEDIA_EXT_URI = '{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}';
export const P14_NAMESPACE = 'http://schemas.microsoft.com/office/powerpoint/2010/main';

/** The content type of a media part by its extension (R05 7.1: `audio/mp3` is never written). */
export const MEDIA_PART_TYPES: Readonly<Record<string, string>> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
};

/** The extension a stored file name ends in, lower case, `bin` when none. */
export function extensionOf(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match === null ? 'bin' : (match[1] as string).toLowerCase();
}

function sha8(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8);
}

/** The next relationship id of a `.rels` part: one past the highest `rId<n>` it holds (the fonts writer's rule). */
function nextRelationshipId(rels: string, taken: Set<string>): string {
  const numbers = [...rels.matchAll(/\sId="rId(\d+)"/g)].map((match) => Number(match[1]));
  for (const id of taken) {
    const n = /^rId(\d+)$/.exec(id);
    if (n !== null) numbers.push(Number(n[1]));
  }
  return `rId${numbers.length === 0 ? 1 : Math.max(...numbers) + 1}`;
}

function addRelationship(
  rels: string,
  id: string,
  type: string,
  target: string,
  external: boolean,
): string {
  const entry = `<Relationship Id="${id}" Type="${type}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`;
  if (rels.includes('</Relationships>'))
    return rels.replace('</Relationships>', `${entry}</Relationships>`);
  return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entry}</Relationships>`;
}

/** The bytes the package's media parts of the five formats hold, for the cap. */
async function embeddedMediaBytes(zip: Package): Promise<number> {
  let total = 0;
  for (const part of listParts(zip)) {
    if (!/^ppt\/media\/media-[0-9a-f]{8}\.(mp4|m4v|webm|mp3|m4a|wav)$/.test(part)) continue;
    total += (await readPartBytes(zip, part)).byteLength;
  }
  return total;
}

/**
 * The `p:pic` of a media block after the rewrite: the click action on the non visual properties,
 * the file element and the extension in `p:nvPr`. `trim` carries the durations removed from the
 * start and the end in milliseconds; absent when the block plays the whole file.
 */
export function mediaPictureXml(
  pic: string,
  kind: 'audio' | 'video',
  linkId: string,
  embedId: string | null,
  trim: { st: number; end: number } | null,
): string {
  let out = pic;
  // the click action on p:cNvPr (self closing or not)
  out = out.replace(
    /<p:cNvPr\b([^>]*?)\s*\/>/,
    (_m, attrs: string) =>
      `<p:cNvPr${attrs}><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr>`,
  );
  if (!out.includes('ppaction://media'))
    out = out.replace(
      /<p:cNvPr\b([^>]*)>/,
      (_m, attrs: string) => `<p:cNvPr${attrs}><a:hlinkClick r:id="" action="ppaction://media"/>`,
    );
  const file = `<a:${kind}File r:link="${linkId}"/>`;
  const trimXml =
    trim !== null && (trim.st > 0 || trim.end > 0)
      ? `<p14:trim${trim.st > 0 ? ` st="${trim.st}"` : ''}${trim.end > 0 ? ` end="${trim.end}"` : ''}/>`
      : '';
  const ext =
    embedId === null
      ? ''
      : `<p:extLst><p:ext uri="${P14_MEDIA_EXT_URI}"><p14:media xmlns:p14="${P14_NAMESPACE}" r:embed="${embedId}">${trimXml}</p14:media></p:ext></p:extLst>`;
  const nvPr = `<p:nvPr>${file}${ext}</p:nvPr>`;
  if (/<p:nvPr\s*\/>/.test(out)) out = out.replace(/<p:nvPr\s*\/>/, nvPr);
  else if (/<p:nvPr>[\s\S]*?<\/p:nvPr>/.test(out))
    out = out.replace(
      /<p:nvPr>([\s\S]*?)<\/p:nvPr>/,
      (_m, inner: string) => `<p:nvPr>${file}${inner}${ext}</p:nvPr>`,
    );
  else out = out.replace(/<\/p:nvPicPr>/, `${nvPr}</p:nvPicPr>`);
  return out;
}

export async function rewriteMedia(
  xml: string,
  scene: Scene,
  zip: Package,
  options: MediaRewriteOptions = {},
): Promise<MediaRewriteResult> {
  const media = scene.media ?? [];
  const result: MediaRewriteResult = { xml, written: 0, posterOnly: [], nodes: [], parts: [] };
  if (media.length === 0) return result;
  const mode: MediaExportMode = options.media ?? 'embed';
  const capBytes = options.capBytes ?? DECK_MEDIA_BYTES_MAX;
  const slidePart = options.slidePart ?? `ppt/slides/slide${scene.n}.xml`;
  const relsPart = slidePart.replace(/^(.*\/)([^/]+)$/, '$1_rels/$2.rels');
  let rels = hasPart(zip, relsPart) ? await readPart(zip, relsPart) : '';
  const takenIds = new Set<string>();
  let embedded = await embeddedMediaBytes(zip);
  let out = xml;
  const prefix = `ts:${scene.slideId}`;
  for (const entry of media) {
    const wanted =
      entry.poster !== undefined ? `${prefix}#${entry.poster}` : `${prefix}#${entry.blockId}`;
    const shape = listShapes(out).find(
      (candidate) =>
        candidate.kind === 'pic' &&
        (candidate.name === wanted || candidate.name.startsWith(`${wanted}@`)),
    );
    if (shape === undefined) {
      result.posterOnly.push({
        blockId: entry.blockId,
        reason: 'no poster picture in the slide part',
      });
      continue;
    }
    const playback = effectivePlayback(entry.playback);
    if (entry.youtube !== undefined) {
      const linkId = nextRelationshipId(rels, takenIds);
      takenIds.add(linkId);
      rels = addRelationship(
        rels,
        linkId,
        MEDIA_REL_TYPES.video,
        `https://www.youtube.com/embed/${entry.youtube}`,
        true,
      );
      const next = mediaPictureXml(shape.xml, 'video', linkId, null, null);
      out = out.slice(0, shape.start) + next + out.slice(shape.end);
      result.written += 1;
      result.nodes.push({
        blockId: entry.blockId,
        kind: 'video',
        shapeName: shape.name,
        relationshipId: linkId,
        shapeId: shape.id,
        playback: entry.playback,
        online: true,
      });
      continue;
    }
    if (entry.file === undefined) {
      result.posterOnly.push({
        blockId: entry.blockId,
        reason: 'the media record is not in the deck',
      });
      continue;
    }
    if (mode !== 'embed') {
      result.posterOnly.push({ blockId: entry.blockId, reason: `media: '${mode}'` });
      continue;
    }
    if (!existsSync(entry.file)) {
      result.posterOnly.push({
        blockId: entry.blockId,
        reason: `the stored file is missing: ${entry.file}`,
      });
      continue;
    }
    const bytes = new Uint8Array(readFileSync(entry.file));
    const ext = extensionOf(entry.file);
    const partName = `ppt/media/media-${sha8(bytes)}.${ext === 'm4v' ? 'mp4' : ext}`;
    const already = hasPart(zip, partName);
    if (!already && embedded + bytes.byteLength > capBytes) {
      result.posterOnly.push({
        blockId: entry.blockId,
        reason: `over the deck's media cap (${Math.round(capBytes / (1024 * 1024))} MB)`,
      });
      continue;
    }
    if (!already) {
      writePart(zip, partName, bytes);
      embedded += bytes.byteLength;
      result.parts.push(partName);
    }
    const target = `../media/${partName.slice('ppt/media/'.length)}`;
    const linkId = nextRelationshipId(rels, takenIds);
    takenIds.add(linkId);
    rels = addRelationship(rels, linkId, MEDIA_REL_TYPES[entry.kind], target, false);
    const embedId = nextRelationshipId(rels, takenIds);
    takenIds.add(embedId);
    rels = addRelationship(rels, embedId, MEDIA_REL_TYPES.media, target, false);
    const duration = entry.durationMs ?? null;
    const trim = {
      st: playback.startMs,
      end:
        playback.endMs !== null && duration !== null && duration > playback.endMs
          ? duration - playback.endMs
          : 0,
    };
    const next = mediaPictureXml(shape.xml, entry.kind, linkId, embedId, trim);
    out = out.slice(0, shape.start) + next + out.slice(shape.end);
    result.written += 1;
    result.nodes.push({
      blockId: entry.blockId,
      kind: entry.kind,
      shapeName: shape.name,
      relationshipId: linkId,
      shapeId: shape.id,
      playback: entry.playback,
      online: false,
    });
  }
  if (rels !== '' && (result.written > 0 || takenIds.size > 0)) writePart(zip, relsPart, rels);
  result.xml = out;
  return result;
}
