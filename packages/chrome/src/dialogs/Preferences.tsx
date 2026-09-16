import { useState } from 'react';

import type { Preferences, Substitution } from '@turboslide/schema/preferences';
import { AUTOFIT_PREFERENCES, SVG_TEXT_MODES } from '@turboslide/schema/preferences';

import { Dialog, DialogCheck, DialogRadio, DialogTabs } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { UNIT_OPTIONS, preferencesOf, writePreference } from '../text-tools';
import { tipProps } from '../Tooltip';

import './text-tools-dialogs.css';

/**
 * Tools > Preferences (gslides-parity SPEC-5 7.1, 0.34; R10 1.2, 2.3; P1 5.5): Google's two tab
 * dialog over the caller's preferences record. General: the five autocorrect checkboxes
 * (Automatically capitalize words, Automatically correct spelling, Automatically detect links,
 * Automatically detect lists, Use smart quotes), Use custom autofit preferences with Google's
 * three labels, Use measurement unit preferences with Inches, Centimeters and Pixels, and the
 * Turboslide row SVG text. Substitutions: the master checkbox Automatic substitution, the Replace
 * and With table with a checkbox and Remove per row, the empty first row adding a pair on Enter.
 * Every change is one `prefs.set` through the dispatcher (the record and the mirror), and the
 * dialog re-renders on the answered record; a removed default row joins `removedDefaults` on the
 * write path (preferences.ts), so it never comes back. The checkbox set is unverified against
 * Google's Slides dialog (R10 13) and the labels carry the sentence case of the copy rules.
 */
export const PREFERENCES_STRINGS = {
  title: 'Preferences',
  general: 'General',
  substitutions: 'Substitutions',
  capitalize: 'Automatically capitalize words',
  spelling: 'Automatically correct spelling',
  links: 'Automatically detect links',
  lists: 'Automatically detect lists',
  quotes: 'Use smart quotes',
  autofit: 'Use custom autofit preferences',
  autofitNone: 'Do not autofit',
  autofitShrink: 'Shrink text on overflow',
  autofitGrow: 'Resize shape to fit text',
  placeholder: 'Placeholders',
  textBox: 'Text boxes',
  units: 'Use measurement unit preferences',
  svgText: 'SVG text',
  svgEmbed: 'Embed the font',
  svgOutline: 'Outline the text',
  svgLink: 'Link the font',
  automatic: 'Automatic substitution',
  replace: 'Replace',
  with: 'With',
  remove: 'Remove',
  add: 'Add',
  done: 'Done',
} as const;

const AUTOFIT_LABELS: Record<Preferences['autofit']['textBox'], string> = {
  none: PREFERENCES_STRINGS.autofitNone,
  shrink: PREFERENCES_STRINGS.autofitShrink,
  grow: PREFERENCES_STRINGS.autofitGrow,
};

const SVG_LABELS: Record<Preferences['svgText'], string> = {
  embed: PREFERENCES_STRINGS.svgEmbed,
  outline: PREFERENCES_STRINGS.svgOutline,
  link: PREFERENCES_STRINGS.svgLink,
};

type Tab = 'general' | 'substitutions';

