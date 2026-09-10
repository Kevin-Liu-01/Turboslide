// The asset registry of the import (SPEC 4.2 Asset, SPEC 9): every `img src` and `data-dark` in
// the slides becomes an asset with light and dark twins or one neutral file, copied under
// decks/<id>/assets/ with a name derived from the asset id. Roles come from the file prefix, sources
// and treatments from OPENERS.md and DETAILS.md, sizes from the file headers.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import { imageSize } from './images.ts';
import { parseDetails, parseOpeners, sourceOf, treatmentOf } from './provenance.ts';
import type { DetailRecord, PictureRecord } from './provenance.ts';
import type { AssetId } from '@turboslide/schema/ids';
import type { Asset } from '@turboslide/schema/assets';

export type ImageRef = {
  /** `shots/site-home-light.jpg` as written in the slide. */
  src: string;
  /** `data-dark` when the slide has a twin. */
  dark?: string;
  alt: string;
};

/** The asset id of a file reference: the file stem without a `-light` or `-dark` suffix. */
export function stemOf(path: string): string {
  return basename(path).replace(/\.[^.]+$/, '');
}

export function twinStem(path: string): string {
  return stemOf(path).replace(/-(light|dark)$/, '');
}

const ROLE_BY_PREFIX: [RegExp, Asset['role']][] = [
  [/^opener-/, 'opener'],
  [/^mood-/, 'mood'],
  [/^detail-/, 'detail'],
  [/^dir-/, 'thumb'],
  [/^ref-/, 'thumb'],
  [/^logo-/, 'logo'],
  [/^(site|proto|glyph|gt|gh)-/, 'capture'],
];

export function roleOf(id: AssetId, fromThumbDir: boolean): Asset['role'] {
  for (const [re, role] of ROLE_BY_PREFIX) if (re.test(id)) return role;
  return fromThumbDir ? 'thumb' : 'other';
}

/** The inlining rule of build-deck.mjs lines 72 to 76: openers, moods and details at native size. */
export function inlineOf(id: AssetId, fromThumbDir: boolean, twoTone: boolean): Asset['inline'] {
  if (fromThumbDir) return 'pass-through';
  if (/^(opener|mood|detail)-/.test(id)) return twoTone ? 'two-color' : 'native';
  return 'resample-1280';
}

export type AssetRegistry = {
  assets: Record<AssetId, Asset>;
  /** Source path to destination path, for the copy step. */
  files: Map<string, string>;
  warnings: string[];
};

export class Assets {
  readonly registry: AssetRegistry = { assets: {}, files: new Map(), warnings: [] };
  private readonly pictures: PictureRecord[];
  private readonly details: DetailRecord[];
  private readonly deckDir: string;

  constructor(deckDir: string) {
    this.deckDir = deckDir;
    const openers = join(deckDir, 'shots/OPENERS.md');
    const detailsFile = join(deckDir, 'shots/DETAILS.md');
    this.pictures = existsSync(openers) ? parseOpeners(readFileSync(openers, 'utf8')) : [];
    this.details = existsSync(detailsFile) ? parseDetails(readFileSync(detailsFile, 'utf8')) : [];
  }

