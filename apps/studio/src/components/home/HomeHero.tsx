import { Fragment } from 'react';

import { MARK_PATH, MARK_VIEWBOX } from '@turboslide/theme/brand';

import { HERO } from './copy';
import { HOME_DECK, HOME_LOOP_FACTS } from './deck.generated';
import type { HomeSlideId } from './deck.generated';
import { HomeLink } from './HomeLink';
import { HomeSheet, ServerHtml } from './HomeSheet';
import { HOME_HERO_TRANSCRIPT, HOME_STILLS_CSS } from './slides.generated';
import type { HomeInstanceId } from './slides.generated';

/**
 * The hero (docs/LANDING.md 2.2, Kevin's pick "B: 96 px headline over a live editor frame and an
 * agent terminal side by side"): the h1 as page text at 96 px in three locked lines, the LCP
 * element and final in the first frame; the lead, whose first sentence is the visit's (the boot
 * script sets it before the first paint), with the two buttons on its last line; then the stage:
 * the editor frame and the agent's terminal side by side, 16 px apart, 408 px tall.
 *
 * The frame is the editor's chrome drawn in the product's grammar (title row, menu row, the
 * filmstrip of the page deck's nine slides and the stage on the workspace ground holding slide 1
 * unframed); the menu row is drawn, `aria-hidden`, the working menus are the menus band's. The
 * slides are the renderer's markup of the page deck, inlined by the server (`HomeSheet`): slide 1
 * with the Blue Marble printed through the 8 by 8 screen at 2 px cells (Kevin's answer 1) and its
 * title and subtitle as objects (the selection replica is V2's), the thumbnails with their block
 * attributes, so the show and the print can clone every slide from the page. The terminal is the
 * page's narrow panel holding the recorded run's transcript at 44 columns in 22 slots. Under the
 * stage the loop's four step tabs (each its label and its command's CLI words, `deck.generated.ts`
 * `HOME_LOOP_FACTS`) and the caption with the loop's seconds; `live/stage.ts` plays the loop L-H on
 * the frame and the terminal, the filmstrip and the tabs. The server only stylesheet here gives
 * every field box on the page its still (`--ts-still`).
 */
const THUMBS: readonly HomeSlideId[] = HOME_DECK.order;

export function HomeHero() {
  const ssr = import.meta.env.SSR;
  const [visit] = HERO.visit;
  return (
    <section
      className="ts-band-hero ts-seam"
      id="hero"
      data-band="hero"
      aria-labelledby="ts-product-h1"
      tabIndex={-1}
    >
      <ServerHtml as="style" html={ssr ? HOME_STILLS_CSS : ''} />
      <div className="ts-col">
        {/* three locked lines: inline spans broken by <br>, so the h1 is one text block, the LCP
            element, whose name reads the sentence */}
        <h1 id="ts-product-h1" className="ts-h1">
          {HERO.h1Lines.map((line, i) => (
            <Fragment key={line}>
              <span className="ts-h1-line">{line}</span>
              {i < HERO.h1Lines.length - 1 ? (
                <>
                  <br />{' '}
                </>
              ) : null}
            </Fragment>
          ))}
        </h1>
        <div className="ts-hero-lead-row">
          {/* the visit sentence is the boot script's to set before the first paint (V4's boot.ts),
              so React renders it from the server's markup alone and never writes it back */}
          <p className="ts-lead ts-hero-lead">
            <ServerHtml as="span" data-visit html={ssr ? escapeHtml(visit ?? '') : ''} />{' '}
            {HERO.lead}
          </p>
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
        <div className="ts-hero-stage" data-hero-stage>
          <div
            className="ts-hero-frame"
            data-hero-frame
            role="group"
            aria-label={HERO.stage.frameLabel}
          >
            <div className="ts-hero-frame-title">
              <svg
                className="ts-hero-frame-mark"
                viewBox={MARK_VIEWBOX}
                fill="currentColor"
                aria-hidden="true"
              >
                <path d={MARK_PATH} />
              </svg>
              <span className="ts-hero-frame-name" data-hero-title>
                {HOME_DECK.title}
              </span>
              <span className="ts-hero-frame-counter" data-hero-counter>
                {`1 / ${HOME_DECK.order.length}`}
              </span>
            </div>
            <div className="ts-hero-frame-menus" aria-hidden="true">
              {HERO.stage.menus.map((menu) => (
                <span key={menu}>{menu}</span>
              ))}
            </div>
            <div className="ts-hero-frame-body">
              <ol
                className="ts-hero-filmstrip"
                data-hero-filmstrip
                aria-label={HERO.stage.slidesLabel}
              >
                {THUMBS.map((id) => {
                  const slide = HOME_DECK.slides[id];
                  return (
                    <li
                      key={id}
                      className="ts-hero-thumb"
                      data-hero-thumb={id}
                      tabIndex={id === 'title' ? 0 : -1}
                      aria-label={slide.title}
                      {...(id === 'title' ? { 'data-selected': '', 'aria-current': 'true' } : {})}
                    >
                      <span className="ts-hero-thumb-n" data-thumb-n aria-hidden="true">
                        {slide.n}
                      </span>
                      <HomeSheet instance={`hero-thumb-${id}` as HomeInstanceId} />
                    </li>
                  );
                })}
              </ol>
              <div className="ts-hero-frame-stage" data-hero-slide>
                <HomeSheet instance="hero" className="ts-hero-sheet" />
              </div>
            </div>
          </div>
          <div
            className="ts-home-panel ts-hero-terminal"
            data-hero-terminal
            role="group"
            aria-label={HERO.stage.terminalLabel}
          >
            <div className="ts-hero-terminal-head">
              <span>{HERO.stage.terminal.folder}</span>
              <span>{HERO.stage.terminal.author}</span>
            </div>
            <ServerHtml
              className="ts-home-panel-text ts-hero-screen"
              data-hero-screen
              html={
                ssr
                  ? HOME_HERO_TRANSCRIPT.map((line) => `<span>${escapeHtml(line)}</span>`).join('')
                  : ''
              }
            />
          </div>
        </div>
        {/* the loop's four steps (V1#15): each tab's label and its command's CLI words, with a
            2 px ink rule on top that fills across the step while it plays (live/stage.ts) */}
        <div
          className="ts-hero-steps"
          role="group"
          aria-label={HERO.stage.stepsLabel}
          data-hero-steps
        >
          {HERO.stage.steps.map((step) => (
            <button key={step.id} type="button" className="ts-hero-step" data-hero-step={step.id}>
              <span className="ts-hero-step-label">{step.label}</span>
              <span className="ts-hero-step-cli">{HOME_LOOP_FACTS.cli[step.id]}</span>
            </button>
          ))}
        </div>
        <div className="ts-hero-caption-row">
          <p className="ts-caption ts-hero-caption" data-caption>
            {HERO.stage.caption(HOME_LOOP_FACTS.captionSeconds)}
          </p>
          <button type="button" className="ts-text-button" data-undo="hero">
            {HERO.undo}
          </button>
        </div>
      </div>
      <p className="ts-sr" aria-live="polite" data-announce />
    </section>
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
