// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { HOLD_LIVE_ATTRIBUTE, pagePreference } from '@turboslide/viewer/live-plan';
import { REDUCE_MOTION_ATTRIBUTE } from '@turboslide/viewer/reduce-motion';

import {
  HIDE_TOOLTIPS_ATTRIBUTE,
  PREFERENCES_BOOT_STATEMENT,
  settingsChanged,
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
  root().removeAttribute(HOLD_LIVE_ATTRIBUTE);
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

  it('a tab already open follows another tab’s write and a cleared storage, without a reload', () => {
    boot();
    expect(root().hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(false);
    /* another tab turns Reduce motion on and Show tooltips off */
    localStorage.setItem(
      SETTINGS_STORAGE,
      JSON.stringify({ reduceMotion: true, showTooltips: false }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_STORAGE }));
    expect(root().hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(true);
    expect(tooltipsHidden()).toBe(true);
    /* a write under another key changes nothing */
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify({}));
    window.dispatchEvent(new StorageEvent('storage', { key: 'gt-theme' }));
    expect(root().hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(true);
    /* then turns them back, and a cleared storage clears both */
    window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_STORAGE }));
    expect(root().hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(false);
    expect(tooltipsHidden()).toBe(false);
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify({ reduceMotion: true }));
    window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_STORAGE }));
    expect(root().hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(true);
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(root().hasAttribute(REDUCE_MOTION_ATTRIBUTE)).toBe(false);
  });

  it('reads the key the editor stores its settings under', () => {
    expect(PREFERENCES_BOOT_STATEMENT).toContain(`'${SETTINGS_STORAGE}'`);
    expect(settingsChanged(new StorageEvent('storage', { key: SETTINGS_STORAGE }))).toBe(true);
    expect(settingsChanged(new StorageEvent('storage', { key: null }))).toBe(true);
    expect(settingsChanged(new StorageEvent('storage', { key: 'gt-theme' }))).toBe(false);
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

  /* Play animated patterns Off holds every live block in the show and the viewer (the shader
     design 3.1): the boot statement and the editor stamp it, and live-plan.ts reads it */
  it('stamps Play animated patterns Off as the hold attribute, from the record and the settings', () => {
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify({ playShaders: 'off' }));
    boot();
    expect(pagePreference()).toBe('off');
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify({ playShaders: 'on' }));
    window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_STORAGE }));
    expect(pagePreference()).toBe('show');
    stampPreferences({ playShaders: 'off' });
    expect(root().hasAttribute(HOLD_LIVE_ATTRIBUTE)).toBe(true);
    stampPreferences({ playShaders: 'show' });
    expect(root().hasAttribute(HOLD_LIVE_ATTRIBUTE)).toBe(false);
  });
});
