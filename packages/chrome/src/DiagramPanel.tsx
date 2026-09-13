import { useState } from 'react';

import type { DiagramKind, DiagramStyle } from '@turboslide/schema/diagrams';
import {
  DIAGRAM_DEFAULT_BOX,
  DIAGRAM_TEMPLATES,
  clampDiagramCount,
} from '@turboslide/schema/diagrams';
import type { Position } from '@turboslide/schema/position';

import type { EditorDispatch } from './dispatch';
import { PANELS } from './menus/strings';
import { Panel } from './Panel';
import {
  DIAGRAM_TILE_VIEW,
  DiagramPreview,
  DiagramStylePicker,
  DiagramTypePicker,
} from './pickers/DiagramPicker';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './DiagramPanel.css';

/**
 * The Diagram panel (gslides-parity SPEC-2 section 5 "Diagram panel", 2.8.3, decision 0.25;
 * R05 A8): Insert > Diagram opens it in the right slot. Google's panel shows the six types as
 * tiles, then a count control named for the type (Levels, Steps, Dates, Items) and a colour
 * picker over the variants; ours shows the type tiles, the count as a stepper with the type's
 * noun, the three style tiles and a live preview drawn from `diagrams.ts`, and Insert runs one
 * `diagram.insert`, which lands the group as positioned objects centred on the sheet and
 * converts a slide that is not a canvas yet (SPEC-2 1.6). The panel stays open after an insert,
 * as Google's does, so a second diagram is one more click.
 */
export type DiagramPanelProps = {
  slideId: string;
  revision: number;
  dispatch: EditorDispatch;
  onClose: () => void;
  onNotice?: (message: string) => void;
  /** where the diagram lands; the default box of 2.8.2 when absent */
  box?: Position;
  busy?: boolean;
};

const PREVIEW_BOX: Position = { x: 20, y: 20, w: 280, h: 140 };

export function DiagramPanel({
  slideId,
  revision,
  dispatch,
  onClose,
  onNotice,
  box,
  busy = false,
}: DiagramPanelProps) {
  const words = PANELS.diagram;
  const [kind, setKind] = useState<DiagramKind>('process');
  const [counts, setCounts] = useState<Partial<Record<DiagramKind, number>>>({});
  const [style, setStyle] = useState<DiagramStyle>('outline');
  const [pending, setPending] = useState(false);
  const template = DIAGRAM_TEMPLATES[kind];
  const count = clampDiagramCount(kind, counts[kind] ?? template.counts.min + 1);
  const control = 'insert.diagram';

  const setCount = (next: number) =>
    setCounts({ ...counts, [kind]: clampDiagramCount(kind, next) });

  const insert = () => {
    if (pending || busy) return;
    setPending(true);
    dispatch('diagram.insert', {
      slideId,
      kind,
      count,
      style,
      ...(box === undefined ? {} : { pos: box }),
      baseRevision: revision,
    })
      .then(() => onNotice?.(`${template.label} diagram added`))
      .catch((error: unknown) => onNotice?.(error instanceof Error ? error.message : String(error)))
      .finally(() => setPending(false));
  };

  const countTip = tipProps({
    name: template.counts.noun,
    doc: `${template.counts.min} to ${template.counts.max}`,
  });

  return (
    <Panel
      title={words.title}
      onClose={onClose}
      control="panel.diagram"
      className="ts-diagram-panel"
    >
      <DiagramTypePicker
        value={kind}
        onChange={setKind}
        control={`${control}.type`}
        disabled={busy}
      />

      <div className="ts-diagram-count" role="group" aria-label={template.counts.noun}>
        <span className="ts-diagram-count-label" id="ts-diagram-count-label">
          {template.counts.noun}
        </span>
        <div className="ts-diagram-stepper">
          <ToolButton
            title={`Fewer ${template.counts.noun.toLowerCase()}`}
            doc={`Down to ${template.counts.min}`}
            icon="minus"
            control={`${control}.count.less`}
            disabled={busy || count <= template.counts.min}
            onClick={() => setCount(count - 1)}
          />
          <input
            type="number"
            className="ts-diagram-count-field"
            value={count}
            min={template.counts.min}
            max={template.counts.max}
            aria-labelledby="ts-diagram-count-label"
            data-control={`${control}.count`}
            disabled={busy}
            {...countTip}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) setCount(value);
            }}
          />
          <ToolButton
            title={`More ${template.counts.noun.toLowerCase()}`}
            doc={`Up to ${template.counts.max}`}
            icon="plus"
            control={`${control}.count.more`}
            disabled={busy || count >= template.counts.max}
            onClick={() => setCount(count + 1)}
          />
        </div>
      </div>

      <DiagramStylePicker
        kind={kind}
        count={count}
        value={style}
        onChange={setStyle}
        control={`${control}.style`}
        disabled={busy}
      />

      <div className="ts-diagram-live" data-control={`${control}.preview`}>
        <DiagramPreview
          blocks={template.make(count, style, PREVIEW_BOX, 'preview')}
          box={{ x: 0, y: 0, w: DIAGRAM_TILE_VIEW.w, h: DIAGRAM_TILE_VIEW.h }}
          label={`${template.label} with ${count} ${template.counts.noun.toLowerCase()}`}
          className="is-live"
        />
      </div>

      <div className="ts-diagram-insert">
        <ToolButton
          label={words.insert}
          title={words.insert}
          doc={`Adds the ${template.label.toLowerCase()} to this slide as one group`}
          solid
          control={`${control}.insert`}
          disabled={busy || pending}
          onClick={insert}
        />
        <span className="ts-diagram-box" aria-hidden="true">
          {`${Math.round((box ?? DIAGRAM_DEFAULT_BOX).w)} × ${Math.round((box ?? DIAGRAM_DEFAULT_BOX).h)}`}
        </span>
      </div>
    </Panel>
  );
}
