// @turboslide/viewer: React: Stage, Sheet, SlideView, GridView, BookView, theme boot, keys, hash sync; standalone/ is the framework-free tail.html port used by renderStandalone.
// (SPEC 5.5, 2.1.)
//
// Scaffold placeholder owned by the "studio and viewer" builder. Replace it with the modules listed
// in MILESTONES M1 Files and add one explicit subpath export per module to package.json
// (SPEC 3.3 item 2: "./validate": "./src/validate.ts", no barrel files). The cross-package
// import below only proves that project references and the exports map resolve; delete it.
import { PACKAGE_NAME as RENDER } from '@turboslide/render/index';
import { PACKAGE_NAME as EFFECTS } from '@turboslide/effects/index';

export const PACKAGE_NAME = '@turboslide/viewer' as const;

/** Workspace packages this one may import (SPEC 3.3 item 3, the one-way dependency direction). */
export const DEPENDS_ON = [RENDER, EFFECTS] as const;
