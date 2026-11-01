// The Themes screen's pictures (docs/SITE.md Screen 03): the landing deck's title slide
// (apps/studio/home-deck/slides/title.json) rendered by the CLI in each of the nine themes, in the
// appearance the theme opens in, so the screen shows what the renderer draws, in the theme's own
// faces, without loading a face on /home. Each picture is a lossy WebP of 960 by 540 written to
// apps/studio/src/components/site/pictures/theme-<id>.webp, and theme-pictures.json beside the
// tiles records the sha256 of each theme's record and of the slide, which theme-tiles.test.ts
// recomputes, so a theme changed without a new picture fails the tests. Not a check step: run it
// after a theme changes, look at every picture, commit them.
//
//   node scripts/site/theme-tiles.mjs [--only <id,...>]
//
// One CLI render per theme (about 45 s each on a loaded machine), each in a deck copied to a
// temporary folder that is removed afterwards.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { THEME_RECORDS } from '../../packages/theme/src/themes.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'package.json'));
const sharp = require('sharp');

const DECK = join(ROOT, 'apps/studio/home-deck');
const SITE = join(ROOT, 'apps/studio/src/components/site');
const MANIFEST = join(SITE, 'theme-pictures.json');
const CLI = join(ROOT, 'apps/cli/bin/turboslide.mjs');
const WIDTH = 960;
const HEIGHT = 540;
/** the byte line of one picture: nine of them stay under the page's 200,000 B picture line */
const MAX_BYTES = 22_000;

const args = process.argv.slice(2);
const at = args.indexOf('--only');
const only = at >= 0 ? (args[at + 1] ?? '').split(',') : null;

const sha = (text) => createHash('sha256').update(text).digest('hex');
const slide = readFileSync(join(DECK, 'slides/title.json'), 'utf8');
const manifest = only === null ? {} : JSON.parse(readFileSync(MANIFEST, 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'turboslide-theme-tiles-'));
try {
  for (const theme of THEME_RECORDS) {
    if (only !== null && !only.includes(theme.id)) continue;
    const deck = join(work, theme.id);
    cpSync(DECK, deck, { recursive: true });
    const record = JSON.parse(readFileSync(join(deck, 'deck.json'), 'utf8'));
    record.theme = theme.id;
    delete record.brand;
    record.defaults = { ...(record.defaults ?? {}), appearance: theme.defaultAppearance };
    record.sections = [{ id: 'deck', name: 'Deck', slideIds: ['title'] }];
    writeFileSync(join(deck, 'deck.json'), JSON.stringify(record, null, 2));
    const out = join(work, `${theme.id}-out`);
    execFileSync(
      'node',
      [
        CLI,
        'render',
        'title',
        '--theme',
        theme.defaultAppearance,
        '--scale',
        '1',
        '--out',
        out,
        '--deck',
        deck,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, TURBOSLIDE_ROOT: ROOT } },
    );
    const png = join(out, `01-title-${theme.defaultAppearance}.png`);
    const resized = await sharp(png).resize(WIDTH, HEIGHT).png().toBuffer();
    let webp = resized;
    let quality = 86;
    for (; quality >= 50; quality -= 4) {
      webp = await sharp(resized).webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
      if (webp.length <= MAX_BYTES) break;
    }
    const file = join(SITE, 'pictures', `theme-${theme.id}.webp`);
    writeFileSync(file, webp);
    manifest[theme.id] = sha(JSON.stringify(theme) + slide);
    console.log(`${file.slice(ROOT.length + 1)}: ${webp.length} B at quality ${quality}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
const ordered = Object.fromEntries(
  THEME_RECORDS.filter((theme) => manifest[theme.id] !== undefined).map((theme) => [
    theme.id,
    manifest[theme.id],
  ]),
);
writeFileSync(MANIFEST, `${JSON.stringify(ordered, null, 2)}\n`);
console.log(`${MANIFEST.slice(ROOT.length + 1)}: ${Object.keys(ordered).length} themes`);
