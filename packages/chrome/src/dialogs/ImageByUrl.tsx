import { useEffect, useRef, useState } from 'react';

import type { Asset } from '@turboslide/schema/assets';

import { Dialog, DialogField } from '../Dialog';
import type { PictureTarget } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * Insert > Image > By URL and Replace image > By URL (gslides-parity SPEC 2.4, 2.5; docs/PRODUCT.md
 * section 5 "Image by URL"; audit-gaps 13): a field with a preview that waits for a 600 ms pause or
 * the blur (typing at human speed fetched every partial address), then one `asset.add` from the
 * URL and the write the target names: a new picture centred in the body slot through the stage's
 * own placement (`insertPictureAsset`, the path the upload takes, so a slide that is not a canvas
 * converts and the box is written; the plain `block.insert` had no `pos` and was refused), the
 * selected block's asset swapped with its box kept, or the slide's picture.
 */
export const PREVIEW_PAUSE_MS = 600;

/**
 * True for an address the preview and the insert take: a whole http or https URL with a host and
 * a path. The host needs no dot: an intranet name or localhost with a port is an address too
 * (the core spec's own origin, `http://localhost:4418/apple-touch-icon.png`).
 */
export function isPictureAddress(value: string): boolean {
  return /^https?:\/\/[^\s/]+\/\S+$/i.test(value.trim());
}

/** The alt a URL's file name gives the asset: the last path segment without its extension, else "picture". */
export function altOfAddress(url: string): string {
  try {
    return (
      decodeURIComponent(url.trim().split(/[?#]/)[0]?.split('/').pop() ?? 'picture').replace(
        /\.[a-z0-9]+$/i,
        '',
      ) || 'picture'
    );
  } catch {
    return 'picture';
  }
}

/**
 * The stage handle's picture routes (viewer Editor.tsx): `insertPictureFromUrl` fetches the
 * address in the page when it can and takes the upload's path whole (the sniff, the instant
 * preview, the placement in the body slot or the swap of a block's picture), else the server's
 * `asset.add` by URL, and rejects with the sentence this dialog shows; `insertPictureAsset` places
 * an asset the document holds. A handle without them takes the older dispatch path below.
 */
type PlacingEditor = {
  insertPictureFromUrl?: (
    url: string,
    where?: { blockId?: string; replace?: boolean },
  ) => Promise<void>;
  insertPictureAsset?: (
    asset: { id: string; size?: Asset['size'] | undefined },
    where?: { blockId?: string },
  ) => void | Promise<void>;
};

export function ImageByUrlDialog({ target }: { target?: PictureTarget }) {
  const shell = useEditorShell();
  const { input } = shell;
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pause = useRef(0);
  const valid = isPictureAddress(url);

  /* the preview follows the field after a pause, never per keystroke */
  useEffect(() => {
    window.clearTimeout(pause.current);
    if (!valid) {
      setPreview('');
      return undefined;
    }
    pause.current = window.setTimeout(() => setPreview(url.trim()), PREVIEW_PAUSE_MS);
    return () => window.clearTimeout(pause.current);
  }, [url, valid]);

  const showPreviewNow = () => {
    window.clearTimeout(pause.current);
    if (valid) setPreview(url.trim());
  };

  const insert = () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const address = url.trim();
    const where: PictureTarget = target ?? { kind: 'insert', slideId: input.slideId };
    const editor = input.editor as PlacingEditor | undefined;
    if (editor?.insertPictureFromUrl !== undefined && where.kind !== 'background') {
      /* the stage's own route (VERIFICATION.md product pass 1 finding 7: the plain `asset.add`
         by URL never reached a picture on a checkout or a preview, since the server may not fetch
         a private or an unlisted host and a block naming an asset the document had not received
         was refused); a failure reads in the dialog as one sentence */
      editor
        .insertPictureFromUrl(
          address,
          where.kind === 'block'
            ? { blockId: where.blockId }
            : where.kind === 'slide'
              ? { replace: true }
              : {},
        )
        .then(() => shell.closeDialog())
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setBusy(false));
      return;
    }
    input
      .dispatch('asset.add', {
        url: address,
        role: 'capture',
        alt: altOfAddress(address),
        baseRevision: input.revision,
      })
      .then(async (answer) => {
        const asset = answer as { id: string; size?: [number, number]; revision?: number };
        const revision = asset.revision ?? input.revision + 1;
        if (where.kind === 'block') {
          if (editor?.insertPictureAsset !== undefined) {
            editor.insertPictureAsset(asset, { blockId: where.blockId });
          } else {
            await input.dispatch('block.set', {
              slideId: where.slideId,
              blockId: where.blockId,
              path: where.path,
              value: asset.id,
              baseRevision: revision,
            });
          }
        } else if (where.kind === 'slide') {
          await input.dispatch('slide.update', {
            slideId: where.slideId,
            baseRevision: revision,
            mutations: [
              { op: 'slide.set', slideId: where.slideId, path: where.path, value: asset.id },
            ],
          });
        } else if (editor?.insertPictureAsset !== undefined) {
          editor.insertPictureAsset(asset);
        } else {
          const slide = input.document.slides[where.slideId];
          const slot =
            slide?.kind === 'content' ? (Object.keys(slide.slots)[0] ?? 'main') : 'plate';
          await input.dispatch('block.insert', {
            slideId: where.slideId,
            slot,
            block: { id: `shot-${Date.now().toString(36)}`, type: 'shot', asset: asset.id },
            baseRevision: revision,
          });
        }
        shell.closeDialog();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  const replacing = target !== undefined && target.kind !== 'insert';
  return (
    <Dialog
      title={DIALOGS.imageByUrl.title}
      onClose={shell.closeDialog}
      width={480}
      control="dialog.imageByUrl"
      cancel
      actions={[
        {
          label: replacing ? 'Replace' : 'Insert',
          primary: true,
          disabled: !valid || busy,
          onClick: insert,
          control: 'dialog.imageByUrl.ok',
          doc: replacing
            ? 'Fetches the picture and puts it in the same box'
            : 'Fetches the picture and centres it in the body slot',
        },
      ]}
    >
      <DialogField label="Image address" hint="Pictures up to 25 MB">
        <input
          type="url"
          value={url}
          autoFocus
          placeholder="https://"
          aria-label="Image address"
          data-control="dialog.imageByUrl.url"
          autoComplete="off"
          spellCheck={false}
          {...tipProps({ name: 'Image address', doc: 'A web address of a picture' })}
          onChange={(event) => {
            setUrl(event.target.value);
            setError(null);
          }}
          onBlur={showPreviewNow}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && valid && !busy) {
              event.preventDefault();
              insert();
            }
          }}
        />
      </DialogField>
      {preview !== '' ? (
        <div className="ts-dialog-slide-frame" style={{ maxHeight: 200 }}>
          <img
            src={preview}
            alt=""
            data-control="dialog.imageByUrl.preview"
            onError={() => setError('The picture could not be loaded from this address')}
            onLoad={() => setError(null)}
          />
        </div>
      ) : null}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
