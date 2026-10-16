/**
 * The counts the site pages state (docs/SITE.md A.1): the actions of the action table in all and
 * per transport, the numbers the generated reference prints (HTTP is the 173 actions on HTTP, not
 * the HTTP paths of the OpenAPI file), and the layouts, themes and animated patterns /features
 * names. The pages do not import the tables, whose schemas their scripts would carry;
 * facts.test.ts recomputes every number from `packages/schema/src/actions.ts`, the layout and
 * theme ids, the material catalog and the generated contracts, and fails with the new number when
 * a table moves, so a page never states a count the tree does not have.
 */
export type SiteFacts = {
  /** every action of the table */
  actions: number;
  /** the actions the command line runs */
  cli: number;
  /** the actions served as MCP tools */
  mcp: number;
  /** the actions on `POST /api/actions/<id>` */
  http: number;
  /** the actions an open page runs through `window.turboslide.studio` */
  page: number;
  /** the slide layouts of Slide > Apply layout (`LAYOUT_IDS`) */
  layouts: number;
  /** the themes of the Theme panel (`THEME_IDS`) */
  themes: number;
  /** the animated patterns of the material catalog (`MATERIAL_IDS`) */
  materials: number;
};

export const SITE_FACTS: SiteFacts = {
  actions: 194,
  cli: 181,
  mcp: 170,
  http: 173,
  page: 178,
  layouts: 22,
  themes: 9,
  materials: 17,
};
