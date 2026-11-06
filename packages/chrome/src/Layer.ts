// The Layer primitive's React doorway (docs/DESIGN.md 2.3): `useLayer` puts a surface in the top
// layer at its layer of the scale while it is open. The manager behind it, plain DOM, is
// top-layer.ts, which says what the top layer and the scale's order are; its names stay
// importable from this module, where every caller found them.
import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

import { closeLayer, leaveExitCopy, openLayer } from './top-layer';
import type { LayerName, ScrollMarks } from './top-layer';

export {
  EXIT_COPY_MS,
  closeLayer,
  openLayer,
  openLayers,
  resetLayersForTests,
  topLayerSupported,
} from './top-layer';
export type { LayerEntry, LayerName } from './top-layer';

export type UseLayerOptions = {
  /** the layer of the scale the surface belongs to */
  layer: LayerName;
  /** false while the surface is closed; true when absent (the surface mounts open) */
  open?: boolean;
  /**
   * leaves an exit copy when the surface leaves the document as it closes (`leaveExitCopy`); the
   * surface's sheet draws the copy's `[data-exiting]` animation. False when absent.
   */
  exit?: boolean;
};

/**
 * The hook every floating surface uses: while `open` is true and the ref holds an element, the
 * element is in the top layer at its layer; on close or unmount it leaves. Runs in a layout effect,
 * so the surface never paints a frame outside its layer. With `exit`, the copy is made in a
 * microtask after the commit, when React has removed the element and before the browser paints.
 */
export function useLayer(ref: RefObject<HTMLElement | null>, options: UseLayerOptions): void {
  const { layer, open: isOpen = true, exit = false } = options;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!isOpen || element === null) return undefined;
    const parent = element.parentElement;
    const entry = openLayer(element, layer);
    if (!exit) return () => closeLayer(element);
    /* scroll offsets are read as they change, since an element React already removed reads 0 */
    const scrolled: ScrollMarks = new Map();
    const onScroll = (event: Event) => {
      if (event.target instanceof Element)
        scrolled.set(event.target, { top: event.target.scrollTop, left: event.target.scrollLeft });
    };
    element.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll, { capture: true });
      closeLayer(element);
      queueMicrotask(() => void leaveExitCopy(element, entry, parent, scrolled));
    };
  }, [ref, layer, isOpen, exit]);
}
