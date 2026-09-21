import { createFileRoute } from '@tanstack/react-router';

import { serveFonts } from '../server/fonts';

/**
 * GET /fonts/* (gslides-parity SPEC-5-amendments A5 items 3 and 4; docs/PRODUCT.md 4.2; ported
 * from the round five branch at the product round's merge, build/b5.md R7): the catalog's faces
 * for the editor, the viewer and the picker. Two forms, both under the catalog's version so a
 * refetch at another commit is another URL and the answers cache as immutable:
 *
 *   /fonts/faces/<version>/<id>[+<id>...].css   one @font-face group per id, font-display swap,
 *                                                the `--ts-font-<id>` rule on the sheet root
 *   /fonts/<version>/<id>/<file>.woff2            one file of the catalog
 *
 * The ids must be catalog ids and the file must be one the catalog names, else 404; the version
 * `current` (what the editor page links, since the chrome carries no catalog module) is cached
 * for five minutes with the versioned, immutable file URLs inside it; any other version is
 * answered but cached for a minute only. The bytes come from
 * @turboslide/fonts/catalog-node, which reads the checkout's packages/fonts/assets or the
 * materialized packages folder of a hosted function (TURBOSLIDE_PACKAGES_DIR; the runtime file
 * glob of vite.deploy.config.ts names the `fonts/assets/<id>/<file>` files). Same origin CSS and
 * fonts need no CORS header; `Cross-Origin-Resource-Policy: same-site` keeps the files ours.
 */

export const Route = createFileRoute('/fonts/$')({
  server: {
    handlers: {
      GET: ({ params }) => serveFonts(params._splat ?? ''),
    },
  },
});
