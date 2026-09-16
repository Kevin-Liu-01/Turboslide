// Admission caps (gslides-parity SPEC-3 3.4 steps 1 and 2, 3.9; reports 10 F24, F27, F28), pure:
// the numbers every route applies before it transforms anything, and the small checks that turn
// a request into a fixed answer. The counting itself (per client, per identity, per deck) runs
// through the channel's `budget`; this module names the limits and the windows. The one piece
// with a channel in its hands is `appendWithRetry`, the compare and append loop of 3.4 step 5:
// transform against what landed, retry, and after two misses take the deck's short append lock
// so a busy room cannot starve one writer (report 10 F34).
import type { AppendResult, Entry, NewEntry, RealtimeChannel, Role } from './channel.ts';
import { deckKeys } from './keys.ts';
import {
  BASE_SEQ_WINDOW,
  OPS_POST_MAX_BYTES,
  OPS_POST_MAX_ENTRIES,
  REPLAY_MAX_ENTRIES,
  STREAM_LIFETIME_MS,
  STREAM_RETRY_MS,
} from './protocol.ts';

/** Who is asking, for the budgets that differ by identity (SPEC-3 3.9). */
export type IdentityKind = 'anonymous' | 'signedIn' | 'agent';

export const MB = 1024 * 1024;

/** The caps of SPEC-3 3.9, one place. */
export const CAPS = {
  /** operations per second per client */
  opsPerSecondPerClient: 60,
  /** operations per minute per identity */
  opsPerMinute: { anonymous: 2400, signedIn: 4800, agent: 4800 } as const,
  /** bytes of operations per minute per identity */
  bytesPerMinute: { anonymous: 2 * MB, signedIn: 8 * MB, agent: 8 * MB } as const,
  /** bytes of operations per minute per deck, so a room cannot outgrow the checkpointer */
  deckBytesPerMinute: 16 * MB,
  /** a slide document after the write (report 04 7.5) */
  slideMaxBytes: 200 * 1024,
  /** every document of a deck */
  deckMaxBytes: 25 * MB,
  /** open streams per identity, per IP and per instance (report 10 F24) */
  streams: { anonymous: 4, signedIn: 8, agent: 4, ip: 16, instance: 256 } as const,
  /** Redis commands per day per identity before 429 (report 10 F33) */
  redisCommandsPerDay: { anonymous: 500_000, signedIn: 2_000_000, agent: 2_000_000 } as const,
} as const;

export type PostCapsResult =
  | { ok: true }
  | { ok: false; status: 400; reason: 'too-many-entries' | 'too-large'; message: string };

/** Step 1 of SPEC-3 3.4: the 65th entry and the 257th kB are refused before any transform. */
export function checkPostCaps(entryCount: number, bytes: number): PostCapsResult {
  if (entryCount > OPS_POST_MAX_ENTRIES) {
    return {
      ok: false,
      status: 400,
      reason: 'too-many-entries',
      message: `An ops post carries at most ${OPS_POST_MAX_ENTRIES} entries; this one has ${entryCount}`,
    };
  }
  if (bytes > OPS_POST_MAX_BYTES) {
    return {
      ok: false,
      status: 400,
      reason: 'too-large',
      message: `An ops post is at most ${OPS_POST_MAX_BYTES} bytes; this one is ${bytes}`,
    };
  }
  return { ok: true };
}

export type BaseWindowResult =
  { ok: true } | { ok: false; status: 409; resync: true; head: number };

/** Step 2 of SPEC-3 3.4: a base more than 500 entries behind the head is a 409 `resync`. */
export function checkBaseWindow(base: number, head: number): BaseWindowResult {
  if (base > head || head - base > BASE_SEQ_WINDOW)
    return { ok: false, status: 409, resync: true, head };
  return { ok: true };
}

export type ReplayPlan = { kind: 'ops'; from: number } | { kind: 'resync' };

/**
 * What a stream open sends first (SPEC-3 3.3 `ops`): the entries since the client's position,
 * or `resync` when the position is older than the head minus 2,000 entries (report 10 F25).
 */
export function replayPlan(position: number, head: number): ReplayPlan {
  if (position > head) return { kind: 'resync' };
  if (head - position > REPLAY_MAX_ENTRIES) return { kind: 'resync' };
  return { kind: 'ops', from: position };
}

/** The budgets an identity kind gets, for the route's `budget` calls. */
export function budgetsFor(kind: IdentityKind): {
  opsPerMinute: number;
  bytesPerMinute: number;
  streams: number;
  redisCommandsPerDay: number;
} {
  return {
    opsPerMinute: CAPS.opsPerMinute[kind],
    bytesPerMinute: CAPS.bytesPerMinute[kind],
    streams: CAPS.streams[kind],
    redisCommandsPerDay: CAPS.redisCommandsPerDay[kind],
  };
}

