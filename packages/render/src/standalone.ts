// renderStandalone: build-deck.mjs as a function (SPEC 5.2). Fonts inlined at the font slot, every
// asset a data URI by its `inline` rule, the theme boot script, the standalone runtime, and the
// size budget assertion. The asset encoding itself (two-color PNG detection at 98 percent extremes,
// JPEG q88, resample to 1280 at q78, pass-through) needs sharp and runs in the CLI; this function
// takes the encoded data URIs and applies the rules and the budget.
//
// Round five (gslides-parity SPEC-5 2.3; MILESTONES-5 B1 day 6): a deck whose slides carry motion
// writes `<script type="application/json" id="ts-motion">` (the schedules by slide id, the page
// and the autoplay setting) and `<style id="ts-motion-css">` (`MOTION_BASE_CSS` plus every slide's
// `motionCss`, plus the rule that keeps the outgoing slide drawn during a transition), renders its
// blocks with `data-block` so the motion script can address them, and inlines the standalone
// motion script after the runtime; a still deck writes none of it (the GT deck's file is byte for
// byte what it was). `motion: 'drop'` leaves the schedules out; `autoplay` writes `data-autoplay`
// (and `data-loop`) on the stage; `media` decides how a media root's `data-src` travels: as a
// data URI (`inline`), as a URL under `mediaBase` (`url`), or empty with the poster alone
// (`poster`). The used font faces of A5 go in after the Inter faces through `fontSrc` (B7's
// `deckFontsCss`), a data URI resolver in the CLI.
import { BLOCK_CSS } from './block-css.ts';
import { renderSlides, slideCounter } from './deck.ts';
import type { RenderedDeck, ThemeBundle } from './deck.ts';
import { deckFontsCss } from './fonts.ts';
import type { FontSrc } from './fonts.ts';
import { escapeText } from './html.ts';
import { compileMotion, deckMediaLength } from './motion.ts';
import { MOTION_BASE_CSS, motionCss } from './motion-css.ts';
import { STANDALONE_RUNTIME_PLACEHOLDER } from './runtime.ts';
import { counterText, renderStage } from './stage.ts';
import { slideOrder } from './slide.ts';
import type { AssetId, SlideId } from '@turboslide/schema/ids';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { deckAppearance, unskippedSlideOrder } from '@turboslide/schema/deck';
import type { Asset } from '@turboslide/schema/assets';
import type { MotionExportMode, MediaExportMode } from '@turboslide/schema/export';
import type { MotionSchedule } from '@turboslide/schema/motion';
import { blockParagraphCount, motionTargets, slideHasMotion } from '@turboslide/schema/motion';
import type { Theme } from '@turboslide/schema/render';
import { deckPage } from '@turboslide/schema/render';

/** The inlining rule of build-deck.mjs lines 72 to 76 and 174 to 208, read off the asset record. */
export function inlineRuleFor(asset: Asset): Asset['inline'] {
  return asset.inline;
}

/** Bytes a data URI carries, for the budget. */
export function dataUriBytes(uri: string): number {
  const comma = uri.indexOf(',');
  if (comma < 0) return uri.length;
  const payload = uri.slice(comma + 1);
  return uri.startsWith('data:') && /;base64,/.test(uri.slice(0, comma + 1))
    ? Math.floor((payload.length * 3) / 4)
    : payload.length;
}

