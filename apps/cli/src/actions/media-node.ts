// The Node half of the media lane (gslides-parity SPEC-5 3.3; R11 1.8, 4.3; MILESTONES-5 B2 day
// 3): what `actions/media.ts` cannot import because the editor page shares its graph. A file
// path, a `data:` URL or an https URL is read through the headless package's `readInput` (the
// allowlist, the pinned lookup, the timeout and the counted body of SPEC-3 8.6) under the media
// cap instead of the picture's 25 MB; a presigned upload is staged by the studio's `upload.ts`
// (hosted) and read here; the digest is Node's sha256; the YouTube title comes from the oEmbed
// endpoint over `safeFetch` with `www.youtube.com` allowed for that one fetch; a poster file goes
// through the picture intake with the `thumb` role. The CLI's `media` command and the studio's
// hosted dispatcher compose it; a checkout keeps file paths, a hosted instance refuses them.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { addAsset } from '@turboslide/headless/capture/intake';
import { readInput, safeFetch } from '@turboslide/headless/capture/shared';
import type { Asset } from '@turboslide/schema/assets';
import type { MediaKind } from '@turboslide/schema/blocks/media';
import { youtubeOembedUrl } from '@turboslide/schema/blocks/media';
import type { AssetPut } from '@turboslide/store/store';

import type { MediaInput, MediaIntakeDeps } from './media.ts';

/** The hosts the oEmbed title fetch alone may reach (SPEC-5 3.3; R11 4.3): never the general allowlist. */
export const YOUTUBE_OEMBED_HOSTS: ReadonlyArray<string> = ['www.youtube.com'];

/** How many bytes an oEmbed answer may hold (R11 4.3). */
export const OEMBED_MAX_BYTES = 64 * 1024;

export type NodeMediaIntakeOptions = {
  /** the deck folder the poster picture lands under */
  deckDir: string;
  /** the store's asset write, so a hosted poster reaches the store (SPEC-3 8.5) */
  putAsset: (relative: string, bytes: Uint8Array, contentType?: string) => Promise<AssetPut>;
  /** the working directory a relative `file` resolves against (the CLI's cwd) */
  cwd?: string;
  /** file paths as inputs; the process policy when absent (a checkout yes, hosted no) */
  allowPaths?: boolean;
  /** the hosted allowlist and format rules; the process policy when absent */
  hosted?: boolean;
  /** hosts beyond the built in allowlist (`--allow`) */
  allowHosts?: ReadonlyArray<string>;
  /** hosted: the staged upload by key (the studio's `stageMediaUpload`) */
  readUpload?: (key: string) => Promise<MediaInput | null>;
  maxBytes?: (kind: MediaKind) => number;
  refusal?: string | null;
  countMedia?: (bytes: number) => Promise<void>;
  /** the fetch the oEmbed read uses; the pinned fetch when absent (the tests inject one) */
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
};

/** sha256 hex of the bytes, the digest every media file name carries. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The oEmbed answer's title, or null when the fetch fails, is refused or answers no title (R11 4.3). */
export async function fetchYoutubeTitle(
  id: string,
  options: { hosted?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  try {
    const { bytes } = await safeFetch(youtubeOembedUrl(id), {
      allowHosts: YOUTUBE_OEMBED_HOSTS,
      maxBytes: OEMBED_MAX_BYTES,
      timeoutMs: 8_000,
      ...(options.hosted !== undefined ? { hosted: options.hosted } : {}),
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    });
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { title?: unknown };
    return typeof parsed.title === 'string' && parsed.title.trim() !== ''
      ? parsed.title.trim().slice(0, 200)
      : null;
  } catch {
    return null;
  }
}

/** The media intake over Node for a deck folder: the CLI's and the hosted dispatcher's. */
export function nodeMediaIntake(options: NodeMediaIntakeOptions): MediaIntakeDeps {
  const intake: MediaIntakeDeps = {
    async readInput(input, { maxBytes }) {
      const read = await readInput(input, {
        maxBytes,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.allowPaths !== undefined ? { allowPaths: options.allowPaths } : {}),
        ...(options.hosted !== undefined ? { hosted: options.hosted } : {}),
        ...(options.allowHosts !== undefined ? { allowHosts: options.allowHosts } : {}),
      });
      // a data URL of a media file is named by its mime, the way the picture path names pasted.png
      const name = read.kind === 'data' ? `media.${dataExtension(input)}` : read.name;
      return { bytes: read.bytes, name, origin: read.origin, kind: read.kind };
    },
    ...(options.readUpload !== undefined ? { readUpload: options.readUpload } : {}),
    digest: sha256Hex,
    fetchYoutubeTitle: (id) =>
      fetchYoutubeTitle(id, {
        ...(options.hosted !== undefined ? { hosted: options.hosted } : {}),
        ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
      }),
    async addPicture(request): Promise<Asset> {
      const result = await addAsset(
        { id: request.id, file: request.file, role: request.role, alt: request.alt },
        {
          deckDir: options.deckDir,
          ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
          ...(options.allowPaths !== undefined ? { allowPaths: options.allowPaths } : {}),
          ...(options.hosted !== undefined ? { hosted: options.hosted } : {}),
          putAsset: (relative, bytes) => options.putAsset(relative, bytes),
          digestNames: true,
        },
      );
      for (const line of result.warnings) options.log?.(line);
      return result.asset;
    },
    async readStored(relative) {
      const path = isAbsolute(relative) ? relative : join(options.deckDir, relative);
      if (!path.startsWith(resolve(options.deckDir)) || !existsSync(path)) return null;
      return new Uint8Array(await readFile(path));
    },
    ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
    ...(options.refusal !== undefined ? { refusal: options.refusal } : {}),
    ...(options.countMedia !== undefined ? { countMedia: options.countMedia } : {}),
    ...(options.log !== undefined ? { log: options.log } : {}),
  };
  return intake;
}

/** The extension a `data:` URL's media type names, `bin` when it is none of the six. */
export function dataExtension(dataUrl: string): string {
  const mime = /^data:([^;,]*)/.exec(dataUrl)?.[1]?.toLowerCase() ?? '';
  switch (mime) {
    case 'video/mp4':
      return 'mp4';
    case 'video/webm':
      return 'webm';
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3';
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave':
      return 'wav';
    default:
      return 'bin';
  }
}
