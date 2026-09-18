import { useState } from 'react';

import type { ExportMode } from '@turboslide/schema/export';
import { deckAppearance, unskippedSlideOrder } from '@turboslide/schema/deck';

import { Dialog, DialogCheck } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { DIALOGS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * Download (gslides-parity SPEC 0.22, 6.7, 12 "Dialogs"): for a PowerPoint file a Seg Perfect |
 * Editable text with one sentence under each, Include speaker notes (off), Include skipped
 * slides (off), More options (Light, Dark or Both defaulting to the deck's appearance, fonts
 * Exact or Standard, Embed fonts, Headings as pictures), Download; then the progress sentence with
 * the time estimate (2.5 s per slide rounded up to the half minute) and "Your file is ready" with
 * a Details link to the report card. For a PDF the same dialog without the Seg and More options,
 * and without Include speaker notes: the PDF builder (packages/export/src/pdf/build.ts) prints one
 * page per slide and never the notes, so the box is offered only where the file carries them
 * (docs/FOCUS.md rank 24, `export.pdf.notes-honest`; audit-export row 15 saw a checked box change
 * nothing). The notes and skipped slides defaults are the deliberate departure of SPEC 0.23.
 */
export type DownloadDialogProps = { format: 'pptx' | 'pdf' };

/** "about 3 minutes for 85 slides": 2.5 s per slide, rounded up to the half minute (SPEC 6.7). */
export function estimateSentence(slides: number, format: 'pptx' | 'pdf'): string {
  const seconds = slides * (format === 'pdf' ? 0.6 : 2.5);
  const halfMinutes = Math.max(1, Math.ceil(seconds / 30));
  const minutes = halfMinutes / 2;
  const time =
    minutes < 1
      ? 'about half a minute'
      : minutes === 1
        ? 'about a minute'
        : `about ${minutes} minutes`;
  return `Preparing your ${format === 'pdf' ? 'PDF' : 'PowerPoint file'}, ${time} for ${slides} slide${slides === 1 ? '' : 's'}`;
}

export function DownloadDialog({ format }: DownloadDialogProps) {
  const shell = useEditorShell();
  const { input } = shell;
  const [mode, setMode] = useState<ExportMode>('flatten');
  const [notes, setNotes] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'both'>(
    deckAppearance(input.document.deck),
  );
  const [fonts, setFonts] = useState<'exact' | 'standard'>('exact');
  const [embed, setEmbed] = useState(false);
  const [raster, setRaster] = useState(false);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const slides = skipped
    ? Object.keys(input.document.slides).length
    : unskippedSlideOrder(input.document).length;

  const run = () => {
    setState('running');
    setError(null);
    const themes = theme === 'both' ? ['light', 'dark'] : [theme];
    input
      .dispatch('export.run', {
        format,
        ...(format === 'pptx' ? { mode, theme: themes, fonts } : { theme: themes }),
        ...(format === 'pptx' && mode === 'native' && embed ? { embedFonts: true } : {}),
        ...(format === 'pptx' && raster ? { headings: 'raster' } : {}),
        ...(skipped ? { includeSkipped: true } : {}),
        ...(format === 'pptx' && notes ? { includeNotes: true } : {}),
        verify: false,
      })
      .then(() => setState('done'))
      .catch((err: unknown) => {
        setState('failed');
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  const progressLine = input.export?.progress?.line;
  const running = state === 'running';
  return (
    <Dialog
      title={DIALOGS.download.title}
      onClose={shell.closeDialog}
      width={520}
      control={`dialog.download.${format}`}
      cancel
      actions={
        state === 'done'
          ? [
              {
                label: 'Done',
                primary: true,
                onClick: shell.closeDialog,
                control: 'dialog.download.done',
                doc: 'Closes the dialog',
              },
            ]
          : [
              {
                label: DIALOGS.download.ok,
                primary: true,
                disabled: running,
                onClick: run,
                control: 'dialog.download.ok',
                doc:
                  format === 'pdf'
                    ? 'One slide per page'
                    : mode === 'flatten'
                      ? 'Every slide looks exactly like the screen'
                      : 'Text boxes you can edit in PowerPoint',
              },
            ]
      }
    >
      {format === 'pptx' ? (
        <div className="ts-dialog-modes" role="radiogroup" aria-label="File type">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'flatten'}
            className={cn('ts-dialog-mode', mode === 'flatten' && 'is-on')}
            data-control="dialog.download.mode.flatten"
            onClick={() => setMode('flatten')}
            {...tipProps({
              name: DIALOGS.download.perfect,
              doc: 'Every slide looks exactly like the screen; the text is there but not editable',
            })}
          >
            <b>{DIALOGS.download.perfect}</b>
            Every slide looks exactly like the screen; the text is there but not editable
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'native'}
            className={cn('ts-dialog-mode', mode === 'native' && 'is-on')}
            data-control="dialog.download.mode.native"
            onClick={() => setMode('native')}
            {...tipProps({
              name: DIALOGS.download.editable,
              doc: 'Text boxes you can edit in PowerPoint; layout within a few pixels',
            })}
          >
            <b>{DIALOGS.download.editable}</b>
            Text boxes you can edit in PowerPoint; layout within a few pixels
          </button>
        </div>
      ) : (
        <p>
          One slide per page, 13.333 by 7.5 inches. The speaker notes are not in the PDF; File &gt;
          Print preview prints them under each slide.
        </p>
      )}
      {format === 'pptx' ? (
        <DialogCheck
          label={DIALOGS.download.includeNotes}
          checked={notes}
          onChange={setNotes}
          control="dialog.download.includeNotes"
          doc="The speaker notes travel with the file"
        />
      ) : null}
      <DialogCheck
        label={DIALOGS.download.includeSkipped}
        checked={skipped}
        onChange={setSkipped}
        control="dialog.download.includeSkipped"
        doc="Skipped slides are left out unless checked"
      />
      {format === 'pptx' ? (
        <details data-control="dialog.download.more">
          <summary
            {...tipProps({ name: DIALOGS.download.more, doc: 'Appearance, fonts and headings' })}
          >
            <Icon name="chevron-down" />
            {DIALOGS.download.more}
          </summary>
          <div>
            <label className="ts-dialog-field">
              <span className="ts-dialog-field-label">Appearance</span>
              <select
                value={theme}
                aria-label="Appearance"
                data-control="dialog.download.theme"
                onChange={(event) => setTheme(event.target.value as 'light' | 'dark' | 'both')}
                {...tipProps({ name: 'Appearance', doc: 'Light, Dark, or one file of each' })}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="both">Both</option>
              </select>
            </label>
            <label className="ts-dialog-field">
              <span className="ts-dialog-field-label">Fonts</span>
              <select
                value={fonts}
                aria-label="Fonts"
                data-control="dialog.download.fonts"
                onChange={(event) => setFonts(event.target.value as 'exact' | 'standard')}
                {...tipProps({
                  name: 'Fonts',
                  doc: 'Exact keeps one face per size; Standard uses three names',
                })}
              >
                <option value="exact">Exact</option>
                <option value="standard">Standard</option>
              </select>
            </label>
            <DialogCheck
              label="Embed fonts"
              checked={embed}
              onChange={setEmbed}
              disabled={mode !== 'native'}
              control="dialog.download.embedFonts"
              doc="Editable text only: the faces travel inside the file"
            />
            <DialogCheck
              label="Headings as pictures"
              checked={raster}
              onChange={setRaster}
              control="dialog.download.headings"
              doc="Every heading as a picture instead of a text box"
            />
          </div>
        </details>
      ) : null}
      {running ? (
        <p className="ts-dialog-progress" role="status" data-control="dialog.download.progress">
          {estimateSentence(slides, format)}
          {progressLine !== undefined ? ` · ${progressLine}` : ''}
        </p>
      ) : null}
      {state === 'done' ? (
        <p className="ts-dialog-progress" role="status" data-control="dialog.download.ready">
          Your file is ready.{' '}
          {input.export?.run ? (
            <button
              type="button"
              className="ts-dialog-link"
              data-control="dialog.download.details"
              onClick={() => {
                shell.closeDialog();
                input.export?.onShowReport?.();
              }}
              {...tipProps({ name: DIALOGS.download.details, doc: 'The report of this download' })}
            >
              {DIALOGS.download.details}
            </button>
          ) : null}
        </p>
      ) : null}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
