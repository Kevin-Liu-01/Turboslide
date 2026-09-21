import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { setSecurityLogSink } from './log';
import {
  UPLOAD_CONTENT_TYPES,
  UPLOAD_REASONS,
  receiveUpload,
  uploadFailureReason,
  verifyUploadToken,
} from './upload';

// The presigned upload's refusals in the seller's words (the product round, docs/PRODUCT.md
// section 2 rank 10; research 07 rule 22): every refusal the route answers carries one of three
// sentences under `reason`, beside the API's own line, and never a code or an action id.

const state = mkdtempSync(join(tmpdir(), 'turboslide-upload-'));
const previous = {
  store: process.env.TURBOSLIDE_STORE,
  secret: process.env.TURBOSLIDE_DOWNLOAD_SECRET,
  root: process.env.TURBOSLIDE_ROOT,
};

beforeAll(() => {
  setSecurityLogSink(() => undefined);
});

afterAll(() => {
  setSecurityLogSink(undefined);
  rmSync(state, { recursive: true, force: true });
  for (const [key, value] of [
    ['TURBOSLIDE_STORE', previous.store],
    ['TURBOSLIDE_DOWNLOAD_SECRET', previous.secret],
    ['TURBOSLIDE_ROOT', previous.root],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterEach(() => undefined);

describe('the seller’s reason of a refused upload', () => {
  it('names three sentences and maps every refusal to one of them', () => {
    expect(UPLOAD_REASONS.notPicture).toBe('the file is not a picture');
    expect(UPLOAD_REASONS.unfinished).toBe('the upload did not finish');
    expect(UPLOAD_REASONS.tooLarge(25 * 1024 * 1024)).toBe('the file is over 25 MB');
    expect(
      uploadFailureReason({ code: 'payload_too_large', status: 413, maxBytes: 50 * 1024 * 1024 }),
    ).toBe('the file is over 50 MB');
    expect(uploadFailureReason({ code: 'not_picture', status: 400 })).toBe(
      'the file is not a picture',
    );
    expect(uploadFailureReason({ code: 'upload_refused', status: 413 })).toBe(
      'the upload did not finish',
    );
    for (const sentence of [UPLOAD_REASONS.notPicture, UPLOAD_REASONS.unfinished]) {
      expect(sentence).not.toMatch(/[—]|asset\.add|upload_refused|[A-Z]/);
    }
    expect(UPLOAD_CONTENT_TYPES).toEqual(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  });

  it('answers the unfinished sentence for a token the PUT cannot verify', async () => {
    const result = await receiveUpload('not-a-token', null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.sellerReason).toBe('the upload did not finish');
      expect(result.reason).toBe('the upload token is invalid or expired');
    }
    expect(verifyUploadToken('x.y')).toBeNull();
  });
});
