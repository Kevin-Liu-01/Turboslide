// The ODF writer's small vocabulary (gslides-parity SPEC-5 6.3; R09 2): escaping, the unit
// conversions (a sheet pixel is 2.54/120 cm and 0.6 pt), CSS colours as ODF hex and opacity, and
// the element ids the animation tree targets. Pure string work shared by every odp/*.ts module.

/** Text content escaped for an XML text node. */
export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Run text as ODF text content: an ODF reader collapses consecutive spaces, so a run of two or
 * more is written as one space and `<text:s text:c="n"/>` for the rest, a tab as `<text:tab/>`.
 */
export function odfText(text: string): string {
  return esc(text)
    .replace(/ {2,}/g, (spaces) => ` <text:s text:c="${spaces.length - 1}"/>`)
    .replace(/\t/g, '<text:tab/>');
}

/** An attribute value escaped for a double quoted XML attribute. */
export function escAttr(text: string): string {
  return esc(text).replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}

/** Centimetres per sheet pixel: 2.54 in per cm over 120 px per in. */
export const CM_PER_PX = 2.54 / 120;

/** A sheet pixel length as an ODF centimetre length with four decimals (0.001 mm). */
export function cm(px: number): string {
  return `${(px * CM_PER_PX).toFixed(4)}cm`;
}

/** A sheet pixel length as a point length with two decimals (0.6 pt per sheet pixel). */
export function pt(px: number): string {
  return `${(px * 0.6).toFixed(2)}pt`;
}

/** A number of points as a length string. */
export function ptOf(points: number): string {
  return `${points.toFixed(2)}pt`;
}

/** A fraction as an ODF percentage attribute (`50%`). */
export function percent(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

/** A CSS `rgb()`, `rgba()` or `#hex` colour as `#rrggbb` and its alpha (1 when opaque); null for none. */
export function cssColor(value: string | undefined): { hex: string; alpha: number } | null {
  if (value === undefined) return null;
  const v = value.trim();
  if (v === '' || v === 'none' || v === 'transparent') return null;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (hex !== null) {
    let h = hex[1] ?? '';
    if (h.length === 3 || h.length === 4)
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { hex: `#${h.slice(0, 6).toLowerCase()}`, alpha };
  }
  const rgb =
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
      v,
    );
  if (rgb === null) return null;
  const channel = (s: string | undefined): string =>
    Math.max(0, Math.min(255, Math.round(Number(s ?? 0))))
      .toString(16)
      .padStart(2, '0');
  const a = rgb[4];
  const alpha = a === undefined ? 1 : a.endsWith('%') ? Number(a.slice(0, -1)) / 100 : Number(a);
  if (alpha <= 0) return null;
  return { hex: `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`, alpha };
}

/** A safe XML id from a block id or any string: letters, digits, hyphens and underscores. */
export function xmlId(prefix: string, value: string): string {
  return `${prefix}${value.replace(/[^A-Za-z0-9_-]+/g, '_')}`;
}

/** An element with attributes and children as one string; a self closing tag without children. */
export function el(
  name: string,
  attributes: Record<string, string | number | undefined>,
  children = '',
): string {
  const attrs = Object.entries(attributes)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => ` ${key}="${escAttr(String(value))}"`)
    .join('');
  return children === '' ? `<${name}${attrs}/>` : `<${name}${attrs}>${children}</${name}>`;
}

/** A number with at most three decimals and no trailing zeros, for path data and view boxes. */
export function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
