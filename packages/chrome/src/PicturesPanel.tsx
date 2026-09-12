import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { blockAssetRefs } from '@turboslide/schema/catalog';

import type { EditorDispatch } from './dispatch';
import { AssetCard, AssetIntake } from './inspector/asset';
import { DitherSection } from './inspector/dither';
import type { DitherWorkerLike } from './inspector/dither';
import { MaterialSection } from './inspector/material';
import { PANELS } from './menus/strings';
import { Panel } from './Panel';

/**
 * Tools > Advanced > Pictures and materials (gslides-parity SPEC 2.8, 3.9): the Inspector's
 * Asset, Material and Dither sections as a right panel, for the pictures the selected block or
 * the slide references, the shader recipe of a material block or picture, and the two-tone
 * treatment with its live preview. An advanced surface: its words are the grammar's.
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
  const materialBlock = selected?.type === 'material' ? selected : undefined;
  const pictureAsset = 'picture' in slide ? deck.assets[slide.picture.asset] : undefined;
  const plateSide = 'plate' in slide ? slide.plate.side : undefined;
  const materialPicture =
    materialBlock === undefined &&
    pictureAsset?.source.kind === 'material' &&
    plateSide !== undefined
      ? { asset: pictureAsset, plateSide }
      : undefined;
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
      {materialBlock !== undefined || materialPicture !== undefined ? (
        <section className="ts-panel-section">
          <div className="ts-panel-section-head is-static">
            <span>Material</span>
          </div>
          <div className="ts-panel-section-body">
            <MaterialSection
              target={
                materialBlock !== undefined
                  ? { kind: 'block', slideId: slide.id, block: materialBlock }
                  : {
                      kind: 'picture',
                      slideId: slide.id,
                      asset: (materialPicture as { asset: (typeof assets)[number] }).asset,
                      plateSide: (
                        materialPicture as {
                          plateSide: 'lower-left' | 'lower-right' | 'upper-left';
                        }
                      ).plateSide,
                    }
              }
              revision={revision}
              dispatch={dispatch}
              busy={busy}
              onNotice={onNotice}
            />
          </div>
        </section>
      ) : null}
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
