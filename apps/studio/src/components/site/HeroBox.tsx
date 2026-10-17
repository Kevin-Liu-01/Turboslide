import type { MutableRefObject } from 'react';
import { useRef, useState } from 'react';

import { useMountEffect } from '../useMountEffect';
import type { OnPress } from './AvatarStack';
import { HERO } from './copy';
import { ThemePicture } from './ThemePicture';
import { TRY_FRAME_SRC, TRY_PRESS, TRY_VISIBLE, isTryReady } from './try-frame';
import type { TryPressed } from './try-frame';

import heroDarkPhone from './pictures/hero-358-dark.webp?url';
import heroLightPhone from './pictures/hero-358-light.webp?url';
import heroDark from './pictures/hero-1280-dark.webp?url';
import heroLight from './pictures/hero-1280-light.webp?url';

/** The longest the frame waits for an idle moment after `load` (the old landing's live import rule). */
const IDLE_CAP_MS = 1500;
/** The frame's fade in; the poster leaves after it. */
const FADE_MS = 150;

/**
 * The hero's box (docs/SITE.md A.3, C.11): the poster first, a capture of the live editor painted
 * in a box whose size never changes; after the page's `load` and one idle moment the live editor
 * loads in a same origin frame over it, invisible, and when the frame says it is ready the frame
 * shows (a 150 ms fade, none under reduced motion) and the poster leaves. Nothing moves: the frame
 * takes the poster's box. Without script the poster stays. The page tells the frame whenever the
 * box enters or leaves the screen, so the agents work only while someone can see them.
 *
 * A press on an avatar of the title (`press`) goes to the frame as `ts-try:press`: when the
 * poster is still up the frame starts loading at once and the press waits for its ready; when
 * less than half of the box is on screen the page brings it into view first, at once (the product
 * does not smooth-scroll).
 */
export function HeroBox({ press }: { press?: MutableRefObject<OnPress | null> }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<'poster' | 'loading' | 'live' | 'done'>('poster');
  useMountEffect(() => {
    let cancelled = false;
    let idle = 0;
    let onScreen = true;
    let ready = false;
    let queued: TryPressed[] = [];
    const post = (visible: boolean) =>
      frame.current?.contentWindow?.postMessage(
        { type: TRY_VISIBLE, visible },
        window.location.origin,
      );
    const send = (who: TryPressed) =>
      frame.current?.contentWindow?.postMessage({ type: TRY_PRESS, who }, window.location.origin);
    if (press !== undefined)
      press.current = (who) => {
        const el = box.current;
        if (el !== null) {
          const rect = el.getBoundingClientRect();
          const shown = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
          /* at once: the product does not smooth-scroll (the brand lint's gt-ui/no-smooth-scroll) */
          if (shown < rect.height / 2) el.scrollIntoView({ block: 'start' });
        }
        if (ready) {
          send(who);
          return;
        }
        queued = [...queued.slice(-3), who];
        setState((current) => (current === 'poster' ? 'loading' : current));
      };
    const begin = () => {
      if (cancelled) return;
      const run = () => {
        if (!cancelled) setState((current) => (current === 'poster' ? 'loading' : current));
      };
      if (typeof window.requestIdleCallback === 'function')
        idle = window.requestIdleCallback(run, { timeout: IDLE_CAP_MS });
      else idle = window.setTimeout(run, 200);
    };
    if (document.readyState === 'complete') begin();
    else window.addEventListener('load', begin, { once: true });
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frame.current?.contentWindow || !isTryReady(event.data)) return;
      ready = true;
      setState('live');
      post(onScreen);
      for (const who of queued) send(who);
      queued = [];
      /* the poster leaves once the frame has faded in over it */
      window.setTimeout(() => {
        if (!cancelled) setState('done');
      }, FADE_MS + 50);
    };
    window.addEventListener('message', onMessage);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            if (entry === undefined) return;
            onScreen = entry.isIntersecting;
            post(onScreen);
          });
    if (box.current !== null) observer?.observe(box.current);
    return () => {
      cancelled = true;
      if (press !== undefined) press.current = null;
      window.removeEventListener('load', begin);
      window.removeEventListener('message', onMessage);
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
      observer?.disconnect();
    };
  });
  return (
    <div ref={box} className="site-hero-box" data-hero-box="" data-state={state}>
      {state === 'done' ? null : (
        <ThemePicture
          light={{ wide: heroLight, phone: heroLightPhone }}
          dark={{ wide: heroDark, phone: heroDarkPhone }}
          wideSize={[2560, 1280]}
          phoneSize={[716, 1120]}
          alt={HERO.figure.alt}
          priority
        />
      )}
      {state === 'poster' ? null : (
        <iframe
          ref={frame}
          className="site-hero-frame"
          src={TRY_FRAME_SRC}
          title={HERO.figure.frameTitle}
          allow="fullscreen; clipboard-write"
          loading="eager"
        />
      )}
    </div>
  );
}
