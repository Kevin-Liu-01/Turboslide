// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { REDUCE_MOTION_ATTRIBUTE } from '@turboslide/viewer/reduce-motion';

import {
  HIDE_TOOLTIPS_ATTRIBUTE,
  PREFERENCES_BOOT_STATEMENT,
  stampPreferences,
  tooltipsHidden,
} from '../chrome-preferences';
import { SETTINGS_STORAGE } from '../editor-shell';

// Tools > Preferences > Reduce motion and Show tooltips as the root's attributes (the Glyphfield
// port, PLAN.md wave 1 item 7): the studio root's boot script stamps both from the stored settings
// before first paint on every route, so a page where the editor never mounted (the deck list, the
// trash, the presenter console) follows them, and neither touches the landing's data-motion.

const root = () => document.documentElement;

/* the boot statement as the root's inline script runs it */
const boot = () => {
  new Function(PREFERENCES_BOOT_STATEMENT)();
};

afterEach(() => {
  localStorage.clear();
  root().removeAttribute(REDUCE_MOTION_ATTRIBUTE);
  root().removeAttribute(HIDE_TOOLTIPS_ATTRIBUTE);
  delete root().dataset.motion;
});

describe('the preference stamps', () => {
  it('the boot statement stamps both from the record the editor stores, and nothing without one', () => {
    boot();
    expect(root().hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(false);
    expect(tooltipsHidden()).toBe(false);
    localStorage.setItem(
      SETTINGS_STORAGE,
      JSON.stringify({ reduceMotion: true, showTooltips: false }),
    );
    boot();
    expect(root().hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(true);
    expect(tooltipsHidden()).toBe(true);
  });

  it('the boot statement survives a broken record', () => {
    localStorage.setItem(SETTINGS_STORAGE, '{');
    expect(boot).not.toThrow();
    expect(root().hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(false);
  });

  it("stamps and clears both from the settings, leaving the landing's Pause Motion", () => {
    root().dataset.motion = 'paused';
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify({ reduceMotion: true }));
    boot();
    expect(root().dataset.motion).toBe('paused');
    stampPreferences({ reduceMotion: false, showTooltips: false });
    expect(root().hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(false);
    expect(tooltipsHidden()).toBe(true);
    stampPreferences({ reduceMotion: true, showTooltips: true });
    expect(root().hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(true);
    expect(tooltipsHidden()).toBe(false);
    expect(root().dataset.motion).toBe('paused');
  });
});
