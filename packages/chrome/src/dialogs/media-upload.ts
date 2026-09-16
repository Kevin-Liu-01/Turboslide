// The browser side of the media intake (gslides-parity SPEC-5 3.2, 3.3; R11 1.8): a dropped,
// pasted or picked audio or video file becomes one `media.insert` call. Under the data URL
// threshold (3 MB, the function's body cap once base64 grows the bytes) the file travels inside
// the action as a `data:` URL; over it the page requests the media grant (`POST
// /api/x/upload/media`, the tier's caps and quotas), PUTs the bytes with their declared type to
// the URL the grant answers (the private store's presigned URL hosted, the local route on a
// checkout) and runs `media.insert { upload: key }`. The refusals are the route's sentences (the
// tmp tier's, the missing private store's, the size caps). Shared by the two Insert dialogs, the
// drop and the paste path; framework free so the dialogs and the tests read one code.
import { MEDIA_MIME_BY_EXTENSION, mediaMimeOfName } from '@turboslide/schema/blocks/media';
import type { MediaKind } from '@turboslide/schema/blocks/media';

/** Under this a media file travels as a data URL inside the action (server/upload.ts MEDIA_DATA_URL_THRESHOLD_BYTES). */
export const MEDIA_DATA_URL_THRESHOLD_BYTES = 3 * 1024 * 1024;

/** The `accept` of the Upload tabs: the six extensions and the five types (SPEC-5 3.2). */
export const AUDIO_ACCEPT = [
  '.mp3',
  '.m4a',
  '.wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-m4a',
].join(',');
export const VIDEO_ACCEPT = ['.mp4', '.m4v', '.webm', 'video/mp4', 'video/webm'].join(',');
export const MEDIA_ACCEPT = `${AUDIO_ACCEPT},${VIDEO_ACCEPT}`;

/** One sentence per tab naming the accepted list (SPEC-5 3.2). */
export const AUDIO_ACCEPTED_SENTENCE = 'Audio files as mp3, m4a or wav, up to 50 MB.';
export const VIDEO_ACCEPTED_SENTENCE = 'Video files as mp4 or webm, up to 200 MB.';

/** True for a file the media intake reads, by its name or its declared type. */
export function isMediaFile(file: { name: string; type?: string }): boolean {
  return mediaMimeOfName(file.name) !== null || mediaMimeFor(file) !== null;
}

/** The stored mime a file declares or its name says; null outside the five. */
export function mediaMimeFor(file: { name: string; type?: string }): string | null {
  const byName = mediaMimeOfName(file.name);
  if (byName !== null) return byName;
  const type = (file.type ?? '').toLowerCase();
  if (type === 'audio/mp3') return 'audio/mpeg';
  if (type === 'audio/x-m4a') return 'audio/mp4';
  if (type === 'audio/x-wav' || type === 'audio/wave') return 'audio/wav';
  return (Object.values(MEDIA_MIME_BY_EXTENSION) as string[]).includes(type) ? type : null;
}

/** The kind a file's mime carries by default: audio for the audio types, video for the rest. */
export function mediaKindFor(file: { name: string; type?: string }): MediaKind {
  const mime = mediaMimeFor(file);
  return mime !== null && mime.startsWith('audio/') ? 'audio' : 'video';
}

export type MediaDispatch = (id: string, input: unknown) => Promise<unknown>;

export type MediaGrant = {
  key: string;
  url: string;
  method: 'PUT';
  contentType: string;
  backend: 'local' | 'blob';
  maxBytes: number;
};

export type InsertMediaOptions = {
  deckId: string;
  slideId: string;
  revision: number;
  dispatch: MediaDispatch;
  /** the kind the caller means (the Insert audio dialog says audio for a webm recording) */
  kind?: MediaKind;
  alt?: string;
  title?: string;
  pos?: { x: number; y: number; w: number; h: number };
  playback?: Record<string, unknown>;
  /** the fetch the grant and the PUT use; the page's when absent */
  fetchImpl?: typeof fetch;
  /** the page's origin the grant route is requested from */
  origin?: string;
  /** progress words for the dialog */
  onProgress?: (line: string) => void;
};

