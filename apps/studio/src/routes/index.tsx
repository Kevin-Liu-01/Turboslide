import { Link, createFileRoute, redirect } from '@tanstack/react-router';

// The root route (gslides-parity SPEC 6.1): `/` answers a 307 to /new, the fresh presentation,
// the way Google Slides lands a rep on a new untitled deck rather than on a document list
// (Kevin's directive). The list lives one level up at /decks. The redirect carries
// `X-Robots-Tag: noindex` because the address it points at renders an editor; on the server the
// answer is the 307, and a client side visit runs the same beforeLoad and navigates. Before this
// round `/` opened the newest deck on the shared store, which on production was a drive's test
// deck (docs/EDITOR-DEPTH-STATUS.md section 10).
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/new',
      statusCode: 307,
      headers: { 'x-robots-tag': 'noindex' },
      replace: true,
    });
  },
  component: Landing,
});

/** Rendered only if the redirect did not happen: the two addresses a person can take. */
function Landing() {
  return (
    <main className="ts-home">
      <h1>Turboslide</h1>
      <p>
        Opening a new presentation. If nothing happens, <Link to="/new">start one here</Link> or
        open <Link to="/decks">your presentations</Link>.
      </p>
    </main>
  );
}
