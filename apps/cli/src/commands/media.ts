// The media commands (gslides-parity SPEC-5 3.8; R11 8.1; MILESTONES-5 B2 day 3): `media insert`
// (a file, a URL, a presigned upload key or a YouTube link becomes a record and a block on the
// slide), `media playback` (Google's Format options fields), `media poster` (a frame file as the
// poster), `media info` and `media list`, and `camera capture` (the Camera dialog on an attached
// studio page). Each runs the one implementation of apps/cli/src/actions/media.ts through the
// local dispatcher with the Node intake composed here, or on the studio `--to` names; with `--to`
// and a file over the data URL threshold the CLI is the browser of R11 1.8: it requests the media
// grant, PUTs the bytes with their declared type to the URL the grant answers, then runs the
// action with `upload` (the three steps b2.md records against a preview).
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionId } from '@turboslide/schema/actions';
import { MEDIA_KINDS, mediaMimeOfName, parseDuration } from '@turboslide/schema/blocks/media';
import type { MediaKind, PlaybackStart } from '@turboslide/schema/blocks/media';
import { PLAYBACK_STARTS } from '@turboslide/schema/blocks/media';
import { mediaInfo, isMediaRefusal } from '@turboslide/store/media/info';

import { registerMediaActions } from '../actions/media.ts';
import type { MediaLaneDeps } from '../actions/media.ts';
import { nodeMediaIntake } from '../actions/media-node.ts';
import { flagAll, flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { actionContext, localDispatcher, remoteOf } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import { authHeaders, readError, refused, remoteAction, tokenFor } from '../remote.ts';
import { normalizeHost } from '../hosts.ts';
import type { SlideResult } from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  printSlideResult,
  requireAddress,
  requirePositional,
  runAction,
  storeDeps,
} from '../write.ts';
import { parsePos } from './diagram.ts';

export const MEDIA_USAGE = `usage: turboslide media <insert|playback|poster|info|list> ...
  media insert <slideId> --file <path> | --url <https> | --upload <key> | --youtube <url|id>
               [--kind audio|video] [--alt <text>] [--title <text>] [--start click|auto|manual]
               [--start-at <m:ss|s>] [--end-at <m:ss|s>] [--mute] [--loop] [--volume <0..100>]
               [--hide-icon] [--no-stop-on-slide-change] [--pos x,y,w,h] [--allow <host>]
                                    a stored audio or video file, or a YouTube video, as a block on the slide (media.insert);
                                    with --to <studio> and a file over 3 MB the CLI requests the media grant, PUTs the bytes
                                    with their type and runs the action with --upload
  media playback <slideId>#<blockId> [--start click|auto|manual] [--start-at <m:ss>|none] [--end-at <m:ss>|none]
               [--mute|--no-mute] [--loop|--no-loop] [--volume <0..100>|none] [--hide-icon|--no-hide-icon]
               [--stop-on-slide-change|--no-stop-on-slide-change]
                                    Google's Audio playback and Video playback fields (media.setPlayback)
  media poster <slideId>#<blockId> --file <frame.png> | --at <ms>
                                    the still every export shows; --at captures in the editor (media.poster)
  media info <assetId|blockId> [--refresh]
                                    the stored record and the blocks that play it (media.info)
  media list                        every stored audio and video record (media.list)
  camera capture --slide <slideId> [--alt <text>] --from <studio>
                                    the Camera dialog on the attached studio page (camera.capture)
Every write takes --base-revision <n> (default: the current revision), --author <name>, --note <text>, --force and --json;
--to <studio> runs the action on a hosted studio with the saved credential.`;

/** Under this a file travels as a data URL inside the action (the function's body cap, R11 1.8 path 1). */
export const MEDIA_DATA_URL_THRESHOLD_BYTES = 3 * 1024 * 1024;

function oneOf<T extends string>(
  ctx: CommandContext,
  flag: string,
  options: ReadonlyArray<T>,
): T | undefined {
  const value = flagString(ctx.args, flag);
  if (value === undefined) return undefined;
  const match = options.find((option) => option === value);
  if (match === undefined)
    throw new UsageError(`--${flag} wants ${options.join(', ')}, got ${value}`);
  return match;
}

/** `--start-at 12`, `--start-at 0:12` or `--start-at none`, as milliseconds, null to clear, undefined when absent. */
function timeFlag(ctx: CommandContext, flag: string): number | null | undefined {
  const value = flagString(ctx.args, flag);
  if (value === undefined) return undefined;
  if (value === 'none') return null;
  const ms = parseDuration(value);
  if (ms === null) throw new UsageError(`--${flag} wants m:ss or seconds, got ${value}`);
  return ms;
}

