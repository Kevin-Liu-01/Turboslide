// The eight sections from `SECTIONS` in parts/tail.html line 83 (SPEC 9): `[[1, 'Brand'], ...]`.
import { slugify } from './ids.ts';

export type SourceSection = { start: number; name: string; id: string };

export function parseSections(tailHtml: string): SourceSection[] {
  const match = /var SECTIONS = \[([\s\S]*?)\];/.exec(tailHtml);
  if (!match) throw new Error('import: SECTIONS not found in parts/tail.html');
  const out: SourceSection[] = [];
  for (const entry of (match[1] ?? '').matchAll(/\[(\d+),\s*'((?:[^'\\]|\\.)*)'\]/g)) {
    const name = (entry[2] ?? '').replace(/\\'/g, "'");
    out.push({ start: Number(entry[1]), name, id: slugify(name) });
  }
  if (out.length === 0) throw new Error('import: SECTIONS is empty');
  return out;
}

/** The section a 1-based slide number belongs to. */
export function sectionOf(sections: SourceSection[], n: number): SourceSection {
  let current = sections[0];
  for (const section of sections) if (section.start <= n) current = section;
  if (!current) throw new Error('import: no sections');
  return current;
}
