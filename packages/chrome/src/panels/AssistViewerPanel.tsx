import { Panel } from '../Panel';

import { ASSIST } from './assist-strings';

import './Assist.css';

/**
 * The Assist panel a view link visitor sees (docs/PRODUCT.md 6.3; the row
 * `assist.viewer.disabled`): the same title and the one sentence, "Commenters and editors can use
 * the assistant", and nothing to type into, because a viewer cannot write and the assistant only
 * writes. The viewer page's Assist button toggles it where the editor's opens the working panel
 * (panels/Assist.tsx, which needs the editor's document and dispatch). `ts-inspector` places it
 * in the ViewerShell's second column (ViewerShell.css `.pt-main > .ts-inspector`).
 */
export function AssistViewerPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel
      title={ASSIST.title}
      onClose={onClose}
      control="panel.assist"
      className="ts-assist-panel ts-inspector"
    >
      <p className="ts-assist-disabled" data-control="panel.assist.viewer">
        {ASSIST.viewer}
      </p>
    </Panel>
  );
}