export function PreferencesDialog({ tab: initialTab = 'general' }: { tab?: Tab }) {
  const shell = useEditorShell();
  const { input } = shell;
  const [prefs, setPrefs] = useState<Preferences>(() => preferencesOf(input));
  const [tab, setTab] = useState<Tab>(initialTab);
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [error, setError] = useState<string | null>(null);

  const write = (path: string, value?: unknown) => {
    setError(null);
    writePreference(input, path, value)
      .then(setPrefs)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const check = (path: string, label: string, checked: boolean, control: string, doc: string) => (
    <DialogCheck
      label={label}
      checked={checked}
      control={control}
      doc={doc}
      onChange={(on) => write(path, on)}
    />
  );

  const addRow = () => {
    const from = draft.from.trim();
    const to = draft.to;
    if (from === '' || to === '') return;
    const row: Substitution = { from, to, on: true };
    setDraft({ from: '', to: '' });
    write('/substitutions/rows/-', row);
  };

  const general = (
    <div className="ts-tt-general">
      <div className="ts-tt-section">
        {check(
          '/autocorrect/capitalize',
          PREFERENCES_STRINGS.capitalize,
          prefs.autocorrect.capitalize,
          'dialog.preferences.capitalize',
          'The first word of a sentence takes a capital letter as you type',
        )}
        {check(
          '/autocorrect/spelling',
          PREFERENCES_STRINGS.spelling,
          prefs.autocorrect.spelling,
          'dialog.preferences.spelling',
          'Common misspellings are corrected as you type',
        )}
        {check(
          '/autocorrect/links',
          PREFERENCES_STRINGS.links,
          prefs.autocorrect.links,
          'dialog.preferences.links',
          'A typed address becomes a link',
        )}
        {check(
          '/autocorrect/lists',
          PREFERENCES_STRINGS.lists,
          prefs.autocorrect.lists,
          'dialog.preferences.lists',
          'A dash, an asterisk or a numeral then a space starts a list',
        )}
        {check(
          '/autocorrect/quotes',
          PREFERENCES_STRINGS.quotes,
          prefs.autocorrect.quotes,
          'dialog.preferences.quotes',
          'Straight quotes become the language’s quotes',
        )}
      </div>
      <div className="ts-tt-section" role="group" aria-label={PREFERENCES_STRINGS.autofit}>
        <p className="ts-tt-heading">{PREFERENCES_STRINGS.autofit}</p>
        <div className="ts-tt-row">
          <span className="ts-tt-label ts-tt-grow">{PREFERENCES_STRINGS.placeholder}</span>
          <select
            className="ts-tt-field"
            value={prefs.autofit.placeholder}
            aria-label={`${PREFERENCES_STRINGS.autofit}: ${PREFERENCES_STRINGS.placeholder}`}
            data-control="dialog.preferences.autofit.placeholder"
            {...tipProps({
              name: PREFERENCES_STRINGS.placeholder,
              doc: 'What a new placeholder does when its text overflows',
            })}
            onChange={(event) => write('/autofit/placeholder', event.target.value)}
          >
            {AUTOFIT_PREFERENCES.map((value) => (
              <option key={value} value={value}>
                {AUTOFIT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="ts-tt-row">
          <span className="ts-tt-label ts-tt-grow">{PREFERENCES_STRINGS.textBox}</span>
          <select
            className="ts-tt-field"
            value={prefs.autofit.textBox}
            aria-label={`${PREFERENCES_STRINGS.autofit}: ${PREFERENCES_STRINGS.textBox}`}
            data-control="dialog.preferences.autofit.textBox"
            {...tipProps({
              name: PREFERENCES_STRINGS.textBox,
              doc: 'What a new text box does when its text overflows',
            })}
            onChange={(event) => write('/autofit/textBox', event.target.value)}
          >
            {AUTOFIT_PREFERENCES.map((value) => (
              <option key={value} value={value}>
                {AUTOFIT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="ts-tt-section" role="group" aria-label={PREFERENCES_STRINGS.units}>
        <p className="ts-tt-heading">{PREFERENCES_STRINGS.units}</p>
        <DialogRadio
          name="units"
          options={UNIT_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            doc: 'The rulers, the readouts and the Position fields read this unit',
          }))}
          value={prefs.units}
          control="dialog.preferences.units"
          onChange={(value) => write('/units', value)}
        />
      </div>
      <div className="ts-tt-section" role="group" aria-label={PREFERENCES_STRINGS.svgText}>
        <p className="ts-tt-heading">{PREFERENCES_STRINGS.svgText}</p>
        <DialogRadio
          name="svgText"
          options={SVG_TEXT_MODES.map((value) => ({
            value,
            label: SVG_LABELS[value],
            doc: 'How an SVG download carries its text',
          }))}
          value={prefs.svgText}
          control="dialog.preferences.svgText"
          onChange={(value) => write('/svgText', value)}
        />
        <p className="ts-tt-note">Turboslide only: Google Slides has no SVG download.</p>
      </div>
    </div>
  );

  const substitutions = (
    <div className="ts-tt-substitutions">
      <div className="ts-tt-section">
        <DialogCheck
          label={PREFERENCES_STRINGS.automatic}
          checked={prefs.substitutions.on}
          control="dialog.preferences.substitutions.on"
          doc="Turns every substitution row on or off"
          onChange={(on) => write('/substitutions/on', on)}
        />
      </div>
      <div
        className="ts-tt-table"
        role="table"
        aria-label={PREFERENCES_STRINGS.substitutions}
        data-control="dialog.preferences.substitutions.table"
      >
        <span className="ts-tt-head" role="columnheader" aria-label="On" />
        <span className="ts-tt-head" role="columnheader">
          {PREFERENCES_STRINGS.replace}
        </span>
        <span className="ts-tt-head" role="columnheader">
          {PREFERENCES_STRINGS.with}
        </span>
        <span className="ts-tt-head" role="columnheader" aria-label="Remove" />
        <span role="cell" />
        <span role="cell">
          <input
            type="text"
            value={draft.from}
            placeholder={PREFERENCES_STRINGS.replace}
            aria-label={`${PREFERENCES_STRINGS.replace}, a new row`}
            data-control="dialog.preferences.substitutions.from"
            autoComplete="off"
            spellCheck={false}
            {...tipProps({
              name: PREFERENCES_STRINGS.replace,
              doc: 'The typed token the row replaces; Enter adds the pair',
            })}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addRow();
              }
            }}
          />
        </span>
        <span role="cell">
          <input
            type="text"
            value={draft.to}
            placeholder={PREFERENCES_STRINGS.with}
            aria-label={`${PREFERENCES_STRINGS.with}, a new row`}
            data-control="dialog.preferences.substitutions.to"
            autoComplete="off"
            spellCheck={false}
            {...tipProps({
              name: PREFERENCES_STRINGS.with,
              doc: 'What the token becomes; Enter adds the pair',
            })}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addRow();
              }
            }}
          />
        </span>
        <span role="cell">
          <button
            type="button"
            className="ts-tt-small"
            disabled={draft.from.trim() === '' || draft.to === ''}
            data-control="dialog.preferences.substitutions.add"
            {...tipProps({
              name: PREFERENCES_STRINGS.add,
              doc: 'Adds the pair to the table',
              key: 'Enter',
            })}
            onClick={addRow}
          >
            {PREFERENCES_STRINGS.add}
          </button>
        </span>
        {prefs.substitutions.rows.map((row, index) => (
          <RowCells
            key={`${row.from}:${index}`}
            row={row}
            index={index}
            disabled={!prefs.substitutions.on}
            write={write}
          />
        ))}
      </div>
    </div>
  );

  return (
    <Dialog
      title={PREFERENCES_STRINGS.title}
      onClose={shell.closeDialog}
      width={520}
      control="dialog.preferences"
      className="ts-preferences"
      actions={[
        {
          label: PREFERENCES_STRINGS.done,
          primary: true,
          onClick: shell.closeDialog,
          control: 'dialog.preferences.done',
          doc: 'Closes the dialog; every change is already saved',
        },
      ]}
    >
      <DialogTabs
        tabs={[
          { value: 'general' as const, label: PREFERENCES_STRINGS.general },
          { value: 'substitutions' as const, label: PREFERENCES_STRINGS.substitutions },
        ]}
        value={tab}
        control="dialog.preferences.tab"
        onChange={setTab}
      />
      <div role="tabpanel" data-control={`dialog.preferences.${tab}`}>
        {tab === 'general' ? general : substitutions}
      </div>
      {error !== null ? (
        <p className="ts-tt-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

function RowCells({
  row,
  index,
  disabled,
  write,
}: {
  row: Substitution;
  index: number;
  disabled: boolean;
  write: (path: string, value?: unknown) => void;
}) {
  const label = `${row.from} to ${row.to}`;
  return (
    <>
      <span role="cell">
        <input
          type="checkbox"
          checked={row.on}
          disabled={disabled}
          aria-label={`${label}, on`}
          data-control={`dialog.preferences.substitutions.${index}.on`}
          {...tipProps({ name: label, doc: 'Turns this row on or off' })}
          onChange={(event) => write(`/substitutions/rows/${index}/on`, event.target.checked)}
        />
      </span>
      <span role="cell" data-control={`dialog.preferences.substitutions.${index}.from`}>
        {row.from}
      </span>
      <span role="cell" data-control={`dialog.preferences.substitutions.${index}.to`}>
        {row.to}
      </span>
      <span role="cell">
        <button
          type="button"
          className="ts-tt-remove"
          data-control={`dialog.preferences.substitutions.${index}.remove`}
          {...tipProps({
            name: PREFERENCES_STRINGS.remove,
            doc: `Removes the row ${label}; a default row stays removed`,
          })}
          onClick={() => write(`/substitutions/rows/${index}`)}
        >
          {PREFERENCES_STRINGS.remove}
        </button>
      </span>
    </>
  );
}
