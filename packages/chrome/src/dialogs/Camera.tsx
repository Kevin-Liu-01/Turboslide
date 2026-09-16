import { useEffect, useRef, useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';
import { deckPage } from '@turboslide/schema/render';

import { Dialog, DialogField } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { MEDIA_DIALOGS } from './media-strings';

import './media-dialogs.css';

/**
 * Insert > Image > Camera (gslides-parity SPEC-5 3.7; R11 6; MILESTONES-5 B2 day 6): a
 * `<video autoplay muted playsinline>` preview of `getUserMedia({ video: { width 1600, height
 * 900 ideal, facingMode user }, audio: false })`, a device picker when more than one camera
 * exists, Capture (the frame drawn to a canvas at up to 1600 px wide, encoded as JPEG) and Use
 * photo, which runs `asset.add { file, role: 'other', alt }` and places a picture object 960 by
 * 540 at the centre of the slide, the same path as a pasted picture. The refusals are sentences:
 * `NotAllowedError` "Allow the camera in the browser to take a photo", `NotFoundError` "No camera
 * was found", an insecure context "The camera needs https or localhost". The stream's tracks stop
 * on close. `camera.capture` over the window (the CLI's `--from <studio>`, MCP) opens this dialog
 * through `beginCameraCapture` and settles when Use photo or Cancel runs: the dialog is the
 * executor (SPEC-5 3.8). The browser APIs are read through `cameraDeps()`, which a test replaces.
 */
export const CAMERA_WORDS = {
  title: 'Camera',
  device: 'Camera',
  capture: 'Capture',
  retake: 'Retake',
  use: 'Use Photo',
  waiting: 'Waiting for the camera',
  notAllowed: 'Allow the camera in the browser to take a photo',
  notFound: 'No camera was found',
  insecure: 'The camera needs https or localhost',
  unsupported: 'This browser has no camera API',
  alt: 'Photo from the camera',
} as const;

/** The box a camera photo lands in: 960 by 540, centred on the page, like a video (SPEC-5 3.2). */
export const CAMERA_PHOTO_SIZE: readonly [number, number] = [960, 540];

export type CameraStream = { getTracks: () => ReadonlyArray<{ stop: () => void }> };
export type CameraDevice = { deviceId: string; label: string };

export type CameraDeps = {
  /** null when the API is absent (an insecure context, an old engine) */
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<CameraStream>) | null;
  enumerateDevices: () => Promise<CameraDevice[]>;
  /** the frame of the preview as a JPEG data URL at up to 1600 px wide */
  captureFrame: (video: HTMLVideoElement) => Promise<string>;
  secureContext: boolean;
};

let deps: CameraDeps | null = null;

function browserDeps(): CameraDeps {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  return {
    getUserMedia:
      devices !== undefined && typeof devices.getUserMedia === 'function'
        ? (constraints) => devices.getUserMedia(constraints) as Promise<CameraStream>
        : null,
    enumerateDevices: async () => {
      if (devices === undefined || typeof devices.enumerateDevices !== 'function') return [];
      const all = await devices.enumerateDevices();
      return all
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
        }));
    },
    captureFrame: async (video) => {
      const width = Math.min(video.videoWidth || 1600, 1600);
      const height = Math.round((width * (video.videoHeight || 900)) / (video.videoWidth || 1600));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('The picture could not be drawn');
      context.drawImage(video, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', 0.88);
    },
    secureContext: typeof window === 'undefined' ? true : window.isSecureContext,
  };
}

/** The camera dependencies in use; a test sets its own with `configureCameraDeps`. */
export function cameraDeps(): CameraDeps {
  deps ??= browserDeps();
  return deps;
}

export function configureCameraDeps(next: CameraDeps | null): void {
  deps = next;
}

/** The sentence for a `getUserMedia` refusal (R11 6). */
export function cameraRefusal(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return CAMERA_WORDS.notAllowed;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return CAMERA_WORDS.notFound;
  return error instanceof Error && error.message !== '' ? error.message : CAMERA_WORDS.unsupported;
}

export type CameraCaptureInput = {
  slideId: string;
  alt?: string;
  pos?: { x: number; y: number; w: number; h: number };
  baseRevision: number;
};

export type CameraCaptureResult = { revision: number; blockId: string; assetId: string };

type PendingCapture = {
  input: CameraCaptureInput;
  resolve: (result: CameraCaptureResult) => void;
  reject: (error: Error) => void;
};

let pending: PendingCapture | null = null;

/** The sentence a closed dialog answers the action with. */
export const CAMERA_CANCELLED = 'The Camera dialog was closed before a photo was used';

/**
 * `camera.capture` over the window (SPEC-5 3.8): remembers the action's input, and the promise
 * settles when the open dialog's Use photo commits (the result) or the dialog closes (a
 * rejection). The caller opens the dialog after this call; the controller's `on('camera.capture')`
 * row is `beginCameraCapture(input)` then `openDialog('Camera')` (b2.md request).
 */
export function beginCameraCapture(input: CameraCaptureInput): Promise<CameraCaptureResult> {
  pending?.reject(new Error(CAMERA_CANCELLED));
  return new Promise<CameraCaptureResult>((resolve, reject) => {
    pending = { input, resolve, reject };
  });
}

