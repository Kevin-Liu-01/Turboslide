import { SPRITE } from '@turboslide/theme/sprite';

import type { SectionIconName } from './copy';

/**
 * The Heroicon of a key cell of /home's facts rows (DECK-GRAMMAR 40: an icon sits only in a key
 * cell; docs/NEXT.md 4.1.3 item 9 took it out of the section headings): the icon names the row at
 * the text's colour, 16 px in the key cell (home.css `.ts-product-h2-icon`). All six names come
 * from the theme sprite (`packages/theme/assets/sprite-ids.json`; `cursor-arrow-rays` and
 * `arrow-down-tray` joined it in the polish round, build/b7.md request 5). The sprite's bodies are
 * markup for the renderer's `<use>`; the `<path>` elements are read out once at module load and
 * rendered as React elements, which keeps the page off `dangerouslySetInnerHTML`.
 * `currentColor`, 20 unit grid, decorative.
 */
type PathAttributes = { d: string; evenodd: boolean };

const PATH = /<path\b([^>]*)\/?>/g;
const ATTRIBUTE = /([a-z-]+)="([^"]*)"/g;

function pathsOf(body: string): PathAttributes[] {
  const out: PathAttributes[] = [];
  for (const match of body.matchAll(PATH)) {
    const attributes = new Map<string, string>();
    for (const pair of (match[1] ?? '').matchAll(ATTRIBUTE)) {
      if (pair[1] !== undefined && pair[2] !== undefined) attributes.set(pair[1], pair[2]);
    }
    const d = attributes.get('d');
    if (d !== undefined) out.push({ d, evenodd: attributes.get('fill-rule') === 'evenodd' });
  }
  return out;
}

type Icon = { viewBox: string; paths: PathAttributes[] };

const ICONS: Readonly<Record<SectionIconName, Icon>> = {
  'cursor-arrow-rays': {
    viewBox: SPRITE['cursor-arrow-rays'].viewBox,
    paths: pathsOf(SPRITE['cursor-arrow-rays'].body),
  },
  'bars-3': { viewBox: SPRITE['bars-3'].viewBox, paths: pathsOf(SPRITE['bars-3'].body) },
  play: { viewBox: SPRITE.play.viewBox, paths: pathsOf(SPRITE.play.body) },
  'arrow-down-tray': {
    viewBox: SPRITE['arrow-down-tray'].viewBox,
    paths: pathsOf(SPRITE['arrow-down-tray'].body),
  },
  'command-line': {
    viewBox: SPRITE['command-line'].viewBox,
    paths: pathsOf(SPRITE['command-line'].body),
  },
  'document-text': {
    viewBox: SPRITE['document-text'].viewBox,
    paths: pathsOf(SPRITE['document-text'].body),
  },
};

export function SectionIcon({ name }: { name: SectionIconName }) {
  const icon = ICONS[name];
  return (
    <svg
      className="ts-product-h2-icon"
      viewBox={icon.viewBox}
      width={20}
      height={20}
      fill="currentColor"
      aria-hidden="true"
      data-icon={name}
    >
      {icon.paths.map((path) => (
        <path
          key={path.d}
          d={path.d}
          fillRule={path.evenodd ? 'evenodd' : undefined}
          clipRule={path.evenodd ? 'evenodd' : undefined}
        />
      ))}
    </svg>
  );
}
