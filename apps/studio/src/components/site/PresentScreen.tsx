import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import { tipProps } from '@turboslide/chrome/Tooltip';

import { PRESENT_SCREEN } from './copy';
import { PRESENT_LAST } from './present-deck';
import { PresentWindows } from './PresentWindows';
import { ScreenHead } from './ScreenHead';

/**
 * The Present screen: the slideshow beside presenter view, both drawn from one slide index
 * (PresentWindows.tsx), then the six keys of a slideshow. The two arrow keys are buttons, and
 * with the focus on either the arrow keys work too: each step moves both windows, the slide, the
 * counter, the next slide and the speaker notes together, through the first four slides of the
 * landing's deck (present-deck.ts). The other keys are listed for what they do in the product.
 */
export function PresentScreen() {
  const [at, setAt] = useState(0);
  const step = (by: number): void => setAt((now) => Math.min(PRESENT_LAST, Math.max(0, now + by)));
  const onKey = (event: KeyboardEvent<HTMLElement>): void => {
    const by = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (by === 0) return;
    event.preventDefault();
    step(by);
  };
  return (
    <section className="site-claim site-pr" id="present" aria-labelledby="site-present-title">
      <ScreenHead titleId="site-present-title" heading={PRESENT_SCREEN.heading} />
      <figure className="site-pr-fig site-wrap" aria-label={PRESENT_SCREEN.windows.name}>
        <PresentWindows at={at} />
      </figure>
      <ul className="site-keys site-wrap" aria-label={PRESENT_SCREEN.keysName} onKeyDown={onKey}>
        {PRESENT_SCREEN.keys.map((entry) => (
          <li key={entry.label}>
            {'step' in entry ? (
              <button
                type="button"
                className="site-keys-item"
                aria-disabled={entry.step < 0 ? at === 0 : at === PRESENT_LAST}
                onClick={() => step(entry.step)}
                {...tipProps({ name: entry.label, doc: entry.doc, key: entry.words })}
              >
                <kbd className="pt-kbd site-kbd">{entry.key}</kbd>
                <span>{entry.label}</span>
              </button>
            ) : (
              <span className="site-keys-item">
                <kbd className="pt-kbd site-kbd">{entry.key}</kbd>
                <span>{entry.label}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
