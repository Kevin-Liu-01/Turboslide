import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Tools > Advanced tools, the switch of the focus round (docs/FOCUS.md 3.1; AGENTS.md "The switch
 * of the round"). A parked row is hidden while the switch is off, so a round one or two spec that
 * drives one (Insert > Table, Insert > Chart, File > Download > Turboslide bundle, Help > Help
 * Turboslide improve, Edit > Select none, Arrange > Rotate, View > Guides, the card menu's Change
 * theme and Transition) turns the switch on through the product's own row first and asserts the
 * row behind it, never in the default view (VERIFICATION F21). The setting is remembered per
 * browser under `ts-editor-settings`, so one flip per browser context is enough; Playwright gives
 * every test its own context, so each test that needs a parked row flips it.
 */
export async function advancedToolsOn(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.querySelector('.pt-viewer')?.hasAttribute('data-advanced-tools') === true,
  );
}

/** Flips the switch through Tools > Advanced tools until the root reports `on`; an open menu is closed first. */
export async function setAdvancedTools(page: Page, on: boolean): Promise<void> {
  if ((await advancedToolsOn(page)) === on) return;
  await page.keyboard.press('Escape');
  await page.locator('[data-control="menubar.tools"]').click();
  const row = page.locator('[data-menu-item="tools.advancedTools"]');
  await expect(row, 'Tools > Advanced tools is in the Tools menu').toBeVisible({ timeout: 8000 });
  await row.click();
  await expect
    .poll(() => advancedToolsOn(page), {
      message: `the root ${on ? 'carries' : 'lost'} data-advanced-tools after the row`,
      timeout: 5000,
    })
    .toBe(on);
  /* the menu closes on the pick; a stray open menu would swallow the next click */
  await page.keyboard.press('Escape');
}
