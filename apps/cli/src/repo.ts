// Where this binary lives. src/main.ts and dist/main.js both sit two levels under apps/cli, so
// three levels up is the repository root in development and in the tsdown bundle.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}
