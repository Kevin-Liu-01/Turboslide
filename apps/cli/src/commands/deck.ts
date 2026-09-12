// The deck commands (SPEC 7.1, 7.2; Kevin's directive for the GT template): `deck create <name>
// --from gt-brand|blank [--id <id>] [--decks <dir>]` makes decks/<id> from the template record
// under decks/templates (deck.create), and `deck rename <name>` sets the title as one deck.set of
// /title through the store (deck.rename). registerDeckActions puts both on the dispatcher for
// `turboslide mcp`, so the CLI, the MCP server and the studio run one implementation
// (@turboslide/store/templates for create, the store's write path for rename).
//
// The transfer commands (docs/deck-transfer.md; Kevin's directive of 2026-09-11: copy a deck into
// the hosted app, or connect the local slides with it): `deck pack <id> --out <file.zip>` writes
// decks/<id> as a bundle (deck.pack, @turboslide/store/pack), `deck unpack <file.zip> [--as <id>]
// [--replace]` creates or replaces a deck from one (deck.unpack, @turboslide/store/unpack),
// `deck push <id> --to <url> [--token <t>]` uploads the bundle to a hosted studio through
// POST /api/decks/bundle (deck.push) and `deck pull <id> --from <url> [--token <t>]` downloads one
// through GET /api/decks/<id>/bundle into the checkout (deck.pull). The bearer token is kept per
// origin in ~/.config/turboslide/hosts.json (hosts.ts) and never printed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import type { DeckTemplateId } from '@turboslide/schema/actions';
import { DECK_TEMPLATES } from '@turboslide/schema/actions';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { BUNDLE_MAX_BYTES, BUNDLE_MEDIA_TYPE, sha256Hex } from '@turboslide/store/bundle';
import { packDeckDir } from '@turboslide/store/pack';
import type { PackResult } from '@turboslide/store/pack';
import { createDeck } from '@turboslide/store/templates';
import type { CreateDeckInput, CreateDeckResult } from '@turboslide/store/templates';
import { unpackBundle } from '@turboslide/store/unpack';
import type { UnpackResult } from '@turboslide/store/unpack';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { repoRootFor } from '../deck-files.ts';
import { UsageError } from '../exit.ts';
import { hostsPath, normalizeHost, resolveToken, saveHostToken } from '../hosts.ts';
import { formatBytes } from '../output.ts';
import { commit } from '../store-actions.ts';
import type { StoreActionDeps, WriteContext } from '../store-actions.ts';
import {
  baseRevision,
  openStore,
  requirePositional,
  runAction,
  storeDeps,
  writeContext,
} from '../write.ts';

const USAGE = `usage: turboslide deck <create|rename|pack|unpack|push|pull> ...
  deck create <name> --from gt-brand|blank [--id <id>] [--decks <dir>]
                                    decks/<id> from decks/templates/<from> (gt-brand: the GT brand deck, 85 slides) or as one title slide
  deck rename <name>                set the deck title (--deck, --base-revision, --author, --note, --json)
  deck pack <id> [--out <file.zip>] [--no-versions] [--decks <dir>]
                                    decks/<id> as one bundle zip with manifest.json (deck.pack)
  deck unpack <file.zip> [--as <id>] [--replace] [--decks <dir>]
                                    a deck under decks/ from a bundle; a taken id gets a free sibling unless --replace (deck.unpack)
  deck push <id> --to <url> [--token <t>] [--as <id>] [--replace] [--from-url <url>] [--decks <dir>]
                                    upload the bundle to a hosted studio (deck.push); the token is kept in ~/.config/turboslide/hosts.json
  deck pull <id> --from <url> [--token <t>] [--as <id>] [--replace] [--decks <dir>]
                                    download a deck bundle from a hosted studio into decks/ (deck.pull)`;

export type DeckRenameInput = { name: string; baseRevision: number };
export type DeckRenameResult = { title: string; revision: number };

function isTemplateId(value: string): value is DeckTemplateId {
  return (DECK_TEMPLATES as ReadonlyArray<string>).includes(value);
}

/** The decks folder: --decks, TURBOSLIDE_DECKS_DIR, else <repo root>/decks. */
export function decksDirFor(ctx: CommandContext): string {
  const flag = flagString(ctx.args, 'decks');
  if (flag !== undefined) return resolve(ctx.cwd, flag);
  if (ctx.env.TURBOSLIDE_DECKS_DIR) return resolve(ctx.cwd, ctx.env.TURBOSLIDE_DECKS_DIR);
  const root = repoRootFor(ctx.cwd) ?? ctx.cwd;
  const decks = join(root, 'decks');
  if (!existsSync(decks))
    throw new UsageError(
      `no decks folder at ${decks}; pass --decks <dir> or set TURBOSLIDE_DECKS_DIR`,
    );
  return decks;
}

