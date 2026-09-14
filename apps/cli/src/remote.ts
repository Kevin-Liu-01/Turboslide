// The hosted side of a CLI command (gslides-parity SPEC-3 3.10 "turboslide --to <studio>"; SPEC 11):
// one action over `POST /api/actions/<id>?deck=<id>` with the credential the hosts file holds for
// the origin (`turboslide login`'s API key, or the deployment's bearer given once with --token),
// the Trusted Sources header when VERCEL_OIDC_TOKEN is in the environment, and the error body of
// SPEC 7.1 mapped to the CLI's classes (a 409 prints the current record as the result, exit 1;
// a 401 names the login path). Nothing here prints a token.
import {
  ConflictError,
  ForbiddenError,
  GoneError,
  NotImplementedError,
} from '@turboslide/schema/errors';

import { flagString } from './args.ts';
import type { CommandContext } from './context.ts';
import { UsageError } from './exit.ts';
import { hostsPath, normalizeHost, resolveToken, saveHostToken } from './hosts.ts';

type ErrorBody = {
  error?: {
    name?: string;
    message?: string;
    status?: number;
    code?: string;
    capability?: string;
    currentRevision?: number;
    current?: unknown;
    milestone?: string;
  };
};

/** The credential for a studio, from --token (saved for next time), the environment or the hosts file. */
export function tokenFor(ctx: CommandContext, url: string): string | undefined {
  const flag = flagString(ctx.args, 'token');
  const { token, source } = resolveToken(url, flag, ctx.env);
  if (source === 'flag' && token !== undefined) {
    const path = saveHostToken(url, token, ctx.env, undefined, { kind: 'bearer' });
    ctx.out.human(`token for ${normalizeHost(url)} saved to ${path}`);
  }
  return token;
}

/**
 * The bearer, plus the Trusted Sources header when VERCEL_OIDC_TOKEN is in the environment, so a
 * command reaches a preview deployment behind Vercel Authentication the way
 * scripts/hosted-smoke.mjs does (docs/hosting.md section 7); neither value is printed.
 */
export function authHeaders(
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const oidc = env.VERCEL_OIDC_TOKEN;
  return {
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    ...(oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {}),
  };
}

export async function readError(
  response: Response,
): Promise<{ message: string; body: ErrorBody['error'] }> {
  let message = `${response.status} ${response.statusText}`.trim();
  let body: ErrorBody['error'];
  try {
    const parsed = (await response.json()) as ErrorBody;
    body = parsed.error;
    if (body?.message) message = body.message;
  } catch {
    // not JSON: the status line is the message
  }
  return { message, body };
}

export function refused(url: string, response: Response, message: string): UsageError {
  const origin = normalizeHost(url);
  if (response.status === 401) {
    return new UsageError(
      `${origin} refused the request: ${message}. Run \`turboslide login --to ${origin}\` for an API key, or pass --token <TURBOSLIDE_TOKEN of the deployment> once; the CLI keeps it in ${hostsPath()}`,
    );
  }
  if (response.status === 413) {
    return new UsageError(
      `${origin} refused the request: ${message}. A Vercel function accepts a 4.5 MB body; store the zip where the studio can read it (the deck store's Blob host) and pass --from-url <url>`,
    );
  }
  return new UsageError(`${origin} answered ${response.status}: ${message}`);
}

export type RemoteOptions = {
  /** The deck the action runs on (`?deck=`); absent for the deck less actions. */
  deck?: string;
  /** `?force=1` past another author's lease. */
  force?: boolean;
  fetchImpl?: typeof fetch;
};

/**
 * Runs one action on a hosted studio and answers its output. A refused input, a stale record,
 * a missing right and a revoked token come back as the CLI's error classes so `runAction` maps
 * them to the exit codes the local path uses.
 */
export async function remoteAction<T = unknown>(
  ctx: CommandContext,
  to: string,
  actionId: string,
  input: unknown,
  options: RemoteOptions = {},
): Promise<T> {
  const origin = normalizeHost(to);
  const url = new URL(`/api/actions/${actionId}`, origin);
  if (options.deck !== undefined) url.searchParams.set('deck', options.deck);
  if (options.force === true) url.searchParams.set('force', '1');
  const token = tokenFor(ctx, to);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      ...authHeaders(token, ctx.env),
      'content-type': 'application/json',
      accept: 'application/json',
      // the author header carries a run id only (SPEC-3 3.10); the server derives the principal
      ...(ctx.author.kind === 'agent' && ctx.author.runId
        ? { 'x-turboslide-author': `agent:${ctx.author.runId}` }
        : {}),
    },
    body: JSON.stringify(input ?? {}),
  });
  if (response.ok) return (await response.json()) as T;
  const { message, body } = await readError(response);
  switch (response.status) {
    case 409:
      throw new ConflictError(message, {
        currentRevision: body?.currentRevision ?? 0,
        ...(body?.current !== undefined ? { current: body.current } : {}),
      });
    case 403:
      throw new ForbiddenError(message, body?.capability);
    case 410:
      throw new GoneError(message);
    case 501:
      throw new NotImplementedError(actionId, body?.milestone ?? 'a later milestone');
    case 400:
      throw new TypeError(message);
    case 404:
      throw new RangeError(message);
    default:
      throw refused(to, response, message);
  }
}