/** The window index of a fixed window at a time: `Math.floor(now / windowMs)`. */
export function windowOf(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs);
}

function between(range: readonly [number, number], random: number): number {
  const unit = Math.min(Math.max(random, 0), 1);
  return Math.round(range[0] + (range[1] - range[0]) * unit);
}

/** A stream's lifetime, drawn between 240 and 290 s so tabs never reconnect together (report 10 F24). */
export function streamLifetimeMs(random = Math.random()): number {
  return between(STREAM_LIFETIME_MS, random);
}

/** A stream's `retry` value, drawn between 1,000 and 4,000 ms. */
export function streamRetryMs(random = Math.random()): number {
  return between(STREAM_RETRY_MS, random);
}

/**
 * Transforms the entries a writer wants to append against the entries that landed since its
 * base (SPEC-3 3.4 step 3); null means an entry cannot be placed and the writer answers `reject`.
 */
export type Transform = (entries: NewEntry[], landed: Entry[]) => NewEntry[] | null;

export type AppendRetryOptions = {
  /** how many compare and append rounds before giving up; 32 by default */
  maxAttempts?: number;
  /** the miss after which the writer takes the deck's append lock; 2 per SPEC-3 3.4 step 5 */
  lockAfter?: number;
  /** the append lock's TTL; 200 ms per SPEC-3 3.4 step 5 */
  lockMs?: number;
  /** the pause between two tries for the lock; 1 ms by default */
  lockPollMs?: number;
  /** the lock token; random by default */
  token?: string;
};

export type AppendRetryResult =
  | { ok: true; entries: Entry[]; attempts: number; locked: boolean }
  | { ok: false; reason: 'unplaceable'; attempts: number; head: number }
  | { ok: false; reason: 'contended'; attempts: number; head: number };

