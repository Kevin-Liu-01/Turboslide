import { describe, expect, it } from 'vitest';

import {
  MEDIA_DATA_URL_THRESHOLD_BYTES,
  MEDIA_NEEDS_BLOB_SENTENCE,
  MEDIA_NEEDS_PRIVATE_STORE_SENTENCE,
  MEDIA_UPLOAD_CONTENT_TYPES,
  PRESIGN_THRESHOLD_BYTES,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_KEY_PATTERN,
  isMediaUploadType,
  mediaSniffMatches,
  mediaUploadBackend,
  verifyUploadToken,
} from './upload';

// The media grant's pure rules (gslides-parity SPEC-5 0.18, 3.3; R11 1.5, 1.8, 2 rule 3): the
// five types the grant admits beside the picture four, the backend per tier and private token,
// the data URL threshold, the container match of the local PUT and the token shape.

describe('the media upload types (R11 1.5)', () => {
  it('admits the five media mimes on the media grant and keeps the picture grant at four', () => {
    expect([...MEDIA_UPLOAD_CONTENT_TYPES]).toEqual([
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
    ]);
    expect([...UPLOAD_CONTENT_TYPES]).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
    ]);
    expect(isMediaUploadType('video/webm')).toBe(true);
    expect(isMediaUploadType('video/quicktime')).toBe(false);
    expect(isMediaUploadType('image/png')).toBe(false);
    expect(MEDIA_DATA_URL_THRESHOLD_BYTES).toBe(PRESIGN_THRESHOLD_BYTES);
    expect(MEDIA_DATA_URL_THRESHOLD_BYTES).toBe(3 * 1024 * 1024);
  });

  it('matches a sniffed container against the declared type and refuses a QuickTime brand under video/mp4', () => {
    expect(
      mediaSniffMatches({ container: 'isobmff', brand: 'isom', compatible: [] }, 'video/mp4'),
    ).toBe(true);
    expect(
      mediaSniffMatches({ container: 'isobmff', brand: 'M4A ', compatible: [] }, 'audio/mp4'),
    ).toBe(true);
    expect(
      mediaSniffMatches({ container: 'isobmff', brand: 'qt  ', compatible: [] }, 'video/mp4'),
    ).toBe(false);
    expect(mediaSniffMatches({ container: 'ebml', docType: 'webm' }, 'video/webm')).toBe(true);
    expect(mediaSniffMatches({ container: 'ebml', docType: 'matroska' }, 'video/webm')).toBe(false);
    expect(mediaSniffMatches({ container: 'mp3', tagBytes: 0, audioAt: 0 }, 'audio/mpeg')).toBe(
      true,
    );
    expect(mediaSniffMatches({ container: 'wav' }, 'audio/wav')).toBe(true);
    expect(mediaSniffMatches({ container: 'wav' }, 'audio/mpeg')).toBe(false);
    expect(mediaSniffMatches({ container: 'ogg' }, 'audio/mpeg')).toBe(false);
  });
});

describe('the media upload backend (R11 1.8, 2 rule 3)', () => {
  it('is local on a checkout, blob with the private token, refused on tmp and on blob without it', () => {
    expect(mediaUploadBackend('file', {})).toEqual({ kind: 'local' });
    expect(mediaUploadBackend('file', { TURBOSLIDE_BLOB_PRIVATE_TOKEN: 'x' })).toEqual({
      kind: 'local',
    });
    expect(mediaUploadBackend('tmp', {})).toEqual({
      kind: 'refused',
      sentence: MEDIA_NEEDS_BLOB_SENTENCE,
    });
    expect(mediaUploadBackend('tmp', { TURBOSLIDE_BLOB_PRIVATE_TOKEN: 'x' })).toEqual({
      kind: 'refused',
      sentence: MEDIA_NEEDS_BLOB_SENTENCE,
    });
    expect(mediaUploadBackend('blob', {})).toEqual({
      kind: 'refused',
      sentence: MEDIA_NEEDS_PRIVATE_STORE_SENTENCE,
    });
    expect(mediaUploadBackend('blob', { TURBOSLIDE_BLOB_PRIVATE_TOKEN: '' })).toEqual({
      kind: 'refused',
      sentence: MEDIA_NEEDS_PRIVATE_STORE_SENTENCE,
    });
    expect(mediaUploadBackend('blob', { TURBOSLIDE_BLOB_PRIVATE_TOKEN: 'set' })).toEqual({
      kind: 'blob',
    });
    expect(MEDIA_NEEDS_BLOB_SENTENCE).toBe('Audio and video need the Blob store on this instance');
    // the sentences never name a token value
    expect(MEDIA_NEEDS_PRIVATE_STORE_SENTENCE).not.toMatch(/vercel_blob_rw/i);
  });

  it('keys uploads as uploads/<principal>/<uuid> and refuses a token nobody signed', () => {
    expect(UPLOAD_KEY_PATTERN.test('uploads/anon_1/0f7e2a2e-2a1e-4a8e-9a3b-0d3e5c1f2b4a')).toBe(
      true,
    );
    expect(UPLOAD_KEY_PATTERN.test('uploads/../etc')).toBe(false);
    expect(verifyUploadToken('not.a.token')).toBeNull();
    expect(verifyUploadToken('')).toBeNull();
  });
});
