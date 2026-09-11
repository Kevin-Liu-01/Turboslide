// Recipe resolution (SPEC 5.4, the frame contract: "a saved frame is a lossless PNG of the ready
// renderer plus its editable recipe plus a time anchor"). A recipe names a catalog entry, a
// palette preset and uniform overrides in the recipe's `u_*` names; resolving it fills every
// uniform of the entry's schema in schema order (defaults, then the preset, then the overrides),
// so two writers produce the same uniform object for the same recipe and the recipe key hashes
// it deterministically (recipe-key.ts). Browser safe: the editor resolves recipes for the live
// mount and the inspector; the CLI and the capture job resolve them in Node.
import type {
  MaterialRecipe,
  MaterialUniformSpec,
  MaterialUniformValue,
  MaterialUniforms,
} from '@turboslide/schema/blocks/material';

import type { MaterialEntry } from './catalog.ts';

export type RecipeIssue = {
  /** The uniform name, or '' for the recipe itself. */
  uniform: string;
  code: 'unknown_uniform' | 'unknown_preset' | 'type' | 'range' | 'enum' | 'count';
  message: string;
};

export type ResolvedRecipe = {
  materialId: string;
  preset?: string;
  /** Every uniform of the entry in schema order, then unknown overrides in name order. */
  uniforms: MaterialUniforms;
  /** Non-fatal notes: an unknown uniform kept as written, a value outside its range. */
  warnings: RecipeIssue[];
};

/** The names of a uniform's enum options and the numbers the shader reads. */
export function enumValue(
  spec: MaterialUniformSpec,
  value: MaterialUniformValue,
): number | undefined {
  if (typeof value === 'number') {
    return spec.options?.some((option) => option.value === value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const byName = spec.options?.find((option) => option.name === value);
    if (byName !== undefined) return byName.value;
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && spec.options?.some((option) => option.value === asNumber))
      return asNumber;
  }
  return undefined;
}

