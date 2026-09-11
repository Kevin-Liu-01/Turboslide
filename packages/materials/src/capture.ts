// The material capture job (SPEC 5.4: "Capture is a headless job: mount at 1600 by 900 with
// deviceScaleFactor 2, wait settleMs, take frames at the requested anchors, store the chosen frame
// ... with recipeKey = sha256(materialId, uniforms, size, timeMs, backend)"; SPEC 7.1
// material.capture). The page is served from memory through Playwright's request routing at a
// fixed origin: the capture document and, under /paper/, the files of @paper-design/shaders'
// dist, so the browser imports the same ESM the editor bundles and no file:// module rule is
// touched. The mount runs at speed 0 and `setFrame(anchor)` renders each frame deterministically
// (ShaderMount: u_time is the frame in ms); an element screenshot of the canvas at device scale
// factor 2 is the 3200 by 1800 frame. A two-tone capture then runs the frame through the deck's
// screen (OPENERS.md "Shader pipeline": crop in device pixels, black point, gamma) into 1-bit
// twins with the plate metrics; a plain capture keeps the PNG frame as one neutral twin at 2x.
// The renderer string and the backend are recorded because Metal and SwiftShader disagree on
// pixels (slides report 2.3), and the recipe sidecar assets/<id>.recipe.json is written beside
// the twins (SPEC 4.1). The store write is the caller's.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';

import type { Browser, Page } from 'playwright-core';

import { decodeImage } from '@turboslide/effects/io';
import type { TwoToneMetrics } from '@turboslide/effects/metrics';
import { twoTone } from '@turboslide/effects/two-tone';
import {
  fullTreatment,
  plateBoxFor,
  treatmentParams,
  twinPaths,
  writeUnder,
} from '@turboslide/headless/capture/shared';
import type { PlateSide, TwoToneRequestParams } from '@turboslide/headless/capture/shared';
import { launchBrowser } from '@turboslide/headless/launch';
import type { GpuBackend, LaunchOptions, LaunchedBrowser } from '@turboslide/headless/launch';
import type { Asset } from '@turboslide/schema/assets';
import type { MaterialUniforms } from '@turboslide/schema/blocks/material';
import { getShaderNoiseTexture } from '@paper-design/shaders';

import type { MaterialEntry } from './catalog.ts';
import { requireMaterial } from './catalog.ts';
import { fragmentShaderExport, mipmapsFor, textureSources, toShaderUniforms } from './paper.ts';
import { materialSlug, resolveRecipe } from './recipe.ts';
import type { ResolvedRecipe } from './recipe.ts';
import { recipeKey } from './recipe-key.ts';

/** SPEC 4.2: a material source records a 3200 by 1800 frame (a 1600 by 900 mount at scale 2). */
export const FRAME_SIZE: [3200, 1800] = [3200, 1800];
export const MOUNT_CSS_SIZE = { width: 1600, height: 900 } as const;

/** The origin the capture document and the shader module are served from, in memory. */
export const CAPTURE_ORIGIN = 'http://turboslide.local';

export type MaterialCaptureRequest = {
  materialId: string;
  preset?: string;
  uniforms?: MaterialUniforms;
  size?: [number, number];
  /** Frame times in ms; one asset per anchor. */
  anchors: number[];
  id?: string;
  role?: 'opener' | 'mood' | 'frame';
  alt?: string;
  twoTone?: boolean;
  treatment?: TwoToneRequestParams;
  plate?: PlateSide;
  backend?: GpuBackend;
  /** Milliseconds after the mount before the first frame; default 0 (frames are set, not played). */
  settleMs?: number;
};

export type MaterialCaptureOptions = {
  deckDir: string;
  /** A browser to reuse; otherwise one is launched with the request's backend and closed. */
  browser?: LaunchedBrowser;
  launch?: LaunchOptions;
  /** The @paper-design/shaders dist directory; resolved from this package when absent. */
  paperDist?: string;
  log?: (line: string) => void;
};

export type CapturedFrame = {
  asset: Asset;
  /** Files written, relative to the deck directory. */
  files: string[];
  /** The 3200 by 1800 frame as PNG bytes. */
  frame: Uint8Array;
  metrics?: TwoToneMetrics;
  warnings: string[];
};

export type MaterialCaptureResult = {
  frames: CapturedFrame[];
  resolved: ResolvedRecipe;
  renderer: string;
  backend: GpuBackend;
  ms: number;
};

/** The dist directory of @paper-design/shaders, from the package resolution of this module. */
export function paperDistDir(override?: string): string {
  if (override !== undefined) return override;
  const fromEnv = process.env.TURBOSLIDE_PAPER_DIST;
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  const entry = createRequire(import.meta.url).resolve('@paper-design/shaders');
  return dirname(entry);
}

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
};

