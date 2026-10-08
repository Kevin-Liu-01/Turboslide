// The shared dropdown's slot in the viewer (docs/DROPDOWNS.md 3.13, decision C9): the chrome
// depends on the viewer, so the viewer cannot import `Select` from packages/chrome. It declares
// the props its link popover draws a dropdown with and a context the studio fills with the chrome's
// `Select` (apps/studio/src/editor/EditorRoot.tsx). With no provider (the viewer's unit tests) the
// context holds null and the popover draws no dropdown. `Select.tsx` imports this type and
// `select.test.tsx` assigns `Select` to `ComponentType<SelectSlotProps>`, so the two cannot drift.
import { createContext } from 'react';
import type { ComponentType } from 'react';

/** One row of the list: the value onChange reports, the words of the row and the trigger. */
export type SelectSlotOption = {
  value: string;
  label: string;
  /** a second line under the label */
  description?: string;
  /** skipped by the keys and the pointer */
  disabled?: boolean;
};

/** Rows that belong together: a divider before every group but the first, and a heading when named. */
export type SelectSlotGroup = {
  heading?: string;
  options: readonly SelectSlotOption[];
};

/** The props of `Select` (packages/chrome/src/Select.tsx, DROPDOWNS.md 3.1) the viewer draws with. */
export type SelectSlotProps = {
  /** the chosen value; a value no option carries shows the placeholder */
  value: string;
  options: readonly (SelectSlotOption | SelectSlotGroup)[];
  /** a different option was chosen */
  onChange: (value: string) => void;
  /** the accessible name */
  label: string;
  /** the trigger's data-control; each option takes `<control>.<value>` */
  control?: string;
  /** 32 px for dialogs, panels and pages; 22 px for the inspector's rows */
  size?: 'field' | 'compact';
  /** the trigger's words while no option carries the value */
  placeholder?: string;
  /** classes on the trigger, for the site's layout */
  className?: string;
};

/** The dropdown the studio hands the viewer; null where nobody provides one. */
export const SelectSlot = createContext<ComponentType<SelectSlotProps> | null>(null);
