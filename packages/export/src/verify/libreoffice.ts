// LibreOffice and poppler as child processes (SPEC 8.5 step 1): `soffice --headless --convert-to
// pdf` renders the exported file, not the exporter's intent, and poppler turns the 13.333333 by
// 7.5 in pages into 1600 by 900 px images at the slide's pixel size. The rasterizer is pdftocairo,
// not the pdftoppm the spec names: LibreOffice writes the page as 960.009 by 540 pt (its 1/100 mm
// unit) with the background offset by 0.01 mm, and poppler's Splash backend (pdftoppm) resamples
// the 1600 by 900 background across that fraction, so a two-tone picture came back 11.4 percent
// mismatched at 1x and 29 percent at 2x with a box average; the cairo backend at the same size
// reproduced it to the pixel (0.00 percent, calibration deck, both as a slide background and as a
// picture shape). pdftoppm stays as the fallback when pdftocairo is missing. Each conversion runs
// with its own user profile so two jobs never fight over the profile lock. Neither tool is on
// Kevin's Mac; both live in the render worker's Docker image (docker/render-worker.Dockerfile), and
// TURBOSLIDE_SOFFICE, TURBOSLIDE_PDFTOCAIRO and TURBOSLIDE_PDFTOPPM name other installations.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { decodeImage, encodePngRgba } from '@turboslide/effects/io';
import type { RgbaImage } from '@turboslide/effects/image';

const execFileAsync = promisify(execFile);

export type ToolPaths = { soffice: string; pdftocairo: string; pdftoppm: string; pdfinfo: string };

const MAC_SOFFICE = '/Applications/LibreOffice.app/Contents/MacOS/soffice';

/** The tool binaries: the environment first, then the macOS app bundle, then PATH. */
export function resolveTools(env: NodeJS.ProcessEnv = process.env): ToolPaths {
  return {
    soffice: env.TURBOSLIDE_SOFFICE ?? (existsSync(MAC_SOFFICE) ? MAC_SOFFICE : 'soffice'),
    pdftocairo: env.TURBOSLIDE_PDFTOCAIRO ?? 'pdftocairo',
    pdftoppm: env.TURBOSLIDE_PDFTOPPM ?? 'pdftoppm',
    pdfinfo: env.TURBOSLIDE_PDFINFO ?? 'pdfinfo',
  };
}

export type ToolVersions = {
  soffice: string | null;
  pdftocairo: string | null;
  pdftoppm: string | null;
};

async function versionOf(bin: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 60_000 });
    const text = `${stdout}\n${stderr}`.trim().split('\n')[0] ?? '';
    return text.trim() || null;
  } catch {
    return null;
  }
}

/** The first line of `soffice --version`, `pdftocairo -v` and `pdftoppm -v`, or null when a tool is missing. */
export async function toolVersions(tools: ToolPaths = resolveTools()): Promise<ToolVersions> {
  const [soffice, pdftocairo, pdftoppm] = await Promise.all([
    versionOf(tools.soffice, ['--version']),
    versionOf(tools.pdftocairo, ['-v']),
    versionOf(tools.pdftoppm, ['-v']),
  ]);
  return { soffice, pdftocairo, pdftoppm };
}

/**
 * The PDF export filter with its options as LibreOffice 7.4 and later accept them on the command
 * line. Measured on the calibration deck (docs/export-verification.md): the default export
 * re-encodes the slide backgrounds as JPEG (pdfimages listed `jpeg` for three of five pages), which
 * costs 0.36 to 0.74 percent mismatched pixels on a text slide and 11 percent on a dithered
 * picture; lossless compression and no resolution reduction keep the flatten background byte for
 * byte, so what the diff measures is placement, not the PDF codec.
 */
export const PDF_EXPORT_FILTER =
  'impress_pdf_Export:{"UseLosslessCompression":{"type":"boolean","value":"true"},"ReduceImageResolution":{"type":"boolean","value":"false"},"ExportBookmarks":{"type":"boolean","value":"false"}}';

export type ConvertOptions = {
  tools?: ToolPaths;
  /** Default 10 minutes: an 85 slide deck with 2x backgrounds takes LibreOffice a while. */
  timeoutMs?: number;
  log?: (line: string) => void;
};

export type ConvertResult = { pdf: string; ms: number; stdout: string; stderr: string };

