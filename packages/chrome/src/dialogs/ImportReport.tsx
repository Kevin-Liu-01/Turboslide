import { useMemo } from 'react';

import type { ImportReport, ImportReportRow } from '@turboslide/schema/import-report';
import { importReportSchema } from '@turboslide/schema/import-report';

import { Dialog } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { ROUND_FIVE } from '../menus/strings';

import './import-dialogs.css';

/**
 * The import report card (gslides-parity SPEC-5 0.29, 5.4; MILESTONES-5 B3 day 5): what the
 * reader kept, showed differently and dropped, the source facts (file, producer, slides, page),
 * every source font with its run count, then the substituted and dropped rows by slide, and the
 * validation line. Opened by the Open snackbar's "Open" after a `.pptx` upload and by File >
 * Import report while the record is at hand. The record arrives as a prop, or from this
 * browser's session storage where the Open dialog left it for the editor of the new deck
 * (`IMPORT_REPORT_STORAGE_KEY`), so the card needs no server call and no store field.
 */
export const IMPORT_REPORT_STORAGE_KEY = 'turboslide:import-report';

/** Keeps a report for the editor the upload navigates to; a full or refusing storage is not an error. */
export function stashImportReport(deckId: string, report: ImportReport): void {
  try {
    sessionStorage.setItem(`${IMPORT_REPORT_STORAGE_KEY}:${deckId}`, JSON.stringify(report));
  } catch {
    // private mode or a full store: the snackbar alone
  }
}

/** The report left for a deck, or null. */
export function readStashedImportReport(deckId: string): ImportReport | null {
  try {
    const raw = sessionStorage.getItem(`${IMPORT_REPORT_STORAGE_KEY}:${deckId}`);
    if (raw === null) return null;
    const parsed = importReportSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ImportReportDialogProps = {
  /** the record; the stashed one for the current deck when absent */
  report?: ImportReport;
};

const STATUS_LABELS: Record<ImportReportRow['status'], string> = {
  kept: 'Imported',
  substituted: 'Shown differently',
  dropped: 'Dropped',
};

export function ImportReportDialog({ report: given }: ImportReportDialogProps) {
  const shell = useEditorShell();
  const report = useMemo(
    () => given ?? readStashedImportReport(shell.input.deckId),
    [given, shell.input.deckId],
  );
  const rows = useMemo(() => (report?.rows ?? []).filter((row) => row.status !== 'kept'), [report]);
  const notes = useMemo(
    () => (report?.rows ?? []).filter((row) => row.status === 'kept'),
    [report],
  );

  return (
    <Dialog
      title="Import report"
      onClose={shell.closeDialog}
      width={720}
      control="dialog.importReport"
      actions={[
        {
          label: 'Done',
          primary: true,
          onClick: shell.closeDialog,
          control: 'dialog.importReport.done',
          doc: 'Closes the report',
        },
      ]}
    >
      {report === null ? (
        <p className="ts-dialog-empty">
          No import report for this presentation in this browser session
        </p>
      ) : (
        <>
          <p className="ts-import-summary" data-control="dialog.importReport.summary">
            {ROUND_FIVE.importSummary(
              report.summary.imported,
              report.summary.substituted,
              report.summary.dropped,
            )}
          </p>
          {report.summary.substituted + report.summary.dropped > 0 ? (
            <p className="ts-import-notice">{ROUND_FIVE.importNotice}</p>
          ) : null}
          <dl className="ts-import-facts">
            <dt>File</dt>
            <dd>{report.source.file}</dd>
            {report.source.producer !== undefined ? (
              <>
                <dt>Written by</dt>
                <dd>{report.source.producer}</dd>
              </>
            ) : null}
            <dt>Slides</dt>
            <dd>
              {report.summary.slides} of {report.source.slides}
            </dd>
            <dt>Page</dt>
            <dd>
              {report.source.page.width} by {report.source.page.height} px
            </dd>
            <dt>Theme</dt>
            <dd>
              {report.theme.mode === 'adopt'
                ? 'Colours snapped to the theme'
                : 'Colours kept as written'}
            </dd>
            <dt>Validation</dt>
            <dd>
              {report.validation.ok
                ? 'The presentation validates'
                : `${report.validation.issues} issue(s)`}
            </dd>
          </dl>
          {report.fonts.length > 0 ? (
            <>
              <h3 className="ts-import-section">Fonts</h3>
              <table className="ts-import-table" data-control="dialog.importReport.fonts">
                <thead>
                  <tr>
                    <th scope="col">Font</th>
                    <th scope="col">Runs</th>
                    <th scope="col">Shown as</th>
                  </tr>
                </thead>
                <tbody>
                  {report.fonts.map((font) => (
                    <tr key={font.family}>
                      <td>{font.family}</td>
                      <td className="is-num">{font.runs}</td>
                      <td>{font.substituted ?? 'The same font'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
          {rows.length > 0 ? (
            <>
              <h3 className="ts-import-section">Objects shown differently or dropped</h3>
              <table className="ts-import-table" data-control="dialog.importReport.rows">
                <thead>
                  <tr>
                    <th scope="col">Slide</th>
                    <th scope="col">Object</th>
                    <th scope="col">Status</th>
                    <th scope="col">What happened</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.slideIndex}-${row.code}-${index}`}>
                      <td className="is-num">{row.slideIndex}</td>
                      <td>{row.object ?? ''}</td>
                      <td>
                        <span
                          className={`ts-import-status${row.status === 'dropped' ? ' is-dropped' : ''}`}
                        >
                          {STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td>{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
          {notes.length > 0 ? (
            <p className="ts-import-notice" data-control="dialog.importReport.notes">
              {notes.length} note{notes.length === 1 ? '' : 's'} on objects that came over as they
              were
            </p>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
