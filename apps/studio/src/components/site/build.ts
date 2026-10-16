/**
 * The build's commit as the footer prints it (docs/SITE.md, the footer). The Vite configs define
 * `__TURBOSLIDE_BUILD__` at build time from server/build-commit.ts (VERCEL_GIT_COMMIT_SHA, else
 * the TURBOSLIDE_BUILD_COMMIT stamp the production guard passes as a build variable), cut to
 * seven characters, or null. Where nothing defines it (vitest) it reads as null.
 */
declare const __TURBOSLIDE_BUILD__: string | null | undefined;

export const BUILD_COMMIT: string | null =
  typeof __TURBOSLIDE_BUILD__ === 'string' && __TURBOSLIDE_BUILD__ !== ''
    ? __TURBOSLIDE_BUILD__
    : null;
