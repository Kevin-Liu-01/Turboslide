// The JavaScript surface of crates/turboslide-native, the same for the napi addon and the wasm
// module (SPEC 10). The Rust bindings (src/bind_napi.rs, src/bind_wasm.rs) name their functions
// and fields in camelCase so one type describes both; @turboslide/effects builds its backend
// from a NativeModule without knowing which binding answered.

export type NativeKind = 'native' | 'wasm';

/** The one-bit screen before polarity: 800 by 450 cells, 0 or 1, and the tone image. */
export type NativeScreen = {
  positive: Uint8Array;
  tone: Uint8Array;
  width: number;
  height: number;
};

/** Both twins at sheet size plus the metrics of the dark twin as JSON (TwoToneMetrics). */
export type NativeTwoTone = {
  positive: Uint8Array;
  tone: Uint8Array;
  darkBits: Uint8Array;
  lightBits: Uint8Array;
  darkPng?: Uint8Array;
  lightPng?: Uint8Array;
  metricsJson: string;
  width: number;
  height: number;
  cell: number;
};

export type NativePixelmatch = {
  mismatched: number;
  output?: Uint8Array;
};

export type NativeDssim = {
  dssim: number;
  ssim: number;
  scales: number;
};

/** Pillow's per-axis Lanczos tap table, for the parity test to pin the arithmetic. */
export type NativeCoeffs = {
  ksize: number;
  bounds: Int32Array;
  kk: Int32Array;
};

export type NativeModule = {
  kind: NativeKind;
  /** The crate version with the binding as a build tag, for example `0.1.0+napi`. */
  version: () => string;
  twoToneScreen: (
    rgba: Uint8Array,
    width: number,
    height: number,
    paramsJson: string,
  ) => NativeScreen;
  twoTone: (
    rgba: Uint8Array,
    width: number,
    height: number,
    paramsJson: string,
    plateJson: string | undefined,
    png: boolean,
  ) => NativeTwoTone;
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
  ) => NativePixelmatch;
  dssim: (a: Uint8Array, b: Uint8Array, width: number, height: number) => NativeDssim;
  toneLut: (black: number, white: number, gamma: number) => Uint8Array;
  lanczosCoeffs: (inSize: number, in0: number, in1: number, outSize: number) => NativeCoeffs;
  gaussianKernel: (sigma: number) => Float64Array;
  bayerThresholds: () => Uint8Array;
};

/** The functions every binding must export; the loaders check for them before trusting a module. */
export const NATIVE_FUNCTIONS: readonly (keyof Omit<NativeModule, 'kind'>)[] = [
  'version',
  'twoToneScreen',
  'twoTone',
  'encodePng1',
  'diffExact',
  'diffPixelmatch',
  'dssim',
  'toneLut',
  'lanczosCoeffs',
  'gaussianKernel',
  'bayerThresholds',
];

/** True when `value` carries every function of the surface. */
export function hasNativeSurface(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return NATIVE_FUNCTIONS.every((name) => typeof record[name] === 'function');
}
