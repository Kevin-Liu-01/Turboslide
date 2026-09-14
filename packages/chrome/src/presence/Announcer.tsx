import { useEffect, useRef, useState } from 'react';

import type { DeckDocument } from '@turboslide/schema/deck';

import type { EditorPresence } from '../editor-shell';
import { Announcer as AnnouncerModel } from './presence-model';
import type { ViewerFacts } from './presence-model';

/**
 * The collaborator announcements (gslides-parity SPEC-3 0.42, 4.9): an `aria-live="polite"`
 * region the Tools > Accessibility settings row turns on, which says "Maya joined", "Maya left"
 * and "Kai is editing slide 4", coalesced to one sentence per 5 s per person by the model. The
 * region is always in the DOM at zero size so turning it on moves nothing; it speaks only while
 * `on` is true.
 */
export type AnnouncerProps = {
  on: boolean;
  presence: EditorPresence | undefined;
  document: DeckDocument;
  viewer: ViewerFacts;
};

export function AnnouncerRegion({ on, presence, document, viewer }: AnnouncerProps) {
  const model = useRef(new AnnouncerModel());
  const [lines, setLines] = useState<string[]>([]);
  const others = presence?.others;
  useEffect(() => {
    const spoken = model.current.update(others ?? [], viewer, document, Date.now());
    if (on && spoken.length > 0) setLines(spoken);
  }, [others, on, viewer, document]);
  return (
    <div
      className="ts-announce"
      aria-live={on ? 'polite' : 'off'}
      aria-atomic="false"
      data-control="presence.announcements"
      data-on={on ? '' : undefined}
    >
      {on ? lines.map((line, i) => <p key={`${i}:${line}`}>{line}</p>) : null}
    </div>
  );
}
