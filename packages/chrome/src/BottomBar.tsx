import { useEditorShell } from './editor-shell-context';
import { usePtShell } from './shell-context';
import { ToolButton } from './ToolButton';

import './BottomBar.css';

/**
 * The bottom bar (gslides-parity SPEC 0.2, 1.1; R02 section 9): 32 px (--pt-status-h). Left: the
 * filmstrip view and grid view toggle as two ToolButtons (the same state View > Grid view and
 * the bottom toggle share). Right: the Show side panel chevron, which reopens the last right
 * panel. Nothing else: no slide counter, no zoom value (the Zoom box carries it), no status text.
 * The bar draws --pt-hair above itself (SPEC 1.2). New in Turboslide (no Prototemplate source).
 */
export function BottomBar() {
  const shell = usePtShell();
  const editor = useEditorShell();
  const grid = shell.mode === 'grid';
  return (
    <footer className="ts-bottombar" data-control="bottombar">
      <div className="ts-bottombar-l" role="group" aria-label="View">
        <ToolButton
          icon="slide"
          title="Filmstrip view"
          doc="One slide on the canvas with the filmstrip beside it"
          pressed={!grid}
          className="ts-bottombar-btn"
          control="view.filmstripView"
          onClick={() => {
            if (grid) shell.setMode('slide');
          }}
        />
        <ToolButton
          icon="grid"
          title="Grid view"
          doc="Every slide as a tile; drag to reorder"
          pressed={grid}
          className="ts-bottombar-btn"
          control="view.gridView"
          onClick={() => shell.setMode(grid ? 'slide' : 'grid')}
        />
      </div>
      <div className="ts-bottombar-r">
        <ToolButton
          icon={editor.panel === null ? 'prev' : 'next'}
          title={editor.panel === null ? 'Show side panel' : 'Hide side panel'}
          doc={
            editor.panel === null
              ? 'Reopens the last panel: Themes, Format options, Version history or Check slides'
              : 'Closes the panel'
          }
          className="ts-bottombar-btn"
          control="panel.toggle"
          onClick={() => (editor.panel === null ? editor.reopenPanel() : editor.closePanel())}
        />
      </div>
    </footer>
  );
}
