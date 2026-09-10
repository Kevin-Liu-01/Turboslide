// @turboslide/effects: bayer8, ditherRamp, the TypeScript twoTone pipeline with the pinned Lanczos3, the tone LUT, the 1-bit PNG encoder, the plate metrics.
// (SPEC 5.4.)
//
// Scaffold placeholder owned by the "headless, effects and CLI" builder. Replace it with the modules listed
// in MILESTONES M1 Files and add one explicit subpath export per module to package.json
// (SPEC 3.3 item 2: "./validate": "./src/validate.ts", no barrel files). The cross-package
// import below only proves that project references and the exports map resolve; delete it.
import { PACKAGE_NAME as SCHEMA } from '@turboslide/schema/index';

export const PACKAGE_NAME = '@turboslide/effects' as const;

/** Workspace packages this one may import (SPEC 3.3 item 3, the one-way dependency direction). */
export const DEPENDS_ON = [SCHEMA] as const;
