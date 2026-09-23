import { useEffect, useMemo, useRef, useState } from 'react';

import type { DeckDocument } from '@turboslide/schema/deck';
import { deckAppearance, slideOrder, slideTitle } from '@turboslide/schema/deck';
import { fileToDataUrl } from '@turboslide/viewer/clipboard';

import { Dialog, DialogCheck, DialogField } from '../Dialog';
import type { EditorShellInput } from '../editor-shell';
import { useEditorShell } from '../editor-shell-context';
import { useMountEffect } from '../lib/useMountEffect';
import { findCustomerLogo, logoMatchFor } from '../logo-model';
import type { LogoRow } from '../logo-model';
import { TAILOR_LOGO } from '../menus/strings';
import { TAILOR } from '../panels/assist-strings';
import { tipProps } from '../Tooltip';
import { countMatches, slideStrings } from './FindReplace';
import { LogoMarkPair, insertLogo, kitGrounds, searchLogos } from './Logo';

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
 *
 * The features round (docs/FEATURES.md 4.5; audit-logos 3): the Logo step gains "Find the <To>
 * logo" (`dialog.tailor.logo.find`) beside the chooser, drawn once the To field names a brand the
 * server's cache knows by title or alias, showing the mark on paper and on ink (the Logo dialog's
 * pair); a click stores the mark through `logo.insert` and the stored asset feeds `deck.tailor`'s
 * `logo` in the one Tailor commit, one undo step as before. The slot and its words are this
 * lane's (B1); the match and the store are B6's rules in logo-model.ts (`logoMatchFor` over the
 * rows `GET /api/logo/search?q=<to>&limit=5` answers, `findCustomerLogo` over `logo.insert` with
 * no slide and no kit write; build/b6.md R7), wired here as the default `TailorLogoFinder`; a
 * test passes its own. The chooser lists the four raster types alone until the svg intake of 4.7
 * lands (4.5).
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

/** The four raster types the hosted intake accepts (docs/FEATURES.md 4.5; audit-logos 4). */
const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** How long the To field rests before the cache is asked whether it knows the name. */
export const FIND_LOGO_PAUSE_MS = 300;

/**
 * The Find the logo seam (FEATURES.md 4.5; section 6 "Tailor.tsx: B1 the slot, B6 the handler
 * and the cache match"): the match of the To field against the cache by title or alias, and the
 * store of the mark through `logo.insert`, answering the asset id `deck.tailor` takes. The
 * dialog builds the default from logo-model.ts's rules over the shell's input; a test passes
 * its own; `null` draws no button.
 */
export type TailorLogoFinder = {
  match: (name: string) => Promise<LogoRow | null>;
  store: (row: LogoRow) => Promise<{ assetId: string }>;
};

/**
 * The finder over the product's routes and rules (build/b6.md R7). `store` answers only once the
 * live document holds the stored mark (`findCustomerLogo`'s wait over `documentNow`), because
 * Apply plans `deck.tailor` in the page over the tab's document and on the blob tier the record
 * comes back over the channel after the server's answer (the fix round, VERIFICATION.md pass 1
 * F2; b6.md R14).
 */
export function defaultLogoFinder(input: {
  deckId: string;
  revision: number;
  dispatch: EditorShellInput['dispatch'];
  document: DeckDocument;
  /** the document as it stands when asked, so the wait for the stored mark reads the live one */
  documentNow?: () => DeckDocument;
}): TailorLogoFinder {
  const current = input.documentNow ?? (() => input.document);
  return {
    match: async (name) => {
      const answer = await searchLogos(name, { limit: 5 });
      return logoMatchFor(answer.logos, name);
    },
    store: async (row) => {
      const stored = await findCustomerLogo(
        row,
        deckAppearance(input.document.deck),
        (request) =>
          insertLogo(request, { dispatch: input.dispatch, deckId: input.deckId }).then(
            (answer) => ({ asset: { id: answer.asset.id } }),
          ),
        input.revision,
        { landed: (assetId) => current().deck.assets[assetId] !== undefined },
      );
      if (stored === null) throw new Error(`${row.title} has no variant that reads on this deck`);
      if (!stored.landed)
        throw new Error(
          `The ${row.title} logo is stored but has not reached this presentation yet; try again in a moment`,
        );
      return { assetId: stored.assetId };
    },
  };
}

