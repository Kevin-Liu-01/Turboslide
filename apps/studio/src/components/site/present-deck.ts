import deckJson from '../../../home-deck/deck.json?raw';
import getsJson from '../../../home-deck/slides/gets.json?raw';
import lighthouseJson from '../../../home-deck/slides/lighthouse.json?raw';
import planJson from '../../../home-deck/slides/plan.json?raw';
import shipsJson from '../../../home-deck/slides/ships.json?raw';
import titleJson from '../../../home-deck/slides/title.json?raw';

/**
 * The slides the Present screen walks (PresentScreen.tsx): the first four slides of the landing's
 * own deck (`apps/studio/home-deck`, "Onboarding plan") with their speaker notes, read from the
 * deck's files, so the slideshow and presenter view show the deck's own words and its own slide
 * count. The fifth slide, the lighthouse, is only ever the next slide's preview. Each slide is
 * reduced to what a small drawing of it shows: its kind's layout, its heading, its lead or rows,
 * and its notes.
 */
export type PresentRow = { key: string; value: string };

export type PresentSlide =
  | { id: string; kind: 'title'; heading: string; lead: string; notes: string }
  | { id: string; kind: 'rows'; heading: string; lead: string; rows: PresentRow[]; notes: string }
  | { id: string; kind: 'statement'; heading: string; notes: string }
  | { id: string; kind: 'mood'; heading: string; notes: string };

type Block = { id: string; type: string; text?: string; items?: PresentRow[] };
type SlideFile = {
  id: string;
  kind: string;
  heading?: string;
  lead?: string;
  big?: string;
  notes?: string;
  slots?: Record<string, Block[]>;
  plate?: { blocks: Block[] };
};

const blocksOf = (slide: SlideFile): Block[] => Object.values(slide.slots ?? {}).flat();

function read(source: string): PresentSlide {
  const slide = JSON.parse(source) as SlideFile;
  const notes = slide.notes ?? '';
  if (slide.kind === 'title')
    return {
      id: slide.id,
      kind: 'title',
      heading: slide.heading ?? '',
      lead: slide.lead ?? '',
      notes,
    };
  if (slide.kind === 'statement')
    return { id: slide.id, kind: 'statement', heading: slide.big ?? '', notes };
  if (slide.kind === 'mood') {
    const heading = slide.plate?.blocks.find((block) => block.type === 'heading')?.text ?? '';
    return { id: slide.id, kind: 'mood', heading, notes };
  }
  const blocks = blocksOf(slide);
  return {
    id: slide.id,
    kind: 'rows',
    heading: blocks.find((block) => block.type === 'heading')?.text ?? '',
    lead: blocks.find((block) => block.type === 'paragraph')?.text ?? '',
    rows: blocks.find((block) => block.type === 'rows')?.items ?? [],
    notes,
  };
}

const deck = JSON.parse(deckJson) as { title: string; sections: { slideIds: string[] }[] };

/** The deck's title, as presenter view's head shows it. */
export const PRESENT_DECK_TITLE: string = deck.title;
/** Every slide of the deck, for the counter's total. */
export const PRESENT_DECK_TOTAL: number = deck.sections.flatMap((s) => s.slideIds).length;
/** The four slides the windows move through, then the lighthouse as the last preview. */
export const PRESENT_SLIDES: readonly PresentSlide[] = [
  titleJson,
  planJson,
  getsJson,
  shipsJson,
  lighthouseJson,
].map(read);
/** The last slide the windows show; the slide after it appears only as the next slide. */
export const PRESENT_LAST = PRESENT_SLIDES.length - 2;
