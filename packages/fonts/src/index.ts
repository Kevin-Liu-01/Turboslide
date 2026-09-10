// @turboslide/fonts (SPEC 2.1, 8.4). Import from '@turboslide/fonts/inter' (the font facts, the
// file URLs and the @font-face writers) or the CSS and woff2 exports directly; no barrel (SPEC 3.3
// item 2). This file keeps the scaffold's PACKAGE_NAME so the other packages' scaffold
// placeholders still compile until their owners replace them; the integrator deletes it together
// with the "./index" export once they have.

export const PACKAGE_NAME = '@turboslide/fonts' as const;
