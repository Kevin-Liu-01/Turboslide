import { useState } from 'react';

import { slidePlay } from '@turboslide/schema/deck';
import type { PlayMode } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';

import { Dialog, DialogRadio } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { DIALOGS } from '../menus/strings';

/**
 * Slide > Playback (the shader design 3.1, named for every live block as the HTML slides design
 * 2.2 names the fields): whether the shaders and other live blocks move in the show and the
 * viewer, or hold their stills. Built like Slide numbers: two radios, then Apply, which writes the
 * presentation's `defaults.play` and takes every slide's own word away, so every slide follows it,
 * and Apply to selected, which writes `play` on each selected slide. Each is one commit, so Cmd+Z
 * takes it back in one step. A viewer's Reduce motion and Play animated patterns Off still hold
 * for that viewer (packages/viewer/src/live-plan.ts).
 */
export function PlaybackDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const { deck, slides } = input.document;
  const [play, setPlay] = useState<PlayMode>(() => slidePlay(deck, slides[input.slideId]));
  const [error, setError] = useState<string | null>(null);
  const selected = input.selectedSlideIds ?? [input.slideId];

  const write = (mutations: Mutation[], label: string) => {
    if (input.commit === undefined) {
      setError('Playback cannot be changed here');
      return;
    }
    input
      .commit(mutations, label)
      .then(() => shell.closeDialog())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const apply = () =>
    write(
      [
        { op: 'deck.set', path: '/defaults/play', value: play },
        ...Object.values(slides)
          .filter((slide) => slide.play !== undefined)
          .map((slide): Mutation => ({ op: 'slide.set', slideId: slide.id, path: '/play' })),
      ],
      'Playback',
    );

  const applyToSelected = () =>
    write(
      selected.map((slideId) => ({ op: 'slide.set', slideId, path: '/play', value: play })),
      'Playback',
    );

  return (
    <Dialog
      title={DIALOGS.playback.title}
      onClose={shell.closeDialog}
      width={400}
      control="dialog.playback"
      cancel
      actions={[
        {
          label: DIALOGS.playback.applyToSelected,
          onClick: applyToSelected,
          control: 'dialog.playback.selected',
          doc:
            selected.length === 1
              ? 'Sets the selected slide alone'
              : `Sets the ${selected.length} selected slides alone`,
        },
        {
          label: DIALOGS.playback.apply,
          primary: true,
          onClick: apply,
          control: 'dialog.playback.apply',
          doc: 'Sets every slide of the presentation',
        },
      ]}
    >
      <DialogRadio
        name="Playback"
        value={play}
        onChange={setPlay}
        control="dialog.playback"
        options={[
          {
            value: 'play',
            label: DIALOGS.playback.play,
            doc: 'Shaders and other live content move in the show and the viewer',
          },
          {
            value: 'hold',
            label: DIALOGS.playback.hold,
            doc: 'Shaders and other live content show their still frame',
          },
        ]}
      />
      <p className="ts-dialog-hint">{DIALOGS.playback.note}</p>
      {error !== null ? (
        <p className="ts-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
