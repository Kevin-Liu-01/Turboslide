// Two-tone twins read back and re-run (SPEC 7.1 asset.dither; MILESTONES M5 acceptance: `asset
// dither --all-two-tone --from-recorded --verify-cells`). The committed twins are the record of
// what a round approved (OPENERS.md: every JPEG cell stays on its side of the threshold), so
// `fromRecorded` reads them back into the 800 by 450 screen through bitsFromGray, recomputes the
// plate metrics against the slide's plate, checks that the light twin is the exact inverse of the
// dark one, and, where the continuous source is on disk (Asset.sourceFile or --source), re-runs
// the recorded treatment and counts the cells that differ. A re-run with new parameters needs the
// source and writes fresh 1-bit twins. The store write is the caller's.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { cellAgreement, bitsFromGray } from '@turboslide/effects/diff';
import type { BitImage, Box } from '@turboslide/effects/image';
import { invertBits } from '@turboslide/effects/image';
import { decodeImage } from '@turboslide/effects/io';
import { twoToneMetrics } from '@turboslide/effects/metrics';
import type { TwoToneMetrics } from '@turboslide/effects/metrics';
import { toGray } from '@turboslide/effects/tone';
import { twoTone } from '@turboslide/effects/two-tone';
import type { Asset, TwoToneTreatment } from '@turboslide/schema/assets';

import { fullTreatment, plateBoxFor, treatmentParams, twinPaths, writeUnder } from './shared.ts';
import type { PlateSide, TwoToneRequestParams } from './shared.ts';

export type TwinBits = {
  dark: BitImage;
  light: BitImage;
  /** Cells where the light twin is not the inverse of the dark one. */
  inverseMismatch: number;
  cell: number;
};

/** The committed twins of a two-tone asset as screens (800 by 450 cells for the deck's cell 2). */
export async function readTwinBits(deckDir: string, asset: Asset): Promise<TwinBits> {
  if ('neutral' in asset.twins)
    throw new RangeError(`${asset.id} has one neutral twin, not a pair`);
  const cell = asset.treatment?.kind === 'two-tone' ? asset.treatment.cell : 2;
  const dark = bitsFromGray(toGray(await decodeImage(join(deckDir, asset.twins.dark))), cell);
  const light = bitsFromGray(toGray(await decodeImage(join(deckDir, asset.twins.light))), cell);
  const inverseMismatch = cellAgreement(light, invertBits(dark)).mismatched;
  return { dark, light, inverseMismatch, cell };
}

/** The plate metrics of a screen against a plate rectangle (or none). */
export function screenMetrics(
  dark: BitImage,
  plate: Box | undefined,
  cell: number,
): TwoToneMetrics {
  return twoToneMetrics(dark, plate, cell);
}

export type DitherRequest = {
  asset: Asset;
  /** A full treatment to run; else the recorded one with `params` merged. */
  treatment?: TwoToneTreatment;
  params?: TwoToneRequestParams;
  /** The plate to screen against; else the recorded metrics' plate, else none. */
  plate?: PlateSide;
  /** The continuous source when the asset records none (relative to the deck or absolute). */
  source?: string;
  fromRecorded?: boolean;
  verifyCells?: boolean;
};

export type DitherReport = {
  assetId: string;
  twins: Asset['twins'];
  metrics?: Asset['metrics'];
  mismatchedCells?: number;
  twinInverseMismatch?: number;
  missingParameter?: boolean;
  missingSource?: boolean;
  /** The committed twin files are not on disk (a fixture record), so nothing was read back. */
  missingTwins?: boolean;
  written: string[];
};

export type DitherOutcome = {
  /** The asset with its metrics (and twins, treatment) updated. */
  asset: Asset;
  report: DitherReport;
  warnings: string[];
};

function sourcePathOf(deckDir: string, asset: Asset, given?: string): string | undefined {
  const candidate = given ?? asset.sourceFile;
  if (candidate === undefined) return undefined;
  const path = isAbsolute(candidate) ? candidate : resolve(deckDir, candidate);
  return existsSync(path) ? path : undefined;
}

/** The plate to screen against: the request's, else the recorded one, else the role's (opener lower left, mood lower right). */
function plateFor(request: DitherRequest): Box | undefined {
  if (request.plate !== undefined) return plateBoxFor(request.plate);
  const recorded = request.asset.metrics?.plateClear?.plate;
  if (recorded !== undefined) return recorded;
  if (request.asset.role === 'opener') return plateBoxFor('lower-left');
  if (request.asset.role === 'mood') return plateBoxFor('lower-right');
  return undefined;
}

function stripWarnings(metrics: TwoToneMetrics): NonNullable<Asset['metrics']> {
  return {
    litFraction: metrics.litFraction,
    ...(metrics.plateClear !== undefined ? { plateClear: metrics.plateClear } : {}),
  };
}

export type DitherOptions = {
  deckDir: string;
  /** The store's asset write (SPEC-3 8.5); the deck directory when absent. */
  putAsset?: (relative: string, bytes: Uint8Array) => Promise<{ relative: string }>;
  /** Removes a superseded twin everywhere the store holds it; the deck directory when absent. */
  removeAsset?: (relative: string) => Promise<void>;
  /** Digest named twins (`assets/<id>.<sha8>-light.png`), never overwritten. */
  digestNames?: boolean;
};

function digestOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8);
}

