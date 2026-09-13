import { useEffect, useRef, useState } from 'react';

import { COLOR_LABELS, COLOR_TOKENS, isHexColor } from '@turboslide/schema/color';
import type { Color } from '@turboslide/schema/color';
import { slideBlocks } from '@turboslide/schema/deck';
import { SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';

import { Dialog, DialogField } from '../Dialog';
import { BACKGROUND_PICTURE_POS, insertBlockPlan, factsOf } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { swatchPaint } from '../inspector/palette';
import { cn } from '../lib/cn';
import { DIALOGS } from '../menus/strings';
import { tipProps } from '../Tooltip';

import '../pickers/Pickers.css';

/**
 * Slide > Change background (gslides-parity SPEC-2 0.16, 0.74, 2.6, 4.1, section 5 "Background"):
 * Google's dialog on every slide kind. Color picks the slide's fill (Done writes
 * `slide.setBackground`, previewed on the stage through the editor's handle while the dialog is
 * open); Image > Choose inserts a picture object at the bottom of the stack (Upload from computer
 * through the route's file picker, By URL and From this presentation through their dialogs, or a
 * picture of this presentation from the list here), converting the slide to the canvas first; a
 * covering picture already there shows as a swatch with Remove; Reset to theme removes the
 * slide's colour; Add to theme writes the deck default (`deck.setBackground`).
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
  const pictures = Object.values(input.document.deck.assets);

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

  /** Choose from this presentation: the picture object at the bottom of the stack (2.6.4). */
  const choose = (asset: string) => {
    if (slide === undefined) return;
    if (input.editor?.insertBackgroundPicture) {
      input.editor.insertBackgroundPicture(asset);
      shell.closeDialog();
      return;
    }
    const plan = insertBlockPlan(
      factsOf(input),
      'picture',
      (id) => ({ id, type: 'picture', asset }),
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

  const swatchTip = (label: string) => tipProps({ name: label });
  const hexTip = tipProps({
    name: 'Custom colour',
    doc: 'Six hex digits; Enter applies',
    key: 'Enter',
  });

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
                : `None (the theme default, ${COLOR_LABELS[themeDefault as never] ?? themeDefault})`,
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
          <div className="ts-dialog-row">
            <span className="ts-dialog-row-title">{pictureAsset?.alt ?? picture.id}</span>
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
                  name: asset.alt ?? asset.id,
                  doc: 'Places this picture behind the slide',
                })}
              >
                <span className="ts-dialog-row-title">{asset.alt ?? asset.id}</span>
              </button>
            ))}
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
