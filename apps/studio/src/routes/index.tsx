import { createFileRoute } from '@tanstack/react-router';

import { getServerHealth } from '../server/health';

// Scaffold placeholder for the deck list (SPEC 3.4: `/` is the deck list, SSR). It calls one
// server function so that every build exercises the server-only marker that
// scripts/check-client-bundle.mjs looks for; keep a route calling getServerHealth (or another
// function under src/server/ that returns the marker) when this file is replaced.
export const Route = createFileRoute('/')({
  loader: () => getServerHealth(),
  component: Home,
});

function Home() {
  const health = Route.useLoaderData();
  return (
    <main className="ts-home">
      <h1>Turboslide</h1>
      <p>Scaffold placeholder. The deck list lands here. The server runs Node {health.node}.</p>
    </main>
  );
}
