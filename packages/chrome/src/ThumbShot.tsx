import { useState } from 'react';

import { cn } from './lib/cn';
import type { ShellItem } from './shell-data';

/**
 * A captured thumbnail: light and dark image twins from item.shot, the dark
 * one shown under html[data-theme='dark'] by CSS alone (Sidebar.css), so a
 * theme switch costs no render. Fills whatever frame holds it with
 * object-fit cover from the top. Without a shot, or when the light file
 * fails to load, it draws the blank plate with the item number. A shot with
 * no dark twin is wrapped in .pt-shot-mat, which insets it on a --pt-plate
 * ground with a --pt-hair rule in the dark theme. Ported from
 * Prototemplate/src/components/viewer/ThumbShot.tsx; M1 draws live clones
 * (@turboslide/viewer LiveClone) and this component serves the static
 * thumbnails of M3 (SPEC 5.5).
 */
export type ThumbShotProps = { item: ShellItem };

export function ThumbShot({ item }: ThumbShotProps) {
  const [lightBroken, setLightBroken] = useState(false);
  const [darkBroken, setDarkBroken] = useState(false);
  const shot = item.shot;

  if (!shot || lightBroken) {
    return (
      <div className="pt-plate" aria-hidden="true">
        {item.n || item.title.charAt(0)}
      </div>
    );
  }

  const dark = shot.dark && !darkBroken ? shot.dark : null;
  const light = (
    <img
      className={cn('pt-shot is-light', dark !== null && 'has-dark')}
      src={shot.light}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setLightBroken(true)}
    />
  );
  if (dark === null) {
    return <span className="pt-shot-mat">{light}</span>;
  }
  return (
    <>
      {light}
      <img
        className="pt-shot is-dark"
        src={dark}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setDarkBroken(true)}
      />
    </>
  );
}
