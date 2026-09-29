import { useRef, useState } from 'react';

import type { AssetId } from '@turboslide/schema/ids';
import type { Block, ShotFrame } from '@turboslide/schema/blocks';
import type { Color } from '@turboslide/schema/color';
import { DASHES, DASH_LABELS, presetOf } from '@turboslide/schema/shapes';
import type { Dash } from '@turboslide/schema/shapes';
import { CAPTION_ROW_HEIGHT } from '@turboslide/render/block-css';

import { UseOnEverySlideButton } from '../brand/UseOnEverySlide';
import type { PictureTarget } from '../editor-shell';
import { FORMAT, PROMPTS } from '../menus/strings';
import { ShapePicker } from '../pickers/ShapePicker';
import { tipProps } from '../Tooltip';
import { ColorRow, Note, PanelButton, SelectField, SliderField, ToggleRow } from './fields';
import type { SectionWrite } from './fields';

/**
 * Image options and Adjustments (gslides-parity SPEC-2 0.17, 2.5, section 5; R05 B11; docs/POLISH.md
 * item 40): the picture's panel in the seller's words. The name of the picture (its file's name as
 * the asset's id reads it), Replace image, Use on every slide, Crop image, Reset image, a labelled
 * Crop anchor (Top or Centre while no trim is set), Mask (a shape picker and None), the Caption
 * field, and Border (weight, dash, colour), the tail's word, on a shot and a picture object;
 * Transparency, Brightness and Contrast as sliders with a value field and Reset on a shot, a
 * picture and an icon (transparency only). Each control is one action call: `block.crop` through
 * the handle, `block.mask`, `block.resetImage`, `block.set /frame`, `block.set /crop`,
 * `block.adjust`. No generated row draws for a picture (format-sections.ts routes them away), so
 * the id, the role, the resample rule and the twins never reach the panel (audit-media item 7).
 */

/**
 * The words of item 40 that are not in `FORMAT.picture` yet: the request build/b4.md R4 moves
 * `border` and `name` into `packages/chrome/src/menus/strings.ts` and this table goes.
 */
const PICTURE_WORDS = { border: 'Border', name: 'Name' } as const;

/** The picture's name as a seller reads it: the asset's id with its dashes as spaces. */
export function pictureNameOfAsset(
  asset: { id: AssetId } | undefined,
  fallback = 'Picture',
): string {
  if (asset === undefined) return fallback;
  const words = asset.id.replace(/[-_]+/g, ' ').trim();
  return words === '' ? fallback : words[0]?.toUpperCase() + words.slice(1);
}
/**
 * The caption of a shot (docs/PRODUCT.md section 2 rank 10; the right click row Add a caption
 * writes the same field): a text field with the prompt "Add a caption", committed on Enter and on
 * blur as one `block.set /caption`; an emptied field removes the caption, so the figure draws no
 * figcaption. A picture object (the covering `picture` block) carries no caption.
 */