/** The capture document: a 1600 by 900 host on black and the module namespace on the window. */
export function captureDocument(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Turboslide material capture</title>
<style>
html, body { margin: 0; width: ${MOUNT_CSS_SIZE.width}px; height: ${MOUNT_CSS_SIZE.height}px; overflow: hidden; background: #000; }
#host { position: absolute; left: 0; top: 0; width: ${MOUNT_CSS_SIZE.width}px; height: ${MOUNT_CSS_SIZE.height}px; }
#host canvas { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
<div id="host"></div>
<script type="module">
import * as paper from './paper/index.js';
window.__paper = paper;
document.documentElement.dataset.paperReady = '1';
</script>
</body>
</html>
`;
}

/** Serves the document and the shader module from memory on CAPTURE_ORIGIN. */
export async function servePaper(page: Page, distDir: string): Promise<void> {
  const root = resolve(distDir);
  await page.route(`${CAPTURE_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/capture.html') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: captureDocument(),
      });
      return;
    }
    if (url.pathname.startsWith('/paper/')) {
      const rel = normalize(decodeURIComponent(url.pathname.slice('/paper/'.length)));
      const file = resolve(join(root, rel));
      if (!file.startsWith(root + sep) || !existsSync(file)) {
        await route.fulfill({ status: 404, body: `not found: ${rel}` });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
        body: await readFile(file),
      });
      return;
    }
    await route.fulfill({ status: 404, body: 'not found' });
  });
}

type MountArgs = {
  shaderExport: string;
  uniforms: Record<string, unknown>;
  textures: Record<string, string>;
  mipmaps: string[];
  frame: number;
  width: number;
  height: number;
  maxPixelCount: number;
};

/** Mounts the shader in the page at speed 0 and waits for the canvas to reach the frame size. */
async function mountInPage(
  page: Page,
  args: MountArgs,
): Promise<{ width: number; height: number }> {
  await page.waitForSelector('html[data-paper-ready="1"]', { state: 'attached', timeout: 15_000 });
  return page.evaluate(async (a) => {
    type PaperModule = Record<string, unknown> & {
      ShaderMount: new (
        host: HTMLElement,
        shader: string,
        uniforms: Record<string, unknown>,
        attributes: WebGLContextAttributes | undefined,
        speed: number,
        frame: number,
        minPixelRatio: number,
        maxPixelCount: number,
        mipmaps: string[],
      ) => {
        canvasElement: HTMLCanvasElement;
        setFrame: (ms: number) => void;
        setMinPixelRatio: (ratio: number) => void;
      };
    };
    const paper = (window as unknown as { __paper: PaperModule }).__paper;
    const host = document.getElementById('host');
    if (host === null) throw new Error('capture host missing');
    const shader = paper[a.shaderExport];
    if (typeof shader !== 'string') throw new Error(`no shader export ${a.shaderExport}`);
    const textures: Record<string, HTMLImageElement> = {};
    for (const [name, src] of Object.entries(a.textures)) {
      const image = new Image();
      image.src = src;
      await image.decode();
      textures[name] = image;
    }
    const mount = new paper.ShaderMount(
      host,
      shader,
      { ...a.uniforms, ...textures },
      { preserveDrawingBuffer: true, antialias: false },
      0,
      a.frame,
      2,
      a.maxPixelCount,
      a.mipmaps,
    );
    (window as unknown as { __mount: unknown }).__mount = mount;
    const canvas = mount.canvasElement;
    const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
    // the first ResizeObserver callback reads the host's box (and sets devicePixelsSupported);
    // the canvas starts at the element default of 300 by 150, so the box is what to wait for
    const internals = mount as unknown as { parentWidth: number; devicePixelsSupported: boolean };
    for (let i = 0; i < 120 && internals.parentWidth === 0; i += 1) await frame();
    // Under an emulated device scale factor Chromium reports devicePixelContentBoxSize in CSS
    // pixels, so Paper sizes the canvas at 1x (OPENERS.md, Blog and content: "the mount's
    // devicePixelsSupported flag was cleared and setMinPixelRatio(2) ... called"); clearing the
    // flag after that first callback forces the fallback path, CSS box times max(dpr, minPixelRatio).
    internals.devicePixelsSupported = false;
    mount.setMinPixelRatio(2);
    for (let i = 0; i < 120 && (canvas.width !== a.width || canvas.height !== a.height); i += 1)
      await frame();
    mount.setFrame(a.frame);
    await frame();
    await frame();
    return { width: canvas.width, height: canvas.height };
  }, args);
}

async function frameAt(page: Page, anchor: number): Promise<Uint8Array> {
  await page.evaluate(async (ms) => {
    const mount = (window as unknown as { __mount: { setFrame: (ms: number) => void } }).__mount;
    mount.setFrame(ms);
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r(undefined))),
    );
  }, anchor);
  const shot = await page
    .locator('#host canvas')
    .screenshot({ type: 'png', animations: 'disabled' });
  return new Uint8Array(shot);
}

