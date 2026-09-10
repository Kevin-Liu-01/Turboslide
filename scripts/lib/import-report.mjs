// Reads the importer's import-report.json (SPEC 9) without depending on its final shape.
// The report carries one row per slide with the slide id and whether an `html` escape block was
// needed. The reader accepts the shapes below so the import builder can pick the exact fields;
// the recommended shape is documented in AGENTS.md (contracts between builders):
//
//   { "slides": [{ "n": 67, "id": "tools", "kind": "content", ..., "html": { "reason": "..." } | null }], "htmlBlocks": 4, ... }
//
// Rows: the top-level array, or report.slides, or report.rows.
// Escape: row.html is an object, true or a non-empty string; or row.htmlBlocks > 0; or row.escape
// is truthy; or row.blocks contains an entry whose type is 'html' (or the string 'html').

export function rowsOf(report) {
  if (Array.isArray(report)) return report;
  if (report && typeof report === 'object') {
    for (const key of ['slides', 'rows']) {
      if (Array.isArray(report[key])) return report[key];
    }
  }
  return [];
}

export function slideIdOf(row) {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.id === 'string') return row.id;
  if (typeof row.slideId === 'string') return row.slideId;
  return null;
}

export function isEscapeRow(row) {
  if (!row || typeof row !== 'object') return false;
  const html = row.html;
  if (html === true) return true;
  if (html && typeof html === 'object') return true;
  if (typeof html === 'string' && html.length > 0) return true;
  if (typeof row.htmlBlocks === 'number' && row.htmlBlocks > 0) return true;
  if (row.escape) return true;
  if (Array.isArray(row.blocks)) {
    return row.blocks.some(
      (block) => block === 'html' || (block && typeof block === 'object' && block.type === 'html'),
    );
  }
  return false;
}

/** Slide ids of every row that needed an html escape block. */
export function escapeSlideIds(report) {
  const ids = new Set();
  for (const row of rowsOf(report)) {
    if (isEscapeRow(row)) {
      const id = slideIdOf(row);
      if (id) ids.add(id);
    }
  }
  return ids;
}
