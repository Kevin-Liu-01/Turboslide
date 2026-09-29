import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { MarkSpec } from '@turboslide/identity/marks';
import { pictureUrlAt } from '@turboslide/identity/picture';
import type { PictureSize } from '@turboslide/identity/picture';

import { Dialog, DialogTabs } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import type { AvatarChoiceInput, IdentityView } from '../editor-shell';
import { cn } from '../lib/cn';
import { ACCOUNT, REFUSALS } from '../menus/strings';
import { isParked } from '../parked-controls';
import { markOf } from '../presence/IdentityChip';
import { initialsFontSize, markCells, plateOf } from '../presence/mark-svg';
import { tipProps } from '../Tooltip';

import './accounts.css';

/**
 * The avatar builder (gslides-parity SPEC-3 0.22, 7.6; research 03 I3, 11 8 P8; docs/PEOPLE.md
 * 4.1): one 560 by 640 dialog with four tabs in the order a person wants them, Initials, Glyph,
 * Dither, Picture, each showing the result at 24, 32, 64 and 128 px in light and dark chrome in a
 * fixed 2 by 4 preview strip from first paint; the panel body 292 px for every tab. Initials
 * takes one or two letters of the display name and lets a person retype them; Glyph and Dither
 * offer "Another", which rerolls a salt kept on the principal record; Picture is signed in
 * principals' alone and reads "Sign in to upload a picture" otherwise (the sentence, not a
 * refusal at the quota). The picture path runs in the browser: the file is refused over 25 MB
 * before anything is decoded, decoded with `createImageBitmap` and the orientation tag applied,
 * drawn in the 256 px box scaled so its shorter side fills it, moved under the box by a pointer
 * drag (the box is the crop), and on Apply the square under the box is drawn into a 256 px canvas
 * and encoded as WebP at quality 0.8; a result over 512 KB is refused before a data URL is made,
 * else the data URL goes to `account.setAvatar`, and the server sniffs, decodes and re-encodes
 * it (4.3). The builder starts from `account.avatar`, so the tab, the letters and the salt are
 * the current choice. Apply writes the choice as one small document.
 */
type Tab = 'initials' | 'glyph' | 'dither' | 'picture';
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'initials', label: ACCOUNT.avatar.tabs[0] },
  { value: 'glyph', label: ACCOUNT.avatar.tabs[1] },
  { value: 'dither', label: ACCOUNT.avatar.tabs[2] },
  { value: 'picture', label: ACCOUNT.avatar.tabs[3] },
];
/** The strip's sizes: the three chip sizes the picture files serve at 1x and 2x, and the head's 128 (build/b3.md). */
const SIZES = [24, 32, 64, 128] as const;
/** The Picture panel's control id; the picture rows of the matrix park it (docs/PEOPLE.md 6.1). */
const PICTURE_PANEL = 'dialog.avatarBuilder.panel.picture';

/** The guard on the original file before any decode (docs/security.md section 10, the anonymous picture tier). */
export const AVATAR_ORIGINAL_MAX_BYTES = 25 * 1024 * 1024;
/** The cap on the encoded picture, the same number the server refuses at (docs/PEOPLE.md 4.2). */
export const AVATAR_MAX_BYTES = 512 * 1024;
/** The crop box and the encoded square, in px. */
export const AVATAR_CROP_PX = 256;
/** The WebP quality of the encode. */
export const AVATAR_WEBP_QUALITY = 0.8;
/** The MIME types the file input takes; the server's sniff decides what it is (4.3). */
const ACCEPTED = /^image\/(png|jpeg|webp|gif)$/;
/** An arrow key moves the picture under the box by this many px. */
const NUDGE_PX = 4;

/**
 * The builder's sentences (docs/PEOPLE.md 4.1, 4.5): one thought per sentence. They live here so
 * the file compiles before the chrome lane merges (`build/b3.md` R8 names them for
 * `ACCOUNT.avatar`).
 */
