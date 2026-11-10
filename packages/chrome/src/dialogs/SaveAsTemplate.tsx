import { useState } from 'react';

import type { TemplateIndexEntry } from '@turboslide/schema/actions';
import { deckAppearance, slideOrder } from '@turboslide/schema/deck';
import { slugify } from '@turboslide/schema/ids';
import { LiveClone } from '@turboslide/viewer/LiveClone';

import { Dialog, DialogField } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { useMountEffect } from '../lib/useMountEffect';
import { tipProps } from '../Tooltip';

/**
 * File > Save as template (docs/archive/rounds/PRODUCT.md 4.3; audit-brand 13; judge-seller addition 4): a name
 * prefilled with the deck's title and selected, one sentence for the gallery card, the cover slide
 * as a live clone in the deck's appearance, Save and Cancel. One `template.create { deckId, name,
 * sentence, baseRevision }` writes decks/templates/<slug of the name> from the deck with its
 * slides, its assets and its brand kit and lists it under Your organisation on /decks/templates.
 * While the name matches an organisation template already saved (the slug rule the store
 * applies), the dialog reads "Replace the template <name>" and Save runs `template.update { id,
 * deckId, sentence, baseRevision }`, so the template keeps its slug and the gallery lists one card
 * with the new cover; a name that gives one of Turboslide's own ids cannot be saved. Replacing is
 * the template manager's (the deployment admin; `manage` of the `template.list` answer): for
 * anyone else a name an organisation template carries reads "pick another name" and Save is off,
 * the way one of Turboslide's own does. The list of templates comes from `template.list` when the
 * dialog opens. The strings live here until the integrator's merge moves them to
 * menus/strings.ts (build/b5b.md).
 */
export const SAVE_AS_TEMPLATE = {
  title: 'Save as template',
  name: 'Name',
  sentence: 'Sentence',
  sentenceHint:
    'One sentence the gallery card shows; "Saved from" and the presentation\u2019s title when empty',
  cover: 'Cover',
  coverDoc: 'The first slide, drawn on the gallery card',
  replace: (name: string) => `Replace the template ${name}`,
  replaceDoc:
    'A template of this name is saved already. Saving replaces its slides and keeps its place in the gallery',
  turboslide: (name: string) => `${name} is one of Turboslide's templates; pick another name`,
  /** the sentence the server answers too (the studio's template-manager.ts `templateNameTaken`) */
  taken: (name: string) => `${name} is one of your organisation's templates; pick another name`,
  save: 'Save',
  replaceSave: 'Replace',
  cancel: 'Cancel',
  saved: (name: string) => `Saved the template ${name}`,
  replaced: (name: string) => `Replaced the template ${name}`,
  openGallery: 'Open gallery',
} as const;

/** The gallery page the snackbar's action opens. */
const GALLERY_PATH = '/decks/templates';

type TemplateListAnswer = { templates?: TemplateIndexEntry[]; manage?: boolean };

/** What the dialog reads from `template.list`: the saved templates and whether the viewer may replace one. */
type TemplateList = { rows: ReadonlyArray<TemplateIndexEntry>; manage: boolean };

