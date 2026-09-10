// `turboslide generate` is the contracts generator (MILESTONES M1 item 10; SPEC 7.1): writeAll
// from @turboslide/agent writes every committed contract surface from the action table, and
// staleFiles reports the ones that differ from a fresh generation (`--check`).
import { REPO_ROOT, staleFiles, writeAll } from '@turboslide/agent/generate/contracts';
import type { StaleFile } from '@turboslide/agent/generate/contracts';

export type GenerateResult = { root: string; written: string[]; stale: StaleFile[] };

export function generateContracts(check: boolean, root: string = REPO_ROOT): GenerateResult {
  if (check) return { root, written: [], stale: staleFiles(root) };
  const written = writeAll(root);
  return { root, written, stale: [] };
}
