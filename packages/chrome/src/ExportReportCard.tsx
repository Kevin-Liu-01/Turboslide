import type { ExportReport } from '@turboslide/schema/export';

import type { ExportMenuInput } from './ExportMenu';

import './ExportReportCard.css';

/**
 * The summary card after an export or a build (SPEC 8.5: the report is the claim). For an
 * export.run it reads the ExportReport: format and mode, the pages (one entry per slide per
 * theme), the worst verified fraction, the raster blocks, the fonts embedded, then the files
 * with a Download button each and the residual lines; a Slides run shows its presentation link.
 * For a build.run it shows the file, its size against the budget and the assertions. The card
 * draws the ink frame the conflict card draws: the one dialog state (SPEC 2.2).
 */
export type ExportDownload = {
  /** the file's base name: gt-brand-light.pptx */
  name: string;
  bytes: number;
};

export type ArtifactRun =
  | {
      kind: 'export';
      input: ExportMenuInput;
      report: ExportReport;
      downloads: ExportDownload[];
      jobId: string;
      ms: number;
    }
  | {
      kind: 'build';
      path: string;
      bytes: number;
      assertions: { name: string; passed: boolean; detail: string }[];
      downloads: ExportDownload[];
      ms: number;
    };

export type ExportReportCardProps = {
  run: ArtifactRun;
  /** the worker runs elsewhere: files stay on it and the card says so */
  downloads: boolean;
  onDownload: (run: ArtifactRun, file: ExportDownload) => void;
  onClose: () => void;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(3)} percent`;
}

/** The facts the card lists for an export report, in order. */
export function reportRows(report: ExportReport): { key: string; value: string }[] {
  const verified = report.slides.filter((slide) => slide.verify !== undefined);
  const worst = verified.reduce((max, slide) => Math.max(max, slide.verify?.fraction ?? 0), 0);
  const raster = report.slides.reduce((sum, slide) => sum + slide.raster.length, 0);
  const themes = [...new Set(report.slides.map((slide) => slide.theme ?? report.theme))];
  return [
    { key: 'Mode', value: `${report.format} ${report.mode}, ${themes.join(' and ')}` },
    { key: 'Pages', value: `${report.slides.length} (one per slide per theme)` },
    {
      key: 'Worst fraction',
      value:
        verified.length === 0
          ? 'not verified'
          : `${percent(worst)} over ${verified.length} page${verified.length === 1 ? '' : 's'}`,
    },
    { key: 'Raster blocks', value: String(raster) },
    {
      key: 'Fonts embedded',
      value:
        report.fonts.embedded.length === 0
          ? 'none'
          : `${report.fonts.embedded.length} (${report.fontSet} set)`,
    },
    { key: 'Geometry', value: report.geometryInBounds ? 'in bounds' : 'out of bounds' },
    { key: 'Revision', value: `r${report.revision}` },
  ];
}

export function ExportReportCard({ run, downloads, onDownload, onClose }: ExportReportCardProps) {
  const title =
    run.kind === 'export'
      ? `Export: ${run.input.format === 'gslides' ? 'Google Slides' : 'PPTX'} ${run.report.mode}${run.input.dryRun ? ' (dry run)' : ''}`
      : 'Build: standalone HTML';
  const passed =
    run.kind === 'export' ? run.report.passed : run.assertions.every((entry) => entry.passed);
  const rows =
    run.kind === 'export'
      ? reportRows(run.report)
      : [
          { key: 'File', value: run.path },
          { key: 'Size', value: formatBytes(run.bytes) },
          ...run.assertions.map((entry) => ({
            key: entry.name.charAt(0).toUpperCase() + entry.name.slice(1),
            value: `${entry.passed ? 'passed' : 'failed'}: ${entry.detail}`,
          })),
        ];
  return (
    <div
      className="ts-report ts-chrome"
      role="dialog"
      aria-label={title}
      data-control="export.report"
      data-passed={passed ? 'true' : 'false'}
    >
      <div className="ts-report-head">
        <b>{title}</b>
        <span>{`${passed ? 'Passed' : 'Did not pass'} in ${(run.ms / 1000).toFixed(1)} s`}</span>
      </div>
      <dl className="ts-report-rows">
        {rows.map((row) => (
          <div key={row.key} className="ts-report-row">
            <dt>{row.key}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {run.kind === 'export' && run.report.url ? (
        <p className="ts-report-link">
          <a
            href={run.report.url}
            target="_blank"
            rel="noreferrer"
            data-control="export.report.open"
          >
            Open in Google Slides
          </a>
        </p>
      ) : null}
      {run.downloads.length > 0 ? (
        <ul className="ts-report-files">
          {run.downloads.map((file) => (
            <li key={file.name}>
              <span className="ts-report-file">{file.name}</span>
              <span className="ts-report-bytes">{formatBytes(file.bytes)}</span>
              {downloads ? (
                <button
                  type="button"
                  className="pt-ib is-text"
                  title={`Download ${file.name}`}
                  data-control={`export.download.${file.name}`}
                  onClick={() => onDownload(run, file)}
                >
                  <span className="pt-lb">Download</span>
                </button>
              ) : (
                <span className="ts-report-bytes">on the worker</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {run.kind === 'export' && run.report.residual.length > 0 ? (
        <ul className="ts-report-residual">
          {run.report.residual.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="ts-report-actions">
        <button
          type="button"
          className="pt-ib is-text"
          title="Close the report"
          data-control="export.report.close"
          onClick={onClose}
        >
          <span className="pt-lb">Close</span>
        </button>
      </div>
    </div>
  );
}
