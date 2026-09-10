import type { KeyboardEvent, MouseEvent } from 'react';
import { Fragment } from 'react';

import { LiveClone } from './LiveClone';
import { pad2, trimTitle } from './model';
import type { ViewerDeck } from './model';
import type { Theme } from './theme';

import './GridView.css';

export type GridViewProps = {
  deck: ViewerDeck;
  active: string;
  theme: Theme;
  /** a pick opens the slide live in slide mode (tail.html go) */
  onSelect: (slideId: string) => void;
  label?: string;
};

/**
 * Enter and Space activate a role="button" tile the way a native button
 * does. Space stops here: the shell's document listener reads Space as
 * "next", and the tile's own selection must win. Enter is neither prevented
 * nor stopped, so the digit buffer (1, 2, then Enter) still lands.
 */
function activateOnKey(event: KeyboardEvent<HTMLElement>, act: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
  }
  act();
}

/** A pointer press on a tile must not park focus on it (Prototemplate ListRow.tsx pressWithoutFocus). */
function pressWithoutFocus(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused !== event.currentTarget) focused.blur();
}

/**
 * Every slide at once (SPEC 5.5): a paper scroll region over the stage with
 * 300px minimum tiles and the sections as row-spanning labels, each tile a
 * live clone with its number and title (tail.html buildThumbs; Prototemplate
 * GridView and ThumbList). The title carries data-preview for the one hover
 * preview layer.
 */
export function GridView({
  deck,
  active,
  theme,
  onSelect,
  label = 'Every slide as a grid',
}: GridViewProps) {
  const byId = new Map(deck.slides.map((slide) => [slide.id, slide]));
  return (
    <div className="pt-grid pt-scroll" role="region" aria-label={label}>
      <div className="pt-thumbs">
        {deck.sections.map((section) => (
          <Fragment key={section.id}>
            <div className="pt-sec-label">{section.name}</div>
            {section.slideIds.map((id) => {
              const slide = byId.get(id);
              if (!slide) return null;
              const on = slide.id === active;
              const select = () => onSelect(slide.id);
              return (
                <div
                  key={slide.id}
                  className={on ? 'pt-thumb is-active' : 'pt-thumb'}
                  role="button"
                  tabIndex={0}
                  data-id={slide.id}
                  aria-current={on || undefined}
                  onMouseDown={pressWithoutFocus}
                  onClick={select}
                  onKeyDown={(event) => activateOnKey(event, select)}
                >
                  <div className="n">{pad2(slide.n)}</div>
                  <div className="pt-thumb-body">
                    <div className="pt-thumb-frame">
                      <LiveClone html={slide.html} theme={theme} />
                    </div>
                    <div className="pt-thumb-title" data-preview={slide.id}>
                      {trimTitle(slide.title)}
                    </div>
                  </div>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
