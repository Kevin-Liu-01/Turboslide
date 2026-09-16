// The motion commands (gslides-parity SPEC-5 2.5, 13; MILESTONES-5 B1): `motion transition`,
// `motion add`, `motion update`, `motion remove`, `motion reorder` and `motion compile`, each the
// CLI form of one action of apps/cli/src/actions/motion.ts through `runDeckAction`, so the same
// handler serves the checkout, a studio named by `--to`, the MCP server and the HTTP surface. The
// writes take `--base-revision` like every deck write (the current revision by default).
import { flagBoolean, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { runDeckAction } from '../dispatch.ts';
import { UsageError } from '../exit.ts';
import { baseRevision, openStore } from '../write.ts';

export const MOTION_USAGE = `usage: turboslide motion <transition|add|update|remove|reorder|compile> ...
  motion transition <slideId> [--kind none|dissolve|fade|slideRight|slideLeft|flip|cube|gallery]
                    [--duration <ms>] [--all]
                                    the slide's transition into it; --all copies it to every slide (motion.setTransition)
  motion add <slideId> <blockIds> [--effect <effect>] [--direction left|right|top|bottom]
                    [--trigger click|afterPrevious|withPrevious] [--duration <ms>] [--by-paragraph] [--at <index>]
                                    one animation per block, Appear on click at 500 ms unless set (motion.add)
  motion update <slideId> <animationId> [--effect] [--direction|--no-direction] [--trigger] [--duration]
                    [--by-paragraph|--no-by-paragraph]
                                    rewrite one animation's fields (motion.update)
  motion remove <slideId> <animationId> | motion remove <slideId> --block <blockId>
                                    remove one animation, or every animation of a block (motion.remove)
  motion reorder <slideId> <ids>    the whole play order, comma separated (motion.reorder)
  motion compile <slideId> [--json] the click steps of the slide as the show plays them (motion.compile)
Every write takes --base-revision <n>, --author <name>, --note <text> and --json; blockIds and ids are comma separated.`;

function list(word: string | undefined): string[] {
  return (word ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function optional<T extends string>(value: string | undefined): T | undefined {
  return value === undefined ? undefined : (value as T);
}

function duration(ctx: CommandContext): number | undefined {
  const raw = flagString(ctx.args, 'duration');
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new UsageError(`--duration wants whole milliseconds, got ${raw}`);
  return n;
}

/** The base revision of a write: the flag, else the checkout's current revision; a `--to` studio reads its own. */
async function base(ctx: CommandContext): Promise<number> {
  const flag = flagString(ctx.args, 'base-revision');
  if (flag !== undefined || flagString(ctx.args, 'to') === undefined)
    return baseRevision(ctx, openStore(ctx));
  const state = await runDeckAction<{ revision: number }>(ctx, 'deck.info', {});
  return state.revision;
}

export async function motion(ctx: CommandContext): Promise<number> {
  const [sub, slideId, third] = ctx.rest;
  if (sub === undefined || slideId === undefined) throw new UsageError(MOTION_USAGE);
  switch (sub) {
    case 'transition': {
      const kind = flagString(ctx.args, 'kind');
      const durationMs = duration(ctx);
      const all = flagBoolean(ctx.args, 'all') || flagBoolean(ctx.args, 'apply-to-all');
      const answer = await runDeckAction<{
        slideIds: string[];
        transition: unknown;
        revision: number;
      }>(ctx, 'motion.setTransition', {
        slideId,
        ...(kind !== undefined ? { kind } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(all ? { applyToAll: true } : {}),
        baseRevision: await base(ctx),
      });
      ctx.out.result(answer);
      ctx.out.human(
        `transition ${JSON.stringify(answer.transition)} on ${answer.slideIds.length} slide(s): revision ${answer.revision}`,
      );
      return 0;
    }
    case 'add': {
      const blockIds = list(third);
      if (blockIds.length === 0)
        throw new UsageError(`motion add wants block ids\n${MOTION_USAGE}`);
      const durationMs = duration(ctx);
      const at = flagString(ctx.args, 'at');
      const answer = await runDeckAction<{ ids: string[]; revision: number }>(ctx, 'motion.add', {
        slideId,
        blockIds,
        ...(flagString(ctx.args, 'effect') !== undefined
          ? { effect: optional(flagString(ctx.args, 'effect')) }
          : {}),
        ...(flagString(ctx.args, 'direction') !== undefined
          ? { direction: optional(flagString(ctx.args, 'direction')) }
          : {}),
        ...(flagString(ctx.args, 'trigger') !== undefined
          ? { trigger: optional(flagString(ctx.args, 'trigger')) }
          : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(flagBoolean(ctx.args, 'by-paragraph') ? { byParagraph: true } : {}),
        ...(at !== undefined ? { at: flagNumber(ctx.args, 'at', 0) } : {}),
        baseRevision: await base(ctx),
      });
      ctx.out.result(answer);
      ctx.out.human(`added ${answer.ids.join(', ')} on ${slideId}: revision ${answer.revision}`);
      return 0;
    }
    case 'update': {
      if (third === undefined)
        throw new UsageError(`motion update wants an animation id\n${MOTION_USAGE}`);
      const durationMs = duration(ctx);
      const noDirection = flagBoolean(ctx.args, 'no-direction');
      const byParagraph = flagBoolean(ctx.args, 'by-paragraph')
        ? true
        : flagBoolean(ctx.args, 'no-by-paragraph')
          ? false
          : undefined;
      const answer = await runDeckAction<{ animation: unknown; revision: number }>(
        ctx,
        'motion.update',
        {
          slideId,
          animationId: third,
          ...(flagString(ctx.args, 'effect') !== undefined
            ? { effect: optional(flagString(ctx.args, 'effect')) }
            : {}),
          ...(noDirection
            ? { direction: null }
            : flagString(ctx.args, 'direction') !== undefined
              ? { direction: optional(flagString(ctx.args, 'direction')) }
              : {}),
          ...(flagString(ctx.args, 'trigger') !== undefined
            ? { trigger: optional(flagString(ctx.args, 'trigger')) }
            : {}),
          ...(durationMs !== undefined ? { durationMs } : {}),
          ...(byParagraph !== undefined ? { byParagraph } : {}),
          baseRevision: await base(ctx),
        },
      );
      ctx.out.result(answer);
      ctx.out.human(
        `updated ${third} on ${slideId}: ${JSON.stringify(answer.animation)}; revision ${answer.revision}`,
      );
      return 0;
    }
    case 'remove': {
      const blockId = flagString(ctx.args, 'block');
      if ((third === undefined) === (blockId === undefined))
        throw new UsageError(
          `motion remove wants an animation id or --block <blockId>\n${MOTION_USAGE}`,
        );
      const answer = await runDeckAction<{ removed: string[]; revision: number }>(
        ctx,
        'motion.remove',
        {
          slideId,
          ...(third !== undefined ? { animationId: third } : { blockId }),
          baseRevision: await base(ctx),
        },
      );
      ctx.out.result(answer);
      ctx.out.human(
        `removed ${answer.removed.join(', ')} on ${slideId}: revision ${answer.revision}`,
      );
      return 0;
    }
    case 'reorder': {
      const order = list(third);
      if (order.length === 0)
        throw new UsageError(`motion reorder wants the animation ids in order\n${MOTION_USAGE}`);
      const answer = await runDeckAction<{ animations: { id: string }[]; revision: number }>(
        ctx,
        'motion.reorder',
        { slideId, order, baseRevision: await base(ctx) },
      );
      ctx.out.result(answer);
      ctx.out.human(
        `order ${answer.animations.map((row) => row.id).join(', ')} on ${slideId}: revision ${answer.revision}`,
      );
      return 0;
    }
    case 'compile': {
      const answer = await runDeckAction<{
        steps: {
          effects: {
            animation: { id: string; blockId: string; effect: string };
            delayMs: number;
            durationMs: number;
            paragraph?: number;
          }[];
          durationMs: number;
        }[];
        hiddenAtStart: string[];
        transition: { kind: string; durationMs: number } | null;
        skipped: { animationId: string; reason: string }[];
      }>(ctx, 'motion.compile', { slideId });
      ctx.out.result(answer);
      ctx.out.human(
        `${slideId}: ${Math.max(0, answer.steps.length - 1)} click step(s) after the entry step; transition ${answer.transition === null ? 'none' : `${answer.transition.kind} ${answer.transition.durationMs} ms`}; hidden at start ${answer.hiddenAtStart.join(', ') || 'nothing'}`,
      );
      answer.steps.forEach((step, index) => {
        const label = index === 0 ? 'entry' : `click ${index}`;
        const effects = step.effects
          .map(
            (row) =>
              `${row.animation.id} ${row.animation.effect} ${row.animation.blockId}${row.paragraph !== undefined ? `/${row.paragraph}` : ''} at ${row.delayMs} for ${row.durationMs}`,
          )
          .join('; ');
        ctx.out.human(`  ${label} (${step.durationMs} ms): ${effects || 'nothing'}`);
      });
      for (const row of answer.skipped)
        ctx.out.human(`  skipped ${row.animationId}: ${row.reason}`);
      return 0;
    }
    default:
      throw new UsageError(MOTION_USAGE);
  }
}
