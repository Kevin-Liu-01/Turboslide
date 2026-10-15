/**
 * The counts the landing states (docs/SITE.md A.1): the actions of the action table in all and
 * per transport, the numbers the generated reference prints (HTTP is the 173 actions on HTTP, not
 * the HTTP paths of the OpenAPI file). The page does not import the action table, whose schemas
 * the landing's script would carry; facts.test.ts recomputes every number from
 * `packages/schema/src/actions.ts` and the generated contracts and fails with the new number when
 * the table moves, so the page never states a count the tree does not have.
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
};

export const SITE_FACTS: SiteFacts = {
  actions: 194,
  cli: 181,
  mcp: 170,
  http: 173,
  page: 178,
};
