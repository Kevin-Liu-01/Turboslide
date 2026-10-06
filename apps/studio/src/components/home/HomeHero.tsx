import { Fragment } from 'react';

import { tipProps } from '@turboslide/chrome/Tooltip';
import { MARK_PATH, MARK_VIEWBOX } from '@turboslide/theme/brand';

import { HOME_STEP_ICONS, HOME_TITLE_ROW, HOME_TOOLBAR } from './chrome.generated';
import { HERO } from './copy';
import { HOME_DECK, HOME_LOOP_FACTS } from './deck.generated';
import type { HomeSlideId } from './deck.generated';
import { HERO_ROUND } from './design-copy';
import { HomeLink } from './HomeLink';
import { MotionToggle } from './HomeNav';
import { HomeSheet, ServerHtml } from './HomeSheet';
import { HOME_HERO_TRANSCRIPT, HOME_STILLS_CSS } from './slides.generated';
import type { HomeInstanceId } from './slides.generated';

/**
 * The hero (docs/DESIGN.md 8.2; docs/LANDING.md 2.2): the h1 "Presentations for people and agents"
 * as page text at 76 px on two lines, the LCP element and final in the first frame, with the lead
 * (the visit sentence the boot script sets before the first paint, then one sentence) and the two
 * buttons beside it; then the stage: the editor frame and the agent's terminal side by side.
 *
 * The frame draws the editor as the editor draws it, each part read from the editor at build
 * (`chrome.generated.ts`, scripts/home/chrome.ts): the title row (the mark, the deck's title, the
 * saved phrase with its cloud, the agent's chip in the presence slot, the comments glyph, the
 * Slideshow split with its play glyph and Share with its lock), the menu row, the toolbar's sixteen
 * controls with nothing selected (its undo is the frame's Undo; the others are drawn chrome), the
 * filmstrip of the page deck's nine slides, the stage on the workspace ground holding slide 1, and
 * the notes row with the shown slide's speaker notes and the counter `n / 9` in tabular figures.
 * The glyphs are the editor's, drawn as masks of icons.generated.css. The menu row and the drawn
 * controls are `aria-hidden`; the working menus are the menus band's.
 *
 * The terminal is the page's narrow panel: its head names the agent and the recording ("Recorded
 * from the CLI, 19 s") beside the page's motion toggle; the screen holds the recorded run's
 * transcript and keeps every line the loop prints, scrolling to its end inside the shared bar
 * (`.pt-scroll` with the ink thumb of `.pt-on-ink`), so it is never cleared; the loop's four steps
 * are rows in its foot, each with the done glyph in the status green, the playing row's 2 px
 * countdown rule and its length in tabular seconds. `live/stage.ts` plays the loop on the frame,
 * the terminal and the rows.
 */
const THUMBS: readonly HomeSlideId[] = HOME_DECK.order;

/** A glyph: an empty element the mask draws, which a screen reader passes over. */
function Glyph({ name, className }: { name: string; className?: string }) {
  return (
    <i className={className === undefined ? 'ts-icon' : `ts-icon ${className}`} data-icon={name} />
  );
}

/** The toolbar's cells in order, the undo apart: the drawn ones in groups a screen reader skips. */
const UNDO_AT = HOME_TOOLBAR.findIndex((cell) => cell.control === 'toolbar.undo');

/** A drawn toolbar control: its glyph or its word, the rule the model draws before it. */
function toolCell(cell: (typeof HOME_TOOLBAR)[number]) {
  return (
    <Fragment key={cell.control}>
      {cell.divider ? <span className="ts-hero-tool-rule" /> : null}
      <span
        className={cell.word === null ? 'ts-hero-tool' : 'ts-hero-tool is-word'}
        {...(cell.control === 'toolbar.select' ? { 'data-on': '' } : {})}
      >
        {cell.icon === null ? cell.word : <Glyph name={cell.icon} />}
      </span>
    </Fragment>
  );
}

