import { createServerFn } from '@tanstack/react-start';
import { createSessionRegistry } from '@turboslide/agent/http/sessions';
import type {
  SessionAnswer,
  SessionCommand,
  SessionOwner,
  SessionRegistry,
  StudioSession,
} from '@turboslide/agent/http/sessions';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

import { parseJsonInput } from './json';
import type { Untrusted } from './json';
import { identityOfRequest, sessionDirectory } from './sessions.server';

/**
 * Attached studio pages (SPEC 7.3 "the view tools when a studio session is attached"; MILESTONES
 * M4 item 1). A page on /edit or /deck attaches once its window.turboslide.studio owner is ready,
 * long-polls for commands and answers them through that handle
 * (components/useStudioSession.ts), so `deck_goto_slide` over /mcp and `view.goto` over the HTTP
 * dispatcher run in the page with the same dispatcher a click uses and return its view state. The
 * registry (@turboslide/agent/http/sessions, framework free) lives on globalThis so the dev
 * server's module reloads keep the attached pages; createServerFn appears only under
 * apps/studio/src/server (SPEC 3.3 item 4). The boundary is JSON text, as write.ts explains.
 */

const REGISTRY = Symbol.for('turboslide.studio.sessions');

export function studioSessions(): SessionRegistry {
  const holder = globalThis as unknown as Record<symbol, SessionRegistry | undefined>;
  holder[REGISTRY] ??= createSessionRegistry();
  return holder[REGISTRY];
}

// ---------------------------------------------------------------------------------------------
// The session directory (gslides-parity SPEC-3 11.3 "sessions.ts: the registry moves to Redis
// and binds to identities"; MILESTONES-3 B2 day 5). The command bus above stays in process: a
// long poll is answered by the instance holding it, so a command for a page reaches the instance
// the page polls. What every instance must agree on is who is attached where: the directory
// binds every session to the principal (or the agent) that attached it, lists a principal's
// pages across instances ("Sessions" in the profile dialog, `account.sessions`), and caps the
// pages one identity and one deck may attach, so a script cannot exhaust the poll pool. Redis
// on the redis tier through the room's commands, memory elsewhere.

export const SESSIONS_PER_IDENTITY_MAX = 20;
export const SESSIONS_PER_DECK_MAX = 200;
/** A binding not touched by a poll for this long is gone (the poll is 20 s, the sweep 45 s). */
export const SESSION_BINDING_TTL_MS = 90_000;

export type SessionBinding = {
  id: string;
  deckId: string;
  owner: SessionOwner;
  /** the principal id, or `agent:<tokenId>` */
  identity: string;
  kind: 'anonymous' | 'account' | 'agent' | 'unknown';
  attachedAt: string;
  lastSeenAt: string;
  userAgent?: string;
};

export type BindRefusal = { ok: false; reason: 'identity' | 'deck'; cap: number };

export type SessionDirectory = {
  readonly kind: 'memory' | 'redis';
  bind: (binding: SessionBinding) => Promise<{ ok: true } | BindRefusal>;
  touch: (id: string, now: string) => Promise<void>;
  unbind: (id: string) => Promise<void>;
  forIdentity: (identity: string, now?: string) => Promise<SessionBinding[]>;
  forDeck: (deckId: string, now?: string) => Promise<SessionBinding[]>;
};

type Kv = { call: (command: string, ...args: (string | number)[]) => Promise<unknown> };

const fresh = (row: SessionBinding, now: string): boolean =>
  Date.parse(now) - Date.parse(row.lastSeenAt) <= SESSION_BINDING_TTL_MS;

