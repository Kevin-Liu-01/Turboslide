// @turboslide/headless: Playwright driver over the full Chrome for Testing binary: the Metal and SwiftShader flag sets, the readiness wait, the overflow scan, 1x and 2x screenshots, the RenderRecord with renderer and rasters.
// (SPEC 5.3.)
//
// Scaffold placeholder owned by the "headless, effects and CLI" builder. Replace it with the modules listed
// in MILESTONES M1 Files and add one explicit subpath export per module to package.json
// (SPEC 3.3 item 2: "./validate": "./src/validate.ts", no barrel files). The cross-package
// import below only proves that project references and the exports map resolve; delete it.
import { PACKAGE_NAME as RENDER } from '@turboslide/render/index';
import { PACKAGE_NAME as EFFECTS } from '@turboslide/effects/index';

export const PACKAGE_NAME = '@turboslide/headless' as const;

/** Workspace packages this one may import (SPEC 3.3 item 3, the one-way dependency direction). */
export const DEPENDS_ON = [RENDER, EFFECTS] as const;
