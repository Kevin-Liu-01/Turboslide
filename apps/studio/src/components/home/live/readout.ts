import { HOME_FORMAT_PANEL } from '../chrome.generated';
import { HOME_DECK } from '../deck.generated';
import type { SheetBox } from '../deck.generated';
import type { LiveContext } from './index';
import type { ObjectsController } from './objects';
import { HOME_GLYPHS } from '../sprite.generated';
import { glyph } from './sprite';
import type { ObjectKey } from './state';

/**
 * The canvas band's Format options readout (docs/DESIGN.md 8.5; DR-D4#4): the panel beside the
 * lighthouse shows the box of the object the visitor last touched (the plate at rest) in slide
 * units, whole numbers in tabular figures: Width, Height and Rotate, then X and Y. A gesture
 * writes the fields as it moves (the objects controller's `onChange` hands the live box), and a
 * store change (an Undo, a pose another band wrote) writes them from the store's pose or the
 * object's box at rest. Each section's head takes the panel's glyph (inspector/format-sections.ts,
 * read at build into `HOME_FORMAT_PANEL.icons`) from the landing's sprite, in the room its padding
 * holds, so nothing moves when it lands. A band chunk of its own, started by the registry with the
 * canvas band's objects controller, so the live core carries none of it.
 */
const REST: ReadonlyMap<string, SheetBox> = new Map(
  HOME_DECK.slides.lighthouse.objects.map((o) => [o.id, o.box]),
);

const FIELDS = ['w', 'h', 'r', 'x', 'y'] as const;

export function startReadout(ctx: LiveContext, objects: ObjectsController): void {
  const { band, store } = ctx;
  const out = new Map(
    FIELDS.map((k) => [k, band.querySelector<HTMLElement>(`[data-fo="${k}"]`)] as const),
  );
  let shown: ObjectKey = 'lighthouse#plate';
  for (const [i, head] of band.querySelectorAll('.ts-fo h4').entries()) {
    const name = HOME_FORMAT_PANEL.icons[i] as keyof typeof HOME_GLYPHS | undefined;
    if (name !== undefined && head.firstElementChild === null)
      head.prepend(glyph(HOME_GLYPHS[name]));
  }

  const write = (box: SheetBox | undefined): void => {
    if (box === undefined) return;
    const turn = ((Math.round(box.rot) % 360) + 360) % 360;
    const values = { w: box.w, h: box.h, r: turn, x: box.x, y: box.y };
    for (const k of FIELDS) {
      const el = out.get(k);
      const text = String(Math.round(values[k]));
      if (el !== null && el !== undefined && el.textContent !== text) el.textContent = text;
    }
  };
  const fromStore = (): SheetBox | undefined => store.get().poses[shown] ?? REST.get(shown);

  objects.onChange((sel, box) => {
    if (sel !== null) shown = sel.id;
    write(box ?? fromStore());
  });
  store.subscribe(() => write(fromStore()));
  write(fromStore());
}
