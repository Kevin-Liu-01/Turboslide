import { useEditorShell } from './editor-shell-context';
import type { PanelId } from './editor-shell';
import { Icon } from './icons';
import { tipProps } from './Tooltip';

import './SidebarStrip.css';

/**
 * The sidebar strip (gslides-parity SPEC-5 0.22, 4.4; MILESTONES-5 B3 day 7): two icon buttons at
 * the editor's left edge, Templates and Building blocks, each opening its pane in the right slot
 * and pressed while the pane is open. Mounted by the integrator beside the filmstrip (b3.md
 * request B3-13); the panel ids `templates` and `buildingBlocks` join `PANEL_IDS` there. Until
 * they do, the shell's `openPanel` still takes the id and the pane switch draws nothing, so the
 * strip is safe to mount first.
 */
export const STRIP_PANELS: ReadonlyArray<{
  id: PanelId;
  label: string;
  icon: 'square-2-stack' | 'squares-2x2';
  doc: string;
}> = [
  {
    id: 'templates' as PanelId,
    label: 'Templates',
    icon: 'square-2-stack',
    doc: 'Slides from a template, inserted after the current slide',
  },
  {
    id: 'buildingBlocks' as PanelId,
    label: 'Building blocks',
    icon: 'squares-2x2',
    doc: 'Ready made groups of objects for the current slide',
  },
];

export function SidebarStrip() {
  const shell = useEditorShell();
  return (
    <nav className="ts-strip-bar ts-chrome" aria-label="Side panels" data-control="sidebar.strip">
      {STRIP_PANELS.map((entry) => {
        const on = shell.panel === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            className="ts-strip-btn"
            aria-pressed={on}
            aria-label={entry.label}
            data-control={`sidebar.strip.${entry.id}`}
            onClick={() => (on ? shell.closePanel() : shell.openPanel(entry.id))}
            {...tipProps({ name: entry.label, doc: entry.doc })}
          >
            <Icon name={entry.icon} size={18} />
          </button>
        );
      })}
    </nav>
  );
}
