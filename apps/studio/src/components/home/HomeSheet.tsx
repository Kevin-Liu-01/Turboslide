import { HOME_SLIDE_HTML } from './slides.generated';
import type { HomeInstanceId } from './slides.generated';

/**
 * One rendered slide of the page deck in its 16 by 9 stage (docs/LANDING.md 2.0 "Slides"): the
 * `renderSlide` output of `slides.generated.ts`, inlined by the server only. The wrapper is the
 * query container whose inline size is the sheet's width; the sheet inside it is the renderer's
 * 1,600 by 900 px stage scaled by `--k`, `100cqw / 1600px` as a number (home.css), so 1 sheet
 * unit is 1/1,600 of the wrapper. The module is read behind `import.meta.env.SSR`, which the
 * client build folds to false, so Rollup drops slides.generated.ts from the route chunk; on the
 * client the wrapper renders an empty `dangerouslySetInnerHTML` with `suppressHydrationWarning`,
 * and React leaves the server's markup in place after hydration. No sheet wider than a thumbnail
 * draws a frame (its edge is its own rails); a thumbnail keeps the 1 px edge.
 *
 * Below the first screen (docs/LANDING.md 2.0, 4.2) a sheet is a placeholder: `fill` renders the
 * same element empty with `data-fill="<instance>"`, at its final size, and the band loader writes
 * it from `bands.generated.ts` `BAND_FILLS[band][instance]` when the band's chunk arrives.
 */
export function HomeSheet({
  instance,
  fill = false,
  className,
  label,
  hidden = false,
}: ({ instance: HomeInstanceId; fill?: false } | { instance: string; fill: true }) & {
  className?: string;
  /** the slide's name for assistive technology when the sheet is not inside a named control */
  label?: string;
  /** a sheet the band shows later (the second slide of a people screen) */
  hidden?: boolean;
}) {
  const thumb = /^(hero|tailor)-thumb-/.test(instance);
  const html = !fill && import.meta.env.SSR ? HOME_SLIDE_HTML[instance as HomeInstanceId].html : '';
  return (
    <div
      className={`ts-home-sheet${thumb ? ' is-thumb' : ''}${className ? ` ${className}` : ''}`}
      data-sheet={instance}
      {...(fill ? { 'data-fill': instance } : {})}
      {...(hidden ? { hidden: true } : {})}
      {...(label !== undefined ? { role: 'group', 'aria-label': label } : {})}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Markup the server writes from a module the route chunk must not carry (the agents band's panel
 * and rows, the stills' stylesheet, the Editable text side): the same empty-on-the-client form as
 * `HomeSheet`, so hydration leaves the server's markup alone. The caller writes
 * `html={import.meta.env.SSR ? make() : ''}`, so every reference to the server's module sits in the
 * branch the client build drops.
 */
export function ServerHtml({
  as: Tag = 'div',
  html,
  ...rest
}: {
  as?: 'div' | 'ol' | 'style' | 'p' | 'span' | 'code';
  html: string;
} & Record<string, unknown>) {
  return <Tag {...rest} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
