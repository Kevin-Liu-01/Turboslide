// `turboslide deck pack`, `deck unpack`, `deck push` and `deck pull` (docs/deck-transfer.md): pack
// writes the bundle and unpack recreates the deck byte for byte; a bundle with a bad slide is
// refused with exit 2 and nothing written; push and pull talk to the two hosted routes (a small
// http server stands in for the studio here; apps/cli/e2e/deck-transfer.mjs drives the real one)
// with the bearer token, which --token saves under TURBOSLIDE_CONFIG_DIR/hosts.json (mode 0600)
// and the next call reads back; a 401 names the token flag and the file.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { packDeckDir } from '@turboslide/store/pack';
import { unpackBundle } from '@turboslide/store/unpack';

import { runCli } from '../cli.ts';
import { readHosts, resolveToken, saveHostToken } from '../hosts.ts';

type Run = { code: number; stdout: string; stderr: string };

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]);
const TOKEN = 'test-token-0123456789abcdef';

let root: string;
let configDir: string;

async function run(argv: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<Run> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(argv, {
    cwd,
    env: { USER: 'tester', TURBOSLIDE_CONFIG_DIR: configDir, ...extraEnv },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  return { code, stdout, stderr };
}

function writeDeck(decksDir: string, deckId: string): string {
  const dir = join(decksDir, deckId);
  mkdirSync(join(dir, 'slides'), { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'deck.json'), canonicalJson({ ...WORKED_DECK, id: deckId }));
  for (const slide of WORKED_SLIDES) {
    writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
  }
  for (const asset of Object.values(WORKED_DECK.assets)) {
    for (const twin of Object.values(asset.twins)) {
      writeFileSync(join(dir, twin), twin.endsWith('.jpg') ? JPEG : PNG);
    }
  }
  return dir;
}

function snapshot(dir: string, relative = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = relative === '' ? entry.name : posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of snapshot(join(dir, entry.name), rel)) out.set(key, value);
    } else {
      out.set(rel, readFileSync(join(dir, entry.name)).toString('base64'));
    }
  }
  return out;
}

