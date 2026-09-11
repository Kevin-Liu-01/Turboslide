import { describe, expect, it } from 'vitest';

import { parseArgs } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { UsageError } from '../exit.ts';
import { createOutput } from '../output.ts';
import { repoRoot } from '../repo.ts';
import { ensurePython, fonts, venvPython } from './fonts.ts';

function context(
  argv: string[],
  env: NodeJS.ProcessEnv = {},
): CommandContext & { lines: string[] } {
  const lines: string[] = [];
  const args = parseArgs(argv);
  const [, ...rest] = args.positionals;
  return {
    args,
    out: createOutput(true, { stdout: (t) => lines.push(t), stderr: (t) => lines.push(t) }),
    cwd: repoRoot(),
    env,
    author: { kind: 'human', name: 'test' },
    rest,
    readStdin: async () => '',
    lines,
  };
}

describe('turboslide fonts', () => {
  it('names the repo venv and honors --python and TURBOSLIDE_PYTHON', async () => {
    expect(venvPython('/r')).toBe('/r/.turboslide/venv/bin/python');
    const ctx = context(['fonts', 'build']);
    expect(await ensurePython('/r', ctx, '/usr/bin/python3')).toBe('/usr/bin/python3');
    expect(
      await ensurePython('/r', context(['fonts', 'build'], { TURBOSLIDE_PYTHON: '/opt/py' })),
    ).toBe('/opt/py');
  });

  it('rejects an unknown subcommand with a usage error', async () => {
    await expect(fonts(context(['fonts', 'frobnicate']))).rejects.toThrow(UsageError);
  });

  // The full check rebuilds 17 faces (about 50 s); it runs when TURBOSLIDE_FONTS_CHECK is set.
  it.runIf(process.env.TURBOSLIDE_FONTS_CHECK === '1')(
    'reports the committed set current with --check',
    async () => {
      const ctx = context(['fonts', 'build', '--check']);
      const code = await fonts(ctx);
      expect(code).toBe(0);
      const result = JSON.parse(ctx.lines.find((l) => l.startsWith('{')) ?? '{}') as {
        stale: string[];
        faces: unknown[];
      };
      expect(result.stale).toEqual([]);
      expect(result.faces).toHaveLength(17);
    },
    180_000,
  );
});
