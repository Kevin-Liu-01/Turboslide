import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { FLAG_DEFAULTS, FLAG_NAMES } from '@turboslide/schema/access';
import type { FlagName } from '@turboslide/schema/access';

import { logSecurityEvent } from './log';
import { stateDir } from './root';

/**
 * The kill switches (gslides-parity SPEC-3 0.33, 8.12; report 04 7.6, report 10 3.4): twelve
 * flags read per request with a 5 s in process cache and flipped by `turboslide admin flag <name>
 * on|off` with no deploy. Hosted, the flag lives at `flag:<name>` in Redis and is read through the
 * realtime channel's `flag()` (B2's `room.ts` binds the channel through `bindFlagReader`); on a
 * checkout it lives in `.turboslide/flags.json`. When the reader fails (Redis unreachable) the
 * flag takes the default of the table: `realtime` off (the `blob` tier), every other on, so an
 * outage of the counter store never turns exports or comments off by itself (SPEC-3 8.12).
 *
 * `requireFlag(name)` is what a route or a server function calls first: `null` when the switch is
 * on, else the 503 Response with the sentence the chrome shows, logged once as `flag.refused`
 * with the flag under `killSwitch`. Server only.
 */

export { FLAG_DEFAULTS, FLAG_NAMES };
export type { FlagName };

/**
 * The assist's kill switch (docs/PRODUCT.md 6.3, 6.4: "the kill switch answers 503"). Its name
 * joins `FLAG_NAMES` in `packages/schema/src/access.ts` by request to the integrator
 * (build/b7.md, Product round); until that line lands the switch is known here alone: read from
 * the same reader as the twelve under its own name, on by default, so the route and the panel
 * can be built and driven now and nothing changes when the schema names it too.
 */
export const ASSIST_FLAG = 'assist';
export type StudioFlagName = FlagName | typeof ASSIST_FLAG;
/** Every switch this server reads: the schema's twelve and the assist's. */
export const STUDIO_FLAG_NAMES: readonly StudioFlagName[] = [
  ...new Set<StudioFlagName>([...FLAG_NAMES, ASSIST_FLAG]),
];
/** The defaults of every switch this server reads: the schema's, and the assist on. */
export const STUDIO_FLAG_DEFAULTS: Readonly<Record<StudioFlagName, boolean>> = {
  ...FLAG_DEFAULTS,
  [ASSIST_FLAG]: true,
};
export function isStudioFlagName(value: string): value is StudioFlagName {
  return (STUDIO_FLAG_NAMES as readonly string[]).includes(value);
}

/** How long a read is kept before the reader is asked again (SPEC-3 8.12). */
export const FLAG_CACHE_MS = 5_000;

/** The checkout's flag file under the state folder. */
export const FLAGS_FILE = 'flags.json';

/** What each switch turns off, in the words of SPEC-3 8.12 (docs/security.md repeats them). */
export const FLAG_OFF_MEANS: Readonly<Record<StudioFlagName, string>> = {
  realtime:
    'the stream answers 204 so clients stop reconnecting and the editor falls to the long poll on the blob tier',
  presence: 'the roster is empty and presence POSTs answer 204',
  comments: 'comment writes answer 503 with a sentence; reads stay',
  invites: 'share.invite and share.requestAccess answer 503',
  email:
    'no Resend call; sign in falls to codes shown on a signed in device or is off for the incident',
  exports: 'the export routes answer 503',
  uploads: 'the presigned route answers 503 and the editor offers the 3 MB path only',
  renderThumbs: 'the thumbnail route answers 503 and the filmstrip shows plates',
  materialize:
    'picture.materialize and slide.setBackgroundMaterial answer 503; the live overlay still draws',
  htmlBlocks: 'every html block renders as its note',
  signup: 'the sign in dialog refuses new accounts with a sentence; existing sessions work',
  readOnly: 'every write answers 503 with "This presentation is read only right now"',
  assist:
    'the assist route answers 503 with a sentence and the Assist panel shows that the assistant is off; nothing else changes',
};

