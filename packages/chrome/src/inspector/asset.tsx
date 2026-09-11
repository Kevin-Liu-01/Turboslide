import type { Asset } from '@turboslide/schema/assets';
import { isShareAlike } from '@turboslide/schema/assets';

import type { ControlProps } from './props';

import './asset.css';

/**
 * An AssetId as the asset picker (SPEC 6.5): a select over the deck's assets, and under it the
 * chosen asset's card showing both twins (or the one neutral twin) in --pt-edge frames, the alt,
 * the credit and the license. The select is the control, so the label and data-control sit on
 * it; the twins load through context.assetUrl, which the studio points at /decks/<id>/.
 */
function licenseOf(asset: Asset): string | undefined {
  if (asset.source.kind === 'photo') {
    return `${asset.source.license}${isShareAlike(asset) ? ' (share-alike: credit on the plate)' : ''}`;
  }
  if (asset.source.kind === 'material') return `material ${asset.source.materialId}`;
  if (asset.source.kind === 'capture') return `capture of ${asset.source.url}`;
  return undefined;
}

export function AssetCard({
  asset,
  assetUrl,
}: {
  asset: Asset;
  assetUrl?: (path: string) => string;
}) {
  const url = assetUrl ?? ((path: string) => path);
  const twins =
    'neutral' in asset.twins
      ? [{ theme: 'neutral', path: asset.twins.neutral }]
      : [
          { theme: 'light', path: asset.twins.light },
          { theme: 'dark', path: asset.twins.dark },
        ];
  const license = licenseOf(asset);
  return (
    <div className="ts-asset-card">
      <div className="ts-asset-twins">
        {twins.map((twin) => (
          <figure key={twin.theme} className="ts-asset-twin" data-theme={twin.theme}>
            <img src={url(twin.path)} alt={`${asset.alt} (${twin.theme})`} loading="lazy" />
            <figcaption>{twin.theme}</figcaption>
          </figure>
        ))}
      </div>
      <dl className="ts-asset-facts">
        <dt>Alt</dt>
        <dd>{asset.alt}</dd>
        <dt>Role</dt>
        <dd>
          {asset.role}, {asset.size[0]} by {asset.size[1]} at {asset.scale}x, {asset.inline}
        </dd>
        {asset.credit ? (
          <>
            <dt>Credit</dt>
            <dd>{asset.credit}</dd>
          </>
        ) : null}
        {license ? (
          <>
            <dt>License</dt>
            <dd>{license}</dd>
          </>
        ) : null}
        {asset.treatment ? (
          <>
            <dt>Treatment</dt>
            <dd>
              {asset.treatment.kind === 'two-tone'
                ? `two-tone, black ${asset.treatment.black ?? 0}, gamma ${asset.treatment.gamma ?? 1}, ${asset.treatment.polarity}`
                : `continuous, quality ${asset.treatment.quality}`}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

export function AssetControl({ spec, onChange, context, disabled }: ControlProps) {
  const assets = context?.assets ?? {};
  const current = typeof spec.value === 'string' ? spec.value : '';
  const asset = assets[current];
  const ids = Object.keys(assets).sort();
  return (
    <span className="ts-ctl-asset">
      <select
        className="ts-ctl-select"
        aria-label={spec.label}
        data-control={spec.control}
        value={current}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === '' ? undefined : raw);
        }}
      >
        {spec.optional || current === '' ? <option value="">none</option> : null}
        {current !== '' && !ids.includes(current) ? (
          <option value={current}>{current}</option>
        ) : null}
        {ids.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      {asset ? <AssetCard asset={asset} assetUrl={context?.assetUrl} /> : null}
    </span>
  );
}
