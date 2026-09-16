import { createFileRoute } from '@tanstack/react-router';

import { SITE } from '@turboslide/theme/brand/site';

import { HELP_TITLES } from '../components/help/help-titles';
import { HelpPage } from '../components/help/HelpPage';
import updates from '../../../../docs/updates.md?raw';

/**
 * Help > Updates, /help/updates (gslides-parity SPEC-5 7.6, 0.40; P3 6.10; P1 5.12): the release
 * notes of `docs/updates.md`, which the ship step of every round appends to with the date and the
 * user facing changes (`scripts/updates-from-model.mjs` prints the draft), in the `/home` shell,
 * prerendered at build and indexable. No round word appears on the page: the entries are dated.
 */
const DESCRIPTION =
  'What changed in Turboslide, newest first: the menu rows that came into use, the actions agents gained and the fixes.';

export const Route = createFileRoute('/help/updates')({
  head: () => ({
    meta: [
      { title: `${HELP_TITLES.updates} | Turboslide` },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:title', content: `${HELP_TITLES.updates} | Turboslide` },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:url', content: `${SITE.origin()}/help/updates` },
    ],
  }),
  component: UpdatesPage,
});

function UpdatesPage() {
  return <HelpPage page="updates" source={updates} />;
}
