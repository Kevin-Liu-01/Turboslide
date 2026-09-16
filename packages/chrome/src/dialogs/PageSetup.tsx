import { useMemo, useState } from 'react';

import { canvasObjects, slideOrder } from '@turboslide/schema/deck';
import type { PagePreset, PageUnit } from '@turboslide/schema/render';
import {
  PAGE_MAX_PX,
  PAGE_MIN_PX,
  PAGE_PRESETS,
  PAGE_PRESET_LABELS,
  PAGE_PRESET_SIZES,
  PAGE_UNIT_LABELS,
  PAGE_UNITS,
  deckPage,
  formatPageLength,
  fromSheetPx,
  pageFromInput,
  pageSentence,
  presetOfPage,
} from '@turboslide/schema/render';

import { Dialog, DialogField, DialogRadio } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { preferencesOf } from '../text-tools';
import { tipProps } from '../Tooltip';

import './text-tools-dialogs.css';

/**
 * File > Page setup (gslides-parity SPEC-5 6.1; R08 3h; P1 5.9): Google's dropdown with the four
 * labels ("Standard (4:3)", "Widescreen (16:9)", "Widescreen (16:10)", "Custom"), under Custom the
 * Width and Height fields with the unit dropdown ("Inches", "Centimeters", "Points", "Pixels"),
 * the readout sentence ("1200 by 900 sheet px, 10 by 7.5 in"), the second step of R08 3d only when
 * the page shrinks and a canvas object would cross an edge ("Keep object positions" selected,
 * "Scale objects to fit"), Cancel and OK (Google's help text). OK is one `deck.setPageSize` write:
 * the page, the scaled objects and the guides in one commit, undone together. The controls are
 * `pageSetup.size`, `.width`, `.height`, `.unit`, `.objects`, `.ok` for the control API.
 */
export const PAGE_SETUP_STRINGS = {
  title: 'Page setup',
  size: 'Size',
  width: 'Width',
  height: 'Height',
  unit: 'Unit',
  objects: 'Objects on the slides',
  keep: 'Keep object positions',
  fit: 'Scale objects to fit',
  ok: 'OK',
  applied: (page: string) => `Page set to ${page}`,
} as const;

/** The preset the dropdown shows for a page: its own row, Custom for any other size. */
export function presetRowOf(page: {
  width: number;
  height: number;
  preset?: PagePreset;
}): PagePreset {
  return page.preset ?? presetOfPage(page);
}

/**
 * True when a canvas object of any slide would cross the new page's right or bottom edge (R08
 * 3d): the second step is offered then and not otherwise.
 */
export function objectsWouldCross(
  slides: Record<string, { kind: string; layout?: { type: string }; slots?: unknown } & object>,
  order: readonly string[],
  next: { width: number; height: number },
): boolean {
  for (const id of order) {
    const slide = slides[id];
    if (slide === undefined) continue;
    for (const block of canvasObjects(slide as never)) {
      const pos = block.pos;
      if (pos === undefined) continue;
      if (pos.x + pos.w > next.width + 0.5 || pos.y + pos.h > next.height + 0.5) return true;
    }
  }
  return false;
}

