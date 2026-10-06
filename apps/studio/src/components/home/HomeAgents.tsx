import { AGENTS } from './copy';
import { HOME_FACTS } from './facts';
import { BandHead, HomeSection, Reserve } from './HomeSection';
import { HomeSheet, ServerHtml } from './HomeSheet';
import { HOME_RUN } from './run.generated';
import { iconMarkup } from './SectionIcon';

/**
 * Agents run the same actions (docs/LANDING.md 2.9, Kevin's picks "A+B" and "C"), from V3#13:
 * slide 5, the slide above, over the one `#101010` console with its CLI, MCP and HTTP tabs and the
 * typed line; under it the four chips that run recorded commands on slide 5 and their caption;
 * beside them Version history, its rows newest first in ten reserved rows of 44 px (V2's scrubber
 * joins the column in V2#14). Slide 5 is a placeholder of the band's reserved box written by its
 * chunk after `load` (4.2); the console's screens are V3's chunk's (`live/agents.ts` writes the
 * resting `version list`); the chips' labels, the caption and the run's three rows are words and
 * stay in the document. The band's look is V3's `agents.css`, which the route imports. Hooks:
 * v3.md R1 and R18.
 */

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function historyHtml(icon: string): string {
  /* newest first: step 3, 2, 1 */
  return [...HOME_RUN.steps]
    .reverse()
    .map(
      (step) =>
        `<li class="ts-home-history-row" data-history-row data-author="agent"><span class="ts-home-history-icon">${icon}</span><span class="ts-home-history-author">${esc(AGENTS.author.agent)}</span><span class="ts-home-history-words">${esc(step.history)}</span><span class="ts-home-history-time">${esc(AGENTS.recorded)}</span></li>`,
    )
    .join('');
}

const TABS = [
  { id: 'cli', label: AGENTS.tabs.cli },
  { id: 'mcp', label: AGENTS.tabs.mcp },
  { id: 'http', label: AGENTS.tabs.http },
] as const;

export function HomeAgents() {
  const ssr = import.meta.env.SSR;
  return (
    <HomeSection id="agents">
      <BandHead id="agents" heading={AGENTS.h2} lead={AGENTS.lead(HOME_FACTS)} span={7} />
      <Reserve band="agents" className="ts-agents-grid">
        <div className="ts-agents-left">
          <div className="ts-agents-stage" data-agents-stage>
            <HomeSheet instance="agents" fill className="ts-agents-sheet" />
          </div>
          <div className="ts-home-panel pt-on-ink" data-panel-root>
            <div
              className="ts-home-panel-tabs"
              role="tablist"
              aria-label={AGENTS.tabsLabel}
              data-transports
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
                data-cmd
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
            <button type="button" className="ts-chip" data-chip="tailor">
              {AGENTS.chips.tailor('Initech')}
            </button>
            <button type="button" className="ts-chip" data-chip="turn">
              {AGENTS.chips.turn}
            </button>
            <button type="button" className="ts-chip" data-chip="row">
              {AGENTS.chips.row}
            </button>
            <button type="button" className="ts-chip" data-chip="skip">
              {AGENTS.chips.skip}
            </button>
          </div>
          <p className="ts-caption ts-agents-caption">{AGENTS.chipsCaption}</p>
        </div>
        <div className="ts-agents-right">
          <p className="ts-label" id="ts-agents-history">
            {AGENTS.historyLabel}
          </p>
          <ServerHtml
            as="ol"
            className="ts-home-history"
            aria-labelledby="ts-agents-history"
            data-history
            html={ssr ? historyHtml(iconMarkup('command-line')) : ''}
          />
        </div>
      </Reserve>
      <p className="ts-sr" aria-live="polite" data-announce />
    </HomeSection>
  );
}
