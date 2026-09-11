// fonts.build (SPEC 7.2, 8.4; MILESTONES M2 item 5): `turboslide fonts build [--check] [--json]`
// runs scripts/build-fonts.py, which cuts the static export instances from InterVariable into
// packages/fonts/export/ with fonts.json. The script needs fontTools with brotli, so it runs in
// the repo's Python virtual environment at .turboslide/venv, created here from
// scripts/requirements.txt when it is missing; nothing is installed globally. `--python <bin>`
// (or TURBOSLIDE_PYTHON) names another interpreter that already has the requirements.
// Exit 0 on a build; with --check, exit 1 when the committed set differs from a fresh build.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { flagBoolean, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { EXIT, UsageError } from '../exit.ts';
import { repoRoot } from '../repo.ts';

export type FontsBuildResult = {
  out: string;
  version: string;
  faces: { file: string; family: string; opsz: number; weight: number; bytes: number }[];
  written: string[];
  stale: string[];
};

type Run = { code: number; stdout: string; stderr: string };

function run(bin: string, args: string[], cwd: string): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** The venv interpreter path for a repo root. */
export function venvPython(root: string): string {
  return join(root, '.turboslide', 'venv', 'bin', 'python');
}

/**
 * The interpreter to run the script with: --python, TURBOSLIDE_PYTHON, or the repo venv, which is
 * created and provisioned from scripts/requirements.txt on first use.
 */
export async function ensurePython(
  root: string,
  ctx: CommandContext,
  explicit?: string,
): Promise<string> {
  if (explicit) return explicit;
  const fromEnv = ctx.env.TURBOSLIDE_PYTHON;
  if (fromEnv) return fromEnv;
  const python = venvPython(root);
  const requirements = join(root, 'scripts', 'requirements.txt');
  if (!existsSync(requirements))
    throw new UsageError(`${requirements} is missing; the font build needs its pinned packages`);
  if (!existsSync(python)) {
    ctx.out.human(`fonts: creating ${join(root, '.turboslide', 'venv')} (python3 -m venv)`);
    const venv = await run('python3', ['-m', 'venv', join(root, '.turboslide', 'venv')], root);
    if (venv.code !== 0) throw new UsageError(`python3 -m venv failed: ${venv.stderr.trim()}`);
  }
  const probe = await run(python, ['-c', 'import fontTools, brotli'], root);
  if (probe.code !== 0) {
    ctx.out.human(`fonts: installing scripts/requirements.txt into .turboslide/venv`);
    const pip = await run(python, ['-m', 'pip', 'install', '-q', '-r', requirements], root);
    if (pip.code !== 0) throw new UsageError(`pip install failed: ${pip.stderr.trim()}`);
  }
  return python;
}

export async function fonts(ctx: CommandContext): Promise<number> {
  const [sub] = ctx.rest;
  if (sub !== 'build')
    throw new UsageError(
      `unknown subcommand "fonts ${sub ?? ''}"; use: turboslide fonts build [--check]`,
    );
  const root = repoRoot();
  const script = join(root, 'scripts', 'build-fonts.py');
  if (!existsSync(script)) throw new UsageError(`${script} is missing`);
  const python = await ensurePython(root, ctx, flagString(ctx.args, 'python'));
  const check = flagBoolean(ctx.args, 'check');
  const args = [script, '--json', ...(check ? ['--check'] : [])];
  const out = flagString(ctx.args, 'out');
  if (out) args.push('--out', out);
  ctx.out.human(
    `fonts: ${python} ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`,
  );
  const result = await run(python, args, root);
  if (result.stderr.trim()) ctx.out.warn(result.stderr.trim());
  let parsed: FontsBuildResult;
  try {
    const raw = JSON.parse(result.stdout) as Partial<FontsBuildResult> & { faces?: unknown };
    parsed = {
      out: raw.out ?? '',
      version: raw.version ?? '',
      faces: Array.isArray(raw.faces) ? (raw.faces as FontsBuildResult['faces']) : [],
      written: raw.written ?? [],
      stale: raw.stale ?? [],
    };
  } catch {
    throw new UsageError(
      `build-fonts.py exited ${result.code} without a JSON result${result.stdout.trim() ? `: ${result.stdout.trim()}` : ''}`,
    );
  }
  ctx.out.result(parsed);
  if (check) {
    for (const line of parsed.stale) ctx.out.human(`stale: ${line}`);
    ctx.out.human(
      `fonts build --check: ${parsed.stale.length} stale file(s), version ${parsed.version}`,
    );
    return parsed.stale.length > 0 || result.code !== 0 ? EXIT.findings : EXIT.ok;
  }
  if (result.code !== 0) throw new UsageError(`build-fonts.py exited ${result.code}`);
  for (const face of parsed.faces)
    ctx.out.human(
      `  ${face.file.padEnd(36)} ${face.family.padEnd(28)} opsz ${face.opsz} wght ${face.weight}`,
    );
  ctx.out.human(
    `fonts build: ${parsed.faces.length} faces, ${parsed.written.length} file(s) written under ${parsed.out}, version ${parsed.version}`,
  );
  return EXIT.ok;
}