/** One directory over a load and save of the whole table; the two backends differ only there. */
function directoryOver(
  kind: SessionDirectory['kind'],
  load: () => Promise<SessionBinding[]>,
  save: (rows: SessionBinding[]) => Promise<void>,
): SessionDirectory {
  return {
    kind,
    async bind(binding) {
      const now = binding.lastSeenAt;
      const rows = (await load()).filter((row) => fresh(row, now) && row.id !== binding.id);
      const mine = rows.filter((row) => row.identity === binding.identity).length;
      if (mine >= SESSIONS_PER_IDENTITY_MAX)
        return { ok: false, reason: 'identity', cap: SESSIONS_PER_IDENTITY_MAX };
      const onDeck = rows.filter((row) => row.deckId === binding.deckId).length;
      if (onDeck >= SESSIONS_PER_DECK_MAX)
        return { ok: false, reason: 'deck', cap: SESSIONS_PER_DECK_MAX };
      await save([...rows, binding]);
      return { ok: true };
    },
    async touch(id, now) {
      const rows = await load();
      const row = rows.find((entry) => entry.id === id);
      if (row === undefined) return;
      row.lastSeenAt = now;
      await save(rows.filter((entry) => fresh(entry, now)));
    },
    async unbind(id) {
      const rows = await load();
      if (!rows.some((row) => row.id === id)) return;
      await save(rows.filter((row) => row.id !== id));
    },
    async forIdentity(identity, now = new Date().toISOString()) {
      return (await load()).filter((row) => row.identity === identity && fresh(row, now));
    },
    async forDeck(deckId, now = new Date().toISOString()) {
      return (await load()).filter((row) => row.deckId === deckId && fresh(row, now));
    },
  };
}

export function memorySessionDirectory(): SessionDirectory {
  let rows: SessionBinding[] = [];
  return directoryOver(
    'memory',
    async () => rows.map((row) => ({ ...row })),
    async (next) => {
      rows = next;
    },
  );
}

/** `sessions:studio` as one JSON value with the binding TTL; every instance reads the same table. */
export function redisSessionDirectory(kv: Kv, key = 'sessions:studio'): SessionDirectory {
  return directoryOver(
    'redis',
    async () => {
      const raw = await kv.call('GET', key);
      if (typeof raw !== 'string') return [];
      try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as SessionBinding[]) : [];
      } catch {
        return [];
      }
    },
    async (rows) => {
      await kv.call('SET', key, JSON.stringify(rows), 'PX', SESSION_BINDING_TTL_MS * 2);
    },
  );
}

// `sessionDirectory`, `identityOfRequest` and `attachedPagesOf` live in sessions.server.ts (the
// integrator at merge 2): they reach the room and `getRequest()` of @tanstack/react-start/server,
// and this module is in the client's graph through components/useStudioSession.ts, so the
// production build's import protection refused the chain until the server half moved out. The
// handlers below are the only callers and the client transform drops them.

const POLL_DEFAULT_MS = 20_000;
const POLL_MAX_MS = 25_000;

function requireSlug(value: unknown, name: string): string {
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value))
    throw new TypeError(`${name} must be a slug`);
  return value;
}

function requireOwner(value: unknown): SessionOwner {
  if (value === 'editor' || value === 'viewer' || value === 'presenter') return value;
  throw new TypeError('owner must be editor, viewer or presenter');
}

function requireActions(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new TypeError('actions must be a list of action ids');
  }
  return value;
}

function optionalState(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('state must be an object');
  }
  return value as Record<string, unknown>;
}

export type AttachSessionInput = {
  deckId: string;
  owner: SessionOwner;
  actions: string[];
  author?: string;
  url?: string;
  state?: Record<string, unknown>;
  /** A session id the page already holds: re-attaches it after an owner change or a server restart. */
  id?: string;
};

const attachFn = createServerFn({ method: 'POST' })
  .validator((raw: string): AttachSessionInput => {
    const input = parseJsonInput<Untrusted<AttachSessionInput>>(raw);
    const state = optionalState(input.state);
    return {
      deckId: requireSlug(input.deckId, 'deckId'),
      owner: requireOwner(input.owner),
      actions: requireActions(input.actions),
      ...(typeof input.author === 'string' ? { author: input.author } : {}),
      ...(typeof input.url === 'string' ? { url: input.url.slice(0, 2000) } : {}),
      ...(state !== undefined ? { state } : {}),
      ...(typeof input.id === 'string' && /^[0-9a-f-]{36}$/.test(input.id) ? { id: input.id } : {}),
    };
  })
  .handler(async ({ data }): Promise<string> => {
    const { id, ...rest } = data;
    const who = await identityOfRequest();
    const directory = await sessionDirectory();
    const now = new Date().toISOString();
    const session = studioSessions().attach(rest, id);
    const bound = await directory.bind({
      id: session.id,
      deckId: session.deckId,
      owner: session.owner,
      identity: who.identity,
      kind: who.kind,
      attachedAt: session.attachedAt,
      lastSeenAt: now,
    });
    if (!bound.ok) {
      studioSessions().detach(session.id);
      throw new TypeError(
        bound.reason === 'identity'
          ? `This browser has ${bound.cap} pages attached already; close one to attach another`
          : `This presentation has ${bound.cap} pages attached already`,
      );
    }
    return JSON.stringify(session);
  });

