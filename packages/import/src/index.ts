// @turboslide/import: Prototemplate deck HTML to the document: parse5 over slides/*.html, import-ids.json, import-report.json.
// (SPEC 9.)
//
// Scaffold placeholder owned by the "render and import" builder. Replace it with the modules listed
// in MILESTONES M1 Files and add one explicit subpath export per module to package.json
// (SPEC 3.3 item 2: "./validate": "./src/validate.ts", no barrel files). The cross-package
// import below only proves that project references and the exports map resolve; delete it.
import { PACKAGE_NAME as SCHEMA } from '@turboslide/schema/index';
import { PACKAGE_NAME as THEME } from '@turboslide/theme/index';

export const PACKAGE_NAME = '@turboslide/import' as const;

/** Workspace packages this one may import (SPEC 3.3 item 3, the one-way dependency direction). */
export const DEPENDS_ON = [SCHEMA, THEME] as const;
