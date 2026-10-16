import { useRef } from 'react';

import { useMountEffect } from '../useMountEffect';
import { AvatarStack } from './AvatarStack';
import type { OnPress } from './AvatarStack';
import { TITLE, TITLE_TEXT } from './copy';
import { layoutTitle } from './orbit';

/**
 * The landing's h1, "Presentations for people and agents" (docs/SITE.md B), with the two words in
 * the site accent and each word's stack orbiting its last letter: the people around the "e" of
 * "people", the agents around the "s" of "agents" (Kevin, 2026-10-16). Each stack is positioned
 * out of the line's flow from its word, so the sentence keeps its word spacing; orbit.ts measures
 * the glyphs and places each orbit clear of every letter, after hydration, once the fonts load and
 * whenever the h1 changes size (a new width, a new wrap). Before that the stacks stand on the
 * em based orbits of site.css. The heading is named by the sentence alone (its `aria-label`; its
 * text content is the sentence too, since the portraits and the marks are svg), and the avatars
 * inside it are buttons a keyboard reaches. On a phone the line breaks after "people".
 */
export function Title({ onPress }: { onPress?: OnPress }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  useMountEffect(() => {
    const node = h1.current;
    if (node === null) return;
    let frame = 0;
    const layout = (): void => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => layoutTitle(node));
    };
    layout();
    void document.fonts.ready.then(layout);
    const observer = new ResizeObserver(layout);
    observer.observe(node);
    window.addEventListener('resize', layout);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', layout);
    };
  });
  return (
    <h1 ref={h1} id="site-title" className="t-display" aria-label={TITLE_TEXT}>
      {TITLE.before}{' '}
      <span className="site-h1-word is-people">
        {TITLE.people}
        <AvatarStack kind="people" {...(onPress === undefined ? {} : { onPress })} />
      </span>
      <br className="site-h1-br" /> {TITLE.and}{' '}
      <span className="site-h1-word">
        {TITLE.agents}
        <AvatarStack kind="agents" {...(onPress === undefined ? {} : { onPress })} />
      </span>
    </h1>
  );
}
