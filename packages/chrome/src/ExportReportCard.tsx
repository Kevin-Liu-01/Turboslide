import type { ExportReport } from '@turboslide/schema/export';

import type { ExportMenuInput } from './ExportMenu';

import './ExportReportCard.css';

/**
 * The summary card after an export or a build (SPEC 8.5: the report is the claim; the polish
 * round, docs/POLISH.md item 80: a seller's card first). The head names the file kind the run
 * made (PDF, PowerPoint file, web page), the files follow with their name, their size and a
 * Download button each, and one sentence says what the file holds and how long it took. The gate's
 * rows (the mode, the pages, Perfect, the page rasters, the worst fraction, the raster blocks, the
 * fonts, the geometry, the revision) and the residual lines sit behind Advanced tools, for the
 * person who reads reports; a seller never meets "SwiftShader" or "Perfect: no". The card draws
 * the ink frame the conflict card draws: the one dialog state (SPEC 2.2).
 */
export type ExportDownload = {
  /** the file's base name: gt-brand-light.pptx */
  name: string;
  bytes: number;
  /** where the file can be fetched again (a hosted studio's sync export); absent for a job file */
  url?: string;
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

/** The mode's name in the menu: Perfect for flatten, Editable text for native (SPEC 8.2). */
export function modeLabel(mode: ExportReport['mode']): string {
  return mode === 'flatten' ? 'Perfect' : 'Editable text';
}

/** `N png-palette, M jpeg` over the pages that carry a raster, in a fixed format order. */
export function pageFormats(report: ExportReport): string {
  const order = ['png-1bit', 'png-palette', 'jpeg', 'png-rgba'];
  const counts = new Map<string, number>();
  for (const slide of report.slides)
    if (slide.page) counts.set(slide.page.format, (counts.get(slide.page.format) ?? 0) + 1);
  return order
    .filter((format) => counts.has(format))
    .map((format) => `${counts.get(format)} ${format}`)
    .join(', ');
}

/** The facts the card lists for an export report, in order. */
export function reportRows(report: ExportReport): { key: string; value: string }[] {
  const verified = report.slides.filter((slide) => slide.verify !== undefined);
  const worst = verified.reduce((max, slide) => Math.max(max, slide.verify?.fraction ?? 0), 0);
  const raster = report.slides.reduce((sum, slide) => sum + slide.raster.length, 0);
  const themes = [...new Set(report.slides.map((slide) => slide.theme ?? report.theme))];
  const pages = report.slides.filter((slide) => slide.page !== undefined);
  const pageBytes = pages.reduce((sum, slide) => sum + (slide.page?.bytes ?? 0), 0);
  const worstPage = pages.reduce((max, slide) => Math.max(max, slide.page?.fraction ?? 0), 0);
  const rows = [
    {
      key: 'Mode',
      value: `${report.format} ${modeLabel(report.mode)} (${report.mode}), ${themes.join(' and ')}`,
    },
    { key: 'Pages', value: `${report.slides.length} (one per slide per theme)` },
    {
      key: 'Perfect',
      value:
        report.mode === 'flatten'
          ? report.perfect
            ? `yes: every page raster within ${percent(worstPage)} of its shot, package valid`
            : 'no: see the residual lines'
          : 'not claimed: editable text is drawn by the viewer',
    },
  ];
  if (pages.length > 0)
    rows.push({
      key: 'Page rasters',
      value: `${pageFormats(report)}; ${formatBytes(pageBytes)}`,
    });
  rows.push(
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
  );
  return rows;
}

/** The seller's word for what a run made: "PDF", "PowerPoint file" or "web page" (item 80). */
export function runKindWord(run: ArtifactRun): string {
  if (run.kind === 'build') return 'web page';
  return run.report.format === 'pdf' ? 'PDF' : 'PowerPoint file';
}

/** The one sentence under the files: what the file holds and how long the run took. */
export function runSentence(run: ArtifactRun): string {
  const seconds = `${(run.ms / 1000).toFixed(1)} s`;
  if (run.kind === 'build') return `One file, made in ${seconds}`;
  const themes = new Set(run.report.slides.map((slide) => slide.theme ?? run.report.theme));
  const pages = Math.max(1, Math.round(run.report.slides.length / Math.max(1, themes.size)));
  const unit = run.report.format === 'pdf' ? 'page' : 'slide';
  return `${pages} ${unit}${pages === 1 ? '' : 's'}${themes.size > 1 ? ` in ${themes.size} appearances` : ''}, made in ${seconds}`;
}

export function ExportReportCard({ run, downloads, onDownload, onClose }: ExportReportCardProps) {
  const kind = runKindWord(run);
  const title = `Your ${kind}`;
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
      data-perfect={run.kind === 'export' && run.report.perfect ? 'true' : undefined}
    >
      <div className="ts-report-head">
        <b data-control="export.report.title">{title}</b>
        <span data-control="export.report.sentence">{runSentence(run)}</span>
      </div>
      {run.downloads.length > 0 ? (
        <ul className="ts-report-files">
          {run.downloads.map((file) => (
            <li key={file.name} data-control="export.report.file">
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
      {/* the gate's rows and the residual lines, for the person who reads reports (item 80) */}
      <details className="ts-report-advanced" data-control="export.report.advanced">
        <summary>Advanced tools</summary>
        <p className="ts-report-verdict" data-passed={passed ? 'true' : 'false'}>
          {`${passed ? 'Passed' : 'Did not pass'} the gate in ${(run.ms / 1000).toFixed(1)} s`}
        </p>
        <dl className="ts-report-rows">
          {rows.map((row) => (
            <div key={row.key} className="ts-report-row">
              <dt>{row.key}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        {run.kind === 'export' && run.report.residual.length > 0 ? (
          <ul className="ts-report-residual">
            {run.report.residual.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </details>
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
