// renderStandalone: build-deck.mjs as a function (SPEC 5.2). Fonts inlined at the font slot, every
// asset a data URI by its `inline` rule, the theme boot script, the standalone runtime, and the
// size budget assertion. The asset encoding itself (two-color PNG detection at 98 percent extremes,
// JPEG q88, resample to 1280 at q78, pass-through) needs sharp and runs in the CLI; this function
// takes the encoded data URIs and applies the rules and the budget.
import { BLOCK_CSS } from './block-css.ts';
import { renderSlides, slideCounter } from './deck.ts';
import type { RenderedDeck, ThemeBundle } from './deck.ts';
import { escapeText } from './html.ts';
import { STANDALONE_RUNTIME_PLACEHOLDER } from './runtime.ts';
import { counterText, renderStage } from './stage.ts';
import { slideOrder } from './slide.ts';
import type { AssetId, SlideId } from '@turboslide/schema/ids';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { deckAppearance, unskippedSlideOrder } from '@turboslide/schema/deck';
import type { Asset } from '@turboslide/schema/assets';
import type { Theme } from '@turboslide/schema/render';

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
  const rendered = renderSlides(
    deck,
    slides,
    {
      theme,
      chrome: true,
      assetBase: '',
      assetSrc,
      blockAttrs: false,
      gtWord: true,
    },
    play,
    play,
  );
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
  const stage = renderStage(rendered.map((entry) => entry.rendered.html).join('\n'), {
    theme,
    counter: firstSlide ? slideCounter(deck, firstSlide, 1, total) : counterText(1, total),
    sprite: build.bundle.sprite,
    stageId: 'stage',
  });
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
    `<style>${build.bundle.fontsCss}</style><style>${build.bundle.sheetCss}</style><style>${build.bundle.stageCss}</style><style>${BLOCK_CSS}</style>` +
    `<style>:root{color-scheme:light}:root[data-theme="dark"]{color-scheme:dark}html,body{height:100%}body{margin:0;background:var(--paper);overflow:hidden}#ts-stagewrap{position:fixed;inset:0}</style>` +
    `</head><body>${build.chromeHtml ?? ''}<div id="ts-stagewrap">${stage}</div>${notes}` +
    `<script>${build.runtime ?? STANDALONE_RUNTIME_PLACEHOLDER}</script></body></html>\n`;
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
  };
}