export type StandaloneBuild = {
  bundle: ThemeBundle;
  /** Data URIs per asset twin path (`assets/x-light.png`), produced by the CLI per the inline rule. */
  assetUris: Record<string, string>;
  /** The standalone runtime script body; the placeholder until @turboslide/viewer lands its port. */
  runtime?: string;
  /** Extra markup the viewer builder wants inside the body before the runtime (chrome). */
  chromeHtml?: string;
  /** Size budget in megabytes (default 16, MILESTONES M1 acceptance). */
  budgetMB?: number;
  title?: string;
  /**
   * The theme the document opens with when no key is stored; the deck's `defaults.appearance`
   * (dark when absent, gslides-parity SPEC 7.2.3).
   */
  defaultTheme?: Theme;
  /** Carry the skipped slides too; left out by default (gslides-parity SPEC 7.2.1). */
  includeSkipped?: boolean;
  /**
   * Carry the speaker notes as a JSON script (`#ts-notes`, slide id to notes) a presenter runtime
   * can read; left out by default (gslides-parity SPEC 7.2.13, decision 15.2).
   */
  includeNotes?: boolean;
  /** keep the transitions and animations (the default) or drop them (gslides-parity SPEC-5 2.3) */
  motion?: MotionExportMode;
  /** advance one step every `intervalMs`, restarting after the last slide under `loop` (SPEC-5 2.3) */
  autoplay?: { intervalMs: number; loop?: boolean };
  /** how a media root's file travels (SPEC-5 3.6; R11 5.7): embedded as a data URI, a URL, or the poster alone */
  media?: MediaExportMode;
  /** the media files as data URIs by their `assets/...` path, for `media: 'embed'` (the default) */
  mediaUris?: Record<string, string>;
  /** the URL prefix a media path is served under, for `media: 'url'` (the studio's `/decks/<id>/`) */
  mediaBase?: string;
  /** the standalone motion script body (viewer/standalone/motion-source.ts); the file plays nothing without it */
  motionScript?: string;
  /** the used font faces beyond Inter, inlined after the Inter faces (SPEC-5 A5 item 5; B7's `deckFontsCss`) */
  fontSrc?: FontSrc;
};

export type StandaloneResult = {
  html: string;
  bytes: number;
  budgetBytes: number;
  overBudget: boolean;
  /** Per asset class counts and bytes, the way build-deck.mjs prints them. */
  inlining: Record<Asset['inline'], { count: number; bytes: number }>;
  missing: string[];
  warnings: string[];
  slides: RenderedDeck['slides'];
  /** Slides left out of the file because they are skipped (SPEC 7.2.1). */
  omitted: SlideId[];
  /** the slides whose schedule the file carries (SPEC-5 2.3); empty for a still deck or under `motion: 'drop'` */
  motion: SlideId[];
};

/**
 * The theme boot script of head.html lines 3 to 9: gt-theme, then gt-deck-theme, dark when neither
 * is set, stamped before first paint so the document never flips.
 */
export function themeBootScript(defaultTheme: Theme = 'dark'): string {
  return `try { var t = localStorage.getItem('gt-theme'); if (t !== 'light' && t !== 'dark') t = localStorage.getItem('gt-deck-theme'); document.documentElement.setAttribute('data-theme', t === 'light' || t === 'dark' ? t : '${defaultTheme}'); } catch (e) { document.documentElement.setAttribute('data-theme', '${defaultTheme}'); }`;
}

/** A picture root in state `live` (dither-attrs.ts): the key follows the state on the same tag. */
const LIVE_DITHER_ROOT = /data-dither-key="([0-9a-f]{64})"[^>]*data-dither-state="live"/g;

/** The words the build refuses a live dithered picture with (SPEC-3 15). */
export const MATERIALIZE_FIRST = 'materialize first';

/** The ids of the two motion elements of the file (SPEC-5 2.3). */
export const MOTION_SCRIPT_ID = 'ts-motion';
export const MOTION_STYLE_ID = 'ts-motion-css';

/** The rule the standalone show needs beside `MOTION_BASE_CSS`: the outgoing slide stays drawn through a transition. */
export const STANDALONE_MOTION_CSS = '.ts-sheet .slide.is-leaving{display:block}';

/** The `#ts-motion` payload (SPEC-5 2.3): the schedules by slide id, the page, the play order and the autoplay setting. */
export type StandaloneMotion = {
  page: { width: number; height: number };
  order: SlideId[];
  schedules: Record<string, MotionSchedule>;
  autoplay?: { intervalMs: number; loop: boolean };
};

/** A media root's `data-src` rewritten for the file (SPEC-5 3.6): a data URI (`embed`), a URL, or nothing (`poster`). */
export function rewriteMediaSources(
  html: string,
  mode: MediaExportMode,
  uris: Readonly<Record<string, string>>,
  base: string,
): { html: string; missing: string[] } {
  const missing: string[] = [];
  const out = html.replace(
    /(<div[^>]*\bdata-media="[^"]*"[^>]*\bdata-src=")([^"]*)(")/g,
    (match, head: string, src: string, tail: string) => {
      if (src === '') return match;
      if (mode === 'poster') return `${head}${tail}`;
      if (mode === 'url') return `${head}${base}${src}${tail}`;
      const uri = uris[src];
      if (uri === undefined) {
        missing.push(src);
        return `${head}${tail}`;
      }
      return `${head}${uri}${tail}`;
    },
  );
  return { html: out, missing };
}

