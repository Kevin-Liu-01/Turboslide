/**
 * The better-auth exchanges of the page Sign In (sign-in.tsx, sign-in-dialog.tsx): the same routes
 * the editor posts to (`EditorRoot.tsx` `authPost`), with this page as the address the provider
 * and the mail link return to. No dependency, so the button's module stays small.
 */
export async function authPost(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error(`Sign in did not complete (${response.status}).`);
  return response.json().catch(() => null);
}

/** The address the provider and the mail link return to: this page. */
export function returnAddress(): string {
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}

/** Leaves for a provider: the library answers its address and the browser goes there. */
export async function socialSignIn(provider: 'google' | 'github'): Promise<void> {
  const answer = await authPost('sign-in/social', { provider, callbackURL: returnAddress() });
  const url = (answer as { url?: string } | null)?.url;
  if (typeof url !== 'string') throw new Error('Sign in did not complete.');
  window.location.assign(url);
}
