import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { KEY_ROWS, keyAction } from '../keys';

const ctx = { mode: 'slide' as const, digits: false, editable: false };

// The deck's key table (SPEC 6.9; tail.html keydown).
describe('keyAction', () => {
  it('pages with the arrows, Space, PageDown and the vim letters', () => {
    for (const key of ['ArrowRight', ' ', 'PageDown', 'j', 'l'])
      expect(keyAction({ key }, ctx)).toEqual({ type: 'next' });
    for (const key of ['ArrowLeft', 'PageUp', 'k', 'h', 'Backspace'])
      expect(keyAction({ key }, ctx)).toEqual({ type: 'prev' });
  });

  it('pages with Down and Up in the book only', () => {
    expect(keyAction({ key: 'ArrowDown' }, ctx)).toBeNull();
    expect(keyAction({ key: 'ArrowDown' }, { ...ctx, mode: 'book' })).toEqual({ type: 'next' });
    expect(keyAction({ key: 'ArrowUp' }, { ...ctx, mode: 'book' })).toEqual({ type: 'prev' });
  });

  it('collects digits and jumps on Enter', () => {
    expect(keyAction({ key: '1' }, ctx)).toEqual({ type: 'digit', digit: '1' });
    expect(keyAction({ key: 'Enter' }, ctx)).toBeNull();
    expect(keyAction({ key: 'Enter' }, { ...ctx, digits: true })).toEqual({ type: 'go' });
  });

  it('maps the letters and Escape', () => {
    expect(keyAction({ key: 'g' }, ctx)).toEqual({ type: 'grid' });
    expect(keyAction({ key: 'b' }, ctx)).toEqual({ type: 'book' });
    expect(keyAction({ key: 'd' }, ctx)).toEqual({ type: 'theme' });
    expect(keyAction({ key: 'p' }, ctx)).toEqual({ type: 'present' });
    expect(keyAction({ key: 'f' }, ctx)).toEqual({ type: 'fullscreen' });
    expect(keyAction({ key: '?' }, ctx)).toEqual({ type: 'help' });
    expect(keyAction({ key: '[' }, ctx)).toEqual({ type: 'sidebar' });
    expect(keyAction({ key: 's' }, ctx)).toEqual({ type: 'sidebar' });
    expect(keyAction({ key: 'Home' }, ctx)).toEqual({ type: 'first' });
    expect(keyAction({ key: 'End' }, ctx)).toEqual({ type: 'last' });
    expect(keyAction({ key: 'Escape' }, ctx)).toEqual({ type: 'escape' });
  });

  it('passes modifier combinations through and only Escape inside a field', () => {
    expect(keyAction({ key: 'g', metaKey: true }, ctx)).toBeNull();
    expect(keyAction({ key: 'g' }, { ...ctx, editable: true })).toBeNull();
    expect(keyAction({ key: 'Escape' }, { ...ctx, editable: true })).toEqual({ type: 'escape' });
  });

  it('is what the standalone runtime handles', () => {
    const runtime = readFileSync(new URL('../../standalone/runtime.ts', import.meta.url), 'utf8');
    const needed = [
      "'ArrowRight'",
      "'PageDown'",
      "'ArrowLeft'",
      "'PageUp'",
      "'Backspace'",
      "'Home'",
      "'End'",
      "'g'",
      "'b'",
      "'d'",
      "'p'",
      "'f'",
      "'?'",
      "'['",
      "'s'",
      "'Escape'",
      "'j'",
      "'l'",
      "'k'",
      "'h'",
    ];
    for (const token of needed) expect(runtime).toContain(`k === ${token}`);
    expect(KEY_ROWS.length).toBe(12);
  });
});
