// The flags of `turboslide deck html` and `turboslide slide html` (docs/html-layers.md 6): an
// HtmlLayer read from files, or null for --clear. The CSS and the markup are read as UTF-8 text;
// the action sanitizes both before it stores them.
import { readFileSync } from 'node:fs';
import type { HtmlLayer } from '@turboslide/schema/deck';
import { HTML_LAYER_PLACES } from '@turboslide/schema/deck';
import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';

export function htmlLayerFlags(
  ctx: CommandContext,
  command: string,
  usage: string,
): HtmlLayer | null {
  const clear = flagBoolean(ctx.args, 'clear');
  const cssPath = flagString(ctx.args, 'css');
  const markupPath = flagString(ctx.args, 'markup');
  const place = flagString(ctx.args, 'layer');
  if (clear) {
    if (cssPath !== undefined || markupPath !== undefined || place !== undefined)
      throw new UsageError(`${command} --clear takes no other flag\n${usage}`);
    return null;
  }
  if (cssPath === undefined && markupPath === undefined)
    throw new UsageError(`${command} wants --css <file>, --markup <file> or --clear\n${usage}`);
  if (place !== undefined && !(HTML_LAYER_PLACES as readonly string[]).includes(place))
    throw new UsageError(`${command} --layer is under or over, not ${place}\n${usage}`);
  const read = (path: string): string => readFileSync(path, 'utf8');
  return {
    ...(cssPath !== undefined ? { css: read(cssPath) } : {}),
    ...(markupPath !== undefined ? { markup: read(markupPath) } : {}),
    ...(place !== undefined ? { layer: place as 'under' | 'over' } : {}),
  };
}

/** The one line a human reads after either command. */
export function htmlLayerLine(target: string, html: HtmlLayer | null, revision: number): string {
  if (html === null) return `removed the HTML and CSS of ${target}: revision ${revision}`;
  const parts = [
    html.css !== undefined ? `${html.css.length} characters of CSS` : null,
    html.markup !== undefined
      ? `${html.markup.length} characters of markup ${html.layer ?? 'under'} the blocks`
      : null,
  ].filter((part) => part !== null);
  return `set ${parts.join(' and ')} on ${target}: revision ${revision}`;
}
