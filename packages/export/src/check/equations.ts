// The equation section of `export check` (gslides-parity SPEC-5 8.4, 16.7 step 36): every
// `a14:m` sits inside an `mc:Choice Requires="a14"` of an `mc:AlternateContent` wrapper whose
// Fallback holds a shape (a consumer without `a14` needs one); every Choice carries one
// `m:oMath` with at least one run; a Fallback picture's `r:embed` resolves to a relationship of
// the slide part whose target is in the package. The counts carry the `a14:m` total, which the
// step compares with the fixture's block count, the wrappers and the picture fallbacks.
import type { ExportCheckSection } from '@turboslide/schema/export';

import { listShapes } from '../ooxml/groups.ts';
import { resolveTarget, sourceOfRels } from '../ooxml/validate.ts';
import { hasPart, readPart, slideParts } from '../ooxml/zip.ts';
import type { Package } from '../ooxml/zip.ts';

function relsOf(part: string): string {
  const slash = part.lastIndexOf('/');
  return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}

/** The relationship ids of a part mapped to their targets, resolved against the part's folder. */
async function relationshipTargets(zip: Package, part: string): Promise<Map<string, string>> {
  const rels = relsOf(part);
  const out = new Map<string, string>();
  if (!hasPart(zip, rels)) return out;
  const xml = await readPart(zip, rels);
  const source = sourceOfRels(rels);
  for (const tag of xml.match(/<Relationship\b[^>]*\/>/g) ?? []) {
    const id = /\sId="([^"]*)"/.exec(tag)?.[1];
    const target = /\sTarget="([^"]*)"/.exec(tag)?.[1];
    const external = /\sTargetMode="External"/.test(tag);
    if (id === undefined || target === undefined) continue;
    out.set(id, external ? target : resolveTarget(source, target));
  }
  return out;
}

export async function checkEquations(zip: Package): Promise<ExportCheckSection> {
  const lines: string[] = [];
  let a14m = 0;
  let wrappers = 0;
  let pictureFallbacks = 0;
  let sourceFallbacks = 0;
  for (const part of slideParts(zip)) {
    const xml = await readPart(zip, part);
    const inPart = (xml.match(/<a14:m\b/g) ?? []).length;
    a14m += inPart;
    if (inPart === 0) continue;
    const targets = await relationshipTargets(zip, part);
    const shapes = listShapes(xml).filter((s) => s.kind === 'alternateContent');
    let wrapped = 0;
    for (const shape of shapes) {
      const choice = /<mc:Choice\b([^>]*)>([\s\S]*?)<\/mc:Choice>/.exec(shape.xml);
      const fallback = /<mc:Fallback>([\s\S]*?)<\/mc:Fallback>/.exec(shape.xml);
      if (choice === null || !/\bRequires="a14"/.test(choice[1] ?? '')) continue;
      const choiceXml = choice[2] ?? '';
      const maths = (choiceXml.match(/<a14:m\b/g) ?? []).length;
      if (maths === 0) continue;
      wrappers += 1;
      wrapped += maths;
      const label = `${part}: "${shape.name}"`;
      if (!/<m:oMath>[\s\S]*<m:r>[\s\S]*<m:t\b/.test(choiceXml))
        lines.push(`${label}: the Choice carries a14:m without an m:oMath run`);
      if (
        !/<m:oMathPara\b[^>]*xmlns:m="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/math"/.test(
          choiceXml,
        )
      )
        lines.push(`${label}: m:oMathPara does not declare the math namespace`);
      if (!/<a:latin typeface="Cambria Math"\/>/.test(choiceXml))
        lines.push(`${label}: the math runs do not name Cambria Math`);
      const fallbackXml = fallback?.[1] ?? '';
      if (fallback === null || !/<p:(sp|pic)>/.test(fallbackXml)) {
        lines.push(`${label}: the Fallback holds no shape`);
        continue;
      }
      if (/<p:pic>/.test(fallbackXml)) {
        pictureFallbacks += 1;
        const embed = /<a:blip\b[^>]*\sr:embed="([^"]*)"/.exec(fallbackXml)?.[1];
        if (embed === undefined) {
          lines.push(`${label}: the Fallback picture has no r:embed`);
          continue;
        }
        const target = targets.get(embed);
        if (target === undefined)
          lines.push(`${label}: r:embed ${embed} names no relationship of the part`);
        else if (!hasPart(zip, target))
          lines.push(
            `${label}: r:embed ${embed} resolves to ${target}, which is not in the package`,
          );
      } else {
        sourceFallbacks += 1;
      }
      // Microsoft's example gives the two shapes one id; the post process's renumber (B1's
      // ooxml/ids.ts, R05 6.4) numbers every p:cNvPr once for the timing tree's references, so a
      // built package carries two ids. Either form is valid: the check wants an id on each shape.
      const choiceId = /<p:cNvPr id="(\d+)"/.exec(choiceXml)?.[1];
      const fallbackId = /<p:cNvPr id="(\d+)"/.exec(fallbackXml)?.[1];
      if (choiceId === undefined || fallbackId === undefined)
        lines.push(
          `${label}: the ${choiceId === undefined ? 'Choice' : 'Fallback'} shape has no p:cNvPr id`,
        );
    }
    if (wrapped !== inPart)
      lines.push(
        `${part}: ${inPart} a14:m element(s) but ${wrapped} inside an mc:Choice Requires="a14"`,
      );
  }
  return {
    ok: lines.length === 0,
    lines,
    counts: { a14m, wrappers, pictureFallbacks, sourceFallbacks },
  };
}
