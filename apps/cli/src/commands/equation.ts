// The equation commands (gslides-parity SPEC-5 8.4, 13; MILESTONES-5 B6 day 3): `equation insert
// <slideId> <tex>` places a block (equation.insert), `equation render <tex>` answers the MathML
// the sheet draws with the box and the parse finding (equation.render), `equation symbols` prints
// the toolbar's table (equation.symbols). The route in cli.ts is the integrator's line (b6.md
// request R8); every command takes --to <studio>, --author <name>, --json and, for the write,
// --base-revision.
import { flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import { baseRevision, openStore } from '../write.ts';

/** The base revision of a write: the flag, else the checkout's current revision; a `--to` studio reads its own. */
async function base(ctx: CommandContext): Promise<number> {
  const flag = flagString(ctx.args, 'base-revision');
  if (flag !== undefined || flagString(ctx.args, 'to') === undefined)
    return baseRevision(ctx, openStore(ctx));
  const state = await runDeckAction<{ revision: number }>(ctx, 'deck.info', {});
  return state.revision;
}

export const EQUATION_USAGE = `usage: turboslide equation <insert|render|symbols> ...
  equation insert <slideId> <tex> [--display block|inline] [--alt <text>] [--pos x,y,w,h]
                                    place an equation block at the centre of the content box, or at the
                                    box given, in one write; an empty source lands the placeholder (equation.insert)
  equation render <tex> [--display block|inline] [--size <px>] [--out mathml|png]
                                    the MathML the sheet draws, the box in sheet px and any parse finding;
                                    --out png writes the 2x raster beside it where a renderer is at hand (equation.render)
  equation symbols --json           Google Docs' five groups and More with each symbol's command, LaTeX,
                                    code point and OMML form (equation.symbols)
Every command takes --to <studio>, --author <name> and --json; insert takes --base-revision <n>.`;

function displayOf(ctx: CommandContext): 'block' | 'inline' | undefined {
  const value = flagString(ctx.args, 'display');
  if (value === undefined) return undefined;
  if (value === 'block' || value === 'inline') return value;
  throw new UsageError(`--display takes block or inline\n${EQUATION_USAGE}`);
}

function posOf(ctx: CommandContext): { x: number; y: number; w: number; h: number } | undefined {
  const value = flagString(ctx.args, 'pos');
  if (value === undefined) return undefined;
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)))
    throw new UsageError(`--pos takes x,y,w,h in sheet px\n${EQUATION_USAGE}`);
  const [x, y, w, h] = parts as [number, number, number, number];
  return { x, y, w, h };
}

export async function equation(ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = ctx.rest;
  switch (sub) {
    case 'insert': {
      const [slideId, tex] = rest;
      if (slideId === undefined || tex === undefined)
        throw new UsageError(`equation insert wants a slide id and a source\n${EQUATION_USAGE}`);
      const display = displayOf(ctx);
      const alt = flagString(ctx.args, 'alt');
      const pos = posOf(ctx);
      const answer = await runDeckAction<{ blockId: string; revision: number }>(
        ctx,
        'equation.insert',
        {
          slideId,
          tex,
          ...(display !== undefined ? { display } : {}),
          ...(alt !== undefined ? { alt } : {}),
          ...(pos !== undefined ? { pos } : {}),
          baseRevision: await base(ctx),
        },
      );
      ctx.out.result(answer);
      ctx.out.human(`${slideId}#${answer.blockId} at revision ${answer.revision}`);
      return 0;
    }
    case 'render': {
      const [tex] = rest;
      if (tex === undefined)
        throw new UsageError(`equation render wants a source\n${EQUATION_USAGE}`);
      const display = displayOf(ctx);
      const size = flagString(ctx.args, 'size');
      const out = flagString(ctx.args, 'out');
      if (out !== undefined && out !== 'mathml' && out !== 'png')
        throw new UsageError(`--out takes mathml or png\n${EQUATION_USAGE}`);
      const answer = await runDeckAction<{
        mathml: string;
        box: [number, number];
        findings: { message: string }[];
        png?: string;
      }>(ctx, 'equation.render', {
        tex,
        ...(display !== undefined ? { display } : {}),
        ...(size !== undefined ? { size: Number(size) } : {}),
        ...(out !== undefined ? { out } : {}),
      });
      ctx.out.result(answer);
      ctx.out.human(answer.mathml);
      ctx.out.human(`box ${answer.box[0]} by ${answer.box[1]} sheet px`);
      for (const finding of answer.findings) ctx.out.human(finding.message);
      if (answer.png !== undefined) ctx.out.human(`png ${answer.png}`);
      return answer.findings.length === 0 ? 0 : 1;
    }
    case 'symbols': {
      const answer = await runDeckAction<{
        groups: {
          id: string;
          label: string;
          symbols: { command: string; latex: string; unicode: string }[];
        }[];
      }>(ctx, 'equation.symbols', {});
      ctx.out.result(answer);
      for (const group of answer.groups) {
        ctx.out.human(`${group.label} (${group.symbols.length})`);
        for (const symbol of group.symbols)
          ctx.out.human(
            `  ${symbol.unicode.padEnd(4)} ${symbol.command.padEnd(20)} ${symbol.latex}`,
          );
      }
      return 0;
    }
    default:
      throw new UsageError(EQUATION_USAGE);
  }
}
