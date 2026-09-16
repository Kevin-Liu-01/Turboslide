// The dependencies every round five lane handler module takes (gslides-parity SPEC-5 1.6; the
// integrator's day 0 seam): the CLI's store action dependencies (the store, the lint lists, the
// render records, the two measurers, the diagram maker) plus, on the hosted dispatcher alone, the
// deck id and the request the handler may need for a caller's identity or a quota row. The eleven
// lane modules under this folder export one `register<Lane>Actions(dispatcher, deps)` each and are
// spread into `registerStoreActions` (apps/cli/src/store-actions.ts) and the hosted
// `deckDispatcher` (apps/studio/src/server/actions.ts), so the CLI, the MCP server, the HTTP
// surface and the window transport run one implementation (SPEC 7.1). `store-actions.ts` is
// imported by the editor page, so every module here stays free of `node:` imports: a handler
// that needs Node (a file read, sharp, Chromium) takes it through a dependency the dispatcher
// composition injects, the way `measureCanvas` does.
import type { ImportLaneDeps } from '@turboslide/import/lane';
import type { PreferencesStore } from '@turboslide/schema/preferences';

import type { StoreActionDeps } from '../store-actions.ts';
import type { ChatPort } from './chat.ts';
import type { MediaIntakeDeps } from './media.ts';
import type { VersionsPort } from './prefs.ts';
import type { DefinePort, DictionaryFilePort, SpellingLanePort } from './spelling.ts';

/** What the hosted dispatcher adds to the store dependencies for a lane handler. */
export type HostedLaneFacts = {
  deckId: string;
  /** the request being served, undefined in a unit test or on the CLI */
  request?: Request;
  /** the studio's own origin, for links a handler answers */
  origin?: string;
};

export type LaneDeps = StoreActionDeps & {
  /** present on the hosted dispatcher alone; a checkout handler reads the store */
  hosted?: HostedLaneFacts;
  /**
   * The caller's preferences record (gslides-parity SPEC-5 7.1; b5.md request 1): the principal
   * store's record hosted (`principalPreferencesStore` with the request's principal), the
   * `--author` principal's file under `<repo>/.turboslide/principals/` on a checkout
   * (`localPreferencesStore`); `prefs.*` and `dictionary.*` refuse with the sentence naming the
   * transport without it, so a dispatcher composed for a request less caller never writes the
   * shared nobody record.
   */
  preferences?: PreferencesStore;
  /*
   * The ports the lanes read (merge 2; each module still types its own `<Lane>LaneDeps` over the
   * same names, and a composition without a port answers the module's refusal sentence): the
   * import bridge (b3.md B3-7), the media intake (b2.md R4), the spelling walk, the definitions
   * provider, the checkout's dictionary file, the version log and the room's chat (b5.md request
   * 9). Type only imports, so this module stays free of Node at run time.
   */
  imports?: ImportLaneDeps;
  media?: MediaIntakeDeps;
  spelling?: SpellingLanePort;
  define?: DefinePort;
  dictionaryFile?: DictionaryFilePort;
  versions?: VersionsPort;
  chat?: ChatPort;
};
