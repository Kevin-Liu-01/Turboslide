import type { ShapeBlock } from '@turboslide/schema/blocks';
import {
  DASHES,
  DASH_LABELS,
  LINE_ENDS,
  LINE_END_LABELS,
  isConnectorKind,
} from '@turboslide/schema/shapes';
import type { Dash, LineEnd } from '@turboslide/schema/shapes';

import { FORMAT } from '../menus/strings';
import { Note, PanelButton, SelectField, SliderField } from './fields';
import type { SectionWrite } from './fields';

/**
 * The Line section (gslides-parity SPEC-2 2.4, section 5; R05 A10): Line kind (Line, Arrow, Elbow
 * connector, Curved connector; the path kinds read only), Line start, Line end, Weight, Dash,
 * Bend on a connector, the point count of a path kind (Edit points is round three) and Detach for
 * an attached end (0.103). Every control is one `line.set`.
 */
export type LineSectionProps = { block: ShapeBlock; write: SectionWrite };

const KIND_OPTIONS = [
  { value: 'line', label: 'Line' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'elbow', label: 'Elbow connector' },
  { value: 'curved', label: 'Curved connector' },
] as const;

const PATH_LABELS: Readonly<Record<string, string>> = {
  curve: 'Curve',
  polyline: 'Polyline',
  scribble: 'Scribble',
};

export function LineSection({ block, write }: LineSectionProps) {
  const words = FORMAT.line;
  const set = (fields: Record<string, unknown>) =>
    write.report(
      write.dispatch('line.set', {
        slideId: write.slideId,
        blockIds: [block.id],
        ...fields,
        baseRevision: write.revision,
      }),
    );
  const isPath =
    block.shape === 'curve' || block.shape === 'polyline' || block.shape === 'scribble';
  const heads = block.arrowheads ?? (block.shape === 'arrow' ? 'end' : 'none');
  const start: LineEnd =
    block.lineStart ?? (heads === 'start' || heads === 'both' ? 'fillArrow' : 'none');
  const end: LineEnd =
    block.lineEnd ?? (heads === 'end' || heads === 'both' ? 'fillArrow' : 'none');
  const endOptions = LINE_ENDS.map((kind) => ({ value: kind, label: LINE_END_LABELS[kind] }));

  return (
    <>
      {isPath ? (
        <>
          <div className="ts-fo-row">
            <span className="ts-fo-field-label">{words.kind}</span>
            <span>{PATH_LABELS[block.shape] ?? block.shape}</span>
          </div>
          <div className="ts-fo-row">
            <span className="ts-fo-field-label">{words.points}</span>
            <span data-control="formatOptions.line.points">{block.points?.length ?? 0}</span>
            <Note>{words.pointsNote}</Note>
          </div>
        </>
      ) : (
        <SelectField<string>
          label={words.kind}
          value={block.shape}
          control="formatOptions.line.kind"
          options={KIND_OPTIONS}
          onChange={(value) => set({ kind: value })}
          disabled={write.busy}
        />
      )}
      <div className="ts-fo-fields is-two">
        <SelectField<LineEnd>
          label={words.start}
          value={start}
          control="formatOptions.line.start"
          options={endOptions}
          onChange={(value) => set({ start: value })}
          disabled={write.busy}
        />
        <SelectField<LineEnd>
          label={words.end}
          value={end}
          control="formatOptions.line.end"
          options={endOptions}
          onChange={(value) => set({ end: value })}
          disabled={write.busy}
        />
      </div>
      <div className="ts-fo-fields is-two">
        <SelectField<string>
          label={words.weight}
          value={String(block.width ?? 1)}
          control="formatOptions.line.weight"
          options={[1, 1.5, 2, 3, 4].map((w) => ({ value: String(w), label: `${w} px` }))}
          onChange={(value) => set({ weight: Number(value) })}
          disabled={write.busy}
        />
        <SelectField<Dash>
          label={words.dash}
          value={block.dash ?? 'solid'}
          control="formatOptions.line.dash"
          options={DASHES.map((dash) => ({ value: dash, label: DASH_LABELS[dash] }))}
          onChange={(value) => set({ dash: value === 'solid' ? null : value })}
          disabled={write.busy}
        />
      </div>
      {isConnectorKind(block.shape) && (block.shape === 'elbow' || block.shape === 'curved') ? (
        <SliderField
          label={words.bend}
          value={Math.round((block.bend ?? 0.5) * 100)}
          min={0}
          max={100}
          control="formatOptions.line.bend"
          onCommit={(value) => set({ bend: value / 100 })}
          disabled={write.busy}
          unit="%"
        />
      ) : null}
      {block.connect?.start !== undefined || block.connect?.end !== undefined ? (
        <div className="ts-fo-row">
          {(['start', 'end'] as const).map((which) => {
            const attached = block.connect?.[which];
            if (attached === undefined) return null;
            return (
              <div key={which} className="ts-fo-buttons">
                <span className="ts-fo-note">
                  {words.attached(which === 'start' ? words.start : words.end, attached.block)}
                </span>
                <PanelButton
                  label={FORMAT.detach}
                  control={`formatOptions.line.detach.${which}`}
                  onClick={() => set({ connect: { [which]: null } })}
                  disabled={write.busy}
                  doc="The end stays where it is and stops following the shape"
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
