// @turboslide/chrome: The Prototemplate viewer shell ported as source: tokens.css (--pt-), ToolButton, Seg, Toolbar, Sidebar, ListRow, SidebarFilter, PreviewLayer, HelpCard, Toast, Progress, ThemeButton, useShellKeys, with PORTED_FROM.json recording the source commit per file.
// (SPEC 2.2.)
//
// Scaffold placeholder owned by the "studio and viewer" builder. Replace it with the modules listed
// in MILESTONES M1 Files and add one explicit subpath export per module to package.json
// (SPEC 3.3 item 2: "./validate": "./src/validate.ts", no barrel files). The cross-package
// import below only proves that project references and the exports map resolve; delete it.
import { PACKAGE_NAME as VIEWER } from '@turboslide/viewer/index';

export const PACKAGE_NAME = '@turboslide/chrome' as const;

/** Workspace packages this one may import (SPEC 3.3 item 3, the one-way dependency direction). */
export const DEPENDS_ON = [VIEWER] as const;
