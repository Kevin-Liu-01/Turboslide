// The `ext` record the importer writes (SPEC 4.1: unknown data survives under `ext` on a slide,
// a block or an asset, and validate reports it once at severity 1). `ext.import` carries what the
// GT deck set by hand and the grammar has no property for: leftover scoped CSS rules and inline
// declarations (import report, deviation 2 from SPEC 4.2). The renderer applies them so the
// imported deck keeps pixel parity; a lint pass lists them so they can be retired one by one.
import { z } from 'zod';

export type ImportResidual = {
  /** Inline CSS declarations applied to the block root, for example `gap:10px`. */
  style?: string;
  /** Extra class names kept on the block root so residual rules can target them. */
  classes?: string[];
  /** Scoped CSS rules; on a slide they are rewritten under `.ts-x-<slideId>`. */
  css?: string;
  /** The original scoped class of the source section, for the report. */
  scope?: string;
};

export const importResidualSchema = z.strictObject({
  style: z.string().optional(),
  classes: z.array(z.string()).optional(),
  css: z.string().optional(),
  scope: z.string().optional(),
}) satisfies z.ZodType<ImportResidual>;

/** An `ext` record that may carry the importer's residual. */
export type ExtWithImport = Record<string, unknown> & { import?: ImportResidual };

/**
 * Reads `ext.import` from a slide, block or asset `ext` record. Returns undefined when the record
 * is absent or does not parse, so a renderer never trusts a hand-edited residual.
 */
export function importResidual(
  ext: Record<string, unknown> | undefined,
): ImportResidual | undefined {
  if (ext === undefined) return undefined;
  const parsed = importResidualSchema.safeParse(ext['import']);
  return parsed.success ? parsed.data : undefined;
}

/** Returns `ext` with `import` merged over the current residual. */
export function withImportResidual(
  ext: Record<string, unknown> | undefined,
  patch: ImportResidual,
): ExtWithImport {
  const current = importResidual(ext) ?? {};
  return { ...ext, import: { ...current, ...patch } };
}
