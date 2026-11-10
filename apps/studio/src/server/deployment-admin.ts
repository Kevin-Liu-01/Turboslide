import type { AuthContext } from './authorize';

/**
 * Whether a caller runs this deployment, for what belongs to the deployment and not to a deck:
 * the template collection every account shares (template-manager.ts) and the logo index rebuild
 * (logos.ts). No deck decision covers either, so each handler asks this.
 *
 * The caller is the deployment admin, read from the context every transport already carries: an
 * admin account's session, an admin account's key with the `admin` scope, the bootstrap bearer
 * and a checkout's holder (`bootstrapAgentContext`). The scope alone is not enough, because any
 * account may give its own key the `admin` scope. On a checkout whose localhost surface is open
 * the person at the machine holds the folder, so a browser there passes too (`onOpenCheckout`
 * of auth.ts).
 */
export function runsDeployment(ctx: AuthContext | null, openCheckout: boolean): boolean {
  if (openCheckout) return true;
  if (ctx === null || ctx.principal?.admin !== true) return false;
  return ctx.agent === undefined || ctx.agent.scopes.includes('admin');
}

/**
 * The rule for the request being served, for a server function that has read the caller's
 * context itself (templates.ts). Outside a request nothing is open. The imports load here, late,
 * so the rule above stays a pure function a test reads without the runtime.
 */
export async function requestRunsDeployment(ctx: AuthContext): Promise<boolean> {
  const { getRequest } = await import('@tanstack/react-start/server');
  const { onOpenCheckout } = await import('./auth');
  let open = false;
  try {
    open = onOpenCheckout(getRequest());
  } catch {
    // no request, so no open checkout
  }
  return runsDeployment(ctx, open);
}

/**
 * The rule for a route that holds the request and no context yet (the logo refresh route): the
 * open checkout, else the identity the bearer resolves to. A bearer the runtime cannot resolve
 * is nobody.
 */
export async function bearerRunsDeployment(request: Request): Promise<boolean> {
  const { onOpenCheckout } = await import('./auth');
  if (onOpenCheckout(request)) return true;
  const { requestIdentity } = await import('./auth/identity');
  try {
    const identity = await requestIdentity(request, undefined, { mint: false });
    return runsDeployment(identity.ctx, false);
  } catch {
    return false;
  }
}
