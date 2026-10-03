import { createFileRoute } from '@tanstack/react-router';

import { AVATAR_ROUTE, fileAvatarStore, parseAvatarPath } from '../../server/auth/avatar';
import { avatarFilesOnDisk, avatarUsersDir } from '../../server/auth/avatar-tier';

// /api/avatar/u/<avatarKey>/<digest>-<size>.<webp|png> (gslides-parity SPEC-3 7.6; report 10
// F43; docs/archive/rounds/PEOPLE.md 4.3): the picture avatar files of a checkout or a tmp store, written by
// account.setAvatar under `<stateDir>/users/` (`AVATAR_USERS_DIR`, one constant shared with the
// writer). On the blob tier the files live on the public Blob store and their URLs point there,
// so this route answers 404 (`avatarFilesOnDisk`, the writer's own predicate). The path grammar
// is checked before the disk is touched, the files are immutable (a digest in the name, a key
// rotated on every change), so the cache is long; `Cross-Origin-Resource-Policy: same-origin`
// and `nosniff` keep them the studio's own.

const NOT_FOUND = new Response(JSON.stringify({ error: { name: 'RangeError', status: 404 } }), {
  status: 404,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function serve(request: Request): Response {
  if (!avatarFilesOnDisk()) return NOT_FOUND.clone();
  const pathname = new URL(request.url).pathname;
  const relative = pathname.startsWith(`${AVATAR_ROUTE}/`)
    ? pathname.slice(AVATAR_ROUTE.length + 1)
    : '';
  if (parseAvatarPath(relative) === null) return NOT_FOUND.clone();
  const file = fileAvatarStore(avatarUsersDir()).read(relative);
  if (file === null) return NOT_FOUND.clone();
  return new Response(request.method === 'HEAD' ? null : file.bytes, {
    status: 200,
    headers: {
      'content-type': file.contentType,
      'content-length': String(file.bytes.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
      'cross-origin-resource-policy': 'same-origin',
      'x-content-type-options': 'nosniff',
    },
  });
}

export const Route = createFileRoute('/api/avatar/$')({
  server: {
    handlers: {
      GET: ({ request }) => serve(request),
      HEAD: ({ request }) => serve(request),
    },
  },
});
