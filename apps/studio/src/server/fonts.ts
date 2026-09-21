// The catalog's faces for the editor, the viewer and the picker (gslides-parity SPEC-5-amendments
// A5 items 3 and 4; docs/PRODUCT.md 4.2; ported from the round five branch at the product round's
// merge, build/b5.md R7), behind GET /fonts/* (apps/studio/src/routes/fonts.$.ts). Two forms,
// both under the catalog's version so a refetch at another commit is another URL and the answers
// cache as immutable:
//
//   /fonts/faces/<version>/<id>[+<id>...].css   one @font-face group per id, font-display swap,
//                                                the `--ts-font-<id>` rule on the sheet root
//   /fonts/<version>/<id>/<file>.woff2            one file of the catalog
//
// The ids must be catalog ids and the file must be one the catalog names, else 404; the version
// `current` (what the editor page links, since the chrome carries no catalog module) is cached
// for five minutes with the versioned, immutable file URLs inside it; any other version is
// answered but cached for a minute only. The bytes come from @turboslide/fonts/catalog-node,
// which reads the checkout's packages/fonts/assets or the materialized packages folder of a hosted
// function (TURBOSLIDE_PACKAGES_DIR; the runtime file glob of vite.deploy.config.ts names
// `fonts/assets/*/*`). Same origin CSS and fonts need no CORS header;
// `Cross-Origin-Resource-Policy: same-site` keeps the files ours.
import type { FontId } from '@turboslide/schema/fonts';
import { isFontId } from '@turboslide/schema/fonts';
import { catalogFont } from '@turboslide/fonts/catalog';
import { fontFileBytes } from '@turboslide/fonts/catalog-node';
import {
  CURRENT_VERSION_ALIAS,
  FONT_PATH_VERSION,
  fontFilePath,
  parseFilePath,
  parseStylesheetPath,
} from '@turboslide/fonts/names';
import { fontsCss } from '@turboslide/render/fonts';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=60';
/** the `current` alias the editor page links: a short life, the file URLs inside it immutable */
const CURRENT = 'public, max-age=300, stale-while-revalidate=86400';

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' },
  });
}

export function serveFonts(splat: string): Response {
  const sheet = parseStylesheetPath(splat);
  if (sheet !== null) {
    if (sheet.ids.length === 0 || sheet.ids.length > 32) return notFound();
    const ids: FontId[] = [];
    for (const id of sheet.ids) {
      if (!isFontId(id)) return notFound();
      ids.push(id);
    }
    const css = fontsCss(ids, (id, file) => fontFilePath(id, file.file));
    return new Response(css, {
      status: 200,
      headers: {
        'content-type': 'text/css; charset=utf-8',
        'cache-control':
          sheet.version === FONT_PATH_VERSION
            ? IMMUTABLE
            : sheet.version === CURRENT_VERSION_ALIAS
              ? CURRENT
              : SHORT,
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-site',
      },
    });
  }
  const file = parseFilePath(splat);
  if (file === null || !isFontId(file.id)) return notFound();
  const row = catalogFont(file.id);
  if (!row.files.some((each) => each.file === file.file)) return notFound();
  let bytes: Buffer;
  try {
    bytes = fontFileBytes(file.id, file.file);
  } catch {
    return notFound();
  }
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': 'font/woff2',
      'content-length': String(bytes.byteLength),
      'cache-control': file.version === FONT_PATH_VERSION ? IMMUTABLE : SHORT,
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-site',
    },
  });
}
