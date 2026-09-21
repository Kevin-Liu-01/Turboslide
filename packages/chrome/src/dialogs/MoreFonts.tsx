import { useMemo, useState } from 'react';

import type { FontCategory, FontId } from '@turboslide/schema/fonts';
import { FONT_CATEGORIES } from '@turboslide/schema/fonts';

import { Dialog, DialogField } from '../Dialog';
import { FONT_CATEGORY_LABELS, FONT_PICKER, filterRows, licenceUrlOf } from '../font-picker-model';
import type { FontRow } from '../font-picker-model';
import { FontRowLabel } from '../FontPicker';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { tipProps } from '../Tooltip';

/**
 * More fonts (gslides-parity SPEC-5-amendments A5 item 4; docs/PRODUCT.md 4.2; ported from round
 * five): Google's dialog form. The left column searches the catalog and filters it by category,
 * every face drawn in itself with its licence line under the name, "SIL Open Font License 1.1"
 * or "Apache License 2.0", linked to the licence text; a click picks it. The right column, "In
 * this presentation", lists the families the presentation uses and the pick. OK applies the pick
 * to the selected block, Cancel closes. The rows are the `font.list` answer the plate loaded; a
 * face's stylesheet links when its row shows (FontRowLabel), never before.
 *
 * Ids (PRODUCT.md 7.1): `dialog.moreFonts`, `dialog.moreFonts.row.<id>`, `dialog.moreFonts.licence.<id>`.
 */
export type MoreFontsDialogProps = {
  rows: readonly FontRow[];
  used: readonly FontId[];
  picked: FontId | null;
  onPick: (id: FontId | null) => void;
  onClose: () => void;
};

export function MoreFontsDialog({ rows, used, picked, onPick, onClose }: MoreFontsDialogProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FontCategory | 'all'>('all');
  const [choice, setChoice] = useState<FontId | null>(picked);
  const shown = useMemo(
    () => filterRows(rows, query).filter((row) => category === 'all' || row.category === category),
    [category, query, rows],
  );
  const chosen = useMemo(() => {
    const ids = new Set<FontId>([...used, ...(choice === null ? [] : [choice])]);
    return rows.filter((row) => ids.has(row.id));
  }, [choice, rows, used]);
  const words = FONT_PICKER.dialog;
  return (
    <Dialog
      title={words.title}
      onClose={onClose}
      width={640}
      control="dialog.moreFonts"
      cancel
      actions={[
        {
          label: words.ok,
          primary: true,
          onClick: () => onPick(choice),
          control: 'dialog.moreFonts.ok',
          doc: words.okDoc,
        },
      ]}
    >
      <div className="ts-more-fonts">
        <div className="ts-more-fonts-left">
          <div className="ts-more-fonts-filters">
            <DialogField label={FONT_PICKER.search} className="ts-more-fonts-search">
              <input
                type="search"
                value={query}
                autoFocus
                placeholder={FONT_PICKER.search}
                aria-label={FONT_PICKER.search}
                data-control="dialog.moreFonts.search"
                autoComplete="off"
                spellCheck={false}
                {...tipProps({ name: FONT_PICKER.search, doc: FONT_PICKER.searchDoc })}
                onChange={(event) => setQuery(event.target.value)}
              />
            </DialogField>
            <DialogField label={words.categories}>
              <select
                value={category}
                aria-label={words.categories}
                data-control="dialog.moreFonts.category"
                {...tipProps({ name: words.categories, doc: words.categoryDoc })}
                onChange={(event) => setCategory(event.target.value as FontCategory | 'all')}
              >
                <option value="all">{words.allCategories}</option>
                {FONT_CATEGORIES.map((each) => (
                  <option key={each} value={each}>
                    {FONT_CATEGORY_LABELS[each]}
                  </option>
                ))}
              </select>
            </DialogField>
          </div>
          <div
            className="ts-more-fonts-list"
            role="listbox"
            aria-label={words.title}
            data-control="dialog.moreFonts.list"
            data-rows={shown.length}
          >
            {shown.length === 0 ? <p className="ts-font-empty">{FONT_PICKER.noMatch}</p> : null}
            {shown.map((row) => {
              const isChoice = choice === row.id;
              return (
                <div
                  key={row.id}
                  role="option"
                  aria-selected={isChoice}
                  className={cn('ts-more-fonts-row', isChoice && 'is-picked')}
                  data-control={`dialog.moreFonts.row.${row.id}`}
                  data-font={row.id}
                  onClick={() => setChoice(isChoice ? null : row.id)}
                  {...tipProps({
                    name: row.name,
                    doc: `${FONT_CATEGORY_LABELS[row.category]}; ${words.licenceLine(row.licence)}`,
                  })}
                >
                  <span className="ts-font-check" aria-hidden="true">
                    {isChoice ? <Icon name="check" size={14} /> : null}
                  </span>
                  <span className="ts-more-fonts-text">
                    <FontRowLabel row={row} className="ts-more-fonts-name" />
                    <span className="ts-more-fonts-meta">
                      {FONT_CATEGORY_LABELS[row.category]}
                      {' · '}
                      <a
                        href={licenceUrlOf(row.id)}
                        target="_blank"
                        rel="noreferrer"
                        data-control={`dialog.moreFonts.licence.${row.id}`}
                        onClick={(event) => event.stopPropagation()}
                        {...tipProps({
                          name: words.licenceLine(row.licence),
                          doc: words.licenceDoc,
                        })}
                      >
                        {words.licenceLine(row.licence)}
                      </a>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="ts-more-fonts-right">
          <h4 className="ts-picker-title">{words.chosen}</h4>
          <ul className="ts-more-fonts-chosen" data-control="dialog.moreFonts.chosen">
            {chosen.map((row) => (
              <li key={row.id} data-font={row.id}>
                <FontRowLabel row={row} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