/** `soffice --headless --convert-to pdf --outdir <outDir> <file>` with a private profile. */
export async function convertToPdf(
  input: string,
  outDir: string,
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const tools = options.tools ?? resolveTools();
  await mkdir(outDir, { recursive: true });
  const profile = await mkdtemp(join(tmpdir(), 'turboslide-soffice-'));
  const t = performance.now();
  try {
    const args = [
      '--headless',
      '--norestore',
      '--nologo',
      '--nolockcheck',
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--convert-to',
      `pdf:${PDF_EXPORT_FILTER}`,
      '--outdir',
      outDir,
      input,
    ];
    options.log?.(`verify: ${tools.soffice} ${args.join(' ')}`);
    const { stdout, stderr } = await execFileAsync(tools.soffice, args, {
      timeout: options.timeoutMs ?? 600_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const pdf = join(outDir, `${basename(input, extname(input))}.pdf`);
    if (!existsSync(pdf)) {
      throw new Error(
        `verify: soffice produced no ${pdf}\nstdout: ${stdout.trim()}\nstderr: ${stderr.trim()}`,
      );
    }
    return { pdf, ms: Math.round(performance.now() - t), stdout, stderr };
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

export type RasterizeOptions = {
  tools?: ToolPaths;
  /** File name prefix; pdftoppm appends -<page>.png. */
  prefix?: string;
  /** The page in pixels; the slide is 1600 by 900 (SPEC 8.5 step 1). */
  width?: number;
  height?: number;
  /** 120 dpi puts the 13.333333 in page at 1600 px. */
  dpi?: number;
  /**
   * Render at this multiple of the page size and box-average down (default 1). Kept for
   * experiments: with pdftoppm a 2x raster made the two-tone picture worse (29 percent), the
   * cairo backend at 1x is exact.
   */
  supersample?: 1 | 2 | 3;
  /** Use pdftoppm even when pdftocairo is available. */
  rasterizer?: 'pdftocairo' | 'pdftoppm';
  timeoutMs?: number;
  log?: (line: string) => void;
};

/** Exact box average by an integer factor; the factor divides both dimensions. */
export function boxDownsample(image: RgbaImage, factor: number): RgbaImage {
  if (factor === 1) return image;
  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  const data = new Uint8Array(width * height * 4);
  const area = factor * factor;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        let p = ((y * factor + dy) * image.width + x * factor) * 4;
        for (let dx = 0; dx < factor; dx += 1) {
          r += image.data[p] ?? 0;
          g += image.data[p + 1] ?? 0;
          b += image.data[p + 2] ?? 0;
          a += image.data[p + 3] ?? 0;
          p += 4;
        }
      }
      const o = (y * width + x) * 4;
      data[o] = Math.round(r / area);
      data[o + 1] = Math.round(g / area);
      data[o + 2] = Math.round(b / area);
      data[o + 3] = Math.round(a / area);
    }
  }
  return { width, height, data };
}

export type RasterizeResult = { pages: string[]; ms: number };

/**
 * `pdftocairo -png -r 120 -scale-to-x 1600 -scale-to-y 900 <pdf> <outDir>/<prefix>` (pdftoppm with
 * the same arguments as the fallback): one 1600 by 900 PNG per page, in page order.
 */
export async function pdfToPngs(
  pdf: string,
  outDir: string,
  options: RasterizeOptions = {},
): Promise<RasterizeResult & { rasterizer: 'pdftocairo' | 'pdftoppm' }> {
  const tools = options.tools ?? resolveTools();
  const prefix = options.prefix ?? 'page';
  const width = options.width ?? 1600;
  const height = options.height ?? 900;
  const factor = options.supersample ?? 1;
  const rasterizer =
    options.rasterizer ?? ((await versionOf(tools.pdftocairo, ['-v'])) ? 'pdftocairo' : 'pdftoppm');
  await mkdir(outDir, { recursive: true });
  const t = performance.now();
  const args = [
    '-png',
    '-r',
    String((options.dpi ?? 120) * factor),
    '-scale-to-x',
    String(width * factor),
    '-scale-to-y',
    String(height * factor),
    pdf,
    join(outDir, prefix),
  ];
  const bin = rasterizer === 'pdftocairo' ? tools.pdftocairo : tools.pdftoppm;
  options.log?.(`verify: ${bin} ${args.join(' ')}`);
  await execFileAsync(bin, args, { timeout: options.timeoutMs ?? 600_000 });
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\.png$`);
  const pages = (await readdir(outDir))
    .map((name) => ({ name, match: pattern.exec(name) }))
    .filter((e): e is { name: string; match: RegExpExecArray } => e.match !== null)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
    .map((e) => join(outDir, e.name));
  if (factor > 1) {
    for (const page of pages) {
      const big = await decodeImage(page);
      await writeFile(page, await encodePngRgba(boxDownsample(big, factor)));
    }
  }
  return { pages, ms: Math.round(performance.now() - t), rasterizer };
}

export type RenderPagesResult = {
  pdf: string;
  pages: string[];
  versions: ToolVersions;
  rasterizer?: 'pdftocairo' | 'pdftoppm';
  convertMs: number;
  rasterMs: number;
};

/** The whole path from an exported file to page PNGs at the slide size. */
export async function renderPptxPages(
  input: string,
  outDir: string,
  options: ConvertOptions & RasterizeOptions = {},
): Promise<RenderPagesResult> {
  const tools = options.tools ?? resolveTools();
  const versions = await toolVersions(tools);
  if (!versions.soffice) {
    throw new Error(
      `verify: LibreOffice is not available as ${tools.soffice}; run the loop in the render worker image (docker/render-worker.Dockerfile) or set TURBOSLIDE_SOFFICE`,
    );
  }
  if (!versions.pdftocairo && !versions.pdftoppm) {
    throw new Error(
      `verify: neither ${tools.pdftocairo} nor ${tools.pdftoppm} is available; install poppler-utils or set TURBOSLIDE_PDFTOCAIRO`,
    );
  }
  const converted = await convertToPdf(input, outDir, { ...options, tools });
  const pagesDir = join(outDir, `${basename(input, extname(input))}-pages`);
  await rm(pagesDir, { recursive: true, force: true });
  const rasterized = await pdfToPngs(converted.pdf, pagesDir, { ...options, tools });
  return {
    pdf: converted.pdf,
    pages: rasterized.pages,
    versions,
    rasterizer: rasterized.rasterizer,
    convertMs: converted.ms,
    rasterMs: rasterized.ms,
  };
}
