import { useState } from 'react';

import { Dialog, DialogField } from '../Dialog';
import type { PictureTarget } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * Insert > Image > By URL and Replace image > By URL (gslides-parity SPEC 2.4, 2.5): a field with
 * a preview, then one `asset.add` from the URL and the write the target names (a new shot block,
 * the selected block's asset, or the slide's picture).
 */
export function ImageByUrlDialog({ target }: { target?: PictureTarget }) {
  const shell = useEditorShell();
  const { input } = shell;
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^https?:\/\/\S+$/i.test(url.trim());

  const insert = () => {
    if (!valid || busy) return;
    setBusy(true);
    const alt =
      decodeURIComponent(url.trim().split('/').pop() ?? 'picture').replace(/\.[a-z0-9]+$/i, '') ||
      'picture';
    input
      .dispatch('asset.add', {
        url: url.trim(),
        role: 'capture',
        alt,
        baseRevision: input.revision,
      })
      .then(async (asset) => {
        const id = (asset as { id: string }).id;
        const where: PictureTarget = target ?? { kind: 'insert', slideId: input.slideId };
        const revision = (asset as { revision?: number }).revision ?? input.revision + 1;
        if (where.kind === 'block') {
          await input.dispatch('block.set', {
            slideId: where.slideId,
            blockId: where.blockId,
            path: where.path,
            value: id,
            baseRevision: revision,
          });
        } else if (where.kind === 'slide') {
          await input.dispatch('slide.update', {
            slideId: where.slideId,
            baseRevision: revision,
            mutations: [{ op: 'slide.set', slideId: where.slideId, path: where.path, value: id }],
          });
        } else {
          const slide = input.document.slides[where.slideId];
          const slot =
            slide?.kind === 'content' ? (Object.keys(slide.slots)[0] ?? 'main') : 'plate';
          await input.dispatch('block.insert', {
            slideId: where.slideId,
            slot,
            block: { id: `shot-${Date.now().toString(36)}`, type: 'shot', asset: id },
            baseRevision: revision,
          });
        }
        shell.closeDialog();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title={DIALOGS.imageByUrl.title}
      onClose={shell.closeDialog}
      width={480}
      control="dialog.imageByUrl"
      cancel
      actions={[
        {
          label: target !== undefined && target.kind !== 'insert' ? 'Replace' : 'Insert',
          primary: true,
          disabled: !valid || busy,
          onClick: insert,
          control: 'dialog.imageByUrl.ok',
          doc: 'Fetches the picture and places it',
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
          {...tipProps({ name: 'Image address', doc: 'A web address of a picture' })}
          onChange={(event) => setUrl(event.target.value)}
        />
      </DialogField>
      {valid ? (
        <div className="ts-dialog-slide-frame" style={{ maxHeight: 200 }}>
          <img
            src={url.trim()}
            alt=""
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
