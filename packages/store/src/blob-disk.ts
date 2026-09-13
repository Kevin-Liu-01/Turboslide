// A BlobClient over a folder (gslides-parity SPEC-2 8.1): the batched export stores its plan,
// its parts and its files through the BlobClient shape, on the Blob store when the deployment
// has one and in a folder of the instance's derived files otherwise (a checkout's `.turboslide/`,
// the tmp backend's overlay), so the same adapter serves every backend and the end to end spec
// drives the batch protocol against a dev server with `TURBOSLIDE_STORE=tmp`. Semantics as the
// fake and the Vercel client: the version is the body's md5 in quotes, `overwrite: false` refuses
// an existing pathname, `ifMatch` refuses a stale version, `del` ignores what is missing, and the
// entry's `url` is what `urlFor` names (the route that streams the file from this instance).
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

import type { BlobClient, BlobEntry } from './blob-store.ts';
import { BlobExistsError, BlobPreconditionError } from './blob-store.ts';
import { isSafeKey } from './seed.ts';

export type DiskBlobOptions = {
  /** the URL an entry reports; default `file://` of the path */
  urlFor?: (pathname: string) => string;
};

function quotedMd5(bytes: Uint8Array): string {
  return `"${createHash('md5').update(bytes).digest('hex')}"`;
}

/** Every file under a folder as posix pathnames relative to `root`. */
function walk(root: string, folder: string, out: string[]): void {
  if (!existsSync(folder)) return;
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(folder, entry.name);
    if (entry.isDirectory()) walk(root, full, out);
    else if (entry.isFile()) out.push(relative(root, full).split(sep).join(posix.sep));
  }
}

export function diskBlobClient(root: string, options: DiskBlobOptions = {}): BlobClient {
  const base = resolve(root);
  const urlFor =
    options.urlFor ?? ((pathname: string) => `file://${join(base, ...pathname.split('/'))}`);
  const fileOf = (pathname: string): string => {
    if (!isSafeKey(pathname)) throw new TypeError(`${pathname} is not a safe blob pathname`);
    const file = resolve(join(base, ...pathname.split('/')));
    if (!file.startsWith(base + sep)) throw new TypeError(`${pathname} escapes the store folder`);
    return file;
  };
  const entryOf = (pathname: string): BlobEntry | null => {
    const file = fileOf(pathname);
    if (!existsSync(file)) return null;
    const stat = statSync(file);
    if (!stat.isFile()) return null;
    return {
      pathname,
      url: urlFor(pathname),
      size: stat.size,
      version: quotedMd5(readFileSync(file)),
      uploadedAt: stat.mtime.toISOString(),
    };
  };
  /** The files under a prefix: the walk starts at the prefix's folder, not the store root. */
  const under = (prefix: string): string[] => {
    const folder = prefix.slice(0, prefix.lastIndexOf('/') + 1);
    const start = folder === '' ? base : join(base, ...folder.split('/').filter(Boolean));
    if (!start.startsWith(base)) return [];
    const names: string[] = [];
    walk(base, start, names);
    return names.filter((name) => name.startsWith(prefix)).sort();
  };
  return {
    async head(pathname) {
      return entryOf(pathname);
    },
    async get(pathname) {
      const entry = entryOf(pathname);
      if (entry === null) return null;
      return { entry, bytes: new Uint8Array(readFileSync(fileOf(pathname))) };
    },
    async list(prefix) {
      return under(prefix)
        .map((name) => entryOf(name))
        .filter((entry): entry is BlobEntry => entry !== null);
    },
    async folders(prefix) {
      const names = under(prefix);
      const out = new Set<string>();
      for (const name of names) {
        if (!name.startsWith(prefix)) continue;
        const rest = name.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash > 0) out.add(`${prefix}${rest.slice(0, slash)}/`);
      }
      return [...out].sort();
    },
    async put(pathname, bytes, putOptions) {
      const file = fileOf(pathname);
      const existing = entryOf(pathname);
      if (existing !== null && !putOptions.overwrite) throw new BlobExistsError(pathname);
      if (putOptions.ifMatch !== undefined && existing?.version !== putOptions.ifMatch) {
        throw new BlobPreconditionError(pathname);
      }
      mkdirSync(dirname(file), { recursive: true });
      const partial = `${file}.${process.pid}.part`;
      writeFileSync(partial, bytes);
      renameSync(partial, file);
      const entry = entryOf(pathname);
      if (entry === null) throw new Error('unreachable: the file was just written');
      return entry;
    },
    async del(pathnames) {
      for (const pathname of pathnames) {
        rmSync(fileOf(pathname), { force: true });
        // empty folders go with their last file, so a removed job leaves no folder behind
        let folder = dirname(fileOf(pathname));
        while (
          folder.startsWith(base + sep) &&
          existsSync(folder) &&
          readdirSync(folder).length === 0
        ) {
          rmSync(folder, { recursive: true, force: true });
          folder = dirname(folder);
        }
      }
    },
  };
}
