// The device flow's grant as an API key (SPEC-3 7.7; polish two, request A-R3). better-auth's
// `/device/token` answers a session token, which the agent surface refuses as a bearer: it takes
// the API keys of tokens.ts. The auth route hands the library's answer to `keyForDeviceGrant`,
// which mints a key for the session's user with the scopes the code asked for, closes that
// session, and answers the key in its place with its record id, the shape `turboslide login`
// stores (apps/cli/src/commands/login.ts). Every other answer passes through unchanged. The
// device flow never grants `admin`: an admin key comes from `admin.bootstrap` or
// `account.tokens.create`.
//
// A device key lives 90 days (HR-SA#5, AUTH-7; HARDENING.md question 27). Keys the flow minted
// before that rule carry no expiry; they expire on DEVICE_KEY_LEGACY_EXPIRY, applied where a key
// is read (tokens.ts `keyExpiry`), so no stored row changes. After its expiry a key is refused
// with the code `key_expired` and the CLI asks for `turboslide login` again.
import type { Scope } from '@turboslide/schema/access';
import { SCOPES } from '@turboslide/schema/access';

import type { ApiKeyStore } from './tokens.ts';

export const DEVICE_TOKEN_PATH = '/api/auth/device/token';
/** The key's name in Profile's list of keys. */
export const DEVICE_KEY_NAME = 'turboslide login';
/** How long a device key lives (HR-SA#5; HARDENING.md question 27). */
const DEVICE_KEY_DAYS = 90;
export const DEVICE_KEY_LIFETIME_MS = DEVICE_KEY_DAYS * 24 * 60 * 60 * 1000;
/**
 * The expiry of a device key minted before HR-SA#5 with none: 90 days after the round
 * (HARDENING.md question 32), applied when the key is read.
 */
export const DEVICE_KEY_LEGACY_EXPIRY = '2027-01-06T00:00:00.000Z';

export type DeviceGrantDeps = {
  keys: Pick<ApiKeyStore, 'create'>;
  /** The user of the session the library just created, or null. */
  findSession: (token: string) => Promise<{ userId: string } | null>;
  deleteSession: (token: string) => Promise<void>;
  now?: () => Date;
};

/** How long a device code waits for its approval: better-auth.ts `DEVICE_EXPIRES` ('30m'). */
export const DEVICE_CODE_LIFETIME_MS = 30 * 60 * 1000;

/** A device code's row as the library keeps it, for what /device shows (HR-SA#5). */
export type DeviceCodeRow = {
  scope?: string | null;
  expiresAt: Date | string;
  status: string;
  userId?: string | null;
};

/**
 * What /device shows for a code in its address (HR-SA#5, AUTH-7): the scopes the key will carry
 * and when the code was made, as `HH:MM UTC`, the same text on the server and in the browser.
 * Null for a code that is not pending, has expired, or another person has claimed.
 */
export function deviceRequestOf(
  row: DeviceCodeRow | null | undefined,
  userId: string,
  now: Date = new Date(),
): { scopes: Scope[]; madeAt: string } | null {
  if (row === null || row === undefined || row.status !== 'pending') return null;
  if (row.userId !== null && row.userId !== undefined && row.userId !== userId) return null;
  const expires = new Date(row.expiresAt).getTime();
  if (!Number.isFinite(expires) || expires <= now.getTime()) return null;
  const made = new Date(expires - DEVICE_CODE_LIFETIME_MS).toISOString();
  return { scopes: deviceScopes(row.scope ?? ''), madeAt: `${made.slice(11, 16)} UTC` };
}

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
  const now = deps.now?.() ?? new Date();
  const { record, secret } = await deps.keys.create({
    userId: found.userId,
    name: DEVICE_KEY_NAME,
    scopes: deviceScopes(body.scope),
    expiresAt: new Date(now.getTime() + DEVICE_KEY_LIFETIME_MS).toISOString(),
    now,
  });
  await deps.deleteSession(token);
  return Response.json(
    {
      access_token: secret,
      token_type: 'Bearer',
      token_id: record.id,
      scope: record.scopes.join(' '),
      principal_id: `usr_${found.userId}`,
      expires_at: record.expiresAt,
    },
    { status: 200, headers: NO_STORE },
  );
}
