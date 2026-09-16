import { useMemo } from 'react';

import type { DeckDocument, ThemeId, ThemeRecord } from '@turboslide/schema/deck';
import { THEMES, deckAppearance, slideOrder } from '@turboslide/schema/deck';
import type { Appearance, Slide } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { LiveClone } from '@turboslide/viewer/LiveClone';

import type { EditorDispatch } from './dispatch';
import type { SlideRenderer } from './LayoutGrid';
import { cn } from './lib/cn';
import { PANELS, ROUND_FIVE } from './menus/strings';
import { stubClause } from './menus/strings';
import { Panel } from './Panel';
import { tipProps } from './Tooltip';

import './ThemesPanel.css';

/**
 * The Themes panel (gslides-parity SPEC 5.7, 12 "Panels"; SPEC-5 0.28, 9.2, 9.3; R02 8.1): three
 * groups. GT and Plate (the label is Kevin's, SPEC-5 0.45) each show slide 1 twice, Light and
 * Dark, the current theme and appearance ringed; a click on a built in theme writes `/theme` and
 * `/defaults/appearance` in one commit, and the stage, the thumbnails, present mode, the view
 * route and the Download dialog's default follow it (SPEC 1.4). "In this presentation" lists the
 * edited theme under its name when the deck carries theme edits, then the imported records of
 * Import theme (at most five); a click on a record writes `theme.applyImported` (SPEC-5 5.3).
 * "Import theme" sits at the bottom right and opens B3's dialog when the shell passes it, else
 * it stays disabled with the stub sentence. The renderer arrives as a prop (the chrome package
 * does not depend on @turboslide/render): `render` draws slide 1 under the deck's own theme;
 * `renderThemed` draws it under another theme id for the tile of a theme the deck is not on.
 */
export type ThemesPanelProps = {
  document: DeckDocument;
  render?: SlideRenderer;
  /** slide 1 under a theme id the deck is not on (the other group's tiles); the label plate when absent */
  renderThemed?: (slide: Slide, appearance: Appearance, theme: ThemeId) => string;
  /** one write of the theme and appearance; absent makes the thumbnails read only */
  commit?: (mutations: Mutation[], label: string) => Promise<unknown>;
  /** theme.applyImported for the imported records; absent makes them read only */
  dispatch?: EditorDispatch;
  revision?: number;
  /** opens Import theme (B3's dialog); absent keeps the button disabled with the stub sentence */
  onImportTheme?: () => void;
  onNotice?: (message: string) => void;
  onClose: () => void;
};

/** The panel labels per theme id (SPEC-5 9.2; the Plate label is Kevin's). */
export const THEME_GROUP_LABELS: Readonly<Record<ThemeId, string>> = {
  'gt-ink-paper': PANELS.themes.gt,
  'ts-plate': ROUND_FIVE.plate,
};