/** The action the open dialog serves, or null when Insert > Image > Camera opened it. */
export function pendingCameraCapture(): CameraCaptureInput | null {
  return pending?.input ?? null;
}

function settle(result: CameraCaptureResult | Error): void {
  const current = pending;
  pending = null;
  if (current === null) return;
  if (result instanceof Error) current.reject(result);
  else current.resolve(result);
}

export function CameraDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const api = cameraDeps();
  const action = pendingCameraCapture();
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<CameraStream | null>(null);

  const stop = () => {
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!api.secureContext) {
      setError(CAMERA_WORDS.insecure);
      return;
    }
    if (api.getUserMedia === null) {
      setError(CAMERA_WORDS.unsupported);
      return;
    }
    api
      .getUserMedia({
        video: {
          width: { ideal: 1600 },
          height: { ideal: 900 },
          ...(deviceId === '' ? { facingMode: 'user' } : { deviceId: { exact: deviceId } }),
        },
        audio: false,
      })
      .then(async (opened) => {
        if (cancelled) {
          for (const track of opened.getTracks()) track.stop();
          return;
        }
        stop();
        stream.current = opened;
        const element = video.current;
        if (element !== null) {
          element.srcObject = opened as unknown as MediaStream;
          try {
            await element.play();
          } catch {
            // a muted preview is allowed everywhere; a refusal leaves the frame black
          }
        }
        setError(null);
        setReady(true);
        const found = await api.enumerateDevices();
        if (!cancelled) setDevices(found);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(cameraRefusal(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, deviceId]);

  useEffect(() => () => stop(), []);

  const close = () => {
    stop();
    settle(new Error(CAMERA_CANCELLED));
    shell.closeDialog();
  };

  const capture = () => {
    const element = video.current;
    if (element === null) return;
    api
      .captureFrame(element)
      .then((dataUrl) => setFrame(dataUrl))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const use = () => {
    if (frame === null || busy) return;
    setBusy(true);
    setError(null);
    const slideId = action?.slideId ?? input.slideId;
    const alt = action?.alt ?? CAMERA_WORDS.alt;
    const at = new Date().toISOString();
    const stamp = at.replace(/[-:.TZ]/g, '').slice(0, 14);
    const assetId = `camera-${stamp}`;
    const baseRevision = action?.baseRevision ?? input.revision;
    const page = deckPage(input.document.deck);
    const [w, h] = CAMERA_PHOTO_SIZE;
    const pos = action?.pos ?? {
      x: Math.round((page.width - w) / 2),
      y: Math.round((page.height - h) / 2),
      w,
      h,
    };
    input
      .dispatch('asset.add', { id: assetId, file: frame, role: 'other', alt, baseRevision })
      .then(async (asset) => {
        const id = (asset as { id: string }).id;
        const revision = (asset as { revision?: number }).revision ?? baseRevision + 1;
        const block = {
          id: `photo-${stamp}`,
          type: 'picture',
          asset: id,
          alt,
          pos,
        } as unknown as Block;
        const placed = (await input.dispatch('block.insert', {
          slideId,
          block,
          baseRevision: revision,
        })) as { revision: number };
        stop();
        settle({ revision: placed.revision, blockId: block.id, assetId: id });
        shell.closeDialog();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title={CAMERA_WORDS.title}
      onClose={close}
      width={640}
      control="dialog.camera"
      cancel
      actions={[
        frame === null
          ? {
              label: CAMERA_WORDS.capture,
              primary: true,
              disabled: !ready || error !== null,
              onClick: capture,
              control: 'dialog.camera.capture',
              doc: 'Takes the frame the preview shows',
            }
          : {
              label: CAMERA_WORDS.retake,
              onClick: () => setFrame(null),
              control: 'dialog.camera.retake',
              doc: 'Back to the live preview',
            },
        {
          label: CAMERA_WORDS.use,
          primary: frame !== null,
          disabled: frame === null || busy,
          onClick: use,
          control: 'dialog.camera.use',
          doc: 'Places the photo on the slide as a picture',
        },
      ]}
    >
      <div className="ts-media-camera" data-control="dialog.camera.preview">
        <video
          ref={video}
          className="ts-media-camera-video"
          autoPlay
          muted
          playsInline
          hidden={frame !== null}
          aria-label={CAMERA_WORDS.waiting}
        />
        {frame !== null ? (
          <img className="ts-media-camera-still" src={frame} alt={CAMERA_WORDS.alt} />
        ) : null}
      </div>
      {devices.length > 1 ? (
        <DialogField label={CAMERA_WORDS.device}>
          <select
            className="ts-dialog-select"
            value={deviceId}
            data-control="dialog.camera.device"
            onChange={(event) => {
              setFrame(null);
              setDeviceId(event.target.value);
            }}
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </DialogField>
      ) : null}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert" data-control="dialog.camera.error">
          {error}
        </p>
      ) : null}
      <p className="ts-dialog-hint">{MEDIA_DIALOGS.cameraHint}</p>
    </Dialog>
  );
}
