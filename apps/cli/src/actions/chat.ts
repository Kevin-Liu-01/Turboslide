// The chat lane's handlers (gslides-parity SPEC-5 10, 0.46; MILESTONES-5 B5 "Owns"): chat.send,
// chat.list and chat.clear over the room's operation stream. The stream, the caller's role and
// the rate rows live on the hosted studio (server/room.ts is the room, `@turboslide/realtime/
// admission` the pure caps), so the handlers take a `ChatPort` the hosted composition injects
// (`SpellingLaneDeps` takes the spelling engine the same way); a checkout has no room, so a
// dispatcher composed without the port answers the sentence naming `--to <studio>`, the way the
// CLI answers every hosted only action. The module stays free of `node:` imports (the editor
// page imports this graph through store-actions.ts). Nothing here is checkpointed or written to
// `decks/<id>/`: the port appends to the stream and reads it back.
import type { Dispatcher } from '@turboslide/agent/dispatch';

import type { LaneDeps } from './deps.ts';

/** One chat message as `chat.list` answers it (SPEC-5 13): the author's label beside the id. */
export type ChatMessageRow = {
  id: string;
  principalId: string;
  label: string;
  text: string;
  at: string;
};

/**
 * The room's chat surface a hosted composition injects (the room's `admitChat`, its stream read
 * and its clear; `apps/studio/src/server/actions.ts` builds it from `roomFor(deckId)` with the
 * request's identity). `send` applies the caps, the role and the rate rows and rejects with a
 * status bearing error the transports already map; `clear` is the owner's.
 */
export type ChatPort = {
  send: (text: string) => Promise<{ id: string; at: string }>;
  list: (since?: string) => Promise<ChatMessageRow[]>;
  clear: () => Promise<{ cleared: number }>;
};

export type ChatLaneDeps = LaneDeps & { chat?: ChatPort };

/** The refusal of a dispatcher without a room: the checkout's sentence. */
export function noChatRoom(id: string): string {
  return `${id} runs on a hosted studio's room: pass --to <url> (turboslide login --to <url> stores the key)`;
}

export type ChatSendInput = { text: string; studio?: string };
export type ChatListInput = { since?: string };

export async function chatSend(
  deps: ChatLaneDeps,
  input: ChatSendInput,
): Promise<{ id: string; at: string }> {
  if (deps.chat === undefined) throw new Error(noChatRoom('chat.send'));
  return deps.chat.send(input.text);
}

export async function chatList(
  deps: ChatLaneDeps,
  input: ChatListInput,
): Promise<{ messages: ChatMessageRow[] }> {
  if (deps.chat === undefined) throw new Error(noChatRoom('chat.list'));
  return { messages: await deps.chat.list(input.since) };
}

export async function chatClear(deps: ChatLaneDeps): Promise<{ cleared: number }> {
  if (deps.chat === undefined) throw new Error(noChatRoom('chat.clear'));
  return deps.chat.clear();
}

export function registerChatActions(dispatcher: Dispatcher, deps: ChatLaneDeps): void {
  dispatcher.register('chat.send', (input) => chatSend(deps, input as ChatSendInput));
  dispatcher.register('chat.list', (input) => chatList(deps, (input ?? {}) as ChatListInput));
  dispatcher.register('chat.clear', () => chatClear(deps));
}
