import { useMemo } from 'react';

import type { DeckDocument } from '@turboslide/schema/deck';
import { deckAppearance, slideOrder } from '@turboslide/schema/deck';
import type { Appearance } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { LiveClone } from '@turboslide/viewer/LiveClone';

import type { SlideRenderer } from './LayoutGrid';
import { cn } from './lib/cn';
import { PANELS } from './menus/strings';
import { stubClause } from './menus/strings';
import { Panel } from './Panel';
import { tipProps } from './Tooltip';

import './ThemesPanel.css';

/**
 * The Themes panel (gslides-parity SPEC 5.7, 12 "Panels"; R02 8.1): the title "Themes", one theme
 * "GT" as two thumbnails of slide 1, "Light" and "Dark", the current one ringed; a click writes
 * `deck.set /defaults/appearance` as one commit, and the stage, the thumbnails, present mode, the
 * view route and the Download dialog's default follow it (SPEC 1.4). "In this presentation" lists
 * the same two. "Import theme" sits at the bottom right, disabled, with the stub sentence. The
 * renderer arrives as a prop (the chrome package does not depend on @turboslide/render).
 */
export type ThemesPanelProps = {
  document: DeckDocument;
  render?: SlideRenderer;
  /** one write of the appearance; absent makes the thumbnails read only */
  commit?: (mutations: Mutation[], label: string) => Promise<unknown>;
  onNotice?: (message: string) => void;
  onClose: () => void;
};

export function ThemesPanel({ document, render, commit, onNotice, onClose }: ThemesPanelProps) {
  const { deck } = document;
  const current = deckAppearance(deck);
  const firstId = slideOrder(deck)[0];
  const first = firstId === undefined ? undefined : document.slides[firstId];
  const thumbs = useMemo(() => {
    const make = (theme: Appearance): string | null => {
      if (first === undefined || render === undefined) return null;
      try {
        return render(first, theme);
      } catch {
        return null;
      }
    };
    return { light: make('light'), dark: make('dark') };
  }, [first, render]);

  const pick = (appearance: Appearance) => {
    if (appearance === current) return;
    if (commit === undefined) {
      onNotice?.('The appearance cannot be changed here yet');
      return;
    }
    commit(
      [{ op: 'deck.set', path: '/defaults/appearance', value: appearance }],
      appearance === 'dark' ? 'Dark theme' : 'Light theme',
    ).catch((error: unknown) => onNotice?.(error instanceof Error ? error.message : String(error)));
  };

  const tile = (appearance: Appearance, control: string) => {
    const html = thumbs[appearance];
    const label = appearance === 'light' ? PANELS.themes.light : PANELS.themes.dark;
    const on = current === appearance;
    return (
      <button
        key={`${control}-${appearance}`}
        type="button"
        className={cn('ts-themes-tile', on && 'is-current')}
        role="radio"
        aria-checked={on}
        data-control={`${control}.${appearance}`}
        data-appearance={appearance}
        onClick={() => pick(appearance)}
        {...tipProps({
          name: `${PANELS.themes.gt} ${label.toLowerCase()}`,
          doc: on
            ? 'The presentation uses this appearance'
            : `Switches the presentation to ${label.toLowerCase()}`,
        })}
      >
        <span
          className="ts-themes-frame"
          data-theme={appearance}
          aria-hidden="true"
          /* the current tile's ink ring is a state for the chrome line law (packages/lint chrome.ts active) */
          data-selected={on ? 'true' : undefined}
        >
          {html === null ? (
            <span className="ts-themes-plate">{PANELS.themes.gt}</span>
          ) : (
            <LiveClone html={html} theme={appearance} frame={false} />
          )}
        </span>
        <span className="ts-themes-name">{label}</span>
      </button>
    );
  };

  return (
    <Panel
      title={PANELS.themes.title}
      onClose={onClose}
      control="panel.themes"
      className="ts-themes"
    >
      <section className="ts-themes-group" aria-labelledby="ts-themes-gt">
        <h3 id="ts-themes-gt" className="ts-themes-head">
          {PANELS.themes.gt}
        </h3>
        <div
          className="ts-themes-tiles"
          role="radiogroup"
          aria-label={`${PANELS.themes.gt} appearance`}
        >
          {tile('light', 'themes.gt')}
          {tile('dark', 'themes.gt')}
        </div>
      </section>
      <section className="ts-themes-group" aria-labelledby="ts-themes-in">
        <h3 id="ts-themes-in" className="ts-themes-head">
          {PANELS.themes.inThisPresentation}
        </h3>
        <div
          className="ts-themes-tiles"
          role="radiogroup"
          aria-label={PANELS.themes.inThisPresentation}
        >
          {tile('light', 'themes.inThis')}
          {tile('dark', 'themes.inThis')}
        </div>
      </section>
      <div className="ts-themes-foot">
        <button
          type="button"
          className="pt-ib is-text is-disabled ts-themes-import"
          aria-disabled="true"
          data-control="themes.import"
          data-status="later"
          {...tipProps({
            name: PANELS.themes.importTheme,
            doc: stubClause(PANELS.themes.importStub),
          })}
        >
          <span className="pt-lb">{PANELS.themes.importTheme}</span>
        </button>
      </div>
    </Panel>
  );
}
