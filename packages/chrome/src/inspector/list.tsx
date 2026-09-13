import { useState } from 'react';

import type { PlainBlock } from '@turboslide/schema/blocks';
import { BULLET_PRESETS, LIST_LEVEL_MAX, NUMBER_PRESETS, plainText } from '@turboslide/schema/text';
import type { ListMarker } from '@turboslide/schema/text';

import { FORMAT } from '../menus/strings';
import { PresetPicker } from '../pickers/PresetPicker';
import { NumberField, PanelButton, ToggleRow } from './fields';
import type { SectionWrite } from './fields';

/**
 * The List section's round two rows (gslides-parity SPEC-2 0.4, 0.58, 2.2.12, section 5): Marker
 * (Ruled, Bulleted, Numbered), Preset (the grid of the marker's family), and per item Level 1 to
 * 9. Every control is one `text.list`; the generated item rows of round one stay above.
 */
export type ListSectionProps = { block: PlainBlock; write: SectionWrite };

export function ListSection({ block, write }: ListSectionProps) {
  const words = FORMAT.list;
  const [presetOpen, setPresetOpen] = useState(false);
  const marker: ListMarker = block.marker ?? 'rule';
  const family = marker === 'number' ? 'number' : 'bullet';
  const set = (fields: Record<string, unknown>) =>
    write.report(
      write.dispatch('text.list', {
        slideId: write.slideId,
        blockId: block.id,
        ...fields,
        baseRevision: write.revision,
      }),
    );
  return (
    <>
      <ToggleRow<ListMarker>
        label={words.marker}
        options={[
          { value: 'rule', label: FORMAT.ruled, doc: 'The theme’s ruled list' },
          { value: 'bullet', label: words.bulleted, doc: 'A glyph before each item' },
          { value: 'number', label: words.numbered, doc: 'A numeral before each item' },
        ]}
        pressed={marker}
        onToggle={(value) =>
          set(
            value === 'rule'
              ? { marker: 'rule' }
              : {
                  marker: value,
                  preset: value === 'bullet' ? BULLET_PRESETS[0] : NUMBER_PRESETS[0],
                },
          )
        }
        control="formatOptions.list.marker"
        disabled={write.busy}
      />
      {marker !== 'rule' ? (
        <div className="ts-fo-row">
          <span className="ts-fo-field-label">{words.preset}</span>
          <div className="ts-fo-buttons">
            <PanelButton
              label={block.preset ?? (family === 'bullet' ? BULLET_PRESETS[0] : NUMBER_PRESETS[0])}
              control="formatOptions.list.preset"
              onClick={() => setPresetOpen((on) => !on)}
              pressed={presetOpen}
              disabled={write.busy}
              doc={family === 'bullet' ? 'Nine bullet styles' : 'Six numbering styles'}
            />
          </div>
          {presetOpen ? (
            <PresetPicker
              family={family}
              picked={block.preset}
              control="formatOptions.list.preset"
              autoFocus
              onPick={(preset) => {
                setPresetOpen(false);
                set({ marker, preset });
              }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="ts-fo-row">
        <span className="ts-fo-field-label">{words.level}</span>
        <div className="ts-fo-levels">
          {block.items.map((item, index) => (
            <div key={index} className="ts-fo-level">
              <span>{plainText(item.text).slice(0, 40) || `Item ${index + 1}`}</span>
              <NumberField
                label={`${words.level} of item ${index + 1}`}
                value={item.level ?? 1}
                control={`formatOptions.list.level.${index}`}
                onCommit={(value) =>
                  set({
                    items: [index],
                    level: Math.max(1, Math.min(LIST_LEVEL_MAX, Math.round(value))),
                  })
                }
                disabled={write.busy}
                min={1}
                max={LIST_LEVEL_MAX}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
