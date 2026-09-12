import { describe, expect, it } from 'vitest';

import type { PresentKeyContext } from '../presentKeys';
import { presentKeyAction, presentKeyRows } from '../presentKeys';

const ctx: PresentKeyContext = {
  blank: null,
  digits: false,
  control: false,
  editable: false,
  platform: 'mac',
};

// Google's presenting table, every row bound (gslides-parity SPEC 9.2; R04 A10).
describe('presentKeyAction', () => {
  it('stops on Esc and pages with the arrows, Space, Enter, the page keys and Backspace', () => {
    expect(presentKeyAction({ key: 'Escape' }, ctx)).toEqual({ type: 'exit' });
    for (const key of ['ArrowRight', ' ', 'PageDown', 'Enter'])
      expect(presentKeyAction({ key }, ctx)).toEqual({ type: 'next' });
    for (const key of ['ArrowLeft', 'PageUp', 'Backspace'])
      expect(presentKeyAction({ key }, ctx)).toEqual({ type: 'previous' });
    expect(presentKeyAction({ key: 'Home' }, ctx)).toEqual({ type: 'first' });
    expect(presentKeyAction({ key: 'End' }, ctx)).toEqual({ type: 'last' });
  });

  it('collects digits and jumps on Enter', () => {
    expect(presentKeyAction({ key: '7' }, ctx)).toEqual({ type: 'digit', digit: '7' });
    expect(presentKeyAction({ key: 'Enter' }, { ...ctx, digits: true })).toEqual({ type: 'go' });
  });

  it('binds the letters of the table, in either case', () => {
    expect(presentKeyAction({ key: 's' }, ctx)).toEqual({ type: 'notes' });
    expect(presentKeyAction({ key: 'S', shiftKey: true }, ctx)).toEqual({ type: 'notes' });
    expect(presentKeyAction({ key: 'a' }, ctx)).toEqual({ type: 'audience' });
    expect(presentKeyAction({ key: 'l' }, ctx)).toEqual({ type: 'laser' });
    expect(presentKeyAction({ key: 'b' }, ctx)).toEqual({ type: 'blank', blank: 'black' });
    expect(presentKeyAction({ key: '.' }, ctx)).toEqual({ type: 'blank', blank: 'black' });
    expect(presentKeyAction({ key: 'w' }, ctx)).toEqual({ type: 'blank', blank: 'white' });
    expect(presentKeyAction({ key: ',' }, ctx)).toEqual({ type: 'blank', blank: 'white' });
  });

  it('returns from a blank slide on any key and does nothing else', () => {
    const blank = { ...ctx, blank: 'black' as const };
    for (const key of ['ArrowRight', 'b', 'Escape', 'x', ' '])
      expect(presentKeyAction({ key }, blank)).toEqual({ type: 'unblank' });
    /* the chords still work over a blank slide */
    expect(presentKeyAction({ key: 'p', metaKey: true }, blank)).toEqual({ type: 'print' });
  });

  it('binds the three chords on the platform modifier and passes every other chord through', () => {
    expect(presentKeyAction({ key: 'p', metaKey: true }, ctx)).toEqual({ type: 'print' });
    expect(presentKeyAction({ key: 'p', ctrlKey: true }, ctx)).toBeNull();
    expect(presentKeyAction({ key: 'p', ctrlKey: true }, { ...ctx, platform: 'win' })).toEqual({
      type: 'print',
    });
    expect(presentKeyAction({ key: 'C', metaKey: true, shiftKey: true }, ctx)).toEqual({
      type: 'captions',
    });
    expect(presentKeyAction({ key: 'F', metaKey: true, shiftKey: true }, ctx)).toEqual({
      type: 'fullscreen',
    });
    expect(presentKeyAction({ key: 'F11' }, ctx)).toEqual({ type: 'fullscreen' });
    expect(presentKeyAction({ key: 'F11' }, { ...ctx, platform: 'win' })).toEqual({
      type: 'fullscreen',
    });
    expect(presentKeyAction({ key: 'r', metaKey: true }, ctx)).toBeNull();
    expect(presentKeyAction({ key: 'ArrowRight', altKey: true }, ctx)).toBeNull();
  });

  it('swallows the bare keys Google does not list, so the reading keys never act while presenting', () => {
    for (const key of ['g', 'd', 'f', 'p', '?', 'j', 'k', '[', 'ArrowDown'])
      expect(presentKeyAction({ key }, ctx)).toEqual({ type: 'swallow' });
  });

  it('passes modifiers alone, Tab and text fields through, and keeps Enter and Space for a focused control', () => {
    for (const key of ['Shift', 'Meta', 'Control', 'Alt', 'Tab'])
      expect(presentKeyAction({ key }, ctx)).toBeNull();
    expect(presentKeyAction({ key: 'ArrowRight' }, { ...ctx, editable: true })).toBeNull();
    expect(presentKeyAction({ key: 'Enter' }, { ...ctx, control: true })).toBeNull();
    expect(presentKeyAction({ key: ' ' }, { ...ctx, control: true })).toBeNull();
    expect(presentKeyAction({ key: 'ArrowRight' }, { ...ctx, control: true })).toEqual({
      type: 'next',
    });
  });
});

describe('presentKeyRows', () => {
  it('lists every row of the table with the platform modifier', () => {
    const mac = presentKeyRows('mac');
    const win = presentKeyRows('win');
    expect(mac.map((row) => row.action)).toEqual([
      'Stop presenting',
      'Next',
      'Previous',
      'First slide',
      'Last slide',
      'Go to that slide',
      'Open speaker notes',
      'Open audience tools',
      'Toggle laser pointer',
      'Print',
      'Toggle captions',
      'Toggle full screen',
      'Show a blank black slide',
      'Show a blank white slide',
      'Return from a blank slide',
    ]);
    expect(mac.find((row) => row.action === 'Print')?.keys).toBe('Cmd P');
    expect(win.find((row) => row.action === 'Print')?.keys).toBe('Ctrl P');
    expect(win.find((row) => row.action === 'Toggle full screen')?.keys).toBe('F11');
    expect(mac.filter((row) => row.note !== undefined).map((row) => row.action)).toEqual([
      'Open audience tools',
      'Toggle captions',
    ]);
  });
});
