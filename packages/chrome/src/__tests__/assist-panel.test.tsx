// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssistCard } from '@turboslide/schema/actions';
import { workedDocument } from '@turboslide/schema/fixtures';

import { AssistPanel } from '../panels/Assist';
import { markChangedWords } from '../panels/assist-model';
import { ASSIST } from '../panels/assist-strings';
import { hideTooltip } from '../Tooltip';

// The Assist panel (docs/PRODUCT.md 6.1): the first line, the three starters with a slide
// selected, a card with the before and after and its three buttons, Accept through the dispatch
// with the snackbar's Undo, the fallback sentence, the viewer's disabled sentence and the kill
// switch's sentence. The dispatch is the shell's; the controller's handlers are asserted in
// apps/studio (assist-accept.test.ts) and the server's in server/assist.test.ts.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const document = workedDocument();

const CARD: AssistCard = {
  id: 'card-1',
  intent: 'shorter',
  sentence: 'Slide 5: the text is 12 words shorter',
  rows: [
    {
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      before: 'Every post states what was built, what it cost, and what changed.',
      after: 'Every post states what was built.',
    },
  ],
  mutations: [
    {
      op: 'block.set',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      value: 'Every post states what was built.',
    },
  ],
  deckId: document.deck.id,
  baseRevision: 3,
  expiresAt: '2026-09-19T20:10:00.000Z',
  signature: '0'.repeat(64),
};

function mount(over: Partial<Parameters<typeof AssistPanel>[0]> = {}) {
  const dispatch = vi.fn((action: string) => {
    if (action === 'assist.propose') return Promise.resolve({ cards: [CARD] });
    if (action === 'assist.accept')
      return Promise.resolve({ revision: 4, slideIds: ['content-rule'], sentence: CARD.sentence });
    return Promise.resolve({});
  });
  const say = vi.fn();
  const onTailor = vi.fn();
  const onUndo = vi.fn();
  render(
    <AssistPanel
      document={document}
      slideId="content-rule"
      revision={3}
      dispatch={dispatch}
      canWrite
      onTailor={onTailor}
      say={say}
      onUndo={onUndo}
      onClose={() => undefined}
      {...over}
    />,
  );
  return { dispatch, say, onTailor, onUndo };
}

const control = (id: string) => window.document.querySelector(`[data-control="${id}"]`);

describe('AssistPanel', () => {
  it('shows the first line, the slide and the three starters; Tailor opens the dialog with no call', () => {
    const { dispatch, onTailor } = mount();
    expect(control('panel.assist')).not.toBeNull();
    expect(control('panel.assist.firstLine')?.textContent).toBe(ASSIST.firstLine);
    expect(control('panel.assist.slide')?.textContent).toContain('Slide 5');
    for (const id of ['tailor', 'shorter', 'notes'])
      expect(control(`panel.assist.starter.${id}`)).not.toBeNull();
    fireEvent.click(control('panel.assist.starter.tailor') as HTMLElement);
    expect(onTailor).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('asks for a shorter slide, draws the card with the changed words marked, and Accept writes once with Undo', async () => {
    const { dispatch, say, onUndo } = mount();
    await act(async () => {
      fireEvent.click(control('panel.assist.starter.shorter') as HTMLElement);
    });
    expect(dispatch).toHaveBeenCalledWith('assist.propose', {
      intent: 'shorter',
      prompt: '',
      slideIds: ['content-rule'],
      baseRevision: 3,
    });
    expect(control('panel.assist.card.1')).not.toBeNull();
    expect(control('panel.assist.card.1')?.textContent).toContain(CARD.sentence);
    expect(control('panel.assist.card.1.row.content-rule')).not.toBeNull();
    expect(screen.getByLabelText(ASSIST.before).textContent).toContain('what it cost');
    expect(window.document.querySelectorAll('.is-changed').length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(control('panel.assist.card.1.accept') as HTMLElement);
    });
    expect(dispatch).toHaveBeenCalledWith('assist.accept', { card: CARD, baseRevision: 3 });
    expect(say).toHaveBeenCalledTimes(1);
    const [text, action] = say.mock.calls[0] as [string, { label: string; run: () => void }];
    expect(text).toBe(CARD.sentence);
    expect(action.label).toBe(ASSIST.undo);
    action.run();
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(control('panel.assist.card.1')).toBeNull();
    expect(control('panel.assist.accepted')?.textContent).toBe(CARD.sentence);
  });

  it('types a free ask, Enter sends it, the fallback sentence draws with no write, Dismiss and Change the ask work', async () => {
    const dispatch = vi.fn(() =>
      Promise.resolve({
        cards: [],
        sentence:
          'I can make this slide shorter or write its speaker notes. Tailor for a customer is under Tools',
      }),
    );
    mount({ dispatch });
    const box = control('panel.assist.prompt') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'add a video' } });
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter' });
    });
    expect(dispatch).toHaveBeenCalledWith(
      'assist.propose',
      expect.objectContaining({ intent: 'ask', prompt: 'add a video' }),
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(control('panel.assist.sentence')?.textContent).toContain(
      'shorter or write its speaker notes',
    );
    expect(control('panel.assist.ask')?.textContent).toBe('add a video');
    expect(box.value).toBe('');
  });

  it('draws the viewer’s sentence with no starters and no composer, and the switch’s sentence on a 503', async () => {
    mount({ canWrite: false });
    expect(control('panel.assist.viewer')?.textContent).toBe(ASSIST.viewer);
    expect(control('panel.assist.prompt')).toBeNull();
    cleanup();
    const off = new Error('The assistant is off on this Turboslide') as Error & { status: number };
    off.status = 503;
    const dispatch = vi.fn(() => Promise.reject(off));
    mount({ dispatch });
    await act(async () => {
      fireEvent.click(control('panel.assist.starter.notes') as HTMLElement);
    });
    expect(control('panel.assist.off')?.textContent).toBe(
      'The assistant is off on this Turboslide',
    );
  });

  it('names the restricted presentation in the first line and starts with the finder’s phrase', () => {
    mount({ restricted: true, initialPrompt: 'make it shorter' });
    expect(control('panel.assist.firstLine')?.textContent).toContain(
      'including this restricted presentation',
    );
    expect((control('panel.assist.prompt') as HTMLTextAreaElement).value).toBe('make it shorter');
  });
});

describe('markChangedWords', () => {
  it('marks the words of after that are not in before, and nothing when the texts agree', () => {
    const spans = markChangedWords('The quick brown fox', 'The slow brown fox jumps');
    expect(spans.filter((span) => span.changed).map((span) => span.text.trim())).toEqual([
      'slow',
      'jumps',
    ]);
    expect(markChangedWords('same', 'same').every((span) => !span.changed)).toBe(true);
    expect(
      markChangedWords('', 'all new').every((span) => span.changed || /^\s+$/.test(span.text)),
    ).toBe(true);
  });
});
