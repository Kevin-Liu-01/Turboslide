import { useState } from 'react';
import type { ChangeEvent, ClipboardEvent, DragEvent } from 'react';

import type { Asset, AssetRole } from '@turboslide/schema/assets';
import { ASSET_ROLES, isShareAlike } from '@turboslide/schema/assets';

import { AssetPicker } from '../AssetPicker';
import type { EditorDispatch } from '../dispatch';
import { ToolButton } from '../ToolButton';
import type { ControlProps } from './props';

import './asset.css';

/**
 * An AssetId as the asset picker (SPEC 6.5): a select over the deck's assets (the control the
 * window API writes), a Browse button that opens the AssetPicker with every twin under it, and
 * the chosen asset's card showing both twins (or the one neutral twin) in --pt-edge frames, the
 * alt, the credit and the license. The twins load through context.assetUrl, which the studio
 * points at /decks/<id>/.
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
        {asset.source.kind === 'photo' && asset.source.title ? (
          <>
            <dt>Title</dt>
            <dd>{asset.source.title}</dd>
          </>
        ) : null}
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
        {asset.source.kind === 'material' ? (
          <>
            <dt>Recipe</dt>
            <dd className="ts-asset-mono">
              {asset.source.timeMs} ms, {asset.source.backend},{' '}
              {asset.source.recipeKey.slice(0, 19)}
            </dd>
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
        {asset.sourceFile ? (
          <>
            <dt>Source</dt>
            <dd className="ts-asset-mono">{asset.sourceFile}</dd>
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
  const [browsing, setBrowsing] = useState(false);
  return (
    <span className="ts-ctl-asset">
      <span className="ts-ctl-asset-row">
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
        <ToolButton
          title={browsing ? 'Close the asset picker' : 'Browse the deck’s assets with their twins'}
          ariaLabel={`${spec.label} browse`}
          icon="photo"
          pressed={browsing}
          control={`${spec.control}.browse`}
          onClick={() => setBrowsing((open) => !open)}
        />
      </span>
      {browsing ? (
        <AssetPicker
          assets={assets}
          value={current}
          label={`${spec.label} picker`}
          control={`${spec.control}.picker`}
          assetUrl={context?.assetUrl}
          onPick={(id) => {
            onChange(id);
            setBrowsing(false);
          }}
          onClose={() => setBrowsing(false)}
        />
      ) : null}
      {asset ? <AssetCard asset={asset} assetUrl={context?.assetUrl} /> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Asset intake: drop, paste, a URL, the license fields, asset.add (MILESTONES M5 item 1)

export type PlateSide = 'lower-left' | 'lower-right' | 'upper-left';

export type IntakeFile = { name: string; dataUrl: string };

/** The image files of a drop or a file input as data URLs the asset.add action takes as `file`. */
export async function readImageFiles(files: Iterable<File>): Promise<IntakeFile[]> {
  const out: IntakeFile[] = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(file);
    });
    out.push({ name: file.name || 'pasted.png', dataUrl });
  }
  return out;
}

/** The image files of a DataTransfer (a drop on the stage or the section, or a paste). */
export function imageFilesOf(transfer: DataTransfer | null): File[] {
  if (transfer === null) return [];
  const files: File[] = [];
  for (const item of Array.from(transfer.items)) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file !== null && file.type.startsWith('image/')) files.push(file);
  }
  if (files.length === 0)
    for (const file of Array.from(transfer.files))
      if (file.type.startsWith('image/')) files.push(file);
  return files;
}

