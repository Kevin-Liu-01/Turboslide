import { useEffect, useMemo, useRef, useState } from 'react';

import type { ExportMode } from '@turboslide/schema/export';
import type { DeckDocument } from '@turboslide/schema/deck';
import { deckAppearance, slideBlocks, unskippedSlideOrder } from '@turboslide/schema/deck';

import { Dialog, DialogCheck } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { DIALOGS } from '../menus/strings';
import { useMountEffect } from '../lib/useMountEffect';
import { isParked } from '../parked-controls';
import { tipProps } from '../Tooltip';

/**
 * Download (gslides-parity SPEC 0.22, 6.7, 12 "Dialogs"; docs/PRODUCT.md section 2 ranks 8, 11
 * and 21): three ways in, one component.
 *
 * File > Download > PDF Document starts the download at once from the menu row, with no dialog:
 * the snackbar reads the progress ("Preparing your PDF, slide 3 of 6") and then the saved name
 * with a Details action, and this component draws nothing while it runs. File > Download >
 * Microsoft PowerPoint (.pptx) does the same in the Perfect mode when the deck holds no table and
 * no chart; when it holds either the row opens the dialog with Editable text preselected and one
 * sentence above the modes saying why (the Perfect mode writes a table and a chart as a picture,
 * audit-seller 11). The row Download options (`options`) opens the whole dialog: the Perfect and
 * Editable text pair with one sentence under each, Include speaker notes (off), Include skipped
 * slides (off), More options (Light, Dark or Both defaulting to the deck's appearance, fonts Exact
 * or Standard, Embed fonts, Headings as pictures), Download; the dialog closes itself when the
 * file is saved and the snackbar names the file. For a PDF the dialog carries no mode pair, no
 * More options and no Include speaker notes: the PDF builder (packages/export/src/pdf/build.ts)
 * prints one page per slide and never the notes, so the box is offered only where the file
 * carries them (docs/FOCUS.md rank 24, `export.pdf.notes-honest`). The notes and skipped slides
 * defaults are the deliberate departure of SPEC 0.23.
 *
 * The estimate (rank 8) is the measured seconds per slide of the last export on this browser,
 * never under 10 s of total, and its first value is the production measurement the round records;
 * the progress sentence itself comes from the export route's per slide events (B7's
 * `export-jobs.ts`) through `input.export.progress`.
 */
export type DownloadDialogProps = {
  format: 'pptx' | 'pdf';
  /** the Download options row: the whole dialog whatever the deck holds */
  options?: boolean;
};

/** The seconds per slide the estimate assumes before this browser has measured an export (rank 21). */
export const FIRST_SECONDS_PER_SLIDE: Readonly<Record<'pptx' | 'pdf', number>> = {
  pptx: 2.5,
  pdf: 1.2,
};

/** The estimate never reads under this many seconds (rank 8). */
export const ESTIMATE_FLOOR_S = 10;

const MEASURED_KEY = 'ts-export-seconds-per-slide';

/** The seconds per slide the last export on this browser took, by format; the first value before. */
export function measuredSecondsPerSlide(
  format: 'pptx' | 'pdf',
  storage: Pick<Storage, 'getItem'> | null = safeStorage(),
): number {
  try {
    const raw = storage?.getItem(MEASURED_KEY);
    if (raw !== null && raw !== undefined) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const value = parsed[format];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    }
  } catch {
    // an unreadable record: the first value stands
  }
  return FIRST_SECONDS_PER_SLIDE[format];
}

