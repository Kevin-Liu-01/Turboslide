// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import {
  AVATAR_MAX_BYTES,
  AVATAR_SENTENCES,
  AvatarBuilderDialog,
  centredOffset,
  clampOffset,
  cropGeometry,
  cropSource,
  objectPositionOf,
  pictureSrcSet,
} from '../dialogs/AvatarBuilder';
import { DEFAULT_SETTINGS, buildMenuContext } from '../editor-shell';
import type {
  AvatarChoiceInput,
  EditorAccount,
  EditorShellInput,
  ShellSettings,
} from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// The avatar builder's Picture tab (docs/PEOPLE.md 4.1; the rows people.avatar-upload,
// people.avatar-cap-refusal, people.avatar-anonymous-refused, people.own-chip-follows-avatar):
// the file decoded through createImageBitmap and drawn in the box, the square under the box
// moved by a pointer drag and encoded at 256 px as WebP, the data URL handed to setAvatar; a
// result over 512 KB refused before a data URL is made with no request leaving; the original
// file refused over 25 MB before any decode; a MIME type outside the four refused; the
// anonymous sentence with Apply disabled; the builder starting from the current choice; the
// pure crop geometry. jsdom has no canvas, so the 2d context, toBlob and createImageBitmap are
// stubs that record what the builder asked of them.

const doc = workedDocument();
const PICTURE_URL =
  '/api/avatar/u/A1b2C3d4E5f6G7h8I9j0K1/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef-64.webp';

type Ctx = { clearRect: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };

const parked = { picture: false };
vi.mock('../parked-controls', () => ({
  isParked: (id: string) => parked.picture && id === 'dialog.avatarBuilder.panel.picture',
}));

function host(
  accountOverrides: Partial<EditorAccount> = {},
  settings: ShellSettings = DEFAULT_SETTINGS,
): {
  Host: ({ children }: { children: ReactNode }) => ReactNode;
  closeDialog: ReturnType<typeof vi.fn>;
} {
  const account: EditorAccount = {
    principal: {
      principalId: 'usr_7e2f00000000400080000000',
      label: 'Cotton 223',
      name: 'Maya Chen',
      trust: 'verified',
      kind: 'account',
      email: 'maya@example.test',
    },
    signedIn: true,
    signInAvailable: true,
    setAvatar: vi.fn(() => Promise.resolve({})),
    ...accountOverrides,
  };
  const input: EditorShellInput = {
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 3,
    dispatch: vi.fn(() => Promise.resolve({ revision: 4 })),
    account,
  };
  const closeDialog = vi.fn();
  const state = {
    input,
    platform: 'mac',
    menuContext: buildMenuContext(input, settings, 'mac'),
    settings,
    setSetting: vi.fn(),
    closeDialog,
    openDialog: vi.fn(),
    say: vi.fn(),
    dialog: 'avatarBuilder',
  } as unknown as EditorShellState;
  const Host = ({ children }: { children: ReactNode }) => (
    <EditorShellContext value={state}>{children}</EditorShellContext>
  );
  return { Host, closeDialog };
}

function stubCanvas(
  blobBytes: number,
  blobType = 'image/webp',
): { ctx: Ctx; toBlob: ReturnType<typeof vi.fn> } {
  const ctx: Ctx = { clearRect: vi.fn(), drawImage: vi.fn() };
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ctx),
  });
  const toBlob = vi.fn((cb: (blob: Blob | null) => void) => {
    cb(new Blob([new Uint8Array(blobBytes)], { type: blobType }));
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value: toBlob,
  });
  return { ctx, toBlob };
}

function stubBitmap(width: number, height: number): ReturnType<typeof vi.fn> {
  const bitmap = { width, height, close: vi.fn() };
  const create = vi.fn(() => Promise.resolve(bitmap));
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: create });
  return create;
}

function jpeg(name = 'photo.jpg', bytes = 4096): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });
}

