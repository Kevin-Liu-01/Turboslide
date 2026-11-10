// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorOverlayView } from '@turboslide/viewer/Editor';

import type { EditorPresence, PresenceParticipant } from '../editor-shell';
import { RemoteCursors } from '../presence/RemoteCursors';
import type { RemoteCursorsProps } from '../presence/RemoteCursors';

// The collaborators' layer redraws each second so a caret's flag fades with the clock (11 6.5).
// It ticked on every slide, so a person alone in a deck rendered the layer once a second for
// nothing; it ticks while another person is on the shown slide and not otherwise.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const view = { k: 0.5, slideId: 's1', boxes: { blocks: {} } } as unknown as EditorOverlayView;
const viewer = {} as RemoteCursorsProps['viewer'];

const person = (slideId: string): PresenceParticipant => ({
  clientId: 'c2',
  principalId: 'anon_2',
  label: 'Titanium 471',
  trust: 'label',
  kind: 'anonymous',
  role: 'editor',
  hue: 2,
  lastSeenAt: new Date().toISOString(),
  slideId,
});

function layer(others: readonly PresenceParticipant[]) {
  const presence: EditorPresence = { others };
  return (
    <RemoteCursors view={view} presence={presence} viewer={viewer} present={false} body={null} />
  );
}

describe('RemoteCursors', () => {
  it('runs its clock only while another person is on the slide', () => {
    const { rerender } = render(layer([]));
    expect(vi.getTimerCount()).toBe(0);
    /* someone on another slide draws nothing here either */
    rerender(layer([person('s9')]));
    expect(vi.getTimerCount()).toBe(0);
    rerender(layer([person('s1')]));
    expect(vi.getTimerCount()).toBe(1);
    rerender(layer([]));
    expect(vi.getTimerCount()).toBe(0);
  });
});
