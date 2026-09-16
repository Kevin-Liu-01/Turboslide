import { useState } from 'react';

import type { Color } from '@turboslide/schema/color';
import { COLOR_LABELS } from '@turboslide/schema/color';
import type { DeckGuides } from '@turboslide/schema/deck';
import { deckPage } from '@turboslide/schema/render';

import { Dialog, DialogTabs } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import { formatUnit, parseUnit, preferencesOf, unitSuffix } from '../text-tools';
import { tipProps } from '../Tooltip';

import './text-tools-dialogs.css';

/**
 * View > Guides > Edit guides (gslides-parity SPEC-5 7.7, 0.42; P1 5.13): Google's dialog with
 * Vertical and Horizontal tabs, one row per guide with a position field in the preference's unit
 * and a colour swatch (six hues of Turboslide's palette), an X per row, Add new guide, Done.
 * Every edit is one `deck.guides` write (`move`, `remove`, `add`, `colors` keyed `x:800`), so
 * one undo restores it; the guides draw at once on every slide through DeckGuides.tsx.
 */
export const GUIDES_STRINGS = {
  title: 'Edit guides',
  vertical: 'Vertical',
  horizontal: 'Horizontal',
  add: 'Add new guide',
  remove: 'Remove guide',
  done: 'Done',
  position: 'Position',
  color: 'Guide color',
  empty: 'No guides on this axis yet',
} as const;

/** The six hues a guide may take (SPEC-5 7.7 "the six hues, Turboslide's palette"). */
export const GUIDE_COLORS: ReadonlyArray<Color> = [
  'titanium',
  'ink',
  'green',
  'amber',
  'red',
  'blue',
];

/** The colour of a guide, titanium (the default line) when none is stored. */
export function guideColor(guides: DeckGuides | undefined, axis: 'x' | 'y', at: number): Color {
  return guides?.colors?.[`${axis}:${Math.round(at)}`] ?? 'titanium';
}

type Axis = 'x' | 'y';

