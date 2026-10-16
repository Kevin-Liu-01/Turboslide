import { describe, expect, it } from 'vitest';

import { leaveWarning } from './leave-warning';

// The leave warning (SPEC-3 0.7, 3.6): on the server backend a leave with operations pending asks
// for the browser's leave prompt; on the tab backend of /try, which /home frames, no leave asks,
// since nothing there is saved beyond the tab.

/** Dispatches one cancelable `beforeunload` at the listener, as a window does; answers the event. */
function leave(listener: (event: BeforeUnloadEvent) => void): Event {
  const target = new EventTarget();
  target.addEventListener('beforeunload', (event) => listener(event));
  const event = new Event('beforeunload', { cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('leaveWarning', () => {
  it('asks on the server backend while operations are pending', () => {
    expect(leave(leaveWarning({ kind: 'server' }, () => 2)).defaultPrevented).toBe(true);
  });

  it('asks nothing on the server backend once nothing is pending', () => {
    expect(leave(leaveWarning({ kind: 'server' }, () => 0)).defaultPrevented).toBe(false);
  });

  it('never asks on the tab backend, pending or not', () => {
    expect(leave(leaveWarning({ kind: 'tab' }, () => 3)).defaultPrevented).toBe(false);
    expect(leave(leaveWarning({ kind: 'tab' }, () => 0)).defaultPrevented).toBe(false);
  });
});
