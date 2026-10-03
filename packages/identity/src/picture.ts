// The picture avatar's URLs (docs/archive/rounds/PEOPLE.md 4.4; gslides-parity SPEC-3 7.6): one file per size
// under the choice's folder, `<base>/<digest>-<size>.webp`, the base being the public store's
// folder hosted and the studio's avatar route on a checkout. The 64 px URL is the one a
// `MarkSpec` carries (`pictureUrl`); the chip's `srcset`, the Profile head and the builder's
// preview derive the other sizes from it by the path grammar, so the browser never needs the
// key or the digest apart. Browser safe: no store, no `node:` import.
import type { AvatarChoice } from './principal.ts';

/** The sizes the server writes (avatar.ts AVATAR_SIZES): 32 and 64 for the chip, 128 for the head, 256 for the preview. */
export const PICTURE_SIZES = [32, 64, 128, 256] as const;
export type PictureSize = (typeof PICTURE_SIZES)[number];

/** The size a `MarkSpec.pictureUrl` names. */
export const PICTURE_MARK_SIZE: PictureSize = 64;

const PICTURE_FILE = /^(.*\/[0-9a-f]{64})-(32|64|128|256)\.webp$/;

function isPictureSize(value: unknown): value is PictureSize {
  return (PICTURE_SIZES as readonly number[]).includes(value as number);
}

/** The URL of the picture at one size, or undefined when the choice is not a picture with a base. */
export function pictureUrlOf(
  choice: AvatarChoice | null | undefined,
  size: PictureSize,
): string | undefined {
  const picture = choice?.picture;
  if (choice?.variant !== 'picture' || picture === undefined || picture.base === undefined)
    return undefined;
  if (!isPictureSize(size)) return undefined;
  return `${picture.base}/${picture.digest}-${size}.webp`;
}

/**
 * The URL of another size from a picture URL of the grammar above (the mark's 64 px file), or
 * undefined for a size the server does not write or a URL that is not a picture file.
 */
export function pictureUrlAt(url: string | undefined, size: PictureSize): string | undefined {
  if (url === undefined || !isPictureSize(size)) return undefined;
  const match = PICTURE_FILE.exec(url);
  if (match === null) return undefined;
  return `${match[1]}-${size}.webp`;
}
