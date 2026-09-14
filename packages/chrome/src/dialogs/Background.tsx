import { useEffect, useRef, useState } from 'react';

import { insertableMaterials } from './InsertMaterial';
import type { MaterialEntry } from '@turboslide/materials/catalog';
import {
  DITHER_PHOTOGRAPH_VALUE,
  DITHER_TOGGLE_VALUE,
  ditherPresetOf,
} from '@turboslide/schema/blocks/dither';
import type { PictureDither } from '@turboslide/schema/blocks/dither';
import { COLOR_LABELS, COLOR_TOKENS, isColorToken, isHexColor } from '@turboslide/schema/color';
import type { Color } from '@turboslide/schema/color';
import { isCanvasSlide, slideBlocks } from '@turboslide/schema/deck';
import { SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';
import { MATERIAL_ANCHORS } from '@turboslide/schema/blocks/material';

import { Dialog, DialogCheck, DialogField } from '../Dialog';
import { BACKGROUND_PICTURE_POS, insertBlockPlan, factsOf } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { swatchPaint } from '../inspector/palette';
import { cn } from '../lib/cn';
import { DIALOGS, DITHER } from '../menus/strings';
import { tipProps } from '../Tooltip';

import '../pickers/Pickers.css';
import '../inspector/dither.css';

/**
 * Slide > Change background (gslides-parity SPEC-2 0.16, 0.74, 2.6, 4.1, section 5 "Background";
 * SPEC-3 0.37, 0.38, 10.6): Google's dialog on every slide kind. Color picks the slide's fill
 * (Done writes `slide.setBackground`, previewed on the stage through the editor's handle while the
 * dialog is open); Image > Choose inserts a picture object at the bottom of the stack (Upload from
 * computer through the route's file picker, By URL and From this presentation through their
 * dialogs, or a picture of this presentation from the list here), converting the slide to the
 * canvas first; a covering picture already there shows as a fixed 96 by 54 thumbnail with its
 * alt, Remove and a Format options link that opens the panel at Dither; Reset to theme removes the
 * slide's colour; Add to theme writes the deck default (`deck.setBackground`).
 *
 * Round three adds two rows Google does not have. On the Image row a Dither toggle labelled Dither
 * with the help of SPEC-3 15: on writes the Photograph preset (bayer8, ink point 120, paper point
 * 230, midtones 0.9, the deck's recorded look) on the covering picture's `dither` field, or is
 * remembered for the picture the next Choose inserts through one `slide.setBackgroundPicture`
 * call on a canvas slide; beside it the Photograph and Neutral chips switch the three numbers, the
 * selected one read by equality (0.36, never stored). A Material row: Choose lists the catalog's
 * available entries, a Dither toggle beside it, and Place runs `slide.setBackgroundMaterial` at
 * the catalog's default anchor with the same preset rule; a covering material picture shows its
 * label and preset and a Material options link. Choose and Place are one write each; Done never
 * writes a picture. The reserved upload line carries "Uploading 6.2 MB" while the route's presigned
 * upload runs (8.5). The dither write is the field as `block.set /dither` in the page, what
 * `picture.dither` runs on the window transport (10.5).
 */
export function BackgroundDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const words = DIALOGS.background;
  const slide = input.document.slides[input.slideId];
  const current = slide?.background?.color;
  const themeDefault = input.document.deck.defaults?.background?.color;
  const [color, setColor] = useState<Color | undefined>(current);
  const [hex, setHex] = useState('');
  const [error, setError] = useState<string | null>(null);
  const previewed = useRef(false);
  /* the Dither toggle and preset remembered for the picture the next Choose inserts (10.6) */
  const [rememberedOn, setRememberedOn] = useState(false);
  const [rememberedPreset, setRememberedPreset] = useState<'photograph' | 'neutral'>('photograph');
  /* the Material row: the chosen entry and preset, its Dither toggle, the open list */
  const [material, setMaterial] = useState<{ entry: MaterialEntry; preset?: string } | null>(null);
  const [materialDither, setMaterialDither] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  /* the presigned upload's reserved line (SPEC-3 8.5, 9.3): the route reports the size it is sending */
  const uploading = (input as { uploadingBytes?: number }).uploadingBytes;

  /* the covering picture object of a canvas slide, if one is at the bottom of the stack */
  const picture =
    slide === undefined
      ? undefined
      : slideBlocks(slide)
          .map(({ block }) => block)
          .find(
            (block) =>
              block.type === 'picture' &&
              block.pos !== undefined &&
              block.pos.x <= 0 &&
              block.pos.y <= 0 &&
              block.pos.x + block.pos.w >= SHEET_WIDTH &&
              block.pos.y + block.pos.h >= SHEET_HEIGHT,
          );
  const pictureAsset =
    picture?.type === 'picture' ? input.document.deck.assets[picture.asset] : undefined;
  const pictureDither: PictureDither | undefined =
    picture?.type === 'picture' ? picture.dither : undefined;
  const coveringMaterial =
    pictureAsset?.source.kind === 'material' ? pictureAsset.source : undefined;
  const pictures = Object.values(input.document.deck.assets);
  const canvas = slide !== undefined && isCanvasSlide(slide);
  const ditherOn = picture !== undefined ? pictureDither !== undefined : rememberedOn;
  const preset =
    picture !== undefined
      ? pictureDither === undefined
        ? null
        : ditherPresetOf(pictureDither)
      : rememberedPreset;
  const rememberedDither = (): PictureDither =>
    rememberedPreset === 'photograph' ? DITHER_PHOTOGRAPH_VALUE : DITHER_TOGGLE_VALUE;

  /* the preview follows the picked colour and is dropped when the dialog closes without Done */
  useEffect(() => {
    if (color === current && !previewed.current) return;
    previewed.current = true;
    input.editor?.previewBackground?.(color === undefined ? null : { color });
  }, [color, current, input.editor]);
  useEffect(
    () => () => {
      if (previewed.current) input.editor?.previewBackground?.(null);
    },
    [input.editor],
  );

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err));

  const done = () => {
    if (slide === undefined) return;
    if (color === current) {
      shell.closeDialog();
      return;
    }
    input
      .dispatch('slide.setBackground', {
        slideIds: [slide.id],
        background: color === undefined ? null : { color },
        baseRevision: input.revision,
      })
      .then(() => shell.closeDialog())
      .catch(fail);
  };

  const addToTheme = () => {
    if (color === undefined) {
      setError('Pick a colour first');
      return;
    }
    input
      .dispatch('deck.setBackground', { background: { color }, baseRevision: input.revision })
      .then(() => shell.say('The colour is now the default of every slide'))
      .catch(fail);
  };

  const resetToTheme = () => setColor(undefined);

  /** The covering picture's dither field written in place (SPEC-3 10.5: `block.set /dither` in the page). */
  const writeDither = (value: PictureDither | null) => {
    if (slide === undefined || picture === undefined) return;
    input
      .dispatch('block.set', {
        slideId: slide.id,
        blockId: picture.id,
        path: '/dither',
        ...(value === null ? {} : { value }),
        baseRevision: input.revision,
      })
      .catch(fail);
  };

  const toggleDither = (on: boolean) => {
    if (picture !== undefined) {
      writeDither(
        on
          ? rememberedPreset === 'neutral'
            ? DITHER_TOGGLE_VALUE
            : DITHER_PHOTOGRAPH_VALUE
          : null,
      );
      return;
    }
    setRememberedOn(on);
  };

  const pickPreset = (next: 'photograph' | 'neutral') => {
    setRememberedPreset(next);
    if (picture !== undefined && pictureDither !== undefined) {
      writeDither(
        next === 'photograph'
          ? { ...pictureDither, ...DITHER_PHOTOGRAPH_VALUE, pattern: pictureDither.pattern }
          : { pattern: pictureDither.pattern },
      );
    }
  };

  /**
   * Choose from this presentation: the picture object at the bottom of the stack (2.6.4). With
   * the Dither toggle remembered on a canvas slide, one `slide.setBackgroundPicture` write carries
   * the picture and its dither (10.6); the editor's handle and the round two plan stand otherwise.
   */
  const choose = (asset: string) => {
    if (slide === undefined) return;
    if (rememberedOn && canvas) {
      input
        .dispatch('slide.setBackgroundPicture', {
          slideIds: [slide.id],
          assetId: asset,
          dither: rememberedDither(),
          baseRevision: input.revision,
        })
        .then(() => shell.closeDialog())
        .catch(fail);
      return;
    }
    if (input.editor?.insertBackgroundPicture) {
      input.editor.insertBackgroundPicture(asset);
      shell.closeDialog();
      return;
    }
    const plan = insertBlockPlan(
      factsOf(input),
      'picture',
      (id) => ({
        id,
        type: 'picture',
        asset,
        ...(rememberedOn ? { dither: rememberedDither() } : {}),
      }),
      words.choose,
      { at: BACKGROUND_PICTURE_POS },
    );
    if ('refused' in plan) {
      setError(plan.refused);
      return;
    }
    const blockId = (plan.input.block as { id: string }).id;
    input
      .dispatch(plan.action, plan.input)
      .then((result) => {
        const revision = (result as { revision?: number }).revision ?? input.revision + 1;
        return input.dispatch('block.order', {
          slideId: slide.id,
          blockId,
          move: 'back',
          baseRevision: revision,
        });
      })
      .then(() => shell.closeDialog())
      .catch(fail);
  };

  const removePicture = () => {
    if (slide === undefined || picture === undefined) return;
    input
      .dispatch('block.remove', {
        slideId: slide.id,
        blockId: picture.id,
        baseRevision: input.revision,
      })
      .catch(fail);
  };

  /** Place: `slide.setBackgroundMaterial` at the catalog's default anchor, one call (10.6, 10.8). */
  const place = () => {
    if (slide === undefined || material === null || placing) return;
    setPlacing(true);
    input
      .dispatch('slide.setBackgroundMaterial', {
        slideIds: [slide.id],
        materialId: material.entry.id,
        ...(material.preset !== undefined ? { preset: material.preset } : {}),
        anchor: MATERIAL_ANCHORS[1],
        ...(materialDither
          ? {
              dither:
                rememberedPreset === 'neutral' ? DITHER_TOGGLE_VALUE : DITHER_PHOTOGRAPH_VALUE,
            }
          : {}),
        baseRevision: input.revision,
      })
      .then(() => shell.closeDialog())
      .catch((err: unknown) => {
        setPlacing(false);
        fail(err);
      });
  };

  /**
   * Format options at the Dither section for this picture (10.6, 10.7): the panel draws the
   * section for the selected block, so the covering picture is selected first through the route's
   * `onSelectBlock` (the same path the Inspector's block rows take); without it the panel opened
   * on the slide's own sections and `dither.spec.ts` fell back to the viewer module for the budget.
   */
  const openFormatOptions = () => {
    if (picture !== undefined) input.onSelectBlock?.(picture.id);
    shell.openPanel('formatOptions', { section: 'dither' });
    shell.closeDialog();
  };

  const swatchTip = (label: string) => tipProps({ name: label });
  const hexTip = tipProps({
    name: 'Custom colour',
    doc: 'Six hex digits; Enter applies',
    key: 'Enter',
  });
  const thumbSrc =
    pictureAsset === undefined
      ? undefined
      : (input.assetUrl ?? ((path: string) => path))(
          'neutral' in pictureAsset.twins ? pictureAsset.twins.neutral : pictureAsset.twins.light,
        );

  return (
    <Dialog
      title={words.title}
      onClose={shell.closeDialog}
      width={440}
      control="dialog.background"
      actions={[
        {
          label: words.resetToTheme,
          onClick: resetToTheme,
          control: 'dialog.background.reset',
          doc: 'Removes this slide’s own colour; the theme default shows',
          disabled: color === undefined,
        },
        {
          label: words.addToTheme,
          onClick: addToTheme,
          control: 'dialog.background.addToTheme',
          doc: 'Makes the picked colour the default of every slide',
          disabled: color === undefined,
        },
        {
          label: words.done,
          primary: true,
          onClick: done,
          control: 'dialog.background.done',
          doc: 'Writes the colour to this slide',
        },
      ]}
    >
      <DialogField label={words.color} doc="A theme colour behind the slide, or none">
        <div className="ts-color-grid" role="radiogroup" aria-label={words.color}>
          <button
            type="button"
            role="radio"
            aria-checked={color === undefined}
            aria-label="None"
            className={cn('ts-color-swatch is-none', color === undefined && 'is-on')}
            data-control="dialog.background.color.none"
            onClick={() => setColor(undefined)}
            {...swatchTip(
              themeDefault === undefined
                ? 'None'
                : `None (the theme default, ${isColorToken(themeDefault) ? COLOR_LABELS[themeDefault] : themeDefault})`,
            )}
          />
          {COLOR_TOKENS.map((token) => (
            <button
              key={token}
              type="button"
              role="radio"
              aria-checked={color === token}
              aria-label={COLOR_LABELS[token]}
              className={cn('ts-color-swatch', color === token && 'is-on')}
              data-control={`dialog.background.color.${token}`}
              style={{ background: swatchPaint(token) }}
              onClick={() => setColor(token)}
              {...swatchTip(COLOR_LABELS[token])}
            />
          ))}
        </div>
        <label className="ts-color-hex">
          <span>Custom</span>
          <input
            type="text"
            value={hex}
            placeholder="#rrggbb"
            aria-label="Custom colour"
            data-control="dialog.background.color.hex"
            spellCheck={false}
            autoComplete="off"
            {...hexTip}
            onChange={(event) => setHex(event.target.value)}
            onKeyDown={(event) => {
              hexTip.onKeyDown(event);
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const value = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`;
              if (isHexColor(value)) setColor(value);
            }}
          />
        </label>
      </DialogField>
      <DialogField
        label={words.image}
        doc="A picture behind everything on the slide; drag it like any object"
      >
        {picture !== undefined ? (
          <div
            className="ts-dialog-row ts-dialog-bg-picture"
            data-control="dialog.background.picture"
          >
            <span className="ts-dialog-bg-thumb" aria-hidden="true">
              {thumbSrc !== undefined ? (
                <img
                  src={thumbSrc}
                  alt=""
                  width={96}
                  height={54}
                  loading="eager"
                  decoding="async"
                />
              ) : null}
            </span>
            <span className="ts-dialog-row-title">{pictureAsset?.alt ?? picture.id}</span>
            <button
              type="button"
              className="ts-dialog-btn is-text"
              data-control="dialog.background.formatOptions"
              onClick={openFormatOptions}
              {...tipProps({
                name: DITHER.formatOptions,
                doc: 'Opens Format options at the Dither section for this picture',
              })}
            >
              {DITHER.formatOptions}
            </button>
            <button
              type="button"
              className="ts-dialog-btn"
              data-control="dialog.background.removePicture"
              onClick={removePicture}
              {...tipProps({ name: 'Remove', doc: 'Deletes the picture behind the slide' })}
            >
              Remove
            </button>
          </div>
        ) : null}
        <div className="ts-dialog-modes">
          <button
            type="button"
            className="ts-dialog-btn"
            data-control="dialog.background.choose.upload"
            onClick={() => {
              if (slide === undefined) return;
              if (input.uploadPicture) {
                input.uploadPicture({ kind: 'background', slideId: slide.id });
                shell.closeDialog();
              } else setError('Open a slide in Editing mode to add a picture');
            }}
            {...tipProps({ name: 'Upload from computer', doc: 'Pictures up to 25 MB' })}
          >
            {words.choose}
          </button>
          <button
            type="button"
            className="ts-dialog-btn"
            data-control="dialog.background.choose.byUrl"
            onClick={() => {
              if (slide === undefined) return;
              shell.openDialog({
                id: 'imageByUrl',
                target: { kind: 'background', slideId: slide.id },
              });
            }}
            {...tipProps({ name: 'By URL', doc: 'A picture from a web address' })}
          >
            By URL
          </button>
        </div>
        <div className="ts-dialog-dither" data-control="dialog.background.ditherRow">
          <DialogCheck
            label={DITHER.dither}
            checked={ditherOn}
            control="dialog.background.dither"
            onChange={toggleDither}
            doc={DITHER.help}
          />
          <div className="ts-dialog-chips" role="radiogroup" aria-label={DITHER.preset}>
            <button
              type="button"
              role="radio"
              aria-checked={preset === 'photograph'}
              className={cn('ts-dialog-chip', preset === 'photograph' && 'is-on')}
              data-control="dialog.background.dither.photograph"
              disabled={!ditherOn}
              onClick={() => pickPreset('photograph')}
              {...tipProps({
                name: DITHER.photograph,
                doc: 'The deck’s recorded look for a photograph: ink point 120, paper point 230, midtones 0.9',
              })}
            >
              {DITHER.photograph}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={preset === 'neutral'}
              className={cn('ts-dialog-chip', preset === 'neutral' && 'is-on')}
              data-control="dialog.background.dither.neutral"
              disabled={!ditherOn}
              onClick={() => pickPreset('neutral')}
              {...tipProps({
                name: DITHER.neutral,
                doc: 'The screen’s own tone: ink point 0, paper point 255, midtones 1',
              })}
            >
              {DITHER.neutral}
            </button>
          </div>
        </div>
        <p
          className="ts-dialog-upload"
          data-control="dialog.background.uploading"
          aria-live="polite"
        >
          {uploading !== undefined && uploading > 0
            ? DITHER.uploading((uploading / (1024 * 1024)).toFixed(1))
            : ''}
        </p>
        {pictures.length > 0 ? (
          <div className="ts-dialog-list" role="list" aria-label="Pictures in this presentation">
            {pictures.map((asset) => (
              <button
                key={asset.id}
                type="button"
                role="listitem"
                className="ts-dialog-row"
                data-control={`dialog.background.choose.${asset.id}`}
                onClick={() => choose(asset.id)}
                {...tipProps({
                  name: asset.alt || asset.id,
                  doc: 'Places this picture behind the slide',
                })}
              >
                <span className="ts-dialog-row-title">{asset.alt || asset.id}</span>
              </button>
            ))}
          </div>
        ) : null}
      </DialogField>
      <DialogField
        label={DITHER.material}
        doc="A shader material as the picture behind the slide, frozen at a frame"
      >
        {coveringMaterial !== undefined ? (
          <div className="ts-dialog-row" data-control="dialog.background.material.current">
            <span className="ts-dialog-row-title">
              {coveringMaterial.materialId}
              {pictureAsset?.ext !== undefined &&
              typeof (pictureAsset.ext as { preset?: unknown }).preset === 'string'
                ? ` · ${(pictureAsset.ext as { preset: string }).preset}`
                : ''}
            </span>
            <button
              type="button"
              className="ts-dialog-btn is-text"
              data-control="dialog.background.materialOptions"
              onClick={() => {
                shell.openPanel('picturesMaterials');
                shell.closeDialog();
              }}
              {...tipProps({
                name: 'Material options',
                doc: 'Opens Pictures and materials at the Material section',
              })}
            >
              Material options
            </button>
          </div>
        ) : null}
        <div className="ts-dialog-modes ts-dialog-material-row">
          <button
            type="button"
            className="ts-dialog-btn"
            data-control="dialog.background.material.choose"
            aria-expanded={materialsOpen}
            onClick={() => setMaterialsOpen((open) => !open)}
            {...tipProps({ name: DITHER.choose, doc: 'The catalog’s materials and their presets' })}
          >
            {material === null
              ? DITHER.choose
              : `${material.entry.label}${material.preset !== undefined ? ` · ${material.preset}` : ''}`}
          </button>
          <DialogCheck
            label={DITHER.dither}
            checked={materialDither}
            control="dialog.background.material.dither"
            onChange={setMaterialDither}
            doc={DITHER.help}
          />
          <button
            type="button"
            className={cn('ts-dialog-btn', material !== null && !placing && 'is-solid')}
            data-control="dialog.background.material.place"
            disabled={material === null || placing}
            onClick={place}
            {...tipProps({
              name: DITHER.place,
              doc: 'Captures the material at its default frame and places it behind the slide',
            })}
          >
            {placing ? 'Placing' : DITHER.place}
          </button>
        </div>
        {materialsOpen ? (
          <div className="ts-dialog-list" role="listbox" aria-label={DITHER.material}>
            {insertableMaterials().flatMap((entry) =>
              (entry.presets.length > 0 ? entry.presets.map((p) => p.name) : [undefined]).map(
                (presetName) => (
                  <button
                    key={`${entry.id}:${presetName ?? ''}`}
                    type="button"
                    role="option"
                    aria-selected={
                      material?.entry.id === entry.id && material.preset === presetName
                    }
                    className={cn(
                      'ts-dialog-row is-button',
                      material?.entry.id === entry.id && material.preset === presetName && 'is-on',
                    )}
                    data-control={`dialog.background.material.${entry.id}${presetName !== undefined ? `.${presetName}` : ''}`}
                    onClick={() => {
                      setMaterial(
                        presetName === undefined ? { entry } : { entry, preset: presetName },
                      );
                      setMaterialsOpen(false);
                    }}
                    {...tipProps({
                      name: `${entry.label}${presetName !== undefined ? ` ${presetName}` : ''}`,
                      doc: entry.doc,
                    })}
                  >
                    <span className="ts-dialog-row-title">
                      {entry.label}
                      {presetName !== undefined ? ` · ${presetName}` : ''}
                    </span>
                  </button>
                ),
              ),
            )}
          </div>
        ) : null}
      </DialogField>
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
