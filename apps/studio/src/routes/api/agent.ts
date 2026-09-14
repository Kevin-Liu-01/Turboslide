import { createFileRoute } from '@tanstack/react-router';
import { createDispatcher } from '@turboslide/agent/dispatch';
import { refuseSpoofedLocalhost } from '@turboslide/agent/http/dispatch';
import { jsonResponse } from '@turboslide/agent/http/errors';
import { runtimeManifest } from '@turboslide/agent/http/manifest';
import { describeBackends } from '@turboslide/effects/select';

import { DEFAULT_DECK, deckDispatcher } from '../../server/actions';
import { agentAuth, requireAgentAuth } from '../../server/auth';
import { refuseForeignOrigin } from '../../server/headers';
import { studioSessions } from '../../server/sessions';

// GET /api/agent (SPEC 3.4, 7.4, 7.5; MILESTONES M4 item 1): the manifest an agent reads first.
// The generated document (packages/agent/generated/manifest.json: transports, rules, execution
// rules, skills, resources) with what only this instance knows: the actions with a handler here
// and the ones declared for a later milestone, whether a token is required, the attached studio
// pages, and the window API's action list under `actions`, which the window-api spec compares
// with describe().actions in the page. ?deck= names the deck whose dispatcher is described; an
// unknown deck still answers, with the pending list saying every action waits for a deck.
// The localhost rule holds only when every host the request names is local (gslides-parity
// SPEC-3 8.8, TURBOSLIDE_TRUST_PROXY; server/headers.ts).
//
// Round four (gslides-parity SPEC-4 0.38, 3.9; build-4/b4.md R11, the integrator at merge 2): the
// answer also carries `instance`, the facts of the process that answered: the effects backend the
// function selected (`native` once the Linux addon is committed, `wasm` or `typescript` until
// then), the runtime's glibc version from Node's process report (the addon is built against
// glibc 2.28, and docs/native.md records what the platform runs) and the Node version.
// scripts/hosted-smoke.mjs reads them with the bearer.

type InstanceFacts = {
  effectsBackend: 'native' | 'wasm' | 'typescript';
  glibcVersionRuntime: string | null;
  node: string;
  platform: string;
};

function instanceFacts(): InstanceFacts {
  let effectsBackend: InstanceFacts['effectsBackend'] = 'typescript';
  try {
    effectsBackend = describeBackends().selected;
  } catch {
    // a backend that fails to load leaves the TypeScript stages selected
  }
  let glibcVersionRuntime: string | null = null;
  try {
    // the report's type is `object`; the header's glibc field is Node's on Linux builds
    const report = process.report?.getReport() as
      { header?: { glibcVersionRuntime?: string } } | undefined;
    glibcVersionRuntime = report?.header?.glibcVersionRuntime ?? null;
  } catch {
    // no process report on this runtime
  }
  return { effectsBackend, glibcVersionRuntime, node: process.version, platform: process.platform };
}

export const Route = createFileRoute('/api/agent')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = requireAgentAuth(request);
        if (denied) return denied;
        const auth = agentAuth(request);
        if (auth.ok && auth.mode === 'localhost') {
          const spoofed = refuseSpoofedLocalhost(request);
          if (spoofed !== null) return spoofed;
        }
        const foreign = refuseForeignOrigin(request);
        if (foreign !== null) return foreign;
        const url = new URL(request.url);
        const deckId = url.searchParams.get('deck') || DEFAULT_DECK;
        let dispatcher;
        let note: string | undefined;
        try {
          dispatcher = (await deckDispatcher(deckId, { withView: true })).dispatcher;
        } catch (error) {
          dispatcher = createDispatcher();
          note = error instanceof Error ? error.message : String(error);
        }
        const manifest = runtimeManifest({
          dispatcher,
          sessions: studioSessions().list(),
          defaultDeck: deckId,
        });
        const answer = { ...manifest, instance: instanceFacts() };
        return jsonResponse(note === undefined ? answer : { ...answer, note });
      },
    },
  },
});
