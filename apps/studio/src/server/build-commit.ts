// The commit a build was made from (docs/archive/rounds/POLISH.md section 0 item 1; the row
// `surface.domain.build-commit` and the hosted smoke's "build commit" row). Two sources: the
// platform's VERCEL_GIT_COMMIT_SHA on a git deployment, and the stamp a CLI deploy or
// scripts/check.mjs passes as TURBOSLIDE_BUILD_COMMIT. Each is read as a candidate and the first
// one that is a hex sha wins: a CLI deployment of a detached worktree carries the platform's
// variable as an empty string beside the stamp (the production guard's preview of c6227464, read
// 2026-10-01: both names in the deployment's environment and `instance.commit` null, because the
// empty platform value was taken over the stamp). Null when neither names a sha.

const SHA = /^[0-9a-f]{7,40}$/i;

/** The names read, in rank: the platform's first, then the stamp. */
export const BUILD_COMMIT_SOURCES = ['VERCEL_GIT_COMMIT_SHA', 'TURBOSLIDE_BUILD_COMMIT'] as const;

/** The build's commit from the environment, lower case, or null on a build that carries none. */
export function buildCommit(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  for (const name of BUILD_COMMIT_SOURCES) {
    const value = env[name]?.trim() ?? '';
    if (SHA.test(value)) return value.toLowerCase();
  }
  return null;
}

/**
 * The Vite `define` of both configs (vite.config.ts, vite.deploy.config.ts) for the site footer's
 * build line (components/site/build.ts): the build's commit at seven characters, or null, read
 * once when the build starts.
 */
export function buildDefine(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  return { __TURBOSLIDE_BUILD__: JSON.stringify(buildCommit(env)?.slice(0, 7) ?? null) };
}
