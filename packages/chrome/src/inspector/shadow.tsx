import type { Block, Shadow } from '@turboslide/schema/blocks';
import { SHADOW_DEFAULTS } from '@turboslide/schema/blocks';
import type { Color } from '@turboslide/schema/color';
import type { Mutation } from '@turboslide/schema/mutations';

import { FORMAT } from '../menus/strings';
import { CheckField, ColorRow, SliderField } from './fields';
import type { SectionWrite } from './fields';

/**
 * Drop shadow (gslides-parity SPEC-2 0.15, 2.3.4, section 5; R05 B7): Enable as a checkbox, then
 * Color, Transparency, Angle, Distance and Blur radius as sliders with fields, Google's five
 * controls. One `block.shadow` per change with the whole shadow; on a group selection one
 * `slide.update` writing the shadow on every member that takes one (0.102).
 */
export type ShadowSectionProps = { blocks: ReadonlyArray<Block>; write: SectionWrite };

function shadowOf(block: Block): Shadow | undefined {
  return 'shadow' in block ? (block.shadow as Shadow | undefined) : undefined;
}

export function ShadowSection({ blocks, write }: ShadowSectionProps) {
  const words = FORMAT.shadow;
  const first = blocks[0];
  const current = first === undefined ? undefined : shadowOf(first);
  const on = current !== undefined;
  const shadow: Required<Shadow> = { ...SHADOW_DEFAULTS, ...(current ?? {}) } as Required<Shadow>;

  const commit = (next: Shadow | null) => {
    if (blocks.length === 1 && first !== undefined) {
      write.report(
        write.dispatch('block.shadow', {
          slideId: write.slideId,
          blockIds: [first.id],
          shadow: next,
          baseRevision: write.revision,
        }),
      );
      return;
    }
    const mutations: Mutation[] = blocks
      .filter(
        (block) =>
          'shadow' in block ||
          block.type === 'box' ||
          block.type === 'shape' ||
          block.type === 'text',
      )
      .map((block) => ({
        op: 'block.set',
        slideId: write.slideId,
        blockId: block.id,
        path: '/shadow',
        ...(next === null ? {} : { value: next }),
      }));
    write.report(
      write.dispatch('slide.update', {
        slideId: write.slideId,
        mutations,
        baseRevision: write.revision,
      }),
    );
  };

  const patch = (fields: Partial<Shadow>) => commit({ ...(current ?? {}), ...fields });

  return (
    <>
      <CheckField
        label={words.enable}
        checked={on}
        control="formatOptions.shadow.enable"
        onChange={(checked) => commit(checked ? { ...SHADOW_DEFAULTS } : null)}
        disabled={write.busy || blocks.length === 0}
        doc="A soft shadow under the object"
      />
      <ColorRow
        label={words.color}
        current={shadow.color as Color}
        control="formatOptions.shadow.color"
        onPick={(value) => patch({ color: value ?? SHADOW_DEFAULTS.color })}
        disabled={write.busy || !on}
        allowNone={false}
      />
      <SliderField
        label={words.transparency}
        value={Math.round((1 - shadow.opacity) * 100)}
        min={0}
        max={100}
        control="formatOptions.shadow.transparency"
        onCommit={(value) => patch({ opacity: Math.round(100 - value) / 100 })}
        disabled={write.busy || !on}
        unit="%"
      />
      <SliderField
        label={words.angle}
        value={Math.round(shadow.angle)}
        min={0}
        max={360}
        control="formatOptions.shadow.angle"
        onCommit={(value) => patch({ angle: value })}
        disabled={write.busy || !on}
        unit="°"
      />
      <SliderField
        label={words.distance}
        value={Math.round(shadow.distance)}
        min={0}
        max={100}
        control="formatOptions.shadow.distance"
        onCommit={(value) => patch({ distance: value })}
        disabled={write.busy || !on}
        unit="px"
      />
      <SliderField
        label={words.blur}
        value={Math.round(shadow.blur)}
        min={0}
        max={100}
        control="formatOptions.shadow.blur"
        onCommit={(value) => patch({ blur: value })}
        disabled={write.busy || !on}
        unit="px"
      />
    </>
  );
}