export const AVATAR_SENTENCES = {
  original: 'Pictures up to 25 MB',
  sizes: 'Cropped to a square and sent at 256 px, under 512 KB. JPEG, PNG, WebP or GIF',
  overCap: 'The resized picture is over 512 KB. Choose another picture',
  privacy:
    'Your picture shows on every presentation you open while signed in, to people invited by email. People who arrive by a link see a role initial instead',
  cache:
    'A replaced or removed picture can stay readable at its old address for up to a year in caches',
  unreadable: 'That picture could not be read. Choose another picture',
  formats: 'JPEG, PNG, WebP or GIF',
} as const;

/** A random 31 bit salt for "Another". */
export function rerollSalt(random: () => number = Math.random): number {
  return Math.floor(random() * 0x7fffffff);
}

/* ---- the crop geometry, pure so a test pins it ---- */

export type Offset = { x: number; y: number };

/** The decoded picture drawn in the box: scaled so its shorter side is the box, in box px. */
export type CropGeometry = {
  width: number;
  height: number;
  scale: number;
  drawWidth: number;
  drawHeight: number;
};

export function cropGeometry(width: number, height: number, box = AVATAR_CROP_PX): CropGeometry {
  const scale = box / Math.max(1, Math.min(width, height));
  return { width, height, scale, drawWidth: width * scale, drawHeight: height * scale };
}

/** The picture's top left in the box, kept so the box never shows paper: between `box - draw` and 0. */
export function clampOffset(offset: Offset, geometry: CropGeometry, box = AVATAR_CROP_PX): Offset {
  const minX = Math.min(0, box - geometry.drawWidth);
  const minY = Math.min(0, box - geometry.drawHeight);
  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  };
}

/** The offset that centres the picture under the box, the state a fresh file starts from. */
export function centredOffset(geometry: CropGeometry, box = AVATAR_CROP_PX): Offset {
  return clampOffset(
    { x: (box - geometry.drawWidth) / 2, y: (box - geometry.drawHeight) / 2 },
    geometry,
    box,
  );
}

/** The square under the box in source pixels, whole numbers, clamped inside the picture. */
export function cropSource(
  offset: Offset,
  geometry: CropGeometry,
  box = AVATAR_CROP_PX,
): { left: number; top: number; size: number } {
  const size = Math.max(1, Math.min(geometry.width, geometry.height));
  const at = clampOffset(offset, geometry, box);
  const left = Math.min(geometry.width - size, Math.max(0, Math.round(-at.x / geometry.scale)));
  const top = Math.min(geometry.height - size, Math.max(0, Math.round(-at.y / geometry.scale)));
  return { left, top, size };
}

/**
 * The `object-position` that shows the same square in an `object-fit: cover` image: cover scales
 * the shorter side to the box as the crop box does, and the percentage walks the longer side from
 * its start (0%) to its end (100%).
 */
export function objectPositionOf(
  offset: Offset,
  geometry: CropGeometry,
  box = AVATAR_CROP_PX,
): string {
  const at = clampOffset(offset, geometry, box);
  const x = geometry.drawWidth > box ? (-at.x / (geometry.drawWidth - box)) * 100 : 50;
  const y = geometry.drawHeight > box ? (-at.y / (geometry.drawHeight - box)) * 100 : 50;
  return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
}

/** The file of the ladder a preview of `size` px draws at 1x: 32 up to 32, 64 up to 64, 128 up to 128, else 256. */
export function pictureSizeFor(size: number): PictureSize {
  return size <= 32 ? 32 : size <= 64 ? 64 : size <= 128 ? 128 : 256;
}

/** A preview's `srcset` from the 64 px URL (4.4): the 1x file for its size and the next size up at 2x. */
export function pictureSrcSet(url: string, size: number): string | undefined {
  const one = pictureUrlAt(url, pictureSizeFor(size));
  const two = pictureUrlAt(url, pictureSizeFor(size * 2));
  if (one === undefined || two === undefined) return undefined;
  return one === two ? `${one} 1x` : `${one} 1x, ${two} 2x`;
}

