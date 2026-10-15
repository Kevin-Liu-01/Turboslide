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
 * system setting and this attribute.
 */
import { REDUCE_MOTION_ATTRIBUTE } from '@turboslide/viewer/reduce-motion';

/** Present while Show tooltips is off: the tooltip manager shows no plate. */
export const HIDE_TOOLTIPS_ATTRIBUTE = 'data-hide-tooltips';

/** The two stored settings these attributes stand for (`ts-editor-settings`). */
export type ChromePreferences = {
  readonly reduceMotion?: boolean | string | undefined;
  readonly showTooltips?: boolean | string | undefined;
};

/** Stamps both attributes on the root from the editor's settings; `data-motion` is left alone. */
export function stampPreferences(settings: ChromePreferences): void {
  const root = document.documentElement;
  root.toggleAttribute(REDUCE_MOTION_ATTRIBUTE, settings.reduceMotion === true);
  root.toggleAttribute(HIDE_TOOLTIPS_ATTRIBUTE, settings.showTooltips === false);
}

/** Whether Show tooltips is off for this page. */
export function tooltipsHidden(): boolean {
  return document.documentElement.hasAttribute(HIDE_TOOLTIPS_ATTRIBUTE);
}

/**
 * The same stamps as one statement of the studio root's boot script, read from the stored
 * settings under `ts-editor-settings` (editor-shell.ts `SETTINGS_STORAGE`) before first paint.
 */
export const PREFERENCES_BOOT_STATEMENT = `try{var p=JSON.parse(localStorage.getItem('ts-editor-settings')||'null'),r=document.documentElement;if(p&&p.reduceMotion===true)r.setAttribute('${REDUCE_MOTION_ATTRIBUTE}','');if(p&&p.showTooltips===false)r.setAttribute('${HIDE_TOOLTIPS_ATTRIBUTE}','')}catch(e){}`;
