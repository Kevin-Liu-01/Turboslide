// Attached studio sessions (SPEC 7.3 "the view tools when a studio session is attached";
// MILESTONES M4 item 1). A browser page on /edit or /deck attaches itself, long-polls for
// commands and answers them through its own window.turboslide.studio handle, so the server never
// reaches into a page: `view.goto` over /mcp or /api/actions is a command the page runs with the
// same dispatcher a click uses (SPEC 7.1) and the result is the page's view state. The registry is
// in-memory and per process; a session that stops polling is swept after `staleMs`. Framework
// free: the studio wraps it in server functions.

import { ConflictError } from '@turboslide/schema/errors';

export type SessionOwner = 'editor' | 'viewer' | 'presenter';

export type StudioSession = {
  id: string;
  deckId: string;
  owner: SessionOwner;
  /** The action ids the page answers, from describe().actions of its active owner. */
  actions: string[];
  author?: string;
  url?: string;
  attachedAt: string;
  lastSeenAt: string;
  /** describe().state of the page's owner, as last reported. */
  state: Record<string, unknown>;
};

export type SessionCommand = { id: string; action: string; input: unknown; issuedAt: string };

export type SessionAnswer =
  | { commandId: string; ok: true; result: unknown }
  | { commandId: string; ok: false; error: { name: string; message: string; status?: number } };

export type AttachInput = {
  deckId: string;
  owner: SessionOwner;
  actions: readonly string[];
  author?: string;
  url?: string;
  state?: Record<string, unknown>;
};

export type SessionRegistry = {
  /** Registers a page; an id the page already holds re-attaches it after a server restart. */
  attach: (input: AttachInput, id?: string) => StudioSession;
  /** Refreshes the session and its reported state; undefined when the session is unknown. */
  heartbeat: (
    id: string,
    patch?: Partial<Pick<AttachInput, 'actions' | 'state' | 'owner'>>,
  ) => StudioSession | undefined;
  detach: (id: string) => boolean;
  list: (deckId?: string) => StudioSession[];
  /** The most recently seen session on a deck that offers the action (or any, when action is absent). */
  attached: (deckId: string, action?: string) => StudioSession | undefined;
  /** Pending commands for a session; resolves at the timeout with an empty list. */
  poll: (id: string, timeoutMs: number) => Promise<SessionCommand[]>;
  answer: (id: string, answer: SessionAnswer) => boolean;
  /** Issues one command to a session and waits for its answer. */
  request: (
    sessionId: string,
    action: string,
    input: unknown,
    timeoutMs?: number,
  ) => Promise<unknown>;
  /** Drops sessions not seen within staleMs; returns how many. */
  sweep: () => number;
};

export type SessionRegistryOptions = {
  /** How long a silent session stays attached. Default 45 s (the poll is 20 s). */
  staleMs?: number;
  now?: () => number;
};

export const DEFAULT_STALE_MS = 45_000;
export const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;

/** The error a command answers with when the page refused or failed it, or when no page answers. */
export class SessionCommandError extends Error {
  readonly status: number;
  constructor(name: string, message: string, status = 500) {
    super(message);
    this.name = name;
    this.status = status;
  }
}

/**
 * The page's error as the error class of SPEC 7.1 the transports map by instance: a RangeError
 * (404) for an unknown id, a TypeError (400) for malformed input, a ConflictError (409) for a
 * stale revision, a SessionCommandError for anything else, so `errorStatus` gives the page's
 * status back to the HTTP and MCP error bodies.
 */
export function transportError(error: { name: string; message: string; status?: number }): Error {
  const status = error.status ?? 500;
  if (error.name === 'RangeError' || status === 404) return new RangeError(error.message);
  if (error.name === 'TypeError' || status === 400) return new TypeError(error.message);
  if (error.name === 'ConflictError' || status === 409) {
    return new ConflictError(error.message, { currentRevision: 0 });
  }
  return new SessionCommandError(error.name, error.message, status);
}

type Waiter = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: NodeJS.Timeout;
};

type Entry = {
  session: StudioSession;
  queue: SessionCommand[];
  waiters: Map<string, Waiter>;
  /** A poll waiting for the next command. */
  poller?: { resolve: (commands: SessionCommand[]) => void; timer: NodeJS.Timeout };
};

/**
 * A fresh id from Web Crypto (Node 24 and every browser). This module is framework free and is
 * imported by the studio's server functions, whose module-level imports stay in the client
 * bundle in dev; a `node:crypto` import here threw at module evaluation in the browser (measured
 * in the M5 integration: /deck and /edit never settled), so no Node built-in is imported here.
 */
