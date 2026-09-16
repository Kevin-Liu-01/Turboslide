// The wasm binding as a NativeModule (SPEC 10: wasm-bindgen builds packages/native/wasm for the
// editor's dither preview worker). This module is environment free: the caller loads the glue
// wasm-bindgen wrote (`wasm/turboslide_native.js`, `--target web`) and initializes it, in a
// browser with `await init(url)` and in Node through `loadWasmNode` in node.ts, then hands the
// namespace here. The glue returns result classes backed by wasm memory; the wrapper reads every
// field once and frees the object, so callers hold plain typed arrays.
import type {
  NativeCoeffs,
  NativeDssim,
  NativeModule,
  NativePixelmatch,
  NativeScreen,
  NativeTwoTone,
} from './types.ts';
import { hasNativeSurface } from './types.ts';

type Freeable = { free: () => void };

/** The exports of wasm/turboslide_native.js after initialization. */
export type WasmGlue = {
  version: () => string;
  twoToneScreen: (
    rgba: Uint8Array,
    width: number,
    height: number,
    paramsJson: string,
  ) => Freeable & NativeScreen;
  twoTone: (
    rgba: Uint8Array,
    width: number,
    height: number,
    paramsJson: string,
    plateJson: string | undefined,
    png: boolean,
  ) => Freeable & NativeTwoTone;
  encodePng1: (
    bits: Uint8Array,
    width: number,
    height: number,
    paletteJson: string | undefined,
    level: number,
  ) => Uint8Array;
  diffExact: (a: Uint8Array, b: Uint8Array) => number;
  diffPixelmatch: (
    a: Uint8Array,
    b: Uint8Array,
    width: number,
    height: number,
    threshold: number,
    includeAa: boolean,
    wantOutput: boolean,
    checkerboard: boolean,
  ) => Freeable & NativePixelmatch;
  dssim: (a: Uint8Array, b: Uint8Array, width: number, height: number) => Freeable & NativeDssim;
  toneLut: (black: number, white: number, gamma: number) => Uint8Array;
  lanczosCoeffs: (
    inSize: number,
    in0: number,
    in1: number,
    outSize: number,
  ) => Freeable & NativeCoeffs;
  gaussianKernel: (sigma: number) => Float64Array;
  bayerThresholds: () => Uint8Array;
  ditherThresholds: (
    pattern: string,
    width: number,
    height: number,
    seed: number,
    angle: number,
  ) => Uint8Array;
  ditherLevels: (
    tone: Uint8Array,
    width: number,
    height: number,
    pattern: string,
    levels: number,
    seed: number,
    angle: number,
  ) => Uint8Array;
  planeAlpha: (strength: number) => number;
};

/**
 * Compiled wasm bytes or a compiled WebAssembly.Module. Typed loosely because this package
 * compiles against the Node lib only, which has no WebAssembly namespace declarations.
 */
export type WasmModuleSource = ArrayBufferView | ArrayBuffer | object;

/** The initializers the `--target web` glue exports next to the functions. */
export type WasmGlueModule = WasmGlue & {
  default: (input?: { module_or_path?: unknown } | unknown) => Promise<unknown>;
  initSync: (input: { module: WasmModuleSource }) => unknown;
};

function take<T extends Freeable, TOut>(result: T, read: (r: T) => TOut): TOut {
  try {
    return read(result);
  } finally {
    result.free();
  }
}

/** Wrap an initialized glue namespace. Throws when the surface is incomplete. */
export function wrapWasmModule(glue: unknown): NativeModule {
  if (!hasNativeSurface(glue)) {
    throw new Error('wasm glue does not export the turboslide-native surface');
  }
  const g = glue as unknown as WasmGlue;
  return {
    kind: 'wasm',
    version: () => g.version(),
    twoToneScreen: (rgba, width, height, paramsJson) =>
      take(g.twoToneScreen(rgba, width, height, paramsJson), (r) => ({
        positive: r.positive,
        tone: r.tone,
        width: r.width,
        height: r.height,
      })),
    twoTone: (rgba, width, height, paramsJson, plateJson, png) =>
      take(g.twoTone(rgba, width, height, paramsJson, plateJson, png), (r) => {
        const out: NativeTwoTone = {
          positive: r.positive,
          tone: r.tone,
          darkBits: r.darkBits,
          lightBits: r.lightBits,
          metricsJson: r.metricsJson,
          width: r.width,
          height: r.height,
          cell: r.cell,
        };
        const darkPng = r.darkPng;
        const lightPng = r.lightPng;
        if (darkPng) out.darkPng = darkPng;
        if (lightPng) out.lightPng = lightPng;
        return out;
      }),
    encodePng1: (bits, width, height, paletteJson, level) =>
      g.encodePng1(bits, width, height, paletteJson, level),
    diffExact: (a, b) => g.diffExact(a, b),
    diffPixelmatch: (a, b, width, height, threshold, includeAa, wantOutput, checkerboard) =>
      take(
        g.diffPixelmatch(a, b, width, height, threshold, includeAa, wantOutput, checkerboard),
        (r) => {
          const out: NativePixelmatch = { mismatched: r.mismatched };
          const output = r.output;
          if (output) out.output = output;
          return out;
        },
      ),
    dssim: (a, b, width, height) =>
      take(g.dssim(a, b, width, height), (r) => ({
        dssim: r.dssim,
        ssim: r.ssim,
        scales: r.scales,
      })),
    toneLut: (black, white, gamma) => g.toneLut(black, white, gamma),
    lanczosCoeffs: (inSize, in0, in1, outSize) =>
      take(g.lanczosCoeffs(inSize, in0, in1, outSize), (r) => ({
        ksize: r.ksize,
        bounds: r.bounds,
        kk: r.kk,
      })),
    gaussianKernel: (sigma) => g.gaussianKernel(sigma),
    bayerThresholds: () => g.bayerThresholds(),
    ditherThresholds: (pattern, width, height, seed, angle) =>
      g.ditherThresholds(pattern, width, height, seed, angle),
    ditherLevels: (tone, width, height, pattern, levels, seed, angle) =>
      g.ditherLevels(tone, width, height, pattern, levels, seed, angle),
    planeAlpha: (strength) => g.planeAlpha(strength),
  };
}

/**
 * Initialize a `--target web` glue module synchronously from compiled bytes or a compiled
 * WebAssembly.Module and wrap it. In a browser worker prefer `await glue.default(url)` then
 * `wrapWasmModule(glue)`: synchronous compilation of a module this size is refused on a page's
 * main thread.
 */
export function initWasmSync(glue: WasmGlueModule, module: WasmModuleSource): NativeModule {
  glue.initSync({ module });
  return wrapWasmModule(glue);
}