export function GuidesDialog() {
  const shell = useEditorShell();
  const { input } = shell;
  const [axis, setAxis] = useState<Axis>('x');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const prefs = preferencesOf(input);
  const unit = prefs.units;
  const guides = input.document.deck.guides;
  const page = deckPage(input.document.deck);
  const list = guides?.[axis] ?? [];
  const extent = axis === 'x' ? page.width : page.height;

  const write = (edit: Record<string, unknown>) => {
    setError(null);
    input
      .dispatch('deck.guides', { ...edit, baseRevision: input.revision })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const commitPosition = (at: number) => {
    const key = `${axis}:${at}`;
    const draft = drafts[key];
    if (draft === undefined) return;
    const rest = { ...drafts };
    delete rest[key];
    setDrafts(rest);
    const next = parseUnit(draft, unit);
    if (next === null || next < 0 || next > extent || Math.round(next) === Math.round(at)) return;
    const color = guideColor(guides, axis, at);
    write({
      move: [{ axis, from: at, to: next }],
      ...(color === 'titanium'
        ? {}
        : {
            colors: { [`${axis}:${Math.round(at)}`]: null, [`${axis}:${Math.round(next)}`]: color },
          }),
    });
  };

  const addGuide = () => {
    const centre = Math.round(extent / 2);
    let at = centre;
    while (list.some((value) => Math.round(value) === at) && at < extent) at += 40;
    write({ add: [{ axis, at }] });
  };

  return (
    <Dialog
      title={GUIDES_STRINGS.title}
      onClose={shell.closeDialog}
      width={460}
      control="dialog.guides"
      actions={[
        {
          label: GUIDES_STRINGS.done,
          primary: true,
          onClick: shell.closeDialog,
          control: 'dialog.guides.done',
          doc: 'Closes the dialog; every change is already on the slides',
        },
      ]}
    >
      <DialogTabs
        tabs={[
          { value: 'x' as const, label: GUIDES_STRINGS.vertical },
          { value: 'y' as const, label: GUIDES_STRINGS.horizontal },
        ]}
        value={axis}
        control="dialog.guides.axis"
        onChange={setAxis}
      />
      <div role="tabpanel" data-control={`dialog.guides.${axis}`}>
        {list.length === 0 ? (
          <p className="ts-tt-empty" data-control="dialog.guides.empty">
            {GUIDES_STRINGS.empty}
          </p>
        ) : (
          <ul
            className="ts-tt-list"
            aria-label={axis === 'x' ? GUIDES_STRINGS.vertical : GUIDES_STRINGS.horizontal}
          >
            {list.map((at) => {
              const key = `${axis}:${at}`;
              const color = guideColor(guides, axis, at);
              const fieldTip = tipProps({
                name: GUIDES_STRINGS.position,
                doc: `The guide's position in ${unitSuffix(unit)}; Enter moves it`,
                key: 'Enter',
              });
              return (
                <li key={key} data-control={`dialog.guides.row.${axis}.${at}`}>
                  <span className="ts-tt-row">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="ts-tt-field"
                      value={drafts[key] ?? formatUnit(at, unit)}
                      aria-label={`${GUIDES_STRINGS.position} of the ${axis === 'x' ? 'vertical' : 'horizontal'} guide at ${formatUnit(at, unit)} ${unitSuffix(unit)}`}
                      data-control={`dialog.guides.position.${axis}.${at}`}
                      {...fieldTip}
                      onChange={(event) => setDrafts({ ...drafts, [key]: event.target.value })}
                      onBlur={(event) => {
                        fieldTip.onBlur(event);
                        commitPosition(at);
                      }}
                      onKeyDown={(event) => {
                        fieldTip.onKeyDown(event);
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitPosition(at);
                        }
                      }}
                    />
                    <span className="ts-tt-suffix">{unitSuffix(unit)}</span>
                    <span
                      className="ts-tt-swatches"
                      role="radiogroup"
                      aria-label={GUIDES_STRINGS.color}
                    >
                      {GUIDE_COLORS.map((hue) => (
                        <button
                          key={hue}
                          type="button"
                          role="radio"
                          aria-checked={hue === color}
                          aria-label={COLOR_LABELS[hue as keyof typeof COLOR_LABELS] ?? hue}
                          className={hue === color ? 'ts-tt-swatch is-on' : 'ts-tt-swatch'}
                          style={{ ['--swatch' as string]: `var(--pt-${hue})` }}
                          data-control={`dialog.guides.color.${axis}.${at}.${hue}`}
                          {...tipProps({
                            name: COLOR_LABELS[hue as keyof typeof COLOR_LABELS] ?? hue,
                            doc: 'The colour this guide draws in',
                          })}
                          onClick={() =>
                            write({
                              colors: {
                                [`${axis}:${Math.round(at)}`]: hue === 'titanium' ? null : hue,
                              },
                            })
                          }
                        />
                      ))}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="ts-tt-remove"
                    aria-label={`${GUIDES_STRINGS.remove} at ${formatUnit(at, unit)} ${unitSuffix(unit)}`}
                    data-control={`dialog.guides.remove.${axis}.${at}`}
                    {...tipProps({
                      name: GUIDES_STRINGS.remove,
                      doc: 'Removes this guide from every slide',
                    })}
                    onClick={() => write({ remove: [{ axis, at }] })}
                  >
                    X
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="ts-tt-row" style={{ paddingTop: 8 }}>
          <button
            type="button"
            className="ts-tt-small"
            data-control="dialog.guides.add"
            {...tipProps({
              name: GUIDES_STRINGS.add,
              doc: 'Adds a guide at the centre of the page',
            })}
            onClick={addGuide}
          >
            {GUIDES_STRINGS.add}
          </button>
        </div>
      </div>
      {error !== null ? (
        <p className="ts-tt-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
