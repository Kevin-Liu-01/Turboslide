import { useEffect, useMemo, useRef, useState } from 'react';

import { requireMaterial, materialEntry, MATERIAL_IDS } from '@turboslide/materials/catalog';
import type { MaterialEntry } from '@turboslide/materials/catalog';
import { resolveRecipe } from '@turboslide/materials/recipe';
import type { Asset } from '@turboslide/schema/assets';
import type {
  MaterialBlock,
  MaterialRecipe,
  MaterialUniformSpec,
  MaterialUniformValue,
  MaterialUniforms,
} from '@turboslide/schema/blocks/material';
import { MATERIAL_ANCHORS } from '@turboslide/schema/blocks/material';

import type { EditorDispatch } from '../dispatch';
import { Seg } from '../Seg';
import { ToolButton } from '../ToolButton';
import { tipProps } from '../Tooltip';

import './material.css';

/**
 * The Material section (MILESTONES M5 item 3: "the Material inspector section (preset, uniforms,
 * anchor, two-tone toggle, plate position)"). Its target is a material block, whose recipe fields
 * it writes one `block.set` at a time (`/preset`, `/uniforms`, `/anchor`, `/twoTone`, `/plate`),
 * or the picture of an opener or a mood slide whose asset is a material, whose recorded recipe it
 * edits as a draft. The uniform controls come from the catalog entry's uniform specs: a number
 * field with the spec's range and step, a color field with a swatch, a text field for a color
 * list, a select for an enum. Capture runs `material.capture` (the same job the CLI runs) and,
 * once the document carries the new revision, points the block (`/asset`) or the picture
 * (`/picture/asset`) at the frozen frame. Every control is labelled `<noun>: <label>` with a
 * `data-control` id the window API matches (SPEC 6.5, 7.4).
 */
export type PlateSide = 'lower-left' | 'lower-right' | 'upper-left';

export type MaterialTarget =
  | { kind: 'block'; slideId: string; block: MaterialBlock }
  | { kind: 'picture'; slideId: string; asset: Asset; plateSide: PlateSide };

export type MaterialSectionProps = {
  target: MaterialTarget;
  revision: number;
  dispatch: EditorDispatch;
  busy?: boolean;
  onNotice?: (line: string) => void;
};

const PLATES: readonly { value: PlateSide; label: string }[] = [
  { value: 'lower-left', label: 'lower left' },
  { value: 'lower-right', label: 'lower right' },
  { value: 'upper-left', label: 'upper left' },
];

/** The recipe a target starts from. */
export function recipeOfTarget(target: MaterialTarget): MaterialRecipe {
  if (target.kind === 'block') {
    const { materialId, preset, uniforms, anchor, twoTone, plate } = target.block;
    return {
      materialId,
      ...(preset !== undefined ? { preset } : {}),
      ...(uniforms !== undefined ? { uniforms } : {}),
      ...(anchor !== undefined ? { anchor } : {}),
      ...(twoTone !== undefined ? { twoTone } : {}),
      ...(plate !== undefined ? { plate } : {}),
    };
  }
  const source = target.asset.source;
  return {
    materialId:
      source.kind === 'material' ? source.materialId : (MATERIAL_IDS[0] ?? 'paper:gem-smoke'),
    ...(source.kind === 'material' ? { uniforms: source.uniforms, anchor: source.timeMs } : {}),
    twoTone: target.asset.treatment?.kind === 'two-tone',
    plate: target.plateSide,
  };
}

/** The value a uniform shows: the override, else the preset's, else the default. */
function shownValue(
  entry: MaterialEntry,
  recipe: MaterialRecipe,
  spec: MaterialUniformSpec,
): MaterialUniformValue {
  const override = recipe.uniforms?.[spec.name];
  if (override !== undefined) return override;
  try {
    return (
      resolveRecipe(entry, { ...(recipe.preset !== undefined ? { preset: recipe.preset } : {}) })
        .uniforms[spec.name] ?? spec.default
    );
  } catch {
    return spec.default;
  }
}

