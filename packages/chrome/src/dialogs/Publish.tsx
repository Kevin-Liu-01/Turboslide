import { useState } from 'react';

import { Dialog, DialogCheck, DialogField, DialogTabs } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS, SNACKBARS, stubClause } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * Publish to the web (gslides-parity SPEC 2.1, 6.6; File > Share > Publish to web, Extensions >
 * Embed in a site): a Link tab with the present link and Copy link; an Embed tab with the
 * /embed/<id> iframe snippet and a size dropdown (Small 480 by 270, Medium 960 by 540, Large
 * 1440 by 810, Custom). Auto-advance slides and Start slideshow as soon as the player loads are
 * Later inside the dialog; Stop publishing is omitted with the sentence of SPEC 12.
 */
const SIZES = [
  { id: 'small', label: DIALOGS.publish.small, w: 480, h: 270 },
  { id: 'medium', label: DIALOGS.publish.medium, w: 960, h: 540 },
  { id: 'large', label: DIALOGS.publish.large, w: 1440, h: 810 },
  { id: 'custom', label: DIALOGS.publish.custom, w: 0, h: 0 },
] as const;

export function embedSnippet(
  origin: string,
  deckId: string,
  width: number,
  height: number,
): string {
  return `<iframe src="${origin}/embed/${encodeURIComponent(deckId)}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;
}

export function PublishDialog({ tab: initialTab = 'link' }: { tab?: 'link' | 'embed' }) {
  const shell = useEditorShell();
  const { input } = shell;
  const origin = input.origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const [tab, setTab] = useState<'link' | 'embed'>(initialTab);
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('medium');
  const [custom, setCustom] = useState({ w: 800, h: 450 });
  const chosen = SIZES.find((each) => each.id === size) ?? SIZES[1];
  const width = chosen.id === 'custom' ? custom.w : chosen.w;
  const height = chosen.id === 'custom' ? custom.h : chosen.h;
  const presentLink = `${origin}/deck/${encodeURIComponent(input.deckId)}?present=1`;
  const snippet = embedSnippet(origin, input.deckId, width, height);

  const copy = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => shell.say(SNACKBARS.linkCopied))
      .catch(() => shell.say(text));
  };

  return (
    <Dialog
      title={DIALOGS.publish.title}
      onClose={shell.closeDialog}
      width={560}
      control="dialog.publish"
      actions={[
        {
          label: 'Done',
          primary: true,
          onClick: shell.closeDialog,
          control: 'dialog.publish.done',
          doc: 'Closes the dialog',
        },
      ]}
    >
      <DialogTabs
        tabs={[
          { value: 'link', label: DIALOGS.publish.link },
          { value: 'embed', label: DIALOGS.publish.embed },
        ]}
        value={tab}
        onChange={setTab}
        control="dialog.publish.tab"
      />
      {tab === 'link' ? (
        <div className="ts-dialog-code">
          <code data-control="dialog.publish.link.url">{presentLink}</code>
          <button
            type="button"
            className="pt-ib is-text"
            data-control="dialog.publish.link.copy"
            onClick={() => copy(presentLink)}
            {...tipProps({ name: 'Copy link', doc: 'The presentation as a slideshow' })}
          >
            <span className="pt-lb">Copy link</span>
          </button>
        </div>
      ) : (
        <>
          <DialogField label="Size">
            <select
              value={size}
              aria-label="Size"
              data-control="dialog.publish.size"
              onChange={(event) => setSize(event.target.value as (typeof SIZES)[number]['id'])}
              {...tipProps({ name: 'Size', doc: 'The width and height of the frame' })}
            >
              {SIZES.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.id === 'custom' ? each.label : `${each.label} (${each.w} by ${each.h})`}
                </option>
              ))}
            </select>
          </DialogField>
          {size === 'custom' ? (
            <div className="ts-dialog-modes">
              <DialogField label="Width">
                <input
                  type="number"
                  value={custom.w}
                  min={160}
                  aria-label="Width"
                  data-control="dialog.publish.width"
                  onChange={(event) => setCustom({ ...custom, w: Number(event.target.value) || 0 })}
                  {...tipProps({ name: 'Width', doc: 'In pixels' })}
                />
              </DialogField>
              <DialogField label="Height">
                <input
                  type="number"
                  value={custom.h}
                  min={90}
                  aria-label="Height"
                  data-control="dialog.publish.height"
                  onChange={(event) => setCustom({ ...custom, h: Number(event.target.value) || 0 })}
                  {...tipProps({ name: 'Height', doc: 'In pixels' })}
                />
              </DialogField>
            </div>
          ) : null}
          <div className="ts-dialog-code">
            <textarea
              readOnly
              value={snippet}
              aria-label="Embed code"
              data-control="dialog.publish.embed.code"
              {...tipProps({ name: 'Embed code', doc: 'Paste it into a web page' })}
            />
            <button
              type="button"
              className="pt-ib is-text"
              data-control="dialog.publish.embed.copy"
              onClick={() => copy(snippet)}
              {...tipProps({ name: 'Copy', doc: 'Copies the embed code' })}
            >
              <span className="pt-lb">Copy</span>
            </button>
          </div>
        </>
      )}
      <DialogCheck
        label="Auto-advance slides"
        checked={false}
        onChange={() => undefined}
        disabled
        control="dialog.publish.autoAdvance"
        doc={stubClause('The player advances on a click or a key')}
      />
      <DialogCheck
        label="Start slideshow as soon as the player loads"
        checked={false}
        onChange={() => undefined}
        disabled
        control="dialog.publish.autoStart"
        doc={stubClause('The present link opens as a slideshow')}
      />
      <p>{DIALOGS.publish.reachable}.</p>
    </Dialog>
  );
}
