// The font lane's handlers (gslides-parity SPEC-5-amendments A5 item 6; MILESTONES-5 B7 "Owns"):
// font.list answers the catalog (@turboslide/fonts/catalog) with every face's name, category,
// weights, italic and licence; the text style write's `family` field rides the existing
// text.style handler through the schema's Typography. The module stays free of `node:` imports
// (the editor page imports this graph through store-actions.ts), so the catalog rows come from
// the browser safe catalog module and the file bytes never enter here.
import type { Dispatcher } from '@turboslide/agent/dispatch';
import { catalogSummary } from '@turboslide/fonts/catalog';

import type { LaneDeps } from './deps.ts';

/** The one implementation of font.list: the catalog summary in the action's output shape. */
export function fontList(): ReturnType<typeof catalogSummary> {
  return catalogSummary();
}

/** The handlers this lane registers on a dispatcher: font.list, on every transport. */
export function registerFontActions(dispatcher: Dispatcher, _deps: LaneDeps): void {
  dispatcher.register('font.list', () => fontList());
}
