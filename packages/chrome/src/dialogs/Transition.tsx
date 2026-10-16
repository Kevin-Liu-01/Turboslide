import { useState } from 'react';

import { DIRECTIONS, TRANSITION_NAMES, slideTransition } from '@turboslide/schema/motion-core';
import type { Direction, Transition, TransitionName } from '@turboslide/schema/motion-core';
import type { Mutation } from '@turboslide/schema/mutations';

import { Dialog, DialogField } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS, MOTION } from '../menus/strings';
import { Select } from '../Select';

/**
 * Slide > Transition (HTML-SLIDES-DESIGN 2.5), built like Slide numbers and Playback: the
 * transition, its duration and, for the three that travel, the side it comes from. Apply to all
 * writes the presentation's `defaults.transition` and takes every slide's own away, so every slide
 * follows it; Apply to selected writes `transition` on each selected slide. Each is one commit, so
 * Cmd+Z takes it back in one step. Standard removes the field: the show's quick fade and rise.
 */

/** The transitions that come in from a side (packages/render/src/motion.ts `transitionKeyframes`). */
const TRAVELS: ReadonlySet<TransitionName> = new Set(['slide-fade', 'rise-fade', 'blur-swipe']);
/** A new pick's length when the slide had none. */
const DEFAULT_MS = 400;
const MAX_SECONDS = 3;

type Choice = TransitionName | 'standard';

export function TransitionDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const { deck, slides } = input.document;
  const slide = slides[input.slideId];
  const current =
    slide === undefined ? deck.defaults?.transition : slideTransition(deck.defaults, slide);
  const [choice, setChoice] = useState<Choice>(current?.name ?? 'standard');
  const [seconds, setSeconds] = useState(String((current?.durationMs ?? DEFAULT_MS) / 1000));
  const [from, setFrom] = useState<Direction | 'default'>(current?.from ?? 'default');
  const [error, setError] = useState<string | null>(null);
  const selected = input.selectedSlideIds ?? [input.slideId];
  const words = DIALOGS.transition;
  const timed = choice !== 'standard' && choice !== 'none';

  /** The field the choice writes, undefined for Standard; null when the duration is out of range. */
  const transition = (): Transition | undefined | null => {
    if (choice === 'standard') return undefined;
    if (choice === 'none') return { name: 'none', durationMs: 0 };
    const value = Number(seconds);
    if (seconds.trim() === '' || !Number.isFinite(value) || value < 0 || value > MAX_SECONDS)
      return null;
    return {
      name: choice,
      durationMs: Math.round(value * 1000),
      ...(TRAVELS.has(choice) && from !== 'default' ? { from } : {}),
    };
  };

  const write = (build: (value: Transition | undefined) => Mutation[]) => {
    const value = transition();
    if (value === null) {
      setError(words.durationRange);
      return;
    }
    if (input.commit === undefined) {
      setError('Transitions cannot be changed here');
      return;
    }
    input
      .commit(build(value), 'Transition')
      .then(() => shell.closeDialog())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const apply = () =>
    write((value) => [
      { op: 'deck.set', path: '/defaults/transition', ...(value === undefined ? {} : { value }) },
      ...Object.values(slides)
        .filter((each) => each.transition !== undefined)
        .map((each): Mutation => ({ op: 'slide.set', slideId: each.id, path: '/transition' })),
    ]);

  const applyToSelected = () =>
    write((value) =>
      selected.map((slideId): Mutation => ({
        op: 'slide.set',
        slideId,
        path: '/transition',
        ...(value === undefined ? {} : { value }),
      })),
    );

  return (
    <Dialog
      title={words.title}
      onClose={shell.closeDialog}
      width={400}
      control="dialog.transition"
      cancel
      actions={[
        {
          label: words.applyToSelected,
          onClick: applyToSelected,
          control: 'dialog.transition.selected',
          doc:
            selected.length === 1
              ? 'Sets the selected slide alone'
              : `Sets the ${selected.length} selected slides alone`,
        },
        {
          label: words.apply,
          primary: true,
          onClick: apply,
          control: 'dialog.transition.apply',
          doc: 'Sets every slide of the presentation',
        },
      ]}
    >
      <DialogField label={words.transition}>
        <Select<Choice>
          value={choice}
          options={[
            { value: 'standard', label: MOTION.standard.label, description: MOTION.standard.doc },
            ...TRANSITION_NAMES.map((name) => ({
              value: name,
              label: MOTION.transitions[name].label,
              description: MOTION.transitions[name].doc,
            })),
          ]}
          label={words.transition}
          control="dialog.transition.name"
          onChange={(value) => {
            setChoice(value);
            setError(null);
          }}
          tip={{ name: words.transition, doc: 'How the slide comes in during the show' }}
        />
      </DialogField>
      {timed ? (
        <DialogField label={words.duration} doc="From 0 to 3 seconds">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            max={MAX_SECONDS}
            value={seconds}
            aria-label={words.duration}
            data-control="dialog.transition.duration"
            onChange={(event) => {
              setSeconds(event.target.value);
              setError(null);
            }}
          />
        </DialogField>
      ) : null}
      {timed && TRAVELS.has(choice) ? (
        <DialogField label={words.from}>
          <Select<Direction | 'default'>
            value={from}
            options={[
              { value: 'default', label: 'Default' },
              ...DIRECTIONS.map((side) => ({ value: side, label: MOTION.directions[side] })),
            ]}
            label={words.from}
            control="dialog.transition.from"
            onChange={setFrom}
            tip={{ name: words.from, doc: 'The side the slide comes in from' }}
          />
        </DialogField>
      ) : null}
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
