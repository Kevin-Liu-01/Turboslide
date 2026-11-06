import { useRef } from 'react';

import { useMountEffect } from '../useMountEffect';
import { attachChapterBox } from './frame-boxes';

/**
 * A chapter's live editor (docs/SITE.md 5, "The chapters"): the box, which keeps its size and
 * shows paper until `attachChapterBox` (frame-boxes.ts) loads the frame of /try that plays the
 * chapter (try/story.ts) as the box nears the window. This component calls it on mount; on /home's
 * static load the page's script does (home-entry.ts).
 */
export function ChapterBox({ chapter, title }: { chapter: number; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  useMountEffect(() => (box.current === null ? undefined : attachChapterBox(box.current)));
  return (
    <div
      ref={box}
      className="site-chapter-box"
      data-chapter={chapter}
      data-state="empty"
      data-frame-title={title}
    />
  );
}
