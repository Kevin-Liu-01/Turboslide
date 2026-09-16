import { useMountEffect } from './useMountEffect';

// The field sample of gslides-parity SPEC-5 11 (SPEC-4 4.7): on one page load in ten the shell
// posts INP, LCP and CLS with their attribution to POST /api/vitals (routes/api/vitals.ts), a
// body under 1 KB with the route family and no identity. Mounted once in the root document. The
// sampled page loads vitals-client.ts (and with it web-vitals' 15.6 KB attribution build) as a
// chunk of its own through import(): both rode the entry chunk on every route at merge 2
// (VERIFICATION-5 finding 10), and nine loads in ten never read them.

/** One page load in ten is sampled (SPEC-5 11). */
export const VITALS_SAMPLE_RATE = 0.1;

/** Whether this page load is in the sample; a test or a probe opts out with `?vitals=0` and in with `?vitals=1`. */
export function sampled(search: string = window.location.search, random = Math.random()): boolean {
  const params = new URLSearchParams(search);
  const forced = params.get('vitals');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return random < VITALS_SAMPLE_RATE;
}

export function VitalsReporter() {
  useMountEffect(() => {
    if (typeof window === 'undefined' || !sampled()) return;
    let cancelled = false;
    void import('./vitals-client')
      .then(({ attachVitals }) => {
        if (!cancelled) attachVitals();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  });
  return null;
}
