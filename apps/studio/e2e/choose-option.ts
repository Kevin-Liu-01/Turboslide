import type { Page } from '@playwright/test';

// The one way an e2e spec, a probe area or a script drives a dropdown (docs/DROPDOWNS.md 5.1,
// decision C11): the shared dropdown (packages/chrome/src/Select.tsx) has no native select for
// `selectOption`. Type imports alone and waits through locators alone, so Node runs this file
// with its types stripped (scripts/layout-shift-audit.mjs, scripts/probes/core-walk/toolkit.mjs)
// outside the test runner.

/** How long each step waits: the trigger, the list, the close. */
const STEP_MS = 10_000;

/** A CSS string literal's body. */
const quoted = (text: string): string => text.replace(/["\\]/g, '\\$&');

/** The trigger of the dropdown `control`. */
const triggerSelector = (control: string): string =>
  `[data-control="${quoted(control)}"][role="combobox"]`;

/**
 * Chooses an option of the dropdown whose trigger carries `data-control="<control>"`, the way a
 * person does: a click on the trigger, a click on the row whose `data-value` is `choice` (or whose
 * label is `choice.label`), then a wait until the list is closed. Throws naming the control and
 * the options when the row is absent or disabled. Waits through locators alone, so the probe
 * toolkit and the scripts import it outside the test runner.
 */
export async function chooseOption(
  page: Page,
  control: string,
  choice: string | { label: string },
): Promise<void> {
  const trigger = page.locator(`${triggerSelector(control)}:visible`).first();
  await trigger.waitFor({ state: 'visible', timeout: STEP_MS });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const listId = await trigger.getAttribute('aria-controls');
  if (listId === null) throw new Error(`The dropdown "${control}" names no list.`);
  /* an attribute selector, so the ids React's useId writes need no escaping */
  const list = page.locator(`[id="${listId}"][role="listbox"]`);
  await list.waitFor({ state: 'visible', timeout: STEP_MS });
  const rows = list.locator('[role="option"]');
  const row =
    typeof choice === 'string'
      ? rows.and(page.locator(`[data-value="${quoted(choice)}"]`))
      : rows.and(page.locator(`[data-tip="${quoted(choice.label.trim())}"]`));
  if ((await row.count()) === 0) {
    const options = await rows.evaluateAll((each) =>
      each.map(
        (el) => `${el.getAttribute('data-value') ?? ''} (${el.getAttribute('data-tip') ?? ''})`,
      ),
    );
    throw new Error(
      `The dropdown "${control}" has no option ${JSON.stringify(choice)}; it has ${
        options.length === 0 ? 'no options' : options.join(', ')
      }.`,
    );
  }
  const target = row.first();
  if ((await target.getAttribute('aria-disabled')) === 'true')
    throw new Error(`The dropdown "${control}" option ${JSON.stringify(choice)} is disabled.`);
  await target.click({ timeout: STEP_MS });
  /* the list hides as the dropdown closes; a site that removes the field on the choice (the Share
     dialog's expiry field) detaches it, which the wait also accepts */
  await list.waitFor({ state: 'hidden', timeout: STEP_MS });
}
