import type { CSSProperties } from 'react';

import { EmptyFigure } from '@turboslide/chrome/EmptyFigure';
import { rampEdgeMask, shiftOf } from '@turboslide/chrome/Progress';
import { tipProps } from '@turboslide/chrome/Tooltip';
import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';
import { labelFor } from '@turboslide/identity/labels';
import { markSpec } from '@turboslide/identity/marks';
import type { MarkSpec } from '@turboslide/identity/marks';
import { inkRects, renderMarkBits } from '@turboslide/identity/marks-render';
import type { InkRect } from '@turboslide/identity/marks-render';

import { DITHERS, resolveText } from './copy';
import type { HomeFacts } from './facts';
import { Shot } from './Shot';
import { WIDE_SIZES } from './HomeEditor';

/** The pipeline strip's cells: a third of the rail. */
const CELL_SIZES =
  '(max-width: 760px) calc(100vw - 50px), (max-width: 1168px) calc((100vw - 50px) / 3), 372px';

/** The presence chip specimen's size and the place its fill stands (0.62 of the track). */
const CHIP_SIZE = 24;
const CURTAIN_FILL = 0.62;

/* the two mask layers of the progress fill (Progress.tsx FILL_MASK), built once */
const FILL_MASK = `linear-gradient(#000, #000), ${rampEdgeMask()}`;

/**
 * The presence chip specimen (gslides-parity SPEC-4 2.2 item 6; SPEC-3 4.1): round three's
 * identity mark rendered from `packages/identity` for an anonymous principal, the way a stored
 * surface shows it, monochrome and without the live stripe (only a live roster entry carries a
 * hue). The ring is the chip's 1 px `--pt-edge` border; the plate's cells are `inkRects` of
 * `renderMarkBits` at 24 px; the initial is text, as the chrome draws it.
 */
function chipSpec(principalId: string): { spec: MarkSpec; rects: InkRect[]; label: string } {
  const label = labelFor(principalId);
  const spec = markSpec({
    principalId,
    kind: 'anonymous',
    displayName: label,
    label,
    trust: 'label',
    avatar: { variant: 'initials' },
    deleted: false,
    admin: false,
  });
  return { spec, rects: inkRects(renderMarkBits(spec, CHIP_SIZE)), label };
}

const CHIP = chipSpec(DITHERS.specimens.chip.principalId);

/**
 * Dithers and shaders, from the deck to the interface (gslides-parity SPEC-4 2.2 item 6, 1.9;
 * R05 6.5; P1 4.3): the three sentences with the Blue Marble shot, then the pipeline strip in three
 * cells (the continuous frame before the screen, the hero frame through the screen at 1:1 from
 * B1's twin by the path `site.ts` exports, the mark at 128 px), then the three interface specimens
 * (the empty state figure, the loading curtain with the deck's ramp as its progress texture, the
 * presence chip), so the page shows where the identity appears in the product. The frame cell is
 * P1's 7.0 second capture copied by `build-home-assets.ts`; the chosen hero frame's continuous
 * picture is a request to B1 (b2.md), after which the first cell shows the same frame as the
 * second. Nothing here animates; the curtain's fill stands where a load would be.
 */
export function HomePipeline({ facts }: { facts: HomeFacts | null }) {
  const fillStyle: CSSProperties = {
    maskImage: FILL_MASK,
    WebkitMaskImage: FILL_MASK,
    transform: shiftOf(CURTAIN_FILL),
  };
  return (
    <section className="ts-product-band" aria-labelledby="ts-product-h-dither">
      <div className="ts-product-rail">
        <div className="ts-product-band-head">
          <h2 id="ts-product-h-dither" className="ts-product-h2">
            {DITHERS.heading}
          </h2>
          <p className="ts-product-lead">{DITHERS.lead}</p>
        </div>
        <div className="ts-product-two">
          <figure className="ts-product-shot">
            <Shot name="12-slideshow-dither" sizes={WIDE_SIZES} />
            <figcaption className="ts-product-caption">{DITHERS.caption}</figcaption>
          </figure>
          <div className="ts-product-claims ts-product-lead">
            {DITHERS.claims.map((claim, index) => (
              <p key={index}>{resolveText(claim, facts) ?? ''}</p>
            ))}
          </div>
        </div>
        <ol className="ts-product-pipe" aria-label="The pipeline">
          <li className="ts-product-pipe-cell">
            <div className="ts-product-pipe-win">
              <Shot name="hero-frame" sizes={CELL_SIZES} />
            </div>
            <p className="ts-product-caption">{DITHERS.pipeline.frame.caption}</p>
          </li>
          <li className="ts-product-pipe-cell">
            <div
              className="ts-product-pipe-win ts-product-pipe-twin"
              role="img"
              aria-label={DITHERS.pipeline.twin.label}
              data-twin="hero"
            />
            <p className="ts-product-caption">{DITHERS.pipeline.twin.caption}</p>
          </li>
          <li className="ts-product-pipe-cell">
            <div className="ts-product-pipe-win ts-product-pipe-mark">
              <TurboslideMark size={128} />
            </div>
            <p className="ts-product-caption">{DITHERS.pipeline.mark.caption}</p>
          </li>
        </ol>
        <h3 className="ts-product-h3 ts-product-specimens-head">{DITHERS.specimens.heading}</h3>
        <ul className="ts-product-specimens">
          <li className="ts-product-specimen">
            <EmptyFigure
              figure="figure"
              heading="h3"
              title={DITHERS.specimens.empty.title}
              sentence={DITHERS.specimens.empty.sentence}
              action={
                <a
                  href="/new"
                  className="pt-ib is-solid"
                  data-control="home.specimen.new"
                  {...tipProps({ name: 'New Presentation', doc: 'Opens a fresh presentation.' })}
                >
                  New Presentation
                </a>
              }
            />
            <p className="ts-product-caption">{DITHERS.specimens.empty.caption}</p>
          </li>
          <li className="ts-product-specimen">
            <div
              className="ts-product-curtain"
              role="img"
              aria-label={DITHERS.specimens.curtain.label}
              data-twin="figure"
            >
              <div className="ts-product-curtain-sheet" />
              <div className="ts-product-curtain-track">
                <i className="ts-product-curtain-fill" style={fillStyle} />
              </div>
            </div>
            <p className="ts-product-caption">{DITHERS.specimens.curtain.caption}</p>
          </li>
          <li className="ts-product-specimen">
            <div className="ts-product-chip-row">
              <span
                className="ts-product-chip"
                role="img"
                aria-label={CHIP.spec.label}
                data-principal={DITHERS.specimens.chip.principalId}
              >
                <svg
                  viewBox={`1 1 ${CHIP_SIZE - 2} ${CHIP_SIZE - 2}`}
                  width={CHIP_SIZE - 2}
                  height={CHIP_SIZE - 2}
                  aria-hidden="true"
                  shapeRendering="crispEdges"
                >
                  {CHIP.rects.map((rect, index) => (
                    <rect key={index} x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
                  ))}
                  {CHIP.spec.initials !== '' ? (
                    <text
                      className="ts-product-chip-initials"
                      x={CHIP_SIZE / 2}
                      y={CHIP_SIZE / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={11}
                    >
                      {CHIP.spec.initials}
                    </text>
                  ) : null}
                </svg>
              </span>
              <span className="ts-product-chip-name">{CHIP.label}</span>
            </div>
            <p className="ts-product-caption">{DITHERS.specimens.chip.caption}</p>
          </li>
        </ul>
      </div>
    </section>
  );
}
