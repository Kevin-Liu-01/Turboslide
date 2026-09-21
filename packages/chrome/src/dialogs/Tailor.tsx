import { useMemo, useRef, useState } from 'react';

import type { DeckDocument } from '@turboslide/schema/deck';
import { slideOrder, slideTitle } from '@turboslide/schema/deck';
import { fileToDataUrl } from '@turboslide/viewer/clipboard';

import { Dialog, DialogCheck, DialogField } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { useMountEffect } from '../lib/useMountEffect';
import { TAILOR } from '../panels/assist-strings';
import { tipProps } from '../Tooltip';
import { countMatches, slideStrings } from './FindReplace';

/**
 * Tools > Tailor for a customer (docs/PRODUCT.md section 5; audit-gaps 16; research 07): the
 * tailoring pass as one dialog with three steps on one card. The customer name (Replace "Acme"
 * with "Globex", counted live as "4 places on 3 slides" over the same texts Find and replace
 * reads), the logo (Replace the pictures named after the old customer with a file you choose;
 * Use this logo on every slide is drawn disabled until the brand kit gives the deck a logo slot,
 * so the row is not driven and never broken), and the slides to skip (the filmstrip's titles with
 * a checkbox each), then Apply: one `deck.tailor` through the editor's dispatch, which the
 * controller runs as one commit labelled "Tailor for Globex", one undo entry, and the snackbar
 * with Undo. The Assist panel's first starter card opens this same dialog (6.1). A chosen
 * picture is added with `asset.add` first (its own record, as every upload), then named in the
 * pass, so the text, the skips and the swaps stay one undo step.
 */

/** How many times `from` occurs across the deck and on how many slides, the dialog's live count. */
export function tailorCounts(
  document: DeckDocument,
  from: string,
): { places: number; slides: number } {
  if (from.trim() === '') return { places: 0, slides: 0 };
  let places = 0;
  let slides = 0;
  for (const id of slideOrder(document.deck)) {
    const here = countMatches(slideStrings(document, id), from, false);
    if (here > 0) {
      places += here;
      slides += 1;
    }
  }
  return { places, slides };
}

const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];

