// The landing's captured and gallery figures (docs/DESIGN.md 8.0 "Figures", 8.10, 8.12). D4's build
// module; scripts/build-home-assets.ts calls it in its derivation, which runs no browser:
//
// - The Present band's figure: the product's presenter view of the page deck in each appearance,
//   the two captures scripts/home/capture.ts --record wrote under
//   apps/studio/home-deck/recorded-presenter/ (2,048 by 1,280, lossless), served as WebP at 1x
//   (1,024 by 640, at most 25,000 B) and 2x (at most 60,000 B).
// - The export band's figure: the editor's Download dialog on the same page deck in each
//   appearance, the dialog alone on a transparent ground (capture.ts --only download), served as
//   WebP with its alpha at 1x (at most 20,000 B) and 2x (at most 40,000 B, so the page's pictures
//   after a full scroll stay under 200 KB at 2x).
// - The patterns band's cards: the 17 stills the editor's Insert > Animated pattern gallery shows
//   (packages/materials/previews/<material>.webp, 320 by 200, the files the gallery's cards
//   draw), served byte for byte under /home/, with the gallery's names and order in
//   pattern-cards.generated.ts.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { GALLERY_MATERIAL_IDS, MATERIALS } from '../../packages/materials/src/catalog.ts';
import { shaderPreviewFile } from '../../packages/materials/src/previews.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PRESENTER_DIR = 'apps/studio/home-deck/recorded-presenter';
export const DOWNLOAD_DIR = 'apps/studio/home-deck/recorded-download';
const PREVIEWS_DIR = 'packages/materials/previews';

/** The served presenter view's sizes and budgets (DESIGN.md 8.10). */
export const PRESENTER_VARIANTS = [
  { variant: 'x1', scale: 1, budget: 25_000 },
  { variant: 'x2', scale: 2, budget: 60_000 },
] as const;

/** The recording's index (capture.ts writes it): what was captured and the two files' hashes. */
export type PresenterRecording = {
  generator: string;
  route: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  slide: number;
  files: { appearance: 'light' | 'dark'; file: string; sha256: string }[];
};

/** The Download dialog's recording (capture.ts writes it): the picture's CSS size and its files. */
export type DownloadRecording = {
  generator: string;
  route: string;
  size: { width: number; height: number };
  deviceScaleFactor: number;
  files: { appearance: 'light' | 'dark'; file: string; sha256: string }[];
};

/** The served Download dialog's budgets (DESIGN.md 8.11). */
export const DOWNLOAD_VARIANTS = [
  { variant: 'x1', scale: 1, budget: 20_000 },
  { variant: 'x2', scale: 2, budget: 40_000 },
] as const;

/** One file this module serves: build-home-assets.ts names it, hashes it and lists it. */
export type FigureFile = {
  role: 'presenter' | 'download-dialog' | 'pattern-card';
  appearance: 'light' | 'dark' | null;
  variant: 'x1' | 'x2' | null;
  bytes: Uint8Array;
  /** the material a card shows; null for the presenter view */
  material: string | null;
};

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function fail(message: string): never {
  console.error(`home/figures: ${message}`);
  process.exit(1);
}

/**
 * The presenter view at 1x and 2x in each appearance, from the recorded captures. Lossy WebP at
 * the highest quality of 90, 86, 82, ... that holds the variant's budget, so the same capture
 * always makes the same file.
 */
export async function derivePresenterFiles(): Promise<FigureFile[]> {
  const index = resolve(ROOT, PRESENTER_DIR, 'presenter.json');
  if (!existsSync(index))
    fail(`${PRESENTER_DIR}/presenter.json is missing; run node scripts/home/capture.ts --record`);
  const recording = JSON.parse(readFileSync(index, 'utf8')) as PresenterRecording;
  const { width, height } = recording.viewport;
  const out: FigureFile[] = [];
  for (const entry of recording.files) {
    const png = new Uint8Array(readFileSync(resolve(ROOT, PRESENTER_DIR, entry.file)));
    if (sha256(png) !== entry.sha256)
      fail(`${PRESENTER_DIR}/${entry.file} is not the file presenter.json records`);
    for (const { variant, scale, budget } of PRESENTER_VARIANTS) {
      let bytes: Uint8Array | null = null;
      for (let quality = 90; quality >= 50 && bytes === null; quality -= 4) {
        const made = new Uint8Array(
          await sharp(png)
            /* the console is opaque: no alpha plane in the served file */
            .removeAlpha()
            .resize(width * scale, height * scale, { kernel: 'lanczos3' })
            .webp({ quality, effort: 6, smartSubsample: true })
            .toBuffer(),
        );
        if (made.length <= budget) bytes = made;
      }
      if (bytes === null) fail(`the ${entry.appearance} presenter view at ${variant} is over ${budget} B at quality 50`);
      out.push({ role: 'presenter', appearance: entry.appearance, variant, bytes, material: null });
    }
  }
  return out;
}

