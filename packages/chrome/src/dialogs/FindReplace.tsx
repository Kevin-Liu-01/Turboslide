import { useMemo, useState } from 'react';

import type { DeckDocument } from '@turboslide/schema/deck';
import { slideBlocks, slideOrder } from '@turboslide/schema/deck';
import { plainText } from '@turboslide/schema/text';

import { Dialog, DialogCheck, DialogField } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';
import { tipProps } from '../Tooltip';

/**
 * Edit > Find and replace (gslides-parity SPEC 2.2, 12 "Dialogs"; Cmd+Shift+H): Find, Replace
 * with, Match case, Prev, Next, Replace, Replace all. The matches are counted over every visible
 * text of the deck; Prev and Next step through the slides that carry one (view.goto); Replace
 * runs `text.replaceAll` on the current slide alone, Replace all over the deck, each one write.
 */

/** The texts a slide shows, as plain strings: block texts, the title slide's fields, the notes. */
export function slideStrings(document: DeckDocument, slideId: string): string[] {
  const slide = document.slides[slideId];
  if (slide === undefined) return [];
  const out: string[] = [];
  if (slide.kind === 'title') out.push(slide.heading, slide.lead);
  if (slide.kind === 'statement') out.push(slide.big);
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      out.push(plainText(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, each] of Object.entries(value as Record<string, unknown>)) {
        if (
          key === 'id' ||
          key === 'type' ||
          key === 'asset' ||
          key === 'assets' ||
          key === 'pos' ||
          key === 'ext' ||
          key === 'link' ||
          key === 'name'
        )
          continue;
        walk(each);
      }
    }
  };
  for (const { block } of slideBlocks(slide)) walk(block);
  if (slide.notes !== undefined) out.push(slide.notes);
  return out;
}

/** How many times `find` occurs in the slide's texts. */
export function countMatches(
  strings: ReadonlyArray<string>,
  find: string,
  matchCase: boolean,
): number {
  if (find === '') return 0;
  const needle = matchCase ? find : find.toLowerCase();
  let count = 0;
  for (const text of strings) {
    const hay = matchCase ? text : text.toLowerCase();
    let at = hay.indexOf(needle);
    while (at >= 0) {
      count += 1;
      at = hay.indexOf(needle, at + needle.length);
    }
  }
  return count;
}

export function FindReplaceDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const order = useMemo(() => slideOrder(input.document.deck), [input.document]);
  const counts = useMemo(
    () =>
      order.map((id) => ({
        id,
        count: countMatches(slideStrings(input.document, id), find, matchCase),
      })),
    [order, input.document, find, matchCase],
  );
  const total = counts.reduce((sum, row) => sum + row.count, 0);
  const withMatches = counts.filter((row) => row.count > 0).map((row) => row.id);
  const at = withMatches.indexOf(input.slideId);

  const go = (delta: 1 | -1) => {
    if (withMatches.length === 0) return;
    const next =
      at < 0
        ? delta > 0
          ? 0
          : withMatches.length - 1
        : (at + delta + withMatches.length) % withMatches.length;
    const target = withMatches[next];
    if (target !== undefined) void input.dispatch('view.goto', { slideId: target });
  };

  const run = (slideIds?: string[]) => {
    if (find === '') return;
    setError(null);
    input
      .dispatch('text.replaceAll', {
        find,
        replace,
        ...(matchCase ? { matchCase: true } : {}),
        ...(slideIds === undefined ? {} : { slideIds }),
        baseRevision: input.revision,
      })
      .then((result) => {
        const n = (result as { replacements?: number }).replacements ?? 0;
        setDone(`Replaced ${n} occurrence${n === 1 ? '' : 's'}`);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const findTip = tipProps({ name: DIALOGS.findReplace.find, doc: 'The words to look for' });
  const replaceTip = tipProps({
    name: DIALOGS.findReplace.replaceWith,
    doc: 'The words that take their place',
  });
  return (
    <Dialog
      title={DIALOGS.findReplace.title}
      onClose={shell.closeDialog}
      width={480}
      control="dialog.findReplace"
      actions={[
        {
          label: DIALOGS.findReplace.prev,
          onClick: () => go(-1),
          disabled: withMatches.length === 0,
          control: 'dialog.findReplace.prev',
          doc: 'The previous slide with a match',
        },
        {
          label: DIALOGS.findReplace.next,
          onClick: () => go(1),
          disabled: withMatches.length === 0,
          control: 'dialog.findReplace.next',
          doc: 'The next slide with a match',
        },
        {
          label: DIALOGS.findReplace.replace,
          onClick: () => run([input.slideId]),
          disabled:
            find === '' || (counts.find((row) => row.id === input.slideId)?.count ?? 0) === 0,
          control: 'dialog.findReplace.replace',
          doc: 'Replaces the matches on this slide',
        },
        {
          label: DIALOGS.findReplace.replaceAll,
          primary: true,
          onClick: () => run(),
          disabled: total === 0,
          control: 'dialog.findReplace.replaceAll',
          doc: 'Replaces every match in the presentation and the notes',
        },
      ]}
    >
      <DialogField
        label={DIALOGS.findReplace.find}
        hint={
          find === ''
            ? undefined
            : `${total} match${total === 1 ? '' : 'es'} on ${withMatches.length} slide${withMatches.length === 1 ? '' : 's'}`
        }
      >
        <input
          type="text"
          value={find}
          autoFocus
          aria-label={DIALOGS.findReplace.find}
          data-control="dialog.findReplace.find"
          autoComplete="off"
          {...findTip}
          onChange={(event) => {
            setFind(event.target.value);
            setDone(null);
          }}
        />
      </DialogField>
      <DialogField label={DIALOGS.findReplace.replaceWith}>
        <input
          type="text"
          value={replace}
          aria-label={DIALOGS.findReplace.replaceWith}
          data-control="dialog.findReplace.replace"
          autoComplete="off"
          {...replaceTip}
          onChange={(event) => setReplace(event.target.value)}
        />
      </DialogField>
      <DialogCheck
        label={DIALOGS.findReplace.matchCase}
        checked={matchCase}
        onChange={setMatchCase}
        control="dialog.findReplace.matchCase"
        doc="Upper and lower case count as different letters"
      />
      {done !== null ? (
        <p role="status" data-control="dialog.findReplace.result">
          {done}
        </p>
      ) : null}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