export function HomeHero() {
  const ssr = import.meta.env.SSR;
  const [visit] = HERO.visit;
  const first = HOME_DECK.slides[THUMBS[0] as HomeSlideId];
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
        <div className="ts-hero-head">
          {/* two locked lines: inline spans broken by <br>, so the h1 is one text block, the LCP
              element, whose name reads the sentence */}
          <h1 id="ts-product-h1" className="ts-h1">
            {HERO_ROUND.h1Lines.map((line, i) => (
              <Fragment key={line}>
                <span className="ts-h1-line">{line}</span>
                {i < HERO_ROUND.h1Lines.length - 1 ? (
                  <>
                    <br />{' '}
                  </>
                ) : null}
              </Fragment>
            ))}
          </h1>
          <div className="ts-hero-side">
            {/* the visit sentence is the boot script's to set before the first paint (boot.ts), so
                React renders it from the server's markup alone and never writes it back */}
            <p className="ts-lead ts-hero-lead">
              <ServerHtml as="span" data-visit html={ssr ? escapeHtml(visit ?? '') : ''} />{' '}
              {HERO_ROUND.lead}
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
        </div>
        <div className="ts-hero-stage" data-hero-stage>
          <div
            className="ts-hero-frame pt-window"
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
              <span className="ts-hero-frame-saved" aria-hidden="true">
                <Glyph name={HOME_TITLE_ROW.savedIcon} />
                <span>{HOME_TITLE_ROW.saved}</span>
              </span>
              <span className="ts-hero-frame-r" aria-hidden="true">
                <span className="ts-hero-frame-chip" data-hero-chip>
                  <Glyph name={HOME_TITLE_ROW.agentIcon} />
                </span>
                <span className="ts-hero-frame-ib">
                  <Glyph name={HOME_TITLE_ROW.commentsIcon} />
                </span>
                <span className="ts-hero-frame-split">
                  <span className="is-main">
                    <Glyph name={HOME_TITLE_ROW.slideshowIcon} />
                    <span className="ts-hero-frame-word">{HOME_TITLE_ROW.slideshow}</span>
                  </span>
                  <span className="is-more">
                    <Glyph name={HOME_TITLE_ROW.slideshowMore} />
                  </span>
                </span>
                <span className="ts-hero-frame-share">
                  <Glyph name={HOME_TITLE_ROW.shareIcon} />
                  <span className="ts-hero-frame-word">{HOME_TITLE_ROW.share}</span>
                </span>
              </span>
            </div>
            <div className="ts-hero-frame-menus" aria-hidden="true">
              {HERO.stage.menus.map((menu) => (
                <span key={menu}>{menu}</span>
              ))}
            </div>
            <div
              className="ts-hero-frame-tools"
              role="toolbar"
              aria-label={HERO_ROUND.frame.toolbarLabel}
              data-hero-tools
            >
              <span className="ts-hero-tools-drawn" aria-hidden="true">
                {HOME_TOOLBAR.slice(0, UNDO_AT).map(toolCell)}
              </span>
              <button
                type="button"
                className="ts-hero-tool"
                data-undo="hero"
                aria-label={HOME_TOOLBAR[UNDO_AT]?.label}
                {...tipProps(HOME_TOOLBAR[UNDO_AT]?.label ?? '')}
              >
                <Glyph name={HOME_TOOLBAR[UNDO_AT]?.icon ?? ''} />
              </button>
              <span className="ts-hero-tools-drawn" aria-hidden="true">
                {HOME_TOOLBAR.slice(UNDO_AT + 1).map(toolCell)}
              </span>
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
                      <span className="ts-hero-thumb-n pt-num" data-thumb-n aria-hidden="true">
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
            <div className="ts-hero-frame-notes">
              <span className="ts-hero-frame-notes-text" data-hero-notes>
                {first.notes}
              </span>
              <span className="ts-hero-frame-counter pt-num" data-hero-counter>
                {`1 / ${HOME_DECK.order.length}`}
              </span>
            </div>
          </div>
          <div
            className="ts-home-panel pt-on-ink ts-hero-terminal"
            data-hero-terminal
            role="group"
            aria-label={HERO.stage.terminalLabel}
          >
            <div className="ts-hero-terminal-head">
              <Glyph name={HOME_TITLE_ROW.agentIcon} />
              <span className="ts-hero-terminal-who">{HERO_ROUND.terminal.agent}</span>
              <span className="ts-hero-terminal-recorded pt-num" data-caption>
                {HERO_ROUND.terminal.recorded(HOME_LOOP_FACTS.captionSeconds)}
              </span>
              <MotionToggle control="home.hero.motion" className="ts-hero-terminal-pause" />
            </div>
            <ServerHtml
              className="ts-home-panel-text pt-scroll ts-hero-screen"
              data-hero-screen
              data-keep="64"
              html={
                ssr
                  ? HOME_HERO_TRANSCRIPT.map((line) => `<span>${escapeHtml(line)}</span>`).join('')
                  : ''
              }
            />
            {/* the loop's four steps (DESIGN.md 8.2): a row each in the panel's foot, its glyph (the
                done mark, or play while it plays), its label and its length; the 2 px rule on top
                fills across the step while it plays (live/hero-stage.ts) */}
            <div
              className="ts-hero-steps"
              role="group"
              aria-label={HERO_ROUND.terminal.stepsLabel}
              data-hero-steps
            >
              {HERO.stage.steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  className="ts-hero-step"
                  data-hero-step={step.id}
                  data-done=""
                >
                  <Glyph name={HOME_STEP_ICONS.done} className="is-done" />
                  <Glyph name={HOME_STEP_ICONS.playing} className="is-playing" />
                  <span className="ts-hero-step-label">{step.label}</span>
                  <span className="ts-hero-step-length pt-num">
                    {HERO_ROUND.terminal.length(HOME_LOOP_FACTS.stepSeconds[step.id])}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="ts-sr" aria-live="polite" data-announce />
    </section>
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
