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
  return value as string[];
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
    return JSON.stringify(studioSessions().attach(rest, id));
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
  .handler(async ({ data }): Promise<string> => JSON.stringify(studioSessions().detach(data.id)));

export async function detachStudioSession(input: { id: string }): Promise<boolean> {
  return JSON.parse(await detachFn({ data: JSON.stringify(input) })) as boolean;
}
