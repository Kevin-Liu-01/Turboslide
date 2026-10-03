import { HERO, SLIDES } from './copy';
import { HomeLink } from './HomeLink';
import { HomeSheet, ServerHtml } from './HomeSheet';
import { HOME_STILLS_CSS } from './slides.generated';

/**
 * The hero, slide 1 (docs/LANDING.md 2.2): the page deck's title slide as a working slide. Its
 * title is the page's h1, hand set in three lines at 150 units of the 1,600 unit sheet (96 px at
 * 1,024 px), final in the first frame and the LCP element; under 720 px it leaves the slide and
 * sits above the sheet at 40 px. The subtitle is the visit's sentence (the markup holds the first;
 * L4's boot script sets the next one each visit before the first paint). The Blue Marble prints
 * through the 8 by 8 screen at 2 px cells in the sheet's lower right (Kevin's answer 1), its still
 * inlined as a mask over the sheet's ink, with a clear zone of paper under every box so type never
 * sits on dither. No frame: each side of the column shows the page rail and the sheet's rail.
 *
 * Under the sheet, the caption row (the pointer or the touch sentence by media query, and Undo),
 * then the lead row (the lead and the two buttons, square, 40 px). The selection replica, the
 * typing and Undo are the live module's (L2, push 2); the intro is L4's (push 7). The server only
 * stylesheet here gives every field box on the page its still (`--ts-still`).
 */
export function HomeHero() {
  return (
    <section
      className="ts-band-hero ts-seam"
      id="hero"
      data-band="hero"
      aria-labelledby="ts-product-h1"
      tabIndex={-1}
    >
      <ServerHtml as="style" html={import.meta.env.SSR ? HOME_STILLS_CSS : ''} />
      <div className="ts-col">
        <HomeSheet instance="hero" className="ts-hero-sheet" />
        <p className="ts-hero-credit">{SLIDES.heroCredit}</p>
        <div className="ts-hero-caption-row">
          <p className="ts-caption ts-hero-caption" data-caption>
            <span className="is-pointer">{HERO.caption.pointer}</span>
            <span className="is-touch-wide">{HERO.caption.touchWide}</span>
            <span className="is-touch-narrow">{HERO.caption.touchNarrow}</span>
          </p>
          <button type="button" className="ts-text-button" data-undo="hero">
            {HERO.undo}
          </button>
        </div>
        <div className="ts-hero-lead-row">
          <p className="ts-lead ts-hero-lead">{HERO.lead}</p>
          <div className="ts-buttons">
            <HomeLink
              href={HERO.buttons.newPresentation.href}
              control="home.hero.new"
              className="pt-ib is-solid ts-button"
            >
              {HERO.buttons.newPresentation.label}
            </HomeLink>
            <HomeLink
              href={`/deck/${HERO.buttons.openDeck.deckId}`}
              control="home.hero.deck"
              className="pt-ib ts-button"
            >
              {HERO.buttons.openDeck.label}
            </HomeLink>
          </div>
        </div>
      </div>
      <p className="ts-sr" aria-live="polite" data-announce />
    </section>
  );
}
