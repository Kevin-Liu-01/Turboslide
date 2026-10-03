import { AGENTS } from './copy';
import { HOME_RUN_FACTS } from './deck.generated';
import { HOME_FACTS } from './facts';
import { BandHead, HomeSection, Reserve } from './HomeSection';
import { HomeSheet, ServerHtml } from './HomeSheet';
import { HOME_RUN } from './run.generated';
import { iconMarkup } from './SectionIcon';

/**
 * Agents run the same actions (docs/LANDING.md 2.9, the agents band of Kevin's picks "A+B" and
 * "C"), after the editing bands. Until V3#13 rebuilds it around the chips and the scrubber, the
 * band is the first pass's, painted at the run's end at rest: the one `#101010` console (the
 * page's second code surface, 2.0) with its CLI, MCP and HTTP tabs, the transcript of the three
 * recorded commands in its fixed line slots (14 of 64 columns at 720 px and over, 22 of 44 under),
 * the typed line, Run Again with the step label and the staged caption; beside it slide 5 as the
 * run wrote it and Version history with the run's three Agent rows. The console's screen and
 * slide 5 are placeholders in the band's reserved box, written by its chunk after `load` (4.2);
 * Version history's rows are words and stay in the document. Hooks: integrator.md 4.1, l3.md R1,
 * R5, v1.md "To V3".
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
      <Reserve band="agents" className="ts-agents">
        <div className="ts-agents-run">
          <div className="ts-home-panel" data-panel-root>
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
            <ServerHtml
              role="tabpanel"
              id="ts-agents-panel-cli"
              aria-labelledby="ts-agents-tab-cli"
              className="ts-home-panel-screen"
              data-panel
              data-fill="panel-cli"
              data-transport-panel="cli"
              html=""
            />
            {/* the MCP and HTTP screens are the live module's (L3, push 4), written from
                run.generated.ts when their tab opens: without script the tabs do not switch, so
                the document carries the CLI screen alone (LANDING.md 4.1, the 80 KB line) */}
            <div
              role="tabpanel"
              id="ts-agents-panel-mcp"
              aria-labelledby="ts-agents-tab-mcp"
              className="ts-home-panel-screen"
              data-transport-panel="mcp"
              hidden
            />
            <div
              role="tabpanel"
              id="ts-agents-panel-http"
              aria-labelledby="ts-agents-tab-http"
              className="ts-home-panel-screen"
              data-transport-panel="http"
              hidden
            />
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
          <div className="ts-agents-controls">
            <button type="button" className="pt-ib is-solid ts-button" data-agent-run>
              {AGENTS.run.again}
            </button>
            <span className="ts-home-step" data-step>
              {AGENTS.stepLabel(3, 3)}
            </span>
          </div>
          <p className="ts-caption">{AGENTS.caption(HOME_RUN_FACTS.captionSeconds)}</p>
        </div>
        <div className="ts-agents-slide">
          <HomeSheet instance="agents" fill className="ts-agents-sheet" />
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