export function TailorDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [replaceAlt, setReplaceAlt] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [skip, setSkip] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fromField = useRef<HTMLInputElement>(null);
  const fileField = useRef<HTMLInputElement>(null);
  const closeRef = useRef(shell.closeDialog);
  closeRef.current = shell.closeDialog;

  useMountEffect(() => {
    const timer = window.setTimeout(() => fromField.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  });

  const order = useMemo(() => slideOrder(input.document.deck), [input.document]);
  const counts = useMemo(() => tailorCounts(input.document, from), [input.document, from]);
  const hasName = from.trim() !== '' && counts.places > 0;
  const hasLogo = replaceAlt && file !== null && from.trim() !== '';
  const hasSkip = skip.size > 0;
  const canApply = (hasName || hasLogo || hasSkip) && busy === null;

  const toggleSkip = (id: string, on: boolean) => {
    setSkip((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const apply = async () => {
    if (!canApply) return;
    setError(null);
    try {
      let logo: { assetId: string; replaceAlt: string } | undefined;
      if (file !== null && hasLogo) {
        setBusy(TAILOR.uploading);
        const dataUrl = await fileToDataUrl(file);
        const asset = (await input.dispatch('asset.add', {
          file: dataUrl,
          role: 'capture',
          alt: `${to.trim() === '' ? 'The customer' : to.trim()} logo`,
          baseRevision: input.revision,
        })) as { id?: string };
        if (typeof asset.id !== 'string') throw new TypeError('the picture was not added');
        logo = { assetId: asset.id, replaceAlt: from.trim() };
      }
      setBusy(TAILOR.label(to.trim()));
      await input.dispatch('deck.tailor', {
        ...(hasName ? { replacements: [{ from: from.trim(), to: to.trim() }] } : {}),
        ...(logo === undefined ? {} : { logo }),
        ...(hasSkip ? { skip: order.filter((id) => skip.has(id)) } : {}),
        baseRevision: input.revision,
      });
      closeRef.current();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const fromTip = tipProps({ name: TAILOR.from, doc: TAILOR.fromDoc });
  const toTip = tipProps({ name: TAILOR.to, doc: TAILOR.toDoc });
  return (
    <Dialog
      title={TAILOR.title}
      lead={TAILOR.lead}
      onClose={shell.closeDialog}
      width={520}
      control="dialog.tailor"
      cancel
      cancelLabel={TAILOR.cancel}
      actions={[
        {
          label: busy ?? TAILOR.apply,
          primary: true,
          onClick: () => void apply(),
          disabled: !canApply,
          control: 'dialog.tailor.apply',
          doc: canApply ? TAILOR.applyDoc : TAILOR.nothing,
        },
      ]}
    >
      <DialogField
        label={TAILOR.from}
        doc={TAILOR.fromDoc}
        hint={from === '' ? undefined : TAILOR.count(counts.places, counts.slides)}
      >
        <input
          ref={fromField}
          type="text"
          value={from}
          data-control="dialog.tailor.from"
          autoComplete="off"
          spellCheck={false}
          {...fromTip}
          onChange={(event) => setFrom(event.target.value)}
        />
      </DialogField>
      <DialogField label={TAILOR.to} doc={TAILOR.toDoc}>
        <input
          type="text"
          value={to}
          data-control="dialog.tailor.to"
          autoComplete="off"
          spellCheck={false}
          {...toTip}
          onChange={(event) => setTo(event.target.value)}
        />
      </DialogField>
      <p className="ts-dialog-hint" data-control="dialog.tailor.count" aria-live="polite">
        {from === '' ? ' ' : TAILOR.count(counts.places, counts.slides)}
      </p>
      <p className="ts-dialog-field-label">{TAILOR.logoHead}</p>
      <DialogCheck
        label={TAILOR.logoEverySlide}
        checked={false}
        onChange={() => undefined}
        disabled
        control="dialog.tailor.logo.everySlide"
        doc={TAILOR.logoEverySlideDoc}
      />
      <DialogCheck
        label={TAILOR.logoReplaceAlt}
        checked={replaceAlt}
        onChange={setReplaceAlt}
        control="dialog.tailor.logo.replaceAlt"
        doc={TAILOR.logoReplaceAltDoc}
      />
      {replaceAlt ? (
        <div className="ts-dialog-field">
          <input
            ref={fileField}
            type="file"
            accept={PICTURE_TYPES.join(',')}
            data-control="dialog.tailor.logo.file"
            aria-label={TAILOR.logoFile}
            {...tipProps({ name: TAILOR.logoFile, doc: TAILOR.logoFileDoc })}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          {file !== null ? (
            <span className="ts-dialog-hint">{TAILOR.logoChosen(file.name)}</span>
          ) : null}
        </div>
      ) : null}
      <p
        className="ts-dialog-field-label"
        {...tipProps({ name: TAILOR.skipHead, doc: TAILOR.skipDoc })}
      >
        {TAILOR.skipHead}
      </p>
      <div className="ts-dialog-list" data-control="dialog.tailor.skip">
        {order.map((id, index) => {
          const slide = input.document.slides[id];
          if (slide === undefined) return null;
          const skipped = slide.skip === true;
          return (
            <DialogCheck
              key={id}
              label={TAILOR.skipRow(index + 1, slideTitle(slide, index + 1))}
              checked={skipped || skip.has(id)}
              disabled={skipped}
              onChange={(on) => toggleSkip(id, on)}
              control={`dialog.tailor.skip.${id}`}
              doc={skipped ? 'This slide is skipped already' : TAILOR.skipDoc}
            />
          );
        })}
      </div>
      {error !== null ? (
        <p className="ts-dialog-hint" role="alert" data-control="dialog.tailor.error">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