/** deck.rename as a function from the action's input to its output, over the store. */
export async function deckRename(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: DeckRenameInput,
): Promise<DeckRenameResult> {
  const name = input.name.trim();
  if (name === '') throw new TypeError('deck.rename: name must not be empty');
  const committed = await commit(deps, ctx, input.baseRevision, [
    { op: 'deck.set', path: '/title', value: name },
  ]);
  return { title: committed.document.deck.title, revision: committed.revision };
}

/** Registers deck.create and deck.rename on a dispatcher (the MCP server). */
export function registerDeckActions(
  dispatcher: Dispatcher,
  deps: StoreActionDeps & { decksDir: string },
): void {
  dispatcher.register('deck.create', (input) =>
    createDeck(deps.decksDir, input as CreateDeckInput),
  );
  dispatcher.register('deck.rename', (input, context: ActionContext) =>
    deckRename(deps, context, input as DeckRenameInput),
  );
}

export async function deck(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  const inner = { ...ctx, rest };
  switch (sub) {
    case 'create':
      return create(inner);
    case 'rename':
      return rename(inner);
    case 'pack':
      return pack(inner);
    case 'unpack':
      return unpack(inner);
    case 'push':
      return push(inner);
    case 'pull':
      return pull(inner);
    default:
      throw new UsageError(`unknown subcommand "deck ${sub ?? ''}"\n${USAGE}`);
  }
}

async function create(ctx: CommandContext): Promise<number> {
  const name = requirePositional(ctx, 0, USAGE);
  const from = flagString(ctx.args, 'from') ?? 'gt-brand';
  if (!isTemplateId(from))
    throw new UsageError(`--from wants ${DECK_TEMPLATES.join(' or ')}, got ${from}\n${USAGE}`);
  const id = flagString(ctx.args, 'id');
  const decksDir = decksDirFor(ctx);
  const result: CreateDeckResult = await runAction(ctx, async () =>
    createDeck(decksDir, { name, from, ...(id !== undefined ? { id } : {}) }),
  );
  ctx.out.result(result);
  ctx.out.human(
    `created ${result.deckId} from ${result.from}: ${result.counts.slides} slides in ${result.counts.sections} sections, ${result.counts.assets} assets, revision ${result.revision}`,
  );
  ctx.out.human(`  ${result.dir}`);
  return 0;
}

async function rename(ctx: CommandContext): Promise<number> {
  const name = requirePositional(ctx, 0, USAGE);
  const store = openStore(ctx);
  const result = await runAction(ctx, async () =>
    deckRename(storeDeps(ctx, store), writeContext(ctx), {
      name,
      baseRevision: await baseRevision(ctx, store),
    }),
  );
  ctx.out.result(result);
  ctx.out.human(`renamed the deck to "${result.title}": revision ${result.revision}`);
  return 0;
}

/** The decks folder a per-deck MCP server creates siblings in: the deck directory's parent. */
export function decksDirOfDeck(deckDir: string): string {
  return dirname(deckDir);
}

// ---------------------------------------------------------------------------------------------
// Bundles

/** `<id>` as a deck id under the decks folder, or a path to a deck directory. */
function deckDirOf(ctx: CommandContext, id: string): string {
  const asPath = resolve(ctx.cwd, id);
  if (existsSync(join(asPath, 'deck.json'))) return asPath;
  if (!SLUG_PATTERN.test(id))
    throw new UsageError(`"${id}" is neither a deck id nor a deck directory\n${USAGE}`);
  const dir = join(decksDirFor(ctx), id);
  if (!existsSync(join(dir, 'deck.json')))
    throw new UsageError(`no deck ${id}: ${dir} has no deck.json`);
  return dir;
}

function optionalSlug(ctx: CommandContext, name: string): string | undefined {
  const value = flagString(ctx.args, name);
  if (value === undefined) return undefined;
  if (!SLUG_PATTERN.test(value)) throw new UsageError(`--${name} wants a slug, got ${value}`);
  return value;
}

function describeUnpack(result: UnpackResult): string {
  const how = result.replaced ? 'replaced' : 'created';
  const from = result.renamed ? ` (the bundle carried ${result.sourceDeckId})` : '';
  return `${how} ${result.deckId}${from}: "${result.title}" at revision ${result.revision}, ${result.counts.slides} slides, ${result.counts.assets} assets, ${result.counts.versions} versions`;
}

