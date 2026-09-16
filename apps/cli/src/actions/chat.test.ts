import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext } from '@turboslide/agent/dispatch';
import { describe, expect, test } from 'vitest';

import type { ChatLaneDeps, ChatMessageRow, ChatPort } from './chat.ts';
import { noChatRoom, registerChatActions } from './chat.ts';

// chat.send, chat.list and chat.clear through the dispatcher (gslides-parity SPEC-5 10, 13): the
// input validated by the action's schema, the port called with the text, the output validated by
// the action's output schema, and the refusal of a dispatcher composed without a room (a
// checkout). The room itself is the hosted studio's (server/room.ts); the port here is a table.

const context: ActionContext = { author: { kind: 'human', name: 'Maya' } };

function fakePort(): ChatPort & { messages: ChatMessageRow[] } {
  const messages: ChatMessageRow[] = [];
  return {
    messages,
    async send(text) {
      const row = {
        id: `chat_${messages.length + 1}`,
        principalId: 'anon_1',
        label: 'Maya',
        text,
        at: `2026-09-15T10:0${messages.length}:00.000Z`,
      };
      messages.push(row);
      return { id: row.id, at: row.at };
    },
    async list(since) {
      return since === undefined ? [...messages] : messages.filter((m) => m.at > since);
    },
    async clear() {
      const cleared = messages.length;
      messages.length = 0;
      return { cleared };
    },
  };
}

function dispatcherWith(port: ChatPort | undefined) {
  const dispatcher = createDispatcher();
  registerChatActions(dispatcher, { chat: port } as ChatLaneDeps);
  return dispatcher;
}

describe('chat over the room port', () => {
  test('sends, lists since a time and clears, each answer in the action schema', async () => {
    const port = fakePort();
    const dispatcher = dispatcherWith(port);
    const first = (await dispatcher.dispatch(
      'chat.send',
      { text: 'Pricing slide is ready' },
      context,
    )) as {
      id: string;
      at: string;
    };
    expect(first).toEqual({ id: 'chat_1', at: '2026-09-15T10:00:00.000Z' });
    await dispatcher.dispatch('chat.send', { text: 'Second' }, context);
    const all = (await dispatcher.dispatch('chat.list', {}, context)) as {
      messages: ChatMessageRow[];
    };
    expect(all.messages.map((m) => m.text)).toEqual(['Pricing slide is ready', 'Second']);
    const since = (await dispatcher.dispatch('chat.list', { since: first.at }, context)) as {
      messages: ChatMessageRow[];
    };
    expect(since.messages.map((m) => m.text)).toEqual(['Second']);
    expect(await dispatcher.dispatch('chat.clear', {}, context)).toEqual({ cleared: 2 });
    expect(port.messages).toEqual([]);
  });
  test('refuses an empty or over long text before the port sees it', async () => {
    const port = fakePort();
    const dispatcher = dispatcherWith(port);
    await expect(dispatcher.dispatch('chat.send', { text: '' }, context)).rejects.toThrow();
    await expect(
      dispatcher.dispatch('chat.send', { text: 'x'.repeat(4001) }, context),
    ).rejects.toThrow();
    expect(port.messages).toEqual([]);
  });
  test('a checkout without a room answers the --to sentence', async () => {
    const dispatcher = dispatcherWith(undefined);
    await expect(dispatcher.dispatch('chat.send', { text: 'hi' }, context)).rejects.toThrow(
      noChatRoom('chat.send'),
    );
    await expect(dispatcher.dispatch('chat.list', {}, context)).rejects.toThrow(/--to <url>/);
    await expect(dispatcher.dispatch('chat.clear', {}, context)).rejects.toThrow(/hosted studio/);
  });
});
