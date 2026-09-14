/* tslint:disable */
/* eslint-disable */

export class CoeffsResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly bounds: Int32Array;
    readonly kk: Int32Array;
    readonly ksize: number;
}

export class DssimResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly dssim: number;
    readonly scales: number;
    readonly ssim: number;
}

export class PixelmatchResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly mismatched: number;
    readonly output: Uint8Array | undefined;
}

export class ScreenResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly height: number;
    readonly positive: Uint8Array;
    readonly tone: Uint8Array;
    readonly width: number;
}

export class TwoToneResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly cell: number;
    readonly darkBits: Uint8Array;
    readonly darkPng: Uint8Array | undefined;
    readonly height: number;
    readonly lightBits: Uint8Array;
    readonly lightPng: Uint8Array | undefined;
    readonly metricsJson: string;
    readonly positive: Uint8Array;
    readonly tone: Uint8Array;
    readonly width: number;
}

export function bayerThresholds(): Uint8Array;

export function diffExact(a: Uint8Array, b: Uint8Array): number;

export function diffPixelmatch(a: Uint8Array, b: Uint8Array, width: number, height: number, threshold: number, include_aa: boolean, want_output: boolean, checkerboard: boolean): PixelmatchResult;

export function dssim(a: Uint8Array, b: Uint8Array, width: number, height: number): DssimResult;

export function encodePng1(bits: Uint8Array, width: number, height: number, palette_json: string | null | undefined, level: number): Uint8Array;

export function gaussianKernel(sigma: number): Float64Array;

export function lanczosCoeffs(in_size: number, in0: number, in1: number, out_size: number): CoeffsResult;

export function toneLut(black: number, white: number, gamma: number): Uint8Array;

export function twoTone(rgba: Uint8Array, width: number, height: number, params_json: string, plate_json: string | null | undefined, png: boolean): TwoToneResult;

export function twoToneScreen(rgba: Uint8Array, width: number, height: number, params_json: string): ScreenResult;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_coeffsresult_free: (a: number, b: number) => void;
    readonly __wbg_dssimresult_free: (a: number, b: number) => void;
    readonly __wbg_get_coeffsresult_bounds: (a: number) => [number, number];
    readonly __wbg_get_coeffsresult_kk: (a: number) => [number, number];
    readonly __wbg_get_coeffsresult_ksize: (a: number) => number;
    readonly __wbg_get_dssimresult_dssim: (a: number) => number;
    readonly __wbg_get_dssimresult_scales: (a: number) => number;
    readonly __wbg_get_dssimresult_ssim: (a: number) => number;
    readonly __wbg_get_pixelmatchresult_mismatched: (a: number) => number;
    readonly __wbg_get_pixelmatchresult_output: (a: number) => [number, number];
    readonly __wbg_get_screenresult_height: (a: number) => number;
    readonly __wbg_get_screenresult_positive: (a: number) => [number, number];
    readonly __wbg_get_screenresult_tone: (a: number) => [number, number];
    readonly __wbg_get_screenresult_width: (a: number) => number;
    readonly __wbg_get_twotoneresult_cell: (a: number) => number;
    readonly __wbg_get_twotoneresult_darkBits: (a: number) => [number, number];
    readonly __wbg_get_twotoneresult_darkPng: (a: number) => [number, number];
    readonly __wbg_get_twotoneresult_height: (a: number) => number;
    readonly __wbg_get_twotoneresult_lightBits: (a: number) => [number, number];
    readonly __wbg_get_twotoneresult_lightPng: (a: number) => [number, number];
    readonly __wbg_get_twotoneresult_metricsJson: (a: number) => [number, number];
    readonly __wbg_get_twotoneresult_positive: (a: number) => [number, number];
    readonly __wbg_get_twotoneresult_tone: (a: number) => [number, number];
    readonly __wbg_get_twotoneresult_width: (a: number) => number;
    readonly __wbg_pixelmatchresult_free: (a: number, b: number) => void;
    readonly __wbg_screenresult_free: (a: number, b: number) => void;
    readonly __wbg_twotoneresult_free: (a: number, b: number) => void;
    readonly bayerThresholds: () => [number, number];
    readonly diffExact: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly diffPixelmatch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly dssim: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly encodePng1: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly gaussianKernel: (a: number) => [number, number];
    readonly lanczosCoeffs: (a: number, b: number, c: number, d: number) => number;
    readonly toneLut: (a: number, b: number, c: number) => [number, number];
    readonly twoTone: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly twoToneScreen: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly version: () => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
