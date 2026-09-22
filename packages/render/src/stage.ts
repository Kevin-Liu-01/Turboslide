// The stage around a slide (SPEC 5.2): the frame with its two rails, two rules and four registration
// crosses (head:39-49), the wordmark (head:52-53, 463) and the counter (head:51, 464). A slide never
// draws these. The sprite is emitted once per stage so `<use href="#gt-mark">` and the icons resolve.
//
// The brand kit's frame band (docs/PRODUCT.md 4.1, 4.4; B5a): the wordmark is the footer's logo
// slot and the counter the footer's right, both drawn from the kit record when the deck carries
// one. `frameBandOf(deck, ...)` reads the record into one value, `FrameBand`, that the stage here,
// the viewer's Frame (packages/viewer/src/Frame.tsx) and the export masters render the same way:
// the logo's kind (the deployment's default logo, none, or a picture fitted into the 28 by 18 box
// scaled to the asset's ratio), its corner, the footer text at the band's centre, and the
// counter's format. A deck without a record answers the GT band, which renders byte for byte as
// the stage did before the kit existed.
import type { BrandKit, CounterFormat, SlotPosition } from '@turboslide/schema/brand';
import type { Deck } from '@turboslide/schema/deck';
import { deckCounterFormat } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';
import { el, escapeAttr, escapeText } from './html.ts';

/** The frame markup of head.html lines 394 to 397. */
export const FRAME_HTML =
  '<div class="frame"><div class="rule top"></div><div class="rule bottom"></div><span class="cross tl"></span><span class="cross tr"></span><span class="cross bl"></span><span class="cross br"></span></div>';

/** The wordmark: the mark at 28 by 18 in titanium (head:463). */
export const WORDMARK_HTML =
  '<div class="wordmark" aria-hidden="true"><svg width="28" height="18" fill="currentColor"><use href="#gt-mark"/></svg></div>';

/** The footer logo's box: 18 px tall, scaled to the asset's ratio and capped at 120 px wide (PRODUCT.md 4.1). */
export const FOOTER_LOGO = { h: 18, maxW: 120, defaultW: 28 } as const;

/** The title slide's logo box the kit fits a picture into (PRODUCT.md 4.1). */
export const MARK_BOX = { w: 132, h: 84 } as const;

const pad = (v: number): string => (v < 10 ? `0${v}` : String(v));

/**
 * The counter's text in a format (PRODUCT.md 4.1 Slide numbers): `01 / 85` in tabular numerals
 * (tail:249, the default), `01`, or `Slide 1`.
 */
export function counterText(n: number, total: number, format: CounterFormat = 'n / N'): string {
  switch (format) {
    case 'n':
      return pad(n);
    case 'Slide n':
      return `Slide ${n}`;
    default:
      return `${pad(n)} / ${pad(total)}`;
  }
}

/** The footer's logo slot as one value every surface draws the same way. */
export type FrameBandLogo =
  | { kind: 'default'; position: SlotPosition }
  | { kind: 'none' }
  | {
      kind: 'picture';
      position: SlotPosition;
      /** the twin URL per appearance, resolved by the caller */
      src: string;
      w: number;
      h: number;
      alt: string;
    };

/** The frame band: the logo slot, the footer text and the counter's format. */
export type FrameBand = {
  logo: FrameBandLogo;
  text?: string;
  counterFormat: CounterFormat;
  /** true when the band differs from the GT band a deck without a record draws */
  kit: boolean;
};

/** The GT band: the wordmark bottom left, no text, `n / N`. */
export const GT_BAND: FrameBand = {
  logo: { kind: 'default', position: 'bottom-left' },
  counterFormat: 'n / N',
  kit: false,
};

/** Resolves an asset id to the twin URL of an appearance and its stored size; undefined for an unknown asset. */
export type BandAssetResolver = (
  assetId: string,
  theme: Theme,
) => { src: string; size: [number, number]; alt: string } | undefined;

/**
 * The band's resolver over a deck's assets: the twin path of the appearance (the neutral twin
 * when the asset has one) through the caller's URL rule, the renderer's `assetSrc` or its
 * `assetBase` prefix. One helper, so the editor, the viewer, the print page, the standalone file
 * and the export capture resolve the footer logo the same way (docs/PRODUCT.md 4.1, 4.4).
 */
export function bandAssetResolver(
  deck: Pick<Deck, 'assets'>,
  url: (assetId: string, theme: Theme, path: string) => string,
): BandAssetResolver {
  return (assetId, theme) => {
    const asset = deck.assets[assetId];
    if (asset === undefined) return undefined;
    const path = 'neutral' in asset.twins ? asset.twins.neutral : asset.twins[theme];
    return { src: url(assetId, theme, path), size: asset.size, alt: asset.alt };
  };
}

/** The picture box of the footer slot: 18 px tall, the width from the asset's ratio, capped. */
export function footerLogoBox(size: [number, number]): { w: number; h: number } {
  const [w, h] = size;
  const ratio = w > 0 && h > 0 ? w / h : 1;
  return { w: Math.round(Math.min(FOOTER_LOGO.maxW, FOOTER_LOGO.h * ratio)), h: FOOTER_LOGO.h };
}

/**
 * The frame band of a deck (PRODUCT.md 4.1): the footer logo from `footer.logo` (the default
 * logo when absent), moved by `positions.footerLogo`, the footer text and the counter's format.
 * A picture whose asset the deck lacks falls back to the default logo, so a removed asset never
 * blanks the band. The GT band for a deck without a record.
 */
