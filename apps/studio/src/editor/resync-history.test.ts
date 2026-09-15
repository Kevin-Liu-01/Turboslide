import { describe, expect, it } from 'vitest';

import { resyncBroughtUnseen } from './resync-history';

// The rule a resync applies to the tab's undo history (build-4/hotfix-4.md section 3.7): the
// history and its clocks stay when the reloaded document lands at or below the revision this tab
// acknowledged, because the tab has applied everything up to it; they are cleared, and the
// external revision banner shows, only when the reload brought revisions the tab never applied.

describe('resyncBroughtUnseen', () => {
  it('a resync at the acknowledged revision brought nothing this tab has not applied', () => {
    // the editor walk's row 21 on the preview: the typing burst acknowledged at r12, the undo
    // write based on r11 by another instance's mirror and refused, the reload at r12
    expect(resyncBroughtUnseen(12, 12)).toBe(false);
  });

  it('a resync below the acknowledged revision (a stream reset behind the tab) brought nothing new', () => {
    expect(resyncBroughtUnseen(11, 12)).toBe(false);
  });

  it('a resync above the acknowledged revision brought entries the tab never applied', () => {
    expect(resyncBroughtUnseen(13, 12)).toBe(true);
    expect(resyncBroughtUnseen(40, 12)).toBe(true);
  });

  it('a fresh deck resyncing at its first revision keeps the history it has', () => {
    expect(resyncBroughtUnseen(0, 0)).toBe(false);
    expect(resyncBroughtUnseen(1, 0)).toBe(true);
  });
});
