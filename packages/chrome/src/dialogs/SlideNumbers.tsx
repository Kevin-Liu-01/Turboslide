import { useState } from 'react';

import { contentSlideSchema, deckCounter } from '@turboslide/schema/deck';
import type { CounterMode } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';

import { Dialog, DialogCheck, DialogRadio } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';

/**
 * Insert > Slide numbers (gslides-parity SPEC 2.4, 7.2.4, 12 "Dialogs"; docs/RETURN.md section 5
 * `slides.numbers.apply`, research 07 "Number slides"): Google's dialog, On or Off, a Skip title
 * slides check under On, Apply for the whole presentation and Apply to selected for the selected
 * slides alone. Apply is one `deck.set /defaults/counter` (on, off or skip-title) and Apply to
 * selected one `slide.set /counter` per selected slide (on or off; the deck's mode stands for the
 * others), each through the editor's commit as one history entry, so Cmd+Z takes the numbers
 * back in one step. The per slide field is the return round's request to the schema and the
 * renderer (docs/gslides-parity/return/build/b5.md request 5); the Apply to selected button is
 * drawn only once the slide schema carries `counter` (`SLIDE_COUNTER_FIELD`), because a write the
 * schema refuses sat in the save queue and held every later save ("Couldn't save, retrying",
 * measured on the checkout, b5.md section 7).
 */
/** True once the slide schema accepts `/counter` (request 5 landed); read from the schema, never assumed. */
const SLIDE_COUNTER_FIELD = 'counter' in contentSlideSchema.shape;
type Numbering = 'on' | 'off';

function modeOf(numbering: Numbering, skipTitles: boolean): CounterMode {
  if (numbering === 'off') return 'off';
  return skipTitles ? 'skip-title' : 'on';
}

export function SlideNumbersDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const current = deckCounter(input.document.deck);
  const [numbering, setNumbering] = useState<Numbering>(current === 'off' ? 'off' : 'on');
  const [skipTitles, setSkipTitles] = useState(current === 'skip-title');
  const [error, setError] = useState<string | null>(null);
  const selected = input.selectedSlideIds ?? [input.slideId];

  const write = (mutations: Mutation[], label: string) => {
    if (input.commit === undefined) {
      setError('Slide numbers cannot be changed here yet');
      return;
    }
    input
      .commit(mutations, label)
      .then(() => shell.closeDialog())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const apply = () =>
    write(
      [{ op: 'deck.set', path: '/defaults/counter', value: modeOf(numbering, skipTitles) }],
      'Slide numbers',
    );

  const applyToSelected = () =>
    write(
      selected.map((slideId) => ({
        op: 'slide.set',
        slideId,
        path: '/counter',
        value: numbering,
      })),
      selected.length === 1 ? 'Slide number' : 'Slide numbers',
    );

  return (
    <Dialog
      title={DIALOGS.slideNumbers.title}
      onClose={shell.closeDialog}
      width={400}
      control="dialog.slideNumbers"
      cancel
      actions={[
        ...(SLIDE_COUNTER_FIELD
          ? [
              {
                label: DIALOGS.slideNumbers.applyToSelected,
                onClick: applyToSelected,
                control: 'dialog.slideNumbers.selected',
                doc:
                  selected.length === 1
                    ? 'Numbers the selected slide alone, or takes its number away'
                    : `Numbers the ${selected.length} selected slides alone, or takes their numbers away`,
              },
            ]
          : []),
        {
          label: DIALOGS.slideNumbers.apply,
          primary: true,
          onClick: apply,
          control: 'dialog.slideNumbers.apply',
          doc: 'Writes the choice to every slide of the presentation',
        },
      ]}
    >
      <DialogRadio
        name="Slide numbers"
        value={numbering}
        onChange={setNumbering}
        control="dialog.slideNumbers"
        options={[
          {
            value: 'on',
            label: DIALOGS.slideNumbers.on,
            doc: 'The number in the frame of every slide',
          },
          { value: 'off', label: DIALOGS.slideNumbers.off, doc: 'No numbers' },
        ]}
      />
      <DialogCheck
        label={DIALOGS.slideNumbers.skipTitles}
        checked={numbering === 'on' && skipTitles}
        onChange={setSkipTitles}
        control="dialog.slideNumbers.skip-title"
        doc="Numbers every slide but the title slides"
        disabled={numbering === 'off'}
      />
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
