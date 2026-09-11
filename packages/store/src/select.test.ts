// Store selection from the environment alone: the explicit variable wins, Vercel picks blob or
// tmp by the Blob token, a checkout is file; a misconfiguration is a TypeError with the variable
// named; the overlay root moves with TURBOSLIDE_OVERLAY_DIR.
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BLOB_TOKEN_VARIABLE,
  NOT_PERSISTENT_NOTICE,
  STORE_KINDS,
  hasBlobToken,
  isStoreKind,
  isVercel,
  overlayRoot,
  selectStore,
} from './select.ts';

describe('selectStore', () => {
  it('is file outside Vercel with nothing set', () => {
    expect(selectStore({})).toEqual({
      kind: 'file',
      reason: 'a checkout with decks/',
      persistent: true,
      blob: false,
    });
  });

  it('is tmp on Vercel without a Blob token, and says so', () => {
    const selection = selectStore({ VERCEL: '1' });
    expect(selection.kind).toBe('tmp');
    expect(selection.persistent).toBe(false);
    expect(selection.blob).toBe(false);
    expect(selection.reason).toContain(BLOB_TOKEN_VARIABLE);
    expect(NOT_PERSISTENT_NOTICE).toMatch(/do not persist until a Blob store is connected/);
  });

  it('is blob on Vercel with a Blob token', () => {
    const selection = selectStore({ VERCEL: '1', [BLOB_TOKEN_VARIABLE]: 'vercel_blob_rw_x' });
    expect(selection).toMatchObject({ kind: 'blob', persistent: true, blob: true });
  });

  it('lets TURBOSLIDE_STORE override the platform', () => {
    expect(selectStore({ VERCEL: '1', TURBOSLIDE_STORE: 'file' }).kind).toBe('file');
    expect(selectStore({ TURBOSLIDE_STORE: 'tmp' })).toMatchObject({
      kind: 'tmp',
      persistent: false,
      reason: 'TURBOSLIDE_STORE=tmp',
    });
    expect(selectStore({ TURBOSLIDE_STORE: 'blob', [BLOB_TOKEN_VARIABLE]: 't' }).kind).toBe('blob');
  });

  it('refuses blob without a token and an unknown kind', () => {
    expect(() => selectStore({ TURBOSLIDE_STORE: 'blob' })).toThrow(
      /TURBOSLIDE_STORE=blob needs BLOB_READ_WRITE_TOKEN/,
    );
    expect(() => selectStore({ TURBOSLIDE_STORE: 'sqlite' })).toThrow(
      /TURBOSLIDE_STORE must be one of file, tmp, blob/,
    );
  });

  it('treats an empty variable as unset', () => {
    expect(selectStore({ TURBOSLIDE_STORE: '', VERCEL: '' }).kind).toBe('file');
    expect(hasBlobToken({ [BLOB_TOKEN_VARIABLE]: '' })).toBe(false);
    expect(isVercel({ VERCEL: '' })).toBe(false);
    expect(isVercel({ VERCEL: '1' })).toBe(true);
  });

  it('knows its kinds', () => {
    expect(STORE_KINDS).toEqual(['file', 'tmp', 'blob']);
    expect(isStoreKind('blob')).toBe(true);
    expect(isStoreKind('s3')).toBe(false);
    expect(isStoreKind(1)).toBe(false);
  });
});

describe('overlayRoot', () => {
  it('is <tmpdir>/turboslide by default', () => {
    expect(overlayRoot({})).toBe(join(tmpdir(), 'turboslide'));
  });

  it('follows TURBOSLIDE_OVERLAY_DIR, resolved', () => {
    expect(overlayRoot({ TURBOSLIDE_OVERLAY_DIR: 'scratch/overlay' })).toBe(
      resolve('scratch/overlay'),
    );
  });
});
