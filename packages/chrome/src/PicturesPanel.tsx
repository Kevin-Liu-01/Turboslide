import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { blockAssetRefs } from '@turboslide/schema/catalog';

import type { EditorDispatch } from './dispatch';
import { AssetCard, AssetIntake } from './inspector/asset';
import { DitherSection } from './inspector/dither';
import type { DitherWorkerLike } from './inspector/dither';
import { PANELS } from './menus/strings';
import { Panel } from './Panel';

/**
 * Tools > Advanced > Pictures and materials (gslides-parity SPEC 2.8, 3.9): the Inspector's Asset
 * and Dither sections as a right panel, for the pictures the selected block or the slide
 * references and the two-tone treatment with its live preview. An advanced surface: its words are
 * the grammar's. The Material section left this panel in the features round's ship two
 * (docs/FEATURES.md 5.3; audit-shaders 19): a shader's recipe has one home, the Shader section of
 * Format options (inspector/shader.tsx).
 */
export type PicturesPanelProps = {
  deck: Deck;
  slide: Slide;
  blockId?: string;
  revision: number;
  dispatch: EditorDispatch;
  assetUrl?: (path: string) => string;
  createDitherWorker?: () => DitherWorkerLike;
  onNotice?: (message: string) => void;
  busy?: boolean;
  onClose: () => void;
};

export function PicturesPanel({
  deck,
  slide,
  blockId,
  revision,
  dispatch,
  assetUrl,
  createDitherWorker,
  onNotice,
  busy = false,
  onClose,
}: PicturesPanelProps) {
  const selected =
    blockId === undefined
      ? undefined
      : slideBlocks(slide).find(({ block }) => block.id === blockId)?.block;
  const assetIds = new Set<string>();
  if (selected) for (const ref of blockAssetRefs(selected)) assetIds.add(ref.assetId);
  else if ('picture' in slide) assetIds.add(slide.picture.asset);
  const assets = [...assetIds].map((id) => deck.assets[id]).filter((asset) => asset !== undefined);
  const dithered = assets.filter(
    (asset) =>
      asset.treatment?.kind === 'two-tone' || asset.role === 'opener' || asset.role === 'mood',
  );
  const plateSide = 'plate' in slide ? slide.plate.side : undefined;
  const intakeRole =
    slide.kind === 'mood' ? 'mood' : slide.kind === 'opener' ? 'opener' : 'capture';

  return (
    <Panel
      title={PANELS.picturesMaterials.title}
      onClose={onClose}
      control="panel.picturesMaterials"
      className="ts-pictures"
    >
      <section className="ts-panel-section">
        <div className="ts-panel-section-head is-static">
          <span>Pictures</span>
          <span className="ts-panel-count">{assets.length}</span>
        </div>
        <div className="ts-panel-section-body">
          {assets.length === 0 ? (
            <p className="ts-panel-empty">No pictures on this slide or block</p>
          ) : null}
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} assetUrl={assetUrl} />
          ))}
          <AssetIntake
            revision={revision}
            dispatch={dispatch}
            defaultRole={intakeRole}
            plate={plateSide}
            busy={busy}
            onNotice={onNotice}
          />
        </div>
      </section>
      {dithered.length > 0 ? (
        <section className="ts-panel-section">
          <div className="ts-panel-section-head is-static">
            <span>Dither</span>
            <span className="ts-panel-count">{dithered.length}</span>
          </div>
          <div className="ts-panel-section-body">
            {dithered.map((asset) => (
              <DitherSection
                key={asset.id}
                asset={asset}
                plate={plateSide}
                revision={revision}
                dispatch={dispatch}
                assetUrl={assetUrl}
                createWorker={createDitherWorker}
                busy={busy}
                onNotice={onNotice}
              />
            ))}
          </div>
        </section>
      ) : null}
    </Panel>
  );
}
