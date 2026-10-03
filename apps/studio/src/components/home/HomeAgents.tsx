import { AGENTS } from './copy';
import { HOME_RUN_FACTS } from './deck.generated';
import { BandHead, HomeSection } from './HomeSection';
import { HomeSheet, ServerHtml } from './HomeSheet';
import { HOME_RUN } from './run.generated';
import { iconMarkup } from './SectionIcon';
import type { PanelText } from './run.generated';

/**
 * Agents run the same actions (docs/LANDING.md 2.4, band 2), painted at the run's end at rest:
 * the one `#101010` panel (SPEC-4 0.20, the one monospace on the page) with its CLI, MCP and HTTP
 * tabs, the transcript of the three recorded commands in its fixed line slots (14 of 64 columns
 * at 720 px and over, 22 of 44 under), the typed line, Run Again with the step label and the
 * staged caption; beside it slide 5 as the run wrote it and Version history with the run's three
 * Agent rows. The panel's lines and the history rows are server markup from run.generated.ts
 * (`ServerHtml`), so the route chunk never carries the recording; the live module (L3's
 * `live/agents.ts`, push 4) replays and answers from the same file. Hooks: integrator.md 4.1 and
 * l3.md R1, R5.
 */

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One screen at both widths, one `span` a line (l3.md R1), shown by home.css at the breakpoint. */
function screenHtml(screen: PanelText): string {
  const lines = (list: readonly string[]): string =>
    list.map((line) => `<span>${esc(line)}</span>`).join('');
  return `<div class="ts-home-panel-text is-wide" data-panel-text="wide">${lines(screen.wide)}</div><div class="ts-home-panel-text is-narrow" data-panel-text="narrow">${lines(screen.narrow)}</div>`;
}

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
      <BandHead id="agents" heading={AGENTS.h2} lead={AGENTS.lead} span={7} />
      <div className="ts-agents">
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
              data-transport-panel="cli"
              html={ssr ? screenHtml(HOME_RUN.screens.transcript) : ''}
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
          <HomeSheet instance="agents" className="ts-agents-sheet" />
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
      </div>
      <p className="ts-sr" aria-live="polite" data-announce />
    </HomeSection>
  );
}
