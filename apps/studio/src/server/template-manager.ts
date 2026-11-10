/**
 * Who manages the template collection every account of a deployment shares: Rename, Delete, Use
 * for new presentations and replacing a saved template (Kevin, 2026-11-09: "Admin only"). Before
 * this any browser passed, because the rule predates accounts ("a role that gates it comes with
 * sign in", docs/archive/rounds/PRODUCT.md 4.1), and an API key passed with the `admin` scope any
 * account may give its own key.
 *
 * The manager is whoever runs the deployment (`runsDeployment` of deployment-admin.ts: the
 * deployment admin, or anyone on a checkout's open localhost). Saving a new template stays open
 * to anyone who may copy the deck; a name an organisation template already carries is the
 * manager's to replace and is refused for anyone else with the sentence below.
 */
export function templateNameTaken(name: string): string {
  return `${name} is one of your organisation's templates; pick another name`;
}
