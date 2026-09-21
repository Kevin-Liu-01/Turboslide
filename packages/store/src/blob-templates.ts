// The saved templates on the blob tier (the product round fix round; docs/PRODUCT.md 4.3;
// VERIFICATION.md "Product round, pass 1" finding 2; build/b5b.md R6): File > Save as template
// writes a folder under the instance's overlay (templates.ts saveTemplate), and until this module
// that folder lived on one function instance, so the gallery on another listed `blank` and
// `gt-brand` alone and `template.list` over HTTP answered differently per instance. Now every
// saved template folder and one index of them live in the Blob store under `templates/`, and the
// collection's `templates` facet (hosted.ts `HostedTemplates`) moves them: `push` after a write
// on this instance (the folder's files with `overwrite`, the extras deleted, then the index put
// under the version it was read at, one retry on a lost race), `pull` before a read on any
// instance (one head of the index; when its version moved, the index body and the files of the
// templates whose stamps differ from this instance's mirror, written into a dot folder and moved
// into place, the folders the index no longer names removed, `default.json` as the index says, and
// the local `templates.json` rebuilt from the folders). Turboslide's own templates (no
// `organisation` flag on their record) are the seed's on every instance and never travel.
//
// The budget (docs/sessions-polling.md): no timer. A pull is one head per call and reads bodies
// only when the index moved; a push is one put per file plus the index. The gallery, the /decks
// strip, `template.list`, the default kit read and `deck.create` from a template each pull once.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { SLUG_PATTERN } from '@turboslide/schema/ids';
import { canonicalJson } from '@turboslide/schema/json';

import type { BlobClient } from './blob-store.ts';
import { blobContentType, isBlobPreconditionError, isBlobStaleReadError } from './blob-store.ts';
import { STATE_DIR } from './file-store.ts';
import type { HostedTemplates } from './hosted.ts';
import { isStoreBusy } from './pulse.ts';
import { eachLimit, isSafeKey } from './seed.ts';
import {
  BLANK_TEMPLATE_ID,
  DEFAULT_TEMPLATE_FILE,
  isBuiltInTemplateId,
  listTemplates,
  readDefaultTemplateId,
  templatesDir,
  writeTemplateIndex,
} from './templates.ts';

/** Where the saved templates live in the store: `templates/<id>/<file>` and the index below. */
export const TEMPLATES_PREFIX = 'templates/';
/** The index of the saved templates: their files with the store's versions, and the deployment default. */
export const TEMPLATES_INDEX_PATH = 'templates/index.json';

/** One saved template as the index lists it: each file, relative to the folder, with its stored version. */
export type TemplateSyncEntry = { files: Record<string, string> };

export type TemplatesSyncIndex = {
  v: 1;
  templates: Record<string, TemplateSyncEntry>;
  /** the deployment default (templates.ts `readDefaultTemplateId`); null when new decks start blank */
  default: string | null;
  updatedAt: string;
};

/** What this instance holds of the store's templates: the index version it pulled and each folder's files. */
type SyncState = { version: string | null; templates: Record<string, TemplateSyncEntry> };

/** A template the index names whose folder the store no longer holds (a delete whose index write was lost). */
class LostFolderError extends RangeError {
  readonly id: string;
  constructor(id: string, relative: string) {
    super(`${TEMPLATES_PREFIX}${id}/${relative} is not in the store`);
    this.name = 'LostFolderError';
    this.id = id;
  }
}

/** The wait before a push reads the index again after a lost race (times the attempt number). */
const PUSH_RETRY_MS = 300;

function isTemplateId(value: unknown): value is string {
  return typeof value === 'string' && SLUG_PATTERN.test(value) && value !== BLANK_TEMPLATE_ID;
}

function isFileMap(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([relative, version]) =>
      isSafeKey(relative) &&
      !relative.split('/').some((segment) => segment.startsWith('.')) &&
      typeof version === 'string' &&
      version !== '',
  );
}

/** The index as this module wrote it; null for anything else (a truncated put, another shape). */
export function parseTemplatesIndex(raw: unknown): TemplatesSyncIndex | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  if (row.v !== 1) return null;
  if (typeof row.templates !== 'object' || row.templates === null) return null;
  const templates: Record<string, TemplateSyncEntry> = {};
  for (const [id, entry] of Object.entries(row.templates as Record<string, unknown>)) {
    if (!isTemplateId(id)) continue;
    const files = (entry as { files?: unknown } | null)?.files;
    if (!isFileMap(files)) continue;
    templates[id] = { files };
  }
  const fallback = row.default;
  return {
    v: 1,
    templates,
    default: isTemplateId(fallback) ? fallback : null,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
  };
}

