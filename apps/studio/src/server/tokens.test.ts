import { afterEach, describe, expect, it } from 'vitest';

import { setSecurityLogSink } from './log';
import type { SecurityLine } from './log';
import {
  DOWNLOAD_SECRET_ENV,
  DOWNLOAD_SECRET_MIN_BYTES,
  MissingSecretError,
  downloadSecret,
  downloadSecretStatus,
} from './tokens';

// TURBOSLIDE_DOWNLOAD_SECRET required on a hosted store (gslides-parity SPEC-3 8.10, 11.4, 11.5
// R0; report 04 F19): a `tmp` or `blob` process without the variable fails at its first token
// with a MissingSecretError and one `config.missing` line, a checkout keeps the random per process
// key, and the status a health probe reads never carries the value. The fixture secrets are
// obviously fake.

const FAKE = 'fake-download-secret-for-the-test-00';

let lines: SecurityLine[] = [];

afterEach(() => {
  setSecurityLogSink(undefined);
  lines = [];
});

describe('downloadSecret', () => {
  it('reads the variable when set, on every store', () => {
    for (const store of ['file', 'tmp']) {
      const secret = downloadSecret({ TURBOSLIDE_STORE: store, [DOWNLOAD_SECRET_ENV]: FAKE });
      expect(secret.toString('utf8')).toBe(FAKE);
    }
  });

  it('is one random value per process on a checkout without the variable (b6 FR1)', () => {
    /* the docblock's rule: random per process, not per call. Two calls in one process answer
       the same 32 bytes, so a grant signed at the POST verifies at the PUT; per call, every
       presigned upload on a checkout answered 403 (security.spec.ts's upload row on the check
       chain's server) */
    const a = downloadSecret({ TURBOSLIDE_STORE: 'file' });
    const b = downloadSecret({ TURBOSLIDE_STORE: 'file' });
    expect(a.byteLength).toBe(32);
    expect(a.equals(b)).toBe(true);
    // no store variable and no VERCEL is the checkout too, and the same value
    expect(downloadSecret({}).equals(a)).toBe(true);
  });

  it('refuses a hosted store without the variable and logs config.missing once per call', () => {
    setSecurityLogSink((line) => lines.push(line));
    expect(() => downloadSecret({ TURBOSLIDE_STORE: 'tmp' })).toThrow(MissingSecretError);
    expect(() => downloadSecret({ VERCEL: '1' })).toThrow(/TURBOSLIDE_DOWNLOAD_SECRET must be set/);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      event: 'config.missing',
      reason: `${DOWNLOAD_SECRET_ENV} unset`,
    });
    // the explicit hosted flag decides when the caller knows better than the environment
    expect(() => downloadSecret({}, true)).toThrow(MissingSecretError);
    expect(downloadSecret({ TURBOSLIDE_STORE: 'tmp' }, false).byteLength).toBe(32);
  });

  it('refuses a short secret on a hosted store and keeps it on a checkout', () => {
    setSecurityLogSink((line) => lines.push(line));
    const short = 'x'.repeat(DOWNLOAD_SECRET_MIN_BYTES - 1);
    expect(() => downloadSecret({ TURBOSLIDE_STORE: 'tmp', [DOWNLOAD_SECRET_ENV]: short })).toThrow(
      /at least 16 bytes/,
    );
    expect(lines[0]).toMatchObject({
      event: 'config.missing',
      reason: `${DOWNLOAD_SECRET_ENV} too short`,
    });
    expect(
      downloadSecret({ TURBOSLIDE_STORE: 'file', [DOWNLOAD_SECRET_ENV]: short }).toString(),
    ).toBe(short);
    const exact = 'y'.repeat(DOWNLOAD_SECRET_MIN_BYTES);
    expect(
      downloadSecret({ TURBOSLIDE_STORE: 'tmp', [DOWNLOAD_SECRET_ENV]: exact }).toString(),
    ).toBe(exact);
    // the error carries the variable name and never the value
    try {
      downloadSecret({ TURBOSLIDE_STORE: 'tmp', [DOWNLOAD_SECRET_ENV]: short });
    } catch (error) {
      expect(error).toBeInstanceOf(MissingSecretError);
      expect((error as MissingSecretError).variable).toBe(DOWNLOAD_SECRET_ENV);
      expect((error as MissingSecretError).status).toBe(500);
      expect((error as Error).message).not.toContain(short);
    }
  });

  it('reports set and required without the value', () => {
    expect(downloadSecretStatus({ TURBOSLIDE_STORE: 'tmp', [DOWNLOAD_SECRET_ENV]: FAKE })).toEqual({
      variable: DOWNLOAD_SECRET_ENV,
      set: true,
      required: true,
    });
    expect(downloadSecretStatus({ TURBOSLIDE_STORE: 'file' })).toEqual({
      variable: DOWNLOAD_SECRET_ENV,
      set: false,
      required: false,
    });
    expect(JSON.stringify(downloadSecretStatus({ [DOWNLOAD_SECRET_ENV]: FAKE }))).not.toContain(
      FAKE,
    );
  });
});

import { describe as describe2, expect as expect2, it as it2 } from 'vitest';

import {
  CANCEL_TOKEN_QUERY,
  cancelTokenFor,
  signThumbGrant,
  verifyCancelToken,
  verifyThumbGrant,
} from './tokens';

