import type { ReactNode } from 'react';

import { cn } from './lib/cn';
import { TurboslideMark } from './TurboslideMark';

import './EmptyFigure.css';

/**
 * The empty state and the Not found figure (gslides-parity SPEC-4 1.9, 1.10; R01 6.7): a 320 by
 * 180 crop of a two tone twin at 1:1 in a `--pt-edge` frame, then a title, one sentence and at
 * most one primary action, the structure of every empty surface (no presentations, an empty
 * trash, no search match, Not found). The crop is `role="img"` with one sentence of its own
 * (1.12); the title and the sentence are text. `figure` picks the twin: the figure twin of the
 * captures for the empty states, the notfound twin under the 64 px mark for Not found (`mark`
 * draws it over the crop on a plate cut from the picture). The twins are the build's
 * (apps/studio/public/brand); EmptyFigure.css names their paths. New in Turboslide (no
 * Prototemplate source).
 */
export type EmptyFigureProps = {
  title: string;
  /** one sentence under the title */
  sentence: string;
  /** at most one primary action, a `.pt-ib is-solid` button or link; more than one is a defect */
  action?: ReactNode;
  figure: 'figure' | 'notfound';
  /** draws the mark at this size over the crop (Not found uses 64) */
  mark?: number;
  /** the heading level; the empty states sit under a page heading, Not found is the page */
  heading?: 'h1' | 'h2' | 'h3';
  /** the sentence the crop reads as, when the default does not fit the surface */
  figureLabel?: string;
  className?: string;
};

/** The sentence each crop carries as its `aria-label`. */
export const FIGURE_LABELS: Readonly<Record<EmptyFigureProps['figure'], string>> = {
  figure: 'A crop of a liquid metal frame through the two tone screen.',
  notfound: 'The Turboslide mark over a crop of a liquid metal frame through the two tone screen.',
};

export function EmptyFigure({
  title,
  sentence,
  action,
  figure,
  mark,
  heading = 'h2',
  figureLabel,
  className,
}: EmptyFigureProps) {
  const Heading = heading;
  return (
    <section className={cn('ts-empty', className)} data-figure={figure} data-control="empty">
      <div
        className="ts-empty-fig"
        role="img"
        aria-label={figureLabel ?? FIGURE_LABELS[figure]}
        data-figure={figure}
      >
        {mark !== undefined ? (
          <span className="ts-empty-mark">
            <TurboslideMark size={mark} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <Heading className="ts-empty-title">{title}</Heading>
      <p className="ts-empty-sentence">{sentence}</p>
      {action !== undefined && action !== null ? (
        <div className="ts-empty-action">{action}</div>
      ) : null}
    </section>
  );
}
