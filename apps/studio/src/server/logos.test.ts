import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createDispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext } from '@turboslide/agent/dispatch';
import { LOGO_WORDS, chooseVariant, rankLogos } from '@turboslide/chrome/logo-model';
import type { LogoRow } from '@turboslide/chrome/logo-model';
import type { Asset } from '@turboslide/schema/assets';
import { assetSchema } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import { grammarRecordOf, toCanvas } from '@turboslide/schema/canvas';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { FREEFORM_SLIDE, TITLE, WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import { openFileStore, slidePath } from '@turboslide/store/file-store';

import {
  FIXTURE_DROPPED_SLUG,
  FIXTURE_ICONS,
  FIXTURE_MISSING_PATH,
} from './logo-fixtures/manifest';
import { FIXTURE_MARKS } from './logo-fixtures/marks';
import {
  LOGO_DISCOVERIES_PATH,
  LOGO_DOWN_MESSAGE,
  LOGO_INDEX_PATH,
  LOGO_MARKS_PREFIX,
  blobLogoStore,
  downUpstream,
  emptyLogoIndex,
  fixtureUpstream,
  litFraction,
  measureRow,
  memoryLogoStore,
  mergeLogoRows,
  readsFlagsOf,
  refreshLogoIndex,
  rowOfIcon,
  rowsOfManifest,
  sharpRasterizer,
  wantsFlags,
} from './logo-index';
import type { LogoIndex, LogoUpstream, Rasterizer, UpstreamAnswer } from './logo-index';
import {
  LOGO_MAX_BYTES,
  LogoBrokenError,
  LogoTooLargeError,
  attributionOf,
  descOf,
  isDataImageHref,
  sanitizeLogoSvg,
  tintLogoSvg,
  urlsAreLocal,
  withAttribution,
} from './logo-sanitize';
import {
  INDEX_REVALIDATE_MS,
  LOGO_STORE_BUSY_MESSAGE,
  LOGO_STORE_RETRY_AFTER_S,
  LogoStoreBusyError,
  SNAPSHOT_REVALIDATE_MS,
  createLogoService,
  kitLogoMutations,
  logoInsert,
  logoPlacementOn,
  rasterizeLogoPng,
  refreshCredential,
  registerLogoActions,
} from './logos';

// The logo picker's server (docs/FEATURES.md 7.3, the B6 test in apps/studio): the sanitizer's
// fixtures, one per rule of 4.7; the index builder over the ten mark fixture upstream (the variant
// paths read from the manifest alone, a 404 marked unavailable, a dropped slug taken down with its
// cached file, a failed upstream keeping the previous file with `lastError`, the budget stop with
// `progress` and the resume); the refresh credentials; the dry run; the cache rule (a CC0 mark
// written to the store, a CC BY-ND mark never); the mono tint over explicit fills; the search
// ranking; the insert as a stored asset with its `logo` source, the block at the logo size, the
// kit's slots, the untinted CC BY-ND file and the gradient mono that is not offered. Nothing here
// reaches the network: the upstream is the fixture or a table.

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-logos-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const NOW = new Date('2026-09-22T06:00:00.000Z');
const author: ActionContext['author'] = { kind: 'agent', name: 'test', runId: 'r1' };
const ctx: ActionContext = { author };

/** A raster the tests do not measure: every pixel opaque grey, so both grounds read. */
const fakeRasterizer: Rasterizer = async (_svg, size) => {
  const height = size.height ?? 96;
  const width = size.width ?? height;
  const data = new Uint8Array(width * height * 4).fill(128);
  return { data, width, height };
};

/** A PNG stand in of the size asked for: the eight magic bytes and the size, for the file store. */
const fakePng = async (_svg: string, size: [number, number]) => ({
  png: new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    size[0] & 255,
    size[1] & 255,
    1,
    2,
    3,
  ]),
  width: size[0],
  height: size[1],
});

function svgOf(path: string): string {
  const text = FIXTURE_MARKS[path];
  if (text === undefined) throw new Error(`no fixture ${path}`);
  return text;
}

// ---------------------------------------------------------------------------------------------
// The sanitizer (4.7)

