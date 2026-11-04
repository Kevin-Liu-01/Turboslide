import { CHAPTER_FIELDS } from './chapter-fields';
import { ChapterBox } from './ChapterBox';
import { STORY } from './copy';
import { Frame } from './Frame';
import { SiteField } from './SiteField';

/**
 * The chapters after the hero (docs/SITE.md 5, "The chapters"; Kevin, 2026-11-03): one section
 * each, its Title Case heading and one sentence beside a live editor that plays the chapter in the
 * hero's deck (ChapterBox.tsx, try/story.ts): agents editing beside you, the features, editing
 * together, the slideshow. Each section is printed over a glyph field of its own, the hero's
 * motif set in the source of what its editor does (chapter-fields.ts): a globe behind the agents,
 * a column chart under the features, people's pointers round the room, the play glyph on the
 * slideshow's dark band. The four lay out differently (site.css, `data-chapter`): the copy left
 * of the editor, then right of it, then over it, then under it on the dark band. The copy keeps
 * its cells clear of the field (`data-field-clear`). The text is static HTML; each field prints
 * and each editor loads as its section nears the window.
 */
export function Chapters() {
  return (
    <>
      {STORY.chapters.map((chapter, i) => {
        const field = CHAPTER_FIELDS[chapter.id];
        return (
          <section
            key={chapter.id}
            className="site-chapter"
            data-chapter={chapter.id}
            aria-labelledby={`site-chapter-${chapter.id}`}
          >
            <SiteField art={field.art} source={field.source} />
            <div className="site-chapter-in site-wrap">
              <header className="site-chapter-head" data-field-clear="">
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
            </div>
          </section>
        );
      })}
    </>
  );
}
