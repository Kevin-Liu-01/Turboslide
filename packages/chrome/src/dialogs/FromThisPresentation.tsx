import { Dialog } from '../Dialog';
import type { PictureTarget } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { cn } from '../lib/cn';
import { DIALOGS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * Insert > Image > From this presentation and Replace image > From this presentation
 * (gslides-parity SPEC 2.4, 2.5): the deck's pictures as tiles; a click places the chosen one
 * where the target says (a new shot block, the selected block's asset, or the slide's picture).
 */
export function FromThisPresentationDialog({ target }: { target?: PictureTarget }) {
  const shell = useEditorShell();
  const { input } = shell;
  const assets = Object.values(input.document.deck.assets);
  const assetUrl = input.assetUrl ?? ((path: string) => `/decks/${input.deckId}/${path}`);

  const pick = (assetId: string) => {
    const where: PictureTarget = target ?? { kind: 'insert', slideId: input.slideId };
    const run =
      where.kind === 'block'
        ? input.dispatch('block.set', {
            slideId: where.slideId,
            blockId: where.blockId,
            path: where.path,
            value: assetId,
            baseRevision: input.revision,
          })
        : where.kind === 'slide'
          ? input.dispatch('slide.update', {
              slideId: where.slideId,
              baseRevision: input.revision,
              mutations: [
                { op: 'slide.set', slideId: where.slideId, path: where.path, value: assetId },
              ],
            })
          : (() => {
              const slide = input.document.slides[where.slideId];
              const slot =
                slide?.kind === 'content' ? (Object.keys(slide.slots)[0] ?? 'main') : 'plate';
              return input.dispatch('block.insert', {
                slideId: where.slideId,
                slot,
                block: { id: `shot-${Date.now().toString(36)}`, type: 'shot', asset: assetId },
                baseRevision: input.revision,
              });
            })();
    run
      .then(() => shell.closeDialog())
      .catch((err: unknown) => shell.say(err instanceof Error ? err.message : String(err)));
  };

  return (
    <Dialog
      title={DIALOGS.fromThisPresentation.title}
      onClose={shell.closeDialog}
      width={560}
      control="dialog.fromThisPresentation"
    >
      {assets.length === 0 ? (
        <p className="ts-dialog-empty">No pictures in this presentation yet</p>
      ) : null}
      <div className="ts-dialog-slides" role="listbox" aria-label="Pictures">
        {assets.map((asset) => {
          const twin = 'neutral' in asset.twins ? asset.twins.neutral : asset.twins.light;
          return (
            <button
              key={asset.id}
              type="button"
              role="option"
              aria-selected={false}
              className={cn('ts-dialog-slide')}
              data-control={`dialog.fromThisPresentation.${asset.id}`}
              onClick={() => pick(asset.id)}
              {...tipProps({ name: asset.alt, doc: `${asset.size[0]} by ${asset.size[1]} px` })}
            >
              <span className="ts-dialog-slide-frame">
                {twin !== undefined ? (
                  <img src={assetUrl(twin)} alt="" loading="lazy" />
                ) : (
                  asset.alt
                )}
              </span>
              <span className="ts-dialog-slide-title">{asset.alt}</span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
