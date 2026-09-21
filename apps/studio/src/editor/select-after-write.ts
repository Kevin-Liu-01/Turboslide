import type { Author } from '@turboslide/schema/mutations';

/**
 * Whether the slide a write asks to select afterwards (the copy of Duplicate slide, the slide of
 * New slide) may still take the selection (the focus round's cycle 3 merge, VERIFICATION C2-F21
 * `slides.duplicate.two-selected-menu`; b7's C3-R6). The controller selects that slide once the
 * server has acknowledged the write, which on the memory tier is the checkpoint's two second
 * idle, so a card the person clicked in between was overridden by the late selection: two cards
 * picked after Cmd+D collapsed to the copy and the Slide menu's Duplicate copied one slide. The
 * late selection lands only while the person has not moved on, that is while the active slide
 * is still the one that was active when the write was made or already the target itself.
 */
export function keepsPlace(
  active: string | null | undefined,
  from: string | null | undefined,
  target: string,
): boolean {
  if (active === target) return true;
  if (from === null || from === undefined) return true;
  return active === from;
}

// ---------------------------------------------------------------------------------------------
// The origin of a dispatch and the selection after an insert (the product round, docs/PRODUCT.md
// section 2 rank 1; build/b3.md)

/**
 * Who called a window action: the chrome's own dispatch (the menus, the toolbar, the pickers,
 * through `controller.invoke`) or the window API (the two owners' adapters, which an agent or a
 * driver runs). Both reach the same handlers with the same author; a handler that places an
 * object for a person or selects it afterwards reads which one called, because an agent's
 * `block.insert` names its own box and keeps it, and nothing steals the person's selection when
 * an agent writes.
 */
export type ActionOrigin = 'chrome' | 'agent';

/** The dispatcher's context with the origin on it; the agent package's `ActionContext` carries the author alone. */
export type StudioActionContext = { author: Author; origin: ActionOrigin };

/** The origin a handler reads off its context; a context without one is an agent's (the strict contract). */
export function originOf(context: unknown): ActionOrigin {
  if (typeof context === 'object' && context !== null && 'origin' in context) {
    const origin = (context as { origin?: unknown }).origin;
    if (origin === 'chrome') return 'chrome';
  }
  return 'agent';
}

/**
 * The window event the controller sends once a chrome insert has committed, so the stage selects
 * the new object (the ring, the eight handles, the chip and its tail) as Google does after
 * Insert > Chart or Insert > Table. `packages/viewer/src/Editor.tsx` listens for it under the
 * same name (the viewer cannot import the studio and the studio does not import the stage's
 * component module, so the name is repeated there; select-after-write.test.ts pins both).
 */
export const SELECT_OBJECTS_EVENT = 'turboslide:select-objects';

export type SelectObjectsDetail = {
  deckId: string;
  slideId: string;
  blockIds: string[];
};