export function ThemesPanel({
  document,
  render,
  renderThemed,
  commit,
  dispatch,
  revision,
  onImportTheme,
  onNotice,
  onClose,
}: ThemesPanelProps) {
  const { deck } = document;
  const current = deckAppearance(deck);
  const currentTheme: ThemeId = deck.theme;
  const firstId = slideOrder(deck)[0];
  const first = firstId === undefined ? undefined : document.slides[firstId];
  const edits = deck.themeEdits;
  const imported: ThemeRecord[] = deck.importedThemes ?? [];

  const thumbs = useMemo(() => {
    const make = (theme: ThemeId, appearance: Appearance): string | null => {
      if (first === undefined) return null;
      try {
        if (theme === currentTheme && render !== undefined) return render(first, appearance);
        if (renderThemed !== undefined) return renderThemed(first, appearance, theme);
        return null;
      } catch {
        return null;
      }
    };
    const out = {} as Record<ThemeId, { light: string | null; dark: string | null }>;
    for (const theme of THEMES)
      out[theme] = { light: make(theme, 'light'), dark: make(theme, 'dark') };
    return out;
  }, [first, render, renderThemed, currentTheme]);

  const fail = (error: unknown) =>
    onNotice?.(error instanceof Error ? error.message : String(error));

  const pick = (theme: ThemeId, appearance: Appearance) => {
    if (theme === currentTheme && appearance === current) return;
    if (commit === undefined) {
      onNotice?.('The theme cannot be changed here yet');
      return;
    }
    const mutations: Mutation[] = [];
    if (theme !== currentTheme) mutations.push({ op: 'deck.set', path: '/theme', value: theme });
    if (appearance !== current)
      mutations.push({ op: 'deck.set', path: '/defaults/appearance', value: appearance });
    const label =
      theme !== currentTheme
        ? `${THEME_GROUP_LABELS[theme]} theme`
        : appearance === 'dark'
          ? 'Dark theme'
          : 'Light theme';
    commit(mutations, label).catch(fail);
  };

  const applyImported = (index: number) => {
    if (dispatch === undefined || revision === undefined) {
      onNotice?.('The imported theme cannot be applied here yet');
      return;
    }
    dispatch('theme.applyImported', { index, baseRevision: revision }).catch(fail);
  };

  const tile = (theme: ThemeId, appearance: Appearance, control: string, base: boolean) => {
    const html = thumbs[theme][appearance];
    const label = appearance === 'light' ? PANELS.themes.light : PANELS.themes.dark;
    const on = currentTheme === theme && current === appearance;
    const groupLabel = THEME_GROUP_LABELS[theme];
    return (
      <button
        key={`${control}-${appearance}`}
        type="button"
        className={cn('ts-themes-tile', on && 'is-current')}
        role="radio"
        aria-checked={on}
        data-control={`${control}.${appearance}`}
        data-appearance={appearance}
        data-theme-id={theme}
        onClick={() => pick(theme, appearance)}
        {...tipProps({
          name: `${groupLabel} ${label.toLowerCase()}`,
          doc: on
            ? 'The presentation uses this theme and appearance'
            : `Switches the presentation to ${groupLabel} ${label.toLowerCase()}`,
        })}
      >
        <span
          className="ts-themes-frame"
          data-theme={appearance}
          data-sheet={theme}
          /* a base tile shows the theme without the deck's edits (SPEC-5 9.2; theme-css.ts scope) */
          data-theme-base={base ? '' : undefined}
          aria-hidden="true"
          /* the current tile's ink ring is a state for the chrome line law (packages/lint chrome.ts active) */
          data-selected={on ? 'true' : undefined}
        >
          {html === null ? (
            <span className="ts-themes-plate">{groupLabel}</span>
          ) : (
            <LiveClone html={html} theme={appearance} frame={false} />
          )}
        </span>
        <span className="ts-themes-name">{label}</span>
      </button>
    );
  };

  const importDisabled = onImportTheme === undefined;
  const importFull = imported.length >= 5;

  return (
    <Panel
      title={PANELS.themes.title}
      onClose={onClose}
      control="panel.themes"
      className="ts-themes"
    >
      {THEMES.map((theme) => (
        <section key={theme} className="ts-themes-group" aria-labelledby={`ts-themes-${theme}`}>
          <h3 id={`ts-themes-${theme}`} className="ts-themes-head">
            {THEME_GROUP_LABELS[theme]}
          </h3>
          <div
            className="ts-themes-tiles"
            role="radiogroup"
            aria-label={`${THEME_GROUP_LABELS[theme]} appearance`}
          >
            {tile(theme, 'light', `themes.${theme === 'gt-ink-paper' ? 'gt' : 'plate'}`, true)}
            {tile(theme, 'dark', `themes.${theme === 'gt-ink-paper' ? 'gt' : 'plate'}`, true)}
          </div>
        </section>
      ))}
      <section className="ts-themes-group" aria-labelledby="ts-themes-in">
        <h3 id="ts-themes-in" className="ts-themes-head">
          {PANELS.themes.inThisPresentation}
        </h3>
        <div
          className="ts-themes-tiles"
          role="radiogroup"
          aria-label={PANELS.themes.inThisPresentation}
        >
          {edits !== undefined ? (
            <div className="ts-themes-edited" data-control="themes.inThis.edited">
              <p className="ts-themes-edited-name">
                {edits.name ?? `${THEME_GROUP_LABELS[currentTheme]} (edited)`}
              </p>
              <div className="ts-themes-tiles ts-themes-pair">
                {tile(currentTheme, 'light', 'themes.inThis', false)}
                {tile(currentTheme, 'dark', 'themes.inThis', false)}
              </div>
            </div>
          ) : (
            <>
              {tile(currentTheme, 'light', 'themes.inThis', false)}
              {tile(currentTheme, 'dark', 'themes.inThis', false)}
            </>
          )}
          {imported.map((record, index) => (
            <button
              key={`${record.name}-${index}`}
              type="button"
              className="ts-themes-tile ts-themes-record"
              role="radio"
              aria-checked={false}
              data-control={`themes.imported.${index}`}
              onClick={() => applyImported(index)}
              {...tipProps({
                name: record.name,
                doc: 'Applies this imported theme’s colours and faces to the presentation',
              })}
            >
              <span className="ts-themes-frame ts-themes-scheme" aria-hidden="true">
                {[
                  'paper',
                  'ink',
                  'ink-2',
                  'plate',
                  'ok',
                  'warn',
                  'no',
                  'info',
                  'titanium',
                  'raised',
                  'link',
                ].map((key) =>
                  record.colors[key] !== undefined ? (
                    <span
                      key={key}
                      className="ts-themes-chip"
                      style={{ background: record.colors[key] }}
                    />
                  ) : null,
                )}
              </span>
              <span className="ts-themes-name">
                {record.name}
                {'file' in record.source ? ` (${record.source.file})` : ''}
              </span>
            </button>
          ))}
        </div>
      </section>
      <div className="ts-themes-foot">
        <button
          type="button"
          className={cn('pt-ib is-text ts-themes-import', importDisabled && 'is-disabled')}
          aria-disabled={importDisabled ? true : undefined}
          data-control="themes.import"
          data-status={importDisabled ? 'later' : undefined}
          onClick={() => {
            if (importDisabled) return;
            if (importFull) {
              onNotice?.(ROUND_FIVE.fiveThemes);
              return;
            }
            onImportTheme();
          }}
          {...tipProps({
            name: PANELS.themes.importTheme,
            doc: importDisabled
              ? stubClause(PANELS.themes.importStub)
              : importFull
                ? ROUND_FIVE.fiveThemes
                : 'A theme from a PowerPoint file or another Turboslide presentation, listed under In this presentation',
          })}
        >
          <span className="pt-lb">{PANELS.themes.importTheme}</span>
        </button>
      </div>
    </Panel>
  );
}