describe('the sanitizer (4.7)', () => {
  it('removes script, foreignObject, an onload attribute, an image and an external href, and records the drops', () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" onload="alert(1)">
      <script>alert(2)</script>
      <foreignObject width="10" height="10"><div>hi</div></foreignObject>
      <image href="https://evil.example/x.png" width="4" height="4"/>
      <a href="https://evil.example"><path d="M0 0h4v4z" fill="#000"/></a>
      <use xlink:href="https://evil.example/defs.svg#a"/>
      <use xlink:href="#local"/>
      <path d="M0 0h1v1z" fill="#111" onclick="alert(3)"/>
    </svg>`;
    const out = sanitizeLogoSvg(hostile);
    expect(out.svg).not.toMatch(/<script|<foreignObject|<image|<a\b|onload|onclick|evil\.example/);
    expect(out.svg).toContain('xlink:href="#local"');
    expect(out.svg).not.toMatch(/<use xlink:href="https/);
    expect(out.removed).toEqual(['script', 'foreignObject', 'image', 'a']);
    /* the image, the foreignObject and the link's path drew, so the look changed */
    expect(out.draws).toBe(true);
    const quiet = sanitizeLogoSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>1</script><metadata>x</metadata><path d="M0 0h1v1z"/></svg>',
    );
    expect(quiet.removed).toEqual(['script', 'metadata']);
    expect(quiet.draws).toBe(false);
  });

  it('keeps a filter with feGaussianBlur and a pattern, and sharp renders them from a buffer with no base URL', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><filter id="f"><feGaussianBlur stdDeviation="2"/></filter><pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#000"/></pattern></defs><rect x="8" y="8" width="48" height="48" fill="url(#p)" filter="url(#f)"/></svg>`;
    const out = sanitizeLogoSvg(svg);
    expect(out.removed).toEqual([]);
    expect(out.svg).toContain('<filter id="f"><feGaussianBlur stdDeviation="2"/></filter>');
    expect(out.svg).toContain('<pattern id="p"');
    expect(out.svg).toContain('fill="url(#p)" filter="url(#f)"');
    const raster = await sharpRasterizer()(out.svg, { height: 96 });
    expect(raster).not.toBeNull();
    expect(litFraction(raster as NonNullable<typeof raster>, 255)).toBeGreaterThan(0.01);
  });

  it('drops a text element with its subtree and marks the variant unavailable through the refresh', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M0 0h8v8z" fill="#000"/><text x="2" y="20">Acme<tspan>Corp</tspan></text></svg>`;
    const out = sanitizeLogoSvg(svg);
    expect(out.svg).not.toMatch(/<text|<tspan|Acme/);
    expect(out.removed).toEqual(['text']);
    expect(out.draws).toBe(true);
    const row = rowOfIcon({
      slug: 'texty',
      title: 'Texty',
      variants: { default: '/icons/texty/default.svg' },
      collection: 'brands',
    }) as LogoRow;
    const upstream: LogoUpstream = {
      mode: 'fixture',
      manifest: async () => ({ ok: true, bytes: new Uint8Array(), contentType: null, url: '' }),
      mark: async () => ({
        ok: true,
        bytes: new TextEncoder().encode(svg),
        contentType: 'image/svg+xml',
        url: '',
      }),
    };
    const verdict = await measureRow(row, {
      upstream,
      rasterize: fakeRasterizer,
      sanitize: (bytes) => sanitizeLogoSvg(bytes),
      now: () => NOW,
    });
    expect(verdict).toBe('unavailable');
    expect(row.unavailable?.default).toEqual({ at: NOW.toISOString(), reason: 'sanitized' });
    expect(row.readsOnPaper).toBeUndefined();
  });

  it('removes a style that reaches out whole and keeps a local url(#) reference', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><defs><linearGradient id="g1"><stop offset="0" stop-color="#000"/></linearGradient></defs><rect width="8" height="8" fill="url(#g1)" style="fill:url(http://evil.example/x.svg#g);stroke:#000"/><rect width="4" height="4" style="fill:#c8102e;stroke:url(#g1)" clip-path="url(  'http://evil.example/c.svg#c' )"/></svg>`;
    const out = sanitizeLogoSvg(svg);
    expect(out.svg).toContain('fill="url(#g1)"');
    expect(out.svg).not.toContain('evil.example');
    expect(out.svg).toContain('style="fill:#c8102e;stroke:url(#g1)"');
    expect(out.svg).not.toContain('clip-path=');
    expect(urlsAreLocal('url(#a) url( "#b" )')).toBe(true);
    expect(urlsAreLocal('url(#a) url(http://x)')).toBe(false);
    expect(urlsAreLocal('url(data:image/svg+xml;base64,AAAA)')).toBe(false);
    expect(urlsAreLocal('#plain')).toBe(true);
    /* a stylesheet that imports leaves; one that draws stays */
    const imported = sanitizeLogoSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><style>@import url(http://evil.example/a.css);</style><path d="M0 0h1v1z"/></svg>',
    );
    expect(imported.svg).not.toContain('<style');
    expect(imported.removed).toEqual(['style']);
    const styled = sanitizeLogoSvg(svgOf('/icons/acme/default.svg'));
    expect(styled.svg).toContain('<style>.a{fill:#c8102e}.b{fill:#1d1d1b}</style>');
    expect(styled.removed).toEqual([]);
  });

  it('refuses a 300 KB file before parsing with the sentence naming the cap, and a broken XML with the seller’s sentence', () => {
    const big = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="${'M0 0h1v1z'.repeat(40_000)}"/></svg>`;
    expect(new TextEncoder().encode(big).byteLength).toBeGreaterThan(300 * 1024);
    let caught: unknown;
    try {
      sanitizeLogoSvg(big);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LogoTooLargeError);
    expect((caught as Error).message).toBe(LOGO_WORDS.tooLarge(LOGO_MAX_BYTES));
    expect((caught as Error).message).toContain('256 KB');
    for (const broken of [
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="#000"/>',
      '<svg viewBox="0 0 8 8"><path d="M0 0h1v1z" fill=#000/></svg>',
      '<svg viewBox="0 0 8 8"><title>A & B</title></svg>',
      '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 8 8">&xxe;</svg>',
      '<html><svg viewBox="0 0 8 8"/></html>',
      'not xml at all',
      '<svg><path d="M0 0h1v1z"/></svg>',
    ]) {
      let error: unknown;
      try {
        sanitizeLogoSvg(broken);
      } catch (e) {
        error = e;
      }
      expect(error, broken).toBeInstanceOf(LogoBrokenError);
      expect((error as Error).message).toBe(LOGO_WORDS.broken);
      expect((error as Error).message).toBe('This logo’s file is broken on thesvg.org');
    }
  });

  it('keeps an image whose href is a raster data URI and drops every other image (docs/VECTOR.md 4.2)', () => {
    /* a 1 by 1 PNG, the way Figma's Copy as SVG embeds a raster fill */
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const kept = sanitizeLogoSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 8 8"><image href="${png}" width="8" height="8"/><rect width="2" height="2" fill="#000"/></svg>`,
    );
    expect(kept.svg).toContain('<image href="data:image/png;base64,iVBORw0KGgo');
    expect(kept.svg).toContain('width="8" height="8"');
    expect(kept.removed).toEqual([]);
    expect(kept.draws).toBe(false);
    /* the xlink form too, and a jpeg, gif or webp URI */
    const xlink = sanitizeLogoSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 8 8"><image xlink:href="data:image/jpeg;base64,/9j/4AAQ" width="8" height="8"/></svg>`,
    );
    expect(xlink.svg).toContain('xlink:href="data:image/jpeg;base64,/9j/4AAQ"');
    expect(xlink.removed).toEqual([]);
    expect(isDataImageHref('data:image/gif;base64,R0lGOD')).toBe(true);
    expect(isDataImageHref('data:image/webp;base64,UklGR')).toBe(true);
    /* an https href, a data URI of another type (svg included) and no href at all: dropped and named as a draw */
    for (const href of [
      'https://evil.example/x.png',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:text/html;base64,PGh0bWw+',
      'data:image/png,%89PNG',
      'javascript:alert(1)',
    ]) {
      const dropped = sanitizeLogoSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><image href="${href}" width="8" height="8"/><rect width="2" height="2"/></svg>`,
      );
      expect(dropped.svg, href).not.toContain('<image');
      expect(dropped.removed, href).toEqual(['image']);
      expect(dropped.draws, href).toBe(true);
      expect(isDataImageHref(href), href).toBe(false);
    }
    const bare = sanitizeLogoSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><image width="8" height="8"/></svg>',
    );
    expect(bare.svg).not.toContain('<image');
    expect(bare.removed).toEqual(['image']);
  });

  it('runs under the caller’s cap with the caller’s words: the upload’s 2 MB and its two sentences', () => {
    const words = {
      tooLarge: (cap: number) => `The SVG file is over ${Math.round(cap / (1024 * 1024))} MB`,
      broken: 'This SVG file could not be read',
    };
    const cap = 2 * 1024 * 1024;
    const big = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="${'M0 0h1v1z'.repeat(240_000)}"/></svg>`;
    expect(new TextEncoder().encode(big).byteLength).toBeGreaterThan(cap);
    let caught: unknown;
    try {
      sanitizeLogoSvg(big, { maxBytes: cap, words });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LogoTooLargeError);
    expect((caught as Error).message).toBe('The SVG file is over 2 MB');
    expect((caught as LogoTooLargeError).capBytes).toBe(cap);
    /* the same file is under the upload's cap and over the picker's: the picker's sentence stands there */
    const mid = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="${'M0 0h1v1z'.repeat(40_000)}"/></svg>`;
    expect(sanitizeLogoSvg(mid, { maxBytes: cap, words }).size).toEqual([8, 8]);
    expect(() => sanitizeLogoSvg(mid)).toThrow(LOGO_WORDS.tooLarge(LOGO_MAX_BYTES));
    /* a broken file answers the caller's sentence from the parser and from the walk alike */
    for (const broken of [
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="#000"/>',
      'not xml at all',
      '<html><svg viewBox="0 0 8 8"/></html>',
      '<svg><path d="M0 0h1v1z"/></svg>',
    ]) {
      let error: unknown;
      try {
        sanitizeLogoSvg(broken, { maxBytes: cap, words });
      } catch (e) {
        error = e;
      }
      expect(error, broken).toBeInstanceOf(LogoBrokenError);
      expect((error as Error).message, broken).toBe('This SVG file could not be read');
    }
    /* without options the picker's words and cap stand, byte for byte */
    expect(() => sanitizeLogoSvg('not xml at all')).toThrow(LOGO_WORDS.broken);
  });

  it('adds a viewBox from width and height, and the attribution desc to a cached file', () => {
    const out = sanitizeLogoSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="54px" height="80"><path d="M0 0h1v1z"/></svg>',
    );
    expect(out.svg).toContain('viewBox="0 0 54 80"');
    expect(out.size).toEqual([54, 80]);
    const cached = withAttribution(out.svg, 'Figma', 'CC0-1.0');
    expect(descOf(cached)).toBe(
      'Figma logo, from thesvg.org under CC0-1.0; the mark belongs to its owner',
    );
    expect(attributionOf('Figma', 'CC0-1.0')).toBe(descOf(cached));
    /* the desc sits first and replaces an older one */
    expect(cached.indexOf('<desc>')).toBeLessThan(cached.indexOf('<path'));
    expect(descOf(withAttribution(cached, 'Figma', 'MIT'))).toContain('under MIT');
    expect((cached.match(/<desc>/g) ?? []).length).toBe(1);
    /* the real marks pass unchanged in what they draw */
    for (const [path, text] of Object.entries(FIXTURE_MARKS)) {
      const real = sanitizeLogoSvg(text);
      expect(real.draws, path).toBe(false);
      expect(real.svg.startsWith('<svg'), path).toBe(true);
    }
  });

  it('tints every fill and stroke that is not none, in attributes, style attributes and stylesheets, and the root', () => {
    const svg = sanitizeLogoSvg(svgOf('/icons/acme/mono.svg')).svg;
    const tinted = tintLogoSvg(svg, '#f2f2f0');
    expect(tinted).not.toMatch(/#000\b|#000000/);
    expect((tinted.match(/fill="#f2f2f0"/g) ?? []).length).toBe(3);
    expect(tinted).toContain('stroke="#f2f2f0"');
    expect(tinted).toContain('style="fill:#f2f2f0;stroke:none"');
    const styled = tintLogoSvg(sanitizeLogoSvg(svgOf('/icons/acme/default.svg')).svg, '#0b3d91');
    expect(styled).toContain('<style>.a{fill:#0b3d91}.b{fill:#0b3d91}</style>');
    expect(styled).toContain('fill="#0b3d91"');
    expect(styled).not.toContain('#1d1d1b');
    const inherited = tintLogoSvg(sanitizeLogoSvg(svgOf('/icons/vercel/mono.svg')).svg, '#0b3d91');
    expect(inherited).toMatch(/^<svg[^>]* fill="#0b3d91"/);
    const noneKept = tintLogoSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path fill="none" stroke="currentColor" d="M0 0h1"/></svg>',
      '#111111',
    );
    expect(noneKept).toContain('fill="none"');
    expect(noneKept).toContain('stroke="#111111"');
  });
});

// ---------------------------------------------------------------------------------------------
// The index (4.2)

describe('the index rows', () => {
  it('reads variant paths from icons.json alone and never composes one from a key', () => {
    const row = rowOfIcon({
      slug: 'openai',
      title: 'OpenAI',
      variants: {
        default: '/icons/openai/default.svg',
        wordmarkLight: '/icons/openai/wordmark-light.svg',
        odd: 'wordmarkLight.svg',
      },
      license: 'MIT',
      url: 'https://openai.com/',
      collection: 'brands',
      dateAdded: '2026-03-07',
    });
    expect(row?.variants).toEqual({
      default: '/icons/openai/default.svg',
      wordmarkLight: '/icons/openai/wordmark-light.svg',
    });
    expect(row?.variants.wordmarkLight).not.toContain('wordmarkLight');
    /* registry.json's shape (keys as a list, no paths) is no index */
    expect(
      rowOfIcon({ slug: 'openai', title: 'OpenAI', variants: ['default', 'wordmarkLight'] }),
    ).toBeNull();
    expect(
      rowOfIcon({ slug: 'Bad Slug', title: 'x', variants: { default: '/icons/x/default.svg' } }),
    ).toBeNull();
    expect(rowsOfManifest(FIXTURE_ICONS)).toHaveLength(10);
    expect(rowsOfManifest({ icons: FIXTURE_ICONS.slice(0, 2) })).toHaveLength(2);
    expect(() => rowsOfManifest({ total: 1 })).toThrow(TypeError);
  });

  it('merges the upstream rows over the previous index, keeping flags while the default path stands', () => {
    const previous = rowsOfManifest(FIXTURE_ICONS);
    (previous[0] as LogoRow).readsOnPaper = true;
    (previous[0] as LogoRow).readsOnInk = false;
    (previous[1] as LogoRow).unavailable = {
      dark: { at: NOW.toISOString(), status: 404, reason: 'missing' },
    };
    const upstream = rowsOfManifest(FIXTURE_ICONS.filter((icon) => icon.slug !== 'stripe'));
    (upstream[1] as LogoRow).variants = {
      ...(upstream[1] as LogoRow).variants,
      dark: '/icons/vercel/dark-2.svg',
    };
    const merged = mergeLogoRows(previous, upstream);
    expect(merged.dropped).toEqual(['stripe']);
    expect(merged.rows[0]?.readsOnPaper).toBe(true);
    expect(merged.rows[0]?.readsOnInk).toBe(false);
    /* the unavailable mark of a variant whose path moved is forgotten */
    expect(merged.rows[1]?.unavailable).toBeUndefined();
    expect(wantsFlags(merged.rows[0] as LogoRow, NOW.getTime())).toBe(false);
    expect(wantsFlags(merged.rows[1] as LogoRow, NOW.getTime())).toBe(true);
    const aws = merged.rows.find((row) => row.slug === 'aws-amazon-ec2') as LogoRow;
    expect(wantsFlags(aws, NOW.getTime())).toBe(false);
  });

  it('measures the two reads flags with the audit’s rule: the white Vercel triangle reads on ink alone', async () => {
    const rasterize = sharpRasterizer();
    const vercel = await readsFlagsOf(
      sanitizeLogoSvg(svgOf('/icons/vercel/default.svg')).svg,
      rasterize,
    );
    expect(vercel).toEqual({ readsOnPaper: false, readsOnInk: true });
    const figma = await readsFlagsOf(
      sanitizeLogoSvg(svgOf('/icons/figma/default.svg')).svg,
      rasterize,
    );
    expect(figma).toEqual({ readsOnPaper: true, readsOnInk: true });
    const anthropic = await readsFlagsOf(
      sanitizeLogoSvg(svgOf('/icons/anthropic/default.svg')).svg,
      rasterize,
    );
    expect(anthropic?.readsOnPaper).toBe(false);
  });
});

describe('the refresh (4.2, 4.9)', () => {
  it('builds the ten mark fixture, marks a 404 unavailable when the variant is asked for, and takes a dropped slug down with its cached file', async () => {
    const store = memoryLogoStore();
    let known: LogoIndex | null = null;
    const upstream = fixtureUpstream(() => known);
    const first = await refreshLogoIndex({
      store,
      upstream,
      rasterize: fakeRasterizer,
      now: () => NOW,
    });
    expect(first.icons).toBe(10);
    expect(first.brands).toBe(9);
    expect(first.fetched).toBe(9);
    expect(first.updatedAt).toBe(NOW.toISOString());
    expect(first.progress).toBeUndefined();
    expect(first.dropped).toEqual([]);
    known = await store.readIndex();
    expect(known?.icons.find((row) => row.slug === 'figma')?.readsOnPaper).toBe(true);
    /* the variant answering 404 is discovered when it is fetched, never composed from a key */
    const service = createLogoService({
      store,
      upstream,
      rasterize: fakeRasterizer,
      now: () => NOW,
    });
    const missing = await service.mark('acme', 'wordmark');
    expect(missing).toEqual({
      ok: false,
      status: 404,
      message: LOGO_WORDS.noVariant('Acme', 'wordmark'),
    });
    expect((await service.row('acme'))?.unavailable?.wordmark).toEqual({
      at: NOW.toISOString(),
      status: 404,
      reason: 'missing',
    });
    expect(FIXTURE_ICONS.find((icon) => icon.slug === 'acme')?.variants.wordmark).toBe(
      FIXTURE_MISSING_PATH,
    );
    /* the cached CC0 mark of the slug the fixture drops at the second refresh */
    const northwind = await service.mark(FIXTURE_DROPPED_SLUG, 'default');
    expect(northwind.ok).toBe(true);
    expect(store.marks.has(`${FIXTURE_DROPPED_SLUG}/default`)).toBe(true);
    expect((await service.index()).cached[`${FIXTURE_DROPPED_SLUG}/default`]).toBeDefined();
    known = await service.index();
    const second = await service.refresh();
    expect(second.dropped).toEqual([FIXTURE_DROPPED_SLUG]);
    expect(second.icons).toBe(9);
    expect(store.marks.has(`${FIXTURE_DROPPED_SLUG}/default`)).toBe(false);
    const after = await service.index();
    expect(after.icons.some((row) => row.slug === FIXTURE_DROPPED_SLUG)).toBe(false);
    expect(after.cached[`${FIXTURE_DROPPED_SLUG}/default`]).toBeUndefined();
    /* the unavailable mark survives the refresh while its path is the same */
    expect(after.icons.find((row) => row.slug === 'acme')?.unavailable?.wordmark?.status).toBe(404);
    expect((await service.search('acme')).logos[0]?.slug).toBe('acme');
  });

  it('keeps the previous file and records lastError when the upstream does not answer', async () => {
    const store = memoryLogoStore();
    await refreshLogoIndex({
      store,
      upstream: fixtureUpstream(() => null),
      rasterize: fakeRasterizer,
      now: () => NOW,
    });
    const later = new Date(NOW.getTime() + 60_000);
    const counts = await refreshLogoIndex({
      store,
      upstream: downUpstream(),
      rasterize: fakeRasterizer,
      now: () => later,
    });
    expect(counts.icons).toBe(10);
    expect(counts.updatedAt).toBe(NOW.toISOString());
    expect(counts.lastError).toEqual({
      at: later.toISOString(),
      status: 0,
      message: LOGO_DOWN_MESSAGE,
    });
    const stored = await store.readIndex();
    expect(stored?.icons).toHaveLength(10);
    expect(stored?.lastError?.message).toBe(LOGO_DOWN_MESSAGE);
    /* the search answers from the cache while the source is down, the foot names the failure */
    const service = createLogoService({
      store,
      upstream: downUpstream(),
      rasterize: fakeRasterizer,
      now: () => later,
    });
    const answer = await service.search('figma');
    expect(answer.logos[0]?.slug).toBe('figma');
    expect(answer.lastError?.message).toBe(LOGO_DOWN_MESSAGE);
    expect(LOGO_WORDS.source(answer)).toContain('thesvg.org did not answer at 06:01 UTC');
    const mark = await service.mark('figma', 'default');
    expect(mark).toEqual({ ok: false, status: 503, message: LOGO_WORDS.upstreamDown });
    /* a refresh that succeeds again clears the failure */
    const back = createLogoService({
      store,
      upstream: fixtureUpstream(() => stored),
      rasterize: fakeRasterizer,
      now: () => later,
    });
    const counts2 = await back.refresh();
    expect(counts2.lastError).toBeUndefined();
  });

  it('stops at the time budget with progress and resumes from the first slug without flags', async () => {
    const store = memoryLogoStore();
    const slow: LogoUpstream = {
      mode: 'fixture',
      manifest: fixtureUpstream(() => null).manifest,
      mark: async (path, mode) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return fixtureUpstream(() => null).mark(path, mode);
      },
    };
    const partial = await refreshLogoIndex({
      store,
      upstream: slow,
      rasterize: fakeRasterizer,
      now: () => NOW,
      budgetMs: 1,
      concurrency: 1,
    });
    expect(partial.updatedAt).toBeNull();
    expect(partial.progress).toBeDefined();
    expect((partial.progress as { done: number }).done).toBeLessThan(9);
    expect(partial.progress?.total).toBe(9);
    expect(partial.fetched).toBeLessThan(9);
    const stored = await store.readIndex();
    expect(stored?.icons).toHaveLength(10);
    const flagged = stored?.icons.filter((row) => row.readsOnPaper !== undefined).length ?? 0;
    expect(flagged).toBe(partial.progress?.done);
    const later = new Date(NOW.getTime() + 60_000);
    const complete = await refreshLogoIndex({
      store,
      upstream: slow,
      rasterize: fakeRasterizer,
      now: () => later,
      budgetMs: 60_000,
      concurrency: 8,
    });
    expect(complete.fetched).toBe(9 - flagged);
    expect(complete.updatedAt).toBe(later.toISOString());
    expect(complete.progress).toBeUndefined();
  });

  it('answers the counts on a dry run with no upstream fetch and no write', async () => {
    const store = memoryLogoStore();
    let calls = 0;
    const counted: LogoUpstream = {
      mode: 'fixture',
      manifest: async () => {
        calls += 1;
        return fixtureUpstream(() => null).manifest();
      },
      mark: async (path, mode) => {
        calls += 1;
        return fixtureUpstream(() => null).mark(path, mode);
      },
    };
    await refreshLogoIndex({ store, upstream: counted, rasterize: fakeRasterizer, now: () => NOW });
    const before = calls;
    const writes = store.writes;
    const dry = await refreshLogoIndex(
      { store, upstream: counted, rasterize: fakeRasterizer, now: () => NOW },
      { dryRun: true },
    );
    expect(calls).toBe(before);
    expect(store.writes).toBe(writes);
    expect(dry).toMatchObject({
      icons: 10,
      brands: 9,
      cachedMarks: 0,
      unavailable: 0,
      dryRun: true,
      upstream: 'fixture',
      fetched: 0,
    });
    expect(dry.updatedAt).toBe(NOW.toISOString());
    const service = createLogoService({
      store,
      upstream: counted,
      rasterize: fakeRasterizer,
      now: () => NOW,
    });
    const viaService = await service.refresh({ dryRun: true });
    expect(viaService.dryRun).toBe(true);
    expect(calls).toBe(before);
  });

  it('caches a CC0 mark in the store with its attribution and never a CC BY-ND mark', async () => {
    const store = memoryLogoStore();
    let fetches = 0;
    const base = fixtureUpstream(() => null);
    const counted: LogoUpstream = {
      mode: 'fixture',
      manifest: base.manifest,
      mark: async (path, mode) => {
        fetches += 1;
        return base.mark(path, mode);
      },
    };
    const service = createLogoService({
      store,
      upstream: counted,
      rasterize: fakeRasterizer,
      now: () => NOW,
    });
    const figma = await service.mark('figma', 'default');
    expect(figma.ok).toBe(true);
    if (!figma.ok) return;
    expect(figma.cached).toBe(false);
    expect(descOf(figma.svg)).toBe(attributionOf('Figma', 'CC0-1.0'));
    expect(store.marks.has('figma/default')).toBe(true);
    expect(descOf(new TextDecoder().decode(store.marks.get('figma/default')))).toContain(
      'Figma logo, from thesvg.org under CC0-1.0',
    );
    expect((await service.index()).cached['figma/default']?.digest).toMatch(/^[0-9a-f]{64}$/);
    const again = await service.mark('figma', 'default');
    expect(again.ok && again.cached).toBe(true);
    const after = fetches;
    const aws = await service.mark('aws-amazon-ec2', 'default');
    expect(aws.ok).toBe(true);
    expect(store.marks.has('aws-amazon-ec2/default')).toBe(false);
    expect((await service.index()).cached['aws-amazon-ec2/default']).toBeUndefined();
    expect(fetches).toBe(after + 1);
    /* the second draw of a mark that is not cached comes from this instance's memory */
    const awsAgain = await service.mark('aws-amazon-ec2', 'default');
    expect(awsAgain.ok && !awsAgain.cached).toBe(true);
    expect(fetches).toBe(after + 1);
    const counts = await service.refresh({ dryRun: true });
    expect(counts.cachedMarks).toBe(1);
  });

  it('ranks the search prefix, then word start, then substring, brands before community, then shorter titles', async () => {
    const store = memoryLogoStore();
    const service = createLogoService({
      store,
      upstream: fixtureUpstream(() => null),
      rasterize: fakeRasterizer,
      now: () => NOW,
    });
    const answer = await service.search('a');
    /* Acme and Anthropic by their titles and OpenAI by its AI category are prefix matches, shorter
       titles first; Figma, GitHub, Stripe and Vercel match a category as a substring, Northwind its
       Retail category; Gradientco is the community mark and comes last */
    expect(answer.logos.map((row) => row.slug)).toEqual([
      'acme',
      'openai',
      'anthropic',
      'figma',
      'github',
      'stripe',
      'vercel',
      'northwind',
      'gradientco',
    ]);
    expect(answer.logos[0]?.licenceSentence).toBe('The brand’s own terms');
    expect(answer.source).toBe('thesvg.org');
    expect(answer.indexed).toBe(9);
    expect((await service.search('amazon')).logos).toEqual([]);
    expect((await service.search('amazon', { collection: 'all' })).logos[0]?.slug).toBe(
      'aws-amazon-ec2',
    );
    const rows = (await service.index()).icons;
    expect(rankLogos(rows, 'acme corporation')[0]?.slug).toBe('acme');
    expect(rankLogos(rows, 'git')[0]?.slug).toBe('github');
    expect(rankLogos(rows, 'hub')[0]?.slug).toBe('github');
  });

  it('adopts another instance’s refresh when a search names its build, and answers 404 for a taken down slug on a stale copy', async () => {
    /* two instances over one store (the fix round, the verifier's pass 1 F4): the hour long hold
       of the index is the design, the search that names the refresh's `builtAt` is how the
       instance that answers it adopts the build, and a mark whose cached file left the store
       reads the index again before it fetches */
    const store = memoryLogoStore();
    let clock = NOW.getTime();
    const now = () => new Date(clock);
    let aHeld: () => LogoIndex | null = () => null;
    const a = createLogoService({
      store,
      upstream: fixtureUpstream(() => aHeld()),
      rasterize: fakeRasterizer,
      now,
    });
    aHeld = () => a.held();
    await a.index();
    expect((await a.mark(FIXTURE_DROPPED_SLUG, 'default')).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    /* the discovery goes to the side record and never rewrites the index (build/hotfix.md 2);
       the instances that load after it read the cached mark from the record */
    expect((await store.readIndex())?.cached[`${FIXTURE_DROPPED_SLUG}/default`]).toBeUndefined();
    expect(
      (await store.readDiscoveries())?.cached[`${FIXTURE_DROPPED_SLUG}/default`],
    ).toBeDefined();
    expect(store.writes).toBe(1);
    let bHeld: () => LogoIndex | null = () => null;
    const b = createLogoService({
      store,
      upstream: fixtureUpstream(() => bHeld()),
      rasterize: fakeRasterizer,
      now,
    });
    bHeld = () => b.held();
    await b.index();
    let cHeld: () => LogoIndex | null = () => null;
    const c = createLogoService({
      store,
      upstream: fixtureUpstream(() => cHeld()),
      rasterize: fakeRasterizer,
      now,
    });
    cHeld = () => c.held();
    await c.index();
    clock += 60_000;
    const counts = await a.refresh();
    expect(counts.dropped).toEqual([FIXTURE_DROPPED_SLUG]);
    expect(counts.builtAt).toBe(now().toISOString());
    /* b holds its copy for the hour: the plain search still lists the slug */
    expect((await b.search(FIXTURE_DROPPED_SLUG)).logos.map((r) => r.slug)).toContain(
      FIXTURE_DROPPED_SLUG,
    );
    /* the search that names the build reads the store's version and adopts the refresh */
    const since = counts.builtAt as string;
    expect((await b.search(FIXTURE_DROPPED_SLUG, {}, { since })).logos).toEqual([]);
    expect((await b.search(FIXTURE_DROPPED_SLUG, {}, { since })).logos).toEqual([]);
    expect(await b.mark(FIXTURE_DROPPED_SLUG, 'default')).toEqual({
      ok: false,
      status: 404,
      message: LOGO_WORDS.unknown(FIXTURE_DROPPED_SLUG),
    });
    /* a build the store never wrote costs one head and answers the held copy */
    expect(
      (await b.search('figma', {}, { since: '2099-01-01T00:00:00.000Z' })).logos[0]?.slug,
    ).toBe('figma');
    /* c never searched: its cached file is gone from the store, so the mark route reads the
       index again and answers 404 instead of fetching a fresh copy of a removed file */
    expect((await c.index()).cached[`${FIXTURE_DROPPED_SLUG}/default`]).toBeDefined();
    expect(await c.mark(FIXTURE_DROPPED_SLUG, 'default')).toEqual({
      ok: false,
      status: 404,
      message: LOGO_WORDS.unknown(FIXTURE_DROPPED_SLUG),
    });
    expect((await c.index()).icons.some((row) => row.slug === FIXTURE_DROPPED_SLUG)).toBe(false);
  });

  it('refuses the dropped slug’s file once a built index no longer holds it, and a fresh instance’s refresh reads the store’s index first', async () => {
    const store = memoryLogoStore();
    await refreshLogoIndex({
      store,
      upstream: fixtureUpstream(() => null),
      rasterize: fakeRasterizer,
      now: () => NOW,
    });
    const holding = await store.readIndex();
    expect(holding?.icons.some((row) => row.slug === FIXTURE_DROPPED_SLUG)).toBe(true);
    const path = FIXTURE_ICONS.find((icon) => icon.slug === FIXTURE_DROPPED_SLUG)?.variants
      .default as string;
    /* before the first build and while the index holds the slug the file serves */
    expect((await fixtureUpstream(() => null).mark(path, 'single')).ok).toBe(true);
    expect((await fixtureUpstream(() => holding).mark(path, 'single')).ok).toBe(true);
    /* the fresh instance: the fixture decides its takedown from the index the instance holds, so
       the refresh reads the store's index before the manifest and drops the slug at once */
    let held: () => LogoIndex | null = () => null;
    const fresh = createLogoService({
      store,
      upstream: fixtureUpstream(() => held()),
      rasterize: fakeRasterizer,
      now: () => NOW,
    });
    held = () => fresh.held();
    expect(fresh.held()).toBeNull();
    const counts = await fresh.refresh();
    expect(counts.dropped).toEqual([FIXTURE_DROPPED_SLUG]);
    expect(counts.icons).toBe(9);
    /* after the takedown the files are gone too, as thesvg.org's are after a removal */
    const after = await store.readIndex();
    expect((await fixtureUpstream(() => after).mark(path, 'single')).ok).toBe(false);
    expect((await fixtureUpstream(() => after).mark('/icons/figma/default.svg', 'single')).ok).toBe(
      true,
    );
  });

  it('accepts the agent bearer and the cron secret for the refresh and refuses neither and a wrong secret', () => {
    const env = { CRON_SECRET: 'cron-secret-for-the-test-0000000000' };
    const req = (bearer?: string) =>
      new Request('https://studio.example/api/logo/refresh', {
        method: 'POST',
        headers: bearer === undefined ? {} : { authorization: `Bearer ${bearer}` },
      });
    const refusing = () => ({ ok: false });
    const accepting = () => ({ ok: true });
    expect(refreshCredential(req(env.CRON_SECRET), env, refusing)).toBe('cron');
    expect(refreshCredential(req('the-agent-bearer'), env, accepting)).toBe('agent');
    expect(refreshCredential(req(), env, refusing)).toBeNull();
    expect(refreshCredential(req('wrong-secret'), env, refusing)).toBeNull();
    expect(refreshCredential(req(env.CRON_SECRET), {}, refusing)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// The insert (4.4)

function deckDir(name: string, appearance: 'light' | 'dark' = 'light'): string {
  const dir = join(tmp, name, 'decks', 'gt-brand');
  mkdirSync(join(dir, 'slides'), { recursive: true });
  const deck: Deck = {
    ...WORKED_DECK,
    defaults: { ...(WORKED_DECK.defaults ?? {}), appearance },
    sections: [
      {
        ...(WORKED_DECK.sections[0] as Deck['sections'][number]),
        slideIds: [
          ...(WORKED_DECK.sections[0] as Deck['sections'][number]).slideIds,
          FREEFORM_SLIDE.id,
        ],
      },
      ...WORKED_DECK.sections.slice(1),
    ],
  };
  writeFileSync(join(dir, 'deck.json'), canonicalJson(deck));
  for (const slide of [...WORKED_SLIDES, FREEFORM_SLIDE] as Slide[])
    writeFileSync(slidePath(dir, slide.id), canonicalJson(slide));
  return dir;
}

async function serviceFor(): Promise<ReturnType<typeof createLogoService>> {
  const store = memoryLogoStore();
  const service = createLogoService({
    store,
    upstream: fixtureUpstream(() => null),
    rasterize: fakeRasterizer,
    now: () => NOW,
  });
  await service.index();
  return service;
}

describe('the insert (4.4, 4.11)', () => {
  it('stores the mark as a logo asset with its source and places the picture at the logo size, one write', async () => {
    const dir = deckDir('insert-figma');
    const store = openFileStore({ dir });
    const before = (await store.read()).document;
    const service = await serviceFor();
    const output = await logoInsert(
      { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
      ctx,
      {
        slug: 'figma',
        slideId: FREEFORM_SLIDE.id,
        baseRevision: before.deck.revision,
      },
    );
    expect(output.asset.id).toBe('figma');
    expect(output.variant).toBe('default');
    expect(output.slideId).toBe('free');
    expect(output.blockId).toBe('logo');
    expect(output.revision).toBe(before.deck.revision + 1);
    const asset = output.asset;
    expect(asset.role).toBe('logo');
    expect(asset.alt).toBe('Figma logo');
    expect(asset.scale).toBe(3);
    expect(asset.source.kind).toBe('logo');
    if (asset.source.kind !== 'logo') return;
    expect(asset.source).toMatchObject({
      provider: 'thesvg',
      slug: 'figma',
      variant: 'default',
      title: 'Figma',
      license: 'CC0-1.0',
      guidelines: 'https://www.figma.com/using-the-figma-brand/',
    });
    expect(asset.source.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.source.tint).toBeUndefined();
    expect(asset.sourceFile).toMatch(/^assets\/figma\.source\.[0-9a-f]{8}\.svg$/);
    expect('neutral' in asset.twins).toBe(true);
    /* the vector round (docs/VECTOR.md 4.1): the insert writes the svg kind and the vector file */
    expect(asset.kind).toBe('svg');
    expect(asset.vector).toEqual({ neutral: asset.sourceFile });
    /* 3x of a 108 by 160 symbol */
    expect(asset.size).toEqual([324, 480]);
    expect(assetSchema.safeParse(asset).success).toBe(true);
    const after = (await store.read()).document;
    const slide = after.slides['free'] as Slide;
    const block = (slide.kind === 'content' ? (slide.slots.main ?? []) : []).find(
      (b) => b.id === 'logo',
    );
    expect(block?.type).toBe('shot');
    expect((block as { asset?: string }).asset).toBe('figma');
    const pos = block?.pos;
    expect(pos?.h).toBe(160);
    expect(pos?.w).toBe(108);
    expect(pos?.z).toBe(6);
    /* the document never carries the source's address */
    const text = readFileSync(join(dir, 'deck.json'), 'utf8');
    expect(text).not.toContain('thesvg.org');
    expect(text).not.toContain('jsdelivr');
    const source = readFileSync(join(dir, asset.sourceFile as string), 'utf8');
    expect(source.startsWith('<svg')).toBe(true);
    expect(descOf(source)).toContain('Figma logo, from thesvg.org under CC0-1.0');
    /* the version log holds one entry for the insert */
    const versions = await store.listVersions();
    expect(versions[versions.length - 1]?.note).toBe('Logo: Figma');
  });

  it('tints a mono with the kit’s text colour per appearance and records it; a CC BY-ND mark inserts unmodified', async () => {
    const dir = deckDir('insert-mono', 'dark');
    const store = openFileStore({ dir });
    const service = await serviceFor();
    const output = await logoInsert(
      { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
      ctx,
      {
        slug: 'figma',
        variant: 'mono',
        baseRevision: (await store.read()).document.deck.revision,
      },
    );
    const asset = output.asset;
    if (asset.source.kind !== 'logo') throw new Error('logo source');
    expect(asset.source.variant).toBe('mono');
    expect(asset.source.tint).toEqual({ light: '#070707', dark: '#f2f2f0' });
    expect('light' in asset.twins && 'dark' in asset.twins).toBe(true);
    const source = readFileSync(join(dir, asset.sourceFile as string), 'utf8');
    /* the deck is dark, so the source carries the dark appearance's text colour */
    expect(source).toContain('fill="#f2f2f0"');
    expect(source).not.toContain('#070707');
    /* the vector round (docs/VECTOR.md 4.1): the two tinted svg files, one per appearance */
    expect(asset.kind).toBe('svg');
    if (asset.vector === undefined || !('light' in asset.vector))
      throw new Error('two vector files');
    expect(asset.vector.light).toMatch(/^assets\/figma\.[0-9a-f]{8}-light\.svg$/);
    expect(asset.vector.dark).toMatch(/^assets\/figma\.[0-9a-f]{8}-dark\.svg$/);
    expect(readFileSync(join(dir, asset.vector.light), 'utf8')).toContain('fill="#070707"');
    expect(readFileSync(join(dir, asset.vector.dark), 'utf8')).toContain('fill="#f2f2f0"');
    expect(assetSchema.safeParse(asset).success).toBe(true);
    expect(output.blockId).toBeUndefined();
    /* an AWS mark with the cloud switch on carries its file unmodified */
    const aws = await logoInsert(
      { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
      ctx,
      {
        slug: 'aws-amazon-ec2',
        baseRevision: (await store.read()).document.deck.revision,
      },
    );
    if (aws.asset.source.kind !== 'logo') throw new Error('logo source');
    expect(aws.asset.source.tint).toBeUndefined();
    expect(aws.asset.source.license).toBe('CC-BY-ND-2.0');
    const awsSource = readFileSync(join(dir, aws.asset.sourceFile as string), 'utf8');
    expect(awsSource).toContain('#ED7100');
    expect(awsSource).not.toContain('#f2f2f0');
    /* the paired files become the twins by the ground each is drawn for: GitHub on the dark deck
       takes its `dark` file (the white mark), and the `light` file is the light twin */
    const github = await logoInsert(
      { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
      ctx,
      {
        slug: 'github',
        baseRevision: (await store.read()).document.deck.revision,
      },
    );
    expect(github.variant).toBe('dark');
    expect('light' in github.asset.twins).toBe(true);
  });

  it('writes the kit’s three slots with everySlide in the same write, and swaps a block’s asset for Replace image', async () => {
    const dir = deckDir('insert-every');
    const store = openFileStore({ dir });
    const service = await serviceFor();
    const output = await logoInsert(
      { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
      ctx,
      {
        slug: 'figma',
        slideId: 'free',
        everySlide: true,
        baseRevision: (await store.read()).document.deck.revision,
      },
    );
    const after = (await store.read()).document;
    expect(after.deck.brand?.mark).toEqual({ kind: 'picture', assetId: 'figma' });
    expect(after.deck.brand?.footer).toEqual({ logo: 'picture', assetId: 'figma' });
    expect(after.deck.revision).toBe(output.revision);
    const versions = await store.listVersions();
    expect(versions[versions.length - 1]?.note).toBe('Brand kit: Logo');
    expect(kitLogoMutations(after.deck, 'figma')).toHaveLength(3);
    /* the kit alone, for the Brand kit panel */
    const kit = await logoInsert(
      { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
      ctx,
      {
        slug: 'stripe',
        kit: true,
        baseRevision: after.deck.revision,
      },
    );
    const kitted = (await store.read()).document;
    expect(kitted.deck.brand?.mark).toEqual({ kind: 'picture', assetId: 'stripe' });
    expect(kit.blockId).toBeUndefined();
    /* Replace image > Logo: the asset swaps and the box stays */
    const swapped = await logoInsert(
      { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
      ctx,
      {
        slug: 'openai',
        blockId: 'logo',
        baseRevision: kitted.deck.revision,
      },
    );
    expect(swapped.blockId).toBe('logo');
    const final = (await store.read()).document;
    const slide = final.slides['free'] as Slide;
    const block = (slide.kind === 'content' ? (slide.slots.main ?? []) : []).find(
      (b) => b.id === 'logo',
    ) as { asset?: string; pos?: { w: number; h: number } };
    expect(block.asset).toBe('openai');
    expect(block.pos?.w).toBe(108);
    expect(block.pos?.h).toBe(160);
    expect(Object.keys(final.deck.assets)).toEqual(
      expect.arrayContaining(['figma', 'stripe', 'openai']),
    );
  });

  it('does not offer a gradient mono as Mono and falls back to the untinted default; refuses an unknown slug and a missing variant', async () => {
    const dir = deckDir('insert-gradient');
    const store = openFileStore({ dir });
    const service = await serviceFor();
    const output = await logoInsert(
      { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
      ctx,
      {
        slug: 'gradientco',
        variant: 'mono',
        baseRevision: (await store.read()).document.deck.revision,
      },
    );
    expect(output.variant).toBe('default');
    if (output.asset.source.kind !== 'logo') throw new Error('logo source');
    expect(output.asset.source.tint).toBeUndefined();
    expect((await service.row('gradientco'))?.unavailable?.mono?.reason).toBe('gradient');
    expect(
      chooseVariant((await service.row('gradientco')) as LogoRow, 'dark', { tone: 'mono' }),
    ).toEqual({ variant: 'default', tint: false });
    const revision = (await store.read()).document.deck.revision;
    await expect(
      logoInsert(
        { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
        ctx,
        { slug: 'nobody', baseRevision: revision },
      ),
    ).rejects.toThrow(LOGO_WORDS.unknown('nobody'));
    await expect(
      logoInsert(
        { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
        ctx,
        { slug: 'stripe', variant: 'wordmark', baseRevision: revision },
      ),
    ).rejects.toThrow(LOGO_WORDS.noVariant('Stripe', 'wordmark'));
    /* the 404 wordmark of acme answers the missing sentence, and a second figma takes the next id */
    await expect(
      logoInsert(
        { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
        ctx,
        { slug: 'acme', variant: 'wordmark', baseRevision: revision },
      ),
    ).rejects.toThrow(LOGO_WORDS.noVariant('Acme', 'wordmark'));
    await logoInsert(
      { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
      ctx,
      { slug: 'figma', baseRevision: revision },
    );
    const second = await logoInsert(
      { service, store, deckId: 'gt-brand', now: () => NOW, rasterizePng: fakePng },
      ctx,
      {
        slug: 'figma',
        baseRevision: (await store.read()).document.deck.revision,
      },
    );
    expect(second.asset.id).toBe('figma-2');
  });

  it('places a logo in the free area of the body slot, centred, never at the largest fit', () => {
    const box = logoPlacementOn(FREEFORM_SLIDE, [108, 160]);
    expect(box[2]).toBe(108);
    expect(box[3]).toBe(160);
    /* inside the content box and clear of the heading band */
    expect(box[0]).toBeGreaterThanOrEqual(137);
    expect(box[0] + box[2]).toBeLessThanOrEqual(137 + 1326);
    expect(box[1]).toBeGreaterThan(129 + 56);
    expect(box[1] + box[3]).toBeLessThanOrEqual(129 + 642);
  });

  it('places a logo beside the brand’s mark on a converted title slide, never over the heading’s words', () => {
    /* the title slide as the stage converts it (schema/canvas.ts toCanvas): the mark at 132 by 84,
       the h1 and the lead under it, one stack in the middle of the sheet; the lead is empty, the
       placeholder the picture rule would take the whole content box for (the fix round, F3) */
    const title = TITLE as Extract<Slide, { kind: 'title' }>;
    const converted = toCanvas(
      { ...title, lead: '' },
      {
        blocks: { heading: [137, 498, 1326, 60], lead: [137, 584, 1326, 40] },
        mark: [137, 370, 132, 84],
        prompted: ['lead'],
      },
    );
    expect(converted).not.toBeNull();
    const slide = converted?.slide as Slide;
    expect(grammarRecordOf(slide)?.kind).toBe('title');
    /* a symbol: beside the mark, scaled to the row's height */
    expect(logoPlacementOn(slide, [108, 160])).toEqual([309, 370, 57, 84]);
    /* a wordmark: 320 wide fits the row, centred on its height */
    expect(logoPlacementOn(slide, [320, 64])).toEqual([309, 380, 320, 64]);
    /* a second logo lands to the right of the first */
    const main = (slide as { slots: { main: Block[] } }).slots.main;
    const withOne = {
      ...slide,
      slots: {
        main: [
          ...main,
          {
            id: 'logo',
            type: 'shot',
            asset: 'figma',
            pos: { x: 309, y: 370, w: 57, h: 84, z: 5 },
          } as Block,
        ],
      },
    } as Slide;
    expect(logoPlacementOn(withOne, [108, 160])).toEqual([406, 370, 57, 84]);
    /* no mark block (the seller removed it): the general rule, and the heading's words are clear */
    const withoutMark = {
      ...slide,
      slots: { main: main.filter((block) => block.type !== 'mark') },
    } as Slide;
    const general = logoPlacementOn(withoutMark, [108, 160]);
    expect(general[1] + general[3] <= 498 || general[1] >= 558).toBe(true);
  });

  it('rasterizes the sanitized SVG with sharp to a PNG of the size asked for', async () => {
    const svg = sanitizeLogoSvg(svgOf('/icons/figma/default.svg')).svg;
    const out = await rasterizeLogoPng(svg, [324, 480]);
    expect(Array.from(out.png.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(out.width).toBe(324);
    expect(out.height).toBe(480);
  });

  it('answers the three actions through a dispatcher in the table’s shapes', async () => {
    const dir = deckDir('insert-actions');
    const store = openFileStore({ dir });
    const service = await serviceFor();
    const dispatcher = createDispatcher();
    registerLogoActions(dispatcher, {
      store,
      deckId: 'gt-brand',
      service,
      now: () => NOW,
      rasterizePng: fakePng,
    });
    const search = (await dispatcher.dispatch(
      'logo.search',
      { query: 'figma', limit: 5 },
      ctx,
    )) as { logos: { slug: string; licenceSentence: string }[]; source: string };
    expect(search.logos[0]?.slug).toBe('figma');
    expect(search.logos[0]?.licenceSentence).toBe('Free to use');
    expect(search.source).toBe('thesvg.org');
    const dry = (await dispatcher.dispatch('logo.refresh', { dryRun: true }, ctx)) as {
      icons: number;
      dryRun: boolean;
    };
    expect(dry).toMatchObject({ icons: 10, dryRun: true });
    const inserted = (await dispatcher.dispatch(
      'logo.insert',
      {
        slug: 'vercel',
        slideId: 'free',
        baseRevision: (await store.read()).document.deck.revision,
      },
      ctx,
    )) as { asset: Asset; blockId?: string; variant: string };
    /* a light deck takes Vercel's `light` file (the black triangle, drawn for a light ground), the
       white default being invisible on paper */
    expect(inserted.variant).toBe('light');
    expect(inserted.asset.role).toBe('logo');
    expect(inserted.blockId).toBe('logo');
    await expect(
      dispatcher.dispatch('logo.insert', { slug: 'vercel', nope: 1, baseRevision: 1 }, ctx),
    ).rejects.toThrow(TypeError);
  });

  it('answers a mark that does not draw as an empty check: the fixture upstream rejects nothing the tests need', async () => {
    const answers: UpstreamAnswer[] = [];
    const upstream = fixtureUpstream(() => emptyLogoIndex());
    for (const icon of FIXTURE_ICONS)
      answers.push(await upstream.mark(icon.variants.default as string, 'bulk'));
    expect(answers.every((answer) => answer.ok)).toBe(true);
    expect((await upstream.mark(FIXTURE_MISSING_PATH, 'single')).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The store's busy window and the side record of discoveries (build/hotfix.md section 2; ship.md 13.4)

describe("the store's busy window and the discoveries record (build/hotfix.md 2)", () => {
  /** The SDK's sentence for the public store's edge on a just written file (store/pulse.ts isStoreBusy). */
  const forbidden = (): Error => new Error('Vercel Blob: Failed to fetch blob: 403 Forbidden');
  const markPath = (slug: string, variant: string): string =>
    `${LOGO_MARKS_PREFIX}${slug}/${variant}.svg`;
  let counter = 0;

  /**
   * One fake Blob store with the ten mark fixture index built into it; `instance` opens a store
   * view with a mirror folder of its own (a function instance's disk), `service` a logo service
   * over it; `puts` counts the writes of one pathname.
   */
  async function blobFixture() {
    const fake = memoryBlobClient();
    const instance = (name: string, mirrorDir?: string) =>
      blobLogoStore(fake, mirrorDir ?? join(tmp, `blob-${name}-${(counter += 1)}`));
    const service = (name: string, mirrorDir?: string) =>
      createLogoService({
        store: instance(name, mirrorDir),
        upstream: fixtureUpstream(() => null),
        rasterize: fakeRasterizer,
        now: () => NOW,
      });
    await refreshLogoIndex({
      store: instance('builder'),
      upstream: fixtureUpstream(() => null),
      rasterize: fakeRasterizer,
      now: () => NOW,
    });
    const puts = (pathname: string): number =>
      fake.calls.filter((call) => call.op === 'put' && call.pathname === pathname).length;
    return { fake, instance, service, puts };
  }

  it('answers a search from the held copy while the store refuses the index it was asked to adopt, and adopts it once the store serves it', async () => {
    const { fake, instance, service } = await blobFixture();
    const warm = service('warm');
    expect((await warm.search('figma')).logos[0]?.slug).toBe('figma');
    const before = warm.held()!.builtAt;
    /* another instance's refresh moved the store's version, and the edge withholds the body */
    const other = instance('other');
    const moved: LogoIndex = { ...(await other.readIndex())!, builtAt: '2026-09-22T07:00:00.000Z' };
    await other.writeIndex(moved);
    fake.failNextGet(LOGO_INDEX_PATH, forbidden());
    const answer = await warm.search('figma', {}, { since: moved.builtAt! });
    expect(answer.logos[0]?.slug).toBe('figma');
    expect(answer.indexed).toBeGreaterThan(0);
    /* the held copy is still the earlier build, never taken for the store's version */
    expect(warm.held()!.builtAt).toBe(before);
    /* the window over: the next revalidation adopts the build */
    expect((await warm.revalidate()).builtAt).toBe(moved.builtAt);
  });

  it('answers the fixture’s ten marks from memory on a cold instance with no copy (the typed 503 stays for a build with no snapshot), adopts the store’s copy once served, and serves the disk mirror when it holds one', async () => {
    const { fake, service } = await blobFixture();
    const cold = service('cold');
    fake.failNextGet(LOGO_INDEX_PATH, forbidden());
    /* the second hotfix (section 9): the ten marks built in memory answer, named as a snapshot,
       where the first hotfix threw the 503 the picker could not draw */
    const first = await cold.search('figma');
    expect(first.logos[0]?.slug).toBe('figma');
    expect(typeof first.snapshotAt).toBe('string');
    expect(LOGO_STORE_RETRY_AFTER_S).toBeLessThanOrEqual(10);
    expect(cold.held()).not.toBeNull();
    /* the edge serves the file: the next revalidation adopts the store's copy and the answer no
       longer names the snapshot */
    expect((await cold.revalidate()).builtAt).toBe(NOW.toISOString());
    expect((await cold.search('figma')).snapshotAt).toBeUndefined();
    /* an instance whose disk holds its last read answers from it: one head reads the store at the
       mirror's version and no get is made, so a refused get is never met (the second hotfix's
       order, build/hotfix.md 9); a refused head serves the copy with the version unknown */
    const mirrorDir = join(tmp, 'blob-mirror-shared');
    await service('first', mirrorDir).index();
    const second = service('second', mirrorDir);
    const indexGets = (): number =>
      fake.calls.filter((call) => call.op === 'get' && call.pathname === LOGO_INDEX_PATH).length;
    const getsBefore = indexGets();
    fake.failNextGet(LOGO_INDEX_PATH, forbidden());
    expect((await second.search('figma')).logos[0]?.slug).toBe('figma');
    expect(second.held()).not.toBeNull();
    expect(indexGets()).toBe(getsBefore);
    expect(second.snapshotAt()).toBeNull();
    /* a mark during the window answers the mark: the upstream's file, sanitized, and cached */
    const vercel = await second.mark('vercel', 'dark');
    expect(vercel.ok).toBe(true);
    expect(vercel.ok && vercel.svg).toContain('<svg');
    /* the revalidation after the window reads the store's index and the version */
    await second.revalidate();
    expect(second.held()!.builtAt).toBe(NOW.toISOString());
  });

  it('answers a cached mark from the upstream while the edge withholds its file, and writes nothing since the store holds it', async () => {
    const { fake, service, puts } = await blobFixture();
    const a = service('a');
    const first = await a.mark('figma', 'default');
    expect(first.ok && !first.cached).toBe(true);
    expect(puts(markPath('figma', 'default'))).toBe(1);
    expect((await a.index()).cached['figma/default']).toBeDefined();
    /* the file is in the store by the index's word; the edge refuses it for this call */
    fake.failNextGet(markPath('figma', 'default'), forbidden());
    const withheld = await a.mark('figma', 'default');
    expect(withheld.ok).toBe(true);
    expect(withheld.ok && withheld.cached).toBe(false);
    expect(withheld.ok && withheld.svg).toContain('<svg');
    expect(puts(markPath('figma', 'default'))).toBe(1);
    expect((await a.index()).cached['figma/default']).toBeDefined();
    /* the edge serves it: the store's copy answers, cached */
    const served = await a.mark('figma', 'default');
    expect(served.ok && served.cached).toBe(true);
  });

  it('writes a discovery to the side record and never to the index; an instance loading after it reads the cached mark from the record', async () => {
    const { fake, service, puts } = await blobFixture();
    const a = service('a');
    await a.index();
    expect(puts(LOGO_INDEX_PATH)).toBe(1);
    expect(puts(LOGO_DISCOVERIES_PATH)).toBe(0);
    /* a cached mark and a missing variant, discovered on this instance */
    expect((await a.mark('figma', 'default')).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(puts(LOGO_INDEX_PATH)).toBe(1);
    expect(puts(LOGO_DISCOVERIES_PATH)).toBe(1);
    const stored = new TextDecoder().decode(fake.blobs.get(LOGO_DISCOVERIES_PATH)!.bytes);
    expect(JSON.parse(stored)).toMatchObject({
      v: 1,
      cached: { 'figma/default': { at: NOW.toISOString() } },
    });
    /* the record is a few hundred bytes against the index */
    expect(fake.blobs.get(LOGO_DISCOVERIES_PATH)!.bytes.byteLength).toBeLessThan(
      fake.blobs.get(LOGO_INDEX_PATH)!.bytes.byteLength / 4,
    );
    /* the second discovery inside the minute stays pending on the instance (the throttle) */
    expect((await a.mark('acme', 'wordmark')).ok).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(puts(LOGO_DISCOVERIES_PATH)).toBe(1);
    expect(puts(LOGO_INDEX_PATH)).toBe(1);
    expect((await a.row('acme'))?.unavailable?.wordmark?.status).toBe(404);
    /* another instance loading now reads the cached mark from the record and fetches nothing */
    const b = service('b');
    expect((await b.index()).cached['figma/default']).toBeDefined();
    const fromStore = await b.mark('figma', 'default');
    expect(fromStore.ok && fromStore.cached).toBe(true);
    /* the search answers from the held index alone; the record is read once at the load */
    const gets = (): number =>
      fake.calls.filter((call) => call.op === 'get' && call.pathname === LOGO_DISCOVERIES_PATH)
        .length;
    const before = gets();
    await b.search('figma');
    await b.search('vercel');
    expect(gets()).toBe(before);
  });

  it('folds the side record and the pending discoveries into the index at the refresh, then clears the record', async () => {
    const { fake, instance, service, puts } = await blobFixture();
    const a = service('a');
    expect((await a.mark('figma', 'default')).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(puts(LOGO_DISCOVERIES_PATH)).toBe(1);
    /* still pending on the instance inside the throttle */
    expect((await a.mark('acme', 'wordmark')).ok).toBe(false);
    /* the store's index holds neither discovery yet */
    const stale = await instance('reader').readIndex();
    expect(stale?.cached['figma/default']).toBeUndefined();
    expect(stale?.icons.find((row) => row.slug === 'acme')?.unavailable).toBeUndefined();
    const indexGets = (): number =>
      fake.calls.filter((call) => call.op === 'get' && call.pathname === LOGO_INDEX_PATH).length;
    const getsBefore = indexGets();
    const counts = await a.refresh();
    expect(counts.cachedMarks).toBe(1);
    expect(counts.unavailable).toBe(1);
    expect(puts(LOGO_INDEX_PATH)).toBe(2);
    /* the refresh's one read of the previous index, and none after its put: the written index
       is adopted from the refresh's own hand, never read back through the store's edge */
    expect(indexGets() - getsBefore).toBe(1);
    const refreshed = await instance('reader').readIndex();
    expect(refreshed?.cached['figma/default']?.at).toBe(NOW.toISOString());
    expect(refreshed?.icons.find((row) => row.slug === 'acme')?.unavailable?.wordmark).toEqual({
      at: NOW.toISOString(),
      status: 404,
      reason: 'missing',
    });
    /* the record is cleared; the instance adopted the written index without a read back */
    const record = await instance('reader').readDiscoveries();
    expect(record === null || Object.keys(record.cached).length === 0).toBe(true);
    expect(a.held()!.cached['figma/default']).toBeDefined();
    /* a dry run reads the record and clears nothing */
    const dry = await a.refresh({ dryRun: true });
    expect(dry.cachedMarks).toBe(1);
    expect(puts(LOGO_INDEX_PATH)).toBe(2);
  });

  // The second hotfix (build/hotfix.md section 9): the copy that never passes through the edge

  /** A snapshot as the bundle carries one: a build of an earlier day, with a cached mark. */
  const SNAPSHOT_AT = '2026-09-20T06:00:00.000Z';
  async function snapshotOf(): Promise<LogoIndex> {
    const store = memoryLogoStore();
    await refreshLogoIndex({
      store,
      upstream: fixtureUpstream(() => null),
      rasterize: fakeRasterizer,
      now: () => new Date(SNAPSHOT_AT),
    });
    const built = (await store.readIndex())!;
    built.cached['figma/default'] = { at: SNAPSHOT_AT, digest: 'deadbeef', bytes: 1 };
    return built;
  }

  it('answers the bundled snapshot on a cold instance with no copy while the store refuses the index, names its builtAt, asks the store again by the shorter interval, and adopts the store’s copy once it answers', async () => {
    const { fake, instance } = await blobFixture();
    const snapshot = await snapshotOf();
    const cold = createLogoService({
      store: instance('cold'),
      upstream: downUpstream(),
      rasterize: fakeRasterizer,
      now: () => NOW,
      snapshot: () => snapshot,
    });
    fake.failNextGet(LOGO_INDEX_PATH, forbidden());
    const answer = await cold.search('figma');
    expect(answer.logos[0]?.slug).toBe('figma');
    expect(answer.snapshotAt).toBe(SNAPSHOT_AT);
    expect(cold.snapshotAt()).toBe(SNAPSHOT_AT);
    expect(cold.held()!.builtAt).toBe(SNAPSHOT_AT);
    /* the foot names the snapshot's date, never the store's */
    expect(LOGO_WORDS.source(answer)).toContain('Logos from thesvg.org as of 20 September 2026');
    /* the instance asks again sooner than the hourly interval, on a request */
    expect(SNAPSHOT_REVALIDATE_MS).toBeLessThan(INDEX_REVALIDATE_MS);
    expect(SNAPSHOT_REVALIDATE_MS).toBeLessThanOrEqual(60_000);
    /* the discoveries the holder makes never write into the module's copy */
    expect(snapshot.cached['acme/wordmark']).toBeUndefined();
    /* the window over: the store's copy is adopted and the snapshot is no longer named */
    expect((await cold.revalidate()).builtAt).toBe(NOW.toISOString());
    expect(cold.snapshotAt()).toBeNull();
    expect((await cold.search('figma')).snapshotAt).toBeUndefined();
  });

  it('serves the snapshot when the store holds no index yet, and the typed refusal when there is no snapshot at all', async () => {
    const seed = await snapshotOf();
    const empty = createLogoService({
      store: blobLogoStore(memoryBlobClient(), join(tmp, `blob-empty-${(counter += 1)}`)),
      upstream: downUpstream(),
      rasterize: fakeRasterizer,
      now: () => NOW,
      snapshot: () => JSON.parse(JSON.stringify(seed)) as LogoIndex,
    });
    const answer = await empty.search('vercel');
    expect(answer.logos[0]?.slug).toBe('vercel');
    expect(answer.snapshotAt).toBe(SNAPSHOT_AT);
    /* a deployment without the file (the first hotfix's behaviour) still answers 503 with the retry */
    const { fake, instance } = await blobFixture();
    const bare = createLogoService({
      store: instance('bare'),
      upstream: downUpstream(),
      rasterize: fakeRasterizer,
      now: () => NOW,
      snapshot: () => null,
    });
    fake.failNextGet(LOGO_INDEX_PATH, forbidden());
    const refused = await bare.search('figma').catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(LogoStoreBusyError);
    expect(refused).toMatchObject({
      status: 503,
      retryAfterS: LOGO_STORE_RETRY_AFTER_S,
      message: LOGO_STORE_BUSY_MESSAGE,
    });
    expect(bare.held()).toBeNull();
    /* the edge serves the file: the next request loads and answers */
    expect((await bare.search('figma')).logos[0]?.slug).toBe('figma');
  });

  it('builds the fixture’s ten marks in memory as the snapshot under that upstream, writes nothing, and a search naming a refresh’s build asks the store', async () => {
    const { fake, instance, service, puts } = await blobFixture();
    const cold = service('cold');
    const before = puts(LOGO_INDEX_PATH);
    fake.failNextGet(LOGO_INDEX_PATH, forbidden());
    const answer = await cold.search('figma');
    expect(answer.logos[0]?.slug).toBe('figma');
    expect(typeof answer.snapshotAt).toBe('string');
    expect(puts(LOGO_INDEX_PATH)).toBe(before);
    /* the held copy names no build, so `since` always asks the store */
    expect(cold.held()!.builtAt).toBeNull();
    expect(cold.held()!.icons.map((row) => row.slug)).toContain(FIXTURE_DROPPED_SLUG);
    /* another instance's refresh takes the dropped slug down (its fixture upstream reads the
       index it holds, as logoService() binds it); the cold one adopts the build by `since` */
    let other: ReturnType<typeof createLogoService> | null = null;
    other = createLogoService({
      store: instance('other'),
      upstream: fixtureUpstream(() => other?.held() ?? null),
      rasterize: fakeRasterizer,
      now: () => new Date('2026-09-22T07:00:00.000Z'),
    });
    await other.index();
    const refreshed = await other.refresh();
    expect(refreshed.dropped).toContain(FIXTURE_DROPPED_SLUG);
    const after = await cold.search(FIXTURE_DROPPED_SLUG, {}, { since: refreshed.builtAt! });
    expect(after.logos.map((row) => row.slug)).not.toContain(FIXTURE_DROPPED_SLUG);
    expect(after.snapshotAt).toBeUndefined();
    expect(cold.snapshotAt()).toBeNull();
  });

  it('replaces the held snapshot with the index a refresh writes, at once and from the refresh’s own hand', async () => {
    const { fake, service, puts } = await blobFixture();
    const cold = service('cold');
    fake.failNextGet(LOGO_INDEX_PATH, forbidden());
    await cold.search('figma');
    expect(cold.snapshotAt()).not.toBeNull();
    const before = puts(LOGO_INDEX_PATH);
    const counts = await cold.refresh();
    expect(counts.builtAt).toBe(NOW.toISOString());
    expect(puts(LOGO_INDEX_PATH)).toBe(before + 1);
    expect(cold.held()!.builtAt).toBe(NOW.toISOString());
    expect(cold.snapshotAt()).toBeNull();
    expect((await cold.search('figma')).snapshotAt).toBeUndefined();
  });

  it('answers a mark from the upstream while the held copy is the snapshot: a mark it lists as cached but the store withholds, and one it does not list, with the upstream’s failure as the 503 and never the store’s', async () => {
    /* the fixture upstream serves: the mark is fetched, sanitized and written to the store */
    const { fake, service, puts } = await blobFixture();
    const cold = service('cold');
    fake.failNextGet(LOGO_INDEX_PATH, forbidden());
    await cold.search('vercel');
    expect(cold.snapshotAt()).not.toBeNull();
    const dark = await cold.mark('vercel', 'dark');
    expect(dark.ok).toBe(true);
    expect(dark.ok && dark.svg).toContain('<svg');
    expect(puts(`${LOGO_MARKS_PREFIX}vercel/dark.svg`)).toBe(1);
    /* the upstream down and the store withholding the cached file the snapshot names: the
       upstream's sentence and its 503, not a store refusal thrown to the route */
    const snapshot = await snapshotOf();
    const down = createLogoService({
      store: service('down').deps.store,
      upstream: downUpstream(),
      rasterize: fakeRasterizer,
      now: () => NOW,
      snapshot: () => snapshot,
    });
    fake.failNextGet(LOGO_INDEX_PATH, forbidden());
    await down.search('figma');
    fake.failNextGet(`${LOGO_MARKS_PREFIX}figma/default.svg`, forbidden());
    const withheld = await down.mark('figma', 'default');
    expect(withheld).toMatchObject({ ok: false, status: 503, message: LOGO_WORDS.upstreamDown });
    expect(puts(`${LOGO_MARKS_PREFIX}figma/default.svg`)).toBe(0);
  });

  it('serves a mirror at the store’s version with one head and no get, reads the store when the version moved, and keeps the copy with the version unknown when the head is refused', async () => {
    const { fake, instance, service } = await blobFixture();
    const mirrorDir = join(tmp, `blob-mirror-${(counter += 1)}`);
    await service('first', mirrorDir).index();
    const other = instance('other');
    const moved: LogoIndex = { ...(await other.readIndex())!, builtAt: '2026-09-22T07:00:00.000Z' };
    const calls = (op: 'get' | 'head'): number =>
      fake.calls.filter((call) => call.op === op && call.pathname === LOGO_INDEX_PATH).length;
    const gets = calls('get');
    const heads = calls('head');
    const second = service('second', mirrorDir);
    expect((await second.index()).builtAt).toBe(NOW.toISOString());
    expect(calls('get')).toBe(gets);
    expect(calls('head')).toBe(heads + 1);
    /* the store moved: the head differs from the mirror's version, so the copy is read */
    await other.writeIndex(moved);
    const third = service('third', mirrorDir);
    expect((await third.index()).builtAt).toBe(moved.builtAt);
    expect(calls('get')).toBe(gets + 1);
    /* the head refused: the mirror stands with its version unknown, and the next revalidation
       adopts the store's copy */
    const refusing = { ...instance('fourth', mirrorDir) };
    let refuse = true;
    const heading = refusing.indexVersion;
    refusing.indexVersion = async () => {
      if (refuse) throw forbidden();
      return heading();
    };
    const fourth = createLogoService({
      store: refusing,
      upstream: fixtureUpstream(() => null),
      rasterize: fakeRasterizer,
      now: () => NOW,
    });
    const getsBefore = calls('get');
    expect((await fourth.index()).builtAt).toBe(moved.builtAt);
    expect(calls('get')).toBe(getsBefore);
    expect(fourth.snapshotAt()).toBeNull();
    refuse = false;
    const newer: LogoIndex = { ...moved, builtAt: '2026-09-22T08:00:00.000Z' };
    await other.writeIndex(newer);
    expect((await fourth.revalidate()).builtAt).toBe(newer.builtAt);
  });

  it('strips the snapshot’s field from the action’s answer, which the table’s strict output does not name, and keeps it on the service’s', async () => {
    const { fake, instance } = await blobFixture();
    const snapshot = await snapshotOf();
    const service = createLogoService({
      store: instance('actions'),
      upstream: downUpstream(),
      rasterize: fakeRasterizer,
      now: () => NOW,
      snapshot: () => snapshot,
    });
    fake.failNextGet(LOGO_INDEX_PATH, forbidden());
    const dir = deckDir('snapshot-actions');
    const dispatcher = createDispatcher();
    registerLogoActions(dispatcher, {
      store: openFileStore({ dir }),
      deckId: 'gt-brand',
      service,
      now: () => NOW,
      rasterizePng: fakePng,
    });
    const answer = (await dispatcher.dispatch(
      'logo.search',
      { query: 'figma', limit: 5 },
      ctx,
    )) as Record<string, unknown>;
    expect(answer.logos).toBeDefined();
    expect(answer.snapshotAt).toBeUndefined();
    expect((await service.search('figma')).snapshotAt).toBe(SNAPSHOT_AT);
  });
});
