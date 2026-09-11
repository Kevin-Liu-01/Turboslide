// Kerning (SPEC 8.2 post-process; pptx report section 4.5): pptxgenjs writes `kern="0"` with every
// `spc`, which turns kerning off and costs -0.93 to +9.09 percent on Inter lines. DrawingML's
// `kern` is the minimum font size at which kerning applies and an omitted attribute kerns at every
// size (https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.runproperties),
// so the attribute is removed from every run.

export function stripKern(xml: string): string {
  return xml.replace(/\skern="0"/g, '');
}

/** The number of `kern="0"` attributes left, for the read-back test. */
export function countKernZero(xml: string): number {
  return (xml.match(/\skern="0"/g) ?? []).length;
}
