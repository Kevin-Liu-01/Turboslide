import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { setSecurityLogSink } from './log';
import {
  UPLOAD_CONTENT_TYPES,
  UPLOAD_REASONS,
  isSvgRefusal,
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

  it('names the svg sentence of the features round as a whole sentence, and reads the intake’s line', () => {
    // docs/FEATURES.md 4.7; audit-logos 4: the seller's sentence while the raster path is off
    expect(UPLOAD_REASONS.notSvg).toBe(
      'SVG files are not accepted yet. Export the logo as a PNG and upload that',
    );
    expect(UPLOAD_REASONS.notSvg).not.toMatch(/[—]|asset\.add|svg is not accepted here|\.$/);
    expect(uploadFailureReason({ code: 'not_svg', status: 400 })).toBe(UPLOAD_REASONS.notSvg);
    expect(isSvgRefusal('svg is not accepted here; send png, jpeg, webp or gif')).toBe(true);
    expect(isSvgRefusal('The picture could not be uploaded: svg is not accepted here; send png')).toBe(true);
    expect(isSvgRefusal('not an image: expected png, jpeg, webp, gif or svg')).toBe(false);
    expect(isSvgRefusal('the upload did not finish')).toBe(false);
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