export function PageSetupDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const deck = input.document.deck;
  const current = deckPage(deck);
  const prefUnit = preferencesOf(input).units;
  const [preset, setPreset] = useState<PagePreset>(presetRowOf(current));
  const [unit, setUnit] = useState<PageUnit>(
    (PAGE_UNITS as readonly string[]).includes(prefUnit) ? (prefUnit as PageUnit) : 'in',
  );
  const [width, setWidth] = useState(formatPageLength(current.width, unit));
  const [height, setHeight] = useState(formatPageLength(current.height, unit));
  const [objects, setObjects] = useState<'keep' | 'fit'>('keep');
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const next = useMemo(() => {
    try {
      return preset === 'custom'
        ? pageFromInput({
            width: Number(width.replace(',', '.')),
            height: Number(height.replace(',', '.')),
            unit,
          })
        : pageFromInput({ preset });
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [preset, width, height, unit]);
  const nextPage = typeof next === 'string' ? null : next;
  const shrinks =
    nextPage !== null && (nextPage.width < current.width || nextPage.height < current.height);
  const offersSecondStep =
    shrinks &&
    nextPage !== null &&
    objectsWouldCross(input.document.slides as never, slideOrder(deck), nextPage);
  const same =
    nextPage !== null && nextPage.width === current.width && nextPage.height === current.height;

  const choosePreset = (value: PagePreset) => {
    setPreset(value);
    if (value !== 'custom') {
      const size = PAGE_PRESET_SIZES[value];
      setWidth(formatPageLength(size.width, unit));
      setHeight(formatPageLength(size.height, unit));
    }
  };
  const chooseUnit = (value: PageUnit) => {
    // the fields keep their length in the new unit
    const w = nextPage?.width ?? current.width;
    const h = nextPage?.height ?? current.height;
    setUnit(value);
    setWidth(formatPageLength(w, value));
    setHeight(formatPageLength(h, value));
  };

  const run = () => {
    if (nextPage === null) return;
    setState('running');
    setError(null);
    input
      .dispatch('deck.setPageSize', {
        ...(preset === 'custom'
          ? {
              width: Number(width.replace(',', '.')),
              height: Number(height.replace(',', '.')),
              unit,
            }
          : { preset }),
        objects: offersSecondStep ? objects : 'keep',
        baseRevision: input.revision,
      })
      .then(() => {
        setState('done');
        shell.closeDialog();
      })
      .catch((err: unknown) => {
        setState('idle');
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <Dialog
      title={PAGE_SETUP_STRINGS.title}
      onClose={shell.closeDialog}
      width={440}
      control="dialog.pageSetup"
      cancel
      actions={[
        {
          label: PAGE_SETUP_STRINGS.ok,
          primary: true,
          disabled: nextPage === null || state === 'running',
          onClick: run,
          control: 'pageSetup.ok',
          doc: same
            ? 'The page stays as it is'
            : 'Writes the page; every slide, export and print follows it',
        },
      ]}
    >
      <DialogField label={PAGE_SETUP_STRINGS.size} doc="Google's three sizes, or a custom page">
        <select
          value={preset}
          data-control="pageSetup.size"
          aria-label={PAGE_SETUP_STRINGS.size}
          onChange={(event) => choosePreset(event.target.value as PagePreset)}
          {...tipProps({
            name: PAGE_SETUP_STRINGS.size,
            doc: 'Standard (4:3), Widescreen (16:9), Widescreen (16:10) or Custom',
          })}
        >
          {PAGE_PRESETS.map((row) => (
            <option key={row} value={row}>
              {PAGE_PRESET_LABELS[row]}
            </option>
          ))}
        </select>
      </DialogField>
      {preset === 'custom' ? (
        <div className="ts-dialog-row" data-control="pageSetup.custom">
          <DialogField
            label={PAGE_SETUP_STRINGS.width}
            doc={`${PAGE_MIN_PX / 120} to ${PAGE_MAX_PX / 120} inches`}
          >
            <input
              type="text"
              inputMode="decimal"
              value={width}
              data-control="pageSetup.width"
              aria-label={PAGE_SETUP_STRINGS.width}
              onChange={(event) => setWidth(event.target.value)}
            />
          </DialogField>
          <DialogField
            label={PAGE_SETUP_STRINGS.height}
            doc={`${PAGE_MIN_PX / 120} to ${PAGE_MAX_PX / 120} inches`}
          >
            <input
              type="text"
              inputMode="decimal"
              value={height}
              data-control="pageSetup.height"
              aria-label={PAGE_SETUP_STRINGS.height}
              onChange={(event) => setHeight(event.target.value)}
            />
          </DialogField>
          <DialogField
            label={PAGE_SETUP_STRINGS.unit}
            doc="Inches, centimeters, points or sheet pixels at 120 per inch"
          >
            <select
              value={unit}
              data-control="pageSetup.unit"
              aria-label={PAGE_SETUP_STRINGS.unit}
              onChange={(event) => chooseUnit(event.target.value as PageUnit)}
            >
              {PAGE_UNITS.map((row) => (
                <option key={row} value={row}>
                  {PAGE_UNIT_LABELS[row]}
                </option>
              ))}
            </select>
          </DialogField>
        </div>
      ) : null}
      <p className="ts-dialog-hint" data-control="pageSetup.readout" role="status">
        {nextPage !== null
          ? pageSentence(nextPage) +
            (unit !== 'in' && unit !== 'px'
              ? `, ${fromSheetPx(nextPage.width, unit)} by ${fromSheetPx(nextPage.height, unit)} ${unit}`
              : '')
          : typeof next === 'string'
            ? next
            : ''}
      </p>
      {offersSecondStep ? (
        <DialogField
          label={PAGE_SETUP_STRINGS.objects}
          doc="The page shrinks and an object would cross its edge: keep every position, or scale the canvas objects to fit about the centre"
        >
          <DialogRadio
            name="pageSetup.objects"
            control="pageSetup.objects"
            value={objects}
            onChange={setObjects}
            options={[
              {
                value: 'keep',
                label: PAGE_SETUP_STRINGS.keep,
                doc: "Google's rule: every coordinate stays; guides beyond the page go",
              },
              {
                value: 'fit',
                label: PAGE_SETUP_STRINGS.fit,
                doc: "PowerPoint's Ensure Fit: the canvas objects scale down about the centre, typography and tables included",
              },
            ]}
          />
        </DialogField>
      ) : null}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
