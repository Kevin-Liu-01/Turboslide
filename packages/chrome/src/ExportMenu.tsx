import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { ExportFormat, ExportMode } from '@turboslide/schema/export';

import { Seg } from './Seg';
import type { SegOption } from './Seg';
import { ToolButton } from './ToolButton';

import './ExportMenu.css';

/**
 * The Export menu in the toolbar (SPEC 8; Kevin's directive of 2026-09-11: one perfect PPTX). A
 * ToolButton in the shell grammar opens a small card under itself, in the row menu's grammar
 * (Sidebar.css .pt-orow-menu): the PPTX options as Segs and check rows (mode Perfect or Editable
 * text, theme light, dark or both, font set exact or standard, embed fonts in the editable mode,
 * headings as raster, the LibreOffice verify pass), then the standalone HTML build. Every run is
 * one action through the dispatcher the route owns: export.run for PPTX, build.run for the file;
 * the menu holds only the option state and reports the run's progress line. The option Segs select
 * plainly (Seg without `toggle`): a repeated click on the chosen option is a confirmation and
 * changes nothing (measured in the M5 verification: with the ported return to the first option,
 * confirming Native and Light exported flatten in both themes). The options live in this
 * component's state and are kept across runs, the report card and the menu's closing while the
 * route is mounted.
 */
export type ExportTheme = 'light' | 'dark' | 'both';

export type ExportMenuInput = {
  format: Extract<ExportFormat, 'pptx'>;
  mode: ExportMode;
  theme: ('light' | 'dark')[];
  fonts: 'exact' | 'standard';
  /** Editable text mode: embed the export faces as fntdata parts (docs/pptx.md) */
  embedFonts?: true;
  headings?: 'raster';
  verify: boolean;
};

/** What the server reports about the export surface (apps/studio/src/server/download.ts). */
export type ExportCapabilities = {
  /** the worker runs in this process, so produced files can be streamed back */
  downloads: boolean;
  worker: 'local' | 'http';
};

/** A run in flight: the label of the entry that started it and the worker's last log line. */
export type ExportProgress = { label: string; line?: string };

export type ExportMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null until the server has answered */
  capabilities: ExportCapabilities | null;
  progress: ExportProgress | null;
  /** export.run with the chosen options */
  onExport: (input: ExportMenuInput) => void;
  /** build.run: the standalone HTML file */
  onBuild: () => void;
  className?: string;
};

const MODES: readonly SegOption<ExportMode>[] = [
  {
    value: 'flatten',
    label: 'Perfect',
    title:
      'Pixel identical: a 2x raster of every page over a searchable invisible text layer, each page measured within 0.1 percent of the web render (SPEC 8.2)',
  },
  {
    value: 'native',
    label: 'Editable text',
    title:
      'Text boxes, hairlines and plates you can edit; layout identical within 3 px, glyph antialiasing differs; icons, marks and diagrams as PNG (SPEC 8.2)',
  },
];

const THEMES: readonly SegOption<ExportTheme>[] = [
  { value: 'both', label: 'Both', title: 'One file per theme plus a zip of both' },
  { value: 'light', label: 'Light', title: 'The light file only' },
  { value: 'dark', label: 'Dark', title: 'The dark file only' },
];

const FONTS: readonly SegOption<'exact' | 'standard'>[] = [
  {
    value: 'exact',
    label: 'Exact',
    title: 'Per-size Inter instances, twelve family names (SPEC 8.4)',
  },
  {
    value: 'standard',
    label: 'Standard',
    title: 'Three family names: GT Inter Display, Inter, Inter Medium (SPEC 8.4)',
  },
];

function themes(theme: ExportTheme): ('light' | 'dark')[] {
  return theme === 'both' ? ['light', 'dark'] : [theme];
}