/**
 * The sentence a refusal shows (SPEC-3 6.8, 15: plain, no internal noun). `readOnly` is the one
 * sentence the specification fixes; the others name what is paused.
 */
export const FLAG_REFUSALS: Readonly<Record<StudioFlagName, string>> = {
  realtime: 'Live editing is paused right now. Your changes still save.',
  presence: 'Presence is paused right now.',
  comments: 'Comments are paused right now. Try again in a few minutes.',
  invites: 'Sharing invitations are paused right now. Try again in a few minutes.',
  email: 'Email is paused right now.',
  exports: 'Downloads are paused right now. Try again in a few minutes.',
  uploads: 'Large uploads are paused right now. Pictures under 3 MB still work.',
  renderThumbs: 'Slide previews are paused right now.',
  materialize: 'Rendering dithered pictures is paused right now.',
  htmlBlocks: 'Embedded HTML is paused right now.',
  signup: 'New accounts are paused right now. Existing sign ins still work.',
  readOnly: 'This presentation is read only right now',
  assist: 'The assistant is off on this Turboslide',
};

export type FlagReader = (name: StudioFlagName) => Promise<boolean>;

export type FlagWriter = (name: StudioFlagName, value: boolean) => Promise<void>;

type FlagState = {
  reader: FlagReader | null;
  writer: FlagWriter | null;
  cache: Map<StudioFlagName, { value: boolean; readAt: number }>;
  now: () => number;
};

const STATE = Symbol.for('turboslide.studio.flags');

function state(): FlagState {
  const store = globalThis as unknown as Record<symbol, FlagState | undefined>;
  return (store[STATE] ??= { reader: null, writer: null, cache: new Map(), now: () => Date.now() });
}

/** The checkout's file: `{ "<name>": true | false }`, absent names at their default. */
export function readFlagFile(dir: string = stateDir()): Partial<Record<StudioFlagName, boolean>> {
  const path = join(dir, FLAGS_FILE);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const out: Partial<Record<StudioFlagName, boolean>> = {};
    for (const name of STUDIO_FLAG_NAMES) {
      if (typeof parsed[name] === 'boolean') out[name] = parsed[name] as boolean;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeFlagFile(
  flags: Partial<Record<StudioFlagName, boolean>>,
  dir: string = stateDir(),
): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, FLAGS_FILE), `${JSON.stringify(flags, null, 2)}\n`);
}

/** The file reader and writer of a checkout (and of the tmp store, which has no Redis). */
export function fileFlagStore(dir: string = stateDir()): { read: FlagReader; write: FlagWriter } {
  return {
    read: (name) => Promise.resolve(readFlagFile(dir)[name] ?? STUDIO_FLAG_DEFAULTS[name]),
    write: (name, value) => {
      writeFlagFile({ ...readFlagFile(dir), [name]: value }, dir);
      return Promise.resolve();
    },
  };
}

/**
 * Binds the reader (and writer) the deployment uses: B2's realtime channel `flag()` hosted, the
 * file store otherwise. Clears the cache. Returns the previous pair so a test can restore it.
 */
export function bindFlags(next: {
  read?: FlagReader | null;
  write?: FlagWriter | null;
  now?: () => number;
}): { read: FlagReader | null; write: FlagWriter | null } {
  const s = state();
  const previous = { read: s.reader, write: s.writer };
  if (next.read !== undefined) s.reader = next.read;
  if (next.write !== undefined) s.writer = next.write;
  if (next.now !== undefined) s.now = next.now;
  s.cache.clear();
  return previous;
}

function reader(): FlagReader {
  const s = state();
  if (s.reader === null) {
    const file = fileFlagStore();
    s.reader = file.read;
    s.writer ??= file.write;
  }
  return s.reader;
}

/**
 * The value of a flag: the cached read when younger than 5 s, else the reader's answer; the
 * table's default when the reader fails (SPEC-3 8.12, the column "default when Redis is
 * unreachable"), logged once per failure as `redis.unavailable`.
 */
