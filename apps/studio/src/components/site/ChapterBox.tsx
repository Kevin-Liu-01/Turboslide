import { useRef, useState } from 'react';

import { useMountEffect } from '../useMountEffect';
import { TRY_CHAPTER, TRY_FRAME_SRC, TRY_VISIBLE, isTryReady } from './try-frame';

/**
 * How far outside the window a chapter's editor starts loading: a little ahead of the reader, so
 * it is mostly ready on arrival while the section after it waits.
 */
const LOAD_MARGIN = '40% 0px';
/** How far outside the window it may go before it unloads, so few editors are alive at once. */
const DROP_MARGIN = '120% 0px';

/**
 * A chapter's live editor (docs/SITE.md 5, "The chapters"): the same frame of /try as the hero's
 * (HeroBox.tsx), which plays one chapter of the story (try/story.ts). The box keeps its size and
 * shows paper until the frame says it is ready, then the frame fades in over it, so nothing moves.
 * The frame loads once the box comes within LOAD_MARGIN of the window and unloads past
 * DROP_MARGIN, so the page holds the hero's editor and one or two of these. On its ready
 * the page names the chapter (`ts-try:chapter`) and tells it whether the box is on screen
 * (`ts-try:visible`), as it does whenever that changes; off screen its agents wait.
 */
export function ChapterBox({ chapter, title }: { chapter: number; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<'empty' | 'loading' | 'live'>('empty');
  useMountEffect(() => {
    const el = box.current;
    if (el === null || typeof IntersectionObserver === 'undefined') return;
    let onScreen = false;
    let ready = false;
    const post = (data: unknown) =>
      frame.current?.contentWindow?.postMessage(data, window.location.origin);
    const last = (entries: IntersectionObserverEntry[]) => entries[entries.length - 1];
    const near = new IntersectionObserver(
      (entries) => {
        if (last(entries)?.isIntersecting === true)
          setState((current) => (current === 'empty' ? 'loading' : current));
      },
      { rootMargin: LOAD_MARGIN },
    );
    const far = new IntersectionObserver(
      (entries) => {
        if (last(entries)?.isIntersecting !== false) return;
        ready = false;
        setState('empty');
      },
      { rootMargin: DROP_MARGIN },
    );
    const seen = new IntersectionObserver((entries) => {
      const entry = last(entries);
      if (entry === undefined) return;
      onScreen = entry.isIntersecting;
      if (ready) post({ type: TRY_VISIBLE, visible: onScreen });
    });
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frame.current?.contentWindow || !isTryReady(event.data)) return;
      ready = true;
      post({ type: TRY_CHAPTER, chapter });
      post({ type: TRY_VISIBLE, visible: onScreen });
      setState('live');
    };
    window.addEventListener('message', onMessage);
    near.observe(el);
    far.observe(el);
    seen.observe(el);
    return () => {
      window.removeEventListener('message', onMessage);
      near.disconnect();
      far.disconnect();
      seen.disconnect();
    };
  });
  return (
    <div ref={box} className="site-chapter-box" data-chapter={chapter} data-state={state}>
      {state === 'empty' ? null : (
        <iframe
          ref={frame}
          className="site-chapter-frame"
          src={TRY_FRAME_SRC}
          title={title}
          allow="fullscreen; clipboard-write"
          loading="eager"
        />
      )}
    </div>
  );
}