export function renderStandalone(
  deck: Deck,
  slides: Slide[],
  build: StandaloneBuild,
): StandaloneResult {
  const missing: string[] = [];
  const inlining: StandaloneResult['inlining'] = {
    native: { count: 0, bytes: 0 },
    'resample-1280': { count: 0, bytes: 0 },
    'two-color': { count: 0, bytes: 0 },
    'pass-through': { count: 0, bytes: 0 },
  };
  const counted = new Set<string>();
  const assetSrc = (assetId: AssetId, _theme: Theme, path: string): string => {
    const uri = build.assetUris[path];
    if (!uri) {
      missing.push(`${assetId}: ${path}`);
      return path;
    }
    if (!counted.has(path)) {
      counted.add(path);
      const asset = deck.assets[assetId];
      const rule = asset ? inlineRuleFor(asset) : 'pass-through';
      inlining[rule].count += 1;
      inlining[rule].bytes += dataUriBytes(uri);
    }
    return uri;
  };
  // The standalone file carries both themes; the runtime swaps the img twins. Slides are rendered
  // in the default theme so the first paint matches the boot script's default. The play list is
  // the deck without its skipped slides unless asked, and the counter counts over it.
  const theme = build.defaultTheme ?? deckAppearance(deck);
  const byId = new Map(slides.map((slide) => [slide.id, slide]));
  const play =
    build.includeSkipped === true
      ? slideOrder(deck)
      : unskippedSlideOrder({ deck, slides: Object.fromEntries(byId) });
  const omitted = slideOrder(deck).filter((id) => !play.includes(id));
  // the schedules of the played slides that carry motion (SPEC-5 2.3); none under `drop`, and a
  // still deck writes no motion element and renders its blocks as before
  const keepMotion = (build.motion ?? 'keep') === 'keep';
  const moving = keepMotion
    ? play.filter((id) => {
        const slide = byId.get(id);
        return slide !== undefined && slideHasMotion(slide);
      })
    : [];
  const rendered = renderSlides(
    deck,
    slides,
    {
      theme,
      chrome: true,
      assetBase: '',
      assetSrc,
      // the motion script addresses the blocks by data-block (SPEC-5 1.5); a still deck stays as it was
      blockAttrs: moving.length > 0,
      gtWord: true,
    },
    play,
    play,
  );
  // the media files (SPEC-5 3.6): a data URI, a URL, or the poster alone
  const mediaMode: MediaExportMode = build.media ?? 'embed';
  for (const entry of rendered) {
    const rewritten = rewriteMediaSources(
      entry.rendered.html,
      mediaMode,
      build.mediaUris ?? {},
      build.mediaBase ?? '',
    );
    entry.rendered.html = rewritten.html;
    for (const path of rewritten.missing)
      missing.push(`${entry.slideId}: media ${path}: no data URI; the poster alone travels`);
  }
  // a dithered picture without a materialized variant would need the live runtime, which the
  // standalone file never carries (gslides-parity SPEC-3 10.4): the build refuses it by name
  for (const entry of rendered) {
    for (const match of entry.rendered.html.matchAll(LIVE_DITHER_ROOT)) {
      const key = match[1] ?? '';
      missing.push(`${entry.slideId}: dithered picture ${key.slice(0, 12)}: materialize first`);
    }
  }
  const total = play.length;
  const firstSlide = byId.get(rendered[0]?.slideId ?? '');
  const page = deckPage(deck);
  const stageHtml = renderStage(rendered.map((entry) => entry.rendered.html).join('\n'), {
    theme,
    counter: firstSlide ? slideCounter(deck, firstSlide, 1, total) : counterText(1, total),
    sprite: build.bundle.sprite,
    stageId: 'stage',
    page,
  });
  // the autoplay setting rides on the stage root (SPEC-5 2.3); the motion script reads it
  const autoplay =
    build.autoplay !== undefined && build.autoplay.intervalMs > 0
      ? { intervalMs: Math.round(build.autoplay.intervalMs), loop: build.autoplay.loop === true }
      : undefined;
  const stage =
    autoplay === undefined
      ? stageHtml
      : stageHtml.replace(/<div([^>]*\bid="stage"[^>]*)>/, (match, attrs: string) =>
          match.includes('data-autoplay')
            ? match
            : `<div${attrs} data-autoplay="${autoplay.intervalMs}"${autoplay.loop ? ' data-loop=""' : ''}>`,
        );
  // the schedules and the stylesheet (SPEC-5 2.3), only when a slide carries motion
  const schedules: Record<string, MotionSchedule> = {};
  for (const id of moving) {
    const slide = byId.get(id);
    if (slide === undefined) continue;
    const blocks = motionTargets(slide);
    const blockById = new Map(blocks.map((block) => [block.id, block]));
    schedules[id] = compileMotion(
      slide,
      blocks,
      (blockId) => {
        const block = blockById.get(blockId);
        return block === undefined ? 0 : blockParagraphCount(block);
      },
      deckMediaLength(deck, slide),
    );
  }
  const motionCssText =
    moving.length === 0
      ? ''
      : [
          MOTION_BASE_CSS,
          STANDALONE_MOTION_CSS,
          ...moving.map((id) => motionCss(schedules[id]!, page)),
        ]
          .filter((css) => css !== '')
          .join('\n');
  const motionPayload: StandaloneMotion | null =
    moving.length === 0 && autoplay === undefined
      ? null
      : { page, order: play, schedules, ...(autoplay !== undefined ? { autoplay } : {}) };
  const motionElements =
    motionPayload === null
      ? ''
      : (motionCssText === '' ? '' : `<style id="${MOTION_STYLE_ID}">${motionCssText}</style>`) +
        `<script type="application/json" id="${MOTION_SCRIPT_ID}">${JSON.stringify(motionPayload).replace(/</g, '\\u003c')}</script>`;
  const motionScript =
    motionPayload !== null && build.motionScript !== undefined && build.motionScript !== ''
      ? `<script>${build.motionScript}</script>`
      : '';
  // the used faces beyond Inter (A5 item 5), after the Inter faces at the fonts slot
  const usedFontsCss = build.fontSrc === undefined ? '' : deckFontsCss(deck, slides, build.fontSrc);
  // a script element's content is raw text (no entity decoding), so the JSON is not HTML
  // escaped; a `<` inside a note is written as \u003c so `</script>` can never appear
  const notes =
    build.includeNotes === true
      ? `<script type="application/json" id="ts-notes">${JSON.stringify(
          Object.fromEntries(
            play
              .map((id) => [id, byId.get(id)?.notes] as const)
              .filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string'),
          ),
        ).replace(/</g, '\\u003c')}</script>`
      : '';
  const title = build.title ?? deck.title;
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeText(title)}</title><meta name="robots" content="noindex">` +
    `<script>${themeBootScript(theme)}</script>` +
    `<style>${build.bundle.fontsCss}${usedFontsCss === '' ? '' : `\n${usedFontsCss}`}</style><style>${build.bundle.sheetCss}</style><style>${build.bundle.stageCss}</style><style>${BLOCK_CSS}</style>` +
    `<style>:root{color-scheme:light}:root[data-theme="dark"]{color-scheme:dark}html,body{height:100%}body{margin:0;background:var(--paper);overflow:hidden}#ts-stagewrap{position:fixed;inset:0}</style>` +
    motionElements +
    `</head><body>${build.chromeHtml ?? ''}<div id="ts-stagewrap">${stage}</div>${notes}` +
    `<script>${build.runtime ?? STANDALONE_RUNTIME_PLACEHOLDER}</script>${motionScript}</body></html>\n`;
  const bytes = Buffer.byteLength(html);
  const budgetBytes = Math.round((build.budgetMB ?? 16) * 1024 * 1024);
  return {
    html,
    bytes,
    budgetBytes,
    overBudget: bytes > budgetBytes,
    inlining,
    missing,
    warnings: rendered.flatMap((entry) => entry.rendered.warnings),
    slides: rendered,
    omitted,
    motion: moving,
  };
}