/** A comma list of colors (`#ffffff,#86a8ff`) as its entries; a bare hex string is one entry. */
export function splitColors(value: MaterialUniformValue): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(?:rgba?|hsla?)\(/i;

export function isColorString(value: unknown): value is string {
  return typeof value === 'string' && (HEX.test(value) || FUNCTIONAL.test(value));
}

/** Checks one value against its spec; returns the issue, or undefined when it fits. */
export function checkUniform(
  spec: MaterialUniformSpec,
  value: MaterialUniformValue,
): RecipeIssue | undefined {
  const issue = (code: RecipeIssue['code'], message: string): RecipeIssue => ({
    uniform: spec.name,
    code,
    message,
  });
  switch (spec.kind) {
    case 'float':
    case 'int': {
      if (typeof value !== 'number' || !Number.isFinite(value))
        return issue('type', `${spec.name} wants a number, got ${JSON.stringify(value)}`);
      if (spec.kind === 'int' && !Number.isInteger(value))
        return issue('type', `${spec.name} wants an integer, got ${value}`);
      if (
        (spec.min !== undefined && value < spec.min) ||
        (spec.max !== undefined && value > spec.max)
      )
        return issue(
          'range',
          `${spec.name} ${value} is outside ${spec.min ?? '-inf'} to ${spec.max ?? 'inf'}`,
        );
      return undefined;
    }
    case 'bool':
      if (typeof value === 'number' && (value === 0 || value === 1)) return undefined;
      if (value === 'true' || value === 'false') return undefined;
      return typeof value === 'number' || typeof value === 'string'
        ? issue('type', `${spec.name} wants true or false, got ${JSON.stringify(value)}`)
        : undefined;
    case 'enum':
      return enumValue(spec, value) === undefined
        ? issue(
            'enum',
            `${spec.name} wants one of ${(spec.options ?? []).map((o) => o.name).join(', ')}, got ${JSON.stringify(value)}`,
          )
        : undefined;
    case 'color':
      if (isColorString(value)) return undefined;
      if (Array.isArray(value) && (value.length === 3 || value.length === 4)) return undefined;
      return issue(
        'type',
        `${spec.name} wants a color (#rrggbb or #rrggbbaa), got ${JSON.stringify(value)}`,
      );
    case 'colors': {
      const parts = Array.isArray(value)
        ? value.length % 4 === 0
          ? new Array<string>(value.length / 4).fill('#000000')
          : []
        : splitColors(value);
      if (parts.length === 0)
        return issue(
          'type',
          `${spec.name} wants a comma list of colors, got ${JSON.stringify(value)}`,
        );
      const bad = parts.find((part) => !isColorString(part));
      if (bad !== undefined) return issue('type', `${spec.name}: ${bad} is not a color`);
      if (spec.maxCount !== undefined && parts.length > spec.maxCount)
        return issue(
          'count',
          `${spec.name} takes ${spec.maxCount} colors at most, got ${parts.length}`,
        );
      return undefined;
    }
  }
}

/** Every issue of a uniform record against an entry; unknown names are issues of code unknown_uniform. */
export function validateUniforms(entry: MaterialEntry, uniforms: MaterialUniforms): RecipeIssue[] {
  const issues: RecipeIssue[] = [];
  const known = new Map(entry.uniforms.map((spec) => [spec.name, spec]));
  for (const [name, value] of Object.entries(uniforms)) {
    const spec = known.get(name);
    if (spec === undefined) {
      issues.push({
        uniform: name,
        code: 'unknown_uniform',
        message: `${name} is not a uniform of ${entry.id}; kept as written`,
      });
      continue;
    }
    const issue = checkUniform(spec, value);
    if (issue !== undefined) issues.push(issue);
  }
  return issues;
}

/**
 * The full uniform record of a recipe: schema defaults, then the preset, then the overrides.
 * A type or enum mismatch throws TypeError (the value cannot reach the shader); an unknown
 * preset throws RangeError; an unknown uniform or a value outside its range is a warning.
 */
export function resolveRecipe(
  entry: MaterialEntry,
  recipe: Pick<MaterialRecipe, 'preset' | 'uniforms'>,
): ResolvedRecipe {
  const warnings: RecipeIssue[] = [];
  const preset =
    recipe.preset === undefined
      ? undefined
      : entry.presets.find((candidate) => candidate.name === recipe.preset);
  if (recipe.preset !== undefined && preset === undefined) {
    throw new RangeError(
      `${entry.id} has no preset "${recipe.preset}"; presets: ${entry.presets.map((p) => p.name).join(', ')}`,
    );
  }
  const layered: MaterialUniforms = {};
  for (const spec of entry.uniforms) layered[spec.name] = spec.default;
  if (preset !== undefined) Object.assign(layered, preset.uniforms);
  const overrides = recipe.uniforms ?? {};
  for (const issue of validateUniforms(entry, overrides)) {
    if (issue.code === 'type' || issue.code === 'enum' || issue.code === 'count')
      throw new TypeError(issue.message);
    warnings.push(issue);
  }
  Object.assign(layered, overrides);
  // schema order first, then unknown names sorted, so the record is the same for the same recipe
  const known = new Set(entry.uniforms.map((spec) => spec.name));
  const uniforms: MaterialUniforms = {};
  for (const spec of entry.uniforms) {
    const value = layered[spec.name];
    if (value !== undefined) uniforms[spec.name] = value;
  }
  for (const name of Object.keys(layered)
    .filter((key) => !known.has(key))
    .sort()) {
    const value = layered[name];
    if (value !== undefined) uniforms[name] = value;
  }
  return {
    materialId: entry.id,
    ...(preset !== undefined ? { preset: preset.name } : {}),
    uniforms,
    warnings,
  };
}

/** `paper:liquid-metal` to `liquid-metal`, the base of a default asset id. */
export function materialSlug(materialId: string): string {
  return materialId
    .replace(/^[a-z]+:/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