/** Attaches (or re-attaches) a page; the session id comes back for the poll loop. */
export async function attachStudioSession(input: AttachSessionInput): Promise<StudioSession> {
  return JSON.parse(await attachFn({ data: JSON.stringify(input) })) as StudioSession;
}

export type PollSessionInput = { id: string; timeoutMs?: number };

const pollFn = createServerFn({ method: 'POST' })
  .validator((raw: string): PollSessionInput => {
    const input = parseJsonInput<Untrusted<PollSessionInput>>(raw);
    if (typeof input.id !== 'string' || input.id === '')
      throw new TypeError('id must be a session id');
    const timeoutMs = typeof input.timeoutMs === 'number' ? input.timeoutMs : POLL_DEFAULT_MS;
    return { id: input.id, timeoutMs: Math.min(POLL_MAX_MS, Math.max(0, timeoutMs)) };
  })
  .handler(async ({ data }): Promise<string> => {
    void (await sessionDirectory()).touch(data.id, new Date().toISOString()).catch(() => undefined);
    const commands = await studioSessions().poll(data.id, data.timeoutMs ?? POLL_DEFAULT_MS);
    return JSON.stringify(commands);
  });

/** The pending commands for a session; an empty list at the timeout or when the session is unknown. */
export async function pollStudioSession(input: PollSessionInput): Promise<SessionCommand[]> {
  return JSON.parse(await pollFn({ data: JSON.stringify(input) })) as SessionCommand[];
}

export type AnswerSessionInput = { id: string; answer: SessionAnswer };

const answerFn = createServerFn({ method: 'POST' })
  .validator((raw: string): AnswerSessionInput => {
    const input = parseJsonInput<Untrusted<AnswerSessionInput>>(raw);
    if (typeof input.id !== 'string' || input.id === '')
      throw new TypeError('id must be a session id');
    const answer = input.answer as Untrusted<SessionAnswer> | undefined;
    if (!answer || typeof answer.commandId !== 'string')
      throw new TypeError('answer.commandId is required');
    if (answer.ok === true) {
      return {
        id: input.id,
        answer: {
          commandId: answer.commandId,
          ok: true,
          result: (answer as { result?: unknown }).result,
        },
      };
    }
    const error = (
      answer as { error?: Untrusted<{ name: string; message: string; status?: number }> }
    ).error;
    return {
      id: input.id,
      answer: {
        commandId: answer.commandId,
        ok: false,
        error: {
          name: typeof error?.name === 'string' ? error.name : 'Error',
          message:
            typeof error?.message === 'string' ? error.message : 'the page refused the command',
          ...(typeof error?.status === 'number' ? { status: error.status } : {}),
        },
      },
    };
  })
  .handler(async ({ data }): Promise<string> =>
    JSON.stringify(studioSessions().answer(data.id, data.answer)),
  );

export async function answerStudioSession(input: AnswerSessionInput): Promise<boolean> {
  return JSON.parse(await answerFn({ data: JSON.stringify(input) })) as boolean;
}

const detachFn = createServerFn({ method: 'POST' })
  .validator((raw: string): { id: string } => {
    const input = parseJsonInput<{ id: unknown }>(raw);
    if (typeof input.id !== 'string' || input.id === '')
      throw new TypeError('id must be a session id');
    return { id: input.id };
  })
  .handler(async ({ data }): Promise<string> => {
    void (await sessionDirectory()).unbind(data.id).catch(() => undefined);
    return JSON.stringify(studioSessions().detach(data.id));
  });

export async function detachStudioSession(input: { id: string }): Promise<boolean> {
  return JSON.parse(await detachFn({ data: JSON.stringify(input) })) as boolean;
}
