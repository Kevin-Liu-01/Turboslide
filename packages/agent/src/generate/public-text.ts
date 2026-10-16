// The public contracts cite no repository document (hardening HR-C#12, CLEANUP-14;
// docs/hardening/HARDENING.md 4.11). The action table's descriptions keep their citations
// (`docs/freeform.md 3.2`) for the reader of the source; the published contracts reach people and
// agents who cannot open the repository, so the generator drops each citation from what it writes:
// a parenthetical that only cites goes whole, a parenthetical that also says something keeps its
// other `;` parts, and a closing `; docs/...` clause goes. The /docs pages are the public reference.

const CITATION = /docs\/[\w./-]+/;

/** The text with its repository citations taken out. */
export function publicText(text: string): string {
  if (!CITATION.test(text)) return text;
  return text
    .replace(/ ?\(([^()]*)\)/g, (whole: string, inner: string) => {
      if (!CITATION.test(inner)) return whole;
      const kept = inner
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part !== '' && !CITATION.test(part));
      if (kept.length === 0) return '';
      return `${whole.startsWith(' ') ? ' ' : ''}(${kept.join('; ')})`;
    })
    .replace(/;\s*docs\/[^;()]*?(?=\.(?:\s|$)|;|$)/g, '');
}

/** A contract object with `publicText` applied to every string in it. */
export function publicContract<T>(value: T): T {
  if (typeof value === 'string') return publicText(value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => publicContract(item)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, publicContract(item)]),
    ) as T;
  }
  return value;
}
