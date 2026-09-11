// Platform keys for the prebuilt addons under npm/<key> (SPEC 10: "prebuilt addons selected by
// optionalDependencies with os, cpu and libc"). The keys follow napi-rs so a later move to its
// CLI keeps the directory names; the Rust target triple of each key is what scripts/build.mjs
// hands to cargo for a cross build.

export type PlatformKey =
  | 'darwin-arm64'
  | 'darwin-x64'
  | 'linux-x64-gnu'
  | 'linux-arm64-gnu'
  | 'linux-x64-musl'
  | 'linux-arm64-musl'
  | 'win32-x64-msvc';

export type PlatformTarget = {
  key: PlatformKey;
  triple: string;
  os: 'darwin' | 'linux' | 'win32';
  cpu: 'arm64' | 'x64';
  libc?: 'glibc' | 'musl';
  /** The cdylib cargo writes for the triple, before it is renamed to `.node`. */
  cdylib: string;
};

export const PLATFORM_TARGETS: readonly PlatformTarget[] = [
  {
    key: 'darwin-arm64',
    triple: 'aarch64-apple-darwin',
    os: 'darwin',
    cpu: 'arm64',
    cdylib: 'libturboslide_native.dylib',
  },
  {
    key: 'darwin-x64',
    triple: 'x86_64-apple-darwin',
    os: 'darwin',
    cpu: 'x64',
    cdylib: 'libturboslide_native.dylib',
  },
  {
    key: 'linux-x64-gnu',
    triple: 'x86_64-unknown-linux-gnu',
    os: 'linux',
    cpu: 'x64',
    libc: 'glibc',
    cdylib: 'libturboslide_native.so',
  },
  {
    key: 'linux-arm64-gnu',
    triple: 'aarch64-unknown-linux-gnu',
    os: 'linux',
    cpu: 'arm64',
    libc: 'glibc',
    cdylib: 'libturboslide_native.so',
  },
  {
    key: 'linux-x64-musl',
    triple: 'x86_64-unknown-linux-musl',
    os: 'linux',
    cpu: 'x64',
    libc: 'musl',
    cdylib: 'libturboslide_native.so',
  },
  {
    key: 'linux-arm64-musl',
    triple: 'aarch64-unknown-linux-musl',
    os: 'linux',
    cpu: 'arm64',
    libc: 'musl',
    cdylib: 'libturboslide_native.so',
  },
  {
    key: 'win32-x64-msvc',
    triple: 'x86_64-pc-windows-msvc',
    os: 'win32',
    cpu: 'x64',
    cdylib: 'turboslide_native.dll',
  },
];

/** The addon file name inside npm/<key>. */
export function addonFileName(key: PlatformKey): string {
  return `turboslide-native.${key}.node`;
}

/** The npm package that carries the addon for a key. */
export function addonPackageName(key: PlatformKey): string {
  return `@turboslide/native-${key}`;
}

type ProcessLike = {
  platform: string;
  arch: string;
  report?: { getReport?: () => unknown };
};

/** glibc or musl on Linux, read from the process report; glibc when the report is silent. */
export function detectLibc(proc: ProcessLike): 'glibc' | 'musl' {
  try {
    const report = proc.report?.getReport?.();
    if (typeof report === 'object' && report !== null) {
      const header = (report as { header?: Record<string, unknown> }).header;
      if (header && typeof header['glibcVersionRuntime'] === 'string') return 'glibc';
      if (header && header['glibcVersionRuntime'] === undefined) return 'musl';
    }
  } catch {
    // no report: assume glibc, the common case
  }
  return 'glibc';
}

/** The key for the running process, or null on a platform without a declared target. */
export function platformKey(proc: ProcessLike = process): PlatformKey | null {
  const libc = proc.platform === 'linux' ? detectLibc(proc) : undefined;
  const hit = PLATFORM_TARGETS.find(
    (t) =>
      t.os === proc.platform && t.cpu === proc.arch && (t.libc === undefined || t.libc === libc),
  );
  return hit ? hit.key : null;
}

/** The target for a Rust triple, for `build.mjs --target`. */
export function targetForTriple(triple: string): PlatformTarget | null {
  return PLATFORM_TARGETS.find((t) => t.triple === triple) ?? null;
}
