import { Fragment } from 'react';

import { NUMBERS_ROUND } from './design-copy';
import { FACTS_DATA } from './facts-data';
import { HOME_FACTS, formatCount } from './facts';
import type { HomeFacts } from './facts';

/**
 * The numbers row (docs/DESIGN.md 8.3; docs/LANDING.md 2.3): directly under the hero, four ruled
 * cells, each the editor's glyph for the thing counted, the figure at 44 px in tabular figures with
 * its noun, and its place in the editor as a menu path drawn as crumbs; the actions cell carries
 * the CLI's, the MCP server's and the HTTP API's counts as chips instead, said here once. The glyphs
 * and the paths are the menu model's, read at build (`facts-data.ts` `numbers`); every figure is a
 * function of `HomeFacts`. Nothing in the band moves, on purpose. It has no h2, so the section is
 * named.
 */
const FIGURE: Readonly<Record<string, (f: HomeFacts) => number>> = {
  actions: (f) => f.actions,
  layouts: (f) => f.layouts,
  patterns: (f) => f.materials,
  shapes: (f) => f.shapes,
};

const NOUN = NUMBERS_ROUND.nouns as Readonly<Record<string, string>>;

export function HomeNumbers() {
  return (
    <section
      className="ts-band ts-band-numbers ts-seam"
      id="numbers"
      data-band="numbers"
      aria-label={NUMBERS_ROUND.label}
    >
      <div className="ts-col">
        <ul className="ts-numbers">
          {FACTS_DATA.numbers.map((cell) => (
            <li key={cell.id} className="ts-number" data-number={cell.id}>
              <span className="ts-number-well">
                <i className="ts-icon" data-icon={cell.icon} />
              </span>
              <p className="ts-number-figure">
                <span className="pt-num">{formatCount(FIGURE[cell.id]?.(HOME_FACTS) ?? 0)}</span>{' '}
                <span className="ts-number-noun">{NOUN[cell.id]}</span>
              </p>
              {cell.path.length > 0 ? (
                <p className="ts-crumbs">
                  {cell.path.map((step, i) => (
                    <Fragment key={step}>
                      {i > 0 ? <i className="ts-icon" data-icon="next" /> : null}
                      <span>{step}</span>
                    </Fragment>
                  ))}
                </p>
              ) : (
                <ul className="ts-number-chips" aria-label={NUMBERS_ROUND.chipsLabel}>
                  <li>
                    {NUMBERS_ROUND.chips.cli}{' '}
                    <span className="pt-num">{formatCount(HOME_FACTS.cliCommands)}</span>
                  </li>
                  <li>
                    {NUMBERS_ROUND.chips.mcp}{' '}
                    <span className="pt-num">{formatCount(HOME_FACTS.mcpTools)}</span>
                  </li>
                  <li>
                    {NUMBERS_ROUND.chips.http}{' '}
                    <span className="pt-num">{formatCount(HOME_FACTS.httpPaths)}</span>
                  </li>
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
