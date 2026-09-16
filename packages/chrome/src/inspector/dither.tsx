import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { PLATE_BOXES } from '@turboslide/effects/metrics';
import type { TwoToneMetrics } from '@turboslide/effects/metrics';
import type { Asset, TwoToneTreatment } from '@turboslide/schema/assets';
import { twoToneTreatmentSchema } from '@turboslide/schema/assets';
import type { Block, PictureDither } from '@turboslide/schema/blocks';
import {
  DITHER_ANGLE,
  DITHER_DEFAULTS,
  DITHER_PHOTOGRAPH_PRESET,
  DITHER_TOGGLE_VALUE,
  ditherPresetOf,
  resolveDither,
} from '@turboslide/schema/blocks/dither';
import { DITHER_FRAME_EVENT, previewDither } from '@turboslide/viewer/dither';

import type { EditorDispatch } from '../dispatch';
import { InspectorControl } from '../InspectorControl';
import { Seg } from '../Seg';
import { ToolButton } from '../ToolButton';
import { tipProps } from '../Tooltip';
import { DITHER } from '../menus/strings';
import { CheckField, NumberField, PanelButton, SelectField, ToggleRow } from './fields';
import type { SectionWrite } from './fields';
import { controlsFor } from './generate';

import './dither.css';

/**
 * The dither tool (SPEC 6.5: "treatment parameters with the live two-tone preview from
 * dither.worker.ts and its metrics, Recapture"; MILESTONES M5 item 2). The treatment controls
 * are generated from the two-tone treatment schema (black and white points, gamma, blur, channel,
 * invert, minimum filter, polarity, crop), each labelled `<asset id>: <label>` with the id
 * `asset.<id>.treatment.<field>`. A change goes to the worker with the asset's source picture
 * (Asset.sourceFile, kept by `asset add --two-tone`) and the plate rectangle, and both twins come
 * back as 1600 by 900 bitmaps drawn on two canvases with the plate drawn over them, beside the
 * lit fraction and the lit cells under the plate and in its 30 px band (the metrics the rounds
 * counted by hand, OPENERS.md). Recapture writes the draft through `asset.dither`, the same
 * pipeline the CLI runs; Measure reads the committed twins back. Without a source on disk (the
 * imported deck) the section shows the committed twins and the recorded metrics.
 */
export type DitherWorkerLike = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent) => void) | null;
  terminate: () => void;
};

type WorkerReply =
  | {
      id: number;
      ok: true;
      light?: ImageBitmap;
      dark?: ImageBitmap;
      metrics: TwoToneMetrics;
      ms: number;
    }
  | { id: number; ok: false; error: string };

export type PlateSide = 'lower-left' | 'lower-right' | 'upper-left';

export type DitherSectionProps = {
  asset: Asset;
  /** the plate the metrics are screened against; the asset's role picks one when absent */
  plate?: PlateSide;
  revision: number;
  dispatch: EditorDispatch;
  assetUrl?: (path: string) => string;
  /** builds the worker (the studio: new Worker(new URL('../workers/dither.worker.ts', import.meta.url), { type: 'module' })) */
  createWorker?: () => DitherWorkerLike;
  busy?: boolean;
  onNotice?: (line: string) => void;
};

const PLATE_OPTIONS: readonly { value: PlateSide; label: string }[] = [
  { value: 'lower-left', label: 'lower left' },
  { value: 'lower-right', label: 'lower right' },
  { value: 'upper-left', label: 'upper left' },
];

/** The plate box of a side (PLATE_BOXES, the measured screening boxes). */
export function plateBoxOf(side: PlateSide): [number, number, number, number] {
  return PLATE_BOXES[
    side === 'lower-left' ? 'opener' : side === 'lower-right' ? 'mood' : 'closing'
  ];
}

/** The default plate of an asset by its role, or none. */
export function defaultPlate(asset: Asset): PlateSide | undefined {
  const recorded = asset.metrics?.plateClear?.plate;
  if (recorded !== undefined) {
    for (const option of PLATE_OPTIONS) {
      const box = plateBoxOf(option.value);
      if (box.every((v, i) => v === recorded[i])) return option.value;
    }
  }
  return asset.role === 'opener' ? 'lower-left' : asset.role === 'mood' ? 'lower-right' : undefined;
}

