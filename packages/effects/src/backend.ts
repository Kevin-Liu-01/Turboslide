// One API over three implementations (SPEC 10): the napi addon, the wasm module and the
// TypeScript modules of this package present the same EffectsBackend, and the dispatching
// functions in two-tone.ts and diff.ts call whichever select.ts picked. This module is
// environment free so a browser worker can build a backend from an initialized wasm module
// (`backendFromNative(wrapWasmModule(glue))`); the Node selection with its file loading lives in
// select.ts.
import type { NativeModule } from '@turboslide/native/types';

import type { ExactDiff } from './diff.ts';
import { dssimTypeScript } from './dssim.ts';
import type { DssimResult } from './dssim.ts';
import { gaussianKernel } from './filters.ts';
import type { BitImage, GrayImage, RgbaImage } from './image.ts';
import { twoToneScreenTypeScript } from './pipeline.ts';
import type { TwoToneScreen } from './pipeline.ts';
import { assertSameSize, diffPixelmatchTypeScript } from './pixelmatch.ts';
import type { PixelmatchDiff, PixelmatchOptions } from './pixelmatch.ts';
import { precomputeCoeffs } from './resample.ts';
import type { Coeffs } from './resample.ts';
import { toneLut } from './tone.ts';
import type { TwoToneParams } from './two-tone.ts';

export type BackendKind = 'native' | 'wasm' | 'typescript';

export type EffectsBackend = {
  kind: BackendKind;
  /** The crate version and binding for native and wasm; `typescript` for the fallback. */
  version: string;
  twoToneScreen: (rgba: RgbaImage, params: TwoToneParams) => TwoToneScreen;
  diffExact: (a: RgbaImage, b: RgbaImage) => ExactDiff;
  diffPixelmatch: (a: RgbaImage, b: RgbaImage, options?: PixelmatchOptions) => PixelmatchDiff;
  dssim: (a: RgbaImage, b: RgbaImage) => DssimResult;
  /** The tone LUT for a black point, white point and gamma; parity diagnostics. */
  toneLut: (black: number, white: number, gamma: number) => Uint8Array;
  /** Pillow's Lanczos tap table for one axis; parity diagnostics. */
  lanczosCoeffs: (inSize: number, in0: number, in1: number, outSize: number) => Coeffs;
  gaussianKernel: (sigma: number) => Float64Array;
};

/** Mismatched pixels between two RGBA images of the same size; alpha counts. */
export function diffExactTypeScript(a: RgbaImage, b: RgbaImage): ExactDiff {
  assertSameSize(a, b, 'diffExact');
  const total = a.width * a.height;
  let mismatched = 0;
  for (let i = 0; i < total; i += 1) {
    const p = i * 4;
    if (
      a.data[p] !== b.data[p] ||
      a.data[p + 1] !== b.data[p + 1] ||
      a.data[p + 2] !== b.data[p + 2] ||
      a.data[p + 3] !== b.data[p + 3]
    ) {
      mismatched += 1;
    }
  }
  return { total, mismatched, fraction: total === 0 ? 0 : mismatched / total };
}

/** The TypeScript implementation as a backend. */
export function typescriptBackend(): EffectsBackend {
  return {
    kind: 'typescript',
    version: 'typescript',
    twoToneScreen: twoToneScreenTypeScript,
    diffExact: diffExactTypeScript,
    diffPixelmatch: diffPixelmatchTypeScript,
    dssim: dssimTypeScript,
    toneLut,
    lanczosCoeffs: precomputeCoeffs,
    gaussianKernel,
  };
}

function bits(width: number, height: number, data: Uint8Array): BitImage {
  return { width, height, bits: data };
}

function gray(width: number, height: number, data: Uint8Array): GrayImage {
  return { width, height, data };
}

/** A backend over a loaded addon or wasm module. Parameters cross as JSON, results as typed arrays. */
export function backendFromNative(native: NativeModule): EffectsBackend {
  return {
    kind: native.kind,
    version: native.version(),
    twoToneScreen(rgba, params) {
      const r = native.twoToneScreen(rgba.data, rgba.width, rgba.height, JSON.stringify(params));
      return {
        positive: bits(r.width, r.height, r.positive),
        toneImage: gray(r.width, r.height, r.tone),
      };
    },
    diffExact(a, b) {
      assertSameSize(a, b, 'diffExact');
      const total = a.width * a.height;
      const mismatched = native.diffExact(a.data, b.data);
      return { total, mismatched, fraction: total === 0 ? 0 : mismatched / total };
    },
    diffPixelmatch(a, b, options = {}) {
      assertSameSize(a, b, 'diffPixelmatch');
      const total = a.width * a.height;
      const r = native.diffPixelmatch(
        a.data,
        b.data,
        a.width,
        a.height,
        options.threshold ?? 0.1,
        options.includeAA ?? false,
        options.output ?? false,
        options.checkerboard ?? true,
      );
      const result: PixelmatchDiff = {
        total,
        mismatched: r.mismatched,
        fraction: total === 0 ? 0 : r.mismatched / total,
      };
      if (r.output) result.output = { width: a.width, height: a.height, data: r.output };
      return result;
    },
    dssim(a, b) {
      assertSameSize(a, b, 'dssim');
      const r = native.dssim(a.data, b.data, a.width, a.height);
      return { dssim: r.dssim, ssim: r.ssim, scales: r.scales };
    },
    toneLut: (black, white, gamma) => native.toneLut(black, white, gamma),
    lanczosCoeffs(inSize, in0, in1, outSize) {
      const c = native.lanczosCoeffs(inSize, in0, in1, outSize);
      return { ksize: c.ksize, bounds: c.bounds, kk: c.kk };
    },
    gaussianKernel: (sigma) => native.gaussianKernel(sigma),
  };
}
