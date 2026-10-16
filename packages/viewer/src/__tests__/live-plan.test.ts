// The rule for playing in the show and the viewer (the shader design 3.2 and 3.8, renamed by the
// HTML slides design 4.2 and 4.5): reduced motion, the person's Off and the slide's hold each hold
// every root; a two-tone root and a root whose engine is missing hold; otherwise the largest root
// that can run plays and every other root holds.
import { describe, expect, it } from 'vitest';

import { editorPlays, livePreferenceOf, planLive } from '../live-plan';
import type { LiveRootFacts, LiveSettings } from '../live-plan';

const root = (area: number, more: Partial<LiveRootFacts> = {}): LiveRootFacts => ({
  still: false,
  engine: true,
  area,
  ...more,
});
const PLAYS: LiveSettings = { reduced: false, preference: 'show', play: 'play' };

describe('planLive', () => {
  const cases: Array<[string, LiveRootFacts[], LiveSettings, string[]]> = [
    ['the largest root plays', [root(10), root(40), root(20)], PLAYS, ['hold', 'play', 'hold']],
    ['reduced motion holds over a deck on play', [root(10)], { ...PLAYS, reduced: true }, ['hold']],
    ['the person’s Off holds', [root(10)], { ...PLAYS, preference: 'off' }, ['hold']],
    ['On plays as In the show only does', [root(10)], { ...PLAYS, preference: 'on' }, ['play']],
    ['a slide on hold holds', [root(10), root(20)], { ...PLAYS, play: 'hold' }, ['hold', 'hold']],
    [
      'a two-tone root holds and the next largest plays',
      [root(40, { still: true }), root(20)],
      PLAYS,
      ['hold', 'play'],
    ],
    ['a root without its engine holds', [root(40, { engine: false })], PLAYS, ['hold']],
    ['an empty slide plans nothing', [], PLAYS, []],
    ['a tie plays the first', [root(0), root(0)], PLAYS, ['play', 'hold']],
  ];
  for (const [name, roots, settings, want] of cases) {
    it(name, () => {
      expect(planLive(roots, settings)).toEqual(want);
    });
  }
});

describe('livePreferenceOf', () => {
  it('reads the three words and takes In the show only for anything else', () => {
    expect(livePreferenceOf('on')).toBe('on');
    expect(livePreferenceOf('off')).toBe('off');
    expect(livePreferenceOf('show')).toBe('show');
    expect(livePreferenceOf(undefined)).toBe('show');
    expect(livePreferenceOf(true)).toBe('show');
  });
});

describe('editorPlays', () => {
  /* docs editor/objects: On moves the selected pattern while you edit; In the show only (the
     default) and Off keep it on its still there (post-deploy review: On and In the show only
     behaved the same in the editor) */
  it('moves the editor’s selected pattern under On alone', () => {
    expect(editorPlays('on')).toBe(true);
    expect(editorPlays('show')).toBe(false);
    expect(editorPlays('off')).toBe(false);
    expect(editorPlays(livePreferenceOf(undefined))).toBe(false);
  });
});
