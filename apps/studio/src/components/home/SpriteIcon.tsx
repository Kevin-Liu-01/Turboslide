import { SPRITE } from '@turboslide/theme/sprite';

import type { CardIcon } from './copy';

/**
 * A Heroicon of the theme sprite drawn inline (gslides-parity SPEC-4 0.19: the Text, Tables,
 * Quality gates and Charts cards carry `i-bars-3-bottom-left`, `i-table-cells`, `i-check-badge`
 * and `i-presentation-chart-bar` from `packages/theme/assets/sprite-ids.json`). The sprite module
 * holds each symbol's body as markup for the renderer's `<use>`; this page has no sprite mounted,
 * so the `<path>` elements are read out of the body once at module load and rendered as React
 * elements, which keeps the page off `dangerouslySetInnerHTML` (scripts/check.mjs step 6 counts
 * every call site). `currentColor`, 20 unit grid, decorative (`aria-hidden`).
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

const ICON_PATHS: Readonly<Record<CardIcon, PathAttributes[]>> = {
  'bars-3-bottom-left': pathsOf(SPRITE['bars-3-bottom-left'].body),
  'table-cells': pathsOf(SPRITE['table-cells'].body),
  'check-badge': pathsOf(SPRITE['check-badge'].body),
  'presentation-chart-bar': pathsOf(SPRITE['presentation-chart-bar'].body),
};

export type SpriteIconProps = { name: CardIcon; size?: number; className?: string };

export function SpriteIcon({ name, size = 28, className }: SpriteIconProps) {
  return (
    <svg
      className={className}
      viewBox={SPRITE[name].viewBox}
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      data-icon={SPRITE[name].id}
    >
      {ICON_PATHS[name].map((path) => (
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
