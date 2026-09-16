// The print lane's handler module (gslides-parity SPEC-5 6.2 to 6.4; MILESTONES-5 B4 "Owns"),
// landed empty by the integrator on day 0 as the seam of SPEC-5 1.6 and kept empty by the lane:
// the print layout fields of export.run for PDF (layout, paper, orientation, order,
// hideBackground), the ODP format and the SVG mode of render.slide are widened inputs of ids that
// other modules register (`export.run` on the checkout dispatcher in apps/cli/src/commands/mcp.ts
// and on the hosted one in apps/studio/src/server/actions.ts through the render worker's export
// job; `render.slide` in the same two places), so a second registration here would collide. The
// fields travel as the CLI's flags (`export pdf --layout ...`, `export odp`, `render --format svg
// --text`, apps/cli/src/commands/{export,render}.ts) and, hosted, through the worker job's input
// (b4.md section 8.4 request 4). The module stays free of `node:` imports (the editor page imports
// this graph through store-actions.ts).
import type { Dispatcher } from '@turboslide/agent/dispatch';

import type { LaneDeps } from './deps.ts';

/** The handlers this lane registers on a dispatcher; none on day 0. */
export function registerPrintActions(_dispatcher: Dispatcher, _deps: LaneDeps): void {
  // B4 registers the handlers named above here.
}
