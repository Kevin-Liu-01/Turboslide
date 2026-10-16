import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TAB_ONLY } from '@turboslide/chrome/menus/strings';

import { TabOnlyError } from '../editor/backend';
import { createEditorController } from '../editor/controller';
import type { EditorController } from '../editor/controller';
import { heroDocument } from './hero-deck';
import { createTabBackend } from './tab-backend';
import type { TabPerson } from './tab-backend';

// The tab backend (docs/SITE.md D3, C.4): two headless editor controllers, the visitor and Claude
// Code, on one tab room; a write of one reaches the other, comments add, reply and resolve,
// checkpoints make version rows, and the features that need the server answer the tab's sentence.
// `fetch` throws for the whole file, so any call that would leave the tab fails the test.

const visitor: TabPerson = {
  author: {
    kind: 'human',
    name: 'Cobalt 118',
    principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  },
  role: 'owner',
  trust: 'label',
  hue: 1,
};
const claude: TabPerson = {
  author: { kind: 'agent', name: 'Claude Code', principalId: 'agent:claude-code' },
  role: 'editor',
  trust: 'agent',
  hue: 6,
  brand: 'claude-code',
};

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const from = Date.now();
  while (!check()) {
    if (Date.now() - from > ms) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function revisionOf(controller: EditorController): number {
  const snap = controller.getSnapshot();
  return Math.max(snap.serverRevision, snap.document.deck.revision, snap.sync?.revision ?? 0);
}

describe('the tab backend', () => {
  const fetchStub = vi.fn(() => {
    throw new Error('a request left the tab');
  });
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchStub);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs two editors on one room in the tab, with comments and versions, and nothing leaves it', async () => {
    const deckId = 'try-test';
    const { backend, room, payloadFor } = createTabBackend({
      deckId,
      document: heroDocument(deckId),
      people: [visitor, claude],
      tabOnly: {
        sentence: TAB_ONLY.sentence,
        dialogs: ['share'],
        action: { label: 'New Presentation', run: () => undefined },
      },
      openPage: () => undefined,
      checkpointIdleMs: 50,
    });
    const mine = createEditorController({
      deckId,
      author: visitor.author,
      payload: payloadFor(visitor),
      backend,
    });
    const agent = createEditorController({
      deckId,
      author: claude.author,
      payload: payloadFor(claude),
      backend,
    });
    mine.start();
    agent.start();
    agent.reportPresence({ slideId: 'title', pointer: { x: 400, y: 300 }, pointerOn: true });
    mine.reportPresence({ slideId: 'agenda', pointerOn: true });

    /* the agent's chip reaches the visitor's roster with its brand and its hue */
    await until(() =>
      mine.getSnapshot().roster.some((row) => row.principalId === 'agent:claude-code'),
    );
    const row = mine
      .getSnapshot()
      .roster.find((entry) => entry.principalId === 'agent:claude-code');
    expect(row?.kind).toBe('agent');
    expect(row?.hueSlot).toBe(5);
    expect((row?.mark as { brand?: string }).brand).toBe('claude-code');

    /* a write through the page API's path reaches the other editor */
    const adapter = agent.editorAdapter();
    await adapter.invoke?.('text.insert', {
      slideId: 'agenda',
      blockId: 'h',
      path: '/text',
      at: 6,
      text: ' today',
      baseRevision: revisionOf(agent),
    });
    await until(() => {
      const slide = mine.getSnapshot().document.slides.agenda as unknown as {
        slots: { left: { text?: string }[] };
      };
      return slide.slots.left[0]?.text === 'Agenda today';
    });

    /* a comment, a reply and a resolve, all in the tab */
    const added = (await adapter.invoke?.('comment.add', {
      anchor: { kind: 'slide', slideId: 'title' },
      body: { text: 'Shorter title?', mentions: [] },
    })) as { thread: { id: string } };
    await until(() => mine.getSnapshot().comments.threads.length === 1);
    await mine.invoke('comment.reply', {
      threadId: added.thread.id,
      body: { text: 'Done.', mentions: [] },
    });
    await mine.invoke('comment.resolve', { threadId: added.thread.id });
    await until(() => mine.getSnapshot().comments.threads[0]?.resolved !== undefined);
    expect(mine.getSnapshot().comments.threads[0]?.replies).toHaveLength(1);

    /* the checkpoint moves the revision and Version history lists it */
    await until(() => room.versions().length >= 1);
    const versions = await backend.listVersions({ deckId });
    expect(versions[0]?.author.name).toBe('Claude Code');
    await until(() => revisionOf(mine) >= 1);

    /* what needs the server answers the sentence */
    await expect(
      backend.runDeckAction({ deckId, action: 'share.get', input: {}, author: visitor.author }),
    ).rejects.toThrow(TabOnlyError);
    await expect(
      backend.startExport({ deckId, input: { format: 'pptx' } } as never),
    ).rejects.toThrow(TAB_ONLY.sentence);

    mine.stop();
    agent.stop();
    room.stop();
    expect(fetchStub).not.toHaveBeenCalled();
  }, 20_000);
});