/** A stand-in studio: the two bundle routes over a decks folder, behind the bearer token. */
function fakeStudio(
  decksDir: string,
): Promise<{ url: string; close: () => Promise<void>; seen: string[] }> {
  const seen: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    seen.push(`${request.method} ${url.pathname}${url.search}`);
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      json(401, { error: { message: 'bearer token required', status: 401, code: 'unauthorized' } });
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      void (async () => {
        const body = new Uint8Array(Buffer.concat(chunks));
        if (request.method === 'POST' && url.pathname === '/api/decks/bundle') {
          if (request.headers['content-type'] === 'application/json') {
            json(400, {
              error: {
                message: `no bundle at ${JSON.stringify(JSON.parse(Buffer.from(body).toString()))}`,
                status: 400,
              },
            });
            return;
          }
          try {
            const as = url.searchParams.get('as') ?? undefined;
            const result = await unpackBundle(body, {
              decksDir,
              ...(as !== undefined ? { as } : {}),
              replace: url.searchParams.get('replace') === '1',
            });
            json(result.replaced ? 200 : 201, { ...result, editUrl: `/edit/${result.deckId}` });
          } catch (error) {
            json(400, {
              error: {
                message: error instanceof Error ? error.message : String(error),
                status: 400,
              },
            });
          }
          return;
        }
        const match = /^\/api\/decks\/([a-z0-9-]+)\/bundle$/.exec(url.pathname);
        if (request.method === 'GET' && match !== null) {
          const dir = join(decksDir, match[1] ?? '');
          if (!existsSync(join(dir, 'deck.json'))) {
            json(404, { error: { message: `no deck ${match[1]}`, status: 404 } });
            return;
          }
          const packed = packDeckDir(dir);
          response.writeHead(200, {
            'content-type': 'application/zip',
            'content-length': String(packed.zip.byteLength),
          });
          response.end(Buffer.from(packed.zip));
          return;
        }
        json(404, { error: { message: 'no route', status: 404 } });
      })();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        seen,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe('turboslide deck pack, unpack, push and pull', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-transfer-'));
    configDir = join(root, 'config');
    mkdirSync(join(root, 'decks'), { recursive: true });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('pack writes the bundle and unpack recreates the deck byte for byte', async () => {
    const dir = writeDeck(join(root, 'decks'), 'worked');
    const packed = await run(['deck', 'pack', 'worked', '--out', 'out/worked.zip', '--json'], root);
    expect(packed.code, packed.stderr).toBe(0);
    const result = JSON.parse(packed.stdout) as {
      deckId: string;
      out: string;
      bytes: number;
      counts: { assets: number };
    };
    expect(result.deckId).toBe('worked');
    expect(result.out).toBe(join(root, 'out', 'worked.zip'));
    expect(statSync(result.out).size).toBe(result.bytes);
    expect(result.counts.assets).toBe(Object.keys(WORKED_DECK.assets).length * 2);

    const unpacked = await run(
      ['deck', 'unpack', 'out/worked.zip', '--as', 'worked-copy', '--json'],
      root,
    );
    expect(unpacked.code, unpacked.stderr).toBe(0);
    const created = JSON.parse(unpacked.stdout) as {
      deckId: string;
      renamed: boolean;
      replaced: boolean;
      dir: string;
    };
    expect(created).toMatchObject({ deckId: 'worked-copy', renamed: true, replaced: false });
    const before = snapshot(dir);
    const after = snapshot(created.dir);
    before.delete('deck.json');
    after.delete('deck.json');
    expect(after).toEqual(before);
    const manifest = JSON.parse(readFileSync(join(created.dir, 'deck.json'), 'utf8')) as {
      id: string;
    };
    expect(manifest.id).toBe('worked-copy');

    // the same id again without --as: a free sibling; with --replace on the copy: replaced
    const sibling = await run(['deck', 'unpack', 'out/worked.zip', '--json'], root);
    expect(JSON.parse(sibling.stdout)).toMatchObject({ deckId: 'worked-2', renamed: true });
    const replaced = await run(
      ['deck', 'unpack', 'out/worked.zip', '--as', 'worked-copy', '--replace', '--json'],
      root,
    );
    expect(JSON.parse(replaced.stdout)).toMatchObject({ deckId: 'worked-copy', replaced: true });
    const taken = await run(['deck', 'unpack', 'out/worked.zip', '--as', 'worked-copy'], root);
    expect(taken.code).toBe(2);
    expect(taken.stderr).toMatch(/exists already/);
  });

  test('unpack refuses a bundle with a bad slide and writes nothing', async () => {
    const dir = writeDeck(join(root, 'decks'), 'broken');
    writeFileSync(
      join(dir, 'slides', 'content-rule.json'),
      '{ "schemaVersion": 1, "id": "content-rule", "kind": "content" }\n',
    );
    const packed = await run(['deck', 'pack', 'broken', '--out', 'out/broken.zip'], root);
    expect(packed.code).toBe(0);
    const unpacked = await run(['deck', 'unpack', 'out/broken.zip', '--as', 'broken-copy'], root);
    expect(unpacked.code).toBe(2);
    expect(unpacked.stderr).toMatch(/does not validate/);
    expect(existsSync(join(root, 'decks', 'broken-copy'))).toBe(false);
    const missing = await run(['deck', 'unpack', 'out/nothing.zip'], root);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toMatch(/no bundle at/);
  });

  test('push uploads through the route with the token, which --token saves for pull to read back', async () => {
    const remoteDecks = join(root, 'remote');
    mkdirSync(remoteDecks, { recursive: true });
    const studio = await fakeStudio(remoteDecks);
    try {
      const refused = await run(['deck', 'push', 'worked', '--to', studio.url], root);
      expect(refused.code).toBe(2);
      expect(refused.stderr).toMatch(/--token/);
      expect(refused.stderr).toMatch(/hosts\.json/);

      const pushed = await run(
        ['deck', 'push', 'worked', '--to', studio.url, '--token', TOKEN, '--json'],
        root,
      );
      expect(pushed.code, pushed.stderr).toBe(0);
      const result = JSON.parse(pushed.stdout) as {
        deckId: string;
        url: string;
        replaced: boolean;
      };
      expect(result.deckId).toBe('worked');
      expect(result.url).toBe(`${studio.url}/edit/worked`);
      expect(existsSync(join(remoteDecks, 'worked', 'deck.json'))).toBe(true);
      expect(pushed.stderr).toMatch(/saved to/);
      expect(pushed.stderr).not.toContain(TOKEN);
      const hostsFile = join(configDir, 'hosts.json');
      expect(statSync(hostsFile).mode & 0o777).toBe(0o600);
      expect(readHosts({ TURBOSLIDE_CONFIG_DIR: configDir }).hosts[studio.url]?.token).toBe(TOKEN);

      // the saved token carries the next calls; --as and --replace reach the route as query params
      const again = await run(
        [
          'deck',
          'push',
          'worked',
          '--to',
          studio.url,
          '--as',
          'worked-remote',
          '--replace',
          '--json',
        ],
        root,
      );
      expect(again.code, again.stderr).toBe(0);
      expect(JSON.parse(again.stdout)).toMatchObject({ deckId: 'worked-remote', renamed: true });
      expect(studio.seen.at(-1)).toBe('POST /api/decks/bundle?as=worked-remote&replace=1');

      // --from-url posts the URL instead of the bytes
      const fromUrl = await run(
        [
          'deck',
          'push',
          'worked',
          '--to',
          studio.url,
          '--from-url',
          'https://store.public.blob.vercel-storage.com/x.zip',
        ],
        root,
      );
      expect(fromUrl.code).toBe(2);
      expect(fromUrl.stderr).toMatch(/no bundle at .*x\.zip/);

      const pulled = await run(
        ['deck', 'pull', 'worked-remote', '--from', studio.url, '--as', 'pulled', '--json'],
        root,
      );
      expect(pulled.code, pulled.stderr).toBe(0);
      const local = JSON.parse(pulled.stdout) as {
        deckId: string;
        sourceDeckId: string;
        dir: string;
      };
      expect(local).toMatchObject({ deckId: 'pulled', sourceDeckId: 'worked-remote' });
      const before = snapshot(join(root, 'decks', 'worked'));
      const after = snapshot(local.dir);
      before.delete('deck.json');
      after.delete('deck.json');
      expect(after).toEqual(before);

      const gone = await run(['deck', 'pull', 'nope', '--from', studio.url], root);
      expect(gone.code).toBe(2);
      expect(gone.stderr).toMatch(/answered 404: no deck nope/);
    } finally {
      await studio.close();
    }
  });

  test('the hosts file resolves a token by origin and never outranks the flag or the environment', () => {
    const env = { TURBOSLIDE_CONFIG_DIR: configDir };
    saveHostToken('https://Example.com/some/path', 'saved', env, () => '2026-09-11T00:00:00.000Z');
    expect(readHosts(env).hosts['https://example.com']).toEqual({
      token: 'saved',
      savedAt: '2026-09-11T00:00:00.000Z',
    });
    expect(resolveToken('https://example.com', undefined, env)).toEqual({
      token: 'saved',
      source: 'hosts',
    });
    expect(resolveToken('https://example.com', 'flag', env)).toEqual({
      token: 'flag',
      source: 'flag',
    });
    expect(
      resolveToken('https://example.com', undefined, { ...env, TURBOSLIDE_TOKEN: 'env' }),
    ).toEqual({ token: 'env', source: 'env' });
    expect(resolveToken('https://other.example', undefined, env)).toEqual({
      token: undefined,
      source: 'none',
    });
    expect(() => saveHostToken('not a url', 'x', env)).toThrow(/not a URL/);
    expect(() => saveHostToken('ftp://example.com', 'x', env)).toThrow(/http or https/);
  });
});
