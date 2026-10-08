// The device flow's grant as an API key (SPEC-3 7.7; polish two, request A-R3). better-auth's
// `/device/token` answers a session token, which the agent surface refuses as a bearer: it takes
// the API keys of tokens.ts. The auth route hands the library's answer to `keyForDeviceGrant`,
// which mints a key for the session's user with the scopes the code asked for, closes that
// session, and answers the key in its place with its record id, the shape `turboslide login`
// stores (apps/cli/src/commands/login.ts). Every other answer passes through unchanged. The
// device flow never grants `admin`: an admin key comes from `admin.bootstrap` or
// `account.tokens.create`.
import type { Scope } from '@turboslide/schema/access';
import { SCOPES } from '@turboslide/schema/access';

import type { ApiKeyStore } from './tokens.ts';

export const DEVICE_TOKEN_PATH = '/api/auth/device/token';
/** The key's name in Profile's list of keys. */
export const DEVICE_KEY_NAME = 'turboslide login';

export type DeviceGrantDeps = {
  keys: Pick<ApiKeyStore, 'create'>;
  /** The user of the session the library just created, or null. */
  findSession: (token: string) => Promise<{ userId: string } | null>;
  deleteSession: (token: string) => Promise<void>;
  now?: () => Date;
};

/** The scopes of the code's `scope` (RFC 8628 3.1, space separated), less `admin`; `read` when none is left. */
export function deviceScopes(scope: unknown): Scope[] {
  const asked = typeof scope === 'string' ? scope.split(/\s+/) : [];
  const scopes = SCOPES.filter((s) => s !== 'admin' && asked.includes(s));
  return scopes.length > 0 ? scopes : ['read'];
}

const NO_STORE = { 'cache-control': 'no-store', pragma: 'no-cache' } as const;

/** The library's answer to a token poll, with a granted session exchanged for an API key. */
export async function keyForDeviceGrant(
  answer: Response,
  deps: DeviceGrantDeps,
): Promise<Response> {
  if (answer.status !== 200) return answer;
  let body: { access_token?: unknown; scope?: unknown };
  try {
    body = (await answer.clone().json()) as typeof body;
  } catch {
    return answer;
  }
  const token = body.access_token;
  if (typeof token !== 'string' || token.length === 0) return answer;
  const found = await deps.findSession(token);
  if (found === null)
    return Response.json(
      { error: 'server_error', error_description: 'the granted session was not found' },
      { status: 500, headers: NO_STORE },
    );
  const { record, secret } = await deps.keys.create({
    userId: found.userId,
    name: DEVICE_KEY_NAME,
    scopes: deviceScopes(body.scope),
    now: deps.now?.() ?? new Date(),
  });
  await deps.deleteSession(token);
  return Response.json(
    {
      access_token: secret,
      token_type: 'Bearer',
      token_id: record.id,
      scope: record.scopes.join(' '),
      principal_id: `usr_${found.userId}`,
    },
    { status: 200, headers: NO_STORE },
  );
}
