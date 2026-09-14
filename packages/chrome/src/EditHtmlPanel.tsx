import { useEffect, useState } from 'react';

import type { Block } from '@turboslide/schema/blocks';

import type { EditorDispatch } from './dispatch';
import { PANELS } from './menus/strings';
import { Panel } from './Panel';
import { tipProps } from './Tooltip';

import './EditHtmlPanel.css';

/**
 * The Edit HTML panel (gslides-parity SPEC-3 0.27, 8.4): an `html` block renders inside a
 * sandboxed frame, which is opaque to the caret, so its markup and styles are edited here: two
 * plain text fields, Apply writing `block.set /html` and `/css` in one `slide.update` through the
 * dispatcher (the server sanitizes and stamps `htmlSanitized`), and the sentence saying so. The
 * panel opens from the block's right-click menu and Search the menus (`format.editHtml`).
 */
export type EditHtmlPanelProps = {
  slideId: string;
  block: Block | undefined;
  revision: number;
  dispatch: EditorDispatch;
  busy?: boolean;
  onNotice: (text: string) => void;
  onClose: () => void;
};

export function EditHtmlPanel({
  slideId,
  block,
  revision,
  dispatch,
  busy = false,
  onNotice,
  onClose,
}: EditHtmlPanelProps) {
  const html = block?.type === 'html' ? block.html : '';
  const css = block?.type === 'html' ? block.css : '';
  const [markup, setMarkup] = useState(html);
  const [styles, setStyles] = useState(css);
  useEffect(() => {
    setMarkup(html);
    setStyles(css);
  }, [html, css, block?.id]);
  const dirty = markup !== html || styles !== css;

  const apply = () => {
    if (block?.type !== 'html' || !dirty || busy) return;
    dispatch('slide.update', {
      slideId,
      baseRevision: revision,
      mutations: [
        ...(markup === html
          ? []
          : [{ op: 'block.set', slideId, blockId: block.id, path: '/html', value: markup }]),
        ...(styles === css
          ? []
          : [{ op: 'block.set', slideId, blockId: block.id, path: '/css', value: styles }]),
      ],
    }).catch((error: unknown) => onNotice(error instanceof Error ? error.message : String(error)));
  };

  return (
    <Panel
      title={PANELS.editHtml.title}
      onClose={onClose}
      control="panel.editHtml"
      className="ts-edit-html"
    >
      {block?.type !== 'html' ? (
        <p className="ts-panel-empty">Select an embedded block on the slide to edit its HTML</p>
      ) : (
        <div className="ts-edit-html-body">
          <p className="ts-edit-html-note">{PANELS.editHtml.note}</p>
          <label className="ts-edit-html-field">
            <span>HTML</span>
            <textarea
              value={markup}
              spellCheck={false}
              aria-label="HTML"
              data-control="panel.editHtml.html"
              onChange={(event) => setMarkup(event.target.value)}
              {...tipProps({
                name: 'HTML',
                doc: 'The block’s markup; scripts and event handlers are removed when it saves',
              })}
            />
          </label>
          <label className="ts-edit-html-field">
            <span>CSS</span>
            <textarea
              value={styles}
              spellCheck={false}
              aria-label="CSS"
              data-control="panel.editHtml.css"
              onChange={(event) => setStyles(event.target.value)}
              {...tipProps({ name: 'CSS', doc: 'The block’s styles, scoped to the block' })}
            />
          </label>
          <div className="ts-edit-html-actions">
            <button
              type="button"
              className="pt-ib is-solid"
              disabled={!dirty || busy}
              data-control="panel.editHtml.apply"
              onClick={apply}
              {...tipProps({
                name: PANELS.editHtml.apply,
                doc: 'One write of the markup and the styles',
              })}
            >
              <span className="pt-lb">{PANELS.editHtml.apply}</span>
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