/** `--mute` and `--no-mute` as one boolean, undefined when neither is given. */
function pairFlag(ctx: CommandContext, flag: string): boolean | undefined {
  if (flagBoolean(ctx.args, flag)) return true;
  if (flagBoolean(ctx.args, `no-${flag}`)) return false;
  return undefined;
}

function volumeFlag(ctx: CommandContext): number | null | undefined {
  const value = flagString(ctx.args, 'volume');
  if (value === undefined) return undefined;
  if (value === 'none') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100)
    throw new UsageError(`--volume wants 0 to 100, got ${value}`);
  return n;
}

/** The playback flags shared by insert and playback. */
function playbackFlags(ctx: CommandContext): Record<string, unknown> {
  const start = oneOf<PlaybackStart>(ctx, 'start', PLAYBACK_STARTS);
  const startMs = timeFlag(ctx, 'start-at');
  const endMs = timeFlag(ctx, 'end-at');
  const mute = pairFlag(ctx, 'mute');
  const loop = pairFlag(ctx, 'loop');
  const hideIcon = pairFlag(ctx, 'hide-icon');
  const stopOnSlideChange = pairFlag(ctx, 'stop-on-slide-change');
  const volume = volumeFlag(ctx);
  return {
    ...(start !== undefined ? { start } : {}),
    ...(startMs !== undefined ? { startMs } : {}),
    ...(endMs !== undefined ? { endMs } : {}),
    ...(mute !== undefined ? { mute } : {}),
    ...(loop !== undefined ? { loop } : {}),
    ...(hideIcon !== undefined ? { hideIcon } : {}),
    ...(stopOnSlideChange !== undefined ? { stopOnSlideChange } : {}),
    ...(volume !== undefined ? { volume } : {}),
  };
}

/** The local dispatcher with the media intake composed over the deck's folder. */
export function mediaDispatcher(ctx: CommandContext) {
  const store = openStore(ctx);
  const dispatcher = localDispatcher(ctx, store);
  const allow = flagAll(ctx.args, 'allow');
  const deps: MediaLaneDeps = {
    ...storeDeps(ctx, store),
    media: nodeMediaIntake({
      deckDir: store.dir,
      putAsset: (relative, bytes, contentType) => store.putAsset(relative, bytes, contentType),
      cwd: ctx.cwd,
      ...(allow.length > 0 ? { allowHosts: allow } : {}),
      log: (line) => ctx.out.human(line),
    }),
  };
  // the media ids over the Node intake win over the empty registration of the shared composition
  registerMediaActions(dispatcher, deps);
  return { store, dispatcher };
}

async function runMedia<T>(
  ctx: CommandContext,
  id: ActionId,
  input: Record<string, unknown>,
): Promise<T> {
  const to = remoteOf(ctx);
  if (to !== undefined) {
    return runAction(ctx, () =>
      remoteAction<T>(ctx, to, id, input, {
        ...(flagString(ctx.args, 'deck') !== undefined
          ? { deck: flagString(ctx.args, 'deck') as string }
          : {}),
        ...(flagBoolean(ctx.args, 'force') ? { force: true } : {}),
      }),
    );
  }
  const { store, dispatcher } = mediaDispatcher(ctx);
  return runAction(
    ctx,
    async () => (await dispatcher.dispatch(id, input, actionContext(ctx, store))) as T,
  );
}

/** The write input's base revision: `--base-revision`, else the deck's current revision (hosted: the deck read through media.list's store). */
async function revisionFor(ctx: CommandContext): Promise<number> {
  const flag = flagString(ctx.args, 'base-revision');
  if (flag !== undefined) {
    const n = Number(flag);
    if (!Number.isInteger(n) || n < 0)
      throw new UsageError(`--base-revision wants a non-negative integer, got ${flag}`);
    return n;
  }
  const to = remoteOf(ctx);
  if (to === undefined) return baseRevision(ctx, openStore(ctx));
  const deck = flagString(ctx.args, 'deck');
  const info = await remoteAction<{ revision: number }>(
    ctx,
    to,
    'deck.info',
    {},
    deck !== undefined ? { deck } : {},
  );
  return info.revision;
}

type MediaGrant = {
  key: string;
  url: string;
  method: 'PUT';
  contentType: string;
  backend: 'local' | 'blob';
};

/**
 * The three steps of a hosted media upload (R11 1.8 path 2): the grant, the PUT with the declared
 * type, the key for the action. Nothing here prints the token or the presigned URL.
 */
