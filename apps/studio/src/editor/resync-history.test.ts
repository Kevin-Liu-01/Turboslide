import { describe, expect, it } from 'vitest';

import { acknowledgeAnswered, resyncBroughtUnseen } from './resync-history';

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

describe('acknowledgeAnswered', () => {
  it("the tab's own server side write answered r9: the reload for it at r9 brought nothing unseen", () => {
    // asset.add or logo.insert on the blob tier: the tab acknowledged r8, the store answered r9,
    // and the tab reloads at once for the write instead of waiting for the channel's poll
    const known = acknowledgeAnswered(8, 9);
    expect(known).toBe(9);
    expect(resyncBroughtUnseen(9, known)).toBe(false);
  });

  it("another writer's entry landed with it: the reload at r10 brought entries the tab never applied", () => {
    expect(resyncBroughtUnseen(10, acknowledgeAnswered(8, 9))).toBe(true);
  });

  it('an answer without a revision changes nothing', () => {
    expect(acknowledgeAnswered(8, undefined)).toBe(8);
    expect(acknowledgeAnswered(8, null)).toBe(8);
    expect(acknowledgeAnswered(8, '9')).toBe(8);
    expect(acknowledgeAnswered(8, Number.NaN)).toBe(8);
  });

  it("an answer below what the tab acknowledged (a mirror's number) never lowers it", () => {
    expect(acknowledgeAnswered(12, 11)).toBe(12);
    expect(acknowledgeAnswered(12, 12)).toBe(12);
  });
});
