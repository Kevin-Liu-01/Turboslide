/**
 * Tools > Preferences > Reduce motion and Show tooltips as attributes of the page's root (the
 * Glyphfield port, PLAN.md wave 1 item 7): the one module that stamps the two attributes. The
 * studio root's boot script runs `PREFERENCES_BOOT_STATEMENT` before first paint on every route
 * (the deck list, the trash, the editor, the presenter console and the slideshow), and the editor
 * stamps them again on mount and on each toggle. tokens.css reads the first and the tooltip
 * manager (Tooltip.tsx) the second, so a page where the editor never mounted follows the stored
 * choice too. Reduce motion has an attribute of its own because the
 * landing's Pause Motion owns `data-motion` (home/boot.ts, motion.css). Its name lives in the
 * viewer's reduce-motion.ts, whose `motionReduced()` is the one check in script for both the
 * system setting and this attribute. The editor removes the landing's `data-motion` on mount
 * (`leaveLandingMotion`), so its motion follows Reduce motion alone.
 *
 * Play animated patterns Off is stamped the same way, as `data-hold-live`, and On as
 * `data-play-live` (their names and reader live in the viewer's live-plan.ts), so the show and the
 * viewer hold every live block for the person on any route (the shader design 3.1) and the
 * editor moves its selected pattern under On alone.
 */
import { HOLD_LIVE_ATTRIBUTE, PLAY_LIVE_ATTRIBUTE } from '@turboslide/viewer/live-plan';
import { REDUCE_MOTION_ATTRIBUTE } from '@turboslide/viewer/reduce-motion';

/** Present while Show tooltips is off: the tooltip manager shows no plate. */
export const HIDE_TOOLTIPS_ATTRIBUTE = 'data-hide-tooltips';

/** The three stored settings these attributes stand for (`ts-editor-settings`). */
export type ChromePreferences = {
  readonly reduceMotion?: boolean | string | undefined;
  readonly showTooltips?: boolean | string | undefined;
  readonly playShaders?: boolean | string | undefined;
};

/** Stamps the attributes on the root from the editor's settings; `data-motion` is left alone. */
export function stampPreferences(settings: ChromePreferences): void {
  const root = document.documentElement;
  root.toggleAttribute(REDUCE_MOTION_ATTRIBUTE, settings.reduceMotion === true);
  root.toggleAttribute(HIDE_TOOLTIPS_ATTRIBUTE, settings.showTooltips === false);
  root.toggleAttribute(HOLD_LIVE_ATTRIBUTE, settings.playShaders === 'off');
  root.toggleAttribute(PLAY_LIVE_ATTRIBUTE, settings.playShaders === 'on');
}

/**
 * Removes the landing's Pause Motion (`data-motion="paused"`, home/boot.ts) from the root. A move
 * inside the app from /home carries it along, and the landing's guard (home/motion.css,
 * `animation-play-state: paused` on every element) then holds each menu, panel and dialog of the
 * editor at its first keyframe, at opacity 0. The editor calls it on mount; the landing reads its
 * stored choice again on its next load.
 */
export function leaveLandingMotion(): void {
  document.documentElement.removeAttribute('data-motion');
}

/** Whether Show tooltips is off for this page. */
export function tooltipsHidden(): boolean {
  return document.documentElement.hasAttribute(HIDE_TOOLTIPS_ATTRIBUTE);
}

/** The key the editor stores its settings under (editor-shell.ts `SETTINGS_STORAGE`). */
const SETTINGS_KEY = 'ts-editor-settings';

/**
 * The same stamps as one statement of the studio root's boot script, read from the stored
 * settings under `ts-editor-settings` (editor-shell.ts `SETTINGS_STORAGE`) before first paint, and
 * read again on every `storage` event for that key, so a tab that is already open (the deck list,
 * the trash, the presenter console, another editor) follows a toggle made in another tab without
 * a reload. A cleared storage (the event's null key) clears them.
 */
export const PREFERENCES_BOOT_STATEMENT = `try{var tsPrefs=function(){var p=null;try{p=JSON.parse(localStorage.getItem('${SETTINGS_KEY}')||'null')}catch(e){}var r=document.documentElement;r.toggleAttribute('${REDUCE_MOTION_ATTRIBUTE}',!!p&&p.reduceMotion===true);r.toggleAttribute('${HIDE_TOOLTIPS_ATTRIBUTE}',!!p&&p.showTooltips===false);r.toggleAttribute('${HOLD_LIVE_ATTRIBUTE}',!!p&&p.playShaders==='off');r.toggleAttribute('${PLAY_LIVE_ATTRIBUTE}',!!p&&p.playShaders==='on')};tsPrefs();addEventListener('storage',function(e){if(e.key===null||e.key==='${SETTINGS_KEY}')tsPrefs()})}catch(e){}`;

/** True when a `storage` event may have changed the stored settings (another tab wrote or cleared them). */
export function settingsChanged(event: StorageEvent): boolean {
  return event.key === null || event.key === SETTINGS_KEY;
}
