import { HOME_SPRITE } from './sprite.generated';

/**
 * A line diagram of the landing (docs/DESIGN.md 8.0 "Diagrams"): one `<use>` of its symbol in the
 * landing's sprite (`scripts/home/sprite.ts` draws the Present, export and agents flows from the B2a
 * sources in the tokens), so the figure costs no script and a few bytes of the document; the
 * outer `<svg>` is the image a screen reader names by the one sentence. The viewBoxes are the
 * symbols' own.
 */
const VIEWBOX = {
  present: '0 0 612 400',
  export: '0 0 612 300',
  agents: '0 0 612 230',
} as const;

export function Diagram({ id, label }: { id: keyof typeof VIEWBOX; label: string }) {
  return (
    <svg className="ts-diagram" viewBox={VIEWBOX[id]} role="img" aria-label={label}>
      <use href={`${HOME_SPRITE}#d-${id}`} />
    </svg>
  );
}
