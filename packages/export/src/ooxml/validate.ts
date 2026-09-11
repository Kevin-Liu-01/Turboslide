// Package validation (docs/pptx.md "Verification"): the zip walk that asserts what the Open
// Packaging Conventions require of a file before any application opens it. Every part has a
// content type, through an `Override` naming it or a `Default` for its extension; every
// `Override` names a part the package holds; every relationship of every `.rels` part resolves to
// a part (external targets are skipped) and no relationship id repeats inside one part; the root
// `_rels/.rels` names the office document. The exporter runs it before writing the bytes and fails
// the report on an issue; `turboslide export check` runs it over any file.
import { listParts, readPart } from './zip.ts';
import type { Package } from './zip.ts';

export type PackageValidation = {
  parts: number;
  relationships: number;
  /** `<rels part>: <Id> -> <Target>` for every relationship whose target is not in the package. */
  invalidRelationships: string[];
  /** Parts with neither an Override nor a Default content type. */
  undeclaredParts: string[];
  /** Override PartNames naming parts the package does not hold. */
  missingOverrides: string[];
  issues: string[];
  valid: boolean;
};

const OFFICE_DOCUMENT_REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';

/** The part a `.rels` part describes: `ppt/slides/_rels/slide1.xml.rels` -> `ppt/slides/slide1.xml`; `_rels/.rels` -> ''. */
export function sourceOfRels(relsPath: string): string {
  const match = /^(.*?)_rels\/(.*)\.rels$/.exec(relsPath);
  if (!match) return '';
  const dir = match[1] ?? '';
  const name = match[2] ?? '';
  return name === '' ? '' : `${dir}${name}`;
}

/** Resolves a relationship target against the source part's folder; `/x/y` is package absolute. */
export function resolveTarget(sourcePart: string, target: string): string {
  if (target.startsWith('/')) return normalize(target.slice(1));
  const dir = sourcePart.includes('/') ? sourcePart.slice(0, sourcePart.lastIndexOf('/') + 1) : '';
  return normalize(`${dir}${target}`);
}

function normalize(path: string): string {
  const out: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return out.join('/');
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match?.[1];
}

export async function validatePackage(zip: Package): Promise<PackageValidation> {
  const parts = listParts(zip);
  const partSet = new Set(parts);
  const issues: string[] = [];
  const undeclaredParts: string[] = [];
  const missingOverrides: string[] = [];
  const invalidRelationships: string[] = [];
  let relationships = 0;

  if (!partSet.has('[Content_Types].xml')) {
    issues.push('[Content_Types].xml is missing');
  } else {
    const types = await readPart(zip, '[Content_Types].xml');
    const defaults = new Map<string, string>();
    for (const tag of types.match(/<Default\b[^>]*\/>/g) ?? []) {
      const ext = attribute(tag, 'Extension');
      const type = attribute(tag, 'ContentType');
      if (ext !== undefined && type !== undefined) defaults.set(ext.toLowerCase(), type);
    }
    const overrides = new Map<string, string>();
    for (const tag of types.match(/<Override\b[^>]*\/>/g) ?? []) {
      const name = attribute(tag, 'PartName');
      const type = attribute(tag, 'ContentType');
      if (name === undefined || type === undefined) continue;
      overrides.set(name, type);
      if (!partSet.has(name.replace(/^\//, ''))) missingOverrides.push(name);
    }
    for (const part of parts) {
      if (part === '[Content_Types].xml') continue;
      if (overrides.has(`/${part}`)) continue;
      const ext = part.includes('.') ? part.slice(part.lastIndexOf('.') + 1).toLowerCase() : '';
      if (defaults.has(ext)) continue;
      undeclaredParts.push(part);
    }
  }

  if (!partSet.has('_rels/.rels')) {
    issues.push('_rels/.rels is missing');
  } else if (!(await readPart(zip, '_rels/.rels')).includes(OFFICE_DOCUMENT_REL)) {
    issues.push('_rels/.rels names no officeDocument relationship');
  }

  for (const rels of parts.filter((p) => p.endsWith('.rels'))) {
    const source = sourceOfRels(rels);
    if (source !== '' && !partSet.has(source)) {
      issues.push(`${rels} describes ${source}, which is not in the package`);
    }
    const xml = await readPart(zip, rels);
    const ids = new Set<string>();
    for (const tag of xml.match(/<Relationship\b[^>]*\/>/g) ?? []) {
      relationships += 1;
      const id = attribute(tag, 'Id') ?? '';
      const target = attribute(tag, 'Target') ?? '';
      const mode = attribute(tag, 'TargetMode');
      if (ids.has(id)) issues.push(`${rels}: relationship id ${id} repeats`);
      ids.add(id);
      if (mode === 'External') continue;
      const resolved = resolveTarget(source, target);
      if (!partSet.has(resolved)) invalidRelationships.push(`${rels}: ${id} -> ${target}`);
    }
  }

  for (const line of undeclaredParts) issues.push(`no content type for ${line}`);
  for (const line of missingOverrides)
    issues.push(`content type override for missing part ${line}`);
  for (const line of invalidRelationships) issues.push(`relationship target missing: ${line}`);
  return {
    parts: parts.length,
    relationships,
    invalidRelationships,
    undeclaredParts,
    missingOverrides,
    issues,
    valid: issues.length === 0,
  };
}
