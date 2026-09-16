// The file types the three Upload tabs accept (gslides-parity SPEC-5 0.26, 5.2; MILESTONES-5 B3
// day 1): a Turboslide bundle (.zip) as before, and since round five a PowerPoint file (.pptx),
// which File > Open, the home page's Upload tab and File > Import slides hand to the one reader
// (`import.pptx`). The `accept` attribute names both the extensions and the media types because
// browsers match either; the handlers tell the two apart by the file's name.
export const BUNDLE_MIME = 'application/zip';
export const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** The `accept` value of an Upload tab's file input. */
export const UPLOAD_ACCEPT = ['.zip', '.pptx', BUNDLE_MIME, PPTX_MIME].join(',');

/** True for a PowerPoint file by name or media type. */
export function isPptxFile(file: { name: string; type?: string }): boolean {
  return /\.pptx$/i.test(file.name) || file.type === PPTX_MIME;
}
