// @turboslide/schema (SPEC 4, 7.1). This package exports TypeScript source through explicit
// subpaths, one module each (SPEC 3.3 item 2): import from '@turboslide/schema/validate',
// '@turboslide/schema/actions' and so on, never from here. This file keeps the scaffold's
// PACKAGE_NAME so the other packages' scaffold placeholders still compile until their owners
// replace them; the integrator deletes it together with the "./index" export once they have.

export const PACKAGE_NAME = '@turboslide/schema' as const;
