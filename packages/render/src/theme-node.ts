// Node-only loader for the ThemeBundle: reads sheet.css, stage.css and the sprite from
// @turboslide/theme and the Inter CSS from @turboslide/fonts, inlining the woff2 as a data URI so
// a rendered document is self-contained (SPEC 5.2, 5.3: inlined fonts are a determinism rule).
// Browser code never imports this module; the studio serves the stylesheets instead.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ThemeBundle } from './deck.ts';

function packageDir(name: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`)));
}

/** The paths SPEC 3.1 and MILESTONES M1 name for the theme and font files. */
export function themePaths(): {
  sheetCss: string;
  stageCss: string;
  sprite: string;
  interCss: string;
  interWoff2: string;
} {
  const theme = packageDir('@turboslide/theme');
  const fonts = packageDir('@turboslide/fonts');
  return {
    sheetCss: join(theme, 'src/gt-ink-paper/sheet.css'),
    stageCss: join(theme, 'src/gt-ink-paper/stage.css'),
    sprite: join(theme, 'assets/sprite.svg'),
    interCss: join(fonts, 'src/inter.css'),
    interWoff2: join(fonts, 'assets/InterVariable.woff2'),
  };
}

/** The sprite file starts with an HTML comment; the document needs the `<svg>` only. */
export function spriteMarkup(fileText: string): string {
  return fileText.replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim();
}

/** The Inter CSS with the woff2 inlined at its `url(...)`. */
export function inlineFontCss(css: string, woff2: Buffer): string {
  return css.replace(
    /url\(['"]?[^)'"]+['"]?\)/,
    `url(data:font/woff2;base64,${woff2.toString('base64')})`,
  );
}

export type LoadThemeOptions = {
  /** Inline the woff2 (default true). */
  inlineFonts?: boolean;
  /** Overrides for tests and for a bundle built before the theme lands. */
  overrides?: Partial<ThemeBundle>;
};

export function loadThemeBundle(options: LoadThemeOptions = {}): ThemeBundle {
  const paths = themePaths();
  const read = (path: string, what: string): string => {
    try {
      return readFileSync(path, 'utf8');
    } catch (error) {
      throw new Error(
        `@turboslide/render: cannot read ${what} at ${path} (${error instanceof Error ? error.message : String(error)}); the theme builder's files are missing`,
      );
    }
  };
  const overrides = options.overrides ?? {};
  const fontsCss =
    overrides.fontsCss ??
    (options.inlineFonts === false
      ? read(paths.interCss, 'inter.css')
      : inlineFontCss(read(paths.interCss, 'inter.css'), readFileSync(paths.interWoff2)));
  return {
    sheetCss: overrides.sheetCss ?? read(paths.sheetCss, 'sheet.css'),
    stageCss: overrides.stageCss ?? read(paths.stageCss, 'stage.css'),
    sprite: overrides.sprite ?? spriteMarkup(read(paths.sprite, 'sprite.svg')),
    fontsCss,
  };
}
