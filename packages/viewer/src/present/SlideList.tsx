import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { LiveClone } from '../LiveClone';
import type { ViewerSlide } from '../model';
import type { Theme } from '../theme';
import { PRESENT_TEXT } from './strings';

import './SlideList.css';

/**
 * The list of slides a show can jump to (gslides-parity SPEC 9.2: "the slide number as a button
 * that opens a list of slides (thumbnails, skipped ones absent)"; 9.3: the presenter console's
 * slide list dropdown). A `role="listbox"` plate with one `role="option"` per slide of the play
 * list (the caller has already left the skipped ones out), each a live thumbnail with its number
 * and title. Roving focus: Up and Down move with wrapping, Home and End, Enter or Space pick, Esc
 * closes; a press outside closes; the current slide is focused on open and the caller returns
 * focus to the button that opened it. Every key stops here so the show's own listener and the
 * reading surface's never see them (a bare B in the list would otherwise show a blank slide).
 */
export type SlideListProps = {
  slides: readonly ViewerSlide[];
  /** the position of the current slide in `slides` */
  index: number;
  theme: Theme;
  /** the accessible name of the list */
  label?: string;
  /** below the counter button of the console, or above the toolbar of the show */
  placement: 'up' | 'down';
  onSelect: (index: number) => void;
  onClose: () => void;
  id?: string;
};

export function SlideList({
  slides,
  index,
  theme,
  label = PRESENT_TEXT.slideList,
  placement,
  onSelect,
  onClose,
  id = 'ts-slide-list',
}: SlideListProps) {
  const root = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(Math.max(0, Math.min(slides.length - 1, index)));

  /* the current slide's option takes focus on open and on every move */
  useLayoutEffect(() => {
    const option = root.current?.querySelector<HTMLElement>(`[data-index="${focused}"]`);
    option?.focus();
    option?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  /* a press outside closes; registered after the opening click has finished bubbling */
  useEffect(() => {
    const onPress = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && root.current.contains(event.target))
        return;
      onClose();
    };
    const timer = window.setTimeout(() => document.addEventListener('pointerdown', onPress), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [onClose]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const last = slides.length - 1;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        setFocused((at) => (at >= last ? 0 : at + 1));
        return;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        setFocused((at) => (at <= 0 ? last : at - 1));
        return;
      case 'Home':
        event.preventDefault();
        setFocused(0);
        return;
      case 'End':
        event.preventDefault();
        setFocused(last);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSelect(focused);
        return;
      case 'Escape':
        event.preventDefault();
        onClose();
        return;
      case 'Tab':
        onClose();
        return;
      default:
        /* every other key stays here: the show's letters must not act while the list is open */
        event.preventDefault();
    }
  };

  return (
    <div
      ref={root}
      id={id}
      className={`ts-slide-list is-${placement}`}
      role="listbox"
      aria-label={label}
      aria-activedescendant={`${id}-${focused}`}
      data-control="present.list"
      data-present-popover=""
      onKeyDown={onKeyDown}
    >
      {slides.map((slide, at) => (
        <div
          key={slide.id}
          id={`${id}-${at}`}
          role="option"
          tabIndex={at === focused ? 0 : -1}
          aria-selected={at === index}
          className={at === index ? 'ts-slide-list-item is-current' : 'ts-slide-list-item'}
          data-index={at}
          data-slide-id={slide.id}
          onPointerEnter={() => setFocused(at)}
          onClick={() => onSelect(at)}
        >
          <span className="ts-slide-list-n">{at + 1}</span>
          <span className="ts-slide-list-frame">
            <LiveClone html={slide.html} theme={theme} />
          </span>
          <span className="ts-slide-list-title">{slide.title}</span>
        </div>
      ))}
    </div>
  );
}