export type InsertMediaResult = { blockId: string; assetId?: string; revision: number };

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('the file could not be read'));
    reader.readAsDataURL(file);
  });
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      message?: string;
      error?: string | { message?: string };
    };
    if (typeof body.message === 'string') return body.message;
    if (
      typeof body.error === 'object' &&
      body.error !== null &&
      typeof body.error.message === 'string'
    )
      return body.error.message;
    if (typeof body.error === 'string') return body.error;
  } catch {
    // the status line is the message
  }
  return `The upload answered ${response.status}`;
}

/**
 * The three steps of a hosted upload (R11 1.8 path 2): the grant, the PUT with the declared type,
 * the key. Answers the key `media.insert { upload }` takes.
 */
export async function uploadMediaFile(
  file: File,
  options: Pick<InsertMediaOptions, 'deckId' | 'kind' | 'fetchImpl' | 'origin' | 'onProgress'>,
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const contentType = mediaMimeFor(file);
  if (contentType === null)
    throw new Error(`${file.name} is not an audio or video file Turboslide reads`);
  const origin =
    options.origin ?? (typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  options.onProgress?.('Requesting the upload');
  const grantResponse = await fetchImpl(new URL('/api/x/upload/media', origin), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      deckId: options.deckId,
      contentType,
      bytes: file.size,
      ...(options.kind !== undefined ? { kind: options.kind } : {}),
    }),
  });
  if (!grantResponse.ok) throw new Error(await errorMessage(grantResponse));
  const grant = (await grantResponse.json()) as MediaGrant;
  options.onProgress?.(`Uploading ${Math.round(file.size / (1024 * 1024))} MB`);
  const target = grant.backend === 'local' ? new URL(grant.url, origin) : new URL(grant.url);
  const put = await fetchImpl(target, {
    method: 'PUT',
    ...(grant.backend === 'local' ? { credentials: 'same-origin' as const } : {}),
    headers: { 'content-type': contentType },
    body: file,
  });
  if (!put.ok) throw new Error(await errorMessage(put));
  return grant.key;
}

/**
 * One media file into the slide (R11 1.8): the data URL form under the threshold, the presigned
 * form over it, then `media.insert` on the window transport (the server runs it). Answers the
 * block, the record and the revision the write reached.
 */
export async function insertMediaFile(
  file: File,
  options: InsertMediaOptions,
): Promise<InsertMediaResult> {
  if (!isMediaFile(file))
    throw new Error(`${file.name} is not an audio or video file Turboslide reads`);
  const common = {
    slideId: options.slideId,
    ...(options.kind !== undefined ? { kind: options.kind } : {}),
    ...(options.alt !== undefined ? { alt: options.alt } : {}),
    ...(options.title !== undefined
      ? { title: options.title }
      : { title: file.name.replace(/\.[^.]+$/, '') }),
    ...(options.pos !== undefined ? { pos: options.pos } : {}),
    ...(options.playback !== undefined ? { playback: options.playback } : {}),
    baseRevision: options.revision,
  };
  let source: Record<string, string>;
  if (file.size <= MEDIA_DATA_URL_THRESHOLD_BYTES) {
    options.onProgress?.('Reading the file');
    const dataUrl = await readAsDataUrl(file);
    // a browser types a wav as audio/x-wav or an m4a as audio/x-m4a; the intake sniffs the bytes and the name only titles
    source = { file: dataUrl };
  } else {
    source = { upload: await uploadMediaFile(file, options) };
  }
  options.onProgress?.('Placing it on the slide');
  const out = (await options.dispatch('media.insert', {
    ...common,
    ...source,
  })) as InsertMediaResult;
  return out;
}

/**
 * A YouTube link or an https media URL into the slide (SPEC-5 3.2 By URL): a YouTube form runs
 * `media.insert { youtube }`, anything else `media.insert { url }` through the server's safeFetch.
 */
export async function insertMediaUrl(
  text: string,
  options: Omit<InsertMediaOptions, 'fetchImpl' | 'origin'> & { youtube: boolean },
): Promise<InsertMediaResult> {
  const input = {
    slideId: options.slideId,
    ...(options.youtube ? { youtube: text.trim() } : { url: text.trim() }),
    ...(options.kind !== undefined && !options.youtube ? { kind: options.kind } : {}),
    ...(options.alt !== undefined ? { alt: options.alt } : {}),
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.pos !== undefined ? { pos: options.pos } : {}),
    ...(options.playback !== undefined ? { playback: options.playback } : {}),
    baseRevision: options.revision,
  };
  return (await options.dispatch('media.insert', input)) as InsertMediaResult;
}
