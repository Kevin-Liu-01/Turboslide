// The loaders against whatever `pnpm --filter @turboslide/native build` left on this machine.
// Without a build every loader returns null with a reason and nothing throws, which is the state
// of a CI checkout without Rust; with a build the addon and the wasm module answer the same
// surface. TURBOSLIDE_NATIVE_REQUIRED=1 turns a missing build into a failure, for the M5
// acceptance line that builds first.
import { describe, expect, test } from 'vitest';

import { describeNative, loadNativeAddon, loadWasmNode } from './node.ts';
import { PLATFORM_TARGETS, detectLibc, platformKey, targetForTriple } from './platform.ts';
import { NATIVE_FUNCTIONS, hasNativeSurface } from './types.ts';

const required = process.env.TURBOSLIDE_NATIVE_REQUIRED === '1';
const addon = loadNativeAddon();
const wasm = loadWasmNode();

describe('platform keys', () => {
  test('every declared target has a distinct key and triple', () => {
    const keys = new Set(PLATFORM_TARGETS.map((t) => t.key));
    const triples = new Set(PLATFORM_TARGETS.map((t) => t.triple));
    expect(keys.size).toBe(PLATFORM_TARGETS.length);
    expect(triples.size).toBe(PLATFORM_TARGETS.length);
    expect(targetForTriple('aarch64-apple-darwin')?.key).toBe('darwin-arm64');
    expect(targetForTriple('mips-unknown')).toBeNull();
  });

  test('the running platform resolves, and libc is read from the report', () => {
    expect(platformKey({ platform: 'darwin', arch: 'arm64' })).toBe('darwin-arm64');
    expect(platformKey({ platform: 'freebsd', arch: 'x64' })).toBeNull();
    expect(
      platformKey({
        platform: 'linux',
        arch: 'x64',
        report: { getReport: () => ({ header: { glibcVersionRuntime: '2.39' } }) },
      }),
    ).toBe('linux-x64-gnu');
    expect(
      platformKey({
        platform: 'linux',
        arch: 'arm64',
        report: { getReport: () => ({ header: {} }) },
      }),
    ).toBe('linux-arm64-musl');
    expect(detectLibc({ platform: 'linux', arch: 'x64' })).toBe('glibc');
  });
});

describe('loaders', () => {
  test('report what was tried and never throw', () => {
    const report = describeNative();
    expect(report.platform).toBe(platformKey());
    if (report.native === null) expect(report.attempts.length).toBeGreaterThan(0);
    if (required) {
      expect(report.native, JSON.stringify(report)).not.toBeNull();
      expect(report.wasm, JSON.stringify(report)).not.toBeNull();
    }
  });

  test.skipIf(addon === null)('the addon carries the surface and names its binding', () => {
    if (addon === null) throw new Error('unreachable');
    expect(hasNativeSurface(addon)).toBe(true);
    expect(addon.kind).toBe('native');
    expect(addon.version()).toMatch(/^\d+\.\d+\.\d+\+napi$/);
    for (const name of NATIVE_FUNCTIONS) expect(typeof addon[name]).toBe('function');
    expect([...addon.bayerThresholds().subarray(0, 4)]).toEqual([1, 129, 33, 161]);
  });

  test.skipIf(wasm === null)('the wasm module carries the surface and names its binding', () => {
    if (wasm === null) throw new Error('unreachable');
    expect(wasm.kind).toBe('wasm');
    expect(wasm.version()).toMatch(/^\d+\.\d+\.\d+\+wasm$/);
    expect([...wasm.bayerThresholds()]).toHaveLength(64);
    const lut = wasm.toneLut(20, 235, 0.9);
    expect(lut).toHaveLength(256);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });

  test.skipIf(addon === null || wasm === null)('both bindings agree on a small picture', () => {
    if (addon === null || wasm === null) throw new Error('unreachable');
    const width = 96;
    const height = 54;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        rgba[i] = (x * 255) / (width - 1);
        rgba[i + 1] = (y * 255) / (height - 1);
        rgba[i + 2] = 128;
        rgba[i + 3] = 255;
      }
    }
    const params = JSON.stringify({ black: 20, white: 235, gamma: 0.9 });
    const a = addon.twoToneScreen(rgba, width, height, params);
    const b = wasm.twoToneScreen(rgba, width, height, params);
    expect([a.width, a.height]).toEqual([800, 450]);
    expect(Buffer.compare(Buffer.from(a.positive), Buffer.from(b.positive))).toBe(0);
    expect(Buffer.compare(Buffer.from(a.tone), Buffer.from(b.tone))).toBe(0);
    const full = wasm.twoTone(
      rgba,
      width,
      height,
      params,
      JSON.stringify([137, 500, 740, 271]),
      true,
    );
    expect([full.width, full.height]).toEqual([1600, 900]);
    expect(full.darkPng?.subarray(0, 4)).toEqual(Uint8Array.from([137, 80, 78, 71]));
    const metrics = JSON.parse(full.metricsJson) as { litFraction: number; warnings: string[] };
    expect(metrics.litFraction).toBeGreaterThan(0);
    expect(addon.diffExact(rgba, rgba)).toBe(0);
    expect(wasm.dssim(rgba, rgba, width, height).dssim).toBe(0);
  });
});
