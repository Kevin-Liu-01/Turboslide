import { AGENTS, VERSIONS } from './copy';
import { HOME_DECK } from './deck.generated';
import { AGENTS_ROUND, DIAGRAMS_ROUND } from './design-copy';
import { Diagram } from './HomeDiagram';
import { BandHead, HomeSection, Reserve } from './HomeSection';
import { HomeSheet, ServerHtml } from './HomeSheet';
import { HOME_RUN } from './run.generated';

/**
 * Agents run the same actions (docs/LANDING.md 2.9, Kevin's picks "A+B" and "C"; docs/DESIGN.md
 * 8.8): under the lead, the agent to deck diagram (`HomeDiagram.tsx`); slide 5, the slide above,
 * over the one `#101010` console with its CLI, MCP and HTTP tabs and the typed line; under it the
 * four chips, each with the editor's glyph, that run recorded commands on slide 5, and their
 * caption. Beside them the editor's Version history panel in an 8 px window: its head with the
 * clock and Restore This Version, the scrubber and its caption, then the versions in a scroll
 * region of fixed height: Today (the changes made on this page, newest first, each with its time;
 * a sentence while there is none) and "Recorded from the CLI" (the run's three steps and the deck
 * before it, each with its version number). Each row is the author's chip with its glyph, the
 * author and the change in words, and the time or version in tabular figures; the chosen
 * version's row sits on the plate. Slide 5 is a placeholder of the band's reserved box written by
 * its chunk after `load` (4.2); the console's screens are V3's chunk's (`live/agents.ts` writes
 * the resting `version list`), the Today rows `live/history.ts`'s and the scrubber
 * `live/versions.ts`'s. The recorded rows are words and stay in the document, written by the
 * server alone so the route's script does not carry the run. The band's look is `agents.css`.
 */

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const WORDS = AGENTS_ROUND.history;

/** One Version history row as the panel draws it; `live/history.ts` clones it for Today's rows. */
function rowHtml(
  version: number,
  words: string,
  options: { run: boolean; current: boolean },
): string {
  return `<li class="ts-home-history-row" data-history-row data-author="agent" data-version="${version}"${options.run ? ' data-history-run' : ''}${options.current ? ' aria-current="true"' : ''}><span class="ts-home-history-icon"><i class="ts-icon" data-icon="command-line" aria-hidden="true"></i></span><span class="ts-home-history-body"><span class="ts-home-history-author">${esc(AGENTS.author.agent)}</span><span class="ts-home-history-words" data-history-words>${esc(words)}</span></span><span class="ts-home-history-time pt-num">${esc(WORDS.version(version))}</span></li>`;
}

/**
 * The versions at rest: Today with its sentence, then the recorded run newest first (versions 4,
 * 3 and 2, the run's steps 3, 2 and 1) and version 1, the deck as the CLI's `version list` names
 * it ("Onboarding plan"), which is not a row of the run.
 */
function historyHtml(): string {
  const steps = [...HOME_RUN.steps].reverse();
  const recorded = [
    ...steps.map((step, i) =>
      rowHtml(steps.length + 1 - i, step.history, { run: true, current: i === 0 }),
    ),
    rowHtml(1, HOME_DECK.title, { run: false, current: false }),
  ].join('');
  return [
    `<p class="ts-home-history-day" id="ts-agents-today">${esc(WORDS.today)}</p>`,
    `<ol class="ts-home-history-group" data-history-group="today" aria-labelledby="ts-agents-today"></ol>`,
    `<p class="ts-home-history-empty" data-history-empty>${esc(WORDS.empty)}</p>`,
    `<p class="ts-home-history-day" id="ts-agents-recorded">${esc(WORDS.recorded)}</p>`,
    `<ol class="ts-home-history-group" data-history-group="recorded" aria-labelledby="ts-agents-recorded">${recorded}</ol>`,
  ].join('');
}

/** The scrubber's caption at rest: the newest version, the run's last step. */
const restCaption = (): string => {
  const total = HOME_RUN.steps.length + 1;
  return esc(VERSIONS.recordedCaption(total, total));
};

const TABS = [
  { id: 'cli', label: AGENTS.tabs.cli },
  { id: 'mcp', label: AGENTS.tabs.mcp },
  { id: 'http', label: AGENTS.tabs.http },
] as const;