function control(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-control="${id}"]`);
  if (el === null) throw new Error(`no control ${id}`);
  return el;
}

async function openPictureTab(): Promise<void> {
  fireEvent.click(control('dialog.avatarBuilder.tab.picture'));
  await waitFor(() => control('dialog.avatarBuilder.panel.picture'));
}

async function pickFile(file: File): Promise<void> {
  const input = control('dialog.avatarBuilder.file') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  parked.picture = false;
});

afterEach(() => {
  hideTooltip();
  cleanup();
  vi.restoreAllMocks();
});

describe('the crop geometry', () => {
  it('scales the shorter side to the box, centres a fresh file and clamps the drag inside the picture', () => {
    const geometry = cropGeometry(1200, 900);
    expect(geometry.scale).toBeCloseTo(256 / 900, 6);
    expect(geometry.drawHeight).toBeCloseTo(256, 6);
    expect(geometry.drawWidth).toBeCloseTo(341.333, 2);
    const start = centredOffset(geometry);
    expect(start.y).toBe(0);
    expect(start.x).toBeCloseTo(-42.667, 2);
    expect(clampOffset({ x: 40, y: 40 }, geometry)).toEqual({ x: 0, y: 0 });
    expect(clampOffset({ x: -500, y: -500 }, geometry).x).toBeCloseTo(256 - geometry.drawWidth, 6);
    expect(clampOffset({ x: -500, y: -500 }, geometry).y).toBe(0);
  });

  it('reads the square under the box in source pixels: the shorter side, whole numbers, inside the picture', () => {
    const geometry = cropGeometry(1200, 900);
    expect(cropSource(centredOffset(geometry), geometry)).toEqual({ left: 150, top: 0, size: 900 });
    expect(cropSource({ x: 0, y: 0 }, geometry)).toEqual({ left: 0, top: 0, size: 900 });
    expect(cropSource({ x: -1000, y: 0 }, geometry)).toEqual({ left: 300, top: 0, size: 900 });
    const tall = cropGeometry(600, 1800);
    expect(cropSource({ x: 0, y: -256 }, tall)).toEqual({ left: 0, top: 600, size: 600 });
    const square = cropGeometry(64, 64);
    expect(cropSource({ x: -30, y: -30 }, square)).toEqual({ left: 0, top: 0, size: 64 });
  });

  it('mirrors the crop as an object-position for the strip previews', () => {
    const geometry = cropGeometry(1200, 900);
    expect(objectPositionOf({ x: 0, y: 0 }, geometry)).toBe('0.00% 50.00%');
    expect(objectPositionOf({ x: -1000, y: 0 }, geometry)).toBe('100.00% 50.00%');
    expect(objectPositionOf(centredOffset(geometry), geometry)).toBe('50.00% 50.00%');
  });

  it('names the 1x and 2x files of the ladder from the 64 px URL', () => {
    expect(pictureSrcSet(PICTURE_URL, 24)).toBe(
      `${PICTURE_URL.replace('-64.webp', '-32.webp')} 1x, ${PICTURE_URL} 2x`,
    );
    expect(pictureSrcSet(PICTURE_URL, 64)).toBe(
      `${PICTURE_URL} 1x, ${PICTURE_URL.replace('-64.webp', '-128.webp')} 2x`,
    );
    expect(pictureSrcSet(PICTURE_URL, 128)).toBe(
      `${PICTURE_URL.replace('-64.webp', '-128.webp')} 1x, ${PICTURE_URL.replace('-64.webp', '-256.webp')} 2x`,
    );
    expect(pictureSrcSet(PICTURE_URL, 256)).toBe(
      `${PICTURE_URL.replace('-64.webp', '-256.webp')} 1x`,
    );
    expect(pictureSrcSet('https://example.test/not-a-picture.png', 24)).toBeUndefined();
  });
});

describe('AvatarBuilderDialog, the Picture tab', () => {
  it('decodes the file with the orientation applied, takes the drag, encodes the square at 256 px and hands the data URL to setAvatar', async () => {
    const { ctx, toBlob } = stubCanvas(24 * 1024);
    const create = stubBitmap(1200, 900);
    const setAvatar = vi.fn<(choice: AvatarChoiceInput) => Promise<unknown>>(() =>
      Promise.resolve({}),
    );
    const { Host, closeDialog } = host({ setAvatar });
    render(
      <Host>
        <AvatarBuilderDialog />
      </Host>,
    );
    await openPictureTab();
    expect(control('dialog.avatarBuilder.capSentence').textContent).toBe(AVATAR_SENTENCES.sizes);
    expect(control('dialog.avatarBuilder.privacySentence').textContent).toBe(
      AVATAR_SENTENCES.privacy,
    );
    expect(control('dialog.avatarBuilder.cacheSentence').textContent).toBe(AVATAR_SENTENCES.cache);
    const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    const file = jpeg();
    await pickFile(file);
    expect(create).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    const box = control('dialog.avatarBuilder.crop');
    await waitFor(() => expect(box.getAttribute('data-loaded')).toBe('true'));
    expect(control('dialog.avatarBuilder.cropSentence').textContent).toBe('Drag to crop');
    /* the box drew the bitmap scaled so its shorter side is 256, centred */
    await waitFor(() => expect(ctx.drawImage).toHaveBeenCalled());
    const drawn = ctx.drawImage.mock.calls.at(-1) as unknown[];
    expect(drawn[1]).toBeCloseTo(-42.667, 2);
    expect(drawn[2]).toBe(0);
    expect(drawn[3] as number).toBeCloseTo(341.333, 2);
    expect(drawn[4]).toBe(256);
    /* a drag of 40 px to the left moves the picture under the fixed square */
    fireEvent.pointerDown(box, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 60, clientY: 100 });
    fireEvent.pointerUp(box, { pointerId: 1, clientX: 60, clientY: 100 });
    await waitFor(() => {
      const last = ctx.drawImage.mock.calls.at(-1) as unknown[];
      expect(last[1] as number).toBeCloseTo(-82.667, 2);
    });
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    await waitFor(() => expect(setAvatar).toHaveBeenCalledTimes(1));
    /* the encode: the square under the box (left 291 of 1200, the full 900 height) into 256 px, WebP at 0.8 */
    const encode = ctx.drawImage.mock.calls.find((call) => call.length === 9) as unknown[];
    expect(encode.slice(1)).toEqual([291, 0, 900, 900, 0, 0, 256, 256]);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.8);
    const choice = setAvatar.mock.calls[0]?.[0];
    expect(choice?.variant).toBe('picture');
    expect(choice?.picture?.startsWith('data:image/webp;base64,')).toBe(true);
    expect(choice?.picture?.length ?? Infinity).toBeLessThan(700_000);
    await waitFor(() => expect(closeDialog).toHaveBeenCalled());
    expect(control('dialog.avatarBuilder.error').textContent).toBe('');
  });

  it('refuses a resized picture over 512 KB before a data URL is made, and no request leaves', async () => {
    stubCanvas(AVATAR_MAX_BYTES + 1);
    stubBitmap(1200, 900);
    const setAvatar = vi.fn<(choice: AvatarChoiceInput) => Promise<unknown>>(() =>
      Promise.resolve({}),
    );
    const { Host, closeDialog } = host({ setAvatar });
    render(
      <Host>
        <AvatarBuilderDialog />
      </Host>,
    );
    await openPictureTab();
    await pickFile(jpeg());
    await waitFor(() =>
      expect(control('dialog.avatarBuilder.crop').getAttribute('data-loaded')).toBe('true'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(control('dialog.avatarBuilder.error').textContent).toBe(AVATAR_SENTENCES.overCap),
    );
    expect(setAvatar).not.toHaveBeenCalled();
    expect(closeDialog).not.toHaveBeenCalled();
  });

  it('refuses the original file over 25 MB before any decode, and a type outside the four', async () => {
    stubCanvas(1024);
    const create = stubBitmap(1200, 900);
    const { Host } = host();
    render(
      <Host>
        <AvatarBuilderDialog />
      </Host>,
    );
    await openPictureTab();
    const huge = jpeg('huge.jpg', 16);
    Object.defineProperty(huge, 'size', { value: 25 * 1024 * 1024 + 1 });
    await pickFile(huge);
    await waitFor(() =>
      expect(control('dialog.avatarBuilder.error').textContent).toBe(AVATAR_SENTENCES.original),
    );
    expect(create).not.toHaveBeenCalled();
    await pickFile(new File([new Uint8Array(16)], 'mark.svg', { type: 'image/svg+xml' }));
    await waitFor(() =>
      expect(control('dialog.avatarBuilder.error').textContent).toBe(AVATAR_SENTENCES.formats),
    );
    expect(create).not.toHaveBeenCalled();
    expect(control('dialog.avatarBuilder.crop').getAttribute('data-loaded')).toBe('false');
  });

  it('reads "Sign in to upload a picture" with Apply disabled for an anonymous person', async () => {
    const setAvatar = vi.fn<(choice: AvatarChoiceInput) => Promise<unknown>>(() =>
      Promise.resolve({}),
    );
    const { Host } = host({
      signedIn: false,
      setAvatar,
      principal: {
        principalId: 'anon_7e2f0000-0000-4000-8000-000000000000',
        label: 'Cotton 223',
        trust: 'label',
        kind: 'anonymous',
      },
    });
    render(
      <Host>
        <AvatarBuilderDialog />
      </Host>,
    );
    await openPictureTab();
    expect(control('dialog.avatarBuilder.signInSentence').textContent).toBe(
      'Sign in to upload a picture',
    );
    expect(document.querySelector('[data-control="dialog.avatarBuilder.file"]')).toBeNull();
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('draws the current picture in the strip at the ladder sizes and keeps it on Apply with nothing new chosen', async () => {
    const setAvatar = vi.fn<(choice: AvatarChoiceInput) => Promise<unknown>>(() =>
      Promise.resolve({}),
    );
    const { Host, closeDialog } = host({
      setAvatar,
      avatar: { variant: 'picture', url: PICTURE_URL },
      pictureUrl: PICTURE_URL,
    });
    render(
      <Host>
        <AvatarBuilderDialog />
      </Host>,
    );
    /* the builder starts on the Picture tab, the current choice */
    expect(control('dialog.avatarBuilder.panel.picture')).toBeTruthy();
    const pictures = Array.from(
      document.querySelectorAll<HTMLImageElement>(
        '[data-control="dialog.avatarBuilder.strip"] img.ts-chip-picture',
      ),
    );
    expect(pictures).toHaveLength(8);
    const at = (size: number) =>
      pictures.find(
        (img) => img.closest('.ts-avatar-cell')?.getAttribute('data-size') === String(size),
      )!;
    expect(at(24).getAttribute('src')).toBe(PICTURE_URL.replace('-64.webp', '-32.webp'));
    expect(at(24).getAttribute('srcset')).toContain('-64.webp 2x');
    expect(at(64).getAttribute('src')).toBe(PICTURE_URL);
    expect(at(128).getAttribute('src')).toBe(PICTURE_URL.replace('-64.webp', '-128.webp'));
    expect(at(128).getAttribute('srcset')).toContain('-256.webp 2x');
    expect(at(128).getAttribute('decoding')).toBe('async');
    const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    await waitFor(() => expect(closeDialog).toHaveBeenCalled());
    expect(setAvatar).not.toHaveBeenCalled();
  });

  it('falls back to the plate when the current picture fails to load', async () => {
    const { Host } = host({
      avatar: { variant: 'picture', url: PICTURE_URL },
      pictureUrl: PICTURE_URL,
    });
    render(
      <Host>
        <AvatarBuilderDialog />
      </Host>,
    );
    const first = document.querySelector<HTMLImageElement>(
      '[data-control="dialog.avatarBuilder.strip"] img.ts-chip-picture',
    )!;
    const cell = first.closest('.ts-avatar-cell')!;
    fireEvent.error(first);
    await waitFor(() => expect(cell.querySelector('img.ts-chip-picture')).toBeNull());
    expect(cell.querySelector('svg.ts-chip-plate')).not.toBeNull();
  });
});

describe('AvatarBuilderDialog, the current choice', () => {
  it('starts from the current glyph and its salt, so Apply without Another keeps the same glyph', async () => {
    const setAvatar = vi.fn<(choice: AvatarChoiceInput) => Promise<unknown>>(() =>
      Promise.resolve({}),
    );
    const { Host } = host({ setAvatar, avatar: { variant: 'glyph', salt: 12345 } });
    render(
      <Host>
        <AvatarBuilderDialog />
      </Host>,
    );
    expect(control('dialog.avatarBuilder.panel.glyph')).toBeTruthy();
    expect(control('dialog.avatarBuilder.tab.glyph').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(setAvatar).toHaveBeenCalledWith({ variant: 'glyph', salt: 12345 }));
  });

  it('hides the Picture tab while the panel is parked and starts on Initials for a parked picture choice', () => {
    parked.picture = true;
    const { Host } = host({
      avatar: { variant: 'picture', url: PICTURE_URL },
      pictureUrl: PICTURE_URL,
    });
    render(
      <Host>
        <AvatarBuilderDialog />
      </Host>,
    );
    expect(document.querySelector('[data-control="dialog.avatarBuilder.tab.picture"]')).toBeNull();
    expect(control('dialog.avatarBuilder.panel.initials')).toBeTruthy();
  });
});
