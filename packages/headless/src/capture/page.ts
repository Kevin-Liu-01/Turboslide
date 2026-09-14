// The page capture job (SPEC 7.1 asset.capture; MILESTONES M5 item 1): one page at 1440 by 900
// in one or both themes at device scale factor 2 through a per-site recipe, the viewport or a
// region as the asset's twins, and identical-region 2x detail crops as further assets. Each theme
// gets its own context (the recipe's init script, the color scheme, reduced motion), so the light
// and the dark twin come from two clean documents of the same URL. Files land under the deck's
// assets/ as JPEG quality 92 (4:4:4) or PNG; the asset record carries the capture source of
// SPEC 4.2 (url, viewport, scale, theme, region, recipe). The store write is the caller's.
import { basename } from 'node:path';

import type { Browser, BrowserContext } from 'playwright-core';
import sharp from 'sharp';

import type { Asset } from '@turboslide/schema/assets';

import { launchBrowser } from '../launch.ts';
import type { LaunchOptions, LaunchedBrowser } from '../launch.ts';
import './gt-site.ts';
import { recipeFor, settlePage } from './recipes.ts';
import type { CaptureRecipe, CaptureTheme } from './recipes.ts';
import { checkRegion, cropRegion, detailId } from './region.ts';
import type { Region } from './region.ts';
import { assertAllowedHost, assetIdFrom, imageInfo, inlineRuleFor, writeUnder } from './shared.ts';

/** SPEC 4.2: a capture source records a 1440 by 900 viewport at scale 2. */
export const CAPTURE_VIEWPORT: [1440, 900] = [1440, 900];
export const CAPTURE_SCALE = 2;

export type PageCaptureRequest = {
  url: string;
  id?: string;
  alt?: string;
  role?: 'capture' | 'detail';
  viewport?: [number, number];
  scale?: 1 | 2;
  theme: CaptureTheme | 'both';
  region?: Region;
  details?: Region[];
  recipe?: string;
  settleMs?: number;
  format?: 'jpg' | 'png';
  allowHosts?: string[];
};

export type PageCaptureOptions = {
  deckDir: string;
  /** A browser to reuse; otherwise one is launched and closed. */
  browser?: Browser;
  launch?: LaunchOptions;
  /** Navigation timeout in ms; default 45 000. */
  timeoutMs?: number;
  log?: (line: string) => void;
};

export type PageCaptureResult = {
  asset: Asset;
  details: Asset[];
  /** Files written, relative to the deck directory. */
  files: string[];
  renderer: string;
  ms: number;
};

type Shot = { theme: CaptureTheme; png: Uint8Array };

async function encode(png: Uint8Array, format: 'jpg' | 'png'): Promise<Uint8Array> {
  if (format === 'png') return png;
  const out = await sharp(Buffer.from(png.buffer, png.byteOffset, png.byteLength))
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

const PRIVATE_HOST =
  /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])(?:\.\d{1,3}){2}|\[::1\]|\[fc[0-9a-f]{2}:.*\]|\[fd[0-9a-f]{2}:.*\]|\[fe80:.*\]|metadata\.google\.internal)$|\.localhost$|\.internal$/i;

/** Aborts a captured page's requests to private and loopback hosts, other than the capture's own host. */
export async function denyPrivateEgress(context: BrowserContext, ownHost: string): Promise<void> {
  const own = ownHost.toLowerCase();
  await context.route('**/*', (route) => {
    let host = '';
    try {
      host = new URL(route.request().url()).hostname.toLowerCase();
    } catch {
      return route.continue();
    }
    if (host === own || !PRIVATE_HOST.test(host)) return route.continue();
    return route.abort('blockedbyclient');
  });
}