/** The Download dialog at 1x and 2x in each appearance, its transparent ground kept as alpha. */
export async function deriveDownloadFiles(): Promise<FigureFile[]> {
  const index = resolve(ROOT, DOWNLOAD_DIR, 'download.json');
  if (!existsSync(index))
    fail(`${DOWNLOAD_DIR}/download.json is missing; run node scripts/home/capture.ts --record --only download`);
  const recording = JSON.parse(readFileSync(index, 'utf8')) as DownloadRecording;
  const { width, height } = recording.size;
  const out: FigureFile[] = [];
  for (const entry of recording.files) {
    const png = new Uint8Array(readFileSync(resolve(ROOT, DOWNLOAD_DIR, entry.file)));
    if (sha256(png) !== entry.sha256)
      fail(`${DOWNLOAD_DIR}/${entry.file} is not the file download.json records`);
    for (const { variant, scale, budget } of DOWNLOAD_VARIANTS) {
      let bytes: Uint8Array | null = null;
      for (let quality = 90; quality >= 50 && bytes === null; quality -= 4) {
        const made = new Uint8Array(
          await sharp(png)
            .resize(width * scale, height * scale, { kernel: 'lanczos3' })
            .webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: true })
            .toBuffer(),
        );
        if (made.length <= budget) bytes = made;
      }
      if (bytes === null) fail(`the ${entry.appearance} Download dialog at ${variant} is over ${budget} B at quality 50`);
      out.push({ role: 'download-dialog', appearance: entry.appearance, variant, bytes, material: null });
    }
  }
  return out;
}

/** The gallery's 17 stills in its order, each with its name. */
export function derivePatternCardFiles(): FigureFile[] {
  return GALLERY_MATERIAL_IDS.map((material) => {
    const file = resolve(ROOT, PREVIEWS_DIR, shaderPreviewFile(material));
    if (!existsSync(file)) fail(`${PREVIEWS_DIR}/${shaderPreviewFile(material)} is missing`);
    return {
      role: 'pattern-card' as const,
      appearance: null,
      variant: null,
      bytes: new Uint8Array(readFileSync(file)),
      material,
    };
  });
}

/** pattern-cards.generated.ts: each card's name and served path, in the gallery's order. */
export function derivePatternCardsModule(
  header: string,
  cards: readonly { material: string; path: string; width: number; height: number }[],
): string {
  const size = cards[0];
  if (size === undefined) fail('the gallery has no stills');
  for (const card of cards)
    if (card.width !== size.width || card.height !== size.height)
      fail(`${card.path} is ${card.width} by ${card.height}, not ${size.width} by ${size.height}`);
  const rows = cards.map((card) => {
    const entry = MATERIALS[card.material];
    if (entry === undefined) fail(`no catalog entry for ${card.material}`);
    return { name: entry.label, path: card.path };
  });
  return `${header}
//
// The patterns band's cards (docs/DESIGN.md 8.12): the stills of the editor's Insert > Animated
// pattern gallery (packages/materials/previews, GALLERY_MATERIAL_IDS of the catalog), each with
// the gallery's name, served under /home/ (assets.json role \`pattern-card\`).
export const HOME_PATTERN_CARDS: readonly { name: string; path: string }[] = ${JSON.stringify(rows, null, 2)};

/** Every card's size in pixels, which the page writes on each \`img\` so nothing moves on load. */
export const HOME_PATTERN_CARD_SIZE = { width: ${size.width}, height: ${size.height} } as const;
`;
}
