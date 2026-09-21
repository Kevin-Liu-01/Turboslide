import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { AssistCard, AssistIntent } from '@turboslide/schema/actions';
import type { DeckDocument } from '@turboslide/schema/deck';
import { slideOrder, slideTitle } from '@turboslide/schema/deck';

import type { EditorDispatch } from '../dispatch';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { Panel } from '../Panel';
import type { SnackbarAction } from '../Snackbar';
import { tipProps } from '../Tooltip';
import { ASSIST } from './assist-strings';
import type { PanelEntry } from './assist-model';
import { cardControl, markChangedWords, rowControl, rowTexts } from './assist-model';

import './Assist.css';

/**
 * The Assist panel (docs/PRODUCT.md 6.1; audit-assist 2, 3, 4, 10): the right panel's frame with
 * the first line naming where the text goes, three starter cards when a slide is selected (Tailor
 * for a customer opens the deterministic dialog of section 5 and calls no model; Make it shorter
 * and Write speaker notes call `assist.propose`), a `role="log"` region of asks, cards and
 * sentences, and a composer at the bottom with Enter to send and Shift Enter for a new line. A
 * card is one proposal: the sentence in the seller's words, the before and after with the changed
 * words marked, Accept, Dismiss and Change the ask. Accept runs `assist.accept` through the
 * editor's dispatch, which commits one write labelled "Assist: <sentence>" (one undo step; the
 * controller's handler) and the snackbar reads the sentence with Undo. The frame follows the round
 * five branch's `panels/Chat.tsx`, read and rebuilt. A viewer sees the panel disabled with one
 * sentence; the kill switch's 503 turns the panel into its sentence.
 */
export type AssistPanelProps = {
  document: DeckDocument;
  slideId: string;
  revision: number;
  dispatch: EditorDispatch;
  /** the caller may write: editors; a commenter or a viewer reads the disabled sentence */
  canWrite: boolean;
  /** the deck's general access is restricted: the first line says so (6.3) */
  restricted?: boolean;
  /** the phrase Search the menus handed over ("Ask the assistant: <phrase>") */
  initialPrompt?: string;
  /** opens the Tailor dialog (the first starter card, no model call) */
  onTailor: () => void;
  /** the shell's snackbar with one action */
  say: (text: string, action?: SnackbarAction) => void;
  /** the editor's undo, for the snackbar's Undo after an accept */
  onUndo?: () => void;
  onClose: () => void;
};

type ProposeAnswer = { cards?: AssistCard[]; sentence?: string; readSlides?: number };

/** The status a 503 or a 429 carries in the dispatch error; the route's sentence rides its message. */
function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const { status } = error;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