export function ExportMenu({
  open,
  onOpenChange,
  capabilities,
  progress,
  onExport,
  onBuild,
  className,
}: ExportMenuProps) {
  const button = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ExportMode>('flatten');
  const [theme, setTheme] = useState<ExportTheme>('both');
  const [fonts, setFonts] = useState<'exact' | 'standard'>('exact');
  const [embed, setEmbed] = useState(false);
  const [raster, setRaster] = useState(false);
  const [verify, setVerify] = useState(false);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  /* the card sits under the button, in the viewport, like the sidebar's row menu */
  useEffect(() => {
    if (!open) return;
    const anchor = button.current?.querySelector('button');
    const rect = anchor?.getBoundingClientRect();
    if (rect) setAt({ x: Math.min(rect.left, window.innerWidth - 344), y: rect.bottom + 6 });
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (card.current?.contains(event.target) || button.current?.contains(event.target)) return;
      onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onOpenChange]);

  const busy = progress !== null;
  const native = mode === 'native';
  const input = (): ExportMenuInput => ({
    format: 'pptx',
    mode,
    theme: themes(theme),
    fonts,
    ...(native && embed ? { embedFonts: true as const } : {}),
    ...(raster ? { headings: 'raster' as const } : {}),
    verify,
  });

  /* Enter on a check row toggles it, as Space does */
  const onCheckKey = (event: ReactKeyboardEvent<HTMLInputElement>, toggle: () => void) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    toggle();
  };

  return (
    <span ref={button} className={['ts-export-anchor', className ?? ''].filter(Boolean).join(' ')}>
      <ToolButton
        icon="external"
        label="Export"
        title="Export the deck: PPTX, standalone HTML"
        pressed={open}
        control="export.open"
        className="ts-export-btn"
        onClick={() => onOpenChange(!open)}
      />
      {open && at ? (
        <div
          ref={card}
          className="ts-export"
          role="dialog"
          aria-label="Export"
          data-control="export.menu"
          data-busy={busy ? '' : undefined}
          style={{ left: at.x, top: at.y }}
        >
          <span className="ts-export-head">PPTX</span>
          <div className="ts-export-row">
            <span className="ts-export-label">Mode</span>
            <Seg
              options={MODES}
              value={mode}
              onChange={setMode}
              label="Export mode"
              className="is-small ts-export-seg"
              control="export.mode"
            />
          </div>
          <p className="ts-export-note" data-control="export.mode-note">
            {native
              ? "Editable text: text boxes at the browser boxes, layout identical within 3 px; the glyph antialiasing is the viewer's."
              : 'Perfect: pixel identical, one 2x raster per page over a searchable text layer; the report says whether every page matched.'}
          </p>
          <div className="ts-export-row">
            <span className="ts-export-label">Theme</span>
            <Seg
              options={THEMES}
              value={theme}
              onChange={setTheme}
              label="Export theme"
              className="is-small ts-export-seg"
              control="export.theme"
            />
          </div>
          <div className="ts-export-row">
            <span className="ts-export-label">Fonts</span>
            <Seg
              options={FONTS}
              value={fonts}
              onChange={setFonts}
              label="Export font set"
              className="is-small ts-export-seg"
              control="export.fonts"
            />
          </div>
          <label
            className="ts-export-row ts-export-check"
            data-disabled={native ? undefined : ''}
            title={
              native
                ? 'Embed the export faces as fntdata parts so a viewer without them keeps the metrics'
                : 'Perfect mode never embeds fonts: the text layer is invisible'
            }
          >
            <span className="ts-export-label">Embed fonts</span>
            <input
              type="checkbox"
              checked={native && embed}
              disabled={!native}
              aria-label="Embed fonts"
              data-control="export.embed-fonts"
              onChange={(event) => setEmbed(event.target.checked)}
              onKeyDown={(event) => onCheckKey(event, () => setEmbed((v) => !v))}
            />
            <span className="ts-export-box" aria-hidden="true" />
          </label>
          <label className="ts-export-row ts-export-check">
            <span className="ts-export-label">Headings as raster</span>
            <input
              type="checkbox"
              checked={raster}
              aria-label="Headings as raster"
              data-control="export.headings"
              onChange={(event) => setRaster(event.target.checked)}
              onKeyDown={(event) => onCheckKey(event, () => setRaster((v) => !v))}
            />
            <span className="ts-export-box" aria-hidden="true" />
          </label>
          <label className="ts-export-row ts-export-check">
            <span className="ts-export-label">Verify with LibreOffice</span>
            <input
              type="checkbox"
              checked={verify}
              aria-label="Verify with LibreOffice"
              data-control="export.verify"
              onChange={(event) => setVerify(event.target.checked)}
              onKeyDown={(event) => onCheckKey(event, () => setVerify((v) => !v))}
            />
            <span className="ts-export-box" aria-hidden="true" />
          </label>
          <div className="ts-export-actions">
            <button
              type="button"
              className="pt-ib is-text is-solid"
              title="export.run: one PPTX per theme (and a zip of both), downloaded when done"
              data-control="export.pptx"
              disabled={busy}
              onClick={() => onExport(input())}
            >
              <span className="pt-lb">Export PPTX</span>
            </button>
          </div>
          <span className="ts-export-rule" aria-hidden="true" />
          <span className="ts-export-head">Standalone HTML</span>
          <p className="ts-export-note">
            build.run: the single file with fonts and assets inlined, under the 16 MB budget.
          </p>
          <div className="ts-export-actions">
            <button
              type="button"
              className="pt-ib is-text"
              title="build.run: the standalone deck file, downloaded when done"
              data-control="export.build"
              disabled={busy}
              onClick={onBuild}
            >
              <span className="pt-lb">Build and download</span>
            </button>
          </div>
          {capabilities !== null && !capabilities.downloads ? (
            <p className="ts-export-note">
              The render worker runs elsewhere; the files stay on it and the report card lists them.
            </p>
          ) : null}
          {progress ? (
            <p className="ts-export-progress" role="status" data-control="export.progress">
              <i className="ts-export-dot" aria-hidden="true" />
              <span>{progress.label}</span>
              {progress.line ? <span className="ts-export-line">{progress.line}</span> : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
