// The proto:* engines (SPEC 5.4: "the Prototemplate direction engines: event horizon, chroma
// flow, glyph rain, lens gate, singularity ring, liquid metal, gem smoke; ported only if open
// question 9 says so"). Open question 9 is unanswered, so this round lists them as unavailable
// entries with no uniforms or presets: `material list` names them, `material capture` refuses
// them with the question's number, and the five deck openers cut from them stay `file` sources
// with their direction named in the credit (OPENERS.md). Nothing here runs a shader.
import type { MaterialCatalogEntry } from '@turboslide/schema/blocks/material';

const UNPORTED =
  'Not ported: SPEC open question 9 (import Paper Shaders directly and port the Prototemplate direction engines as proto:* materials, or proxy Glyphfield) is Kevin’s decision.';

function proto(id: string, label: string, doc: string, deckUse: string): MaterialCatalogEntry {
  return {
    id,
    family: 'proto',
    label,
    doc: `${doc} ${deckUse} ${UNPORTED}`,
    available: false,
    credit: `Material: ${label}, a Prototemplate direction`,
    license: 'Kevin Liu’s own code (Prototemplate/src/lib/directions.ts)',
    uniforms: [],
    presets: [],
  };
}

export const PROTO_MATERIALS: ReadonlyArray<MaterialCatalogEntry> = [
  proto(
    'proto:event-horizon',
    'Event Horizon',
    'The careers page horizon field shader: a ring with a glow and orbiting locale labels.',
    'The Brand opener is its top arc, dithered (OPENERS.md).',
  ),
  proto(
    'proto:chroma-flow',
    'Chroma Flow',
    'Doubled flow lines bending toward a central ellipse.',
    'The Design system opener, dithered from the light render.',
  ),
  proto(
    'proto:glyph-rain',
    'Glyph Rain',
    'The production homepage hero engine: a falling character field.',
    'The Website opener is its right half, dithered.',
  ),
  proto(
    'proto:lens-gate',
    'Lens Gate',
    'A wireframe sphere over horizontal rules.',
    'The Documentation opener is the upper half of the sphere, dithered.',
  ),
  proto(
    'proto:singularity',
    'Singularity',
    'The horizon ring of the singularity dossier, label free on the 404 route.',
    'The Status and plan opener is the ring’s left arc, dithered.',
  ),
];

export function isProtoMaterial(id: string): boolean {
  return id.startsWith('proto:');
}