async function uploadToStudio(
  ctx: CommandContext,
  to: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
  kind: MediaKind | undefined,
): Promise<string> {
  const origin = normalizeHost(to);
  const deck = flagString(ctx.args, 'deck');
  if (deck === undefined)
    throw new UsageError('media insert --to <studio> with a file wants --deck <id>');
  const token = tokenFor(ctx, to);
  const grantResponse = await fetch(new URL('/api/x/upload/media', origin), {
    method: 'POST',
    headers: {
      ...authHeaders(token, ctx.env),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      deckId: deck,
      contentType,
      bytes: bytes.byteLength,
      ...(kind !== undefined ? { kind } : {}),
    }),
  });
  if (!grantResponse.ok) {
    const { message } = await readError(grantResponse);
    throw refused(to, grantResponse, message);
  }
  const grant = (await grantResponse.json()) as MediaGrant;
  ctx.out.human(`grant: ${grant.backend} backend, ${bytes.byteLength} bytes as ${contentType}`);
  const target = grant.backend === 'local' ? new URL(grant.url, origin) : new URL(grant.url);
  const put = await fetch(target, {
    method: 'PUT',
    headers: {
      'content-type': contentType,
      ...(grant.backend === 'local' ? authHeaders(token, ctx.env) : {}),
    },
    body: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  });
  if (!put.ok) {
    const { message } = await readError(put);
    throw new UsageError(`the upload PUT answered ${put.status}: ${message} (${path})`);
  }
  ctx.out.human(`uploaded ${bytes.byteLength} bytes under ${grant.key}`);
  return grant.key;
}

async function insertCommand(ctx: CommandContext): Promise<number> {
  const slideId = requirePositional(ctx, 0, MEDIA_USAGE);
  const file = flagString(ctx.args, 'file');
  const url = flagString(ctx.args, 'url');
  const upload = flagString(ctx.args, 'upload');
  const youtube = flagString(ctx.args, 'youtube');
  if ([file, url, upload, youtube].filter((v) => v !== undefined).length !== 1)
    throw new UsageError(
      `media insert wants exactly one of --file, --url, --upload or --youtube\n${MEDIA_USAGE}`,
    );
  const kind = oneOf<MediaKind>(ctx, 'kind', MEDIA_KINDS);
  const alt = flagString(ctx.args, 'alt');
  const title = flagString(ctx.args, 'title');
  const posFlag = flagString(ctx.args, 'pos');
  const pos = posFlag === undefined ? undefined : parsePos(posFlag);
  const playback = playbackFlags(ctx);
  const to = remoteOf(ctx);
  let source: Record<string, unknown> = {
    ...(url !== undefined ? { url } : {}),
    ...(upload !== undefined ? { upload } : {}),
    ...(youtube !== undefined ? { youtube } : {}),
  };
  if (file !== undefined) {
    if (to === undefined) source = { file };
    else {
      // the CLI as the browser (R11 1.8): a small file inside the action, a large one through the grant
      const path = isAbsolute(file) ? file : resolve(ctx.cwd, file);
      const size = (await stat(path)).size;
      const bytes = new Uint8Array(await readFile(path));
      const sniffed = mediaInfo(bytes);
      if (isMediaRefusal(sniffed)) throw new UsageError(sniffed.refused);
      const contentType = mediaMimeOfName(path) ?? sniffed.mime;
      if (size <= MEDIA_DATA_URL_THRESHOLD_BYTES) {
        source = { file: `data:${sniffed.mime};base64,${Buffer.from(bytes).toString('base64')}` };
      } else {
        source = {
          upload: await uploadToStudio(ctx, to, path, bytes, contentType, kind ?? sniffed.kind),
        };
      }
    }
  }
  const input = {
    slideId,
    ...source,
    ...(kind !== undefined ? { kind } : {}),
    ...(alt !== undefined ? { alt } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(pos !== undefined ? { pos } : {}),
    ...(Object.keys(playback).length > 0 ? { playback } : {}),
    baseRevision: await revisionFor(ctx),
  };
  const result = await runMedia<SlideResult & { blockId: string; assetId?: string }>(
    ctx,
    'media.insert',
    input,
  );
  printSlideResult(
    ctx,
    `inserted ${result.blockId}${result.assetId !== undefined ? ` (${result.assetId})` : ''} on`,
    result,
  );
  return 0;
}

async function playbackCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, MEDIA_USAGE);
  const patch = playbackFlags(ctx);
  if (Object.keys(patch).length === 0)
    throw new UsageError(`media playback wants at least one playback flag\n${MEDIA_USAGE}`);
  const result = await runMedia<SlideResult>(ctx, 'media.setPlayback', {
    slideId,
    blockId,
    ...patch,
    baseRevision: await revisionFor(ctx),
  });
  printSlideResult(ctx, `playback of ${blockId} set on`, result);
  return 0;
}

