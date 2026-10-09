import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authorize as agentAuthorize } from '@turboslide/agent/http/auth';

import { resolveBearerSync } from './auth/tokens';
import { ticketIdentity } from './bundle-core';
import { setSecurityLogSink } from './log';
import { roomBearerMatches } from './room-bearer';
import {
  RENDER_GRANT_TTL_MS,
  signRenderGrant,
  verifyCancelToken,
  verifyDownloadToken,
  verifyRenderGrant,
  verifyThumbGrant,
} from './tokens';
import { verifyUploadToken } from './upload';

// HR-SA#1 (docs/hardening/HARDENING.md; CLEANUP-1): every check that compared a MAC or a secret
// through node:crypto's compare threw on a value of the right length in characters and another
// length in bytes, and the render route answered 500. Each answers a refusal now, and the route
// answers 401. The values are fake.

const ACCENTS = 'é'.repeat(32);
const NOW = 1_800_000_000_000;

beforeAll(() => setSecurityLogSink(() => undefined));
afterAll(() => setSecurityLogSink(undefined));

describe('a MAC of other bytes at the same length', () => {
  it('is refused by every grant and token check without a throw', () => {
    const exp = NOW + 60_000;
    const target = {
      deckId: 'gt-brand',
      slideId: 's01',
      theme: 'light',
      scale: 1,
      format: 'png',
    } as const;
    expect(verifyRenderGrant(target, `${exp}.${ACCENTS}`, NOW)).toBe(false);
    expect(verifyThumbGrant('gt-brand', `${exp}.viewer.${ACCENTS}`, NOW)).toBeNull();
    expect(verifyCancelToken('job-abc-123', ACCENTS)).toBe(false);
    // the download and upload MACs are 64 and 40 hex characters
    expect(verifyDownloadToken(`e30.${'é'.repeat(64)}`, NOW)).toBeNull();
    expect(verifyUploadToken(`e30.${'é'.repeat(40)}`, NOW)).toBeNull();
    expect(ticketIdentity(`e30.${'é'.repeat(64)}`, 'bundle', 'gt-brand', NOW)).toBeNull();
    // a grant this process signed still verifies
    const signed = signRenderGrant(target, NOW);
    expect(verifyRenderGrant(target, signed, NOW + 1000)).toBe(true);
    expect(verifyRenderGrant(target, signed, NOW + RENDER_GRANT_TTL_MS + 1)).toBe(false);
  });

  it('is refused by the bearer checks without a throw', () => {
    const env = { TURBOSLIDE_TOKEN: 'abcdefgh' };
    expect(resolveBearerSync('éééééééé', { env })).toEqual({
      kind: 'refused',
      reason: 'not_a_key',
    });
    expect(resolveBearerSync('abcdefgh', { env })).toEqual({
      kind: 'bootstrap',
      bootstrapOnly: false,
    });
    const request = (bearer: string) =>
      new Request('https://example.test/api/actions/deck.info', {
        headers: { authorization: `Bearer ${bearer}` },
      });
    expect(agentAuthorize(request('éééé'), { TURBOSLIDE_TOKEN: 'abcd' }).ok).toBe(false);
    expect(agentAuthorize(request('abcd'), { TURBOSLIDE_TOKEN: 'abcd' }).ok).toBe(true);
    const roomEnv = { TURBOSLIDE_ROOM_BEARER: 'room-bearer-of-the-test' };
    expect(roomBearerMatches(request('room-bearer-of-the-test'), roomEnv)).toBe(true);
    expect(roomBearerMatches(request('room-bearer-of-the-tesé'), roomEnv)).toBe(false);
  });
});

describe('GET /api/render/s01 with a grant of 32 é', () => {
  const saved = process.env.TURBOSLIDE_TOKEN;
  beforeAll(() => {
    process.env.TURBOSLIDE_TOKEN = 'fake-bearer-of-the-render-route-test';
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.TURBOSLIDE_TOKEN;
    else process.env.TURBOSLIDE_TOKEN = saved;
  });

  it('answers 401, not 500', async () => {
    const { Route } = await import('../routes/api/render.$slideId');
    type Handler = (input: { params: { slideId: string }; request: Request }) => Promise<Response>;
    const get = (Route.options as unknown as { server: { handlers: { GET: Handler } } }).server
      .handlers.GET;
    const exp = Date.now() + 60_000;
    const url = `https://example.test/api/render/s01?deck=gt-brand&g=${exp}.${encodeURIComponent(ACCENTS)}`;
    const response = await get({ params: { slideId: 's01' }, request: new Request(url) });
    expect(response.status).toBe(401);
  });
});
