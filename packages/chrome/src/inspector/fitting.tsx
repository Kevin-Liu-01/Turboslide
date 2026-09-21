import type { Block } from '@turboslide/schema/blocks';
import { paddingSides } from '@turboslide/schema/blocks';
import type { Autofit, Valign } from '@turboslide/schema/blocks';
import type { TableBlock } from '@turboslide/schema/blocks/table';

import { FORMAT } from '../menus/strings';
import { NumberField, Note, RadioList, ToggleRow } from './fields';
import type { SectionWrite } from './fields';

/**
 * Text fitting (gslides-parity SPEC-2 0.23, 0.41, 2.1.5, 2.2.18, 2.2.19, section 5; R09 A5):
 * Autofit as Google's three radios (Resize shape to fit text disabled on a block without `pos`
 * with its note), Indentation Left in px, Padding as one head over a two by two grid of Top,
 * Bottom, Left and Right with the unit inside each field (docs/PRODUCT.md 3.2; audit-interface
 * 15) and Vertical alignment on a positioned box, shape or text box, or a table. Each control is one action call: `block.autofit`
 * with `apply` so the fit is written at once, `text.indent` with `to`, `block.set /padding`,
 * `block.set /valign`.
 */
export type FittingSectionProps = { block: Block; write: SectionWrite };

function currentAutofit(block: Block): Autofit {
  return 'autofit' in block && block.autofit !== undefined ? block.autofit : 'none';
}

export function TextFittingSection({ block, write }: FittingSectionProps) {
  const words = FORMAT.fitting;
  const positioned = block.pos !== undefined;
  const takesPadding =
    positioned && (block.type === 'box' || block.type === 'shape' || block.type === 'text');
  const takesValign = takesPadding || block.type === 'table';
  const typography =
    'typography' in block && typeof block.typography === 'object' && block.typography !== null
      ? (block.typography as Record<string, unknown>)
      : {};
  const indent = typeof typography.indent === 'number' ? typography.indent : 0;
  const padding =
    'padding' in block && block.padding !== undefined ? paddingSides(block.padding) : undefined;
  const valign: Valign =
    block.type === 'table'
      ? ((block as TableBlock).valign ?? 'top')
      : 'valign' in block && block.valign !== undefined
        ? block.valign
        : 'top';
  const hasAutofit = block.type !== 'table';

  const set = (path: string, value: unknown) =>
    write.report(
      write.dispatch('block.set', {
        slideId: write.slideId,
        blockId: block.id,
        path,
        ...(value === undefined ? {} : { value }),
        baseRevision: write.revision,
      }),
    );

  const setPadding = (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
    const current = padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    set('/padding', { ...current, [side]: Math.max(0, Math.round(value)) });
  };

  return (
    <>
      {hasAutofit ? (
        <RadioList<Autofit>
          label={FORMAT.autofit.title}
          value={currentAutofit(block)}
          control="formatOptions.textFitting.autofit"
          options={[
            {
              value: 'none',
              label: FORMAT.autofit.none,
              doc: 'The text keeps its size and may leave its box',
            },
            {
              value: 'shrink',
              label: FORMAT.autofit.shrink,
              doc: 'The size steps down until the text fits',
            },
            {
              value: 'grow',
              label: FORMAT.autofit.grow,
              doc: 'The box grows to the text',
              disabled: !positioned,
              ...(positioned ? {} : { note: FORMAT.autofit.growNote }),
            },
          ]}
          onChange={(autofit) =>
            write.report(
              write.dispatch('block.autofit', {
                slideId: write.slideId,
                blockId: block.id,
                autofit,
                ...(autofit === 'none' ? {} : { apply: true }),
                baseRevision: write.revision,
              }),
            )
          }
          disabled={write.busy}
        />
      ) : null}
      {block.type !== 'table' ? (
        <div className="ts-fo-fields is-two">
          <NumberField
            label={`${words.indentation}: ${words.left}`}
            value={indent}
            control="formatOptions.textFitting.indent"
            onCommit={(to) =>
              write.report(
                write.dispatch('text.indent', {
                  slideId: write.slideId,
                  blockIds: [block.id],
                  to: Math.max(0, Math.round(to)),
                  baseRevision: write.revision,
                }),
              )
            }
            disabled={write.busy}
            min={0}
            step={8}
            unit="px"
            doc="The paragraphs’ left indent"
          />
        </div>
      ) : null}
      {takesPadding ? (
        <div className="ts-fo-row ts-fo-padding" data-control="formatOptions.padding">
          {/* one Padding head over a two by two grid of Top, Bottom, Left, Right, the unit inside
              each field (docs/PRODUCT.md 3.2; audit-interface 15) */}
          <span className="ts-fo-field-label ts-fo-head">{words.padding}</span>
          <div className="ts-fo-fields is-two">
            {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
              <NumberField
                key={side}
                label={words[side]}
                value={padding?.[side] ?? 0}
                control={`formatOptions.padding.${side}`}
                onCommit={(value) => setPadding(side, value)}
                disabled={write.busy}
                min={0}
                unit="px"
                doc={`The space between the ${side} edge and the text`}
              />
            ))}
          </div>
        </div>
      ) : null}
      {takesValign ? (
        <>
          <span className="ts-fo-field-label">{words.valign}</span>
          <ToggleRow<Valign>
            label={words.valign}
            options={[
              { value: 'top', label: words.top },
              { value: 'middle', label: words.middle },
              { value: 'bottom', label: words.bottom },
            ]}
            pressed={valign}
            onToggle={(value) => set('/valign', value === 'top' ? undefined : value)}
            control="formatOptions.textFitting.valign"
            disabled={write.busy}
          />
        </>
      ) : null}
      {!takesPadding && block.type !== 'table' ? <Note>{words.paddingNote}</Note> : null}
    </>
  );
}
