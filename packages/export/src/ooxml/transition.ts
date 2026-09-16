// The transition element of the post process (gslides-parity SPEC-5 0.12, 2.4; R01 6.1, 6.2; R05
// 5): the slide's transition into it as PowerPoint 2010 writes every transition, an
// `mc:AlternateContent` after `</p:clrMapOvr>` whose Choice requires `p14` and carries the real
// duration in `p14:dur` beside the legacy `spd`, and whose Fallback carries the plain element for a
// reader without `p14` (a `p:fade` for the three `p14` kinds). The seven kinds map as 0.12 says:
// Dissolve `p:dissolve`, Fade `p:fade`, Slide from right `p:push dir="l"`, Slide from left `p:push
// dir="r"`, Flip `p14:flip dir="l"`, Cube `p14:prism dir="l" isContent="0" isInverted="0"`,
// Gallery `p14:gallery dir="l"`. `spd` follows LibreOffice's thresholds (500 ms and under `fast`,
// under 1000 `med`, 1000 and over `slow`); `advTm` is never written (autoplay is a session
// setting) and a None transition writes nothing.
import type { SlideTransition, TransitionKind } from '@turboslide/schema/motion';

export const MC_NAMESPACE = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
export const P14_NAMESPACE = 'http://schemas.microsoft.com/office/powerpoint/2010/main';

export type TransitionSpeed = 'fast' | 'med' | 'slow';

/** The legacy speed of a duration (R01 6.2, LibreOffice's exporter): 500 and under fast, under 1000 med, 1000 and over slow. */
export function spdOf(durationMs: number): TransitionSpeed {
  if (durationMs <= 500) return 'fast';
  if (durationMs < 1000) return 'med';
  return 'slow';
}

/** The kinds a reader without `p14` cannot draw; their Fallback is a fade (SPEC-5 0.12). */
export const P14_KINDS: ReadonlySet<TransitionKind> = new Set<TransitionKind>([
  'flip',
  'cube',
  'gallery',
]);

/** The Choice and the Fallback element of one kind; null for None. */
export function transitionElements(
  kind: TransitionKind,
): { choice: string; fallback: string } | null {
  switch (kind) {
    case 'none':
      return null;
    case 'dissolve':
      return { choice: '<p:dissolve/>', fallback: '<p:dissolve/>' };
    case 'fade':
      return { choice: '<p:fade/>', fallback: '<p:fade/>' };
    case 'slideRight':
      return { choice: '<p:push dir="l"/>', fallback: '<p:push dir="l"/>' };
    case 'slideLeft':
      return { choice: '<p:push dir="r"/>', fallback: '<p:push dir="r"/>' };
    case 'flip':
      return { choice: '<p14:flip dir="l"/>', fallback: '<p:fade/>' };
    case 'cube':
      return {
        choice: '<p14:prism dir="l" isContent="0" isInverted="0"/>',
        fallback: '<p:fade/>',
      };
    case 'gallery':
      return { choice: '<p14:gallery dir="l"/>', fallback: '<p:fade/>' };
  }
}

/** The wrapper of one transition, as written into the slide part. */
export function transitionXml(transition: SlideTransition): string {
  const elements = transitionElements(transition.kind);
  if (elements === null) return '';
  const spd = spdOf(transition.durationMs);
  return (
    `<mc:AlternateContent xmlns:mc="${MC_NAMESPACE}">` +
    `<mc:Choice xmlns:p14="${P14_NAMESPACE}" Requires="p14">` +
    `<p:transition spd="${spd}" p14:dur="${Math.round(transition.durationMs)}">${elements.choice}</p:transition>` +
    `</mc:Choice>` +
    `<mc:Fallback><p:transition spd="${spd}">${elements.fallback}</p:transition></mc:Fallback>` +
    `</mc:AlternateContent>`
  );
}

/** Declares `xmlns:mc` and `xmlns:p14` on `p:sld` when the part lacks them. */
export function declareMotionNamespaces(xml: string): string {
  return xml.replace(/<p:sld\b([^>]*)>/, (match, attrs: string) => {
    let next = attrs;
    if (!/\sxmlns:mc=/.test(next)) next += ` xmlns:mc="${MC_NAMESPACE}"`;
    if (!/\sxmlns:p14=/.test(next)) next += ` xmlns:p14="${P14_NAMESPACE}"`;
    return next === attrs ? match : `<p:sld${next}>`;
  });
}

const EXISTING_RE =
  /<mc:AlternateContent\b[^>]*>(?:(?!<\/mc:AlternateContent>)[\s\S])*?<p:transition\b[\s\S]*?<\/mc:AlternateContent>|<p:transition\b[^>]*\/>|<p:transition\b[^>]*>[\s\S]*?<\/p:transition>/;

/**
 * Writes the transition after `</p:clrMapOvr>` (pptxgenjs closes every slide part with
 * `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`), replacing one already there; a
 * null or None transition removes any and writes nothing.
 */
export function writeTransition(
  xml: string,
  transition: SlideTransition | null,
): { xml: string; written: boolean } {
  const stripped = xml.replace(EXISTING_RE, '');
  if (transition === null || transition.kind === 'none') return { xml: stripped, written: false };
  const element = transitionXml(transition);
  const anchor = '</p:clrMapOvr>';
  const at = stripped.indexOf(anchor);
  const declared = declareMotionNamespaces(stripped);
  const shift = declared.length - stripped.length;
  if (at < 0) {
    // no colour map override: before the timing or at the end of the slide element
    const end = declared.lastIndexOf('</p:sld>');
    if (end < 0) return { xml: declared, written: false };
    return { xml: declared.slice(0, end) + element + declared.slice(end), written: true };
  }
  const cut = at + shift + anchor.length;
  return { xml: declared.slice(0, cut) + element + declared.slice(cut), written: true };
}

/** The transition a part carries, read back for the check: the kind element name and `p14:dur`. */
export function readTransition(xml: string): {
  element: string;
  durationMs: number | null;
  spd: string | null;
  fallback: string | null;
} | null {
  const match = EXISTING_RE.exec(xml);
  if (match === null) return null;
  const text = match[0];
  const choice = /<mc:Choice\b[\s\S]*?<p:transition\b([^>]*)>([\s\S]*?)<\/p:transition>/.exec(text);
  const plain = /<p:transition\b([^>]*)>([\s\S]*?)<\/p:transition>/.exec(text);
  const attrs = choice?.[1] ?? plain?.[1] ?? '';
  const body = choice?.[2] ?? plain?.[2] ?? '';
  const element = /<(p(?:14)?:[a-zA-Z]+)\b/.exec(body)?.[1] ?? '';
  const dur = /\sp14:dur="(\d+)"/.exec(attrs)?.[1];
  const spd = /\sspd="([a-z]+)"/.exec(attrs)?.[1] ?? null;
  const fallbackBody = /<mc:Fallback>[\s\S]*?<p:transition\b[^>]*>([\s\S]*?)<\/p:transition>/.exec(
    text,
  )?.[1];
  const fallback =
    fallbackBody === undefined ? null : (/<(p(?:14)?:[a-zA-Z]+)\b/.exec(fallbackBody)?.[1] ?? '');
  return { element, durationMs: dur === undefined ? null : Number(dur), spd, fallback };
}
