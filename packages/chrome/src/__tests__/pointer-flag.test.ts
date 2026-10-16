import { describe, expect, it } from 'vitest';

import { COLLAB_GEOMETRY } from '@turboslide/render/collab';
import { SHEET_WIDTH } from '@turboslide/schema/render';

import type { PresenceParticipant } from '../editor-shell';
import { pointerFlagLeft, stepWords } from '../presence/RemoteCursors';
import { doingOf, flagWidthOf } from '../presence/presence-model';

// A remote pointer's name flag sits at the tip's right and moves to its left when it would run
// past the sheet's right edge, so the name stays whole on a phone's 330 px sheet.

const { flag, pointer } = COLLAB_GEOMETRY;

describe('pointerFlagLeft', () => {
  it('keeps the flag at the tip right while it fits on the sheet', () => {
    const k = 0.45;
    expect(pointerFlagLeft(0, k)).toBe(pointer.flagOffset.x);
    const last = SHEET_WIDTH * k - pointer.flagOffset.x - flag.width;
    expect(pointerFlagLeft(last, k)).toBe(pointer.flagOffset.x);
  });

  it('moves the flag to the tip left once it would pass the right edge', () => {
    const k = 0.45;
    const past = SHEET_WIDTH * k - pointer.flagOffset.x - flag.width + 1;
    expect(pointerFlagLeft(past, k)).toBe(-flag.width - 2);
  });

  it('on a phone sheet a pointer past the middle keeps its whole flag on the sheet', () => {
    const k = 330 / SHEET_WIDTH;
    for (const sheetX of [900, 1200, 1580]) {
      const tip = sheetX * k;
      const left = tip + pointerFlagLeft(tip, k);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + flag.width).toBeLessThanOrEqual(SHEET_WIDTH * k);
    }
  });
});

// An agent with a brand mark that names its step (docs/SITE.md D5): its flag reads the step after
// its name, is as wide as its words, keeps the step alone on a stage under 560 px, and a pointer's
// step flag stays whole on the sheet.

const agent = (doing?: string): PresenceParticipant => ({
  clientId: 'c1',
  principalId: 'agent:codex',
  label: 'Codex',
  trust: 'agent',
  kind: 'agent',
  role: 'editor',
  brand: 'codex',
  hue: 3,
  lastSeenAt: new Date().toISOString(),
  ...(doing === undefined ? {} : { doing }),
});

describe('step flags', () => {
  it('read the name and the step, or the step alone on a narrow stage', () => {
    expect(stepWords(agent('adding a chart'), 'Codex', false)?.text).toBe('Codex: adding a chart');
    expect(stepWords(agent('adding a chart'), 'Codex', true)?.text).toBe('Adding a chart');
    expect(stepWords(agent(), 'Codex', false)).toBeNull();
    expect(stepWords({ ...agent('adding a chart'), brand: undefined }, 'Codex', false)).toBeNull();
  });

  it('cut a long step at a word, and grow with their words', () => {
    expect(doingOf(agent('  checking   every number on the chart against the table  '))).toBe(
      'checking every number on the',
    );
    expect(flagWidthOf('Codex')).toBe(flag.width);
    expect(flagWidthOf('Claude Code: cropping the picture')).toBeGreaterThan(flag.width);
  });

  it('beside a pointer stay whole on the sheet at 1280 and on a phone', () => {
    const width = flagWidthOf('Claude Code: cropping the picture');
    for (const k of [726 / SHEET_WIDTH, 330 / SHEET_WIDTH])
      for (const sheetX of [0, 400, 900, 1300, 1580]) {
        const tip = sheetX * k;
        const left = tip + pointerFlagLeft(tip, k, Math.min(width, SHEET_WIDTH * k));
        expect(left).toBeGreaterThanOrEqual(0);
      }
  });
});