async function pack(ctx: CommandContext): Promise<number> {
  const id = requirePositional(ctx, 0, USAGE);
  const dir = deckDirOf(ctx, id);
  const versions = !flagBoolean(ctx.args, 'no-versions');
  const result: PackResult = await runAction(ctx, async () => {
    const packed = packDeckDir(dir, { versions });
    const flag = flagString(ctx.args, 'out');
    const out =
      flag === undefined
        ? resolve(ctx.cwd, packed.fileName)
        : isAbsolute(flag)
          ? flag
          : resolve(ctx.cwd, flag);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, packed.zip);
    return {
      deckId: packed.manifest.deckId,
      title: packed.manifest.title,
      revision: packed.manifest.revision,
      out,
      bytes: packed.zip.byteLength,
      sha256: sha256Hex(packed.zip),
      counts: packed.counts,
    };
  });
  ctx.out.result(result);
  ctx.out.human(
    `packed ${result.deckId} at revision ${result.revision}: ${result.counts.documents} documents, ${result.counts.assets} assets, ${result.counts.versions} versions, ${formatBytes(result.bytes)}`,
  );
  ctx.out.human(`  ${result.out}`);
  return 0;
}

function readBundleFile(ctx: CommandContext, file: string): Uint8Array {
  const path = isAbsolute(file) ? file : resolve(ctx.cwd, file);
  if (!existsSync(path)) throw new UsageError(`no bundle at ${path}`);
  const bytes = new Uint8Array(readFileSync(path));
  if (bytes.byteLength > BUNDLE_MAX_BYTES) {
    throw new UsageError(
      `${path} is ${formatBytes(bytes.byteLength)}; a bundle is at most ${formatBytes(BUNDLE_MAX_BYTES)}`,
    );
  }
  return bytes;
}

async function unpack(ctx: CommandContext): Promise<number> {
  const file = requirePositional(ctx, 0, USAGE);
  const zip = readBundleFile(ctx, file);
  const decksDir = decksDirFor(ctx);
  const as = optionalSlug(ctx, 'as');
  const replace = flagBoolean(ctx.args, 'replace');
  const result = await runAction(ctx, () =>
    unpackBundle(zip, { decksDir, ...(as !== undefined ? { as } : {}), replace }),
  );
  ctx.out.result(result);
  ctx.out.human(describeUnpack(result));
  ctx.out.human(`  ${result.dir}`);
  return 0;
}

// ---------------------------------------------------------------------------------------------
// The hosted routes

type ErrorBody = { error?: { message?: string; status?: number; code?: string } };

export type PushResult = UnpackResult & { url: string };

/** The bearer token for a studio, from --token (saved for next time), the environment or the hosts file. */
function tokenFor(ctx: CommandContext, url: string): string | undefined {
  const flag = flagString(ctx.args, 'token');
  const { token, source } = resolveToken(url, flag, ctx.env);
  if (source === 'flag' && token !== undefined) {
    const path = saveHostToken(url, token, ctx.env);
    ctx.out.human(`token for ${normalizeHost(url)} saved to ${path}`);
  }
  return token;
}

/**
 * The bearer, plus the Trusted Sources header when VERCEL_OIDC_TOKEN is in the environment, so
 * push and pull reach a preview deployment behind Vercel Authentication the way
 * scripts/hosted-smoke.mjs does (docs/hosting.md section 7); neither value is printed.
 */
function authHeaders(token: string | undefined): Record<string, string> {
  const oidc = process.env.VERCEL_OIDC_TOKEN;
  return {
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    ...(oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {}),
  };
}

async function readError(response: Response): Promise<string> {
  let message = `${response.status} ${response.statusText}`.trim();
  try {
    const body = (await response.json()) as ErrorBody;
    if (body.error?.message) message = body.error.message;
  } catch {
    // not JSON: the status line is the message
  }
  return message;
}

function refused(url: string, response: Response, message: string): UsageError {
  const origin = normalizeHost(url);
  if (response.status === 401) {
    return new UsageError(
      `${origin} refused the request: ${message}. Pass --token <TURBOSLIDE_TOKEN of the deployment> once; the CLI keeps it in ${hostsPath()}`,
    );
  }
  if (response.status === 413) {
    return new UsageError(
      `${origin} refused the request: ${message}. A Vercel function accepts a 4.5 MB body; store the zip where the studio can read it (the deck store's Blob host) and pass --from-url <url>`,
    );
  }
  return new UsageError(`${origin} answered ${response.status}: ${message}`);
}

/**
 * Uploads a bundle to a studio: the zip as the body, or `{ url }` when the bundle sits at a URL
 * the studio may fetch (a bundle over a function's body cap). The answer is the unpack result
 * plus the editor URL.
 */
