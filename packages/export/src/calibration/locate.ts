// Where calibration.json is read from at runtime. In a checkout it sits beside this module; in a
// bundled server (a Vercel function) the module is a chunk with no calibration/ folder next to
// it, so the studio materializes the file under a folder laid out like packages/ and names it in
// TURBOSLIDE_PACKAGES_DIR (the variable @turboslide/render/theme-node and @turboslide/fonts read
// too; docs/hosting.md).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGES_DIR_VARIABLE = 'TURBOSLIDE_PACKAGES_DIR';

/** The absolute path of calibration.json for this process. */
export function calibrationFile(): string {
  const override = process.env[PACKAGES_DIR_VARIABLE];
  if (override) return join(override, 'export', 'src', 'calibration', 'calibration.json');
  return fileURLToPath(new URL('./calibration.json', import.meta.url));
}