/** The option name an enum uniform shows: a recorded number maps back to its name. */
function enumName(spec: MaterialUniformSpec, value: MaterialUniformValue): string {
  const option = spec.options?.find((o) => o.value === value || o.name === value);
  return option?.name ?? String(value);
}

function swatch(value: MaterialUniformValue): string | undefined {
  if (typeof value !== 'string') return undefined;
  const first = value.split(',')[0]?.trim() ?? '';
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(first) ? first.slice(0, 7) : undefined;
}

export function MaterialSection({
  target,
  revision,
  dispatch,
  busy = false,
  onNotice,
}: MaterialSectionProps) {
  const noun = target.kind === 'block' ? target.block.id : 'slide';
  const controlBase =
    target.kind === 'block' ? `block.${target.block.id}` : 'slide.picture.material';
  const [draft, setDraft] = useState<MaterialRecipe>(() => recipeOfTarget(target));
  const [pending, setPending] = useState<{ assetId: string; since: number } | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;

  /* the document changed under the section: a block's recipe is the document's */
  useEffect(() => {
    setDraft(recipeOfTarget(target));
  }, [target]);

  const entry = materialEntry(draft.materialId);

  const write = (path: string, value: unknown) => {
    if (target.kind !== 'block') return;
    dispatch('block.set', {
      slideId: target.slideId,
      blockId: target.block.id,
      path,
      ...(value !== undefined ? { value } : {}),
      baseRevision: revision,
    }).catch((cause: unknown) =>
      onNotice?.(cause instanceof Error ? cause.message : String(cause)),
    );
  };

  const change = <K extends keyof MaterialRecipe>(key: K, value: MaterialRecipe[K]) => {
    setDraft((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
    write(`/${key}`, value);
  };

  const setUniform = (name: string, value: MaterialUniformValue | undefined) => {
    const next: MaterialUniforms = { ...(draft.uniforms ?? {}) };
    if (value === undefined) delete next[name];
    else next[name] = value;
    change('uniforms', Object.keys(next).length > 0 ? next : undefined);
  };

  /* the capture landed: once the document is past the revision it wrote, point the target at the frame */
  useEffect(() => {
    if (pending === null || revision <= pending.since) return;
    const { assetId } = pending;
    setPending(null);
    const promise =
      target.kind === 'block'
        ? dispatch('block.set', {
            slideId: target.slideId,
            blockId: target.block.id,
            path: '/asset',
            value: assetId,
            baseRevision: revision,
          })
        : dispatch('slide.update', {
            slideId: target.slideId,
            baseRevision: revision,
            mutations: [
              { op: 'slide.set', slideId: target.slideId, path: '/picture/asset', value: assetId },
            ],
          });
    promise
      .then(() => onNotice?.(`Captured ${assetId} and set it as the frame`))
      .catch((cause: unknown) =>
        onNotice?.(cause instanceof Error ? cause.message : String(cause)),
      );
  }, [pending, revision, target, dispatch, onNotice]);

  const capture = () => {
    if (entry === undefined) return;
    setCapturing(true);
    setCaptureError(null);
    const anchor = draft.anchor ?? MATERIAL_ANCHORS[1];
    const id =
      target.kind === 'block'
        ? `${target.slideId}-${target.block.id}-${anchor}`
        : `${target.asset.id}-${anchor}`;
    const since = revisionRef.current;
    dispatch('material.capture', {
      materialId: draft.materialId,
      ...(draft.preset !== undefined ? { preset: draft.preset } : {}),
      ...(draft.uniforms !== undefined ? { uniforms: draft.uniforms } : {}),
      anchors: [anchor],
      id,
      role:
        target.kind === 'picture'
          ? target.plateSide === 'lower-right'
            ? 'mood'
            : 'opener'
          : 'frame',
      ...(draft.twoTone === true ? { twoTone: true } : {}),
      ...(draft.plate !== undefined ? { plate: draft.plate } : {}),
      baseRevision: since,
    })
      .then((result) => {
        const asset = (Array.isArray(result) ? result[0] : result) as { id?: string } | undefined;
        setPending({ assetId: asset?.id ?? id, since });
      })
      .catch((cause: unknown) => {
        setCaptureError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setCapturing(false));
  };

  const uniformRows = useMemo(() => (entry === undefined ? [] : entry.uniforms), [entry]);

  return (
    <div className="ts-material" data-material={draft.materialId}>
      <div className="ts-insp-row">
        <span className="ts-insp-label">Material</span>
        <div className="ts-insp-field">
          <select
            className="ts-ctl-select"
            aria-label={`${noun}: Material`}
            data-control={`${controlBase}.materialId`}
            value={draft.materialId}
            disabled={busy || target.kind === 'picture'}
            {...tipProps({
              name: 'Material',
              doc: 'The shader in the catalog; changing it drops the preset and the uniforms.',
            })}
            onChange={(event) => {
              const next = event.target.value;
              setDraft((current) => ({
                materialId: next,
                anchor: current.anchor,
                twoTone: current.twoTone,
                plate: current.plate,
              }));
              write('/materialId', next);
              write('/preset', undefined);
              write('/uniforms', undefined);
            }}
          >
            {MATERIAL_IDS.map((id) => (
              <option key={id} value={id}>
                {requireMaterial(id).label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {entry === undefined ? (
        <p className="ts-material-note" role="alert">
          {draft.materialId} is not in the catalog; `turboslide material list` names the entries.
        </p>
      ) : (
        <>
          <p className="ts-material-doc">{entry.doc}</p>
          <div className="ts-insp-row">
            <span className="ts-insp-label">Preset</span>
            <div className="ts-insp-field">
              <select
                className="ts-ctl-select"
                aria-label={`${noun}: Preset`}
                data-control={`${controlBase}.preset`}
                value={draft.preset ?? ''}
                disabled={busy}
                onChange={(event) =>
                  change('preset', event.target.value === '' ? undefined : event.target.value)
                }
              >
                <option value="">custom</option>
                {entry.presets.map((preset) => (
                  <option key={preset.name} value={preset.name} title={preset.doc}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {uniformRows.map((spec) => {
            const value = shownValue(entry, draft, spec);
            const overridden = draft.uniforms?.[spec.name] !== undefined;
            const label = `${noun}: ${spec.label}`;
            const control = `${controlBase}.uniforms.${spec.name}`;
            return (
              <div
                key={spec.name}
                className={`ts-insp-row is-uniform${overridden ? ' is-overridden' : ''}`}
                data-path={`/uniforms/${spec.name}`}
              >
                <span
                  className="ts-insp-label"
                  {...tipProps({ name: spec.label, doc: spec.help ?? `The ${spec.name} uniform.` })}
                >
                  {spec.label}
                </span>
                <div className="ts-insp-field">
                  {spec.kind === 'enum' ? (
                    <select
                      className="ts-ctl-select"
                      aria-label={label}
                      data-control={control}
                      value={enumName(spec, value)}
                      disabled={busy}
                      onChange={(event) => setUniform(spec.name, event.target.value)}
                    >
                      {(spec.options ?? []).map((option) => (
                        <option key={option.name} value={option.name}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  ) : spec.kind === 'float' || spec.kind === 'int' ? (
                    <input
                      className="ts-material-number"
                      type="number"
                      aria-label={label}
                      data-control={control}
                      value={typeof value === 'number' ? value : Number(value)}
                      min={spec.min}
                      max={spec.max}
                      step={spec.step}
                      disabled={busy}
                      onChange={(event) => {
                        const n = Number(event.target.value);
                        if (Number.isFinite(n))
                          setUniform(spec.name, spec.kind === 'int' ? Math.round(n) : n);
                      }}
                    />
                  ) : (
                    <span className="ts-material-color">
                      {swatch(value) !== undefined ? (
                        <span
                          className="ts-material-swatch"
                          style={{ background: swatch(value) }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <input
                        className="ts-material-text"
                        type="text"
                        aria-label={label}
                        data-control={control}
                        value={String(value)}
                        disabled={busy}
                        onChange={(event) => setUniform(spec.name, event.target.value)}
                      />
                    </span>
                  )}
                  {overridden ? (
                    <ToolButton
                      title="Reset"
                      doc={`Back to the preset value of ${spec.label}.`}
                      ariaLabel={`${label} reset`}
                      icon="close"
                      control={`${control}.reset`}
                      onClick={() => setUniform(spec.name, undefined)}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
          <div className="ts-insp-row">
            <span className="ts-insp-label">Anchor (ms)</span>
            <div className="ts-insp-field">
              <input
                className="ts-material-number"
                type="number"
                aria-label={`${noun}: Anchor (ms)`}
                data-control={`${controlBase}.anchor`}
                list={`${controlBase}-anchors`}
                {...tipProps({
                  name: 'Anchor',
                  doc: 'The frame time in ms the capture freezes; the catalog names the good ones.',
                })}
                value={draft.anchor ?? ''}
                min={0}
                step={100}
                placeholder={String(MATERIAL_ANCHORS[1])}
                disabled={busy}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === '') change('anchor', undefined);
                  else if (Number.isFinite(Number(raw))) change('anchor', Number(raw));
                }}
              />
              <datalist id={`${controlBase}-anchors`}>
                {MATERIAL_ANCHORS.map((ms) => (
                  <option key={ms} value={ms} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="ts-insp-row">
            <span className="ts-insp-label">Two-tone</span>
            <div className="ts-insp-field">
              <label
                className="ts-ctl-check"
                {...tipProps({
                  name: 'Two-tone',
                  doc: 'Screens the captured frame into a light and a dark twin.',
                })}
              >
                <input
                  type="checkbox"
                  aria-label={`${noun}: Two-tone`}
                  data-control={`${controlBase}.twoTone`}
                  checked={draft.twoTone === true}
                  disabled={busy}
                  onChange={(event) => change('twoTone', event.target.checked ? true : undefined)}
                />
                <span className="ts-ctl-check-box" aria-hidden="true" />
                <span className="ts-ctl-check-word" aria-hidden="true">
                  {draft.twoTone === true ? 'on' : 'off'}
                </span>
              </label>
            </div>
          </div>
          <div className="ts-insp-row">
            <span className="ts-insp-label">Plate</span>
            <div className="ts-insp-field">
              <select
                className="ts-native-mirror"
                aria-label={`${noun}: Plate`}
                data-control={`${controlBase}.plate`}
                value={draft.plate ?? ''}
                disabled={busy}
                onChange={(event) =>
                  change(
                    'plate',
                    event.target.value === '' ? undefined : (event.target.value as PlateSide),
                  )
                }
              >
                <option value="">none</option>
                {PLATES.map((plate) => (
                  <option key={plate.value} value={plate.value}>
                    {plate.label}
                  </option>
                ))}
              </select>
              <Seg
                options={[
                  { value: 'none', label: 'none', title: `${noun}: no plate` },
                  ...PLATES.map((plate) => ({
                    value: plate.value,
                    label: plate.label,
                    title: `${noun}: plate ${plate.label}`,
                  })),
                ]}
                value={draft.plate ?? 'none'}
                onChange={(next) =>
                  change('plate', next === 'none' ? undefined : (next as PlateSide))
                }
                label={`${noun}: Plate options`}
                className="is-small"
                control={`${controlBase}.plate.option`}
              />
            </div>
          </div>
          <div className="ts-material-actions">
            <ToolButton
              title="Capture frame"
              doc="Runs material.capture: renders the recipe at 3200 by 1800, freezes the frame at the anchor and sets it as the block's frame."
              label={capturing ? 'Capturing' : pending ? 'Placing the frame' : 'Capture frame'}
              icon="sparkles"
              control={`${controlBase}.capture`}
              onClick={capture}
              solid
            />
            {target.kind === 'block' && target.block.asset !== undefined ? (
              <span className="ts-material-frame">frame: {target.block.asset}</span>
            ) : null}
          </div>
          {captureError ? (
            <p className="ts-material-note" role="alert">
              {captureError}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
