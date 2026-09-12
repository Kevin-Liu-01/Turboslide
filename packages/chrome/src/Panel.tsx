import type { ReactNode } from 'react';
import { useId } from 'react';

import { Icon } from './icons';
import { cn } from './lib/cn';
import { tipProps } from './Tooltip';

import './Panel.css';

/**
 * The right panel's frame (gslides-parity SPEC 1.1 "Right panel", R08 B10): 320 px, one slot,
 * a title row with an X that closes it, the body as a scroll region. Themes, Format options,
 * Version history, Check slides, Change history and Pictures and materials are each drawn inside
 * one of these; one panel is open at a time and the control that opened it stays pressed. Lines:
 * the panel owns its left edge in --pt-hair (the seam with the canvas); the title row draws
 * --pt-hair-soft under itself. New in Turboslide (no Prototemplate source).
 */
export type PanelProps = {
  title: string;
  /** a count after the title (Check slides) */
  count?: number;
  onClose: () => void;
  /** the data-control id of the panel */
  control?: string;
  /** a control at the right of the title row, before the X */
  aside?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function Panel({ title, count, onClose, control, aside, className, children }: PanelProps) {
  const titleId = useId();
  return (
    <aside
      className={cn('ts-panel ts-chrome', className)}
      aria-labelledby={titleId}
      data-control={control}
      data-panel-title={title}
    >
      <div className="ts-panel-head">
        <h2 id={titleId} className="ts-panel-title">
          {title}
          {count !== undefined ? <span className="ts-panel-count">{count}</span> : null}
        </h2>
        {aside}
        <button
          type="button"
          className="ts-panel-x"
          aria-label={`Close ${title}`}
          data-control={control === undefined ? 'panel.close' : `${control}.close`}
          onClick={onClose}
          {...tipProps({ name: 'Close', doc: `Closes ${title}`, key: 'Esc' })}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="ts-panel-body pt-scroll">{children}</div>
    </aside>
  );
}