export async function flagOn(name: StudioFlagName): Promise<boolean> {
  const s = state();
  const t = s.now();
  const cached = s.cache.get(name);
  if (cached !== undefined && t - cached.readAt < FLAG_CACHE_MS) return cached.value;
  let value: boolean;
  try {
    // a reader that knows the schema's names alone (the memory and redis channels' `flag()`,
    // which refuse another name) answers nothing for the assist until its name lands there;
    // nothing read is the default, never a refusal
    const read: boolean | undefined = await reader()(name);
    value = typeof read === 'boolean' ? read : STUDIO_FLAG_DEFAULTS[name];
  } catch (error) {
    if (!(FLAG_NAMES as readonly string[]).includes(name)) {
      value = STUDIO_FLAG_DEFAULTS[name];
    } else {
      logSecurityEvent({
        event: 'redis.unavailable',
        killSwitch: name,
        reason: error instanceof Error ? error.name : 'flag read failed',
      });
      value = STUDIO_FLAG_DEFAULTS[name];
    }
  }
  s.cache.set(name, { value, readAt: t });
  return value;
}

/** Every flag with its value, for `admin.flag` without a value and the health page. */
export async function flagTable(): Promise<Record<StudioFlagName, boolean>> {
  const out = {} as Record<StudioFlagName, boolean>;
  for (const name of STUDIO_FLAG_NAMES) out[name] = await flagOn(name);
  return out;
}

/** Flips a flag through the bound writer (`turboslide admin flag <name> on|off`); read within 5 s everywhere. */
export async function setFlag(
  name: StudioFlagName,
  value: boolean,
  identity?: string,
): Promise<void> {
  const s = state();
  reader();
  if (s.writer === null) throw new RangeError('this deployment has no flag writer bound');
  await s.writer(name, value);
  s.cache.set(name, { value, readAt: s.now() });
  logSecurityEvent({
    event: 'flag.changed',
    killSwitch: name,
    reason: value ? 'on' : 'off',
    ...(identity !== undefined ? { identity } : {}),
  });
}

/** The refusal an off switch answers (SPEC-3 8.12): 503, `Retry-After`, the sentence, no detail. */
export class FlagOffError extends Error {
  readonly status = 503;
  readonly flag: StudioFlagName;
  readonly retryAfterSeconds = 60;

  constructor(flag: StudioFlagName) {
    super(FLAG_REFUSALS[flag]);
    this.name = 'FlagOffError';
    this.flag = flag;
  }
}

export type RequireFlagOptions = {
  identity?: string;
  deckId?: string;
  action?: string;
  requestId?: string;
};

/**
 * `null` when the switch is on; else the 503 Response with the sentence, logged as
 * `flag.refused`. Routes return the Response; server functions call `assertFlag` and let the
 * FlagOffError travel.
 */
export async function requireFlag(
  name: StudioFlagName,
  options: RequireFlagOptions = {},
): Promise<Response | null> {
  if (await flagOn(name)) return null;
  logSecurityEvent({
    event: 'flag.refused',
    killSwitch: name,
    status: 503,
    ...(options.identity !== undefined ? { identity: options.identity } : {}),
    ...(options.deckId !== undefined ? { deckId: options.deckId } : {}),
    ...(options.action !== undefined ? { action: options.action } : {}),
    ...(options.requestId !== undefined ? { requestId: options.requestId } : {}),
  });
  return Response.json(
    { error: 'unavailable', message: FLAG_REFUSALS[name], flag: name },
    {
      status: 503,
      headers: { 'retry-after': '60', 'cache-control': 'no-store' },
    },
  );
}

/** Throws FlagOffError when the switch is off; for server functions. */
export async function assertFlag(
  name: StudioFlagName,
  options: RequireFlagOptions = {},
): Promise<void> {
  const refused = await requireFlag(name, options);
  if (refused !== null) throw new FlagOffError(name);
}