describe2('the cancel token and the thumbnail grant (SPEC-3 8.13)', () => {
  it2(
    'spells the cancel query as download.ts does and verifies only the job it was minted for',
    () => {
      // download.ts carries the literal because it runs in the browser; the two must agree
      expect2(CANCEL_TOKEN_QUERY).toBe('ct');
      const token = cancelTokenFor('job-abc-123');
      expect2(token).toMatch(/^[0-9a-f]{32}$/);
      expect2(verifyCancelToken('job-abc-123', token)).toBe(true);
      expect2(verifyCancelToken('job-abc-124', token)).toBe(false);
      // a tampered token: the last digit flipped to one that differs (a fixed replacement matched
      // the original one run in sixteen; the integrator at merge 2)
      const flipped = token.endsWith('0') ? `${token.slice(0, 31)}1` : `${token.slice(0, 31)}0`;
      expect2(verifyCancelToken('job-abc-123', flipped)).toBe(false);
      expect2(verifyCancelToken('job-abc-123', null)).toBe(false);
      expect2(() => cancelTokenFor('not a job id!')).toThrow(TypeError);
    },
  );

  it2('signs a thumbnail grant for a deck and a role for ten minutes', () => {
    const now = 1_000_000;
    const grant = signThumbGrant('q4-review', 'viewer', now);
    expect2(verifyThumbGrant('q4-review', grant, now + 1000)).toEqual({
      deckId: 'q4-review',
      role: 'viewer',
      exp: now + 10 * 60 * 1000,
    });
    expect2(verifyThumbGrant('other-deck', grant, now)).toBeNull();
    expect2(verifyThumbGrant('q4-review', grant, now + 11 * 60 * 1000)).toBeNull();
    expect2(verifyThumbGrant('q4-review', grant.replace('viewer', 'editor'), now)).toBeNull();
    expect2(verifyThumbGrant('q4-review', undefined, now)).toBeNull();
  });
});

import { describe as describe3, expect as expect3, it as it3 } from 'vitest';

import {
  RENDER_GRANT_QUERY,
  RENDER_GRANT_TTL_MS,
  renderFileName,
  signRenderGrant,
  verifyRenderGrant,
} from './tokens';
import type { RenderGrantTarget } from './tokens';

describe3('the render grant (docs/RETURN.md 2.19; audit-surface rows 27 and 28)', () => {
  const target: RenderGrantTarget = {
    deckId: 'q4-review',
    slideId: 'title',
    theme: 'light',
    scale: 2,
    format: 'jpg',
  };

  it3('spells the query as render.ts appends it and signs one picture for ten minutes', () => {
    expect3(RENDER_GRANT_QUERY).toBe('g');
    expect3(RENDER_GRANT_TTL_MS).toBe(10 * 60 * 1000);
    const now = 1_000_000;
    const grant = signRenderGrant(target, now);
    expect3(grant).toMatch(/^\d+\.[0-9a-f]{32}$/);
    expect3(verifyRenderGrant(target, grant, now + 1000)).toBe(true);
    expect3(verifyRenderGrant(target, grant, now + RENDER_GRANT_TTL_MS)).toBe(true);
    expect3(verifyRenderGrant(target, grant, now + RENDER_GRANT_TTL_MS + 1)).toBe(false);
  });

  it3(
    'refuses every other picture: another deck, slide, theme, scale or format, a missing or tampered grant',
    () => {
      const now = 1_000_000;
      const grant = signRenderGrant(target, now);
      expect3(verifyRenderGrant({ ...target, deckId: 'other-deck' }, grant, now)).toBe(false);
      expect3(verifyRenderGrant({ ...target, slideId: 'split-3' }, grant, now)).toBe(false);
      expect3(verifyRenderGrant({ ...target, theme: 'dark' }, grant, now)).toBe(false);
      expect3(verifyRenderGrant({ ...target, scale: 1 }, grant, now)).toBe(false);
      expect3(verifyRenderGrant({ ...target, format: 'png' }, grant, now)).toBe(false);
      expect3(verifyRenderGrant(target, null, now)).toBe(false);
      expect3(verifyRenderGrant(target, undefined, now)).toBe(false);
      expect3(verifyRenderGrant(target, '', now)).toBe(false);
      expect3(verifyRenderGrant(target, grant.slice(0, -1), now)).toBe(false);
      // the last digit flipped to one that differs (the cancel token test's own shape)
      const flipped = grant.endsWith('0') ? `${grant.slice(0, -1)}1` : `${grant.slice(0, -1)}0`;
      expect3(verifyRenderGrant(target, flipped, now)).toBe(false);
      // a moved expiry: the mac covers it
      const [exp, mac] = grant.split('.');
      expect3(verifyRenderGrant(target, `${Number(exp) + 60_000}.${mac}`, now)).toBe(false);
      // the ids must be slugs before anything is signed or checked
      expect3(() => signRenderGrant({ ...target, deckId: '../x' }, now)).toThrow(TypeError);
      expect3(verifyRenderGrant({ ...target, slideId: 'a/b' }, grant, now)).toBe(false);
    },
  );

  it3('names the attachment after the deck and the slide with the format as its extension', () => {
    expect3(renderFileName(target)).toBe('q4-review-title.jpg');
    expect3(renderFileName({ ...target, format: 'png', scale: 1 })).toBe('q4-review-title.png');
  });
});
