// @turboslide/identity (gslides-parity SPEC-3 2.4, 4.1, 6.2, 7; MILESTONES-3 "The seams"). The
// package exports TypeScript source through explicit subpaths, one module each (AGENTS.md, no
// barrel files): '@turboslide/identity/ids' (the three principal id formats),
// '/labels' (the anonymous label), '/hues' (the six live hues), '/names' (the display name
// rules), '/access' (the capability matrix and decide()), '/resolve' (resolvePrincipal),
// '/marks' (markSpec), '/principal' (the record and its stores), '/sha256'. Nothing here imports
// `node:`; scripts/check-client-bundle.mjs is the gate.

export const PACKAGE_NAME = '@turboslide/identity' as const;
