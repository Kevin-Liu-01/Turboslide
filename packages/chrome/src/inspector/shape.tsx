import { useState } from 'react';

import type { ShapeBlock } from '@turboslide/schema/blocks';
import { presetOf, shapeAdjustDefaults, shapeGuides } from '@turboslide/schema/shapes';

import { FORMAT } from '../menus/strings';
import { ShapePicker } from '../pickers/ShapePicker';
import { NumberField, PanelButton } from './fields';
import type { SectionWrite } from './fields';

/**
 * The Shape section (gslides-parity SPEC-2 2.3.1, 2.3.2, section 5): the shape's name with a
 * Change shape button opening the picker, and the preset's adjust values as fields named after the
 * guide (Pointer x and Pointer y on a callout, Corner on a rounded rectangle), as fractions of
 * 100000 in the definitions file's order. Every control is one `shape.set`.
 */
export type ShapeSectionProps = { block: ShapeBlock; write: SectionWrite };

/** A guide's plain name: `adj` reads Adjust, `adj1` Adjust 1, `adjX` X. */
export function guideLabel(guide: string, count: number): string {
  if (count === 1) return FORMAT.shape.adjust;
  const suffix = guide.replace(/^adj/i, '');
  if (suffix === '') return FORMAT.shape.adjust;
  if (/^\d+$/.test(suffix)) return `${FORMAT.shape.adjust} ${suffix}`;
  return `${FORMAT.shape.adjust} ${suffix.toUpperCase()}`;
}

export function ShapeSection({ block, write }: ShapeSectionProps) {
  const words = FORMAT.shape;
  const [pickerOpen, setPickerOpen] = useState(false);
  const preset = presetOf(block.shape);
  const guides = shapeGuides(block.shape);
  const defaults = shapeAdjustDefaults(block.shape);
  const adjust = block.adjust ?? defaults;
  const set = (fields: Record<string, unknown>) =>
    write.report(
      write.dispatch('shape.set', {
        slideId: write.slideId,
        blockIds: [block.id],
        ...fields,
        baseRevision: write.revision,
      }),
    );
  return (
    <>
      <div className="ts-fo-row">
        <span className="ts-fo-field-label">{words.shape}</span>
        <div className="ts-fo-buttons">
          <PanelButton
            label={preset?.label ?? block.shape}
            icon="square-2-stack"
            control="formatOptions.shape.change"
            onClick={() => setPickerOpen((on) => !on)}
            pressed={pickerOpen}
            disabled={write.busy}
            doc={FORMAT.changeShape}
          />
        </div>
        {pickerOpen ? (
          <ShapePicker
            onPick={(shape) => {
              setPickerOpen(false);
              set({ kind: shape, adjust: null });
            }}
            picked={block.shape}
            control="formatOptions.shape.change"
            autoFocus
          />
        ) : null}
      </div>
      {guides.length > 0 ? (
        <div className="ts-fo-fields is-two">
          {guides.map((guide, index) => (
            <NumberField
              key={guide}
              label={guideLabel(guide, guides.length)}
              value={Math.round(((adjust[index] ?? defaults[index] ?? 50000) / 100000) * 100)}
              control={`formatOptions.shape.adjust.${index}`}
              onCommit={(value) => {
                const next = [...adjust];
                while (next.length < guides.length) next.push(defaults[next.length] ?? 50000);
                next[index] = Math.round((Math.max(0, Math.min(100, value)) / 100) * 100000);
                set({ adjust: next });
              }}
              disabled={write.busy}
              min={0}
              max={100}
              unit="%"
              doc="A fraction of the shape’s box"
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
