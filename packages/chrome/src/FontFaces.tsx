import { useMemo } from 'react';

import type { DeckDocument } from '@turboslide/schema/deck';

import { fontsStylesheetHref, usedFamilies } from './font-picker-model';

/**
 * The sheet's faces on the editor and viewer pages (gslides-parity SPEC-5-amendments A5 item 3;
 * B7): one stylesheet link naming the catalog families the document uses (`/fonts/faces/current/
 * <a+b>.css`, one `@font-face` group per family with `font-display: swap` and the `--ts-font-<id>`
 * rule the schema's typography reads), and nothing at all for a document set in the theme's
 * face, so no font file loads before the ready mark unless the deck uses it (SPEC-4 4). The set
 * of ids comes from the schema alone; the catalog's file table stays on the server, which writes
 * the stylesheet (apps/studio/src/routes/fonts.$.ts). Mounted once per page beside the document
 * (EditorRoot, DeckViewer); a self contained document (the standalone build, the headless
 * capture) inlines the faces instead (@turboslide/render/fonts, theme-node.ts `fonts`).
 */
export function FontFaces({ document }: { document: DeckDocument }) {
  const href = useMemo(() => {
    const ids = usedFamilies(document);
    return ids.length === 0 ? null : fontsStylesheetHref(ids);
  }, [document]);
  if (href === null) return null;
  return <link rel="stylesheet" href={href} data-control="fonts.faces" />;
}
