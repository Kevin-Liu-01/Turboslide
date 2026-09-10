// @turboslide/fonts: the InterVariable woff2 and its CSS (SPEC 2.1, 8.4); the static export
// instances and fonts.json arrive in M2 through scripts/build-fonts.py.
// Scaffold placeholder. The theme builder owns this package in M1 and adds one explicit subpath
// export per module to package.json (SPEC 3.3 item 2: no barrel files).

export const PACKAGE_NAME = '@turboslide/fonts' as const;

/** Absolute file URL of the variable font, for Node callers (the standalone build, the exporter). */
export const INTER_VARIABLE_WOFF2 = new URL('../assets/InterVariable.woff2', import.meta.url);

/** Absolute file URL of the @font-face stylesheet. */
export const INTER_CSS = new URL('./inter.css', import.meta.url);

/** The deck's font family stack for display and text (head.html --display and --text). */
export const FONT_FAMILY = "'Inter', 'Helvetica Neue', Arial, sans-serif";
