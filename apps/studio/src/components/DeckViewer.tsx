import { useMemo } from 'react';

import type { ShellItem, ShellMode, ShellSection } from '@turboslide/chrome/shell-data';
import { usePtShell, usePtStage } from '@turboslide/chrome/shell-context';
import { ViewerShell } from '@turboslide/chrome/ViewerShell';
import { BookView } from '@turboslide/viewer/BookView';
import { GridView } from '@turboslide/viewer/GridView';
import { pad2, trimTitle } from '@turboslide/viewer/model';
import type { ViewerDeck } from '@turboslide/viewer/model';
import { Stage } from '@turboslide/viewer/Stage';
import { applyTheme, installThemeBridge, postTheme, useTheme } from '@turboslide/viewer/theme';
import type { Theme } from '@turboslide/viewer/theme';

import type { DeckPayload } from '../server/decks';
import { useMountEffect } from './useMountEffect';

/**
 * The viewer page (SPEC 5.3, 5.5, 6.1): the chrome's ViewerShell around the
 * viewer's Stage, GridView and BookView, fed by the loader's rendered deck.
 * The same component serves /deck/:deckId and /embed/:deckId; `embed` turns
 * the frame protocol on (SPEC 5.3: the gt-theme and gt-deck-slide postMessage
 * protocol and the #NN hash contract are preserved; the studio writes
 * #s/<slideId> as the stable form).
 */
export type DeckViewerProps = {
  payload: DeckPayload;
  /** ?mode= from the route, ahead of the saved mode */
  mode?: ShellMode;
  /** ?theme= from the route: applied once on mount, ahead of the stored theme */
  theme?: Theme;
  /** the frame protocol for Prototemplate's /deck iframe */
  embed?: boolean;
  onModeChange?: (mode: ShellMode) => void;
};

const MODES: readonly ShellMode[] = ['slide', 'grid', 'book'];

function toSections(deck: ViewerDeck): readonly ShellSection[] {
  const byId = new Map(deck.slides.map((slide) => [slide.id, slide]));
  return deck.sections.map((section) => ({
    id: section.id,
    label: section.name,
    items: section.slideIds.flatMap((id): ShellItem[] => {
      const slide = byId.get(id);
      if (!slide) return [];
      return [
        {
          id: slide.id,
          n: pad2(slide.n),
          title: trimTitle(slide.title),
          kind: slide.kind,
          html: slide.html,
          lint: slide.lint,
        },
      ];
    }),
  }));
}

/** Tells the page around the frame which slide is up (DeckFrame.tsx mirrors it into its address). */
function postSlide(n: number): void {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({ type: 'gt-deck-slide', n }, window.location.origin);
  } catch {
    // a detached frame: nothing to tell
  }
}

export function DeckViewer({ payload, mode, theme, embed = false, onModeChange }: DeckViewerProps) {
  const { deck, sprite } = payload;
  const sections = useMemo(() => toSections(deck), [deck]);

  useMountEffect(() => {
    /* the route's theme wins over the stored one, once; the toggle then persists as usual */
    if (theme) applyTheme(theme);
    const stop = installThemeBridge();
    /* a framed deck reports its opening slide so the host's address names it */
    if (embed) {
      const n =
        Number(document.querySelector('.pt-viewer')?.getAttribute('data-index') ?? '-1') + 1;
      if (n > 0) postSlide(n);
      /* and a same-origin host with frames of its own gets the theme, as DeckFrame does on load */
      document
        .querySelectorAll('iframe')
        .forEach((frame) => postTheme(frame.contentWindow, theme ?? 'dark'));
    }
    return stop;
  });

  return (
    <>
      {/* the theme's sprite (63 Heroicons plus gt-mark), once per document, so every <use href="#..."> in the sheets resolves */}
      <div className="ts-sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
      <ViewerShell
        id={`deck:${deck.id}`}
        title={deck.title}
        count={`${deck.slides.length} slides`}
        sections={sections}
        modes={MODES}
        initialMode={mode}
        thumb="shot"
        keys="paged"
        hash={embed ? 'n' : 'id'}
        onSelect={embed ? (_id, n) => postSlide(n) : undefined}
        onModeChange={onModeChange}
        homeHref={embed ? undefined : '/'}
        toolbarSlot={
          deck.fallback ? (
            <span
              className="ts-chip"
              title={`decks/${deck.fallback} stands in for decks/${deck.id}`}
            >
              fixture
            </span>
          ) : undefined
        }
      >
        <StageBridge deck={deck} serverTheme={theme ?? 'dark'} />
      </ViewerShell>
    </>
  );
}

/**
 * The composition point between the chrome's shell state and the viewer's
 * stage (SPEC 3.3: chrome depends on viewer, never the reverse, so the shell
 * hands its state down as props here). The stage is always mounted so the
 * sheet keeps its fit; the grid and the book mount only while their mode is
 * up (SPEC 5.5: book mode builds lazily on first entry).
 */
function StageBridge({ deck, serverTheme }: { deck: ViewerDeck; serverTheme: Theme }) {
  const shell = usePtShell();
  const { stageSize } = usePtStage();
  const themeNow = useTheme(serverTheme);
  const slide = deck.slides.find((entry) => entry.id === shell.active) ?? deck.slides[0];
  return (
    <>
      <Stage
        slide={slide}
        index={Math.max(0, shell.index)}
        total={shell.total}
        stageSize={stageSize}
        mode={shell.mode}
        present={shell.present}
        narrow={shell.narrow}
        theme={themeNow}
        dir={shell.dir ?? 'next'}
        onStep={shell.step}
      />
      {shell.mode === 'grid' ? (
        <GridView
          deck={deck}
          active={shell.active}
          theme={themeNow}
          onSelect={(id) => {
            shell.setMode('slide');
            shell.select(id);
          }}
        />
      ) : null}
      {shell.mode === 'book' ? (
        <BookView
          deck={deck}
          active={shell.active}
          theme={themeNow}
          isMode
          onSelect={shell.select}
          onOpen={(id) => {
            shell.setMode('slide');
            shell.select(id);
          }}
          lead={`${deck.slides.length} ${deck.slides.length === 1 ? 'slide' : 'slides'} in ${deck.sections.length} ${deck.sections.length === 1 ? 'section' : 'sections'}. Read it top to bottom, or click a page to open it as a slide.`}
          meta={[
            { key: 'Sections', value: String(deck.sections.length) },
            { key: 'Slides', value: String(deck.slides.length) },
            { key: 'Revision', value: `r${deck.revision}` },
          ]}
        />
      ) : null}
    </>
  );
}
