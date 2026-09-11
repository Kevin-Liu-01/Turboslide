// export.run for Google Slides (SPEC 7.1, 8.3, 8.5; MILESTONES M6 item 1): scenes from the
// renderer, one presentation per theme through the request builder, the image host, the batch
// planner and the pacer, and the typed ExportReport per theme and merged. A dry run builds and
// validates every request with no credentials, writes `requests.json` (every batch of every
// theme, with notes against placeholders), `images.json` (the manifest with signatures redacted)
// and `dry-run.json` (`presentationId: null`, the counts), and reports `passed` on validation,
// geometry and warnings alone. A live run resolves the image host first and refuses a local host
// whose origin Google cannot fetch from (loopback or unspecified; UnreachableImageHostError names
// TURBOSLIDE_ASSET_BASE_URL and TURBOSLIDE_GCS_BUCKET) before the browser pass and before
// presentations.create, so a misconfigured run leaves no empty presentation in Drive. It then
// authorizes (auth.ts), creates the presentation, reads the page size back, sends the batches with
// the chained revision id, writes the notes in a second call, and with `verify` diffs the LARGE
// thumbnails against the render (thumbs.ts).
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DeckDocument } from '@turboslide/schema/deck';
import type { ExportMode, ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';

import { fileEntry } from '../report.ts';
import { extractScenes } from '../scene/extract.ts';
import type { Scene } from '../scene/types.ts';
import { workspaceRoot } from '../verify/reference.ts';
import { authorize } from './auth.ts';
import { loadSlidesCalibration } from './calibration.ts';
import type { SlidesCalibration } from './calibration.ts';
import { planBatches, runLive } from './client.ts';
import type { Batch, LiveRunResult, SlidesClient } from './client.ts';
import {
  DEFAULT_ASSET_BASE_URL,
  LOCAL_ASSET_DIR,
  UnreachableImageHostError,
  assetBaseUrlProblem,
  collectImageWants,
  createCloudStorageHost,
  createLocalStaticHost,
  hostImages,
  isServiceAccountKey,
  redactManifest,
} from './images.ts';
import type { HostKind, ImageHost, ImageManifest, ServiceAccountKey } from './images.ts';
import { notesRequests } from './notes.ts';
import { RatePacer } from './pace.ts';
import { countKinds, planPresentation } from './requests.ts';
import type { PresentationPlan } from './requests.ts';
import { validateRequests } from './schema.ts';
import type { ValidationIssue } from './schema.ts';
import { verifyThumbnails } from './thumbs.ts';
import type { VerifyThumbnailsResult } from './thumbs.ts';
import { SLIDES_PAGE_EMU } from './units.ts';

export type ExportGslidesOptions = {
  deckDir: string;
  document: DeckDocument;
  outDir: string;
  /** Defaults to flatten, the export.run default (SPEC 8.2). */
  mode?: ExportMode;
  /** One presentation per theme; defaults to both. */
  themes?: Theme[];
  slideIds?: string[];
  /** Build and validate without credentials; nothing is created. */
  dryRun?: boolean;
  /** Live run only: diff the LARGE thumbnails against the render. */
  verify?: boolean;
  /** The presentation title; defaults to `<deck title> (<theme>)`. */
  title?: string;
  /** The image host or its kind; default local (TURBOSLIDE_ASSET_BASE_URL, TURBOSLIDE_GCS_BUCKET). */
  imageHost?: ImageHost | HostKind;
  assetBaseUrl?: string;
  env?: NodeJS.ProcessEnv;
  excludeShareAlike?: boolean;
  /** Pre-extracted scenes (tests, a re-run over written scenes); skips the browser. */
  scenes?: Scene[];
  wordmark?: Partial<Record<Theme, string>>;
  renderer?: string;
  /** Write `scene-<theme>.json` beside the files. */
  writeScenes?: boolean;
  /** An authorized client (tests, a caller that already ran the consent flow). */
  client?: SlidesClient;
  pacer?: RatePacer;
  batch?: { maxBytes?: number; maxRequests?: number };
  calibration?: SlidesCalibration;
  log?: (line: string) => void;
  onSlide?: (scene: Scene, ms: number) => void;
};

export type ThemeExport = {
  theme: Theme;
  title: string;
  plan: PresentationPlan;
  batches: Batch[];
  oversized: string[];
  validation: ValidationIssue[];
  notes: { requests: number; placeholders: boolean };
  manifest: ImageManifest;
  live?: LiveRunResult;
  verified?: VerifyThumbnailsResult;
  report: ExportReport;
  reportPath: string;
};

export type ExportGslidesResult = {
  dryRun: boolean;
  themes: ThemeExport[];
  reports: ExportReport[];
  merged: ExportReport;
  reportPath: string;
  reportPaths: Record<string, string>;
  requestsPath: string;
  imagesPath: string;
  dryRunPath?: string;
  renderer: string;
  ms: number;
};

export const DEFAULT_MODE: ExportMode = 'flatten';

/** The honest fidelity list of SPEC 8.6 for the Slides target, as report residual lines. */
export function fidelityResidual(mode: ExportMode, cal: SlidesCalibration): string[] {
  const inset = cal.text.defaultInsetPt;
  const lines = [
    'fidelity: no letter spacing; Slides has no tracking, so heading boxes carry the width slack of calibration/slides.json and the browser lines travel as hard breaks',
    `fidelity: no text inset control; the assumed default inset (${inset.left} by ${inset.top} pt) is compensated in every box until the first live run measures it`,
    `fidelity: cv11 and ss01 do not reach Slides; text is Google Fonts ${cal.fonts.family} at weights ${cal.fonts.weights.join(' and ')} through weightedFontFamily, with no optical sizes`,
    `fidelity: the page size is fixed at ${SLIDES_PAGE_EMU.width} by ${SLIDES_PAGE_EMU.height} EMU (10 by 5.625 in); the sheet maps at ${cal.page.emuPerPx} EMU per px`,
    `fidelity: line pitch is a percentage of Inter's normal (${cal.text.normalPitchFactor}) until calibrated; hairlines are ${cal.lines.weightPt} pt STRAIGHT lines whose minimum honored weight is unverified`,
    'fidelity: icons, marks, diagrams, dithers and shots are PNGs fetched from hosted URLs; two-tone dithers grey at any non-1:1 zoom; pictures that cover-crop are cropped before hosting',
  ];
  if (mode === 'flatten')
    lines.push(
      'fidelity: flatten text has no alpha in Slides; the searchable layer sits behind the sheet raster in the paper color',
    );
  return lines;
}

/**
 * The host for the run, then the reachability gate: a live run (`stage`) whose local host has a
 * loopback or unspecified origin is refused here, before any scene is extracted and before the
 * presentation exists, because Google fetches every createImage URL from its own servers and
 * rejects the first batch after presentations.create has already run. A dry run keeps the default
 * localhost origin, since nothing is sent. An injected host is gated the same way when it
 * carries a baseUrl.
 */
function resolveHost(options: ExportGslidesOptions, stage: boolean): ImageHost {
  const host =
    typeof options.imageHost === 'object'
      ? options.imageHost
      : buildHost(options, options.imageHost, stage);
  if (stage && host.kind === 'local' && host.baseUrl !== undefined) {
    const problem = assetBaseUrlProblem(host.baseUrl);
    if (problem)
      throw new UnreachableImageHostError(
        `the local image host's origin ${host.baseUrl} ${problem}; Google fetches every createImage URL from its own servers, so the live run is refused before anything is created. Set TURBOSLIDE_ASSET_BASE_URL (or --assets-url) to the studio's public origin, or TURBOSLIDE_GCS_BUCKET for the Cloud Storage host (docs/google-slides.md, Images)`,
      );
  }
  return host;
}

function buildHost(
  options: ExportGslidesOptions,
  requested: HostKind | undefined,
  stage: boolean,
): ImageHost {
  const env = options.env ?? process.env;
  const kind: HostKind =
    requested ??
    (env.TURBOSLIDE_GCS_BUCKET && env.TURBOSLIDE_GCS_BUCKET.length > 0 ? 'gcs' : 'local');
  if (kind === 'gcs') {
    const bucket = env.TURBOSLIDE_GCS_BUCKET;
    if (!bucket)
      throw new Error('the Cloud Storage host needs TURBOSLIDE_GCS_BUCKET (docs/google-slides.md)');
    let key: ServiceAccountKey | undefined;
    if (env.TURBOSLIDE_GCS_CREDENTIALS) key = parseKey(env.TURBOSLIDE_GCS_CREDENTIALS);
    else if (stage)
      throw new Error(
        'the Cloud Storage host needs TURBOSLIDE_GCS_CREDENTIALS (a service account key) for a live run',
      );
    const host = createCloudStorageHost({
      bucket,
      prefix: env.TURBOSLIDE_GCS_PREFIX ?? 'turboslide',
      ttlSeconds: (options.calibration ?? loadSlidesCalibration()).images.signedUrlTtlSeconds,
      upload: stage,
      ...(key ? { key } : {}),
    });
    return host;
  }
  const root = workspaceRoot() ?? process.cwd();
  return createLocalStaticHost({
    dir: join(root, LOCAL_ASSET_DIR),
    baseUrl: options.assetBaseUrl ?? env.TURBOSLIDE_ASSET_BASE_URL ?? DEFAULT_ASSET_BASE_URL,
    stage,
  });
}

function parseKey(path: string): ServiceAccountKey {
  if (!existsSync(path))
    throw new Error(`TURBOSLIDE_GCS_CREDENTIALS names ${path}, which does not exist`);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!isServiceAccountKey(raw)) throw new Error(`${path} is not a service account key`);
  return raw;
}

