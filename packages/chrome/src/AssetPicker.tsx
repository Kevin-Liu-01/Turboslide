import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { Asset, AssetRole } from '@turboslide/schema/assets';
import { ASSET_ROLES } from '@turboslide/schema/assets';

import { cn } from './lib/cn';
import { Seg } from './Seg';
import { tipProps } from './Tooltip';
import type { SegOption } from './Seg';

import './AssetPicker.css';

/**
 * The asset picker (SPEC 6.5: "AssetId becomes the asset picker showing both twins, credit and
 * license"; MILESTONES M5 item 1): the deck's assets as a filtered list of rows, each with its
 * two twins (or the one neutral twin) in --pt-edge frames, its id, its role and its size. A
 * filter field narrows by id, alt, credit and role; a role Seg narrows to the roles present.
 * Enter or a click picks; Escape closes. The list is a listbox whose options carry data-control
 * ids (`<control>.<assetId>`) so the window API can pick by id, and the filter field carries
 * `<control>.filter`. Rows draw --pt-hair-soft under themselves, the last none (the line law).
 */
export type AssetPickerProps = {
  assets: Readonly<Record<string, Asset>>;
  /** the asset shown as selected */
  value?: string;
  onPick: (assetId: string) => void;
  onClose?: () => void;
  assetUrl?: (path: string) => string;
  /** limit to these roles; every role when absent */
  roles?: ReadonlyArray<AssetRole>;
  /** the accessible name, `fig: Asset picker` */
  label: string;
  /** the data-control prefix, `block.fig.asset.picker` */
  control: string;
  className?: string;
};

const ROLE_WORDS: Record<AssetRole, string> = {
  opener: 'openers',
  mood: 'moods',
  capture: 'captures',
  detail: 'details',
  thumb: 'thumbs',
  render: 'renders',
  icon: 'icons',
  logo: 'logos',
  frame: 'frames',
  other: 'other',
};

/** The rows a filter and a role leave, in id order. */
export function filterAssets(
  assets: Readonly<Record<string, Asset>>,
  needle: string,
  role: AssetRole | 'all',
  roles?: ReadonlyArray<AssetRole>,
): Asset[] {
  const q = needle.trim().toLowerCase();
  return Object.values(assets)
    .filter((asset) => roles === undefined || roles.includes(asset.role))
    .filter((asset) => role === 'all' || asset.role === role)
    .filter(
      (asset) =>
        q === '' ||
        asset.id.includes(q) ||
        asset.alt.toLowerCase().includes(q) ||
        (asset.credit ?? '').toLowerCase().includes(q) ||
        asset.role.includes(q),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

function twinsOf(asset: Asset): { theme: string; path: string }[] {
  return 'neutral' in asset.twins
    ? [{ theme: 'neutral', path: asset.twins.neutral }]
    : [
        { theme: 'light', path: asset.twins.light },
        { theme: 'dark', path: asset.twins.dark },
      ];
}

export function AssetPicker({
  assets,
  value,
  onPick,
  onClose,
  assetUrl,
  roles,
  label,
  control,
  className,
}: AssetPickerProps) {
  const url = assetUrl ?? ((path: string) => path);
  const [needle, setNeedle] = useState('');
  const [role, setRole] = useState<AssetRole | 'all'>('all');
  const [cursor, setCursor] = useState(0);
  const present = useMemo(() => {
    const set = new Set<AssetRole>();
    for (const asset of Object.values(assets))
      if (roles === undefined || roles.includes(asset.role)) set.add(asset.role);
    return ASSET_ROLES.filter((r) => set.has(r));
  }, [assets, roles]);
  const rows = useMemo(
    () => filterAssets(assets, needle, role, roles),
    [assets, needle, role, roles],
  );
  const active = rows[Math.min(cursor, Math.max(0, rows.length - 1))];

  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (event.key === 'Enter' && active) {
      event.preventDefault();
      onPick(active.id);
    }
  };

  const segOptions: readonly SegOption<string>[] = [
    { value: 'all', label: 'All', title: `${label}: every role` },
    ...present
      .slice(0, 3)
      .map((r) => ({ value: r, label: ROLE_WORDS[r], title: `${label}: ${ROLE_WORDS[r]}` })),
  ];

  const rowTip = (asset: Asset) =>
    tipProps({ name: asset.id, doc: `${asset.alt} Picks this asset for the field.` });

  return (
    <div
      className={cn('ts-asset-picker', className)}
      role="group"
      aria-label={label}
      onKeyDown={onKey}
    >
      <div className="ts-asset-picker-head">
        <input
          className="ts-asset-picker-filter"
          type="search"
          placeholder="Filter assets"
          aria-label={`${label} filter`}
          data-control={`${control}.filter`}
          value={needle}
          {...tipProps({
            name: 'Filter assets',
            doc: 'Matches the id, the alt text and the role; the arrows move, Enter picks.',
            key: 'Enter',
          })}
          onChange={(event) => {
            setNeedle(event.target.value);
            setCursor(0);
          }}
        />
        {present.length > 1 ? (
          <Seg
            options={segOptions}
            value={role}
            onChange={(next) => {
              setRole(next === 'all' ? 'all' : (next as AssetRole));
              setCursor(0);
            }}
            label={`${label} role`}
            className="is-small"
            control={`${control}.role`}
          />
        ) : null}
        {present.length > 4 ? (
          <select
            className="ts-ctl-select ts-asset-picker-roles"
            aria-label={`${label} role list`}
            data-control={`${control}.role.list`}
            value={role}
            {...tipProps({ name: 'Role', doc: 'Shows the assets of one role, or every role.' })}
            onChange={(event) =>
              setRole(event.target.value === 'all' ? 'all' : (event.target.value as AssetRole))
            }
          >
            <option value="all">every role</option>
            {present.map((r) => (
              <option key={r} value={r}>
                {ROLE_WORDS[r]}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <ul className="ts-asset-picker-list pt-scroll" role="listbox" aria-label={`${label} list`}>
        {rows.length === 0 ? <li className="ts-asset-picker-empty">No asset matches</li> : null}
        {rows.map((asset, index) => (
          <li key={asset.id} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={asset.id === value}
              className={cn(
                'ts-asset-picker-row',
                asset.id === value && 'is-picked',
                index === cursor && 'is-cursor',
              )}
              data-control={`${control}.${asset.id}`}
              {...rowTip(asset)}
              onMouseEnter={(event) => {
                rowTip(asset).onMouseEnter(event);
                setCursor(index);
              }}
              onClick={() => onPick(asset.id)}
            >
              <span className="ts-asset-picker-twins" aria-hidden="true">
                {twinsOf(asset).map((twin) => (
                  <img
                    key={twin.theme}
                    src={url(twin.path)}
                    alt=""
                    loading="lazy"
                    data-theme={twin.theme}
                  />
                ))}
              </span>
              <span className="ts-asset-picker-id">{asset.id}</span>
              <span className="ts-asset-picker-meta">
                {asset.role} · {asset.size[0]} by {asset.size[1]}
                {asset.treatment?.kind === 'two-tone' ? ' · two-tone' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
