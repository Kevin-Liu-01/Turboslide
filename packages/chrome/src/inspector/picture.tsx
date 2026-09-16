import { useState } from 'react';

import type { Block, RecolorPreset, ShotFrame, ShotReflection } from '@turboslide/schema/blocks';
import { RECOLOR_PRESETS } from '@turboslide/schema/blocks';
import type { Color } from '@turboslide/schema/color';
import { DASHES, DASH_LABELS, presetOf } from '@turboslide/schema/shapes';
import type { Dash } from '@turboslide/schema/shapes';

import type { PictureTarget } from '../editor-shell';
import { FORMAT } from '../menus/strings';
import { ShapePicker } from '../pickers/ShapePicker';
import {
  CheckField,
  ColorRow,
  Note,
  PanelButton,
  SelectField,
  SliderField,
  ToggleRow,
} from './fields';
import type { SectionWrite } from './fields';

/**
 * The words of the two Adjustments rows of round five (gslides-parity SPEC-5 0.47; SPEC-2 12):
 * Google's Reflection has three sliders (Transparency, Distance, Size) and Recolor is a dropdown
 * whose first entry is "No recolor"; the preset names below the three colour maps are Turboslide's
 * own over the theme's colours (Google builds its list from the theme's colours; the list is
 * `unverified: true` in the menu model), each spelt "Colour, light" or "Colour, dark".
 */
export const PICTURE_EFFECTS = {
  reflection: 'Reflection',
  reflectionOn: 'Add reflection',
  transparency: 'Transparency',
  distance: 'Distance',
  size: 'Size',
  recolor: 'Recolor',
} as const;

/** Google's default when Reflection is switched on (unverified; a visible, moderate reflection). */
export const DEFAULT_REFLECTION: ShotReflection = { transparency: 0.5, distance: 8, size: 0.4 };

export const RECOLOR_LABELS: Readonly<Record<RecolorPreset, string>> = {
  none: 'No recolor',
  grayscale: 'Grayscale',
  sepia: 'Sepia',
  negative: 'Negative',
  'ink-light': 'Ink, light',
  'ink-dark': 'Ink, dark',
  'ink-2-light': 'Ink 2, light',
  'ink-2-dark': 'Ink 2, dark',
  'titanium-light': 'Titanium, light',
  'titanium-dark': 'Titanium, dark',
  'green-light': 'Green, light',
  'green-dark': 'Green, dark',
  'amber-light': 'Amber, light',
  'amber-dark': 'Amber, dark',
  'red-light': 'Red, light',
  'red-dark': 'Red, dark',
  'blue-light': 'GT blue, light',
  'blue-dark': 'GT blue, dark',
};

/**
 * Picture and Adjustments (gslides-parity SPEC-2 0.17, 2.5, section 5; R05 B11): Replace image,
 * Crop (a Crop image button entering crop mode through the editor's handle, plus Top and Centre
 * for the round one anchor while no trim is set), Mask (a shape picker button and None), Reset
 * image, Frame (weight, colour, dash) on a shot and a picture object; Transparency, Brightness and
 * Contrast as sliders with a value field and Reset on a shot, a picture and an icon (transparency
 * only). Each control is one action call: `block.crop` through the handle, `block.mask`,
 * `block.resetImage`, `block.set /frame`, `block.set /crop`, `block.adjust`. The generated rows of
 * round one (asset, caption, fit) stay above.
 */
export type PictureSectionProps = {
  block: Block;
  write: SectionWrite;
  /** the route's file picker for Replace image */
  uploadPicture?: (target: PictureTarget) => void;
  say: (text: string) => void;
};

function hasPictureTools(block: Block): block is Block & {
  trim?: unknown;
  mask?: string;
  frame?: ShotFrame;
} {
  return block.type === 'shot' || block.type === 'picture';
}

