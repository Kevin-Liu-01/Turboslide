// @turboslide/theme (SPEC 5.1). This package exports TypeScript source through explicit subpaths
// (SPEC 3.3 item 2): '@turboslide/theme/theme', '/tokens', '/sprite', '/copy', '/css' and the two
// CSS files. This file keeps the scaffold's PACKAGE_NAME so the other packages' scaffold
// placeholders still compile until their owners replace them; the integrator deletes it together
// with the "./index" export once they have.

export const PACKAGE_NAME = '@turboslide/theme' as const;
