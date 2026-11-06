import { useRef } from 'react';

import { useMountEffect } from '../useMountEffect';
import type { FieldArt } from './chapter-fields';
import { attachField } from './field-canvas';
import type { FieldKind } from './field-canvas';
import { SOURCE } from './field';

/**
 * A field of the site: the canvas, which `attachField` (field-canvas.ts) draws once the page
 * mounts it. The canvas names its kind and its chapter's art (`data-field-kind`,
 * `data-field-art`), so /home's static script draws the same field from the server's markup
 * (home-entry.ts). The canvas is decorative (`aria-hidden`).
 */
export function SiteField({
  kind = 'slide',
  art,
  source = SOURCE,
}: {
  kind?: FieldKind;
  art?: FieldArt;
  source?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useMountEffect(() =>
    canvas.current === null ? undefined : attachField(canvas.current, { kind, art, source }),
  );
  return (
    <canvas
      ref={canvas}
      className="site-field"
      aria-hidden="true"
      data-field-kind={kind}
      data-field-art={art}
    />
  );
}
