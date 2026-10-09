// Hardening K1#4 (docs/hardening/HARDENING.md 4.1): `turboslide admin migrate-storage` moves the
// documents and the twins between the stores as they are, so on Vercel its public client is the
// store's own (by BLOB_READ_WRITE_TOKEN), never the deployment's client, which routes by the
// layout and the deck keys the steps themselves move. A checkout's rehearsal, with no token,
// keeps the backend's client.
import { describe, expect, it, vi } from 'vitest';

import { memoryBlobClient } from '@turboslide/store/blob-fake';

const deployment = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  exportBlobClient: () => Promise.resolve(deployment.client),
}));

const { migrationClients } = await import('./migrate');

const TOKEN = 'vercel_blob_rw_teststore_secret';

describe('the migration clients (hardening K1#4)', () => {
  it('opens the public store by its own token on Vercel, and the backend client on a checkout', async () => {
    const fake = memoryBlobClient('https://fake.blob.local');
    deployment.client = fake;
    const hosted = await migrationClients({
      BLOB_READ_WRITE_TOKEN: TOKEN,
      TURBOSLIDE_BLOB_PRIVATE_READ_WRITE_TOKEN: TOKEN,
    });
    expect(hosted.legacy).not.toBe(fake);
    const rehearsal = await migrationClients({ TURBOSLIDE_BLOB_PRIVATE_DIR: '/tmp/k1-rehearsal' });
    expect(rehearsal.legacy).toBe(fake);
  });

  it('refuses on a deployment without the Blob store', async () => {
    deployment.client = null;
    await expect(migrationClients({ BLOB_READ_WRITE_TOKEN: TOKEN })).rejects.toThrow(
      /needs the Blob store/,
    );
  });
});
