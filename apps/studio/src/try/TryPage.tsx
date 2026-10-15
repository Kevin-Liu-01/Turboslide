import { useState } from 'react';

import { useBlocker } from '@tanstack/react-router';

import { useMountEffect } from '../components/useMountEffect';
import { EditorRoot } from '../editor/EditorRoot';
import type { EditSearch } from '../routes/-edit-search';
import { framingWindow, topWindow } from './frame';
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
    };
  }
}

/**
 * The live editor of the landing (docs/SITE.md D1, C.5): the product's EditorRoot on the hero
 * deck, on the tab backend, with Claude Code and Codex at work. The session is made at the first
 * render, before the editor reads its backend. A navigation away from /try leaves for the window
 * around the frame, so the lockup, File > Open and New Presentation never load a page inside the
 * hero. `still` holds the agents at their first pose (the poster's capture).
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
  useBlocker({
    shouldBlockFn: ({ next }) => {
      if (next.pathname === '/try') return false;
      if (framingWindow(window) === null) return false;
      const query = new URLSearchParams(next.search as Record<string, string>).toString();
      topWindow(window).location.assign(`${next.pathname}${query === '' ? '' : `?${query}`}`);
      return true;
    },
  });
  useMountEffect(() => {
    const stop = session.start();
    window.turboslideTry = {
      pause: () => session.runner.pause(),
      resume: () => session.runner.resume(),
      state: () => session.runner.state(),
      entries: () => session.room.entries(),
      versions: () => [...session.room.versions()],
      visitor: session.visitor.author.principalId,
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