function CaptionField({
  value,
  disabled,
  onCommit,
}: {
  value: string | undefined;
  disabled: boolean;
  onCommit: (caption: string | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  /* the draft as the handlers read it: Enter commits and blurs in one event, and the blur's
     commit would read the draft of the render its handler was bound in and write the caption a
     second time (the fields.tsx NumberField rule, docs/RETURN.md 2.14 item 3) */
  const draftRef = useRef<string | null>(null);
  const tip = tipProps({
    name: 'Caption',
    doc: 'One line under the picture; empty removes it',
    key: 'Enter',
  });
  const commit = () => {
    const typed = draftRef.current;
    if (typed === null) return;
    draftRef.current = null;
    const next = typed.trim();
    setDraft(null);
    if (next === (value ?? '')) return;
    onCommit(next === '' ? undefined : next);
  };
  return (
    <label className="ts-fo-field ts-fo-caption">
      <span className="ts-fo-field-label">Caption</span>
      <input
        type="text"
        value={draft ?? value ?? ''}
        placeholder={PROMPTS.caption}
        aria-label="Caption"
        data-control="formatOptions.picture.caption"
        disabled={disabled}
        autoComplete="off"
        {...tip}
        onChange={(event) => {
          draftRef.current = event.target.value;
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          tip.onKeyDown(event);
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            draftRef.current = null;
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        onBlur={(event) => {
          tip.onBlur(event);
          commit();
        }}
      />
    </label>
  );
}

export type PictureSectionProps = {
  block: Block;
  write: SectionWrite;
  /** the route's file picker for Replace image */
  uploadPicture?: (target: PictureTarget) => void;
  say: (text: string) => void;
};

/** The asset a shot or a picture object shows, for the name line. */
function assetOf(block: Block): { id: AssetId } | undefined {
  return block.type === 'shot' || block.type === 'picture' ? { id: block.asset } : undefined;
}

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
  const field = (path: string, value: unknown) => ({
    slideId: write.slideId,
    blockId: block.id,
    path,
    ...(value === undefined ? {} : { value }),
  });
  const set = (path: string, value: unknown) =>
    write.report(
      write.dispatch('block.set', { ...field(path, value), baseRevision: write.revision }),
    );
  /* several fields in one write, one history entry */
  const setAll = (writes: [string, unknown][]) =>
    write.report(
      write.dispatch('slide.update', {
        slideId: write.slideId,
        mutations: writes.map(([path, value]) => ({
          op: 'block.set' as const,
          ...field(path, value),
        })),
        baseRevision: write.revision,
      }),
    );
  const setFrame = (patch: Partial<ShotFrame>) => {
    const next: Record<string, unknown> = { ...frame, ...patch };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    set('/frame', Object.keys(next).length === 0 ? undefined : next);
  };
  /* Border weight None on a shot takes the hairline too (docs/POLISH.md item 38): a picture
     inserted before the round, which draws sheet.css's hairline, loses it here */
  const setWeight = (weight: number) => {
    const next: Record<string, unknown> = { ...frame };
    if (weight === 0) delete next.weight;
    else next.weight = weight;
    const frameValue = Object.keys(next).length === 0 ? undefined : next;
    if (weight === 0 && block.type === 'shot' && block.border !== false)
      setAll([
        ['/frame', frameValue],
        ['/border', false],
      ]);
    else set('/frame', frameValue);
  };
  /* a caption grows the box by its row and an emptied caption gives it back (item 43), so the
     photograph keeps its drawn height */
  const setCaption = (caption: string | undefined) => {
    if (block.type !== 'shot' || block.pos === undefined) {
      set('/caption', caption);
      return;
    }
    const had = block.caption !== undefined;
    const has = caption !== undefined;
    if (had === has) {
      set('/caption', caption);
      return;
    }
    const h = Math.max(8, block.pos.h + (has ? CAPTION_ROW_HEIGHT : -CAPTION_ROW_HEIGHT));
    setAll([
      ['/caption', caption],
      ['/pos', { ...block.pos, h }],
    ]);
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
      <div className="ts-fo-row" data-control="formatOptions.picture.name">
        <span className="ts-fo-field-label">{PICTURE_WORDS.name}</span>
        <span className="ts-fo-picture-name">{pictureNameOfAsset(assetOf(block))}</span>
      </div>
      {block.type === 'shot' ? (
        <CaptionField value={block.caption} disabled={write.busy} onCommit={setCaption} />
      ) : null}
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
        {/* the picture as the kit's logo on every slide (docs/PRODUCT.md 4.4; build/b5.md 0.4) */}
        <UseOnEverySlideButton block={block} />
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
        <div className="ts-fo-row">
          <span className="ts-fo-field-label">{words.anchor}</span>
          <ToggleRow<'top' | 'center'>
            label={words.anchor}
            options={[
              { value: 'top', label: words.top, doc: 'The picture keeps its top' },
              { value: 'center', label: words.centre, doc: 'The picture keeps its center' },
            ]}
            pressed={block.crop ?? 'center'}
            onToggle={(value) => set('/crop', value === 'center' ? undefined : value)}
            control="formatOptions.picture.anchor"
            disabled={write.busy}
          />
        </div>
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
          /* seven tiles per row fit the 320 px panel (docs/POLISH.md item 42; the plate's grid is
             eight wide and clipped its last column here) */
          <ShapePicker
            onPick={mask}
            picked={block.mask}
            control="formatOptions.picture.mask"
            columns={7}
            autoFocus
          />
        ) : null}
      </div>
      <div className="ts-fo-row">
        <span className="ts-fo-field-label">{PICTURE_WORDS.border}</span>
        <div className="ts-fo-fields is-two">
          <SelectField<string>
            label={`${PICTURE_WORDS.border} ${words.weight.toLowerCase()}`}
            value={String(frame.weight ?? 0)}
            control="formatOptions.picture.frame.weight"
            options={[
              { value: '0', label: words.none },
              { value: '1', label: '1 px' },
              { value: '1.5', label: '1.5 px' },
              { value: '2', label: '2 px' },
            ]}
            onChange={(value) => setWeight(Number(value))}
            disabled={write.busy}
          />
          <SelectField<string>
            label={`${PICTURE_WORDS.border} ${words.dash.toLowerCase()}`}
            value={frame.dash ?? 'solid'}
            control="formatOptions.picture.frame.dash"
            options={DASHES.map((dash) => ({ value: dash, label: DASH_LABELS[dash] }))}
            onChange={(value) =>
              setFrame({ dash: value === 'solid' ? undefined : (value as Dash) })
            }
            disabled={write.busy}
          />
        </div>
        {/* a colour with no weight draws at 1 px (item 44; picture.ts frameDeclarations reads
            weight 1 when the field is absent), so the pick shows at once */}
        <ColorRow
          label={`${PICTURE_WORDS.border} ${words.color.toLowerCase()}`}
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
  const dispatchAdjust = (fields: Record<string, number | null>) =>
    write.report(
      write.dispatch('block.adjust', {
        slideId: write.slideId,
        blockId: block.id,
        ...fields,
        baseRevision: write.revision,
      }),
    );
  const percent = (value: number | undefined) => Math.round((value ?? 0) * 100);
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
      <div className="ts-fo-buttons">
        <PanelButton
          label={words.reset}
          control="formatOptions.adjustments.reset"
          onClick={() => dispatchAdjust({ transparency: null, brightness: null, contrast: null })}
          disabled={write.busy || Object.keys(adjust).length === 0}
          doc="Back to the picture as it was taken"
        />
      </div>
    </>
  );
}
