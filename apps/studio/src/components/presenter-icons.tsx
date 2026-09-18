// The five icons the presenter console draws (previous, next, plus, minus, exit), as the chrome
// draws them: Heroicons 20 solid paths on the 20 unit grid at 16 px with `fill: currentColor`,
// copied verbatim from packages/chrome/src/icons.tsx (`chevron-left`, `chevron-right`, `plus`,
// `minus`, `x-mark`). The presenter route took the chrome's whole icon module (45 KB decoded, one
// record of every path the shell draws, which no bundler can cut) for these five (the focus round,
// cycle 3 stream fix round's fix round; VERIFICATION C2-F18, the `/present` `js decoded` row).
// presenter-icons.test.ts renders each beside the chrome's `Icon` and asserts the same markup, so a
// change of a path in the chrome that is not made here fails a test.
import type { PresentIcons } from '@turboslide/viewer/present/ui';

type PresenterPath = { d: string; evenodd?: boolean };

const PATHS = {
  previous: [
    {
      d: 'M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z',
      evenodd: true,
    },
  ],
  next: [
    {
      d: 'M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z',
      evenodd: true,
    },
  ],
  plus: [
    {
      d: 'M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z',
    },
  ],
  minus: [
    {
      d: 'M4 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75A.75.75 0 0 1 4 10Z',
      evenodd: true,
    },
  ],
  exit: [
    {
      d: 'M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z',
    },
  ],
} satisfies Record<string, readonly PresenterPath[]>;

export type PresenterIconName = keyof typeof PATHS;

/** One glyph as `Icon` of the chrome draws it: the 20 unit grid at 16 px, `currentColor`, decorative. */
export function PresenterIcon({ name }: { name: PresenterIconName }) {
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} fill="currentColor" aria-hidden="true">
      {PATHS[name].map((path: PresenterPath) => (
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

/** The console's icons, handed to `PresenterConsole` in place of its text glyphs. */
export const PRESENTER_ICONS: PresentIcons = {
  previous: <PresenterIcon name="previous" />,
  next: <PresenterIcon name="next" />,
  plus: <PresenterIcon name="plus" />,
  minus: <PresenterIcon name="minus" />,
  exit: <PresenterIcon name="exit" />,
};
