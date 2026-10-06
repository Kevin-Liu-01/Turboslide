import type { BandId, BandModule, LiveContext } from './index';
import type { ObjectsController } from './objects';

/**
 * The band registry of the live core (docs/LANDING.md 4.2, 6.3 "The band loader"): each band
 * below the first screen with the entries its chunk starts, and each band's markup, imported when
 * the band nears. A chunk of its own, which the core imports once when it starts watching the
 * bands (index.ts `bands()`), so the core carries one dynamic import in place of one for each
 * entry and each band's markup, and each of their preload lists (docs/DESIGN.md 8.16: the live
 * core stays inside 20,480 B gzip with no net growth). The canvas band's two starts are the core's
 * objects and field printer and the export hint is the core's motion system: the core hands them
 * in (`bandEntries(core)`), so this chunk imports no module of the core and the bundler keeps every
 * one of them in the core's chunk. The canvas band's Format options readout (`readout.ts`,
 * docs/DESIGN.md 8.5) is a chunk of its own, started with the band's objects controller.
 */

/** The core's own starts the registry names: handed in by index.ts. */
export type CoreStarts = {
  startObjects(ctx: LiveContext, band: 'canvas'): ObjectsController | null;
  startCanvasField(ctx: LiveContext): void;
  hintInView(band: HTMLElement, arm: () => void, hint: () => void): void;
};

type Load = () => Promise<BandModule>;

/** The bands below the first screen in the page's order (2.0), each entry in the order it starts. */
export const bandEntries = (core: CoreStarts): ReadonlyMap<BandId, readonly Load[]> =>
  new Map<BandId, readonly Load[]>([
    ['menus', [() => import('./menus')]],
    [
      'canvas',
      [
        async () => ({
          start: (ctx) => {
            const objects = core.startObjects(ctx, 'canvas');
            if (objects !== null)
              void import('./readout').then((m) => m.startReadout(ctx, objects));
          },
        }),
        async () => ({ start: core.startCanvasField }),
      ],
    ],
    ['tailor', [() => import('./tailor')]],
    ['kits', [() => import('./kits')]],
    [
      'agents',
      [
        () => import('./history').then((m) => ({ start: m.startHistory })),
        () => import('./agents').then((m) => ({ start: m.startAgents })),
        () => import('./versions'),
      ],
    ],
    ['people', [() => import('./people')]],
    [
      'present',
      [
        () => import('./show').then((m) => ({ start: m.startShow })),
        () => import('./print').then((m) => ({ start: m.startPrint })),
      ],
    ],
    [
      'export',
      [
        () => import('./seam').then((m) => ({ start: m.startSeam })),
        () =>
          import('./seam').then((m) => ({
            start: (ctx) => core.hintInView(ctx.band, m.armHint, m.hint),
          })),
        () => import('./loupe').then((m) => ({ start: m.startLoupe })),
      ],
    ],
    ['patterns', [() => import('./pattern')]],
    ['close', [() => import('./mark').then((m) => ({ start: m.startMark }))]],
  ]);

export type FillsModule = { FILLS: Readonly<Record<string, string>> };

/**
 * Each band's markup (V1's `bands/<band>.generated.ts`, one module a band so each travels in its
 * band's chunk alone, v2.md R2), imported when the band nears.
 */
const FILL_MODULES: Partial<Record<BandId, () => Promise<FillsModule>>> = {
  canvas: () => import('../bands/canvas.generated'),
  tailor: () => import('../bands/tailor.generated'),
  agents: () => import('../bands/agents.generated'),
  people: () => import('../bands/people.generated'),
  present: () => import('../bands/present.generated'),
  export: () => import('../bands/export.generated'),
  patterns: () => import('../bands/patterns.generated'),
  close: () => import('../bands/close.generated'),
};

/** A band's markup, or null when it has none or its chunk did not load. */
export const fills = (band: BandId): Promise<FillsModule | null> => {
  const load = FILL_MODULES[band];
  if (load === undefined) return Promise.resolve(null);
  return load().catch((error: unknown) => {
    console.error(`the ${band} band's markup did not load`, error);
    return null;
  });
};