/** The four chips with the editor's glyph of each change (DESIGN.md 8.8). */
const CHIPS = [
  { id: 'tailor', icon: 'command-line', label: AGENTS.chips.tailor('Initech') },
  { id: 'turn', icon: 'arrow-path', label: AGENTS.chips.turn },
  { id: 'row', icon: 'pencil', label: AGENTS.chips.row },
  { id: 'skip', icon: 'eye-slash', label: AGENTS.chips.skip },
] as const;

export function HomeAgents() {
  const ssr = import.meta.env.SSR;
  return (
    <HomeSection id="agents">
      <BandHead id="agents" heading={AGENTS.h2} lead={AGENTS_ROUND.lead} span={7}>
        <Diagram id="agents" label={DIAGRAMS_ROUND.agents.label} />
      </BandHead>
      <Reserve band="agents" className="ts-agents-grid">
        <div className="ts-agents-left">
          <div className="ts-agents-stage" data-agents-stage="">
            <HomeSheet instance="agents" fill className="ts-agents-sheet" />
          </div>
          <div className="ts-home-panel pt-on-ink" data-panel-root="">
            <div
              className="ts-home-panel-tabs"
              role="tablist"
              aria-label={AGENTS.tabsLabel}
              data-transports=""
            >
              {TABS.map((tab, i) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`ts-agents-tab-${tab.id}`}
                  aria-controls={`ts-agents-panel-${tab.id}`}
                  aria-selected={i === 0}
                  tabIndex={i === 0 ? 0 : -1}
                  data-transport={tab.id}
                  className="ts-home-panel-tab"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {TABS.map((tab, i) => (
              <div
                key={tab.id}
                role="tabpanel"
                id={`ts-agents-panel-${tab.id}`}
                aria-labelledby={`ts-agents-tab-${tab.id}`}
                className="ts-home-panel-screen"
                data-transport-panel={tab.id}
                {...(i === 0 ? { 'data-panel': '' } : { hidden: true })}
              />
            ))}
            <label className="ts-home-panel-input">
              <span className="ts-home-panel-prompt" aria-hidden="true">
                {AGENTS.panel.prompt}
              </span>
              <input
                type="text"
                data-cmd=""
                className="ts-home-panel-field"
                placeholder={AGENTS.panel.placeholder}
                aria-label={AGENTS.panel.inputLabel}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
          </div>
          <div className="ts-agents-chips" role="group" aria-label={AGENTS.chipsLabel}>
            {/* the chip's customer, 2.9's "Tailor for Initech" (chips.generated.ts chipCustomer) */}
            {CHIPS.map((chip) => (
              <button key={chip.id} type="button" className="ts-chip" data-chip={chip.id}>
                <i className="ts-icon" data-icon={chip.icon} aria-hidden="true" />
                <span className="ts-chip-label">{chip.label}</span>
              </button>
            ))}
          </div>
          <p className="ts-caption ts-agents-caption">{AGENTS.chipsCaption}</p>
        </div>
        <div className="ts-agents-right">
          <section className="ts-home-vh pt-window" aria-labelledby="ts-agents-history">
            <div className="ts-home-vh-head">
              <i className="ts-icon" data-icon="clock" aria-hidden="true" />
              <p className="ts-home-vh-title" id="ts-agents-history">
                {AGENTS.historyLabel}
              </p>
              <button
                type="button"
                className="pt-ib ts-button"
                data-version-restore=""
                aria-disabled="true"
              >
                <i className="ts-icon" data-icon="arrow-uturn-left" aria-hidden="true" />
                <span>{VERSIONS.restore}</span>
              </button>
            </div>
            <div className="ts-versions" data-versions="">
              <div data-version-slider="" />
              <ServerHtml
                as="p"
                className="ts-versions-caption"
                data-version-caption=""
                html={ssr ? restCaption() : ''}
              />
            </div>
            <ServerHtml
              className="ts-home-history pt-scroll"
              data-history=""
              html={ssr ? historyHtml() : ''}
            />
          </section>
        </div>
      </Reserve>
      <p className="ts-sr" aria-live="polite" data-announce="" />
    </HomeSection>
  );
}
