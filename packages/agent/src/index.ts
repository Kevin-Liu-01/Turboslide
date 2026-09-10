// @turboslide/agent (SPEC 7.1, 7.4). Import from '@turboslide/agent/dispatch' (the action
// dispatcher) or '@turboslide/agent/generate/*' (the contracts generators); the committed outputs
// are under generated/. No barrel (SPEC 3.3 item 2). This file keeps the scaffold's PACKAGE_NAME
// until every placeholder that imports it is gone; the integrator deletes it with the "./index"
// export.

export const PACKAGE_NAME = '@turboslide/agent' as const;