/** A pasted or dropped URL, when the transfer carries one instead of a file. */
export function urlOf(transfer: DataTransfer | null): string | undefined {
  if (transfer === null) return undefined;
  const text = transfer.getData('text/uri-list') || transfer.getData('text/plain');
  const first = text.split(/\r?\n/).find((line) => /^https?:\/\//i.test(line.trim()));
  return first?.trim();
}

export type AssetIntakeProps = {
  revision: number;
  dispatch: EditorDispatch;
  /** the role the form starts on; mood for a mood slide, capture otherwise */
  defaultRole?: AssetRole;
  /** the plate the two-tone metrics are screened against, from the slide */
  plate?: PlateSide;
  onAdded?: (asset: Asset) => void;
  onNotice?: (line: string) => void;
  /** a file or URL handed in from the stage's drop or paste */
  incoming?: { file?: IntakeFile; url?: string } | null;
  busy?: boolean;
  /** the data-control prefix; `asset.intake` */
  control?: string;
};

const ROLE_LABEL: Record<AssetRole, string> = {
  opener: 'opener picture',
  mood: 'mood photograph',
  capture: 'page capture',
  detail: 'detail crop',
  thumb: 'thumbnail',
  render: 'render',
  icon: 'icon',
  logo: 'logo',
  frame: 'material frame',
  other: 'other',
};

const SHARE_ALIKE = /BY-SA|share[- ]?alike/i;

export function AssetIntake({
  revision,
  dispatch,
  defaultRole = 'capture',
  plate,
  onAdded,
  onNotice,
  incoming = null,
  busy = false,
  control = 'asset.intake',
}: AssetIntakeProps) {
  const [file, setFile] = useState<IntakeFile | null>(incoming?.file ?? null);
  const [url, setUrl] = useState(incoming?.url ?? '');
  const [id, setId] = useState('');
  const [alt, setAlt] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [license, setLicense] = useState('');
  const [shareAlike, setShareAlike] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [role, setRole] = useState<AssetRole>(defaultRole);
  const [twoTone, setTwoTone] = useState(defaultRole === 'mood' || defaultRole === 'opener');
  const [plateSide, setPlateSide] = useState<PlateSide | ''>(plate ?? '');
  const [over, setOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async (transfer: DataTransfer | null) => {
    const files = imageFilesOf(transfer);
    if (files.length > 0) {
      const [first] = await readImageFiles(files.slice(0, 1));
      if (first) {
        setFile(first);
        if (id === '')
          setId(
            first.name
              .replace(/\.[a-z0-9]+$/i, '')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-'),
          );
        return;
      }
    }
    const dropped = urlOf(transfer);
    if (dropped !== undefined) setUrl(dropped);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setOver(false);
    void take(event.dataTransfer);
  };
  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    if (imageFilesOf(event.clipboardData).length === 0 && urlOf(event.clipboardData) === undefined)
      return;
    event.preventDefault();
    void take(event.clipboardData);
  };
  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    void take(
      event.target.files === null
        ? null
        : ({ items: [], files: event.target.files, getData: () => '' } as unknown as DataTransfer),
    );
  };

  const canAdd =
    (file !== null || /^https?:\/\//i.test(url)) && alt.trim() !== '' && !adding && !busy;

  const add = () => {
    if (!canAdd) return;
    setAdding(true);
    setError(null);
    const input: Record<string, unknown> = {
      ...(id.trim() !== '' ? { id: id.trim() } : {}),
      ...(file !== null ? { file: file.dataUrl } : { url: url.trim() }),
      role,
      alt: alt.trim(),
      ...(title.trim() !== '' ? { title: title.trim() } : {}),
      ...(artist.trim() !== '' ? { artist: artist.trim() } : {}),
      ...(license.trim() !== '' ? { license: license.trim() } : {}),
      ...(shareAlike || SHARE_ALIKE.test(license) ? { shareAlike: true } : {}),
      ...(sourceUrl.trim() !== '' ? { sourceUrl: sourceUrl.trim() } : {}),
      ...(twoTone ? { twoTone: true } : {}),
      ...(plateSide !== '' ? { plate: plateSide } : {}),
      baseRevision: revision,
    };
    dispatch('asset.add', input)
      .then((result) => {
        const asset = result as Asset;
        onAdded?.(asset);
        onNotice?.(`Added ${asset.id} (${asset.role})`);
        setFile(null);
        setUrl('');
        setId('');
        setAlt('');
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setAdding(false));
  };

  const field = (
    name: string,
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder?: string,
  ) => (
    <div className="ts-insp-row" key={name}>
      <span className="ts-insp-label">{label}</span>
      <div className="ts-insp-field">
        <input
          className="ts-intake-field"
          type="text"
          aria-label={`asset intake: ${label}`}
          data-control={`${control}.${name}`}
          value={value}
          placeholder={placeholder}
          disabled={busy}
          onChange={(event) => set(event.target.value)}
        />
      </div>
    </div>
  );

  return (
    <div className="ts-intake" data-control={control} onPaste={onPaste}>
      <div
        className={over ? 'ts-intake-drop is-over' : 'ts-intake-drop'}
        role="button"
        tabIndex={0}
        aria-label="asset intake: drop zone"
        data-control={`${control}.drop`}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {file !== null ? (
          <img className="ts-intake-thumb" src={file.dataUrl} alt={file.name} />
        ) : (
          <span className="ts-intake-hint">
            Drop or paste a picture here, pick a file, or paste a URL below.
          </span>
        )}
        <label className="ts-intake-file">
          <input
            type="file"
            accept="image/*"
            aria-label="asset intake: file"
            data-control={`${control}.file`}
            disabled={busy}
            onChange={onPickFile}
          />
          <span>{file !== null ? file.name : 'Choose a file'}</span>
        </label>
      </div>
      {field('url', 'URL', url, setUrl, 'https://')}
      {field('id', 'Id', id, setId, 'from the file name')}
      {field('alt', 'Alt text', alt, setAlt, 'required')}
      <div className="ts-insp-row">
        <span className="ts-insp-label">Role</span>
        <div className="ts-insp-field">
          <select
            className="ts-ctl-select"
            aria-label="asset intake: Role"
            data-control={`${control}.role`}
            value={role}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.value as AssetRole;
              setRole(next);
              if (next === 'mood' && plateSide === '') setPlateSide('lower-right');
              if (next === 'opener' && plateSide === '') setPlateSide('lower-left');
            }}
          >
            {ASSET_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {field('title', 'Title', title, setTitle, 'the picture’s name')}
      {field('artist', 'Artist', artist, setArtist)}
      {field('license', 'License', license, setLicense, 'CC BY-SA 4.0, public domain')}
      <div className="ts-insp-row">
        <span className="ts-insp-label">Share-alike</span>
        <div className="ts-insp-field">
          <label className="ts-ctl-check">
            <input
              type="checkbox"
              aria-label="asset intake: Share-alike"
              data-control={`${control}.shareAlike`}
              checked={shareAlike || SHARE_ALIKE.test(license)}
              disabled={busy}
              onChange={(event) => setShareAlike(event.target.checked)}
            />
            <span className="ts-ctl-check-box" aria-hidden="true" />
            <span className="ts-ctl-check-word" aria-hidden="true">
              {shareAlike || SHARE_ALIKE.test(license) ? 'credit on the plate' : 'off'}
            </span>
          </label>
        </div>
      </div>
      {field(
        'sourceUrl',
        'Source URL',
        sourceUrl,
        setSourceUrl,
        'https://commons.wikimedia.org/...',
      )}
      <div className="ts-insp-row">
        <span className="ts-insp-label">Two-tone</span>
        <div className="ts-insp-field">
          <label className="ts-ctl-check">
            <input
              type="checkbox"
              aria-label="asset intake: Two-tone"
              data-control={`${control}.twoTone`}
              checked={twoTone}
              disabled={busy}
              onChange={(event) => setTwoTone(event.target.checked)}
            />
            <span className="ts-ctl-check-box" aria-hidden="true" />
            <span className="ts-ctl-check-word" aria-hidden="true">
              {twoTone ? 'through the screen' : 'off'}
            </span>
          </label>
        </div>
      </div>
      {twoTone ? (
        <div className="ts-insp-row">
          <span className="ts-insp-label">Plate</span>
          <div className="ts-insp-field">
            <select
              className="ts-ctl-select"
              aria-label="asset intake: Plate"
              data-control={`${control}.plate`}
              value={plateSide}
              disabled={busy}
              onChange={(event) => setPlateSide(event.target.value as PlateSide | '')}
            >
              <option value="">none</option>
              <option value="lower-left">lower left</option>
              <option value="lower-right">lower right</option>
              <option value="upper-left">upper left</option>
            </select>
          </div>
        </div>
      ) : null}
      <div className="ts-intake-actions">
        <ToolButton
          title="Add the picture to the deck (asset.add)"
          label={adding ? 'Adding' : 'Add asset'}
          icon="sparkles"
          control={`${control}.add`}
          onClick={add}
          solid
        />
        {!canAdd && !adding ? (
          <span className="ts-intake-need">
            {file === null && !/^https?:\/\//i.test(url)
              ? 'A picture or a URL first'
              : alt.trim() === ''
                ? 'Alt text is required'
                : ''}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="ts-intake-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