function defaultAlt(entry: MaterialEntry, resolved: ResolvedRecipe, twoTone: boolean): string {
  const preset =
    resolved.preset === undefined
      ? undefined
      : entry.presets.find((p) => p.name === resolved.preset);
  const which = preset === undefined ? '' : ` in the ${preset.label.toLowerCase()} preset`;
  return `The ${entry.label.toLowerCase()} material${which}, rendered at ${FRAME_SIZE[0]} by ${FRAME_SIZE[1]}${twoTone ? ', dithered' : ''}`;
}

/** Captures one recipe at every anchor; one browser, one page, one mount. */
export async function captureMaterial(
  request: MaterialCaptureRequest,
  options: MaterialCaptureOptions,
): Promise<MaterialCaptureResult> {
  const started = performance.now();
  const entry = requireMaterial(request.materialId);
  const resolved = resolveRecipe(entry, request);
  if (request.size !== undefined) {
    const [w, h] = request.size;
    const css = w === MOUNT_CSS_SIZE.width && h === MOUNT_CSS_SIZE.height;
    const device = w === FRAME_SIZE[0] && h === FRAME_SIZE[1];
    if (!css && !device) {
      throw new RangeError(
        `a material frame is ${FRAME_SIZE.join(' by ')} (a ${MOUNT_CSS_SIZE.width} by ${MOUNT_CSS_SIZE.height} mount at scale 2, SPEC 4.2); got ${w} by ${h}`,
      );
    }
  }
  if (request.anchors.length === 0)
    throw new RangeError('material.capture wants at least one anchor');
  const twoToneWanted = request.twoTone === true;
  const noise = getShaderNoiseTexture();
  const textures = textureSources(entry, noise?.src ?? '');
  const shaderUniforms = toShaderUniforms(entry, resolved.uniforms);

  let launched: LaunchedBrowser | undefined;
  const browserHandle =
    options.browser ??
    (launched = await launchBrowser({
      ...(request.backend !== undefined ? { backend: request.backend } : {}),
      ...options.launch,
    }));
  const browser: Browser = browserHandle.browser;
  const backend = browserHandle.backend;
  const renderer = browserHandle.renderer;
  const frames: { anchor: number; png: Uint8Array }[] = [];
  try {
    const context = await browser.newContext({
      viewport: { width: MOUNT_CSS_SIZE.width, height: MOUNT_CSS_SIZE.height },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await servePaper(page, paperDistDir(options.paperDist));
      await page.goto(`${CAPTURE_ORIGIN}/capture.html`, { waitUntil: 'load' });
      const first = request.anchors[0] ?? 0;
      const size = await mountInPage(page, {
        shaderExport: fragmentShaderExport(entry),
        uniforms: shaderUniforms as Record<string, unknown>,
        textures,
        mipmaps: mipmapsFor(entry),
        frame: first,
        width: FRAME_SIZE[0],
        height: FRAME_SIZE[1],
        maxPixelCount: FRAME_SIZE[0] * FRAME_SIZE[1] + 1,
      });
      if (size.width !== FRAME_SIZE[0] || size.height !== FRAME_SIZE[1]) {
        throw new Error(
          `the mount rendered at ${size.width} by ${size.height}, not ${FRAME_SIZE.join(' by ')} (the canvas did not reach the frame size)`,
        );
      }
      if (request.settleMs !== undefined && request.settleMs > 0)
        await page.waitForTimeout(request.settleMs);
      for (const anchor of request.anchors) {
        options.log?.(`material: ${entry.id} at ${anchor} ms`);
        frames.push({ anchor, png: await frameAt(page, anchor) });
      }
    } finally {
      await context.close();
    }
  } finally {
    if (launched !== undefined) await launched.close();
  }

  const baseId = request.id ?? materialSlug(entry.id);
  const several = request.anchors.length > 1;
  const out: CapturedFrame[] = [];
  for (const { anchor, png } of frames) {
    const id = several ? `${baseId}-${anchor}` : baseId;
    const key = recipeKey({
      materialId: entry.id,
      uniforms: resolved.uniforms,
      size: FRAME_SIZE,
      timeMs: anchor,
      backend,
    });
    const files: string[] = [];
    const warnings = resolved.warnings.map((issue) => issue.message);
    const source: Asset['source'] = {
      kind: 'material',
      materialId: entry.id,
      uniforms: resolved.uniforms,
      size: FRAME_SIZE,
      timeMs: anchor,
      backend,
      renderer,
      recipeKey: key,
    };
    const role = request.role ?? 'frame';
    const alt = request.alt ?? defaultAlt(entry, resolved, twoToneWanted);
    const credit = `${entry.credit}, rendered in Turboslide`;
    let asset: Asset;
    let metrics: TwoToneMetrics | undefined;
    if (twoToneWanted) {
      const rgba = await decodeImage(png);
      const treatment = fullTreatment(request.treatment ?? {}, rgba);
      const plate =
        request.plate ??
        (role === 'mood' ? 'lower-right' : role === 'opener' ? 'lower-left' : undefined);
      const result = twoTone(rgba, treatmentParams(treatment), {
        ...(plate !== undefined ? { plate: plateBoxFor(plate) } : {}),
      });
      metrics = result.metrics;
      const paths = twinPaths(id);
      files.push(await writeUnder(options.deckDir, paths.light, result.light.png));
      files.push(await writeUnder(options.deckDir, paths.dark, result.dark.png));
      warnings.push(...result.metrics.warnings);
      asset = {
        id,
        role,
        alt,
        twins: paths,
        size: [result.dark.bits.width, result.dark.bits.height],
        scale: 1,
        source,
        treatment,
        credit,
        inline: 'two-color',
        metrics: {
          litFraction: result.metrics.litFraction,
          ...(result.metrics.plateClear !== undefined
            ? { plateClear: result.metrics.plateClear }
            : {}),
        },
      };
    } else {
      const path = await writeUnder(options.deckDir, `assets/${id}@2x.png`, png);
      files.push(path);
      asset = {
        id,
        role,
        alt,
        twins: { neutral: path },
        size: FRAME_SIZE,
        scale: 2,
        source,
        treatment: { kind: 'continuous', quality: 92 },
        credit,
        inline: 'native',
      };
    }
    const sidecar = {
      materialId: entry.id,
      ...(resolved.preset !== undefined ? { preset: resolved.preset } : {}),
      uniforms: resolved.uniforms,
      size: FRAME_SIZE,
      timeMs: anchor,
      backend,
      renderer,
      recipeKey: key,
      twoTone: twoToneWanted,
      ...(asset.treatment !== undefined ? { treatment: asset.treatment } : {}),
      ...(request.plate !== undefined ? { plate: request.plate } : {}),
      capturedAt: new Date().toISOString(),
    };
    files.push(
      await writeUnder(
        options.deckDir,
        `assets/${id}.recipe.json`,
        new TextEncoder().encode(`${JSON.stringify(sidecar, null, 2)}\n`),
      ),
    );
    out.push({ asset, files, frame: png, ...(metrics !== undefined ? { metrics } : {}), warnings });
  }
  return { frames: out, resolved, renderer, backend, ms: Math.round(performance.now() - started) };
}

/**
 * A recipe file for `--uniforms <file>`: a sidecar as written above (materialId, preset,
 * uniforms, timeMs, treatment, plate) or a bare uniform record.
 */
export function parseRecipeFile(raw: unknown): {
  materialId?: string;
  preset?: string;
  uniforms?: MaterialUniforms;
  anchor?: number;
  twoTone?: boolean;
  treatment?: TwoToneRequestParams;
  plate?: PlateSide;
} {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new TypeError('a recipe file holds an object');
  const record = raw as Record<string, unknown>;
  const bare = !('uniforms' in record) && !('materialId' in record);
  if (bare) return { uniforms: record as MaterialUniforms };
  const out: ReturnType<typeof parseRecipeFile> = {};
  if (typeof record.materialId === 'string') out.materialId = record.materialId;
  if (typeof record.preset === 'string') out.preset = record.preset;
  if (record.uniforms !== null && typeof record.uniforms === 'object')
    out.uniforms = record.uniforms as MaterialUniforms;
  if (typeof record.timeMs === 'number') out.anchor = record.timeMs;
  if (typeof record.anchor === 'number') out.anchor = record.anchor;
  if (typeof record.twoTone === 'boolean') out.twoTone = record.twoTone;
  if (record.treatment !== null && typeof record.treatment === 'object') {
    const t = record.treatment as Record<string, unknown>;
    const params: TwoToneRequestParams = {};
    if (Array.isArray(t.crop) && t.crop.length === 4)
      params.crop = t.crop as [number, number, number, number];
    for (const key of ['blur', 'black', 'white', 'gamma', 'minFilter'] as const)
      if (typeof t[key] === 'number') params[key] = t[key] as number;
    if (t.channel === 'gray' || t.channel === 'r' || t.channel === 'g' || t.channel === 'b')
      params.channel = t.channel;
    if (typeof t.invert === 'boolean') params.invert = t.invert;
    if (t.polarity === 'dark-ground' || t.polarity === 'light-ground') params.polarity = t.polarity;
    out.treatment = params;
  }
  if (
    record.plate === 'lower-left' ||
    record.plate === 'lower-right' ||
    record.plate === 'upper-left'
  )
    out.plate = record.plate;
  return out;
}