export function templatesIndexBytes(index: TemplatesSyncIndex): Uint8Array {
  return new TextEncoder().encode(canonicalJson(index));
}

function sameFiles(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

/** The files of a template folder, relative posix paths, the dot entries left out. */
export function templateFolderFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (folder: string, relative: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(join(folder, entry.name), rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out.sort();
}

/** The deployment default as the index carries it: the id, or null for blank. */
function localDefault(decksDir: string): string | null {
  const id = readDefaultTemplateId(decksDir);
  return id === BLANK_TEMPLATE_ID ? null : id;
}

function writeLocalDefault(decksDir: string, id: string | null): void {
  const root = templatesDir(decksDir);
  mkdirSync(root, { recursive: true });
  const file = join(root, DEFAULT_TEMPLATE_FILE);
  if (id === null) rmSync(file, { force: true });
  else writeFileSync(file, canonicalJson({ template: id }));
}

function writeAtomic(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, bytes);
  renameSync(partial, path);
}

export type BlobTemplatesOptions = {
  client: () => Promise<BlobClient>;
  decksDir: string;
  now?: () => string;
  log?: (line: string) => void;
};

/** The `templates` facet of the blob collection (hosted.ts `HostedTemplates`). */
export function blobTemplates(options: BlobTemplatesOptions): HostedTemplates {
  const { decksDir } = options;
  const log = options.log ?? (() => {});
  const now = options.now ?? (() => new Date().toISOString());
  const statePath = join(templatesDir(decksDir), STATE_DIR, 'sync.json');
  let state: SyncState | undefined;
  let pullInFlight: Promise<void> | undefined;
  /** the templates a pull found named by the index with their folders gone; the next push drops them */
  const lostFolders = new Set<string>();

  const loadState = (): SyncState => {
    if (state !== undefined) return state;
    state = { version: null, templates: {} };
    if (existsSync(statePath)) {
      try {
        const raw = JSON.parse(readFileSync(statePath, 'utf8')) as Partial<SyncState>;
        if (typeof raw.version === 'string') state.version = raw.version;
        if (typeof raw.templates === 'object' && raw.templates !== null) {
          for (const [id, entry] of Object.entries(raw.templates)) {
            if (isTemplateId(id) && isFileMap((entry as { files?: unknown }).files))
              state.templates[id] = { files: (entry as TemplateSyncEntry).files };
          }
        }
      } catch {
        // a half written state: the next pull reads the store again
      }
    }
    return state;
  };

  const saveState = (): void => {
    if (state === undefined) return;
    writeAtomic(statePath, new TextEncoder().encode(`${JSON.stringify(state, null, 2)}\n`));
  };

  /** The saved template folders on this instance: every record carrying the organisation flag. */
  const savedFolders = (): { id: string; dir: string }[] =>
    listTemplates(decksDir)
      .filter((template) => template.record.organisation === true)
      .filter((template) => isTemplateId(template.record.id))
      .map((template) => ({ id: template.record.id, dir: template.dir }));

  /** Puts one folder's files with overwrite and removes the store's extras; answers the versions. */
  const putFolder = async (c: BlobClient, id: string): Promise<Record<string, string>> => {
    const dir = join(templatesDir(decksDir), id);
    if (!existsSync(join(dir, 'template.json')))
      throw new RangeError(`No template ${id} under decks/templates on this instance`);
    const files = templateFolderFiles(dir);
    const versions: Record<string, string> = {};
    await eachLimit(files, 8, async (relative) => {
      const entry = await c.put(
        `${TEMPLATES_PREFIX}${id}/${relative}`,
        new Uint8Array(readFileSync(join(dir, ...relative.split('/')))),
        { overwrite: true, contentType: blobContentType(relative) },
      );
      versions[relative] = entry.version;
    });
    const stored = await c.list(`${TEMPLATES_PREFIX}${id}/`);
    const extra = stored
      .map((entry) => entry.pathname)
      .filter((pathname) => !(pathname.slice(`${TEMPLATES_PREFIX}${id}/`.length) in versions));
    if (extra.length > 0) await c.del(extra);
    return versions;
  };

  const deleteFolder = async (c: BlobClient, id: string): Promise<void> => {
    const stored = await c.list(`${TEMPLATES_PREFIX}${id}/`);
    if (stored.length > 0) await c.del(stored.map((entry) => entry.pathname));
  };

  /** Fetches one template's files into a dot folder and moves it into place. */
  const fetchFolder = async (
    c: BlobClient,
    id: string,
    entry: TemplateSyncEntry,
  ): Promise<void> => {
    const root = templatesDir(decksDir);
    const staging = join(root, `.${id}.pulling`);
    const dir = join(root, id);
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    await eachLimit(Object.entries(entry.files), 8, async ([relative, version]) => {
      // the index names each file's stored version: the read waits for the CDN copy carrying it
      const got = await c.get(`${TEMPLATES_PREFIX}${id}/${relative}`, { version });
      if (got === null) throw new LostFolderError(id, relative);
      writeAtomic(join(staging, ...relative.split('/')), got.bytes);
    });
    if (!existsSync(join(staging, 'template.json')))
      throw new RangeError(`${TEMPLATES_PREFIX}${id} holds no template.json`);
    rmSync(dir, { recursive: true, force: true });
    renameSync(staging, dir);
  };

  const pullOnce = async (): Promise<void> => {
    const c = await options.client();
    const current = loadState();
    const head = await c.head(TEMPLATES_INDEX_PATH);
    if (head === null) return;
    if (head.version === current.version) return;
    let fetched;
    try {
      // the body the head names, never the CDN's older copy (BlobCallOptions.version); a copy that
      // never catches up leaves this instance's mirror as it stands until the next pull
      fetched = await c.get(TEMPLATES_INDEX_PATH, { version: head.version });
    } catch (error) {
      if (!isBlobStaleReadError(error)) throw error;
      log(
        `blob: ${TEMPLATES_INDEX_PATH} still read an older copy after the CDN lag budget; the pull is skipped`,
      );
      return;
    }
    if (fetched === null) return;
    let parsed: TemplatesSyncIndex | null;
    try {
      parsed = parseTemplatesIndex(JSON.parse(new TextDecoder().decode(fetched.bytes)));
    } catch {
      parsed = null;
    }
    if (parsed === null) {
      log(`blob: ${TEMPLATES_INDEX_PATH} does not hold a templates index; the pull is skipped`);
      return;
    }
    const t = performance.now();
    let fetchedFolders = 0;
    for (const [id, entry] of Object.entries(parsed.templates)) {
      const known = current.templates[id];
      const present = existsSync(join(templatesDir(decksDir), id, 'template.json'));
      if (known !== undefined && present && sameFiles(known.files, entry.files)) continue;
      try {
        await fetchFolder(c, id, entry);
      } catch (error) {
        // the index names a folder the store no longer holds (a delete whose index write was
        // lost): the template is treated as deleted here, and this instance's next push drops it
        // from the index; the other templates and the default still land
        if (!(error instanceof LostFolderError)) throw error;
        log(`blob: ${error.message}; the template is left out until the index drops it`);
        lostFolders.add(id);
        delete parsed.templates[id];
        delete current.templates[id];
        continue;
      }
      lostFolders.delete(id);
      current.templates[id] = { files: { ...entry.files } };
      fetchedFolders += 1;
    }
    if (parsed.default !== null && !(parsed.default in parsed.templates)) parsed.default = null;
    let removed = 0;
    for (const folder of savedFolders()) {
      if (folder.id in parsed.templates) continue;
      // a seed template (the GT brand deck's record carries the organisation flag) is the
      // bundle's on every instance and comes back on every cold start: never removed here, and
      // a Replace of it travels through the index like a saved one
      if (isBuiltInTemplateId(folder.id)) continue;
      rmSync(folder.dir, { recursive: true, force: true });
      delete current.templates[folder.id];
      removed += 1;
    }
    for (const id of Object.keys(current.templates))
      if (!(id in parsed.templates)) delete current.templates[id];
    writeLocalDefault(decksDir, parsed.default);
    writeTemplateIndex(decksDir);
    current.version = fetched.entry.version;
    saveState();
    if (fetchedFolders > 0 || removed > 0)
      log(
        `blob: pulled ${fetchedFolders} template folder(s) and removed ${removed} in ${Math.round(performance.now() - t)} ms`,
      );
  };

  return {
    pull() {
      // one pull in flight per instance; a caller that arrives during one joins it
      pullInFlight ??= pullOnce()
        .catch((error: unknown) => {
          // a pull is a read into this instance's mirror, and a read the store refuses for now
          // is not a page's failure: the public store's edge answers "Failed to fetch blob: 403
          // Forbidden" on a just written pathname for a while (pulse.ts isStoreBusy; the product
          // round's ship step read /new, the editor and the gallery answering 500 for five
          // minutes after every index push on the enforce preview), a copy past the lag budget
          // (BlobStaleReadError, the index or a folder's file), a 429 or a network failure. The
          // mirror stands as it is, the line is logged, and the next pull reads the store again;
          // anything else is a defect and still throws
          if (!isStoreBusy(error) && !isBlobStaleReadError(error)) throw error;
          const message = error instanceof Error ? error.message : String(error);
          log(
            `blob: the templates pull is skipped, the store answered "${message}"; this instance's mirror stands until the next pull`,
          );
        })
        .finally(() => {
          pullInFlight = undefined;
        });
      return pullInFlight;
    },
    async push(change) {
      const c = await options.client();
      const current = loadState();
      const t = performance.now();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        // the index as the store holds it now: the head names the version and the body read waits
        // for the CDN copy carrying it, so `ifMatch` below holds against the copy that was read
        const storedHead = await c.head(TEMPLATES_INDEX_PATH);
        const stored =
          storedHead === null
            ? null
            : await c.get(TEMPLATES_INDEX_PATH, { version: storedHead.version });
        let index: TemplatesSyncIndex | null = null;
        if (stored !== null) {
          try {
            index = parseTemplatesIndex(JSON.parse(new TextDecoder().decode(stored.bytes)));
          } catch {
            index = null;
          }
        }
        index ??= { v: 1, templates: {}, default: null, updatedAt: now() };
        for (const id of lostFolders) delete index.templates[id];
        if (index.default !== null && !(index.default in index.templates)) index.default = null;
        let removeFolder: string | null = null;
        if (change !== undefined) {
          if (!isTemplateId(change.id))
            throw new TypeError(`${change.id} is not a saved template id`);
          if (change.removed === true) {
            // the index drops the template before its folder goes: an index write that fails
            // leaves the store consistent, where a folder deleted first left the index naming
            // files that were gone (the product round's ship step, the enforce preview)
            removeFolder = change.id;
            delete index.templates[change.id];
            delete current.templates[change.id];
          } else {
            const files = await putFolder(c, change.id);
            index.templates[change.id] = { files };
            current.templates[change.id] = { files: { ...files } };
          }
        }
        index.default = localDefault(decksDir);
        index.updatedAt = now();
        try {
          const entry = await c.put(TEMPLATES_INDEX_PATH, templatesIndexBytes(index), {
            overwrite: true,
            contentType: 'application/json',
            ...(stored === null ? {} : { ifMatch: stored.entry.version }),
          });
          // the index this instance wrote counts as pulled only when every folder it names is
          // here at the stamp it names; a template another instance saved in between is fetched
          // by the next pull, which reads the index body again (blob-templates.test.ts, the
          // two saves that meet)
          const complete = Object.entries(index.templates).every(
            ([id, row]) =>
              current.templates[id] !== undefined &&
              sameFiles(current.templates[id].files, row.files) &&
              existsSync(join(templatesDir(decksDir), id, 'template.json')),
          );
          current.version = complete ? entry.version : null;
          saveState();
          lostFolders.clear();
          if (removeFolder !== null) await deleteFolder(c, removeFolder);
          log(
            `blob: pushed the templates index${change === undefined ? '' : ` for ${change.id}`} in ${Math.round(performance.now() - t)} ms`,
          );
          return;
        } catch (error) {
          // another instance wrote the index between the read and the put: read it again and
          // fold this write into it, as the fresh deck index does (blob-store.ts noteFreshDeck)
          if (attempt === 2 || !isBlobPreconditionError(error)) throw error;
          await new Promise((resolve) => setTimeout(resolve, PUSH_RETRY_MS * (attempt + 1)));
        }
      }
    },
  };
}
