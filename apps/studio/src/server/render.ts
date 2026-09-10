/**
 * The one renderer the studio calls (SPEC 5.2, 5.3): @turboslide/render's
 * renderSlide, so the viewer shows the same HTML the CLI screenshots and the
 * exporters measure. The studio reads the RenderedSlide shape only.
 */
export { renderSlide, slideOrder, slideTitle } from '@turboslide/render/slide';
export type { RenderOptions, RenderedSlide } from '@turboslide/render/slide';
export type { Deck, Slide } from '@turboslide/schema/deck';
