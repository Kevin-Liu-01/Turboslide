import { createFileRoute } from '@tanstack/react-router';

import { SITE } from '@turboslide/theme/brand/site';

import { HELP_TITLES } from '../components/help/help-titles';
import { HelpPage } from '../components/help/HelpPage';
import training from '../../../../docs/training.md?raw';

/**
 * Help > Training, /help/training (gslides-parity SPEC-5 7.6, 0.40; P3 6.10; P1 5.12): the
 * walkthrough of `docs/training.md` (the ten tasks of the Help dialog expanded, the agent commands
 * and the four skills) with the keyboard shortcuts generated from `keys.ts`, in the `/home` shell,
 * prerendered at build like `/home` (the deploy config's `pages`, b5.md request 13) and indexable
 * (outside `NOINDEX_ROUTES`). The markdown reaches the route at build through Vite's `?raw` import,
 * so the page carries no loader and no per request data. The `head` reads the page title from the
 * generated `help-titles.ts` (scripts/build-home-assets.ts --help-titles, checked in step 29), so
 * the route file, which is entry chunk code, holds neither the document nor HelpPage.tsx and the
 * key table behind it (VERIFICATION-5 finding 10); the component below, split off by the router,
 * is where the markdown rides.
 */
const DESCRIPTION =
  'How to open, copy, edit, present and share a presentation in Turboslide, with the keyboard shortcuts and the agent commands.';

export const Route = createFileRoute('/help/training')({
  head: () => ({
    meta: [
      { title: `${HELP_TITLES.training} | Turboslide` },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:title', content: `${HELP_TITLES.training} | Turboslide` },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:url', content: `${SITE.origin()}/help/training` },
    ],
  }),
  component: TrainingPage,
});

function TrainingPage() {
  return <HelpPage page="training" source={training} shortcuts />;
}
