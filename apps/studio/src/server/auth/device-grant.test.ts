import { describe, expect, test } from 'vitest';

import { DEVICE_KEY_NAME, deviceScopes, keyForDeviceGrant } from './device-grant.ts';
import { memoryApiKeyStore } from './tokens.ts';

const SESSION_TOKEN = 'session-token-of-a-test';

function granted(scope = 'read comment write export share'): Response {
  return Response.json({
    access_token: SESSION_TOKEN,
    token_type: 'Bearer',
    expires_in: 600,
    scope,
  });
}

function deps() {
  const keys = memoryApiKeyStore();
  const sessions = new Map([[SESSION_TOKEN, { userId: 'user-1' }]]);
  return {
    keys,
    sessions,
    findSession: (token: string) => Promise.resolve(sessions.get(token) ?? null),
    deleteSession: (token: string) => {
      sessions.delete(token);
      return Promise.resolve();
    },
  };
}

describe('the device grant answers an API key (polish two, request A-R3)', () => {
  test('a granted session becomes a key of its user, and the session is closed', async () => {
    const d = deps();
    const answer = await keyForDeviceGrant(granted(), d);
    expect(answer.status).toBe(200);
    expect(answer.headers.get('cache-control')).toBe('no-store');
    const body = (await answer.json()) as Record<string, string>;
    expect(body['access_token']).toMatch(/^ts_/);
    expect(body['access_token']).not.toBe(SESSION_TOKEN);
    expect(body['token_type']).toBe('Bearer');
    expect(body['principal_id']).toBe('usr_user-1');
    expect(body['scope']).toBe('read comment write export share');
    const record = d.keys.resolveSync(body['access_token'] ?? '');
    expect(record?.id).toBe(body['token_id']);
    expect(record?.userId).toBe('user-1');
    expect(record?.name).toBe(DEVICE_KEY_NAME);
    expect(d.sessions.has(SESSION_TOKEN)).toBe(false);
  });

  test('a poll that is not granted passes through unchanged', async () => {
    const d = deps();
    const pending = Response.json(
      { error: 'authorization_pending', error_description: 'pending' },
      { status: 400 },
    );
    expect(await keyForDeviceGrant(pending, d)).toBe(pending);
    expect(d.keys.countSync()).toBe(0);
    expect(d.sessions.has(SESSION_TOKEN)).toBe(true);
  });

  test('a session the store cannot find answers a server error and mints nothing', async () => {
    const d = deps();
    d.sessions.clear();
    const answer = await keyForDeviceGrant(granted(), d);
    expect(answer.status).toBe(500);
    expect(((await answer.json()) as { error: string }).error).toBe('server_error');
    expect(d.keys.countSync()).toBe(0);
  });

  test('the scopes are the code`s, never admin, and read when none is left', () => {
    expect(deviceScopes('read write admin')).toEqual(['read', 'write']);
    expect(deviceScopes('admin')).toEqual(['read']);
    expect(deviceScopes('nonsense')).toEqual(['read']);
    expect(deviceScopes(undefined)).toEqual(['read']);
    expect(deviceScopes('share  export\tcomment')).toEqual(['comment', 'export', 'share']);
  });
});
