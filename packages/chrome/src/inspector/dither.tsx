import { useEffect, useMemo, useRef, useState } from 'react';

import { PLATE_BOXES } from '@turboslide/effects/metrics';
import type { TwoToneMetrics } from '@turboslide/effects/metrics';
import type { Asset, TwoToneTreatment } from '@turboslide/schema/assets';
import { twoToneTreatmentSchema } from '@turboslide/schema/assets';

import type { EditorDispatch } from '../dispatch';
import { InspectorControl } from '../InspectorControl';
import { Seg } from '../Seg';
import { ToolButton } from '../ToolButton';
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            onChange={(next) => setPlate(next === 'none' ? undefined : (next as PlateSide))}
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
          title="Re-run the two-tone pipeline from the source and write the twins (asset.dither)"
          label="Recapture"
          icon="sparkles"
          control={`asset.${asset.id}.recapture`}
          onClick={recapture}
          solid
        />
        <ToolButton
          title="Read the committed twins back and record their plate metrics (asset.dither --from-recorded)"
          label="Measure"
          control={`asset.${asset.id}.measure`}
          onClick={measure}
        />
      </div>
    </div>
  );
}