function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function createSessionRegistry(options: SessionRegistryOptions = {}): SessionRegistry {
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const now = options.now ?? (() => Date.now());
  const entries = new Map<string, Entry>();

  const stamp = (): string => new Date(now()).toISOString();

  const fresh = (entry: Entry): boolean => now() - Date.parse(entry.session.lastSeenAt) <= staleMs;

  const drop = (entry: Entry): void => {
    entries.delete(entry.session.id);
    entry.poller?.resolve([]);
    if (entry.poller) clearTimeout(entry.poller.timer);
    for (const waiter of entry.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new RangeError('the studio session detached before it answered'));
    }
    entry.waiters.clear();
  };

  const registry: SessionRegistry = {
    attach(input, id) {
      const sessionId = id ?? newId();
      const existing = entries.get(sessionId);
      const at = stamp();
      const session: StudioSession = {
        id: sessionId,
        deckId: input.deckId,
        owner: input.owner,
        actions: [...input.actions],
        ...(input.author !== undefined ? { author: input.author } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        attachedAt: existing?.session.attachedAt ?? at,
        lastSeenAt: at,
        state: { ...(input.state ?? {}) },
      };
      if (existing) existing.session = session;
      else entries.set(sessionId, { session, queue: [], waiters: new Map() });
      return session;
    },
    heartbeat(id, patch) {
      const entry = entries.get(id);
      if (!entry) return undefined;
      entry.session = {
        ...entry.session,
        lastSeenAt: stamp(),
        ...(patch?.owner !== undefined ? { owner: patch.owner } : {}),
        ...(patch?.actions !== undefined ? { actions: [...patch.actions] } : {}),
        ...(patch?.state !== undefined ? { state: { ...patch.state } } : {}),
      };
      return entry.session;
    },
    detach(id) {
      const entry = entries.get(id);
      if (!entry) return false;
      drop(entry);
      return true;
    },
    list(deckId) {
      registry.sweep();
      return [...entries.values()]
        .map((entry) => entry.session)
        .filter((session) => deckId === undefined || session.deckId === deckId)
        .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    },
    attached(deckId, action) {
      return registry
        .list(deckId)
        .find((session) => action === undefined || session.actions.includes(action));
    },
    poll(id, timeoutMs) {
      const entry = entries.get(id);
      if (!entry) return Promise.resolve([]);
      registry.heartbeat(id);
      if (entry.queue.length > 0) {
        const commands = entry.queue;
        entry.queue = [];
        return Promise.resolve(commands);
      }
      if (entry.poller) {
        clearTimeout(entry.poller.timer);
        entry.poller.resolve([]);
      }
      return new Promise<SessionCommand[]>((resolve) => {
        const timer = setTimeout(
          () => {
            if (entry.poller?.resolve === resolve) entry.poller = undefined;
            resolve([]);
          },
          Math.max(0, timeoutMs),
        );
        entry.poller = { resolve, timer };
      });
    },
    answer(id, answer) {
      const entry = entries.get(id);
      if (!entry) return false;
      registry.heartbeat(id);
      const waiter = entry.waiters.get(answer.commandId);
      if (!waiter) return false;
      entry.waiters.delete(answer.commandId);
      clearTimeout(waiter.timer);
      if (answer.ok) waiter.resolve(answer.result);
      else waiter.reject(transportError(answer.error));
      return true;
    },
    request(sessionId, action, input, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
      const entry = entries.get(sessionId);
      if (!entry || !fresh(entry)) {
        return Promise.reject(new RangeError(`No attached studio session ${sessionId}`));
      }
      const command: SessionCommand = { id: newId(), action, input, issuedAt: stamp() };
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          entry.waiters.delete(command.id);
          reject(
            new SessionCommandError(
              'Error',
              `the studio session did not answer ${action} within ${timeoutMs} ms`,
              504,
            ),
          );
        }, timeoutMs);
        entry.waiters.set(command.id, { resolve, reject, timer });
        if (entry.poller) {
          const { resolve: wake, timer: pollTimer } = entry.poller;
          entry.poller = undefined;
          clearTimeout(pollTimer);
          wake([command]);
        } else {
          entry.queue.push(command);
        }
      });
    },
    sweep() {
      let dropped = 0;
      for (const entry of [...entries.values()]) {
        if (fresh(entry)) continue;
        drop(entry);
        dropped += 1;
      }
      return dropped;
    },
  };
  return registry;
}
