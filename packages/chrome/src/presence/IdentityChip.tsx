import type { CSSProperties } from 'react';

import { hueFor, isHueSlot } from '@turboslide/identity/hues';
import { markSpec } from '@turboslide/identity/marks';
import type { MarkSpec } from '@turboslide/identity/marks';
import type { ResolvedIdentity } from '@turboslide/identity/resolve';

import type { IdentityView } from '../editor-shell';
import { cn } from '../lib/cn';
import { AGENT_SENTENCES, PRESENCE } from '../menus/strings';
import { initialsFontSize, markCells, plateOf } from './mark-svg';
import type { MarkSize } from './mark-svg';

import './presence.css';

/**
 * The identity chip (gslides-parity SPEC-3 4.1, 4.2, 7.8; research 11 6.1): one monochrome mark
 * per principal at 24, 16 or 14 px, a 1 px `--pt-edge` border (`--pt-ink` for the own chip), the
 * plate's cells from `mark-svg.ts`, the initials in ink, the uploaded picture when the variant is
 * `picture`, a dashed border for an agent, the 2 px live stripe in the participant's hue while
 * the roster holds a live entry, the presenter's 6 px triangle, and the two ring halo over a
 * picture. Every chip carries its accessible name (the name and the trust word) so no fact is
 * colour alone (4.9). Names are text: the initials render through a text node.
 */
export type IdentityChipProps = {
  identity: IdentityView;
  size?: MarkSize;
  /** the hue slot the room granted (1 to 6); the stripe and the flag colour read it */
  hueSlot?: number | null;
  /** the roster holds a live entry: the stripe is drawn */
  live?: boolean;
  self?: boolean;
  presenter?: boolean;
  /** over a dithered picture: the two ring halo outside the border */
  halo?: boolean;
  className?: string;
  /** the picture URL of a `picture` avatar, when the caller resolved one */
  pictureUrl?: string;
};

/** The resolved identity the mark computes from, built from the chrome's view of a principal. */
export function resolvedOf(identity: IdentityView): ResolvedIdentity {
  return {
    principalId: identity.principalId,
    kind: identity.kind,
    displayName: identity.name ?? identity.label,
    label: identity.label,
    trust: identity.trust,
    ...(identity.email === undefined ? {} : { email: identity.email }),
    ...(identity.runId === undefined ? {} : { runId: identity.runId }),
    avatar: { variant: 'initials' },
    deleted: false,
    admin: false,
  };
}

/** The mark of an identity: the view's own spec, else one computed from the identity (11 7.1). */
export function markOf(
  identity: IdentityView,
  options: { hueSlot?: number | null; self?: boolean; presenter?: boolean } = {},
): MarkSpec {
  const hue = isHueSlot(options.hueSlot) ? options.hueSlot : null;
  if (identity.mark !== undefined) {
    return {
      ...identity.mark,
      self: options.self ?? identity.mark.self,
      presenter: options.presenter ?? identity.mark.presenter,
      hue: hue === null ? identity.mark.hue : { slot: hue, hex: hueFor(hue) },
    };
  }
  return markSpec(resolvedOf(identity), {
    hueSlot: hue,
    ...(options.self === undefined ? {} : { self: options.self }),
    ...(options.presenter === undefined ? {} : { presenter: options.presenter }),
  });
}

/** The name a chip shows: the typed or account name, else the label (7.8). */
export function nameOf(identity: IdentityView): string {
  if (identity.trust === 'agent')
    return identity.runId === undefined
      ? (identity.name ?? identity.label)
      : AGENT_SENTENCES.agentTrust(identity.runId);
  return identity.name ?? identity.label;
}

/** The trust word beside a name (15): "guest" for a typed name, nothing for a label or a verified account. */
export function trustWordOf(identity: IdentityView): string | null {
  return identity.trust === 'guest' ? PRESENCE.guest : null;
}

/** The accessible name of a chip: the name and the trust word (4.9). */
export function chipName(identity: IdentityView): string {
  const trust = trustWordOf(identity);
  const name = nameOf(identity);
  return trust === null ? name : `${name}, ${trust}`;
}

/** The hex of a granted slot, or null. */
export function hueHexOf(slot: number | null | undefined): string | null {
  return isHueSlot(slot) ? hueFor(slot) : null;
}

export function IdentityChip({
  identity,
  size = 24,
  hueSlot = null,
  live = false,
  self = false,
  presenter = false,
  halo = false,
  className,
  pictureUrl,
}: IdentityChipProps) {
  const spec = markOf(identity, { hueSlot, self, presenter });
  const plate = plateOf(size);
  const cells = markCells(spec, size);
  const hue = spec.hue?.hex ?? null;
  const style: CSSProperties = {
    width: size,
    height: size,
    ...(hue === null ? {} : ({ '--ts-hue': hue } as CSSProperties)),
  };
  const picture = spec.variant === 'picture' ? (pictureUrl ?? spec.pictureUrl) : undefined;
  return (
    <span
      className={cn(
        'ts-chip',
        self && 'is-self',
        live && hue !== null && 'is-live',
        presenter && 'is-presenter',
        halo && 'has-halo',
        spec.variant === 'agent' && 'is-agent',
        className,
      )}
      style={style}
      data-size={size}
      data-variant={spec.variant}
      data-trust={identity.trust}
      data-principal={identity.principalId}
      data-hue={spec.hue?.slot ?? undefined}
      role="img"
      aria-label={spec.label || chipName(identity)}
    >
      {picture !== undefined ? (
        <img className="ts-chip-picture" src={picture} alt="" width={plate} height={plate} />
      ) : (
        <svg
          className="ts-chip-plate"
          viewBox={`0 0 ${plate} ${plate}`}
          width={plate}
          height={plate}
          aria-hidden="true"
          shapeRendering="crispEdges"
        >
          {cells.map((cell, i) => (
            <rect key={i} x={cell.x} y={cell.y} width={cell.w} height={cell.h} />
          ))}
          {spec.variant === 'initials' && spec.initials !== '' ? (
            <text
              className="ts-chip-initials"
              x={plate / 2}
              y={plate / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={initialsFontSize(size)}
            >
              {spec.initials}
            </text>
          ) : null}
        </svg>
      )}
      {live && hue !== null ? <i className="ts-chip-stripe" aria-hidden="true" /> : null}
      {presenter ? <i className="ts-chip-presenter" aria-hidden="true" /> : null}
    </span>
  );
}