export function PictureSection({ block, write, uploadPicture, say }: PictureSectionProps) {
  const words = FORMAT.picture;
  const [maskOpen, setMaskOpen] = useState(false);
  if (!hasPictureTools(block)) return null;
  const frame = block.frame ?? {};
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
  const setFrame = (patch: Partial<ShotFrame>) => {
    const next: Record<string, unknown> = { ...frame, ...patch };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    set('/frame', Object.keys(next).length === 0 ? undefined : next);
  };
  const mask = (shape: string | null) => {
    setMaskOpen(false);
    write.report(
      write.dispatch('block.mask', {
        slideId: write.slideId,
        blockId: block.id,
        mask: shape,
        baseRevision: write.revision,
      }),
    );
  };
  const edited =
    block.trim !== undefined ||
    block.mask !== undefined ||
    ('adjust' in block && block.adjust !== undefined) ||
    (block.type === 'shot' && (block.crop !== undefined || block.aspect !== undefined));
  const maskLabel =
    block.mask === undefined ? words.none : (presetOf(block.mask)?.label ?? block.mask);

  return (
    <>
      <div className="ts-fo-buttons">
        <PanelButton
          label={words.replace}
          icon="arrow-path"
          control="formatOptions.picture.replace"
          onClick={() => {
            if (uploadPicture)
              uploadPicture({
                kind: 'block',
                slideId: write.slideId,
                blockId: block.id,
                path: '/asset',
              });
            else say('Open a slide in Editing mode to add a picture');
          }}
          disabled={write.busy}
          doc="Another picture in the same box"
        />
        <PanelButton
          label={words.crop}
          icon="viewfinder-circle"
          control="formatOptions.picture.crop"
          onClick={() => {
            if (write.editor?.cropMode) write.editor.cropMode();
            else say('Double click the picture on the slide to crop it');
          }}
          disabled={write.busy}
          doc="Drag the handles to crop; press Enter to finish"
        />
        <PanelButton
          label={words.reset}
          icon="arrow-uturn-left"
          control="formatOptions.picture.reset"
          onClick={() =>
            write.report(
              write.dispatch('block.resetImage', {
                slideId: write.slideId,
                blockId: block.id,
                baseRevision: write.revision,
              }),
            )
          }
          disabled={write.busy || !edited}
          doc="Removes the crop, mask and adjustments"
        />
      </div>
      {block.type === 'shot' && block.trim === undefined ? (
        <ToggleRow<'top' | 'center'>
          label={words.anchor}
          options={[
            { value: 'top', label: words.top, doc: 'The picture keeps its top' },
            { value: 'center', label: words.centre, doc: 'The picture keeps its centre' },
          ]}
          pressed={block.crop ?? 'center'}
          onToggle={(value) => set('/crop', value === 'center' ? undefined : value)}
          control="formatOptions.picture.anchor"
          disabled={write.busy}
        />
      ) : null}
      <div className="ts-fo-row">
        <span className="ts-fo-field-label">{words.mask}</span>
        <div className="ts-fo-buttons">
          <PanelButton
            label={maskLabel}
            icon="square-2-stack"
            control="formatOptions.picture.mask"
            onClick={() => setMaskOpen((on) => !on)}
            pressed={maskOpen}
            disabled={write.busy}
            doc="Shows the picture inside a shape"
          />
          {block.mask !== undefined ? (
            <PanelButton
              label={words.none}
              control="formatOptions.picture.mask.none"
              onClick={() => mask(null)}
              disabled={write.busy}
              doc="Removes the mask"
            />
          ) : null}
        </div>
        {maskOpen ? (
          <ShapePicker
            onPick={mask}
            picked={block.mask}
            control="formatOptions.picture.mask"
            autoFocus
          />
        ) : null}
      </div>
      <div className="ts-fo-row">
        <span className="ts-fo-field-label">{words.frame}</span>
        <div className="ts-fo-fields is-two">
          <SelectField<string>
            label={`${words.frame} ${words.weight}`}
            value={String(frame.weight ?? 0)}
            control="formatOptions.picture.frame.weight"
            options={[
              { value: '0', label: words.none },
              { value: '1', label: '1 px' },
              { value: '1.5', label: '1.5 px' },
              { value: '2', label: '2 px' },
            ]}
            onChange={(value) =>
              setFrame({ weight: value === '0' ? undefined : (Number(value) as 1 | 1.5 | 2) })
            }
            disabled={write.busy}
          />
          <SelectField<string>
            label={`${words.frame} ${words.dash}`}
            value={frame.dash ?? 'solid'}
            control="formatOptions.picture.frame.dash"
            options={DASHES.map((dash) => ({ value: dash, label: DASH_LABELS[dash] }))}
            onChange={(value) =>
              setFrame({ dash: value === 'solid' ? undefined : (value as Dash) })
            }
            disabled={write.busy}
          />
        </div>
        <ColorRow
          label={`${words.frame} ${words.color}`}
          current={frame.color as Color | undefined}
          control="formatOptions.picture.frame.color"
          onPick={(value) => setFrame({ color: value ?? undefined })}
          disabled={write.busy}
        />
      </div>
    </>
  );
}