export async function exportGslides(options: ExportGslidesOptions): Promise<ExportGslidesResult> {
  const started = performance.now();
  const log = options.log ?? (() => {});
  const mode = options.mode ?? DEFAULT_MODE;
  const themes = options.themes ?? ['light', 'dark'];
  const dryRun = options.dryRun === true;
  const cal = options.calibration ?? loadSlidesCalibration();
  const { deck } = options.document;
  await mkdir(options.outDir, { recursive: true });
  const workDir = join(options.outDir, 'work');
  // before the browser pass: an unreachable image origin or a Cloud Storage host without a key
  // fails here, with nothing rendered, staged or created
  const host = resolveHost(options, !dryRun);

  let scenes: Scene[];
  let wordmark: Partial<Record<Theme, string>>;
  let renderer: string;
  let extractWarnings: string[] = [];
  if (options.scenes) {
    scenes = options.scenes;
    wordmark = options.wordmark ?? {};
    renderer = options.renderer ?? 'scenes supplied';
  } else {
    const extracted = await extractScenes({
      deckDir: options.deckDir,
      document: options.document,
      themes,
      mode,
      slideIds: options.slideIds,
      workDir,
      excludeShareAlike: options.excludeShareAlike,
      onSlide: options.onSlide,
    });
    scenes = extracted.scenes;
    wordmark = extracted.wordmark;
    renderer = extracted.renderer;
    extractWarnings = extracted.warnings;
  }

  const pacer =
    options.pacer ??
    new RatePacer({
      limits: { write: cal.quota.writesPerMinute, read: cal.quota.readsPerMinute },
      log,
    });
  const caps = {
    maxBytes: options.batch?.maxBytes ?? cal.batch.maxBytes,
    maxRequests: options.batch?.maxRequests ?? cal.batch.maxRequests,
  };
  let client = options.client;

  const themeExports: ThemeExport[] = [];
  const requestsPath = join(options.outDir, 'requests.json');
  const imagesPath = join(options.outDir, 'images.json');
  for (const theme of themes) {
    const themeScenes = scenes.filter((s) => s.theme === theme);
    if (themeScenes.length === 0) continue;
    if (options.writeScenes)
      await writeFile(
        join(options.outDir, `scene-${theme}.json`),
        `${JSON.stringify(themeScenes, null, 2)}\n`,
      );
    const title = options.title ?? `${deck.title} (${theme})`;
    const wordmarkFile = wordmark[theme];
    const hosted = await hostImages(collectImageWants(themeScenes, mode, wordmarkFile), {
      host,
      workDir,
      log,
    });
    const plan = planPresentation(themeScenes, {
      mode,
      theme,
      resolveUrl: hosted.resolveUrl,
      ...(wordmarkFile ? { wordmarkFile } : {}),
      ...(deck.defaults?.notes ? { defaultNotes: deck.defaults.notes } : {}),
      calibration: cal,
    });
    const notesPlan = notesRequests(plan.slides);
    const validation = [
      ...validateRequests(plan.requests),
      ...validateRequests(notesPlan.requests),
    ];
    const { batches, oversized } = planBatches(plan, caps);
    const warnings = [
      ...extractWarnings.filter((w) => w.includes(`[${theme}]`) || !/\[(light|dark)\]/.test(w)),
      ...plan.warnings,
      ...hosted.manifest.missing.map(
        (m) => `${m.slideId}#${m.blockId}: ${m.role} file ${m.file} is missing`,
      ),
      ...oversized.map((id) => `${id}: the slide's requests exceed one batch's caps on their own`),
      ...validation.map((v) => `request ${v.index} invalid at ${v.path}: ${v.message}`),
    ];
    if (hosted.manifest.maxUrlBytes > cal.images.maxUrlBytes)
      warnings.push(
        `an image URL is ${hosted.manifest.maxUrlBytes} bytes, over the ${cal.images.maxUrlBytes} byte limit`,
      );
    log(
      `gslides: ${theme}: ${plan.slides.length} slide(s), ${plan.requests.length} request(s) in ${batches.length} batch(es), ${hosted.manifest.images.length} image(s), ${notesPlan.requests.length} note(s)${dryRun ? ', dry run' : ''}`,
    );

    let live: LiveRunResult | undefined;
    let verified: VerifyThumbnailsResult | undefined;
    if (!dryRun && validation.length === 0) {
      if (!client) client = (await authorize({ env: options.env, log })).client;
      live = await runLive({ client, pacer, title, plan, batches, log });
      warnings.push(...live.warnings);
      if (options.verify) {
        log(
          `gslides: verifying ${plan.slides.length} thumbnail(s) at LARGE against the ${theme} render`,
        );
        verified = await verifyThumbnails({
          client,
          pacer,
          presentationId: live.presentationId,
          slides: plan.slides,
          theme,
          mode,
          deckDir: options.deckDir,
          revision: deck.revision,
          outDir: join(options.outDir, 'verify'),
          budgets: { ...cal.thumbnail.budgets, threshold: cal.thumbnail.threshold },
          env: options.env,
          log,
        });
      }
    } else if (!dryRun) {
      log(`gslides: ${theme}: ${validation.length} invalid request(s); nothing was sent`);
    }

    const residual = [
      `renderer: ${renderer}`,
      `images: ${hosted.manifest.host}`,
      `requests: ${plan.requests.length} in ${batches.length} batch(es) (${Object.entries(
        countKinds(plan.requests),
      )
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}); notes in a second call (${notesPlan.requests.length})`,
      ...(dryRun
        ? ['dry run: no presentation was created; presentationId is null (dry-run.json)']
        : []),
      ...(live && live.pageSizeEmu
        ? [`page size read back: ${live.pageSizeEmu[0]} by ${live.pageSizeEmu[1]} EMU`]
        : []),
      ...(verified
        ? [
            `verify: ${verified.slides.filter((s) => s.ok).length} of ${verified.slides.length} thumbnail(s) within ${(verified.budget * 100).toFixed(1)} percent, reference ${verified.referenceDir}`,
            ...verified.residual,
          ]
        : []),
      ...fidelityResidual(mode, cal),
      ...plan.residual,
      ...warnings.map((w) => `warning: ${w}`),
    ];
    const passed =
      validation.length === 0 &&
      plan.geometryInBounds &&
      warnings.length === 0 &&
      (live ? live.pageSizeOk : true) &&
      (verified ? verified.passed : true);
    const report: ExportReport = exportReportSchema.parse({
      deckId: deck.id,
      revision: deck.revision,
      format: 'gslides',
      mode,
      theme,
      fontSet: 'standard',
      fontSetVersion: `google-fonts:${cal.fonts.family}`,
      files: [],
      ...(live ? { presentationId: live.presentationId, url: live.url } : {}),
      fonts: {
        embedded: [],
        requiredOnViewer: [],
        substitutedIn: ['Google Slides'],
      },
      slides: plan.slides.map((slide) => {
        const entry: ExportReport['slides'][number] = {
          slideId: slide.slideId,
          theme,
          native: slide.native,
          raster: slide.raster,
        };
        const v = verified?.slides.find((s) => s.slideId === slide.slideId);
        if (v)
          entry.verify = {
            mismatch: v.mismatch,
            fraction: v.fraction,
            scale: 1,
            blocks: v.blocks,
            ref: v.ref,
            got: v.got,
            diff: v.diff,
          };
        return entry;
      }),
      geometryInBounds: plan.geometryInBounds,
      passed,
      residual,
    });
    const reportPath = join(options.outDir, `export-report-${theme}.json`);
    themeExports.push({
      theme,
      title,
      plan,
      batches,
      oversized,
      validation,
      notes: { requests: notesPlan.requests.length, placeholders: notesPlan.placeholders },
      manifest: hosted.manifest,
      ...(live ? { live } : {}),
      ...(verified ? { verified } : {}),
      report,
      reportPath,
    });
  }
  if (themeExports.length === 0) throw new RangeError('exportGslides: nothing to export');

  // requests.json: every theme's batches in order, the notes against placeholders (a dry run) or
  // the ids the live run resolved are not stored, since the live call already happened.
  const requestsDoc = {
    deckId: deck.id,
    revision: deck.revision,
    mode,
    dryRun,
    page: {
      widthEmu: SLIDES_PAGE_EMU.width,
      heightEmu: SLIDES_PAGE_EMU.height,
      emuPerPx: cal.page.emuPerPx,
    },
    presentations: themeExports.map((e) => ({
      theme: e.theme,
      title: e.title,
      presentationId: e.live?.presentationId ?? null,
      url: e.live?.url ?? null,
      slides: e.plan.slides.map((s) => ({
        slideId: s.slideId,
        n: s.n,
        objectId: s.objectId,
        counts: s.counts,
        bytes: s.bytes,
        notes: s.notes !== undefined,
      })),
      batches: e.batches.map((b) => ({
        index: b.index,
        slideIds: b.slideIds,
        bytes: b.bytes,
        requests: b.requests,
      })),
      notes: {
        placeholders: e.notes.placeholders,
        requests: notesRequests(e.plan.slides).requests,
      },
      counts: countKinds(e.plan.requests),
      validation: e.validation,
      geometryInBounds: e.plan.geometryInBounds,
    })),
  };
  await writeFile(requestsPath, `${JSON.stringify(requestsDoc, null, 2)}\n`);
  await writeFile(
    imagesPath,
    `${JSON.stringify(
      themeExports.map((e) => ({ theme: e.theme, ...redactManifest(e.manifest) })),
      null,
      2,
    )}\n`,
  );
  // the report files exist now; record them with sizes and hashes
  const reports: ExportReport[] = [];
  const reportPaths: Record<string, string> = {};
  for (const e of themeExports) {
    const withFiles = exportReportSchema.parse({
      ...e.report,
      files: [fileEntry(requestsPath), fileEntry(imagesPath)],
    });
    e.report = withFiles;
    await writeFile(e.reportPath, `${JSON.stringify(withFiles, null, 2)}\n`);
    reports.push(withFiles);
    reportPaths[e.theme] = e.reportPath;
  }
  const first = reports[0] as ExportReport;
  const { presentationId: firstId, url: firstUrl, ...rest } = first;
  const merged: ExportReport = exportReportSchema.parse({
    ...rest,
    ...(reports.length === 1 && firstId !== undefined
      ? { presentationId: firstId, url: firstUrl }
      : {}),
    slides: reports.flatMap((r) => r.slides),
    geometryInBounds: reports.every((r) => r.geometryInBounds),
    passed: reports.every((r) => r.passed),
    residual: [
      ...(reports.length > 1
        ? [
            `merged report over ${reports.map((r) => r.theme).join(' and ')}; presentationId and url are per theme in the reports beside this file`,
          ]
        : []),
      ...new Set(reports.flatMap((r) => r.residual)),
    ],
  });
  const reportPath = join(options.outDir, 'export-report.json');
  await writeFile(reportPath, `${JSON.stringify(merged, null, 2)}\n`);
  let dryRunPath: string | undefined;
  if (dryRun) {
    dryRunPath = join(options.outDir, 'dry-run.json');
    await writeFile(
      dryRunPath,
      `${JSON.stringify(
        {
          presentationId: null,
          url: null,
          deckId: deck.id,
          revision: deck.revision,
          mode,
          themes: themeExports.map((e) => ({
            theme: e.theme,
            slides: e.plan.slides.length,
            requests: e.plan.requests.length,
            batches: e.batches.length,
            bytes: e.batches.reduce((n, b) => n + b.bytes, 0),
            images: e.manifest.images.length,
            missingImages: e.manifest.missing.length,
            notes: e.notes.requests,
            invalid: e.validation.length,
            geometryInBounds: e.plan.geometryInBounds,
            passed: e.report.passed,
          })),
          passed: merged.passed,
        },
        null,
        2,
      )}\n`,
    );
  }
  return {
    dryRun,
    themes: themeExports,
    reports,
    merged,
    reportPath,
    reportPaths,
    requestsPath,
    imagesPath,
    ...(dryRunPath ? { dryRunPath } : {}),
    renderer,
    ms: Math.round(performance.now() - started),
  };
}
