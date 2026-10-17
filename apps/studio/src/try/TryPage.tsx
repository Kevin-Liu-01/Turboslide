import { useState } from 'react';

import { useBlocker } from '@tanstack/react-router';

import { useMountEffect } from '../components/useMountEffect';
import { EditorRoot } from '../editor/EditorRoot';
import type { EditSearch } from '../routes/-edit-search';
import { tryBlocker } from './frame';
import { trySession } from './session';
import type { TrySession } from './session';

/* an interface, because a global augmentation of Window merges into the DOM library's interface */
declare global {
  interface Window {
    /** the specs' handle on the hero's runner and room, on /try alone (docs/SITE.md C.10) */
    turboslideTry?: {
      pause: () => void;
      resume: () => void;
      state: () => ReturnType<TrySession['runner']['state']>;
      entries: () => Promise<unknown[]>;
      versions: () => unknown[];
      visitor: string;
      /** a press as the page's title sends it */
      press: TrySession['press'];
      /** the guests of the title's stacks in the room now */
      guests: () => string[];
    };
  }
}

/**
 * The live editor of the landing (docs/SITE.md D1, C.5): the product's EditorRoot on the hero
 * deck, on the tab backend, with Claude Code and Codex at work. The session is made at the first
 * render, before the editor reads its backend. A navigation away from /try loads a new document in
 * the window around the frame (or in this one, standing alone), so the lockup, File > Open and New
 * Presentation never load a page inside the hero or carry the tab backend into another editor, and
 * a leave never asks for the browser's leave prompt (frame.ts `tryBlocker`). The blocker's
 * options are made once with the session: useBlocker registers again whenever its
 * `shouldBlockFn` changes, so a new object on each render registered the blocker on each render.
 * `still` holds the agents at their first pose (the poster's capture).
 */
export function TryPage({
  search,
  still,
  onSearch,
}: {
  search: EditSearch;
  still: boolean;
  onSearch: (patch: Partial<EditSearch>) => void;
}) {
  const [session] = useState(() => trySession({ win: window, still }));
  const [blocker] = useState(() => tryBlocker(window));
  useBlocker(blocker);
  useMountEffect(() => {
    const stop = session.start();
    window.turboslideTry = {
      pause: () => session.runner.pause(),
      resume: () => session.runner.resume(),
      state: () => session.runner.state(),
      entries: () => session.room.entries(),
      versions: () => [...session.room.versions()],
      visitor: session.visitor.author.principalId,
      press: (who) => session.press(who),
      guests: () => session.guests.active(),
    };
    return () => {
      delete window.turboslideTry;
      stop();
    };
  });
  return (
    <EditorRoot
      payload={session.payload}
      search={search}
      author={session.visitor.author}
      onSearch={onSearch}
      onDeckCreated={() => undefined}
      onController={session.attachVisitor}
    />
  );
}
