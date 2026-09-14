/**
 * The Collaborators list from the keyboard (gslides-parity SPEC-3 0.42, 4.5; 01 G5): Shift+Tab
 * from any open menu focuses the roster. The open menu owns the key, so the menu primitive calls
 * this on Shift+Tab after closing itself; the editor key owner calls it too when no menu is open.
 * A DOM query and a click on the `+N` chip, nothing else, so the module has no imports and the
 * menu can depend on it without a cycle. The plate that opens takes focus itself once it is
 * placed (`PlateMenu`); `focusRoster` covers the roster that is already open.
 */
export const ROSTER_TRIGGER = '[data-control="presence.more"]';
export const ROSTER_MENU = '#ts-menu-roster';

const ROSTER_ROWS = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

/** Moves focus to the open roster's first usable row (else the plate); false when no roster is open. */
export function focusRoster(root: ParentNode = document): boolean {
  const menu = root.querySelector<HTMLElement>(ROSTER_MENU);
  if (!menu) return false;
  const first = Array.from(menu.querySelectorAll<HTMLElement>(ROSTER_ROWS)).find(
    (row) => row.getAttribute('aria-disabled') !== 'true' || row.dataset.focusable === '',
  );
  (first ?? menu).focus();
  return true;
}

/**
 * Opens the roster menu when the title row holds the presence slot and moves focus into it;
 * false on a route without the slot.
 */
export function openRoster(root: ParentNode = document): boolean {
  const more = root.querySelector<HTMLButtonElement>(ROSTER_TRIGGER);
  if (!more) return false;
  if (more.getAttribute('aria-expanded') === 'true') focusRoster(root);
  else more.click();
  return true;
}