/** The blob as a data URL, the shape `account.setAvatar` takes. */
export function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(AVATAR_SENTENCES.unreadable));
    reader.readAsDataURL(blob);
  });
}

/** A picture drawn in a preview: the file being cropped, positioned as the box shows it, or the current choice. */
type PreviewPicture = { src: string; srcSet?: string; objectPosition?: string };

/** The mark at a preview size: the 24 px grid scaled up by a whole factor so the cells stay crisp. */
function Preview({
  spec,
  size,
  dark,
  picture,
}: {
  spec: MarkSpec;
  size: number;
  dark: boolean;
  picture?: PreviewPicture;
}) {
  const base = 24;
  const plate = plateOf(base);
  /* the field keeps the chip's own inset at every size (presence.css `.ts-chip`), so the strip
     follows the chip's geometry when it changes */
  const inner = size - (base - plate);
  const cells = markCells(spec, base);
  const [broken, setBroken] = useState<string | null>(null);
  const style: CSSProperties = { width: size, height: size };
  const drawn = picture !== undefined && broken !== picture.src ? picture : undefined;
  return (
    <span
      className={cn('ts-avatar-cell', dark && 'is-dark')}
      style={style}
      data-size={size}
      aria-hidden="true"
    >
      <span className={cn('ts-chip', 'is-self')} style={{ width: size, height: size }}>
        {spec.variant === 'picture' && drawn !== undefined ? (
          <img
            className="ts-chip-picture"
            src={drawn.src}
            srcSet={drawn.srcSet}
            decoding="async"
            alt=""
            width={inner}
            height={inner}
            style={{
              objectFit: 'cover',
              ...(drawn.objectPosition === undefined
                ? {}
                : { objectPosition: drawn.objectPosition }),
            }}
            onError={() => setBroken(drawn.src)}
          />
        ) : (
          <svg
            viewBox={`0 0 ${plate} ${plate}`}
            width={inner}
            height={inner}
            shapeRendering="crispEdges"
            className="ts-chip-plate"
          >
            {cells.map((cell, i) => (
              <rect key={i} x={cell.x} y={cell.y} width={cell.w} height={cell.h} />
            ))}
            {spec.variant === 'initials' && spec.initials !== '' ? (
              <text
                className="ts-chip-initials"
                x={plate / 2}
                y={plate / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={initialsFontSize(24)}
              >
                {spec.initials}
              </text>
            ) : null}
          </svg>
        )}
      </span>
    </span>
  );
}

/** A decoded picture and where it sits under the box. */
type Loaded = { bitmap: ImageBitmap; geometry: CropGeometry; objectUrl: string | null };

export function AvatarBuilderDialog() {
  const shell = useEditorShell();
  const { settings } = shell;
  const account = shell.input.account;
  const identity: IdentityView | undefined = account?.principal;
  const current = account?.avatar;
  const picturePanelParked = isParked(PICTURE_PANEL, settings);
  const tabs = picturePanelParked ? TABS.filter((tab) => tab.value !== 'picture') : TABS;
  const startTab: Tab =
    current === undefined || (current.variant === 'picture' && picturePanelParked)
      ? 'initials'
      : current.variant;
  const [tab, setTab] = useState<Tab>(startTab);
  const [initials, setInitials] = useState(current?.initials ?? '');
  const [salt, setSalt] = useState<number>(current?.salt ?? 0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedRef = useRef<Loaded | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; origin: Offset } | null>(
    null,
  );
  const signedIn = account?.signedIn === true;
  const currentPicture = account?.pictureUrl;

  /* the decoded bitmap and its object URL are released when a new file replaces them and on close */
  const release = (previous: Loaded | null) => {
    if (previous === null) return;
    if (previous.objectUrl !== null && typeof URL.revokeObjectURL === 'function')
      URL.revokeObjectURL(previous.objectUrl);
    if (typeof previous.bitmap.close === 'function') previous.bitmap.close();
  };
  useEffect(() => {
    return () => release(loadedRef.current);
  }, []);

  /* the crop box: the picture drawn at its scale and offset, redrawn on every move */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.clearRect(0, 0, AVATAR_CROP_PX, AVATAR_CROP_PX);
    if (loaded === null) return;
    const at = clampOffset(offset, loaded.geometry);
    ctx.drawImage(loaded.bitmap, at.x, at.y, loaded.geometry.drawWidth, loaded.geometry.drawHeight);
  }, [loaded, offset]);

  const spec: MarkSpec | null =
    identity === undefined
      ? null
      : {
          ...markOf({ ...identity, mark: undefined }, { self: true }),
          variant:
            tab === 'picture'
              ? loaded !== null || currentPicture !== undefined
                ? 'picture'
                : 'initials'
              : tab,
          initials:
            tab === 'initials'
              ? initials.trim() !== ''
                ? [...initials.trim()].slice(0, 2).join('').toUpperCase()
                : markOf({ ...identity, mark: undefined }).initials
              : '',
          glyphSeed: (markOf({ ...identity, mark: undefined }).glyphSeed ^ (salt >>> 0)) >>> 0,
        };

  /* the picture the strip draws: the file being cropped as the box shows it, else the current choice */
  const previewPicture = (size: number): PreviewPicture | undefined => {
    if (loaded !== null) {
      if (loaded.objectUrl === null) return undefined;
      return {
        src: loaded.objectUrl,
        objectPosition: objectPositionOf(offset, loaded.geometry),
      };
    }
    if (currentPicture === undefined) return undefined;
    const srcSet = pictureSrcSet(currentPicture, size);
    /* the 1x file for the cell and the next size up at 2x; the 128 cell reads the 128 and 256 files (4.4) */
    return {
      src: pictureUrlAt(currentPicture, pictureSizeFor(size)) ?? currentPicture,
      ...(srcSet === undefined ? {} : { srcSet }),
    };
  };

  const pick = async (chosen: File | null) => {
    setError(null);
    if (!chosen) return;
    if (chosen.size > AVATAR_ORIGINAL_MAX_BYTES) {
      setError(AVATAR_SENTENCES.original);
      return;
    }
    if (!ACCEPTED.test(chosen.type)) {
      setError(AVATAR_SENTENCES.formats);
      return;
    }
    if (typeof createImageBitmap !== 'function') {
      setError(AVATAR_SENTENCES.unreadable);
      return;
    }
    let bitmap: ImageBitmap;
    try {
      /* the orientation tag is applied here, so the box, the crop and the encode all see the
         picture upright; a GIF decodes to its first frame */
      bitmap = await createImageBitmap(chosen, { imageOrientation: 'from-image' });
    } catch {
      setError(AVATAR_SENTENCES.unreadable);
      return;
    }
    if (bitmap.width < 1 || bitmap.height < 1) {
      setError(AVATAR_SENTENCES.unreadable);
      return;
    }
    const geometry = cropGeometry(bitmap.width, bitmap.height);
    const next: Loaded = {
      bitmap,
      geometry,
      objectUrl: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(chosen) : null,
    };
    release(loadedRef.current);
    loadedRef.current = next;
    setLoaded(next);
    setOffset(centredOffset(geometry));
  };

  /* the drag: the pointer moves the picture under the fixed square; captured so a fast drag past the box keeps moving it */
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (loaded === null || event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    if (typeof target.setPointerCapture === 'function') target.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: clampOffset(offset, loaded.geometry),
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = drag.current;
    if (active === null || loaded === null || active.pointerId !== event.pointerId) return;
    setOffset(
      clampOffset(
        {
          x: active.origin.x + (event.clientX - active.startX),
          y: active.origin.y + (event.clientY - active.startY),
        },
        loaded.geometry,
      ),
    );
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = drag.current;
    if (active === null || active.pointerId !== event.pointerId) return;
    drag.current = null;
    const target = event.currentTarget;
    if (
      typeof target.hasPointerCapture === 'function' &&
      target.hasPointerCapture(event.pointerId)
    )
      target.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (loaded === null) return;
    const step =
      event.key === 'ArrowLeft'
        ? { x: NUDGE_PX, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: -NUDGE_PX, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: NUDGE_PX }
            : event.key === 'ArrowDown'
              ? { x: 0, y: -NUDGE_PX }
              : null;
    if (step === null) return;
    event.preventDefault();
    setOffset(clampOffset({ x: offset.x + step.x, y: offset.y + step.y }, loaded.geometry));
  };

  /** The square under the box into a 256 px canvas, encoded as WebP at 0.8 (4.1). */
  const encodeCrop = async (picture: Loaded): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_CROP_PX;
    canvas.height = AVATAR_CROP_PX;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error(AVATAR_SENTENCES.unreadable);
    const { left, top, size } = cropSource(offset, picture.geometry);
    ctx.drawImage(picture.bitmap, left, top, size, size, 0, 0, AVATAR_CROP_PX, AVATAR_CROP_PX);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', AVATAR_WEBP_QUALITY),
    );
    if (blob === null) throw new Error(AVATAR_SENTENCES.unreadable);
    return blob;
  };

  const apply = () => {
    if (busy || !account?.setAvatar) {
      shell.closeDialog();
      return;
    }
    /* the Picture tab with nothing new chosen keeps the current picture: nothing to write */
    if (tab === 'picture' && loaded === null) {
      shell.closeDialog();
      return;
    }
    setBusy(true);
    setError(null);
    const send = async (): Promise<void> => {
      let choice: AvatarChoiceInput;
      if (tab === 'initials') {
        choice = {
          variant: 'initials',
          ...(initials.trim() === '' ? {} : { initials: initials.trim() }),
        };
      } else if (tab === 'picture') {
        if (loaded === null) return;
        const blob = await encodeCrop(loaded);
        if (blob.size > AVATAR_MAX_BYTES) {
          /* refused before a data URL is made; no request leaves (4.1) */
          setError(AVATAR_SENTENCES.overCap);
          return;
        }
        choice = { variant: 'picture', picture: await readAsDataUrl(blob) };
      } else {
        choice = { variant: tab, salt };
      }
      await account.setAvatar?.(choice);
      shell.closeDialog();
    };
    send()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const applyDisabled =
    busy ||
    (tab === 'picture' && (!signedIn || (loaded === null && current?.variant !== 'picture')));

  return (
    <Dialog
      title={ACCOUNT.avatar.title}
      onClose={shell.closeDialog}
      width={560}
      control="dialog.avatarBuilder"
      className="ts-avatar-builder"
      cancel
      actions={[
        {
          label: ACCOUNT.avatar.apply,
          primary: true,
          disabled: applyDisabled,
          onClick: apply,
          control: 'dialog.avatarBuilder.apply',
          doc: 'Keeps this mark on every surface that shows you',
        },
      ]}
    >
      <DialogTabs tabs={tabs} value={tab} onChange={setTab} control="dialog.avatarBuilder.tab" />
      <div className="ts-avatar-strip" data-control="dialog.avatarBuilder.strip">
        {[false, true].map((dark) =>
          SIZES.map((size) => (
            <span key={`${dark ? 'dark' : 'light'}:${size}`}>
              {spec ? (
                <Preview spec={spec} size={size} dark={dark} picture={previewPicture(size)} />
              ) : (
                <span className="ts-avatar-cell" style={{ width: size, height: size }} />
              )}
            </span>
          )),
        )}
      </div>
      <div className="ts-avatar-panel" data-control={`dialog.avatarBuilder.panel.${tab}`}>
        {tab === 'initials' ? (
          <label className="ts-dialog-field">
            <span className="ts-dialog-field-label">{ACCOUNT.avatar.initials}</span>
            <input
              type="text"
              value={initials}
              maxLength={2}
              placeholder={spec?.initials ?? ''}
              aria-label={ACCOUNT.avatar.initials}
              data-control="dialog.avatarBuilder.initials"
              autoComplete="off"
              onChange={(event) => setInitials(event.target.value)}
              {...tipProps({
                name: ACCOUNT.avatar.initials,
                doc: 'One or two letters; empty takes them from your name',
              })}
            />
          </label>
        ) : null}
        {tab === 'glyph' || tab === 'dither' ? (
          <button
            type="button"
            className="pt-ib"
            data-control="dialog.avatarBuilder.another"
            onClick={() => setSalt(rerollSalt())}
            {...tipProps({
              name: ACCOUNT.avatar.another,
              doc: 'A new pattern; the one you keep stays the same afterwards',
            })}
          >
            <span className="pt-lb">{ACCOUNT.avatar.another}</span>
          </button>
        ) : null}
        {tab === 'picture' ? (
          signedIn ? (
            <div className="ts-avatar-picture">
              <div className="ts-avatar-picture-box">
                <canvas
                  ref={canvasRef}
                  className={cn('ts-avatar-crop', loaded !== null && 'is-loaded')}
                  width={AVATAR_CROP_PX}
                  height={AVATAR_CROP_PX}
                  data-control="dialog.avatarBuilder.crop"
                  data-loaded={loaded !== null ? 'true' : 'false'}
                  tabIndex={loaded === null ? -1 : 0}
                  role="img"
                  aria-label={loaded === null ? ACCOUNT.avatar.upload : ACCOUNT.avatar.crop}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerEnd}
                  onPointerCancel={onPointerEnd}
                  onKeyDown={onKeyDown}
                  {...(loaded === null
                    ? {}
                    : tipProps({
                        name: ACCOUNT.avatar.crop,
                        doc: 'Moves the picture under the square; the arrow keys move it too',
                      }))}
                />
                {loaded !== null ? (
                  <p
                    className="ts-avatar-sentence"
                    data-control="dialog.avatarBuilder.cropSentence"
                  >
                    {ACCOUNT.avatar.crop}
                  </p>
                ) : null}
              </div>
              <div className="ts-avatar-picture-side">
                {/* a button, so the keyboard reaches the picker; the input itself stays hidden */}
                <button
                  type="button"
                  className="pt-ib ts-avatar-upload"
                  data-control="dialog.avatarBuilder.upload"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  {...tipProps({
                    name: ACCOUNT.avatar.upload,
                    doc: AVATAR_SENTENCES.sizes,
                  })}
                >
                  <span className="pt-lb">{ACCOUNT.avatar.upload}</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  tabIndex={-1}
                  aria-hidden="true"
                  data-control="dialog.avatarBuilder.file"
                  onChange={(event) => {
                    void pick(event.target.files?.[0] ?? null);
                    /* the same file chosen twice fires change again */
                    event.target.value = '';
                  }}
                />
                <p className="ts-avatar-sentence" data-control="dialog.avatarBuilder.capSentence">
                  {AVATAR_SENTENCES.sizes}
                </p>
                <p
                  className="ts-avatar-sentence"
                  data-control="dialog.avatarBuilder.privacySentence"
                >
                  {AVATAR_SENTENCES.privacy}
                </p>
                <p
                  className="ts-avatar-sentence"
                  data-control="dialog.avatarBuilder.cacheSentence"
                >
                  {AVATAR_SENTENCES.cache}
                </p>
              </div>
            </div>
          ) : (
            <p className="ts-avatar-sentence" data-control="dialog.avatarBuilder.signInSentence">
              {REFUSALS.signInToUpload}
            </p>
          )
        ) : null}
      </div>
      <p className="ts-dialog-error-row" role="alert" data-control="dialog.avatarBuilder.error">
        {error ?? ''}
      </p>
    </Dialog>
  );
}
