import { SPRITE } from '@turboslide/theme/sprite';

import type { SectionIconName } from './copy';

/**
 * The 20 px Heroicon before every section heading of /home (docs/POLISH.md 3.2, 3.3 item 3):
 * the icon names the section at the text's size and colour, so no card box has to. Four of the
 * six come from the theme sprite (`packages/theme/assets/sprite-ids.json`); the sprite carries
 * no `cursor-arrow-rays` and no `arrow-down-tray`, so those two are the same Heroicons 20 solid
 * paths (MIT, tailwindlabs/heroicons, the sprite's source) inline until the sprite takes them
 * (build/b7.md, a request). The sprite's bodies are markup for the renderer's `<use>`; the
 * `<path>` elements are read out once at module load and rendered as React elements, which keeps
 * the page off `dangerouslySetInnerHTML`. `currentColor`, 20 unit grid, decorative.
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

/** Heroicons 20 solid, `optimized/20/solid/<name>.svg`, as published by tailwindlabs/heroicons (MIT). */
const INLINE: Readonly<Record<'cursor-arrow-rays' | 'arrow-down-tray', PathAttributes[]>> = {
  'cursor-arrow-rays': [
    {
      d: 'M10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 1ZM5.05 3.05a.75.75 0 0 1 1.06 0l1.062 1.06A.75.75 0 1 1 6.11 5.173L5.05 4.11a.75.75 0 0 1 0-1.06ZM14.95 3.05a.75.75 0 0 1 0 1.06l-1.06 1.062a.75.75 0 0 1-1.062-1.061l1.061-1.06a.75.75 0 0 1 1.06 0ZM3 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 3 8ZM14 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 14 8ZM7.172 10.828a.75.75 0 0 1 0 1.061L6.11 12.95a.75.75 0 0 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0ZM10.766 7.51a.75.75 0 0 0-1.37.365l-.492 6.861a.75.75 0 0 0 1.204.65l1.043-.799.985 3.678a.75.75 0 0 0 1.45-.388l-.978-3.646 1.292.204a.75.75 0 0 0 .74-1.16l-3.874-5.764Z',
      evenodd: false,
    },
  ],
  'arrow-down-tray': [
    {
      d: 'M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z',
      evenodd: false,
    },
    {
      d: 'M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z',
      evenodd: false,
    },
  ],
};

type Icon = { viewBox: string; paths: PathAttributes[] };

const ICONS: Readonly<Record<SectionIconName, Icon>> = {
  'cursor-arrow-rays': { viewBox: '0 0 20 20', paths: INLINE['cursor-arrow-rays'] },
  'bars-3': { viewBox: SPRITE['bars-3'].viewBox, paths: pathsOf(SPRITE['bars-3'].body) },
  play: { viewBox: SPRITE.play.viewBox, paths: pathsOf(SPRITE.play.body) },
  'arrow-down-tray': { viewBox: '0 0 20 20', paths: INLINE['arrow-down-tray'] },
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