/** Records the seconds per slide of a finished export for the next estimate. */
export function recordSecondsPerSlide(
  format: 'pptx' | 'pdf',
  ms: number,
  slides: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage(),
): void {
  if (storage === null || slides <= 0 || !Number.isFinite(ms) || ms <= 0) return;
  try {
    const raw = storage.getItem(MEASURED_KEY);
    const parsed = raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);
    parsed[format] = Math.round((ms / 1000 / slides) * 100) / 100;
    storage.setItem(MEASURED_KEY, JSON.stringify(parsed));
  } catch {
    // private mode: the first value stands
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** "about 3 minutes for 85 slides": the measured seconds per slide, rounded up to the half minute, never under 10 s. */
export function estimateSentence(
  slides: number,
  format: 'pptx' | 'pdf',
  secondsPerSlide: number = measuredSecondsPerSlide(format),
): string {
  const seconds = Math.max(ESTIMATE_FLOOR_S, slides * secondsPerSlide);
  const time =
    seconds < 45
      ? `about ${Math.max(10, Math.ceil(seconds / 5) * 5)} seconds`
      : (() => {
          const halfMinutes = Math.max(1, Math.ceil(seconds / 30));
          const minutes = halfMinutes / 2;
          return minutes < 1
            ? 'about half a minute'
            : minutes === 1
              ? 'about a minute'
              : `about ${minutes} minutes`;
        })();
  return `${preparingHead(format)}, ${time} for ${slides} slide${slides === 1 ? '' : 's'}`;
}

function preparingHead(format: 'pptx' | 'pdf'): string {
  return `Preparing your ${format === 'pdf' ? 'PDF' : 'PowerPoint file'}`;
}

/** The progress sentence of the snackbar and the dialog: "Preparing your PDF, slide 3 of 6" (rank 8). */
export function progressSentence(
  format: 'pptx' | 'pdf',
  progress: { label?: string; line?: string } | null | undefined,
  slides: number,
): string {
  const line = progress?.line ?? progress?.label ?? '';
  const perSlide = /slide\s+\d+\s+of\s+\d+/i.exec(line);
  if (perSlide !== null) return `${preparingHead(format)}, ${perSlide[0].toLowerCase()}`;
  return estimateSentence(slides, format);
}

/** The characters a file name never carries (rank 7: `" \ / : * ? < > |` and the control characters). */
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME = /["\\\/:*?<>|\u0000-\u001f]/g;

/**
 * The saved file's name (rank 7): the deck's title with the unsafe characters removed and the
 * extension; the appearance joins the name only when both appearances are in one run, the mode
 * only for the second PowerPoint mode; an untitled deck keeps its id.
 */
export function downloadFileName(
  title: string,
  deckId: string,
  format: 'pptx' | 'pdf',
  options: { mode?: ExportMode; appearance?: 'dark' } = {},
): string {
  const cleaned = title.replace(UNSAFE_NAME, '').replace(/\s+/g, ' ').trim();
  const base = cleaned === '' || cleaned === 'Untitled presentation' ? deckId : cleaned;
  const tags: string[] = [];
  if (options.appearance === 'dark') tags.push('dark');
  if (format === 'pptx' && options.mode === 'native') tags.push('editable');
  const suffix = tags.length === 0 ? '' : ` (${tags.join(', ')})`;
  return `${base}${suffix}.${format}`;
}

/** The names a run saves: one file, or the light and the dark file when both appearances run. */
export function downloadFileNames(
  title: string,
  deckId: string,
  format: 'pptx' | 'pdf',
  options: { mode?: ExportMode; theme?: 'light' | 'dark' | 'both' } = {},
): string[] {
  const mode = format === 'pptx' ? options.mode : undefined;
  if (options.theme === 'both')
    return [
      downloadFileName(title, deckId, format, { ...(mode === undefined ? {} : { mode }) }),
      downloadFileName(title, deckId, format, {
        ...(mode === undefined ? {} : { mode }),
        appearance: 'dark',
      }),
    ];
  return [downloadFileName(title, deckId, format, { ...(mode === undefined ? {} : { mode }) })];
}

/** One row of the report an export in flight carries (docs/FEATURES.md 5.5; build/b1.md R6). */
export type ExportReportRow = { id: string; text: string };

/**
 * The report rows of the route's progress (`progress.rows`, optional until B7's route fills it):
 * each with an id in the shape of a control's last segment and one sentence a seller reads.
 */
export function exportReportRows(progress: unknown): ExportReportRow[] {
  if (progress === null || typeof progress !== 'object') return [];
  const rows = (progress as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is ExportReportRow =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as ExportReportRow).id === 'string' &&
      /^[a-z][a-z0-9-]*$/i.test((row as ExportReportRow).id) &&
      typeof (row as ExportReportRow).text === 'string' &&
      (row as ExportReportRow).text.trim() !== '',
  );
}

/** True when a deck holds a table or a chart on any slide (rank 8: the Perfect mode draws both as pictures). */
export function deckHasTableOrChart(document: DeckDocument): boolean {
  return Object.values(document.slides).some((slide) =>
    slideBlocks(slide).some(({ block }) => block.type === 'table' || block.type === 'chart'),
  );
}

/** The sentence above the modes when the deck holds a table or a chart (rank 8). */
export const TABLE_SENTENCE =
  'This presentation has a table or a chart. Editable text keeps them editable in PowerPoint';

/** The Perfect mode's sentence (rank 11): it names what the mode does with tables and charts. */
export const PERFECT_SENTENCE =
  'Every slide as a picture with a text layer you can search. Tables and charts are pictures in this mode';

/** The Editable text mode's sentence. */
export const EDITABLE_SENTENCE =
  'Text boxes you can edit in PowerPoint; layout within a few pixels';

/** The file types the Download options dialog offers (rank 8): the two rows above it, as one choice. */
export const DOWNLOAD_TYPES: ReadonlyArray<{ format: 'pptx' | 'pdf'; label: string; doc: string }> =
  [
    {
      format: 'pptx',
      label: 'Microsoft PowerPoint (.pptx)',
      doc: 'Perfect or Editable text, with speaker notes if you want them',
    },
    { format: 'pdf', label: 'PDF Document (.pdf)', doc: 'One slide per page' },
  ];

export function DownloadDialog({ format: rowFormat, options = false }: DownloadDialogProps) {
  const shell = useEditorShell();
  const { input, settings } = shell;
  const hasTableOrChart = deckHasTableOrChart(input.document);
  /* the one click path (rank 8): no dialog for a PDF, nor for a PowerPoint file of a deck without
     a table or a chart, unless the Download options row asked for the dialog */
  const direct = !options && (rowFormat === 'pdf' || !hasTableOrChart);
  /* Download options carries the file type as its first choice (the two direct rows start their
     download at once, so a PDF with the skipped slides in it needs a way to the checkbox); the
     two rows fix it */
  const [format, setFormat] = useState<'pptx' | 'pdf'>(rowFormat);
  const [mode, setMode] = useState<ExportMode>(hasTableOrChart ? 'native' : 'flatten');
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
  const started = useRef<number | null>(null);
  const slides = skipped
    ? Object.keys(input.document.slides).length
    : unskippedSlideOrder(input.document).length;
  const title = input.document.deck.title;

  const savedName = (chosen: { mode: ExportMode; theme: 'light' | 'dark' | 'both' }) =>
    downloadFileNames(title, input.deckId, format, {
      ...(format === 'pptx' ? { mode: chosen.mode } : {}),
      theme: chosen.theme,
    }).join(' and ');

  /** Tells the seller the file is saved: the name, with Details when the report exists (rank 8). */
  const announceSaved = (name: string) => {
    const show = input.export?.onShowReport;
    shell.say(
      `Saved ${name}`,
      show === undefined ? undefined : { label: DIALOGS.download.details, run: show },
    );
  };

  const run = (chosen: {
    mode: ExportMode;
    theme: 'light' | 'dark' | 'both';
    notes: boolean;
    skipped: boolean;
    fonts: 'exact' | 'standard';
    embed: boolean;
    raster: boolean;
  }) => {
    setState('running');
    setError(null);
    started.current = Date.now();
    const themes = chosen.theme === 'both' ? ['light', 'dark'] : [chosen.theme];
    input
      .dispatch('export.run', {
        format,
        ...(format === 'pptx' ? { mode: chosen.mode, fonts: chosen.fonts } : {}),
        theme: themes,
        ...(format === 'pptx' && chosen.mode === 'native' && chosen.embed
          ? { embedFonts: true }
          : {}),
        ...(format === 'pptx' && chosen.raster ? { headings: 'raster' } : {}),
        ...(chosen.skipped ? { includeSkipped: true } : {}),
        ...(format === 'pptx' && chosen.notes ? { includeNotes: true } : {}),
        /* the vector round (docs/VECTOR.md 4.6, 6.2): an svg picture exports as vector by the
           header's default; the parked control alone selects the PNG blip, and no key is sent
           otherwise so the header's default applies */
        ...(isParked('export.svg.vector', settings) ? { svgVector: false } : {}),
        verify: false,
      })
      .then(() => {
        if (started.current !== null)
          recordSecondsPerSlide(format, Date.now() - started.current, slides);
        setState('done');
        announceSaved(savedName(chosen));
        /* the dialog closes itself when the file is saved (rank 8); the direct path drew none */
        shell.closeDialog();
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState('failed');
        setError(message);
        if (direct) {
          shell.say(`The download did not finish: ${message}`);
          shell.closeDialog();
        }
      });
  };

  /* the direct path starts at once and speaks through the snackbar alone */
  useMountEffect(() => {
    if (!direct) return;
    shell.say(estimateSentence(slides, format));
    run({
      mode: 'flatten',
      theme: deckAppearance(input.document.deck),
      notes,
      skipped,
      fonts,
      embed,
      raster,
    });
  });

  /* the progress reaches the snackbar while the direct download runs (rank 8, "slide 3 of 6"):
     one sentence per change of the progress text, never the same sentence twice */
  const progress = input.export?.progress;
  const progressSentenceNow =
    direct && state === 'running' && progress !== null && progress !== undefined
      ? progressSentence(format, progress, slides)
      : null;
  const sayRef = useRef(shell.say);
  sayRef.current = shell.say;
  const lastSaid = useRef<string | null>(null);
  useEffect(() => {
    if (progressSentenceNow === null || progressSentenceNow === lastSaid.current) return;
    lastSaid.current = progressSentenceNow;
    sayRef.current(progressSentenceNow);
  }, [progressSentenceNow]);

  /* the report rows of an export in flight (the features round, ship two, docs/FEATURES.md 5.5;
     build/b1.md R6): the route's `progress.rows` name what the export waited for ("2 shaders had
     no frame; the export waited 8 s for them"); the dialog draws each under the progress sentence
     and the direct path says each new row once */
  const reportRows = useMemo(() => exportReportRows(progress), [progress]);
  const saidRows = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!direct || state !== 'running') return;
    for (const row of reportRows) {
      const key = `${row.id}:${row.text}`;
      if (saidRows.current.has(key)) continue;
      saidRows.current.add(key);
      sayRef.current(row.text);
    }
  }, [direct, reportRows, state]);

  if (direct) return null;

  const running = state === 'running';
  return (
    <Dialog
      title={options ? 'Download options' : DIALOGS.download.title}
      onClose={shell.closeDialog}
      width={520}
      /* the control names the file type in the dialog (the drivers of every PDF and PowerPoint row
         read `dialog.download.pdf` and `dialog.download.pptx`), the row `file.download.options` the way in */
      control={`dialog.download.${format}`}
      cancel
      actions={[
        {
          label: DIALOGS.download.ok,
          primary: true,
          disabled: running,
          onClick: () => run({ mode, theme, notes, skipped, fonts, embed, raster }),
          control: 'dialog.download.ok',
          doc:
            format === 'pdf'
              ? 'One slide per page'
              : mode === 'flatten'
                ? 'Every slide looks exactly like the screen'
                : 'Text boxes you can edit in PowerPoint',
        },
      ]}
    >
      {options ? (
        <div
          className="ts-dialog-modes ts-dialog-types"
          role="radiogroup"
          aria-label="File type"
          data-control="dialog.download.type"
        >
          {DOWNLOAD_TYPES.map((type) => (
            <button
              key={type.format}
              type="button"
              role="radio"
              aria-checked={format === type.format}
              className={cn('ts-dialog-mode', format === type.format && 'is-on')}
              data-control={`dialog.download.type.${type.format}`}
              disabled={running}
              onClick={() => setFormat(type.format)}
              {...tipProps({ name: type.label, doc: type.doc })}
            >
              <b>{type.label}</b>
              {type.doc}
            </button>
          ))}
        </div>
      ) : null}
      {format === 'pptx' && hasTableOrChart ? (
        <p className="ts-dialog-sentence" data-control="dialog.download.tableSentence">
          {TABLE_SENTENCE}
        </p>
      ) : null}
      {format === 'pptx' ? (
        <div className="ts-dialog-modes" role="radiogroup" aria-label="File type">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'flatten'}
            className={cn('ts-dialog-mode', mode === 'flatten' && 'is-on')}
            data-control="dialog.download.mode.flatten"
            onClick={() => setMode('flatten')}
            {...tipProps({ name: DIALOGS.download.perfect, doc: PERFECT_SENTENCE })}
          >
            <b>{DIALOGS.download.perfect}</b>
            {PERFECT_SENTENCE}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'native'}
            className={cn('ts-dialog-mode', mode === 'native' && 'is-on')}
            data-control="dialog.download.mode.native"
            onClick={() => setMode('native')}
            {...tipProps({ name: DIALOGS.download.editable, doc: EDITABLE_SENTENCE })}
          >
            <b>{DIALOGS.download.editable}</b>
            {EDITABLE_SENTENCE}
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
          {progressSentence(format, progress, slides)}
        </p>
      ) : null}
      {running || state === 'failed'
        ? reportRows.map((row) => (
            <p
              key={row.id}
              className="ts-dialog-sentence"
              role="status"
              data-control={`dialog.download.report.${row.id}`}
            >
              {row.text}
            </p>
          ))
        : null}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
