// The title of a help page, read from its markdown's first `#` heading (gslides-parity SPEC-5 7.6).
// A module of its own, with no import of markdown.tsx, so a route's `head` can name the title
// without holding HelpPage.tsx (and with it the key table, the menu model and the home shell) or
// the markdown renderer in the entry chunk: the route file is part of the entry graph while the
// route's component is split off by the router, and the merge 2 build carried the whole model on
// every route through that one import (VERIFICATION-5 finding 10, the round five fix round; the
// entry went from 579 KB to 725 KB). The scan is the parser's heading rule (markdown.tsx line 59)
// over the lines outside a code fence, so it answers what `markdownTitle(parseMarkdown(source))`
// answers; help-title.test.ts pins the two against both documents.
const HEADING = /^#\s+(.+?)\s*$/u;

export function helpTitle(source: string, fallback: string): string {
  let fenced = false;
  for (const line of source.split('\n')) {
    if (/^```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = HEADING.exec(line);
    if (match !== null) return match[1] ?? fallback;
  }
  return fallback;
}