export async function pushBundle(
  zip: Uint8Array | null,
  options: { to: string; token?: string; as?: string; replace?: boolean; fromUrl?: string },
): Promise<PushResult> {
  const origin = normalizeHost(options.to);
  const url = new URL('/api/decks/bundle', origin);
  if (options.as !== undefined) url.searchParams.set('as', options.as);
  if (options.replace === true) url.searchParams.set('replace', '1');
  const body =
    options.fromUrl !== undefined
      ? { body: JSON.stringify({ url: options.fromUrl }), type: 'application/json' }
      : zip === null
        ? null
        : { body: zip, type: BUNDLE_MEDIA_TYPE };
  if (body === null) throw new TypeError('deck.push needs a bundle or --from-url');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders(options.token),
      'content-type': body.type,
      accept: 'application/json',
    },
    body: body.body,
  });
  if (!response.ok) throw refused(options.to, response, await readError(response));
  const result = (await response.json()) as UnpackResult & { editUrl?: string };
  return { ...result, url: new URL(result.editUrl ?? `/edit/${result.deckId}`, origin).toString() };
}

/** Downloads a deck bundle from a studio; a 302 to a stored copy is followed. */
export async function pullBundle(
  deckId: string,
  options: { from: string; token?: string },
): Promise<Uint8Array> {
  const origin = normalizeHost(options.from);
  const url = new URL(`/api/decks/${encodeURIComponent(deckId)}/bundle`, origin);
  const response = await fetch(url, {
    headers: { ...authHeaders(options.token), accept: `${BUNDLE_MEDIA_TYPE}, application/json` },
    redirect: 'follow',
  });
  if (!response.ok) throw refused(options.from, response, await readError(response));
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    throw new UsageError(
      `${origin} answered JSON where a zip was expected: ${await readError(response)}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > BUNDLE_MAX_BYTES) {
    throw new UsageError(
      `the bundle is ${formatBytes(bytes.byteLength)}; a bundle is at most ${formatBytes(BUNDLE_MAX_BYTES)}`,
    );
  }
  return bytes;
}

async function push(ctx: CommandContext): Promise<number> {
  const id = requirePositional(ctx, 0, USAGE);
  const to = flagString(ctx.args, 'to');
  if (to === undefined) throw new UsageError(`deck push needs --to <url>\n${USAGE}`);
  const as = optionalSlug(ctx, 'as');
  const replace = flagBoolean(ctx.args, 'replace');
  const fromUrl = flagString(ctx.args, 'from-url');
  const result = await runAction(ctx, async () => {
    const token = tokenFor(ctx, to);
    let zip: Uint8Array | null = null;
    let localId = id;
    if (fromUrl === undefined) {
      const dir = deckDirOf(ctx, id);
      const packed = packDeckDir(dir);
      zip = packed.zip;
      localId = packed.manifest.deckId;
      if (zip.byteLength > BUNDLE_MAX_BYTES) {
        throw new TypeError(
          `the bundle is ${formatBytes(zip.byteLength)}; a bundle is at most ${formatBytes(BUNDLE_MAX_BYTES)}`,
        );
      }
      ctx.out.human(
        `packed ${localId} at revision ${packed.manifest.revision}: ${formatBytes(zip.byteLength)}`,
      );
    }
    return pushBundle(zip, {
      to,
      ...(token !== undefined ? { token } : {}),
      as: as ?? (fromUrl === undefined ? undefined : id),
      replace,
      ...(fromUrl !== undefined ? { fromUrl } : {}),
    });
  });
  ctx.out.result(result);
  ctx.out.human(`${describeUnpack(result)} on ${normalizeHost(to)}`);
  ctx.out.human(`  ${result.url}`);
  return 0;
}

async function pull(ctx: CommandContext): Promise<number> {
  const id = requirePositional(ctx, 0, USAGE);
  if (!SLUG_PATTERN.test(id)) throw new UsageError(`"${id}" is not a deck id\n${USAGE}`);
  const from = flagString(ctx.args, 'from');
  if (from === undefined) throw new UsageError(`deck pull needs --from <url>\n${USAGE}`);
  const decksDir = decksDirFor(ctx);
  const as = optionalSlug(ctx, 'as');
  const replace = flagBoolean(ctx.args, 'replace');
  const result = await runAction(ctx, async () => {
    const token = tokenFor(ctx, from);
    const zip = await pullBundle(id, { from, ...(token !== undefined ? { token } : {}) });
    ctx.out.human(`downloaded ${id} from ${normalizeHost(from)}: ${formatBytes(zip.byteLength)}`);
    return unpackBundle(zip, { decksDir, ...(as !== undefined ? { as } : {}), replace });
  });
  ctx.out.result(result);
  ctx.out.human(describeUnpack(result));
  ctx.out.human(`  ${result.dir}`);
  return 0;
}
