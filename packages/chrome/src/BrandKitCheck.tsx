import { useEffect, useMemo, useState } from 'react';

import { deckTokens } from '@turboslide/render/theme-css';
import type { ThemeDeck } from '@turboslide/render/theme-css';
import type { HexColor } from '@turboslide/schema/color';
import type { Appearance } from '@turboslide/schema/deck';

import { kitContrastFindings, logoContrast, logoFinding } from './kit-check';
import { PANELS } from './menus/strings';
import { tipProps } from './Tooltip';

/** The longest side, in px, the logo is drawn at to read its pixels. */
const LOGO_SAMPLE = 64;

/**
 * The check list at the foot of the Brand kit panel (kit-check.ts; the Glyphfield port, wave 2
 * item 6): each pair of the kit that does not reach its ratio in either appearance as one sentence,
 * with Fix where the fix is one deterministic write (`onFix` writes the kit pointer, one history
 * entry), and the logo the slides draw measured on the deck's Background. With nothing found it
 * says what was measured. Ids: `panel.brand.check`, `panel.brand.check.<finding id>`, and
 * `.fix` on each Fix.
 */
export function BrandKitCheck({
  deck,
  appearance,
  logoSrc,
  disabled,
  onFix,
}: {
  deck: ThemeDeck;
  /** the appearance the deck's slides draw, where the logo is measured */
  appearance: Appearance;
  /** the picture the slides draw as the kit's logo; undefined for none or the theme's own */
  logoSrc: string | undefined;
  disabled: boolean;
  onFix: (pointer: string, value: HexColor) => void;
}) {
  const words = PANELS.brand;
  const colors = useMemo(() => kitContrastFindings(deck), [deck]);
  const ground = deckTokens(deck, appearance).paper;
  /* the logo's pixels once per picture; the ratio follows the Background as the kit changes */
  const [logo, setLogo] = useState<{ src: string; pixels: Uint8ClampedArray } | null>(null);
  useEffect(() => {
    if (logoSrc === undefined || typeof document === 'undefined') return undefined;
    let live = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!live || image.naturalWidth === 0 || image.naturalHeight === 0) return;
      const scale = Math.min(1, LOGO_SAMPLE / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return;
      context.drawImage(image, 0, 0, width, height);
      try {
        setLogo({ src: logoSrc, pixels: context.getImageData(0, 0, width, height).data });
      } catch {
        /* a picture another origin serves without CORS cannot be read: no reading */
      }
    };
    image.src = logoSrc;
    return () => {
      live = false;
    };
  }, [logoSrc]);
  const logoRow = logoFinding(
    logo !== null && logo.src === logoSrc ? logoContrast(logo.pixels, ground) : null,
    appearance,
  );
  const findings = logoRow === null ? colors : [...colors, logoRow];

  return (
    <section className="ts-brand-section" aria-labelledby="ts-brand-check">
      <h3 id="ts-brand-check" className="ts-brand-head">
        {words.check}
      </h3>
      {findings.length === 0 ? (
        <p className="ts-brand-line" data-control="panel.brand.check">
          {words.checkClear}
        </p>
      ) : (
        <ul className="ts-brand-check-list" data-control="panel.brand.check">
          {findings.map((finding) => (
            <li
              key={finding.id}
              className="ts-brand-finding"
              data-control={`panel.brand.check.${finding.id}`}
            >
              <span>{finding.sentence}</span>
              {finding.fix === undefined ? null : (
                <button
                  type="button"
                  className="pt-ib ts-fo-button is-small"
                  data-control={`panel.brand.check.${finding.id}.fix`}
                  disabled={disabled}
                  onClick={() => {
                    if (finding.fix !== undefined) onFix(finding.fix.pointer, finding.fix.value);
                  }}
                  {...tipProps({ name: words.fix, doc: finding.fix.doc })}
                >
                  <span className="pt-lb">{words.fix}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
