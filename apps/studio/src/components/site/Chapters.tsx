import { ChapterBox } from './ChapterBox';
import { STORY } from './copy';
import { Frame } from './Frame';

/**
 * The chapters after the hero (docs/SITE.md 5, "The chapters"; Kevin, 2026-11-03): one section
 * each, its Title Case heading and one sentence in the first four columns beside a live editor in
 * the other eight that plays the chapter in the hero's deck (ChapterBox.tsx, try/story.ts): agents
 * editing beside you, the features, editing together, the slideshow. Under the layout breakpoint a
 * section is one column. The text is static HTML; each editor loads as its section nears the
 * window.
 */
export function Chapters() {
  return (
    <>
      {STORY.chapters.map((chapter, i) => (
        <section
          key={chapter.id}
          className="site-chapter site-wrap"
          aria-labelledby={`site-chapter-${chapter.id}`}
        >
          <header className="site-chapter-head">
            <h2 id={`site-chapter-${chapter.id}`} className="t-title">
              {chapter.heading}
            </h2>
            <p className="t-lead">{chapter.lead}</p>
          </header>
          <figure className="site-fig site-chapter-fig">
            <Frame>
              <ChapterBox chapter={i + 1} title={STORY.frameTitle(chapter.heading)} />
            </Frame>
          </figure>
        </section>
      ))}
    </>
  );
}
