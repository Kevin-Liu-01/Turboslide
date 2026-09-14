// `turboslide login --to <url>` and `turboslide logout --to <url>` (gslides-parity SPEC-3 7.7, 0.23;
// research-3 09 6.2; RFC 8628): the device authorization flow against the studio's better-auth
// device plugin. The CLI asks `/api/auth/device/code` for a device code and a user code, prints
// the verification URL and the code (never a token), polls `/api/auth/device/token` at the
// interval the server names until the person approves at `/device`, and stores the API key the
// grant answers in ~/.config/turboslide/hosts.json as `kind: 'api-key'` with the key's record id.
// `logout` revokes that key through `account.tokens.revoke` and forgets the record. The server
// side is B3's (apps/studio/src/server/auth/device.ts); the flow here is tested against a fake.
import type { CommandContext } from '../context.ts';
import { flagNumber, flagString } from '../args.ts';
import { UsageError } from '../exit.ts';
import { forgetHost, hostsPath, normalizeHost, saveHostToken, savedHost } from '../hosts.ts';
import { remoteAction } from '../remote.ts';
import { runAction } from '../write.ts';

export const LOGIN_USAGE = `usage: turboslide login --to <url> [--client <id>] [--timeout <s>]
       turboslide logout --to <url>
  login stores an API key for the studio after you approve the code at <url>/device; logout revokes it.`;

export const DEVICE_CODE_PATH = '/api/auth/device/code';
export const DEVICE_TOKEN_PATH = '/api/auth/device/token';
export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
export const DEFAULT_CLIENT_ID = 'turboslide-cli';

export type DeviceCodeAnswer = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
};

export type DeviceTokenAnswer =
  | {
      access_token: string;
      token_type?: string;
      scope?: string;
      token_id?: string;
      principal_id?: string;
    }
  | {
      error: 'authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token' | string;
      error_description?: string;
    };

export type DeviceFlowOptions = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** How long to wait for the approval; the server's expires_in when absent. */
  timeoutMs?: number;
  clientId?: string;
  log: (line: string) => void;
};

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs the device flow and answers the key and its record id; never logs a token. */
export async function deviceFlow(
  origin: string,
  options: DeviceFlowOptions,
): Promise<{ token: string; tokenId?: string; principalId?: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? sleepMs;
  const clientId = options.clientId ?? DEFAULT_CLIENT_ID;
  const started = await fetchImpl(new URL(DEVICE_CODE_PATH, origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'read comment write export share' }),
  });
  if (!started.ok) {
    throw new UsageError(
      `${origin} does not offer the device flow (${started.status}); sign in there and pass --token once, or ask the deployment's admin for a key`,
    );
  }
  const code = (await started.json()) as DeviceCodeAnswer;
  const url = code.verification_uri_complete ?? code.verification_uri;
  options.log(`Open ${url} and enter the code ${code.user_code}`);
  options.log(
    `Waiting for approval (the code expires in ${Math.round(code.expires_in / 60)} minutes)`,
  );
  let intervalMs = Math.max(1, code.interval ?? 5) * 1000;
  const deadline = Date.now() + (options.timeoutMs ?? code.expires_in * 1000);
  for (;;) {
    if (Date.now() > deadline)
      throw new UsageError('the code expired before it was approved; run turboslide login again');
    await sleep(intervalMs);
    const polled = await fetchImpl(new URL(DEVICE_TOKEN_PATH, origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        grant_type: DEVICE_GRANT,
        device_code: code.device_code,
        client_id: clientId,
      }),
    });
    const answer = (await polled.json()) as DeviceTokenAnswer;
    if ('access_token' in answer) {
      return {
        token: answer.access_token,
        ...(answer.token_id !== undefined ? { tokenId: answer.token_id } : {}),
        ...(answer.principal_id !== undefined ? { principalId: answer.principal_id } : {}),
      };
    }
    switch (answer.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        intervalMs += 5000;
        continue;
      case 'access_denied':
        throw new UsageError('the request was denied at the studio');
      case 'expired_token':
        throw new UsageError('the code expired before it was approved; run turboslide login again');
      default:
        throw new UsageError(
          `the studio answered ${answer.error}${answer.error_description ? `: ${answer.error_description}` : ''}`,
        );
    }
  }
}

export async function login(ctx: CommandContext, fetchImpl?: typeof fetch): Promise<number> {
  const to = flagString(ctx.args, 'to');
  if (to === undefined) throw new UsageError(`login needs --to <url>\n${LOGIN_USAGE}`);
  const origin = normalizeHost(to);
  const timeout = flagString(ctx.args, 'timeout');
  const result = await deviceFlow(origin, {
    ...(fetchImpl !== undefined ? { fetchImpl } : {}),
    ...(timeout !== undefined ? { timeoutMs: flagNumber(ctx.args, 'timeout', 900) * 1000 } : {}),
    ...(flagString(ctx.args, 'client') !== undefined
      ? { clientId: flagString(ctx.args, 'client') }
      : {}),
    log: (line) => ctx.out.human(line),
  });
  const path = saveHostToken(origin, result.token, ctx.env, undefined, {
    kind: 'api-key',
    ...(result.tokenId !== undefined ? { tokenId: result.tokenId } : {}),
    ...(result.principalId !== undefined ? { principalId: result.principalId } : {}),
  });
  ctx.out.result({
    origin,
    kind: 'api-key',
    ...(result.tokenId !== undefined ? { tokenId: result.tokenId } : {}),
    ...(result.principalId !== undefined ? { principalId: result.principalId } : {}),
    path,
  });
  ctx.out.human(`signed in to ${origin}; the key is kept in ${path}`);
  return 0;
}

export async function logout(ctx: CommandContext): Promise<number> {
  const to = flagString(ctx.args, 'to');
  if (to === undefined) throw new UsageError(`logout needs --to <url>\n${LOGIN_USAGE}`);
  const origin = normalizeHost(to);
  const saved = savedHost(origin, ctx.env);
  if (saved === undefined) {
    ctx.out.human(`no credential is stored for ${origin} in ${hostsPath(ctx.env)}`);
    return 0;
  }
  let revoked = false;
  if (saved.kind === 'api-key' && saved.tokenId !== undefined) {
    await runAction(ctx, async () => {
      await remoteAction(ctx, origin, 'account.tokens.revoke', { tokenId: saved.tokenId });
      revoked = true;
    });
  }
  forgetHost(origin, ctx.env);
  ctx.out.result({ origin, revoked, forgotten: true });
  ctx.out.human(`${revoked ? 'key revoked and ' : ''}credential for ${origin} forgotten`);
  return 0;
}
