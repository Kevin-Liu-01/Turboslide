// String-building helpers for the renderer (SPEC 5.2: the renderer is a string builder with HTML
// escaping, never React, so the CLI, the exporter and the studio share it without a framework).

export type Attrs = Record<string, string | number | boolean | null | undefined>;

/** Escapes text content: the characters that can open markup or an entity. */
export function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escapes an attribute value (double quoted). */
export function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Serializes attributes in the order given. `true` writes a bare attribute, `false`, `null` and
 * `undefined` drop it, an empty string writes `name=""`.
 */
export function attrs(values: Attrs): string {
  let out = '';
  for (const [name, value] of Object.entries(values)) {
    if (value === false || value === null || value === undefined) continue;
    if (value === true) {
      out += ` ${name}`;
      continue;
    }
    out += ` ${name}="${escapeAttr(String(value))}"`;
  }
  return out;
}

/** Joins class names, dropping empty entries; returns undefined when nothing is left. */
export function classes(...names: (string | false | null | undefined)[]): string | undefined {
  const list = names.filter((name): name is string => typeof name === 'string' && name.length > 0);
  return list.length > 0 ? list.join(' ') : undefined;
}

/** Joins CSS declarations (`prop:value` fragments), dropping empty entries. */
export function style(...declarations: (string | false | null | undefined)[]): string | undefined {
  const list = declarations
    .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    .map((d) => d.trim().replace(/;$/, ''));
  return list.length > 0 ? list.join(';') : undefined;
}

/** An element with children. */
export function el(tag: string, attributes: Attrs, children: string): string {
  return `<${tag}${attrs(attributes)}>${children}</${tag}>`;
}

/** A void element. */
export function voidEl(tag: string, attributes: Attrs): string {
  return `<${tag}${attrs(attributes)}>`;
}

/** Formats a sheet-pixel number without trailing zeros (522.5 stays, 627 has no decimal). */
export function px(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}
