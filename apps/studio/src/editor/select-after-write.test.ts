import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SELECT_OBJECTS_EVENT, keepsPlace, originOf } from './select-after-write';

describe('keepsPlace (the late selection after a write, C2-F21 slides.duplicate.two-selected-menu)', () => {
  it('lets the copy take the selection while the active slide is the one the write was made on', () => {
    expect(keepsPlace('title', 'title', 'title-2')).toBe(true);
  });
  it('lets it stand when the copy is already active', () => {
    expect(keepsPlace('title-2', 'title', 'title-2')).toBe(true);
  });
  it('yields to a card the person picked since the write', () => {
    expect(keepsPlace('split-1', 'title', 'title-2')).toBe(false);
    expect(keepsPlace(null, 'title', 'title-2')).toBe(false);
  });
  it('selects unconditionally when no origin is known (a removed current slide)', () => {
    expect(keepsPlace('anything', null, 'split-3')).toBe(true);
    expect(keepsPlace('anything', undefined, 'split-3')).toBe(true);
  });
});

describe('originOf (the chrome and the window API reach the same handlers)', () => {
  it('reads the chrome off a context that names it and answers agent for everything else', () => {
    expect(originOf({ author: { kind: 'human' }, origin: 'chrome' })).toBe('chrome');
    expect(originOf({ author: { kind: 'human' }, origin: 'agent' })).toBe('agent');
    expect(originOf({ author: { kind: 'human' } })).toBe('agent');
    expect(originOf(undefined)).toBe('agent');
    expect(originOf(null)).toBe('agent');
    expect(originOf({ origin: 'CHROME' })).toBe('agent');
  });
});

describe('SELECT_OBJECTS_EVENT', () => {
  it('is the name the stage listens for in packages/viewer/src/Editor.tsx', () => {
    const editor = readFileSync(
      join(import.meta.dirname, '..', '..', '..', '..', 'packages', 'viewer', 'src', 'Editor.tsx'),
      'utf8',
    );
    expect(SELECT_OBJECTS_EVENT).toBe('turboslide:select-objects');
    expect(editor.includes(`'${SELECT_OBJECTS_EVENT}'`)).toBe(true);
  });
});
