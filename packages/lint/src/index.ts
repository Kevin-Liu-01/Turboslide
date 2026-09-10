// @turboslide/lint: The grammar linter: every static rule of SPEC 7.7, the rendered rules over RenderRecords, and lint --chrome as the lint-lines.mjs port in shell mode.
// (SPEC 7.7.)
//
// Scaffold placeholder owned by the "headless, effects and CLI" builder. Replace it with the modules listed
// in MILESTONES M1 Files and add one explicit subpath export per module to package.json
// (SPEC 3.3 item 2: "./validate": "./src/validate.ts", no barrel files). The cross-package
// import below only proves that project references and the exports map resolve; delete it.
import { PACKAGE_NAME as SCHEMA } from '@turboslide/schema/index';
import { PACKAGE_NAME as RENDER } from '@turboslide/render/index';

export const PACKAGE_NAME = '@turboslide/lint' as const;

/** Workspace packages this one may import (SPEC 3.3 item 3, the one-way dependency direction). */
export const DEPENDS_ON = [SCHEMA, RENDER] as const;
