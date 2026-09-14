import { useState } from 'react';

import { Dialog, DialogCheck, DialogField, DialogTabs } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS, SNACKBARS, stubClause } from '../menus/strings';
import { tipProps } from '../Tooltip';

import './share.css';

/**
 * Publish to the web (gslides-parity SPEC 2.1, 6.6; SPEC-3 6.4: File > Share > Publish to web,
 * the Share dialog's footer link, Extensions > Embed in a site): the published player is
 * `/deck/<id>?p=<token>&present=1` and the embed `/embed/<id>?p=<token>`, minted once by
 * `deck.publish`; the dialog shows the Link and Embed tabs with a size dropdown, "Stop publishing"
 * (`deck.unpublish`, after which the URL answers 410), and reads "Anyone with the published link
 * can view the current version; every edit is published". Auto-advance and Start slideshow stay
 * Later inside the dialog. On a deck with no access record the round one present link stands in.
 */
const SIZES = [
  { id: 'small', label: DIALOGS.publish.small, w: 480, h: 270 },
  { id: 'medium', label: DIALOGS.publish.medium, w: 960, h: 540 },
  { id: 'large', label: DIALOGS.publish.large, w: 1440, h: 810 },
  { id: 'custom', label: DIALOGS.publish.custom, w: 0, h: 0 },
] as const;

export function embedSnippet(embedUrl: string, width: number, height: number): string {
  return `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;
}

export function PublishDialog({ tab: initialTab = 'link' }: { tab?: 'link' | 'embed' }) {
  const shell = useEditorShell();
  const { input } = shell;
  const origin = input.origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const access = input.access;
  const [tab, setTab] = useState<'link' | 'embed'>(initialTab);
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('medium');
  const [custom, setCustom] = useState({ w: 800, h: 450 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<{ playerUrl: string; embedUrl: string } | null>(
    access?.published ?? null,
  );
  const chosen = SIZES.find((each) => each.id === size) ?? SIZES[1];
  const width = chosen.id === 'custom' ? custom.w : chosen.w;
  const height = chosen.id === 'custom' ? custom.h : chosen.h;
  const id = encodeURIComponent(input.deckId);
  /* the round one addresses stand in for a deck with no access record */
  const legacy = access === undefined;
  const playerUrl = minted?.playerUrl ?? (legacy ? `${origin}/deck/${id}?present=1` : null);
  const embedUrl = minted?.embedUrl ?? (legacy ? `${origin}/embed/${id}` : null);
  const published = legacy || minted !== null;
  const canPublish = input.capabilities === undefined || input.capabilities.includes('publish');

  const copy = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => shell.say(SNACKBARS.linkCopied))
      .catch(() => shell.say(text));
  };

  const write = (action: 'deck.publish' | 'deck.unpublish') => {
    if (busy || access === undefined) return;
    setBusy(true);
    setError(null);
    input
      .dispatch(action, { id: input.deckId, baseRevision: access.revision })
      .then((result) => {
        if (action === 'deck.publish') {
          const answer = result as { url?: string; embed?: string };
          if (answer.url !== undefined && answer.embed !== undefined) {
            const abs = (path: string) => (path.startsWith('http') ? path : `${origin}${path}`);
            setMinted({ playerUrl: abs(answer.url), embedUrl: abs(answer.embed) });
          }
        } else setMinted(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
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
      <div
        className="ts-publish-state"
        data-control="dialog.publish.state"
        data-published={published ? '' : undefined}
      >
        <span>{published ? DIALOGS.publish.published : DIALOGS.publish.notPublished}</span>
        {!legacy && canPublish ? (
          published ? (
            <button
              type="button"
              className="pt-ib is-text"
              disabled={busy}
              data-control="dialog.publish.stop"
              onClick={() => write('deck.unpublish')}
              {...tipProps({
                name: DIALOGS.publish.stopPublishing,
                doc: 'The player and the embed stop answering',
              })}
            >
              <span className="pt-lb">{DIALOGS.publish.stopPublishing}</span>
            </button>
          ) : (
            <button
              type="button"
              className="pt-ib is-solid"
              disabled={busy}
              data-control="dialog.publish.publish"
              onClick={() => write('deck.publish')}
              {...tipProps({
                name: DIALOGS.publish.publish,
                doc: 'Mints the player link and the embed code',
              })}
            >
              <span className="pt-lb">{DIALOGS.publish.publish}</span>
            </button>
          )
        ) : null}
      </div>
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
          <code data-control="dialog.publish.link.url">
            {playerUrl ?? DIALOGS.publish.notPublished}
          </code>
          <button
            type="button"
            className="pt-ib is-text"
            disabled={playerUrl === null}
            data-control="dialog.publish.link.copy"
            onClick={() => playerUrl !== null && copy(playerUrl)}
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
              value={
                embedUrl === null
                  ? DIALOGS.publish.notPublished
                  : embedSnippet(embedUrl, width, height)
              }
              aria-label="Embed code"
              data-control="dialog.publish.embed.code"
              {...tipProps({ name: 'Embed code', doc: 'Paste it into a web page' })}
            />
            <button
              type="button"
              className="pt-ib is-text"
              disabled={embedUrl === null}
              data-control="dialog.publish.embed.copy"
              onClick={() => embedUrl !== null && copy(embedSnippet(embedUrl, width, height))}
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
      {legacy ? <p>{DIALOGS.publish.reachable}.</p> : null}
      <p className="ts-dialog-error-row" role="alert" data-control="dialog.publish.error">
        {error ?? ''}
      </p>
    </Dialog>
  );
}
