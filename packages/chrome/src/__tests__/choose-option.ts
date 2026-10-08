import { fireEvent } from '@testing-library/react';

// The unit helper of the dropdown (docs/DROPDOWNS.md 5.4): the chrome's unit tests choose an
// option the way a person does, through the DOM of Select.tsx, where they called fireEvent.change
// on a native select before. Not a test file: vitest runs `*.test.ts(x)` alone.

/** The rows of the listbox a trigger's aria-controls names, as `value (label)` for an error. */
function rowsOf(list: Element | null): string {
  if (list === null) return 'no list';
  const rows = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]')).map(
    (row) => `${row.dataset.value ?? ''} (${row.getAttribute('data-tip') ?? row.textContent})`,
  );
  return rows.length === 0 ? 'no options' : rows.join(', ');
}

/** Opens the dropdown `control` with a click and clicks the option `choice`, through the DOM a person uses. */
export function chooseOption(
  control: string,
  choice: string | { label: string },
  root: ParentNode = document,
): void {
  const trigger = Array.from(
    root.querySelectorAll<HTMLElement>('[data-control][role="combobox"]'),
  ).find((element) => element.getAttribute('data-control') === control);
  if (trigger === undefined) throw new Error(`No dropdown has data-control "${control}".`);
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  const listId = trigger.getAttribute('aria-controls');
  const list = listId === null ? null : trigger.ownerDocument.getElementById(listId);
  const rows =
    list === null ? [] : Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
  const wanted = typeof choice === 'string' ? choice : choice.label.trim();
  const row = rows.find((each) =>
    typeof choice === 'string'
      ? each.dataset.value === wanted
      : (each.getAttribute('data-tip') ?? each.textContent).trim() === wanted,
  );
  if (row === undefined)
    throw new Error(
      `The dropdown "${control}" has no option ${JSON.stringify(choice)}; it has ${rowsOf(list)}.`,
    );
  if (row.getAttribute('aria-disabled') === 'true')
    throw new Error(`The dropdown "${control}" option ${JSON.stringify(choice)} is disabled.`);
  fireEvent.click(row);
}