async function shootTheme(
  browser: Browser,
  recipe: CaptureRecipe,
  request: PageCaptureRequest,
  theme: CaptureTheme,
  viewport: [number, number],
  scale: number,
  timeoutMs: number,
): Promise<{ page: Uint8Array; details: Uint8Array[] }> {
  const context = await browser.newContext({
    viewport: { width: viewport[0], height: viewport[1] },
    deviceScaleFactor: scale,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  try {
    // the captured page's own subresources may come from anywhere public; a request to a private
    // or loopback address from inside the page is aborted (gslides-parity SPEC-3 8.6), unless the
    // capture itself targets a loopback name (the Prototemplate dev server on a checkout)
    await denyPrivateEgress(context, new URL(request.url).hostname);
    if (recipe.init !== undefined) await context.addInitScript(recipe.init, { theme });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.goto(request.url, { waitUntil: 'load' });
    if (recipe.css !== undefined) await page.addStyleTag({ content: recipe.css });
    await settlePage(page, request.settleMs ?? recipe.settleMs, recipe.scrollPass);
    const clip =
      request.region !== undefined
        ? {
            x: request.region[0],
            y: request.region[1],
            width: request.region[2],
            height: request.region[3],
          }
        : { x: 0, y: 0, width: viewport[0], height: viewport[1] };
    const shot = await page.screenshot({
      type: 'png',
      clip,
      animations: 'disabled',
      caret: 'hide',
    });
    const full =
      request.details !== undefined && request.details.length > 0
        ? request.region === undefined
          ? shot
          : await page.screenshot({
              type: 'png',
              clip: { x: 0, y: 0, width: viewport[0], height: viewport[1] },
              animations: 'disabled',
              caret: 'hide',
            })
        : undefined;
    const details: Uint8Array[] = [];
    for (const region of request.details ?? []) {
      if (full === undefined) break;
      details.push(await cropRegion(new Uint8Array(full), region, scale));
    }
    return { page: new Uint8Array(shot), details };
  } finally {
    await context.close();
  }
}

function themesOf(theme: CaptureTheme | 'both'): CaptureTheme[] {
  return theme === 'both' ? ['light', 'dark'] : [theme];
}

async function writeTwins(
  deckDir: string,
  id: string,
  shots: Shot[],
  format: 'jpg' | 'png',
): Promise<{ twins: Asset['twins']; files: string[]; size: [number, number] }> {
  const ext = format === 'png' ? '.png' : '.jpg';
  const files: string[] = [];
  const first = shots[0];
  if (first === undefined) throw new Error('no capture');
  const info = await imageInfo(first.png);
  if (shots.length === 1) {
    const path = await writeUnder(deckDir, `assets/${id}${ext}`, await encode(first.png, format));
    files.push(path);
    return { twins: { neutral: path }, files, size: [info.width, info.height] };
  }
  const twins: { light: string; dark: string } = { light: '', dark: '' };
  for (const shot of shots) {
    const path = await writeUnder(
      deckDir,
      `assets/${id}-${shot.theme}${ext}`,
      await encode(shot.png, format),
    );
    files.push(path);
    twins[shot.theme] = path;
  }
  return { twins, files, size: [info.width, info.height] };
}

/**
 * Captures a page as an asset with twins, plus one asset per detail region. The request's
 * viewport and scale must be the ones the asset schema records (1440 by 900 at 2); the host must
 * be on the allowlist.
 */
export async function capturePage(
  request: PageCaptureRequest,
  options: PageCaptureOptions,
): Promise<PageCaptureResult> {
  const started = performance.now();
  const url = assertAllowedHost(request.url, request.allowHosts);
  const viewport = request.viewport ?? CAPTURE_VIEWPORT;
  const scale = request.scale ?? CAPTURE_SCALE;
  if (
    viewport[0] !== CAPTURE_VIEWPORT[0] ||
    viewport[1] !== CAPTURE_VIEWPORT[1] ||
    scale !== CAPTURE_SCALE
  ) {
    throw new RangeError(
      `a capture source records a ${CAPTURE_VIEWPORT.join(' by ')} viewport at scale ${CAPTURE_SCALE} (SPEC 4.2); got ${viewport.join(' by ')} at ${scale}`,
    );
  }
  const recipe = recipeFor(request.recipe ?? 'gt-site');
  const region = request.region === undefined ? undefined : checkRegion(request.region, viewport);
  const details = (request.details ?? []).map((box) => checkRegion(box, viewport));
  const id = request.id ?? assetIdFrom(url.href);
  const format = request.format ?? 'jpg';
  const themes = themesOf(request.theme);
  const timeoutMs = options.timeoutMs ?? 45_000;

  let launched: LaunchedBrowser | undefined;
  const browser = options.browser ?? (launched = await launchBrowser(options.launch)).browser;
  const renderer = launched?.renderer ?? 'reused browser';
  const shots: Shot[] = [];
  const detailShots: Shot[][] = details.map(() => []);
  try {
    for (const theme of themes) {
      options.log?.(`capture: ${url.href} ${theme} through ${recipe.id}`);
      const result = await shootTheme(
        browser,
        recipe,
        { ...request, ...(region !== undefined ? { region } : {}), details },
        theme,
        viewport,
        scale,
        timeoutMs,
      );
      shots.push({ theme, png: result.page });
      result.details.forEach((png, index) => detailShots[index]?.push({ theme, png }));
    }
  } finally {
    if (launched !== undefined) await launched.close();
  }

  const files: string[] = [];
  const main = await writeTwins(options.deckDir, id, shots, format);
  files.push(...main.files);
  const base = {
    viewport: CAPTURE_VIEWPORT,
    scale: CAPTURE_SCALE,
    theme: request.theme,
    recipe: recipe.id,
  } as const;
  const asset: Asset = {
    id,
    role: request.role ?? 'capture',
    alt:
      request.alt ??
      `${url.hostname}${url.pathname === '/' ? '' : url.pathname} at ${viewport[0]} by ${viewport[1]}`,
    twins: main.twins,
    size: main.size,
    scale: CAPTURE_SCALE,
    source: {
      kind: 'capture',
      url: url.href,
      ...base,
      ...(region !== undefined ? { region } : {}),
    },
    inline: inlineRuleFor(request.role ?? 'capture', false),
  };
  const detailAssets: Asset[] = [];
  for (const [index, box] of details.entries()) {
    const shotsFor = detailShots[index] ?? [];
    if (shotsFor.length === 0) continue;
    const detail = detailId(id, index);
    const written = await writeTwins(options.deckDir, detail, shotsFor, format);
    files.push(...written.files);
    detailAssets.push({
      id: detail,
      role: 'detail',
      alt: `${basename(url.pathname) || url.hostname}: detail ${index + 1} at ${box[2]} by ${box[3]}`,
      twins: written.twins,
      size: written.size,
      scale: CAPTURE_SCALE,
      source: { kind: 'capture', url: url.href, ...base, region: box },
      inline: inlineRuleFor('detail', false),
    });
  }
  return {
    asset,
    details: detailAssets,
    files,
    renderer,
    ms: Math.round(performance.now() - started),
  };
}
