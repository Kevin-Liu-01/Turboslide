// CSS made safe inside an HTML `<style>` element (hardening H1: WEB-1, WEBV-1). A style element's
// content is raw text that ends at the first `</style`, whatever the CSS around it says, so CSS a
// deck carries (a slide's `ext.import.css`, an `html` block's `css`) that holds one closes the
// element and the markup after it runs on the page. `safeStyleText` writes the `<` of every
// sequence that could open markup (`</`, `<!`, `<script`, in any case, with any whitespace after
// the `<`) as the CSS escape `\3c `. Inside a CSS string the escape is the same character, so the
// rule draws the same; outside a string such a `<` is not valid CSS, so no valid rule changes. CSS
// without these sequences comes back byte for byte. The schema runs it when CSS is written and
// the renderer again where CSS enters a style element. Imports nothing, so every package can use it.

/** A `<` that opens markup: an end tag (`</style`), a comment or CDATA (`<!`), a script tag. */
const MARKUP_OPENER = /<(?=\s*(?:\/|!|script))/gi;

/** `css` with every markup opening `<` written as `\3c `; the same string when there is none. */
export function safeStyleText(css: string): string {
  return css.replace(MARKUP_OPENER, '\\3c ');
}

/** True when `css` holds no sequence that could close a style element or open markup. */
export function isSafeStyleText(css: string): boolean {
  return safeStyleText(css) === css;
}
