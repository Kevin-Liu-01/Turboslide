// Presence and sync on a checkout with no server (gslides-parity SPEC-3 3.10, 3.11, 4.11): the
// CLI holds no room, so `presence list` answers the caller alone as the roster (its computed mark,
// no slide, nothing followed) and `sync status` reads the file store's revision on the `memory`
// tier over the `file` transport with the stream disconnected. Follow, unfollow and the pointer
// act through an attached studio page on the hosted transports; on a checkout without one they
// refuse with the sentence that names what is missing, except the pointer's persistence on the
// principal record, which the CLI writes so the next editor session on this checkout reads it.
import type { Author } from '@turboslide/schema/mutations';

import type { LocalPrincipalRecord } from './principal.ts';
import {
  displayNameOf,
  localMarkSpec,
  readLocalPrincipal,
  trustOf,
  writeLocalPrincipal,
} from './principal.ts';

export type PresenceDeps = {
  deckId: string;
  stateDir: string;
  author: Author;
  principalId: string;
  revision: () => Promise<number> | number;
  now?: () => string;
};

export type Participant = {
  clientId: string;
  principalId: string;
  kind: 'human' | 'agent';
  label: string;
  trust: 'label' | 'guest' | 'verified' | 'agent';
  mark: Record<string, unknown>;
  role?: 'viewer' | 'commenter' | 'editor' | 'owner';
  slideId?: string;
  selection?: {
    blockIds: string[];
    caret?: { blockId: string; path: string; range: [number, number] };
  };
  pointer?: { x: number; y: number };
  following?: string;
  presenting: boolean;
  idle: boolean;
  lastSeenAt: string;
};

/** The caller as a participant: the CLI's one client on this checkout. */
export function selfParticipant(deps: PresenceDeps, record: LocalPrincipalRecord): Participant {
  const now = deps.now?.() ?? new Date().toISOString();
  return {
    clientId: `cli:${process.pid}`,
    principalId: deps.principalId,
    kind: deps.author.kind,
    label: displayNameOf(record),
    trust: trustOf(record),
    mark: localMarkSpec(record),
    role: 'owner',
    presenting: false,
    idle: false,
    lastSeenAt: now,
  };
}

export function presenceList(deps: PresenceDeps): {
  deckId: string;
  cap: 20;
  pointersVisible: boolean;
  self: Participant;
  others: Participant[];
} {
  const record = readLocalPrincipal(deps.stateDir, deps.principalId);
  return {
    deckId: deps.deckId,
    cap: 20,
    pointersVisible: record.livePointers.collaborators,
    self: selfParticipant(deps, record),
    others: [],
  };
}

export const NO_PAGE_SENTENCE =
  'no studio page is attached to this deck; open it in the editor, or run the command with --to <studio> against a hosted deck';

export function presenceFollow(): never {
  throw new TypeError(`presence.follow acts through an attached page: ${NO_PAGE_SENTENCE}`);
}

export function presenceUnfollow(): never {
  throw new TypeError(`presence.unfollow acts through an attached page: ${NO_PAGE_SENTENCE}`);
}

/** The own pointer switch, persisted per deck on the principal record (SPEC-3 4.6). */
export function presencePointer(deps: PresenceDeps, input: { on: boolean }): { on: boolean } {
  const now = deps.now?.() ?? new Date().toISOString();
  const record = readLocalPrincipal(deps.stateDir, deps.principalId, now);
  record.livePointers.mine[deps.deckId] = input.on;
  record.lastSeenAt = now;
  writeLocalPrincipal(deps.stateDir, record);
  return { on: input.on };
}

export async function syncStatus(deps: PresenceDeps): Promise<{
  seq: number;
  revision: number;
  pending: number;
  retained: number;
  tier: 'memory' | 'redis' | 'blob';
  transport: 'sse' | 'poll' | 'file';
  connected: boolean;
}> {
  return {
    seq: 0,
    revision: await deps.revision(),
    pending: 0,
    retained: 0,
    tier: 'memory',
    transport: 'file',
    connected: false,
  };
}
