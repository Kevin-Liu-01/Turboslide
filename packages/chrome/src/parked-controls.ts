// The parked controls (docs/FEATURES.md 7.2; judge-design rejection 16). The `advanced` flag of
// menus/model.ts reaches a menu row, a toolbar control, a right click entry and a palette entry,
// and the `advancedTools` prop of FormatOptions.tsx reaches a whole section; a control that is
// none of those (an overlay handle or bar, a dialog control, a control inside the Shader section)
// had nothing to hide it, so a matrix row's `parks` naming such an id would have hidden nothing.
// This module is that one place: the set of ids the ship step writes from the ship's parked
// list, and the predicate every such surface reads before it draws a control. The reads are in
// Overlay.tsx (`handle.*`, `bar.*`; B3), dialogs/Logo.tsx and dialogs/ShaderGallery.tsx
// (`dialog.*`; B1) and inspector/shader.tsx (`formatOptions.shader.*`; B5).
//
// The set is data the generator owns: `node scripts/probes/core-matrix.mjs --emit-parked
// docs/gslides-parity/focus/ship-<commit>.json [--check]` (B4, `emitParked`) rewrites the lines
// between the two markers below from the ship's `parkedRows[].parks`, the union sorted, and the
// ship step commits it; a preview built before the runs carries the empty set. Nothing outside
// the markers changes at a ship, and nobody edits the set by hand.
//
// An entry names a control or a family of controls: `dialog.logo.everySlide` hides that check;
// `handle.table.row` hides `handle.table.row.1`, `handle.table.row.2` and every other id under
// it; `bar.table` hides every `bar.table.<command>` button; `formatOptions.shader` hides every
// control of the Shader section. The family rule follows the shape of model.ts's ids, where a
// dot separates a control from its children. Hidden, never disabled and never deleted (the switch
// of docs/FOCUS.md 3.1): with Tools > Advanced tools on, `isParked` is false for every id, so the
// switch still shows a parked control and a driver can drive its row as the evidence for the
// return (docs/FOCUS.md section 8).

/* parked-controls:begin */
// written by scripts/probes/core-matrix.mjs --emit-parked from ship-f0279e1.json; 19 controls
export const PARKED_CONTROLS: ReadonlySet<string> = new Set<string>([
  'bar.table',
  'dialog.background.shader',
  'dialog.background.shader.addToTheme',
  'dialog.logo.kind.wordmark',
  'dialog.logo.tone.mono',
  'dialog.shader.engine.glyph',
  'file.versionHistory.showChanges',
  'formatOptions.shader.frame.capture',
  'formatOptions.shader.frame.scrubber',
  'handle.table.add.column',
  'handle.table.add.row',
  'handle.table.head.column',
  'handle.table.head.row',
  'handle.table.row',
  'panel.brand.logo.find',
  'toolbar.group.text',
  'toolbar.wordart.outline',
  'view.livePointers.collaborators',
  'view.livePointers.mine',
]);
/* parked-controls:end */

/**
 * The one setting the predicate reads: the browser's `advancedTools` (editor-shell.ts
 * `ShellSettings`, which satisfies this shape); `null` or `undefined` reads as the switch off.
 */
export type ParkedSettings = { readonly advancedTools?: boolean | string | undefined } | null;

/**
 * True when `id` is in `parked` or under an entry of `parked`, and the switch is off. Pure, so a
 * test pins the rule over its own set; `isParked` binds the committed set.
 */
export function isParkedIn(
  id: string,
  parked: ReadonlySet<string>,
  settings: ParkedSettings | undefined,
): boolean {
  if (settings?.advancedTools === true) return false;
  if (parked.size === 0) return false;
  if (parked.has(id)) return true;
  let at = id.lastIndexOf('.');
  while (at > 0) {
    if (parked.has(id.slice(0, at))) return true;
    at = id.lastIndexOf('.', at - 1);
  }
  return false;
}

/** True when the control with this `data-control` id is parked for this ship and the switch is off. */
export function isParked(id: string, settings: ParkedSettings | undefined): boolean {
  return isParkedIn(id, PARKED_CONTROLS, settings);
}
