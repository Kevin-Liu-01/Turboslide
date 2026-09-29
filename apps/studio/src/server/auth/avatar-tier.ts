// The avatar store per tier (docs/PEOPLE.md 4.3; AUDIT.md defect 12; avatars 3): the public
// Blob store when the deck store is the blob tier, so the files are public URLs an `<img>` can
// load and never the function's disk; the file store under `<stateDir>/users/` on a checkout or
// a tmp store, served by routes/api/avatar.$.ts. The two readers of the folder (the writer here
// and the route) share `AVATAR_USERS_DIR` and this one predicate, so they cannot drift.
import { join } from 'node:path';

import { publicStoreOrigin } from '../headers';
import { exportBlobClient, stateDir, storeSelection } from '../root';
import { AVATAR_USERS_DIR, blobAvatarStore, fileAvatarStore } from './avatar.ts';
import type { AvatarStore } from './avatar.ts';

/** True when the picture files live on this instance's disk and the avatar route serves them. */
export function avatarFilesOnDisk(): boolean {
  return storeSelection().kind !== 'blob';
}

/** The folder of the file store, for the route and the seed. */
export function avatarUsersDir(): string {
  return join(stateDir(), AVATAR_USERS_DIR);
}

/** The store `account.setAvatar` writes to on this tier. */
export function selectAvatarStore(env: Readonly<Record<string, string | undefined>> = process.env): AvatarStore {
  if (avatarFilesOnDisk()) return fileAvatarStore(avatarUsersDir());
  return blobAvatarStore(() => exportBlobClient(), { origin: publicStoreOrigin(env) });
}
