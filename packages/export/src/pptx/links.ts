// Links in the file (gslides-parity SPEC 7.2.7, 7.2.8): a block link or a run link is a URL or a
// slide link (`#s/<slideId>`, `#next`, `#previous`, `#first`, `#last`). A URL travels as
// `hyperlink: { url }`; a slide link as `hyperlink: { slide: n }`, n the 1 based number of the
// target among the slides of this file (a skipped slide is not in the file, so a link to it
// resolves to nothing and the report says so). The keywords resolve against the slide the link
// sits on.
import type PptxGenJS from 'pptxgenjs';

import { slideLinkTarget } from '@turboslide/schema/text';

/** Resolves a link href to pptxgenjs hyperlink props; undefined for a slide link with no target in the file. */
export type LinkResolver = (href: string) => PptxGenJS.HyperlinkProps | undefined;

/**
 * The resolver for one slide of a file: `slideIds` are the file's slides in order, `index` the
 * position of the slide the link sits on.
 */
export function linkResolver(slideIds: readonly string[], index: number): LinkResolver {
  return (href) => {
    const target = slideLinkTarget(href);
    if (target === null) return href.startsWith('#') ? undefined : { url: href };
    const last = slideIds.length;
    let n: number | undefined;
    switch (target.slide) {
      case 'next':
        n = index + 2 <= last ? index + 2 : undefined;
        break;
      case 'previous':
        n = index >= 1 ? index : undefined;
        break;
      case 'first':
        n = last >= 1 ? 1 : undefined;
        break;
      case 'last':
        n = last >= 1 ? last : undefined;
        break;
      default: {
        const at = slideIds.indexOf(target.slide);
        n = at >= 0 ? at + 1 : undefined;
      }
    }
    return n === undefined ? undefined : { slide: n };
  };
}

/** True for a link the file can only carry as a slide jump (a hash), false for a URL. */
export function isSlideLink(href: string): boolean {
  return slideLinkTarget(href) !== null;
}
