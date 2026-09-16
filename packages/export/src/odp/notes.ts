// The speaker notes of a page (gslides-parity SPEC-5 6.3; SPEC 7.2.13, decision 15.2): under
// `includeNotes` every `draw:page` closes with a `presentation:notes` holding the page thumbnail
// placeholder and one `draw:frame presentation:class="notes"` text box with the notes as
// paragraphs, the way LibreOffice Impress writes its own notes view.
import { el, odfText } from './xml.ts';

/** The notes element of a page; an empty string when there are no notes to carry. */
export function notesXml(notes: string | undefined, styleName: string): string {
  const text = (notes ?? '').trim();
  if (text === '') return '';
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => el('text:p', { 'text:style-name': styleName }, odfText(line)))
    .join('');
  return el(
    'presentation:notes',
    {},
    el('draw:page-thumbnail', {
      'presentation:class': 'page',
      'draw:layer': 'layout',
      'svg:width': '13.968cm',
      'svg:height': '7.857cm',
      'svg:x': '2.516cm',
      'svg:y': '2.257cm',
    }) +
      el(
        'draw:frame',
        {
          'presentation:class': 'notes',
          'draw:layer': 'layout',
          'svg:width': '16.799cm',
          'svg:height': '13.364cm',
          'svg:x': '2.1cm',
          'svg:y': '12.4cm',
        },
        el('draw:text-box', {}, paragraphs),
      ),
  );
}
