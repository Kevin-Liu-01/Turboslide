// Text helpers for the copy rules: the schema's plainText (the visible characters of the four-rule
// markup, SPEC 4.2), word splitting, and the copy an html escape block shows once tags are gone.
export { plainText, parseText } from '@turboslide/schema/text';

/** Words of a plain string, split on whitespace, punctuation trimmed from the ends. */
export function words(plain: string): string[] {
  return plain
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w.length > 0);
}

/** Strip tags and collapse whitespace: the copy an html escape block shows. */
export function htmlText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
