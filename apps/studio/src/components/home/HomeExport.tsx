import type { CSSProperties } from 'react';

import { homeAsset } from './assets';
import { EXPORT } from './copy';
import { HOME_EXPORT_FACTS } from './deck.generated';
import { HOME_FACTS } from './facts';
import { HomeLink } from './HomeLink';
import { BandHead, HomeSection, Reserve } from './HomeSection';
import { ServerHtml } from './HomeSheet';

/**
 * Export to PDF and PowerPoint (docs/LANDING.md 2.12, Kevin's picks "C: Export seam" and "B:
 * Export loupe", the loupe V3#17's): slide 7 (the opener field's slide) at the column's width,
 * unframed, in the band's reserved box, as the two files the CLI writes meet at a
 * seam: left of the cut, the Perfect file's one picture (its part, served as lossless WebP of the
 * same pixels); right of it, the Editable text file's slide drawn from its own parts (each text
 * frame at its `a:off` and `a:ext` with its runs, its picture parts and its hairlines), its text
 * selectable. The cut is one CSS variable, `--seam-cut`, on a clip of the picture layer, at 50
 * percent at rest; the handle is a slider. Three ruled rows under it, the PDF a link with
 * `download` to the file in the page's appearance, requested only on the click: the markup names
 * the light file, and the live module (`live/seam.ts`) names the shown appearance's from the band's
 * start and after every change of the appearance. The drag, the
 * keys and E1 are the live module's (L3, push 6; L4, push 7). Hooks: integrator.md 4.1, l3.md R8,
 * R8b.
 */
export function HomeExport() {
  const perfect = {
    light: homeAsset('export-perfect', 'light'),
    dark: homeAsset('export-perfect', 'dark'),
  };
  const pdf = { light: homeAsset('pdf', 'light'), dark: homeAsset('pdf', 'dark') };
  const size = { width: HOME_EXPORT_FACTS.perfectWidth, height: HOME_EXPORT_FACTS.perfectHeight };
  return (
    <HomeSection id="export">
      <BandHead id="export" heading={EXPORT.h2} lead={EXPORT.lead} span={7} />
      <Reserve band="export" className="ts-export-reserve">
        <div
          className="ts-seam-slide"
          data-seam-root
          style={{ '--seam-cut': '50%' } as CSSProperties}
        >
          <div className="ts-seam-labels" aria-hidden="true">
            <span className="ts-seam-label">{EXPORT.labels.perfect}</span>
            <span className="ts-seam-label">{EXPORT.labels.editable}</span>
          </div>
          <div className="ts-seam-box">
            {/* the Editable text side, written by the band's chunk after load (4.2) */}
            <ServerHtml
              className="ts-seam-editable ts-home-sheet-box"
              data-fill="export-editable"
              html=""
            />
            <div className="ts-seam-perfect">
              {(['light', 'dark'] as const).map((theme) => (
                <img
                  key={theme}
                  className={`ts-only-${theme}`}
                  src={perfect[theme].path}
                  width={perfect[theme].width ?? undefined}
                  height={perfect[theme].height ?? undefined}
                  loading="lazy"
                  decoding="async"
                  alt={EXPORT.perfectAlt}
                />
              ))}
            </div>
            <div
              className="ts-seam-handle"
              role="slider"
              tabIndex={0}
              aria-label={EXPORT.sliderLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={50}
              aria-valuetext={EXPORT.slider(50)}
              data-seam
            >
              <i className="ts-seam-knob" />
            </div>
          </div>
        </div>
      </Reserve>
      <div className="ts-home-rows ts-export-rows">
        <div className="ts-row">
          <span className="ts-row-key">{EXPORT.rows.perfect.key}</span>
          <span className="ts-row-value">{EXPORT.rows.perfect.sentence(size, HOME_FACTS)}</span>
          <HomeLink
            href={EXPORT.rows.perfect.link.href}
            external
            control={EXPORT.rows.perfect.link.id}
            className="ts-row-link"
          >
            {EXPORT.rows.perfect.link.label}
          </HomeLink>
        </div>
        <div className="ts-row">
          <span className="ts-row-key">{EXPORT.rows.editable.key}</span>
          <span className="ts-row-value">{EXPORT.rows.editable.sentence}</span>
        </div>
        <div className="ts-row">
          <span className="ts-row-key">{EXPORT.rows.pdf.key}</span>
          <span className="ts-row-value">{EXPORT.rows.pdf.sentence}</span>
          <a
            className="ts-row-link"
            href={pdf.light.path}
            download
            data-pdf
            data-href-light={pdf.light.path}
            data-href-dark={pdf.dark.path}
            data-control="home.export.pdf"
          >
            {EXPORT.rows.pdf.link}
          </a>
        </div>
      </div>
      <p className="ts-sr" aria-live="polite" data-announce />
    </HomeSection>
  );
}