export function AssistPanel({
  document,
  slideId,
  revision,
  dispatch,
  canWrite,
  restricted = false,
  initialPrompt,
  onTailor,
  say,
  onUndo,
  onClose,
}: AssistPanelProps) {
  const [entries, setEntries] = useState<PanelEntry[]>([]);
  const [draft, setDraft] = useState(initialPrompt ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState<string | null>(null);
  const cards = useRef(0);
  const log = useRef<HTMLUListElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialPrompt !== undefined && initialPrompt !== '') {
      setDraft(initialPrompt);
      box.current?.focus();
    }
  }, [initialPrompt]);

  useEffect(() => {
    const node = log.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [entries.length]);

  const order = slideOrder(document.deck);
  const slide = document.slides[slideId];
  const n = order.indexOf(slideId) + 1;

  const propose = (intent: AssistIntent, prompt: string) => {
    if (busy || slide === undefined) return;
    setBusy(true);
    setError(null);
    if (prompt !== '') setEntries((rows) => [...rows, { kind: 'ask', text: prompt }]);
    dispatch('assist.propose', { intent, prompt, slideIds: [slideId], baseRevision: revision })
      .then((answer) => {
        const result = (answer ?? {}) as ProposeAnswer;
        const made = result.cards ?? [];
        if (made.length === 0) {
          setEntries((rows) => [
            ...rows,
            { kind: 'sentence', text: result.sentence ?? ASSIST.failed('no answer') },
          ]);
          return;
        }
        setEntries((rows) => [
          ...rows,
          ...made.map((card) => {
            cards.current += 1;
            return { kind: 'card' as const, card, n: cards.current };
          }),
        ]);
      })
      .catch((err: unknown) => {
        const status = statusOf(err);
        const message = err instanceof Error ? err.message : String(err);
        if (status === 503) setOff(message);
        else setError(status === 429 ? message : ASSIST.failed(message));
      })
      .finally(() => setBusy(false));
  };

  const accept = (entry: Extract<PanelEntry, { kind: 'card' }>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    dispatch('assist.accept', { card: entry.card, baseRevision: revision })
      .then(() => {
        setEntries((rows) =>
          rows.map((row) =>
            row === entry ? { kind: 'accepted', text: entry.card.sentence } : row,
          ),
        );
        say(
          ASSIST.accepted(entry.card.sentence),
          onUndo === undefined ? undefined : { label: ASSIST.undo, run: onUndo },
        );
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setEntries((rows) =>
          rows.map((row) => (row === entry ? { kind: 'sentence', text: message } : row)),
        );
      })
      .finally(() => setBusy(false));
  };

  const dismiss = (entry: PanelEntry) => setEntries((rows) => rows.filter((row) => row !== entry));

  const changeAsk = (entry: PanelEntry) => {
    const ask = [...entries].reverse().find((row) => row.kind === 'ask');
    dismiss(entry);
    setDraft(ask === undefined ? '' : ask.text);
    box.current?.focus();
  };

  const submit = () => {
    const text = draft.trim();
    if (text === '' || busy) return;
    setDraft('');
    propose('ask', text);
  };

  const composerTip = tipProps({ name: ASSIST.prompt, doc: ASSIST.promptDoc, key: 'Enter' });

  if (!canWrite) {
    return (
      <Panel
        title={ASSIST.title}
        onClose={onClose}
        control="panel.assist"
        className="ts-assist-panel"
      >
        <p className="ts-assist-disabled" data-control="panel.assist.viewer">
          {ASSIST.viewer}
        </p>
      </Panel>
    );
  }
  if (off !== null) {
    return (
      <Panel
        title={ASSIST.title}
        onClose={onClose}
        control="panel.assist"
        className="ts-assist-panel"
      >
        <p className="ts-assist-disabled" data-control="panel.assist.off">
          {off}
        </p>
      </Panel>
    );
  }
  return (
    <Panel
      title={ASSIST.title}
      onClose={onClose}
      control="panel.assist"
      className="ts-assist-panel"
    >
      <div className="ts-assist">
        <p className="ts-assist-note" data-control="panel.assist.firstLine">
          {restricted
            ? ASSIST.firstLine.replace(
                'these suggestions',
                `these suggestions${ASSIST.firstLineRestricted}`,
              )
            : ASSIST.firstLine}
        </p>
        {slide === undefined ? (
          <p className="ts-assist-slide">{ASSIST.noSlide}</p>
        ) : (
          <>
            <p className="ts-assist-slide" data-control="panel.assist.slide">
              {ASSIST.slideLabel(n, slideTitle(slide, n))}
            </p>
            {entries.length === 0 ? (
              <ul className="ts-assist-starters" data-control="panel.assist.starters">
                <li>
                  <button
                    type="button"
                    className="ts-assist-starter"
                    data-control="panel.assist.starter.tailor"
                    onClick={onTailor}
                    {...tipProps({ name: ASSIST.starters.tailor, doc: ASSIST.starters.tailorDoc })}
                  >
                    <Icon name="sparkles" />
                    <span>
                      <b>{ASSIST.starters.tailor}</b>
                      <span>{ASSIST.starters.tailorDoc}</span>
                    </span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="ts-assist-starter"
                    data-control="panel.assist.starter.shorter"
                    disabled={busy}
                    onClick={() => propose('shorter', '')}
                    {...tipProps({
                      name: ASSIST.starters.shorter,
                      doc: ASSIST.starters.shorterDoc,
                    })}
                  >
                    <Icon name="sparkles" />
                    <span>
                      <b>{ASSIST.starters.shorter}</b>
                      <span>{ASSIST.starters.shorterDoc}</span>
                    </span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="ts-assist-starter"
                    data-control="panel.assist.starter.notes"
                    disabled={busy}
                    onClick={() => propose('notes', '')}
                    {...tipProps({ name: ASSIST.starters.notes, doc: ASSIST.starters.notesDoc })}
                  >
                    <Icon name="sparkles" />
                    <span>
                      <b>{ASSIST.starters.notes}</b>
                      <span>{ASSIST.starters.notesDoc}</span>
                    </span>
                  </button>
                </li>
              </ul>
            ) : null}
          </>
        )}
        <ul
          ref={log}
          className="ts-assist-log"
          role="log"
          aria-live="polite"
          aria-label={ASSIST.title}
          data-control="panel.assist.log"
        >
          {entries.map((entry, index) => {
            if (entry.kind === 'ask')
              return (
                <li key={`ask-${index}`} className="ts-assist-ask" data-control="panel.assist.ask">
                  {entry.text}
                </li>
              );
            if (entry.kind === 'sentence' || entry.kind === 'accepted')
              return (
                <li
                  key={`sentence-${index}`}
                  className={cn('ts-assist-sentence', entry.kind === 'accepted' && 'is-accepted')}
                  data-control={
                    entry.kind === 'accepted' ? 'panel.assist.accepted' : 'panel.assist.sentence'
                  }
                >
                  {entry.text}
                </li>
              );
            const { card } = entry;
            return (
              <li key={card.id} className="ts-assist-card" data-control={cardControl(entry.n)}>
                <p className="ts-assist-card-sentence">{card.sentence}</p>
                <ul className="ts-assist-card-rows">
                  {card.rows.map((row, rowIndex) => {
                    const texts = rowTexts(row);
                    const rowSlide = document.slides[row.slideId];
                    const rowN = order.indexOf(row.slideId) + 1;
                    return (
                      <li
                        key={`${row.slideId}-${row.blockId ?? ''}-${row.path}-${rowIndex}`}
                        className="ts-assist-row"
                        data-control={rowControl(entry.n, row.slideId)}
                      >
                        <p className="ts-assist-row-head">
                          {rowSlide === undefined
                            ? row.slideId
                            : ASSIST.slideLabel(rowN, slideTitle(rowSlide, rowN))}
                          {row.path === '/notes' ? ', speaker notes' : ''}
                        </p>
                        {texts.before !== '' ? (
                          <p className="ts-assist-text is-before" aria-label={ASSIST.before}>
                            {texts.before}
                          </p>
                        ) : null}
                        <p className="ts-assist-text is-after" aria-label={ASSIST.after}>
                          {markChangedWords(row.before, row.after).map((span, spanIndex) =>
                            span.changed ? (
                              <mark key={spanIndex} className="is-changed">
                                {span.text}
                              </mark>
                            ) : (
                              <span key={spanIndex}>{span.text}</span>
                            ),
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <div className="ts-assist-card-actions">
                  <button
                    type="button"
                    className="pt-ib is-solid"
                    data-control={cardControl(entry.n, 'accept')}
                    disabled={busy}
                    onClick={() => accept(entry)}
                    {...tipProps({ name: ASSIST.accept, doc: ASSIST.acceptDoc })}
                  >
                    <span className="pt-lb">{ASSIST.accept}</span>
                  </button>
                  <button
                    type="button"
                    className="pt-ib is-text"
                    data-control={cardControl(entry.n, 'dismiss')}
                    onClick={() => dismiss(entry)}
                    {...tipProps({ name: ASSIST.dismiss, doc: ASSIST.dismissDoc })}
                  >
                    <span className="pt-lb">{ASSIST.dismiss}</span>
                  </button>
                  <button
                    type="button"
                    className="pt-ib is-text"
                    data-control={cardControl(entry.n, 'change')}
                    onClick={() => changeAsk(entry)}
                    {...tipProps({ name: ASSIST.change, doc: ASSIST.changeDoc })}
                  >
                    <span className="pt-lb">{ASSIST.change}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {busy ? (
          <p className="ts-assist-busy" role="status" data-control="panel.assist.busy">
            {ASSIST.thinking}
          </p>
        ) : null}
        {error !== null ? (
          <p className="ts-assist-error" role="alert" data-control="panel.assist.error">
            {error}
          </p>
        ) : null}
        <div className="ts-assist-composer">
          <textarea
            ref={box}
            value={draft}
            rows={1}
            maxLength={2000}
            placeholder={ASSIST.prompt}
            aria-label={ASSIST.prompt}
            data-control="panel.assist.prompt"
            disabled={slide === undefined}
            {...composerTip}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
              composerTip.onKeyDown(event);
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
              event.stopPropagation();
            }}
          />
          <button
            type="button"
            className="pt-ib is-text"
            disabled={busy || draft.trim() === '' || slide === undefined}
            data-control="panel.assist.send"
            onClick={submit}
            {...tipProps({ name: ASSIST.send, doc: ASSIST.sendDoc, key: 'Enter' })}
          >
            <span className="pt-lb">{ASSIST.send}</span>
          </button>
        </div>
      </div>
    </Panel>
  );
}