/** Re-reads or re-runs one asset's twins. */
export async function ditherAsset(
  request: DitherRequest,
  options: DitherOptions,
): Promise<DitherOutcome> {
  const { asset } = request;
  const recorded = asset.treatment?.kind === 'two-tone' ? asset.treatment : undefined;
  const plate = plateFor(request);
  const source = sourcePathOf(options.deckDir, asset, request.source);
  const warnings: string[] = [];

  const rerun =
    request.fromRecorded !== true &&
    (request.treatment !== undefined || request.params !== undefined);
  if (rerun) {
    if (source === undefined) {
      throw new RangeError(
        `${asset.id}: a re-run needs the continuous source; set sourceFile on the asset or pass --source <file>`,
      );
    }
    const rgba = await decodeImage(source);
    const treatment =
      request.treatment ??
      (recorded !== undefined
        ? { ...recorded, ...cleanParams(request.params ?? {}) }
        : fullTreatment(request.params ?? {}, rgba));
    const result = twoTone(rgba, treatmentParams(treatment), {
      ...(plate !== undefined ? { plate } : {}),
    });
    const paths =
      options.digestNames === true
        ? {
            light: `assets/${asset.id}.${digestOf(result.light.png)}-light.png`,
            dark: `assets/${asset.id}.${digestOf(result.dark.png)}-dark.png`,
          }
        : twinPaths(asset.id);
    const put = async (relative: string, bytes: Uint8Array): Promise<string> =>
      options.putAsset !== undefined
        ? (await options.putAsset(relative, bytes)).relative
        : writeUnder(options.deckDir, relative, bytes);
    const written = [
      await put(paths.light, result.light.png),
      await put(paths.dark, result.dark.png),
    ];
    if (!('neutral' in asset.twins)) {
      // the superseded twins go after the new ones are in place (the record commit is the caller's)
      for (const old of [asset.twins.light, asset.twins.dark]) {
        if (old === paths.light || old === paths.dark) continue;
        if (options.removeAsset !== undefined) await options.removeAsset(old);
        else if (existsSync(join(options.deckDir, old)))
          await rm(join(options.deckDir, old), { force: true });
      }
    }
    warnings.push(...result.metrics.warnings.map((line) => `${asset.id}: ${line}`));
    const next: Asset = {
      ...asset,
      twins: paths,
      size: [result.dark.bits.width, result.dark.bits.height],
      scale: 1,
      treatment,
      inline: 'two-color',
      metrics: stripWarnings(result.metrics),
      ...(asset.sourceFile === undefined &&
      request.source !== undefined &&
      !isAbsolute(request.source)
        ? { sourceFile: request.source }
        : {}),
    };
    return {
      asset: next,
      report: {
        assetId: asset.id,
        twins: next.twins,
        metrics: next.metrics,
        twinInverseMismatch: 0,
        written,
      },
      warnings,
    };
  }

  // from the record: the committed twins are the truth
  if ('neutral' in asset.twins || !twinsOnDisk(options.deckDir, asset)) {
    return {
      asset,
      report: {
        assetId: asset.id,
        twins: asset.twins,
        ...(asset.metrics !== undefined ? { metrics: asset.metrics } : {}),
        ...(recorded === undefined ? { missingParameter: true } : {}),
        missingTwins: true,
        written: [],
      },
      warnings: [`${asset.id}: the twin files are not on disk; nothing was read back`],
    };
  }
  const bits = await readTwinBits(options.deckDir, asset);
  const metrics = screenMetrics(bits.dark, plate, bits.cell);
  warnings.push(...metrics.warnings.map((line) => `${asset.id}: ${line}`));
  if (bits.inverseMismatch > 0)
    warnings.push(
      `${asset.id}: the light twin differs from the inverse of the dark one in ${bits.inverseMismatch} cell(s)`,
    );
  const report: DitherReport = {
    assetId: asset.id,
    twins: asset.twins,
    metrics: stripWarnings(metrics),
    twinInverseMismatch: bits.inverseMismatch,
    written: [],
  };
  if (recorded === undefined) report.missingParameter = true;
  if (request.verifyCells === true) {
    if (source === undefined) report.missingSource = true;
    else if (recorded !== undefined) {
      const rgba = await decodeImage(source);
      const regenerated = twoTone(rgba, treatmentParams(recorded));
      const dark =
        regenerated.params.polarity === 'dark-ground'
          ? regenerated.positive
          : invertBits(regenerated.positive);
      report.mismatchedCells = cellAgreement(dark, bits.dark).mismatched;
    }
  }
  const next: Asset = { ...asset, metrics: report.metrics };
  return { asset: next, report, warnings };
}

function twinsOnDisk(deckDir: string, asset: Asset): boolean {
  if ('neutral' in asset.twins) return existsSync(join(deckDir, asset.twins.neutral));
  return (
    existsSync(join(deckDir, asset.twins.light)) && existsSync(join(deckDir, asset.twins.dark))
  );
}

/** Request parameters with the undefined ones dropped, so a merge never writes `black: undefined`. */
function cleanParams(params: TwoToneRequestParams): Partial<TwoToneTreatment> {
  const out: Partial<TwoToneTreatment> = {};
  if (params.crop !== undefined) out.crop = params.crop;
  if (params.channel !== undefined) out.channel = params.channel;
  if (params.invert !== undefined) out.invert = params.invert;
  if (params.blur !== undefined) out.blur = params.blur;
  if (params.black !== undefined) out.black = params.black;
  if (params.white !== undefined) out.white = params.white;
  if (params.gamma !== undefined) out.gamma = params.gamma;
  if (params.minFilter !== undefined) out.minFilter = params.minFilter;
  if (params.polarity !== undefined) out.polarity = params.polarity;
  return out;
}

/** The two-tone assets of a deck, for --all-two-tone. */
export function twoToneAssets(assets: Readonly<Record<string, Asset>>): Asset[] {
  return Object.values(assets).filter((asset) => asset.treatment?.kind === 'two-tone');
}
