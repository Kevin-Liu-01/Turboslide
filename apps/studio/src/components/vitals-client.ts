// The sampled page's half of the field vitals (gslides-parity SPEC-5 11; SPEC-4 4.7): attaches
// web-vitals' attribution build to INP, LCP and CLS and posts each metric once to /api/vitals as a
// body under 1 KB with the route family and no identity. Loaded by VitalsReporter.tsx through
// import() on one page load in ten, so neither this module nor web-vitals rides the entry chunk
// (VERIFICATION-5 finding 10, the round five fix round).
import { onCLS, onINP, onLCP } from 'web-vitals/attribution';
import type {
  CLSMetricWithAttribution,
  INPMetricWithAttribution,
  LCPMetricWithAttribution,
} from 'web-vitals/attribution';

type Metric = INPMetricWithAttribution | LCPMetricWithAttribution | CLSMetricWithAttribution;

export function familyOf(pathname: string): string {
  if (pathname.startsWith('/edit/')) return '/edit';
  if (pathname.startsWith('/deck/')) return '/deck';
  if (pathname.startsWith('/present/')) return '/present';
  if (pathname.startsWith('/embed/')) return '/embed';
  if (pathname.startsWith('/print/')) return '/print';
  return pathname;
}

function attributionOf(metric: Metric): Record<string, string> {
  const out: Record<string, string> = {};
  const a = metric.attribution as Record<string, unknown>;
  if (typeof a.interactionTarget === 'string') out.eventTarget = a.interactionTarget.slice(0, 120);
  if (typeof a.interactionType === 'string') out.eventType = a.interactionType;
  if (typeof a.loadState === 'string') out.loadState = a.loadState;
  if (typeof a.element === 'string' && out.eventTarget === undefined)
    out.eventTarget = a.element.slice(0, 120);
  if (typeof a.largestShiftTarget === 'string' && out.eventTarget === undefined)
    out.eventTarget = a.largestShiftTarget.slice(0, 120);
  return out;
}

function post(metric: Metric): void {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    route: familyOf(window.location.pathname),
    attribution: attributionOf(metric),
  });
  if (body.length > 1024) return;
  try {
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/vitals', new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch {
    // sendBeacon refused (a blocked type, a closed page); fetch below
  }
  void fetch('/api/vitals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

/** Attaches the three metrics; INP and CLS are cumulative and LCP finalizes on the first interaction, so a late attach loses none. */
export function attachVitals(): void {
  onINP(post, { reportAllChanges: false });
  onLCP(post);
  onCLS(post);
}
