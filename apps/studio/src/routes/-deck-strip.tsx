import type { MouseEvent } from 'react';
import { useMemo, useRef, useState } from 'react';

import { tipProps } from '@turboslide/chrome/Tooltip';
import { pad2, trimTitle } from '@turboslide/viewer/model';
import type { ViewerDeck } from '@turboslide/viewer/model';

import { useMountEffect } from '../components/useMountEffect';

/**
 * The deck strip of /deck/<id> (Kevin, 2026-10-30: "update ... the slide viewer as well to use all
 * my new paradigms"): the viewer's progress line drawn as the deck itself, one tick per slide in
 * the order the shell pages them, with each section's first tick taller. The ticks up to the
 * current slide are drawn darker, so the strip reads the place as the progress line did, and the
 * section starts show the deck's structure beside it. A tick carries `data-preview`, so the
 * shell's one preview layer opens the slide's card above it on hover; a click goes to the slide.
 *
 * The strip lives outside the shell, so it talks to the shell through the shell's own public
 * contracts and nothing else: it reads the place from `.pt-viewer[data-index]` (the attribute the
 * e2e specs read) and it moves the shell with a fragment navigation to `#s/<slideId>`, which the
 * shell's hashchange listener selects (ViewerShell.tsx `onHash`). The navigation replaces the
 * history entry, as the shell's own `writeSlideHash` does, and the router answers it without a
 * request (measured on the lane server: zero requests). `location.replace` needs no state of its
 * own here: the hash is the state.
 *
 * It is one control for assistive technology: a slider over the slide numbers whose value text
 * names the slide, with the Tooltip primitive's name, sentence and keys on keyboard focus. The
 * arrows are the shell's paging keys, which run while the strip has the focus. The pointer gets
 * the preview card in place of the tooltip plate, since both would sit above the same tick.
 */
export type StripTick = {
  id: string;
  /** the slide's number as the sidebar rows print it */
  n: string;
  title: string;
  /** the first slide of its section */
  start: boolean;
};

/** The ticks in paging order: every slide of every section, the section starts marked. */
export function stripTicks(deck: Pick<ViewerDeck, 'sections' | 'slides'>): StripTick[] {
  const byId = new Map(deck.slides.map((slide) => [slide.id, slide]));
  return deck.sections.flatMap((section) =>
    section.slideIds.flatMap((id, i): StripTick[] => {
      const slide = byId.get(id);
      if (!slide) return [];
      return [{ id, n: pad2(slide.n), title: trimTitle(slide.title), start: i === 0 }];
    }),
  );
}

/** The class list of one tick for the current place `at` (the shell's index, -1 for none). */
export function tickClass(tick: StripTick, index: number, at: number): string {
  const classes = ['ts-deck-tick'];
  if (tick.start) classes.push('is-start');
  if (index < at) classes.push('is-past');
  if (index === at) classes.push('is-on');
  return classes.join(' ');
}

export function DeckStrip({ deck }: { deck: Pick<ViewerDeck, 'sections' | 'slides'> }) {
  const ticks = useMemo(() => stripTicks(deck), [deck]);
  const strip = useRef<HTMLDivElement>(null);
  /* the server and the first client render draw the first slide, as the shell does */
  const [at, setAt] = useState(0);

  useMountEffect(() => {
    const shell = strip.current?.parentElement?.querySelector<HTMLElement>(':scope > .pt-viewer');
    if (!shell) return;
    const read = () => setAt(Number(shell.dataset.index ?? '0'));
    read();
    const observer = new MutationObserver(read);
    observer.observe(shell, { attributes: true, attributeFilter: ['data-index'] });
    return () => observer.disconnect();
  });

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const tick = (event.target as Element).closest<HTMLElement>('[data-id]');
    const id = tick?.dataset.id;
    if (id) window.location.replace(`#s/${encodeURIComponent(id)}`);
  };

  const current = ticks[at];
  const tip = tipProps({
    name: 'Slides',
    doc: 'Hover a tick to preview its slide, and click it to go there.',
    key: 'Left and right arrows',
  });
  return (
    <div
      ref={strip}
      className="ts-deck-strip"
      role="slider"
      tabIndex={0}
      aria-label="Slides"
      aria-orientation="horizontal"
      aria-valuemin={1}
      aria-valuemax={ticks.length}
      aria-valuenow={Math.max(1, at + 1)}
      aria-valuetext={current ? `Slide ${at + 1} of ${ticks.length}, ${current.title}` : undefined}
      data-control="view.strip"
      data-tip={tip['data-tip']}
      onFocus={tip.onFocus}
      onBlur={tip.onBlur}
      onKeyDown={tip.onKeyDown}
      onClick={onClick}
    >
      {ticks.map((tick, i) => (
        <span
          key={tick.id}
          className={tickClass(tick, i, at)}
          data-id={tick.id}
          data-n={tick.n}
          data-preview={tick.id}
        />
      ))}
    </div>
  );
}