function randomToken(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The compare and append loop of SPEC-3 3.4 step 5: append at `base`; on a miss read the entries
 * that landed with `since`, transform against them, move the base to the head and retry; after
 * `lockAfter` misses take `deck:<id>:append` for `lockMs` (waiting for it while another instance
 * holds it) and retry under it, so contending instances take turns instead of racing. The lock
 * is released on the way out.
 */
export async function appendWithRetry(
  channel: RealtimeChannel,
  deckId: string,
  base: number,
  entries: NewEntry[],
  transform: Transform,
  options: AppendRetryOptions = {},
): Promise<AppendRetryResult> {
  const maxAttempts = options.maxAttempts ?? 32;
  const lockAfter = options.lockAfter ?? 2;
  const lockMs = options.lockMs ?? 200;
  const lockPollMs = options.lockPollMs ?? 1;
  const token = options.token ?? randomToken();
  const lockKey = deckKeys(deckId).append;
  let pending = entries;
  let at = base;
  let held = false;
  let misses = 0;
  let attempts = 0;

  /** Takes the append lock, waiting while another writer holds it, for at most one lock life. */
  const takeLock = async (): Promise<void> => {
    const started = Date.now();
    while (!(await channel.lock(lockKey, token, lockMs))) {
      if (Date.now() - started > lockMs) break;
      await pause(lockPollMs);
    }
    // whether taken or waited out, the writer goes on; the lock only shapes the turn order
    held = true;
  };

  /** Moves the base to the head, transforming against what landed in between. */
  const catchUp = async (head: number, count: number): Promise<boolean> => {
    const landed = count > 0 ? await channel.since(deckId, at, count) : [];
    const next = transform(pending, landed);
    if (next === null) return false;
    pending = next;
    at = head;
    return true;
  };

  try {
    for (;;) {
      attempts += 1;
      const result: AppendResult = await channel.append(deckId, at, pending, { token });
      if (result.ok) return { ok: true, entries: result.entries, attempts, locked: held };
      if (attempts >= maxAttempts)
        return { ok: false, reason: 'contended', attempts, head: result.head };
      if (result.locked === true) {
        // another writer's turn: wait for its lock, then take the turn
        await takeLock();
      } else {
        misses += 1;
        if (!(await catchUp(result.head, result.count)))
          return { ok: false, reason: 'unplaceable', attempts, head: result.head };
        if (!held && misses >= lockAfter) await takeLock();
        else continue;
      }
      // the head may have moved while waiting: read it once more before the locked attempt
      const head = await channel.head(deckId);
      if (head !== at && !(await catchUp(head, head - at)))
        return { ok: false, reason: 'unplaceable', attempts, head };
    }
  } finally {
    if (held) await channel.unlock(lockKey, token);
  }
}

// ---------------------------------------------------------------------------------------------
// Chat (gslides-parity SPEC-5 0.46, 10; MILESTONES-5 B5): a message is a `chat` entry on the
// deck's operation stream beside `edit` and `comment`, admitted with the comment caps (4,000 code
// points, 20 mentions), the per deck rate rows below and the comment write limits per identity
// and per IP the route already applies. The entries are never checkpointed, never in a sidecar,
// the version log or an export; the room clears them when the last participant leaves. These
// functions are pure; the room's `admitChat` and the ops route call them.

/** The chat rate rows of SPEC-5 0.46: messages per minute per deck by identity kind. */
export const CHAT_CAPS = {
  messagesPerMinutePerDeck: { anonymous: 30, signedIn: 60, agent: 120 } as const,
  /** the comment body cap, in code points */
  textMaxCodePoints: 4000,
  /** the comment mention cap */
  mentionsMax: 20,
} as const;

export type ChatCheckResult =
  | { ok: true; text: string; mentions: string[] }
  | {
      ok: false;
      status: 400 | 403;
      code: 'empty' | 'too-long' | 'too-many-mentions' | 'forbidden';
      message: string;
    };

/** The `@name` mentions of a message text, deduplicated, in order (the round three picker's form). */
export function chatMentions(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/(?:^|\s)@([\p{L}\p{N}_.-]{1,64})/gu)) {
    const name = match[1];
    if (name !== undefined && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Step 1 of a chat admission: the text trimmed, the two caps, the role (commenters and above send). */
export function checkChatMessage(text: string, role: Role): ChatCheckResult {
  if (role === 'viewer')
    return {
      ok: false,
      status: 403,
      code: 'forbidden',
      message: 'Commenters and editors can chat',
    };
  const trimmed = text.trim();
  if (trimmed === '')
    return { ok: false, status: 400, code: 'empty', message: 'A message needs some text' };
  const points = [...trimmed].length;
  if (points > CHAT_CAPS.textMaxCodePoints)
    return {
      ok: false,
      status: 400,
      code: 'too-long',
      message: `A message is at most ${CHAT_CAPS.textMaxCodePoints.toLocaleString('en-US')} characters; this one has ${points.toLocaleString('en-US')}`,
    };
  const mentions = chatMentions(trimmed);
  if (mentions.length > CHAT_CAPS.mentionsMax)
    return {
      ok: false,
      status: 400,
      code: 'too-many-mentions',
      message: `A message mentions at most ${CHAT_CAPS.mentionsMax} people; this one mentions ${mentions.length}`,
    };
  return { ok: true, text: trimmed, mentions };
}

/** The rate limit sentence a chat over its row gets (the panel and the CLI print it as is). */
export const CHAT_RATE_SENTENCE = 'Too many messages; wait a moment';

/** The budget key and cap of a deck's chat window for an identity kind. */
export function chatBudget(
  deckId: string,
  kind: IdentityKind,
  nowMs: number,
): { key: string; cap: number; windowMs: number } {
  return {
    key: `q:deck:${deckId}:chat:${windowOf(nowMs, 60_000)}`,
    cap: CHAT_CAPS.messagesPerMinutePerDeck[kind],
    windowMs: 60_000,
  };
}

/** A new `chat` entry for the append, the message id minted here (`chat_<time>_<random>`). */
export function chatEntry(input: {
  rev: number;
  author: Entry['author'];
  clientId: string;
  principalId: string;
  text: string;
  at: string;
  id?: string;
}): NewEntry {
  const id = input.id ?? `chat_${Date.parse(input.at).toString(36)}_${randomToken().slice(0, 8)}`;
  return {
    rev: input.rev,
    kind: 'chat',
    author: input.author,
    clientId: input.clientId,
    opId: id,
    at: input.at,
    chat: { id, principalId: input.principalId, text: input.text, at: input.at },
  };
}

/** The chat messages of a stream slice since a time, oldest first (chat.list). */
export function chatMessagesOf(
  entries: ReadonlyArray<Entry>,
  since?: string,
): NonNullable<Entry['chat']>[] {
  const from = since === undefined ? Number.NEGATIVE_INFINITY : Date.parse(since);
  return entries
    .filter((entry) => entry.kind === 'chat' && entry.chat !== undefined)
    .map((entry) => entry.chat as NonNullable<Entry['chat']>)
    .filter((message) => Number.isNaN(from) || Date.parse(message.at) > from);
}
