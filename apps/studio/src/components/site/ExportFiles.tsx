import type { CSSProperties, ReactNode } from 'react';

import { EXPORT_SCREEN } from './copy';
import type { ExportRun } from './copy';
import { Frame } from './Frame';

/** The slide drawn once and used four times: its id on the page. */
const SLIDE = 'site-ex-slide';

/**
 * Slide 3 of the hero's deck, "Orders by quarter" (apps/studio/src/try/hero-deck.ts, slide
 * `numbers`), in its own geometry: the heading with its rule, the four bars on their axis and the
 * grid lines. The bars are plates with an edge in the page's tokens, so the four drawings flip
 * with the appearance and the outlines stay readable; the axis numbers and labels, 4 px at file
 * size, are left out.
 */
function SlideSymbol() {
  const hair: CSSProperties = {
    fill: 'none',
    stroke: 'var(--pt-hair)',
    strokeWidth: 1,
    vectorEffect: 'non-scaling-stroke',
  };
  return (
    <svg width="0" height="0" className="site-ex-defs" aria-hidden="true">
      <symbol id={SLIDE} viewBox="0 0 1600 900">
        <path d="M0 57H1600M497 273V748M816 273V748M1135 273V748" style={hair} />
        <path
          d="M179.5 285.5h669v93h-669zM179.5 404.5h813v93h-813zM179.5 522.5h924v93h-924zM179.5 641.5h1052v93h-1052z"
          style={{
            fill: 'var(--pt-plate)',
            stroke: 'var(--pt-edge)',
            strokeWidth: 1,
            vectorEffect: 'non-scaling-stroke',
          }}
        />
        <path d="M179 273V748" style={{ ...hair, stroke: 'var(--pt-ink)' }} />
        <rect x="137" y="86" width="57" height="3" style={{ fill: 'var(--pt-ink)' }} />
        <text
          x="136"
          y="151"
          style={{ fill: 'var(--pt-ink)', fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em' }}
        >
          {EXPORT_SCREEN.files.heading}
        </text>
      </symbol>
    </svg>
  );
}

function Sheet({ children, picture = false }: { children?: ReactNode; picture?: boolean }) {
  return (
    <div className={picture ? 'site-ex-sheet is-picture' : 'site-ex-sheet'} aria-hidden="true">
      <svg aria-hidden="true">
        <use href={`#${SLIDE}`} />
      </svg>
      {children}
    </div>
  );
}

/** The heading's box and the chart's box on the slide, in percent of the sheet. */
const HEADING_BOX: CSSProperties = { left: '8%', top: '11.6%', width: '69.5%', height: '6.9%' };
const CHART_BOX: CSSProperties = { left: '8.6%', top: '24.4%', width: '82.9%', height: '62.2%' };

/** What each file holds, outlined over its drawing: nothing, one picture over hidden text, or
    a text box and a chart. */
function Holds({ id }: { id: string }) {
  if (id === 'pictures')
    return (
      <>
        <span className="site-ex-obj is-hidden" style={HEADING_BOX} />
        <span className="site-ex-obj is-whole" />
      </>
    );
  if (id === 'editable')
    return (
      <>
        <span className="site-ex-obj" style={HEADING_BOX} />
        <span className="site-ex-obj" style={CHART_BOX} />
      </>
    );
  return null;
}

function Says({ runs }: { runs: readonly ExportRun[] }) {
  return (
    <>
      {runs.map((run) =>
        run.part === undefined ? (
          run.text
        ) : (
          <span
            key={run.text}
            className={run.part === 'hidden' ? 'site-ex-key is-hidden' : 'site-ex-key'}
          >
            {run.text}
          </span>
        ),
      )}
    </>
  );
}

/**
 * Screen 06's first figure (docs/SITE.md 9): one slide in the browser, and the three files
 * File > Download writes from it, each drawn with outlines around the parts that file holds. One
 * 1 px line in --pt-edge leaves the slide and splits into three, each branch ending in an 11 px
 * ink square at its file; every segment has one owner, so no junction darkens. The words that
 * name a part are underlined with its outline's stroke, so the sentences key the drawing.
 */
export function ExportFiles() {
  const { files } = EXPORT_SCREEN;
  return (
    <figure className="site-fig site-ex-fig">
      <figcaption className="site-fig-head">
        <span className="t-label">{files.label}</span>
        <span className="site-fig-address t-small">{files.address}</span>
      </figcaption>
      <Frame>
        <SlideSymbol />
        <div className="site-ex">
          <div className="site-ex-src">
            <Sheet />
            <span className="site-ex-caption t-small">{files.source}</span>
          </div>
          <ol className="site-ex-files">
            {files.list.map((file) => (
              <li key={file.id} className="site-ex-file">
                <Sheet picture={file.id === 'pictures'}>
                  <Holds id={file.id} />
                </Sheet>
                <span className="site-ex-what">
                  <span className="site-ex-head">
                    <span className="t-label">{file.kind}</span>
                    <span className="site-ex-name">{file.name}</span>
                  </span>
                  <span className="site-ex-says t-small">
                    <Says runs={file.says} />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </Frame>
    </figure>
  );
}
