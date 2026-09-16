import { VERBALIZE_REGION_ID } from './verbalize';

import '../dialogs/text-tools-dialogs.css';

/**
 * The Verbalize live region (gslides-parity SPEC-5 7.5, 0.39; R10 7.2): a `role="status"`
 * `aria-live="polite"` region distinct from the collaborator announcements region, so two
 * announcements never race, present in the DOM at zero size so turning screen reader support on
 * moves nothing (the layout shift rules of SPEC-3 9). `announceVerbalize` (verbalize.ts) writes
 * the sentences into it; "Screen reader support enabled" is the first, on the toggle.
 */
export function VerbalizeRegion({ on }: { on: boolean }) {
  return (
    <div
      id={VERBALIZE_REGION_ID}
      className="ts-verbalize"
      role="status"
      aria-live={on ? 'polite' : 'off'}
      aria-atomic="true"
      data-control="accessibility.verbalize"
      data-on={on ? '' : undefined}
    />
  );
}
