// @turboslide/theme: gt-ink-paper: sheet.css ported from head.html lines 11 to 176 under .ts-sheet, stage.css from lines 249 to 258, tokens.ts with the CSS parity test, sprite.ts with the 63 Heroicons and gt-mark, copy.ts. assets/sprite.svg holds the sprite copied out of head.html.
// (SPEC 5.1.)
//
// Scaffold placeholder owned by the "schema and theme" builder. Replace it with the modules listed
// in MILESTONES M1 Files and add one explicit subpath export per module to package.json
// (SPEC 3.3 item 2: "./validate": "./src/validate.ts", no barrel files). The cross-package
// import below only proves that project references and the exports map resolve; delete it.
import { PACKAGE_NAME as SCHEMA } from '@turboslide/schema/index';

export const PACKAGE_NAME = '@turboslide/theme' as const;

/** Workspace packages this one may import (SPEC 3.3 item 3, the one-way dependency direction). */
export const DEPENDS_ON = [SCHEMA] as const;