async function posterCommand(ctx: CommandContext): Promise<number> {
  const { slideId, blockId } = requireAddress(ctx, MEDIA_USAGE);
  const file = flagString(ctx.args, 'file');
  const at = flagString(ctx.args, 'at');
  if ((file === undefined) === (at === undefined))
    throw new UsageError(`media poster wants --file or --at, not both\n${MEDIA_USAGE}`);
  let source: Record<string, unknown>;
  if (file !== undefined) {
    const to = remoteOf(ctx);
    if (to === undefined) source = { file };
    else {
      const path = isAbsolute(file) ? file : resolve(ctx.cwd, file);
      const bytes = await readFile(path);
      const ext = path.split('.').pop()?.toLowerCase() ?? 'png';
      const mime =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'webp'
            ? 'image/webp'
            : 'image/png';
      source = { file: `data:${mime};base64,${bytes.toString('base64')}` };
    }
  } else {
    const ms = Number(at);
    if (!Number.isInteger(ms) || ms < 0) throw new UsageError(`--at wants milliseconds, got ${at}`);
    source = { atMs: ms };
  }
  const result = await runMedia<SlideResult & { posterAssetId: string }>(ctx, 'media.poster', {
    slideId,
    blockId,
    ...source,
    baseRevision: await revisionFor(ctx),
  });
  printSlideResult(ctx, `poster ${result.posterAssetId} set on`, result);
  return 0;
}

async function infoCommand(ctx: CommandContext): Promise<number> {
  const id = requirePositional(ctx, 0, MEDIA_USAGE);
  const refresh = flagBoolean(ctx.args, 'refresh');
  const answer = await runMedia<{
    asset: {
      id: string;
      kind: string;
      mime: string;
      bytes: number;
      durationMs: number | null;
      codecs: string[];
      file: string;
    };
    blocks: { slideId: string; blockId: string }[];
  }>(ctx, 'media.info', { id, ...(refresh ? { refresh: true } : {}) });
  ctx.out.result(answer);
  const { asset } = answer;
  ctx.out.human(
    `${asset.id}: ${asset.kind} ${asset.mime}, ${asset.bytes} bytes, ${asset.durationMs === null ? 'unknown length' : `${asset.durationMs} ms`}, codecs ${asset.codecs.join(', ') || 'none'}, ${asset.file}`,
  );
  for (const block of answer.blocks) ctx.out.human(`  played by ${block.slideId}#${block.blockId}`);
  return 0;
}

async function listCommand(ctx: CommandContext): Promise<number> {
  const answer = await runMedia<{
    assets: {
      id: string;
      kind: string;
      bytes: number;
      durationMs: number | null;
      title?: string;
    }[];
  }>(ctx, 'media.list', {});
  ctx.out.result(answer);
  if (answer.assets.length === 0) ctx.out.human('no audio or video files');
  for (const asset of answer.assets)
    ctx.out.human(
      `${asset.id}: ${asset.kind}, ${asset.bytes} bytes${asset.durationMs === null ? '' : `, ${asset.durationMs} ms`}${asset.title !== undefined ? `, ${asset.title}` : ''}`,
    );
  return 0;
}

export async function media(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'insert':
      return insertCommand(inner);
    case 'playback':
      return playbackCommand(inner);
    case 'poster':
      return posterCommand(inner);
    case 'info':
      return infoCommand(inner);
    case 'list':
      return listCommand(inner);
    default:
      throw new UsageError(MEDIA_USAGE);
  }
}

/** `turboslide camera capture --slide <id> --from <studio>`: the Camera dialog on the attached page is the executor (R11 8.1). */
export async function camera(ctx: CommandContext): Promise<number> {
  const [sub] = ctx.rest;
  if (sub !== 'capture') throw new UsageError(MEDIA_USAGE);
  const slideId = flagString(ctx.args, 'slide');
  if (slideId === undefined)
    throw new UsageError(`camera capture wants --slide <slideId>\n${MEDIA_USAGE}`);
  const from = flagString(ctx.args, 'from');
  const alt = flagString(ctx.args, 'alt');
  if (from === undefined) {
    // no attached page: the action's own sentence, through the dispatcher so the transports agree
    const dispatcher = createDispatcher();
    registerMediaActions(dispatcher, {} as MediaLaneDeps);
    await runAction(ctx, () =>
      dispatcher.dispatch(
        'camera.capture',
        { slideId, ...(alt !== undefined ? { alt } : {}), baseRevision: 0 },
        actionContext(ctx),
      ),
    );
    return 0;
  }
  const revision = await revisionFor(ctx);
  const result = await runAction(ctx, () =>
    remoteAction<SlideResult & { blockId: string; assetId: string }>(ctx, from, 'camera.capture', {
      slideId,
      ...(alt !== undefined ? { alt } : {}),
      studio: from,
      baseRevision: revision,
    }),
  );
  printSlideResult(ctx, `captured ${result.assetId} on`, result);
  return 0;
}