/** The treatment to start from: the recorded one, or the deck's defaults over the whole source. */
export function draftTreatment(asset: Asset): TwoToneTreatment {
  if (asset.treatment?.kind === 'two-tone') return asset.treatment;
  return {
    kind: 'two-tone',
    crop: [0, 0, asset.size[0], asset.size[1]],
    autocontrast: 0.5,
    polarity: 'dark-ground',
    cell: 2,
    bayer: 8,
    resampler: 'lanczos3',
  };
}

function setAt(treatment: TwoToneTreatment, path: string, value: unknown): TwoToneTreatment {
  const key = path.replace(/^\//, '') as keyof TwoToneTreatment;
  const next: Record<string, unknown> = { ...treatment };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as unknown as TwoToneTreatment;
}

function drawPlate(
  canvas: HTMLCanvasElement,
  plate: [number, number, number, number] | undefined,
): void {
  if (plate === undefined) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const [x, y, w, h] = plate;
  ctx.save();
  ctx.setLineDash([12, 8]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#8a8f98';
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.restore();
}

export function DitherSection({
  asset,
  plate: plateProp,
  revision,
  dispatch,
  assetUrl,
  createWorker,
  busy = false,
  onNotice,
}: DitherSectionProps) {
  const url = assetUrl ?? ((path: string) => path);
  const [draft, setDraft] = useState<TwoToneTreatment>(() => draftTreatment(asset));
  const [plate, setPlate] = useState<PlateSide | undefined>(() => plateProp ?? defaultPlate(asset));
  const [metrics, setMetrics] = useState<TwoToneMetrics | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const lightCanvas = useRef<HTMLCanvasElement>(null);
  const darkCanvas = useRef<HTMLCanvasElement>(null);
  const worker = useRef<DitherWorkerLike | null>(null);
  const source = useRef<ImageBitmap | null>(null);
  const requestId = useRef(0);
  const sourcePath = asset.sourceFile;

  /* the recorded asset changed under the section: start over from its treatment */
  useEffect(() => {
    setDraft(draftTreatment(asset));
    setPlate(plateProp ?? defaultPlate(asset));
  }, [asset, plateProp]);

  /* the worker and the source bitmap, once per asset */
  useEffect(() => {
    if (!createWorker || sourcePath === undefined) {
      setState('unavailable');
      return;
    }
    let alive = true;
    setState('loading');
    const w = createWorker();
    worker.current = w;
    w.onmessage = (event: MessageEvent) => {
      const reply = event.data as WorkerReply;
      if (!alive || reply.id !== requestId.current) return;
      if (!reply.ok) {
        setError(reply.error);
        setState('error');
        return;
      }
      setMetrics(reply.metrics);
      setState('ready');
      for (const [canvas, bitmap] of [
        [lightCanvas.current, reply.light],
        [darkCanvas.current, reply.dark],
      ] as const) {
        if (!canvas || !bitmap) continue;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(bitmap, 0, 0);
        drawPlate(canvas, plate === undefined ? undefined : plateBoxOf(plate));
        bitmap.close();
      }
    };
    fetch(url(sourcePath))
      .then((response) =>
        response.ok ? response.blob() : Promise.reject(new Error(`${response.status}`)),
      )
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        if (!alive) {
          bitmap.close();
          return;
        }
        source.current = bitmap;
        setState('ready');
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setError(
          `the source ${sourcePath} did not load: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
        setState('error');
      });
    return () => {
      alive = false;
      w.terminate();
      worker.current = null;
      source.current?.close();
      source.current = null;
    };
    // the canvases draw the plate of the request's time; a plate change re-requests below
  }, [createWorker, sourcePath, url]);

  /* every draft change asks the worker for both twins, 120 ms after the last one */
  useEffect(() => {
    const w = worker.current;
    const bitmap = source.current;
    if (!w || !bitmap || state === 'unavailable' || state === 'error') return;
    const timer = window.setTimeout(async () => {
      requestId.current += 1;
      // the worker takes the bitmap by transfer, so each request copies the source
      const copy = await createImageBitmap(bitmap);
      w.postMessage(
        {
          id: requestId.current,
          source: copy,
          treatment: draft,
          plate: plate === undefined ? undefined : plateBoxOf(plate),
        },
        [copy],
      );
    }, 120);
    return () => window.clearTimeout(timer);
  }, [draft, plate, state]);

  const generated = useMemo(
    () =>
      controlsFor(twoToneTreatmentSchema, draft, {
        noun: asset.id,
        control: `asset.${asset.id}.treatment`,
      }),
    [asset.id, draft],
  );

  const report = (promise: Promise<unknown>, done: string) => {
    promise
      .then(() => onNotice?.(done))
      .catch((cause: unknown) =>
        onNotice?.(cause instanceof Error ? cause.message : String(cause)),
      );
  };

  const recapture = () =>
    report(
      dispatch('asset.dither', {
        assetId: asset.id,
        treatment: draft,
        ...(plate !== undefined ? { plate } : {}),
        baseRevision: revision,
      }),
      `Recaptured ${asset.id} from its source`,
    );

  const measure = () =>
    report(
      dispatch('asset.dither', {
        assetId: asset.id,
        fromRecorded: true,
        ...(plate !== undefined ? { plate } : {}),
        baseRevision: revision,
      }),
      `Measured the committed twins of ${asset.id}`,
    );

  const shown = metrics ?? (asset.metrics ? { ...asset.metrics, warnings: [] } : null);
  const twins =
    'neutral' in asset.twins ? [asset.twins.neutral] : [asset.twins.light, asset.twins.dark];

  return (
    <div className="ts-dither" data-asset={asset.id}>
      <div className="ts-dither-preview" aria-label={`${asset.id}: two-tone preview`}>
        {state === 'ready' && sourcePath !== undefined ? (
          <>
            <figure>
              <canvas ref={lightCanvas} width={1600} height={900} data-theme="light" />
              <figcaption>light</figcaption>
            </figure>
            <figure>
              <canvas ref={darkCanvas} width={1600} height={900} data-theme="dark" />
              <figcaption>dark</figcaption>
            </figure>
          </>
        ) : (
          twins.map((path, index) => (
            <figure key={path}>
              <img
                src={url(path)}
                alt={`${asset.alt} (${twins.length === 1 ? 'neutral' : index === 0 ? 'light' : 'dark'})`}
              />
              <figcaption>
                {twins.length === 1 ? 'neutral' : index === 0 ? 'light' : 'dark'}
              </figcaption>
            </figure>
          ))
        )}
      </div>
      {state === 'unavailable' ? (
        <p className="ts-dither-note">
          {sourcePath === undefined
            ? 'The continuous source is not in the deck (sourceFile); the committed twins and their recorded metrics are shown. `asset add --two-tone` keeps the source beside the twins.'
            : 'The live preview needs the dither worker; the studio provides it.'}
        </p>
      ) : null}
      {state === 'error' && error ? (
        <p className="ts-dither-note" role="alert">
          {error}
        </p>
      ) : null}
      <dl className="ts-dither-metrics" aria-label={`${asset.id}: metrics`}>
        <dt>Lit</dt>
        <dd data-control={`asset.${asset.id}.metrics.lit`}>
          {shown ? `${(shown.litFraction * 100).toFixed(1)} percent` : 'not measured'}
        </dd>
        <dt>Under the plate</dt>
        <dd data-control={`asset.${asset.id}.metrics.under`}>
          {shown?.plateClear ? `${shown.plateClear.litUnder} cells` : 'no plate'}
        </dd>
        <dt>In the 30 px band</dt>
        <dd data-control={`asset.${asset.id}.metrics.band`}>
          {shown?.plateClear ? `${shown.plateClear.litInBand} cells` : 'no plate'}
        </dd>
        <dt>Nearest lit</dt>
        <dd data-control={`asset.${asset.id}.metrics.nearest`}>
          {shown?.plateClear ? `${shown.plateClear.nearestLitPx} px` : 'no plate'}
        </dd>
      </dl>
      {shown && shown.warnings.length > 0 ? (
        <ul className="ts-dither-warnings">
          {shown.warnings.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="ts-insp-row">
        <span className="ts-insp-label">Plate</span>
        <div className="ts-insp-field">
          <select
            className="ts-native-mirror"
            aria-label={`${asset.id}: Plate`}
            data-control={`asset.${asset.id}.plate`}
            value={plate ?? ''}
            disabled={busy}
            onChange={(event) =>
              setPlate(event.target.value === '' ? undefined : (event.target.value as PlateSide))
            }
          >
            <option value="">none</option>
            {PLATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Seg
            options={[
              { value: 'none', label: 'none', title: `${asset.id}: no plate` },
              ...PLATE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
                title: `${asset.id}: plate ${option.label}`,
              })),
            ]}
            value={plate ?? 'none'}
            onChange={(next) => setPlate(next === 'none' ? undefined : next)}
            label={`${asset.id}: Plate options`}
            className="is-small"
            control={`asset.${asset.id}.plate.option`}
          />
        </div>
      </div>
      {generated.controls.map((spec) => (
        <InspectorControl
          key={spec.control}
          spec={spec}
          disabled={busy}
          onChange={(value) => setDraft((current) => setAt(current, spec.path, value))}
        />
      ))}
      <div className="ts-dither-actions">
        <ToolButton
          title="Recapture"
          doc="Runs asset.dither: the two-tone pipeline from the source again, writing both twins."
          label="Recapture"
          icon="sparkles"
          control={`asset.${asset.id}.recapture`}
          onClick={recapture}
          solid
        />
        <ToolButton
          title="Measure"
          doc="Runs asset.dither --from-recorded: reads the committed twins back and records their plate metrics."
          label="Measure"
          control={`asset.${asset.id}.measure`}
          onClick={measure}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Round three: the Format options Dither section (gslides-parity SPEC-3 0.36, 0.37, 10.7; research-3
// 06 4.7). The block level field on a shot or a picture object, in Google's position (after
// Adjustments, before Drop shadow, where Recolor sits) with the tools' shared words (DITHER in
// menus/strings.ts): Dither (the toggle, the field's presence), Preset (Neutral and Photograph,
// highlighted by equality and never stored, 0.36), Pattern, Tone with a Steps stepper for the
// original colours, Cell, Strength, Ink point, Paper point, Midtones, Invert, Light theme, the
// Metrics line (reserved as "Not measured" until a frame speaks), Advanced (Blur, Thicken, Channel,
// Seed) and Reset. Every row carries `data-control="formatOptions.dither.<row>"` and the Tooltip
// primitive. A slider previews on every input event through the live overlay
// (`EditorHandle.ditherPreview`, else the viewer's `previewDither`) and commits once on pointer up,
// so the store sees one write per drag. The write is the field as `block.set /dither` in the page,
// which is what `picture.dither` runs on the window transport (SPEC-3 10.5).

export type DitherFormatSectionProps = {
  block: Block;
  write: SectionWrite;
  /** The asset records, for the metrics a materialized variant recorded. */
  assets?: Readonly<Record<string, Asset>>;
};

/** The field on a shot or a picture object, or undefined when the block has none. */
export function ditherOf(block: Block): PictureDither | undefined {
  if (block.type !== 'shot' && block.type !== 'picture') return undefined;
  return block.dither;
}

/** The field with a patch applied; a value equal to its default is dropped so the stored field stays short. */
export function patchDither(dither: PictureDither, patch: Partial<PictureDither>): PictureDither {
  const next: Record<string, unknown> = { ...dither, ...patch };
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) delete next[key];
    else if (key !== 'pattern' && (DITHER_DEFAULTS as Record<string, unknown>)[key] === value)
      delete next[key];
  }
  if (next.pattern === undefined) next.pattern = DITHER_TOGGLE_VALUE.pattern;
  return next as PictureDither;
}

/** The words of the metrics line (SPEC-3 10.7, 15): "Lit 8.9 percent", the plate clearance, the two warnings. */
export function metricsWords(
  metrics: {
    litFraction?: number;
    plateClear?: { litUnder: number; nearestLitPx: number };
  } | null,
): string {
  if (metrics === null || metrics.litFraction === undefined) return DITHER.notMeasured;
  const lit = metrics.litFraction;
  const parts = [DITHER.lit((lit * 100).toFixed(1))];
  if (metrics.plateClear !== undefined)
    parts.push(
      `${metrics.plateClear.litUnder} cells under the plate, ${metrics.plateClear.nearestLitPx} px to the nearest`,
    );
  if (lit < 0.02 || lit > 0.98) parts.push('one theme shows an empty sheet');
  else if (lit < 0.08 || lit > 0.92) parts.push('a uniform screen; the picture needs an edge');
  return parts.join('; ');
}

/** A range input that previews on every input and commits once on release, with a value field. */
function PreviewSlider({
  label,
  value,
  min,
  max,
  step = 1,
  control,
  disabled,
  doc,
  unit,
  onPreview,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  control: string;
  disabled?: boolean;
  doc?: string;
  unit?: string;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? value;
  const tip = tipProps({ name: label, ...(doc === undefined ? {} : { doc }) });
  const commit = () => {
    if (live !== null && live !== value) onCommit(live);
    setLive(null);
  };
  return (
    <div className={`ts-fo-slider ts-dither-row${disabled ? ' is-disabled' : ''}`}>
      <span className="ts-fo-field-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        aria-label={label}
        aria-valuetext={`${shown}${unit ?? ''}`}
        data-control={`${control}.slider`}
        disabled={disabled}
        {...tip}
        onChange={(event) => {
          const next = Number(event.target.value);
          setLive(next);
          onPreview(next);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={(event) => {
          tip.onBlur(event);
          commit();
        }}
      />
      <NumberField
        label={`${label} value`}
        value={shown}
        onCommit={onCommit}
        control={control}
        disabled={disabled}
        step={step}
        min={min}
        max={max}
        unit={unit}
      />
    </div>
  );
}

/** An event whose target the handler compares with the element it sits on. */
type TargetedEvent = { target: EventTarget; currentTarget: EventTarget };

/** The handler only when the event started on the element itself, not on a control inside it. */
function onSelf<TEvent extends TargetedEvent>(
  handler: (event: TEvent) => void,
): (event: TEvent) => void {
  return (event) => {
    if (event.target === event.currentTarget) handler(event);
  };
}

/**
 * A row of the section whose group carries the Tooltip primitive (SPEC-3 10.7: "every row carries
 * `data-control` and the Tooltip primitive"; VERIFICATION-3 finding 14): the row's name and its
 * sentence show after a rest over the label or the gaps between the options, and `data-tip` sits
 * over the group's `data-control` for the audit's closest rule. The option buttons keep their own
 * plates: a focus, a press or a key on one bubbles here and must neither replace the option's
 * plate nor show one on a click, so those handlers act only on the row itself; the hover handlers
 * stay as they are, because React sends the mouse enter to the row before the option and the
 * option's schedule wins.
 */
function TipRow({ name, doc, children }: { name: string; doc: string; children: ReactNode }) {
  const tip = tipProps({ name, doc });
  return (
    <div
      className="ts-fo-row ts-dither-row"
      {...tip}
      onFocus={onSelf(tip.onFocus)}
      onBlur={onSelf(tip.onBlur)}
      onMouseDown={onSelf(tip.onMouseDown)}
      onKeyDown={onSelf(tip.onKeyDown)}
    >
      <span className="ts-fo-field-label">{name}</span>
      {children}
    </div>
  );
}

export function DitherFormatSection({ block, write, assets }: DitherFormatSectionProps) {
  const words = DITHER;
  const dither = ditherOf(block);
  const on = dither !== undefined;
  const current = dither ?? DITHER_TOGGLE_VALUE;
  const resolved = resolveDither(current);
  const preset = ditherPresetOf(current);
  const [advanced, setAdvanced] = useState(false);
  const [measured, setMeasured] = useState<{ litFraction: number } | null>(null);

  /* the metrics line: the newest live frame of this block, else the variant a materialization recorded */
  useEffect(() => {
    setMeasured(null);
    if (typeof document === 'undefined') return;
    const onFrame = (event: Event) => {
      const detail = (
        event as CustomEvent<{ blockId?: string | null; litFraction?: number } | null>
      ).detail;
      if (detail?.blockId !== block.id || typeof detail.litFraction !== 'number') return;
      setMeasured({ litFraction: detail.litFraction });
    };
    document.addEventListener(DITHER_FRAME_EVENT, onFrame);
    return () => document.removeEventListener(DITHER_FRAME_EVENT, onFrame);
  }, [block.id]);
  const recorded = useMemo(() => {
    if (!on || assets === undefined || (block.type !== 'shot' && block.type !== 'picture'))
      return null;
    const asset = assets[block.asset];
    const variants = asset?.variants;
    if (variants === undefined) return null;
    const entries = Object.values(variants);
    const latest = entries[entries.length - 1];
    return latest?.metrics ?? null;
  }, [assets, block, on]);

  const commit = (next: PictureDither | null) => {
    if (write.editor?.ditherPreview) write.editor.ditherPreview(block.id, null);
    else previewDither(block.id, null);
    write.report(
      write.dispatch('block.set', {
        slideId: write.slideId,
        blockId: block.id,
        path: '/dither',
        ...(next === null ? {} : { value: next }),
        baseRevision: write.revision,
      }),
    );
  };
  const patch = (fields: Partial<PictureDither>) => commit(patchDither(current, fields));
  const preview = (fields: Partial<PictureDither>) => {
    const draft = patchDither(current, fields);
    if (write.editor?.ditherPreview) write.editor.ditherPreview(block.id, draft);
    else previewDither(block.id, draft);
  };
  const disabled = write.busy || !on;

  return (
    <div className="ts-dither-section" data-dither-on={on ? '' : undefined}>
      <CheckField
        label={words.dither}
        checked={on}
        control="formatOptions.dither.on"
        onChange={(checked) => commit(checked ? DITHER_TOGGLE_VALUE : null)}
        disabled={write.busy}
        doc={words.help}
      />
      <div className="ts-fo-row ts-dither-row">
        <span className="ts-fo-field-label">{words.preset}</span>
        <div className="ts-fo-buttons">
          <PanelButton
            label={words.neutral}
            control="formatOptions.dither.preset.neutral"
            pressed={preset === 'neutral'}
            onClick={() =>
              patch({
                black: DITHER_DEFAULTS.black,
                white: DITHER_DEFAULTS.white,
                gamma: DITHER_DEFAULTS.gamma,
              })
            }
            disabled={disabled}
            doc="The screen's own tone: ink point 0, paper point 255, midtones 1"
          />
          <PanelButton
            label={words.photograph}
            control="formatOptions.dither.preset.photograph"
            pressed={preset === 'photograph'}
            onClick={() => patch({ ...DITHER_PHOTOGRAPH_PRESET })}
            disabled={disabled}
            doc="The deck's recorded look for a photograph: ink point 120, paper point 230, midtones 0.9"
          />
        </div>
      </div>
      <TipRow name={words.pattern} doc="How the screen arranges its cells">
        <ToggleRow<PictureDither['pattern']>
          label={words.pattern}
          options={[
            { value: 'bayer8', label: 'Bayer 8 by 8', doc: 'The deck’s screen' },
            { value: 'bayer4', label: 'Bayer 4 by 4', doc: 'A coarser ordered screen' },
            {
              value: 'blue64',
              label: 'Blue noise',
              doc: 'A less ordered screen with no cross hatch',
            },
            {
              value: 'random',
              label: 'Random',
              doc: 'A hashed screen; the seed is under Advanced',
            },
            /* the round five families (gslides-parity SPEC-5 11): two error diffusions and two halftone screens */
            {
              value: 'floyd-steinberg',
              label: 'Floyd Steinberg',
              doc: 'Error diffusion, serpentine; no screen pattern at all',
            },
            {
              value: 'atkinson',
              label: 'Atkinson',
              doc: 'Error diffusion carrying three quarters of the error; lighter, more contrast',
            },
            {
              value: 'halftone-dot',
              label: 'Halftone dots',
              doc: 'A printer’s dot screen at the angle below; the pitch is 8 cells',
            },
            {
              value: 'halftone-line',
              label: 'Halftone lines',
              doc: 'A line screen at the angle below; the pitch is 8 cells',
            },
          ]}
          pressed={resolved.pattern}
          onToggle={(value) => patch({ pattern: value })}
          control="formatOptions.dither.pattern"
          disabled={disabled}
        />
      </TipRow>
      {resolved.pattern === 'halftone-dot' || resolved.pattern === 'halftone-line' ? (
        <div className="ts-fo-row ts-dither-row">
          <span className="ts-fo-field-label">Angle</span>
          <NumberField
            label="Angle"
            value={resolved.angle ?? DITHER_ANGLE.default}
            min={DITHER_ANGLE.min}
            max={DITHER_ANGLE.max}
            unit="°"
            doc="The screen's angle in degrees; 45 is the printer's default"
            control="formatOptions.dither.angle"
            disabled={disabled}
            onCommit={(value) =>
              patch({ angle: value === DITHER_ANGLE.default ? undefined : Math.round(value) })
            }
          />
        </div>
      ) : null}
      <TipRow name={words.tone} doc="How many tones the picture keeps">
        <ToggleRow<NonNullable<PictureDither['tone']>>
          label={words.tone}
          options={[
            { value: 'two', label: 'Ink and paper', doc: 'The deck’s two tones' },
            { value: 'three', label: 'Three tones', doc: 'Ink, titanium and paper' },
            {
              value: 'original',
              label: 'Original colours',
              doc: 'The picture’s own colours, posterised',
            },
          ]}
          pressed={resolved.tone}
          onToggle={(value) => patch({ tone: value })}
          control="formatOptions.dither.tone"
          disabled={disabled}
        />
      </TipRow>
      {resolved.tone === 'original' ? (
        <div className="ts-fo-row ts-dither-row">
          <span className="ts-fo-field-label">Steps</span>
          <NumberField
            label="Steps"
            value={resolved.steps}
            min={2}
            max={7}
            step={1}
            control="formatOptions.dither.steps"
            onCommit={(value) => patch({ steps: Math.round(value) })}
            disabled={disabled}
          />
        </div>
      ) : null}
      <TipRow name={words.cell} doc="The size of one cell of the screen, in sheet px">
        <ToggleRow<'1' | '2' | '3' | '4'>
          label={words.cell}
          options={[
            { value: '1', label: '1', doc: '1 sheet px per cell' },
            { value: '2', label: '2', doc: '2 sheet px per cell, the deck’s cell' },
            { value: '3', label: '3', doc: '3 sheet px per cell' },
            { value: '4', label: '4', doc: '4 sheet px per cell' },
          ]}
          pressed={String(resolved.cell) as '1' | '2' | '3' | '4'}
          onToggle={(value) => patch({ cell: Number(value) as 1 | 2 | 3 | 4 })}
          control="formatOptions.dither.cell"
          disabled={disabled}
        />
      </TipRow>
      <PreviewSlider
        label={words.strength}
        value={Math.round(resolved.strength * 100)}
        min={0}
        max={100}
        control="formatOptions.dither.strength"
        unit="%"
        doc="The screen's opacity over the picture; 100 is the pure two tone"
        onPreview={(value) => preview({ strength: value / 100 })}
        onCommit={(value) => patch({ strength: value / 100 })}
        disabled={disabled}
      />
      <PreviewSlider
        label={words.inkPoint}
        value={resolved.black}
        min={0}
        max={255}
        control="formatOptions.dither.black"
        doc="Values at or below it become ink"
        onPreview={(value) => preview({ black: value })}
        onCommit={(value) => patch({ black: value })}
        disabled={disabled}
      />
      <PreviewSlider
        label={words.paperPoint}
        value={resolved.white}
        min={0}
        max={255}
        control="formatOptions.dither.white"
        doc="Values at or above it become paper"
        onPreview={(value) => preview({ white: value })}
        onCommit={(value) => patch({ white: value })}
        disabled={disabled}
      />
      <PreviewSlider
        label={words.midtones}
        value={resolved.gamma}
        min={0.5}
        max={2}
        step={0.01}
        control="formatOptions.dither.gamma"
        doc="Below 1 lifts the midtones"
        onPreview={(value) => preview({ gamma: value })}
        onCommit={(value) => patch({ gamma: value })}
        disabled={disabled}
      />
      <CheckField
        label="Invert"
        checked={resolved.invert}
        control="formatOptions.dither.invert"
        onChange={(checked) => patch({ invert: checked })}
        disabled={disabled}
        doc="Inverts the picture before the screen"
      />
      <TipRow
        name={words.lightTheme}
        doc="What the light theme shows: the inverse of the dark theme’s screen, or the same one"
      >
        <ToggleRow<'inverse' | 'same'>
          label={words.lightTheme}
          options={[
            {
              value: 'inverse',
              label: 'Inverse',
              doc: 'The light theme shows the inverse of the dark theme’s screen',
            },
            { value: 'same', label: 'Same', doc: 'Both themes show one screen' },
          ]}
          pressed={resolved.polarity === 'same' ? 'same' : 'inverse'}
          onToggle={(value) => patch({ polarity: value === 'same' ? 'same' : 'auto' })}
          control="formatOptions.dither.polarity"
          disabled={disabled}
        />
      </TipRow>
      <p
        className="ts-dither-metrics"
        data-control="formatOptions.dither.metrics"
        aria-live="polite"
        {...tipProps({ name: 'Metrics', doc: 'The share of lit cells and the plate clearance' })}
      >
        {on ? metricsWords(measured ?? recorded) : words.notMeasured}
      </p>
      <div className="ts-fo-row ts-dither-row">
        <PanelButton
          label={words.advanced}
          control="formatOptions.dither.advanced"
          pressed={advanced}
          onClick={() => setAdvanced((open) => !open)}
          disabled={write.busy}
          doc="Blur, Thicken, Channel and Seed"
          icon="chevron-down"
        />
        <PanelButton
          label={words.reset}
          control="formatOptions.dither.reset"
          onClick={() => commit(DITHER_TOGGLE_VALUE)}
          disabled={disabled}
          doc="Back to the screen’s own tone; the dither stays on"
          icon="arrow-uturn-left"
        />
      </div>
      {advanced ? (
        <div className="ts-dither-advanced">
          <div className="ts-fo-row ts-dither-row">
            <span className="ts-fo-field-label">Blur</span>
            <NumberField
              label="Blur"
              value={resolved.blur}
              min={0}
              max={8}
              step={0.1}
              control="formatOptions.dither.advanced.blur"
              onCommit={(value) => patch({ blur: value })}
              disabled={disabled}
              unit="px"
            />
          </div>
          <div className="ts-fo-row ts-dither-row">
            <span className="ts-fo-field-label">{words.thicken}</span>
            <NumberField
              label={words.thicken}
              value={resolved.minFilter}
              min={0}
              max={9}
              step={1}
              control="formatOptions.dither.advanced.minFilter"
              onCommit={(value) => patch({ minFilter: Math.round(value) })}
              disabled={disabled}
              unit="px"
            />
          </div>
          <SelectField<NonNullable<PictureDither['channel']>>
            label="Channel"
            value={resolved.channel}
            control="formatOptions.dither.advanced.channel"
            options={[
              { value: 'gray', label: 'Gray' },
              { value: 'r', label: 'Red' },
              { value: 'g', label: 'Green' },
              { value: 'b', label: 'Blue' },
            ]}
            onChange={(value) => patch({ channel: value })}
            disabled={disabled}
            doc="The channel read as the tone"
          />
          <div className="ts-fo-row ts-dither-row">
            <span className="ts-fo-field-label">Seed</span>
            <NumberField
              label="Seed"
              value={resolved.seed}
              min={-(2 ** 31)}
              max={2 ** 31 - 1}
              step={1}
              control="formatOptions.dither.advanced.seed"
              onCommit={(value) => patch({ seed: Math.round(value) })}
              disabled={disabled}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
