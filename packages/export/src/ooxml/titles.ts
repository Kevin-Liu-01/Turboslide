// Slide names and the hidden title placeholder (docs/pptx.md "Slide names and titles"). PowerPoint
// names a slide in its outline, its selection pane and its accessibility checker from the title
// placeholder, and reads `<p:cSld name>` as the slide's name for automation; pptxgenjs writes
// neither (every slide is "Slide N" with no placeholder). The post-process writes the slide title
// into `cSld name` and inserts one title placeholder shape as the first shape of the tree: hidden
// (`cNvPr hidden="1"`), its run at alpha 0 in the heading's own face and size at the heading's
// box, so a viewer that ignores `hidden` draws nothing over the heading, and the flatten cover
// picture lies above it in any case. The shape is what PowerPoint's own "Add hidden slide title"
// command produces, kept inside the page so the geometry read-back stays in bounds.

export type HiddenTitle = {
  /** The slide title, plain text. */
  title: string;
  /** The object name, `ts:<slideId>#title`. */
  name: string;
  /** Offset and extent in EMU: the heading's text box, or a default content box. */
  off: [number, number];
  ext: [number, number];
  /** The run size in hundredths of a point (units.ts szOf). */
  sz: number;
  family: string;
  /** Six hex digits. */
  colorHex: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Sets `<p:cSld name="...">`, adding the attribute when pptxgenjs left it out. */
export function setSlideName(xml: string, name: string): string {
  const value = escapeXml(name);
  if (/<p:cSld\s+name="[^"]*"/.test(xml))
    return xml.replace(/<p:cSld\s+name="[^"]*"/, `<p:cSld name="${value}"`);
  return xml.replace(/<p:cSld(\s|>)/, `<p:cSld name="${value}"$1`);
}

export function readSlideName(xml: string): string | undefined {
  const match = /<p:cSld\s+name="([^"]*)"/.exec(xml);
  return match?.[1] === undefined ? undefined : unescapeXml(match[1]);
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/** True when the part holds a title placeholder (`<p:ph type="title"/>` or `ctrTitle`). */
export function hasTitlePlaceholder(xml: string): boolean {
  return /<p:ph\s+type="(title|ctrTitle)"/.test(xml);
}

/** The text of the first title placeholder, or undefined. */
export function readTitlePlaceholder(xml: string): string | undefined {
  const shapes = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
  for (const shape of shapes) {
    if (!/<p:ph\s+type="(title|ctrTitle)"/.test(shape)) continue;
    const runs = [...shape.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => unescapeXml(m[1] ?? ''));
    return runs.join('');
  }
  return undefined;
}

function nextShapeId(xml: string): number {
  const ids = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => Number(m[1]));
  return Math.max(0, ...ids) + 1;
}

/**
 * Inserts the hidden title placeholder as the first shape of the slide's tree. A part that
 * already carries a title placeholder is returned unchanged.
 */
export function addHiddenTitle(xml: string, title: HiddenTitle): string {
  if (hasTitlePlaceholder(xml)) return xml;
  const id = nextShapeId(xml);
  const shape =
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(title.name)}" hidden="1"/>` +
    '<p:cNvSpPr txBox="1"><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
    `<p:spPr><a:xfrm><a:off x="${title.off[0]}" y="${title.off[1]}"/><a:ext cx="${title.ext[0]}" cy="${title.ext[1]}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
    '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>' +
    `<a:p><a:pPr algn="l" indent="0" marL="0"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="${title.sz}" dirty="0">` +
    `<a:solidFill><a:srgbClr val="${title.colorHex}"><a:alpha val="0"/></a:srgbClr></a:solidFill>` +
    `<a:latin typeface="${escapeXml(title.family)}"/></a:rPr><a:t>${escapeXml(title.title)}</a:t></a:r>` +
    `<a:endParaRPr lang="en-US" sz="${title.sz}" dirty="0"/></a:p></p:txBody></p:sp>`;
  const anchor = /<\/p:grpSpPr>/.exec(xml);
  if (!anchor) return xml;
  const at = anchor.index + anchor[0].length;
  return `${xml.slice(0, at)}${shape}${xml.slice(at)}`;
}