  /** Registers a reference and returns its asset id. */
  register(ref: ImageRef): AssetId {
    const fromThumbDir = ref.src.includes('/thumb/');
    const id = ref.dark ? twinStem(ref.src) : stemOf(ref.src);
    const existing = this.registry.assets[id];
    if (existing) {
      if (!existing.alt && ref.alt) existing.alt = ref.alt;
      return id;
    }
    const ext = extname(ref.src).toLowerCase();
    const size = this.sizeOf(ref.src);
    const twins: Asset['twins'] = ref.dark
      ? {
          light: `assets/${id}-light${ext}`,
          dark: `assets/${id}-dark${extname(ref.dark).toLowerCase()}`,
        }
      : { neutral: `assets/${stemOf(ref.src)}${ext}` };
    this.registry.files.set(ref.src, 'light' in twins ? twins.light : twins.neutral);
    if (ref.dark && 'dark' in twins) this.registry.files.set(ref.dark, twins.dark);
    const picture = this.pictures.find((p) => stemOf(p.dark) === id || stemOf(p.light) === id);
    const detail = this.details.find((d) => d.name === id);
    const twoTone = picture ? picture.twoTone : /^(opener|mood)-/.test(id);
    const asset: Asset = {
      id,
      role: roleOf(id, fromThumbDir),
      alt: ref.alt,
      twins,
      size,
      scale:
        /^detail-|^proto-.*-(detail|count|list|view|corner|rows|nine|tiles|panel|card|entry|record|head)/.test(
          id,
        )
          ? 2
          : 1,
      source: { kind: 'file' },
      inline: inlineOf(id, fromThumbDir, twoTone),
    };
    if (picture) {
      asset.source = sourceOf(picture);
      if (asset.source.kind === 'material') asset.source.recipeKey = recipeKey(asset.source);
      const treatment = treatmentOf(picture);
      if (treatment) asset.treatment = treatment;
      if (picture.bullets.Credit) asset.credit = picture.bullets.Credit;
      asset.ext = { provenance: pictureNotes(picture) };
    } else if (detail) {
      asset.scale = 2;
      asset.source = {
        kind: 'capture',
        url: pageUrl(detail.page),
        viewport: [1440, 900],
        scale: 2,
        theme: 'both',
        region: detail.region,
        recipe: 'gt-site',
      };
      asset.ext = { provenance: { caption: detail.caption, page: detail.page } };
    } else if (/^site-/.test(id)) {
      asset.source = {
        kind: 'capture',
        url: pageUrl(id.replace(/^site-/, '')),
        viewport: [1440, 900],
        scale: 2,
        theme: ref.dark ? 'both' : 'light',
        recipe: 'gt-site',
      };
    }
    this.registry.assets[id] = asset;
    return id;
  }

  private sizeOf(src: string): [number, number] {
    const path = join(this.deckDir, src);
    if (!existsSync(path)) {
      this.registry.warnings.push(`missing image file ${src}`);
      return [0, 0];
    }
    return imageSize(path) ?? [0, 0];
  }

  /** Copies every registered file under the deck's assets directory; unchanged files are skipped. */
  copyTo(targetDeckDir: string): number {
    let copied = 0;
    for (const [src, dest] of this.registry.files) {
      const from = join(this.deckDir, src);
      const to = join(targetDeckDir, dest);
      if (!existsSync(from)) continue;
      mkdirSync(dirname(to), { recursive: true });
      if (existsSync(to) && sameBytes(from, to)) continue;
      copyFileSync(from, to);
      copied += 1;
    }
    return copied;
  }
}

function sameBytes(a: string, b: string): boolean {
  const fa = readFileSync(a);
  const fb = readFileSync(b);
  return fa.length === fb.length && fa.equals(fb);
}

function pageUrl(page: string): string {
  const paths: Record<string, string> = {
    home: '/',
    pricing: '/pricing',
    usage: '/pricing/usage',
    enterprise: '/enterprise',
    careers: '/careers',
    docs: '/docs',
    'docs-quickstart': '/docs/react/quickstart',
    blog: '/blog',
    'blog-post': '/blog',
    'blog-oss': '/blog/supporting-open-source-software',
    contact: '/contact',
    'report-card': '/report-card',
    '404': '/404',
    dash: 'https://dash.generaltranslation.com/',
  };
  const path = paths[page] ?? `/${page}`;
  return path.startsWith('http') ? path : `https://generaltranslation.com${path}`;
}

/** sha256 of the material recipe, the frame contract of SPEC 5.4. */
export function recipeKey(source: Extract<Asset['source'], { kind: 'material' }>): string {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify([
      source.materialId,
      source.uniforms,
      source.size,
      source.timeMs,
      source.backend,
    ]),
  );
  return `sha256:${hash.digest('hex')}`;
}

function pictureNotes(picture: PictureRecord): Record<string, string> {
  const notes: Record<string, string> = { heading: picture.heading, image: picture.description };
  for (const key of [
    'Source',
    'Image',
    'Crop',
    'Processing',
    'Tone',
    'Frame',
    'Sentence',
    'Placement',
    'License',
    'Artist',
  ]) {
    const value = picture.bullets[key];
    if (value) notes[key.toLowerCase()] = value;
  }
  return notes;
}