/** A refusal's message without its action id, so the sheet never reads `deck.tailor:` (the copy rule). */
function refusalSentence(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^[a-z]+\.[a-zA-Z.]+: /, '');
}

export function TailorDialog({ logoFinder }: { logoFinder?: TailorLogoFinder | null } = {}) {
  const shell = useEditorShell();
  const { input } = shell;
  /* the live document for the finder's wait: the memo keeps its dependencies and the ref follows every render */
  const documentRef = useRef(input.document);
  documentRef.current = input.document;
  const finder = useMemo<TailorLogoFinder | null>(
    () =>
      logoFinder === undefined
        ? defaultLogoFinder({
            deckId: input.deckId,
            revision: input.revision,
            dispatch: input.dispatch,
            document: input.document,
            documentNow: () => documentRef.current,
          })
        : logoFinder,
    [input.deckId, input.dispatch, input.document, input.revision, logoFinder],
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [replaceAlt, setReplaceAlt] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  /* the Find the logo slot: the cache's match for the To field, and the mark stored by a click */
  const [foundLogo, setFoundLogo] = useState<LogoRow | null>(null);
  const [storedLogo, setStoredLogo] = useState<{ assetId: string; title: string } | null>(null);
  const [storing, setStoring] = useState(false);
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
  const hasLogo = replaceAlt && (file !== null || storedLogo !== null) && from.trim() !== '';
  const hasSkip = skip.size > 0;
  const canApply = (hasName || hasLogo || hasSkip) && busy === null && !storing;
  const grounds = useMemo(() => kitGrounds(input.document.deck.brand), [input.document]);

  /* the To field rests, then the cache is asked; a stored mark of another name is dropped */
  useEffect(() => {
    if (finder === null) return undefined;
    const name = to.trim();
    if (name === '') {
      setFoundLogo(null);
      return undefined;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      finder
        .match(name)
        .then((row) => {
          if (live) setFoundLogo(row);
        })
        .catch(() => {
          if (live) setFoundLogo(null);
        });
    }, FIND_LOGO_PAUSE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [finder, to]);
  useEffect(() => {
    if (
      storedLogo !== null &&
      storedLogo.title.toLocaleLowerCase() !== to.trim().toLocaleLowerCase()
    )
      setStoredLogo(null);
  }, [storedLogo, to]);

  const findLogo = async () => {
    if (finder === null || foundLogo === null || storing) return;
    setStoring(true);
    setError(null);
    try {
      const stored = await finder.store(foundLogo);
      setStoredLogo({ assetId: stored.assetId, title: foundLogo.title });
      setReplaceAlt(true);
    } catch (err: unknown) {
      setError(refusalSentence(err));
    } finally {
      setStoring(false);
    }
  };

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
      if (storedLogo !== null && hasLogo) {
        /* the mark Find the logo stored (4.5): named in the pass, so the swap is one undo step */
        logo = { assetId: storedLogo.assetId, replaceAlt: from.trim() };
      } else if (file !== null && hasLogo) {
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
      setError(refusalSentence(err));
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
      {finder !== null && foundLogo !== null && to.trim() !== '' ? (
        <div className="ts-tailor-find" data-control="dialog.tailor.logo.found">
          <button
            type="button"
            className="pt-ib is-text ts-dialog-btn ts-tailor-find-button"
            data-control="dialog.tailor.logo.find"
            data-slug={foundLogo.slug}
            disabled={storing || busy !== null}
            aria-pressed={storedLogo !== null}
            onClick={() => void findLogo()}
            {...tipProps({ name: TAILOR_LOGO.find(to.trim()), doc: TAILOR_LOGO.findDoc })}
          >
            <span className="pt-lb">
              {storing ? TAILOR_LOGO.storing : TAILOR_LOGO.find(to.trim())}
            </span>
          </button>
          <LogoMarkPair row={foundLogo} grounds={grounds} control="dialog.tailor.logo.find" />
          {storedLogo !== null ? (
            <span className="ts-dialog-hint" data-control="dialog.tailor.logo.stored">
              {TAILOR_LOGO.found(storedLogo.title)}
            </span>
          ) : null}
        </div>
      ) : null}
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
