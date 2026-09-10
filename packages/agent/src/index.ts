// @turboslide/agent: The action dispatcher and the contracts generator (pnpm generate:contracts): CLI option parsers, the MCP tool list JSON, describe().actions, openapi.json, docs/grammar.md and the skills reference tables, with a stale-file test.
// (SPEC 7.1, 7.4.)
//
// Scaffold placeholder owned by the "schema and theme" builder. Replace it with the modules listed
// in MILESTONES M1 Files and add one explicit subpath export per module to package.json
// (SPEC 3.3 item 2: "./validate": "./src/validate.ts", no barrel files). The cross-package
// import below only proves that project references and the exports map resolve; delete it.
import { PACKAGE_NAME as SCHEMA } from '@turboslide/schema/index';
import { PACKAGE_NAME as RENDER } from '@turboslide/render/index';
import { PACKAGE_NAME as LINT } from '@turboslide/lint/index';
import { PACKAGE_NAME as HEADLESS } from '@turboslide/headless/index';

export const PACKAGE_NAME = '@turboslide/agent' as const;

/** Workspace packages this one may import (SPEC 3.3 item 3, the one-way dependency direction). */
export const DEPENDS_ON = [SCHEMA, RENDER, LINT, HEADLESS] as const;