export function frameBandOf(
  deck: Pick<Deck, 'brand'>,
  theme: Theme,
  resolve?: BandAssetResolver,
): FrameBand {
  const kit: BrandKit | undefined = deck.brand;
  if (kit === undefined) return GT_BAND;
  const position = kit.positions?.footerLogo ?? 'bottom-left';
  const logoKind = kit.footer?.logo ?? 'default';
  let logo: FrameBandLogo;
  if (position === 'hidden' || logoKind === 'none') logo = { kind: 'none' };
  else if (logoKind === 'picture' && kit.footer?.assetId !== undefined) {
    const picture = resolve?.(kit.footer.assetId, theme);
    logo =
      picture === undefined
        ? { kind: 'default', position }
        : {
            kind: 'picture',
            position,
            src: picture.src,
            alt: picture.alt,
            ...footerLogoBox(picture.size),
          };
  } else logo = { kind: 'default', position };
  const text = kit.footer?.text?.trim();
  const counterFormat = deckCounterFormat(deck);
  const band: FrameBand = {
    logo,
    ...(text !== undefined && text !== '' ? { text } : {}),
    counterFormat,
    kit: true,
  };
  const isGt =
    logo.kind === 'default' &&
    logo.position === 'bottom-left' &&
    band.text === undefined &&
    counterFormat === 'n / N';
  return isGt ? GT_BAND : band;
}

/** The class of a corner on the band's logo. */
export function positionClass(position: SlotPosition): string {
  return `pos-${position}`;
}

/**
 * The band's markup (the stage's `.wordmark` and, when the kit names one, the footer text): the
 * GT wordmark byte for byte for the GT band; for a kit band the wordmark carries the corner
 * class and holds the mark, a picture, or nothing at all.
 */
export function frameBandHtml(band: FrameBand): string {
  if (!band.kit) return WORDMARK_HTML;
  let logo = '';
  /* the class ts-kit-wordmark is the one the viewer's Frame gives the band: the theme sheet hides
     `.wordmark:not(.ts-kit-wordmark)` whenever the kit draws the footer (theme-css.ts), so without
     it the export's document and the print document drew no footer logo (docs/FEATURES.md 4.8;
     build/b7.md R1) */
  if (band.logo.kind === 'default')
    logo = `<div class="wordmark ts-kit-wordmark ${positionClass(band.logo.position)}" aria-hidden="true"><svg width="28" height="18" fill="currentColor"><use href="#gt-mark"/></svg></div>`;
  else if (band.logo.kind === 'picture')
    logo = `<div class="wordmark ts-kit-wordmark ${positionClass(band.logo.position)} is-picture" aria-hidden="true" style="width:${band.logo.w}px"><img src="${escapeAttr(band.logo.src)}" width="${band.logo.w}" height="${band.logo.h}" alt=""></div>`;
  const text =
    band.text !== undefined
      ? `<div class="ts-kit-footer" aria-hidden="true">${escapeText(band.text)}</div>`
      : '';
  return logo + text;
}

/**
 * The band a surface draws on one slide: the footer text is left off a title slide (docs/PRODUCT.md
 * 4.4: "every slide but the title"); the logo and the counter format stay. The show's stage keeps
 * the text in its markup and hides it through `is-title-slide` (renderStage, runtime.ts).
 */
export function bandForSlide(
  band: FrameBand,
  slide: { kind?: string } | null | undefined,
): FrameBand {
  if (slide?.kind !== 'title' || band.text === undefined) return band;
  const { text: _text, ...rest } = band;
  return rest;
}

export type StageOptions = {
  theme: Theme;
  /** the slide on the stage is a title slide: the band's footer text is hidden (docs/PRODUCT.md 4.4) */
  titleSlide?: boolean;
  /** The counter text, or none for a stage without a counter. */
  counter?: string;
  /** The sprite markup (63 Heroicons plus gt-mark, head:398-462), emitted inside the stage. */
  sprite?: string;
  /** The `ts-present` class: the sheet fills the viewport with no edge (head:322-328). */
  present?: boolean;
  /** Extra classes on the sheet root. */
  sheetClass?: string;
  /** An id for the stage element (the deck's `#stage`, tail:76). */
  stageId?: string;
  /** The brand kit's frame band (frameBandOf); the GT wordmark when absent. */
  band?: FrameBand;
};

/**
 * Wraps rendered slides in the sheet and the stage: `.ts-sheet.sheet[data-theme]` at 1600 by 900,
 * `.ts-stage.stage` scaled by the viewer, the frame first, the sprite, the slides, then the
 * wordmark and the counter over them. Both the `ts-` classes (SPEC 5.1, 5.5) and the deck's class
 * names are written so the theme's stage.css applies whichever selector it kept.
 */
export function renderStage(slidesHtml: string, options: StageOptions): string {
  const counter = options.counter
    ? el('div', { class: 'counter' }, escapeAttr(options.counter))
    : '<div class="counter"></div>';
  const stage = el(
    'div',
    {
      class: ['ts-stage', 'stage', options.titleSlide === true && 'is-title-slide']
        .filter((c): c is string => typeof c === 'string')
        .join(' '),
      id: options.stageId,
    },
    FRAME_HTML +
      (options.sprite ?? '') +
      slidesHtml +
      frameBandHtml(options.band ?? GT_BAND) +
      counter,
  );
  return el(
    'div',
    {
      class: ['ts-sheet', 'sheet', options.present && 'ts-present', options.sheetClass]
        .filter((c): c is string => typeof c === 'string')
        .join(' '),
      'data-theme': options.theme,
    },
    stage,
  );
}
