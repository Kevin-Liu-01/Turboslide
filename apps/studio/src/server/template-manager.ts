import type { AuthContext } from './authorize';

/**
 * Who manages the template collection every account of a deployment shares: Rename, Delete, Use
 * for new presentations and replacing a saved template (Kevin, 2026-11-09: "Admin only"). Before
 * this any browser passed, because the rule predates accounts ("a role that gates it comes with
 * sign in", docs/archive/rounds/PRODUCT.md 4.1), and an API key passed with the `admin` scope any
 * account may give its own key.
 *
 * The manager is the deployment admin, read from the context every transport already carries: an
 * admin account's session, an admin account's key with the `admin` scope, the bootstrap bearer
 * and a checkout's holder (`bootstrapAgentContext`). On a checkout whose localhost surface is
 * open the person at the machine holds the folder, so a browser there manages them too
 * (`onOpenCheckout` of auth.ts). Saving a new template stays open to anyone who may copy the
 * deck; a name an organisation template already carries is the manager's to replace and is
 * refused for anyone else with `templateNameTaken`.
 */
export function managesTemplates(ctx: AuthContext | null, openCheckout: boolean): boolean {
  if (openCheckout) return true;
  if (ctx === null || ctx.principal?.admin !== true) return false;
  return ctx.agent === undefined || ctx.agent.scopes.includes('admin');
}

/**
 * Whether the request being served is the manager's, for the server functions of templates.ts,
 * which read the caller's context themselves. Outside a request nothing is open. The imports
 * load here, late, so the rule above stays a pure function a test reads without the runtime.
 */
export async function requestManagesTemplates(ctx: AuthContext): Promise<boolean> {
  const { getRequest } = await import('@tanstack/react-start/server');
  const { onOpenCheckout } = await import('./auth');
  let open = false;
  try {
    open = onOpenCheckout(getRequest());
  } catch {
    // no request, so no open checkout
  }
  return managesTemplates(ctx, open);
}

/** What a save answers when the name is an organisation template's and the caller is not the manager. */
export function templateNameTaken(name: string): string {
  return `${name} is one of your organisation's templates; pick another name`;
}