export function AdjustmentsSection({ block, write }: { block: Block; write: SectionWrite }) {
  const words = FORMAT.adjustments;
  const adjust =
    (block.type === 'shot' || block.type === 'picture') && block.adjust !== undefined
      ? block.adjust
      : {};
  const transparencyOnly = block.type === 'icon';
  const dispatchAdjust = (fields: Record<string, number | null | ShotReflection | RecolorPreset>) =>
    write.report(
      write.dispatch('block.adjust', {
        slideId: write.slideId,
        blockId: block.id,
        ...fields,
        baseRevision: write.revision,
      }),
    );
  const percent = (value: number | undefined) => Math.round((value ?? 0) * 100);
  const reflection = adjust.reflection;
  const recolor: RecolorPreset = adjust.recolor ?? 'none';
  const setReflection = (patch: Partial<ShotReflection>) =>
    dispatchAdjust({ reflection: { ...(reflection ?? DEFAULT_REFLECTION), ...patch } });
  return (
    <>
      <SliderField
        label={words.transparency}
        value={percent(adjust.transparency)}
        min={0}
        max={100}
        control="formatOptions.adjustments.transparency"
        onCommit={(value) => dispatchAdjust({ transparency: value === 0 ? null : value / 100 })}
        disabled={write.busy}
        unit="%"
      />
      {transparencyOnly ? (
        <Note>An icon takes transparency only</Note>
      ) : (
        <>
          <SliderField
            label={words.brightness}
            value={percent(adjust.brightness)}
            min={-100}
            max={100}
            control="formatOptions.adjustments.brightness"
            onCommit={(value) => dispatchAdjust({ brightness: value === 0 ? null : value / 100 })}
            disabled={write.busy}
            unit="%"
          />
          <SliderField
            label={words.contrast}
            value={percent(adjust.contrast)}
            min={-100}
            max={100}
            control="formatOptions.adjustments.contrast"
            onCommit={(value) => dispatchAdjust({ contrast: value === 0 ? null : value / 100 })}
            disabled={write.busy}
            unit="%"
          />
        </>
      )}
      {transparencyOnly ? null : (
        <>
          {/* Reflection (gslides-parity SPEC-5 0.47): on or off, then Google's three sliders */}
          <div className="ts-fo-row" data-control="formatOptions.adjustments.reflection">
            <CheckField
              label={PICTURE_EFFECTS.reflectionOn}
              checked={reflection !== undefined}
              control="formatOptions.adjustments.reflection.on"
              onChange={(on) => dispatchAdjust({ reflection: on ? DEFAULT_REFLECTION : null })}
              disabled={write.busy}
              doc="A mirrored copy of the picture below it"
            />
            {reflection !== undefined ? (
              <>
                <SliderField
                  label={`${PICTURE_EFFECTS.reflection} ${PICTURE_EFFECTS.transparency.toLowerCase()}`}
                  value={percent(reflection.transparency)}
                  min={0}
                  max={100}
                  control="formatOptions.adjustments.reflection.transparency"
                  onCommit={(value) => setReflection({ transparency: value / 100 })}
                  disabled={write.busy}
                  unit="%"
                />
                <SliderField
                  label={`${PICTURE_EFFECTS.reflection} ${PICTURE_EFFECTS.distance.toLowerCase()}`}
                  value={Math.round(reflection.distance)}
                  min={0}
                  max={200}
                  control="formatOptions.adjustments.reflection.distance"
                  onCommit={(value) => setReflection({ distance: value })}
                  disabled={write.busy}
                  unit=" px"
                />
                <SliderField
                  label={`${PICTURE_EFFECTS.reflection} ${PICTURE_EFFECTS.size.toLowerCase()}`}
                  value={percent(reflection.size)}
                  min={0}
                  max={100}
                  control="formatOptions.adjustments.reflection.size"
                  onCommit={(value) => setReflection({ size: value / 100 })}
                  disabled={write.busy}
                  unit="%"
                />
              </>
            ) : null}
          </div>
          {/* Recolor: No recolor, the three colour maps, the duotones over the theme's colours */}
          <SelectField<RecolorPreset>
            label={PICTURE_EFFECTS.recolor}
            value={recolor}
            control="formatOptions.adjustments.recolor"
            options={RECOLOR_PRESETS.map((preset) => ({
              value: preset,
              label: RECOLOR_LABELS[preset],
            }))}
            onChange={(value) => dispatchAdjust({ recolor: value === 'none' ? null : value })}
            disabled={write.busy}
            doc="Grayscale and the duotones are written as PowerPoint's own colour maps; the rest are baked into the picture"
          />
        </>
      )}
      <div className="ts-fo-buttons">
        <PanelButton
          label={words.reset}
          control="formatOptions.adjustments.reset"
          onClick={() =>
            dispatchAdjust({
              transparency: null,
              brightness: null,
              contrast: null,
              ...(transparencyOnly ? {} : { reflection: null, recolor: null }),
            })
          }
          disabled={write.busy || Object.keys(adjust).length === 0}
          doc="Back to the picture as it was taken"
        />
      </div>
    </>
  );
}