export function SaveAsTemplateDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const { deck } = input.document;
  const [name, setName] = useState(deck.title);
  const [sentence, setSentence] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* the templates saved on this deployment, for the replace sentence; null until the list answers */
  const [list, setList] = useState<TemplateList | null>(null);

  useMountEffect(() => {
    let alive = true;
    input
      .dispatch('template.list', {})
      .then((answer) => {
        if (!alive) return;
        const listed = answer as TemplateListAnswer | undefined;
        setList({
          rows: Array.isArray(listed?.templates) ? listed.templates : [],
          manage: listed?.manage === true,
        });
      })
      .catch(() => {
        if (alive) setList({ rows: [], manage: false });
      });
    return () => {
      alive = false;
    };
  });

  const trimmed = name.trim();
  const slug = slugify(trimmed);
  const match = list?.rows.find((row) => row.id === slug);
  /* the same slug rule the store applies: an organisation template of the name is replaced by the
     manager and refused for anyone else, one of Turboslide's is refused for everyone */
  const organisation = match !== undefined && match.organisation === true ? match : null;
  const replaces = list?.manage === true ? organisation : null;
  const taken = list?.manage === true ? null : organisation;
  const fixed = match !== undefined && match.organisation !== true ? match : null;
  const noId = trimmed !== '' && slug === '';

  const appearance = deckAppearance(deck);
  const firstId = slideOrder(deck)[0];
  const first = firstId === undefined ? undefined : input.document.slides[firstId];
  let coverHtml: string | null = null;
  if (first !== undefined && input.renderSlide !== undefined) {
    try {
      coverHtml = input.renderSlide(first, appearance);
    } catch {
      coverHtml = null;
    }
  }

  const run = () => {
    if (trimmed === '' || busy || fixed !== null || taken !== null || noId || list === null) return;
    setBusy(true);
    setError(null);
    const words = sentence.trim();
    const write =
      replaces !== null
        ? input.dispatch('template.update', {
            id: replaces.id,
            deckId: input.deckId,
            ...(words === '' ? {} : { sentence: words }),
            baseRevision: input.revision,
          })
        : input.dispatch('template.create', {
            deckId: input.deckId,
            name: trimmed,
            ...(words === '' ? {} : { sentence: words }),
            baseRevision: input.revision,
          });
    write
      .then((result) => {
        const answer = result as { name?: string; replaced?: boolean } | undefined;
        const saved = answer?.name ?? trimmed;
        shell.closeDialog();
        shell.say(
          answer?.replaced === true || replaces !== null
            ? SAVE_AS_TEMPLATE.replaced(saved)
            : SAVE_AS_TEMPLATE.saved(saved),
          {
            label: SAVE_AS_TEMPLATE.openGallery,
            run: () => {
              if (input.navigate) input.navigate(GALLERY_PATH, true);
              else window.open(GALLERY_PATH, '_blank', 'noopener');
            },
          },
        );
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setBusy(false));
  };

  const nameTip = tipProps({
    name: SAVE_AS_TEMPLATE.name,
    doc: 'The template name; its slug is the template id. Enter saves',
    key: 'Enter',
  });
  const disabled =
    busy || trimmed === '' || fixed !== null || taken !== null || noId || list === null;

  return (
    <Dialog
      title={SAVE_AS_TEMPLATE.title}
      lead={`${slideOrder(deck).length} slide${slideOrder(deck).length === 1 ? '' : 's'} from ${deck.title}`}
      onClose={shell.closeDialog}
      control="dialog.saveAsTemplate"
      cancel
      cancelLabel={SAVE_AS_TEMPLATE.cancel}
      actions={[
        {
          label: replaces !== null ? SAVE_AS_TEMPLATE.replaceSave : SAVE_AS_TEMPLATE.save,
          primary: true,
          disabled,
          onClick: run,
          control: 'dialog.saveAsTemplate.save',
          doc:
            replaces !== null
              ? 'Replaces the template of this name with this presentation'
              : 'Saves this presentation as a template of your organisation',
        },
      ]}
    >
      <DialogField label={SAVE_AS_TEMPLATE.name}>
        <input
          type="text"
          value={name}
          autoFocus
          aria-label={SAVE_AS_TEMPLATE.name}
          data-control="dialog.saveAsTemplate.name"
          autoComplete="off"
          maxLength={120}
          {...nameTip}
          onFocus={(event) => {
            nameTip.onFocus(event);
            event.currentTarget.select();
          }}
          onChange={(event) => setName(event.target.value)}
        />
      </DialogField>
      {replaces !== null ? (
        <p
          className="ts-dialog-sentence"
          role="status"
          data-control="dialog.saveAsTemplate.replaceSentence"
        >
          {SAVE_AS_TEMPLATE.replace(replaces.name)}. {SAVE_AS_TEMPLATE.replaceDoc}.
        </p>
      ) : null}
      {fixed !== null ? (
        <p
          className="ts-dialog-error"
          role="alert"
          data-control="dialog.saveAsTemplate.fixedSentence"
        >
          {SAVE_AS_TEMPLATE.turboslide(fixed.name)}
        </p>
      ) : null}
      {taken !== null ? (
        <p
          className="ts-dialog-error"
          role="alert"
          data-control="dialog.saveAsTemplate.takenSentence"
        >
          {SAVE_AS_TEMPLATE.taken(taken.name)}
        </p>
      ) : null}
      {noId ? (
        <p className="ts-dialog-error" role="alert">
          Use letters or digits in the name
        </p>
      ) : null}
      <DialogField label={SAVE_AS_TEMPLATE.sentence} hint={SAVE_AS_TEMPLATE.sentenceHint}>
        <input
          type="text"
          value={sentence}
          aria-label={SAVE_AS_TEMPLATE.sentence}
          data-control="dialog.saveAsTemplate.sentence"
          autoComplete="off"
          maxLength={400}
          onChange={(event) => setSentence(event.target.value)}
          {...tipProps({ name: SAVE_AS_TEMPLATE.sentence, doc: SAVE_AS_TEMPLATE.sentenceHint })}
        />
      </DialogField>
      <div
        className="ts-dialog-slides pt-scroll"
        data-control="dialog.saveAsTemplate.cover"
        {...tipProps({ name: SAVE_AS_TEMPLATE.cover, doc: SAVE_AS_TEMPLATE.coverDoc })}
      >
        <div className="ts-dialog-slide" aria-hidden="true">
          <span className="ts-dialog-slide-frame" data-theme={appearance}>
            {coverHtml === null ? (
              <span>{SAVE_AS_TEMPLATE.cover}</span>
            ) : (
              <LiveClone html={coverHtml} theme={appearance} frame={false} />
            )}
          </span>
          <span className="ts-dialog-slide-title">{SAVE_AS_TEMPLATE.cover}</span>
        </div>
      </div>
      {error !== null ? (
        <p className="ts-dialog-error" role="alert" data-control="dialog.saveAsTemplate.error">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
