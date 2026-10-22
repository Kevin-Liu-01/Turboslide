import type { CSSProperties } from 'react';
import { Fragment } from 'react';

import { FIGURE_SIZES } from '../../docs/figures';
import { Frame } from './Frame';
import type { Shot } from './pages-copy';
import { CropPictures } from './ProductCrop';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';

/** A code shot's width over the row's height, beside crops of their own ratios. */
const CODE_RATIO = 0.8;

/** A shot's width over its height: a crop's capture size, or the code panel's share. */
function ratio(shot: Shot): number {
  if (shot.kind === 'code') return CODE_RATIO;
  const size = FIGURE_SIZES[shot.name];
  return size === undefined ? 1 : size.width / size.height;
}

/**
 * A command line in parts: the words, then each flag with its value as one part, so the panel
 * breaks a long line between parts and never inside a flag and its value (run.ts commandParts).
 */
function lineParts(line: string): string[] {
  const words = line.split(' ');
  const parts: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? '';
    const next = words[i + 1];
    if (word.startsWith('--') && next !== undefined && !next.startsWith('--')) {
      parts.push(`${word} ${next}`);
      i += 1;
    } else parts.push(word);
  }
  return parts;
}

/**
 * The figure of a site page's first screen: framed shots of the real product in one row, each
 * column as wide as its capture's ratio asks, so every frame in the row has one height (site.css
 * `.site-shots`). Each shot has a head over the frame: the solid icon and its name, linked to the
 * block it belongs to.
 * A crop is a docs figure in both appearances; a code shot is commands on the #101010 panel.
 * Under 1024 px the shots stack, each at its capture's width at most.
 */
export function PageShots({
  shots,
  name,
  control,
}: {
  shots: readonly Shot[];
  /** the figure's name, read before its shots; none where a named landmark holds it */
  name?: string;
  /** the prefix of each head link's `data-control` id */
  control: string;
}) {
  /* each ratio over the smallest, so the shares add up to one or more and the row takes its
     whole width (a single share under 1fr would leave the rest of the row empty) */
  const ratios = shots.map(ratio);
  const least = Math.min(...ratios);
  const vars = {
    '--shot-cols': ratios.map((each) => `minmax(0, ${(each / least).toFixed(4)}fr)`).join(' '),
  } as CSSProperties;
  return (
    <div
      className="site-shots"
      {...(name === undefined ? {} : { role: 'group', 'aria-label': name })}
      style={vars}
    >
      {shots.map((shot, i) => {
        const size = shot.kind === 'crop' ? FIGURE_SIZES[shot.name] : undefined;
        const style =
          size === undefined ? undefined : ({ '--crop-w': `${size.width}px` } as CSSProperties);
        const label = (
          <>
            <SiteIcon name={shot.icon} />
            {shot.label}
          </>
        );
        return (
          <figure
            key={shot.id}
            className="site-shot"
            data-kind={shot.kind}
            data-shot={shot.id}
            style={style}
          >
            <div className="site-shot-head">
              {shot.href === undefined ? (
                <span className="t-label site-label">{label}</span>
              ) : (
                <SiteLink
                  href={shot.href}
                  control={`${control}.${shot.id}`}
                  className="t-label site-label site-shot-link"
                >
                  {label}
                  <SiteIcon name="arrow-right" />
                </SiteLink>
              )}
            </div>
            {shot.kind === 'crop' ? (
              <Frame className="site-shot-frame">
                <CropPictures name={shot.name} alt={shot.alt} priority={i === 0} />
              </Frame>
            ) : (
              <div className="site-term site-shot-term">
                <pre>
                  <code>
                    {shot.lines.map((line) => (
                      <span key={line} className="site-ln is-cmd">
                        <span className="site-ps" aria-hidden="true">
                          ${' '}
                        </span>
                        {lineParts(line).map((part, j) => (
                          <Fragment key={`${j}-${part}`}>
                            {j === 0 ? '' : ' '}
                            <span className={part.startsWith('--') ? 'site-nw' : undefined}>
                              {part}
                            </span>
                          </Fragment>
                        ))}
                      </span>
                    ))}
                    <span className="site-ln is-cmd site-ln-wait" aria-hidden="true">
                      <span className="site-ps">$ </span>
                      <span className="site-cursor" />
                    </span>
                  </code>
                </pre>
              </div>
            )}
          </figure>
        );
      })}
    </div>
  );
}
