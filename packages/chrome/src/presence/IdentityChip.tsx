import { useState } from 'react';
import type { CSSProperties } from 'react';

import { hueFor, isHueSlot } from '@turboslide/identity/hues';
import { markSpec } from '@turboslide/identity/marks';
import type { MarkSpec } from '@turboslide/identity/marks';
import { pictureUrlAt } from '@turboslide/identity/picture';
import type { PictureSize } from '@turboslide/identity/picture';
import type { ResolvedIdentity } from '@turboslide/identity/resolve';

import type { IdentityView } from '../editor-shell';
import { Icon } from '../icons';
import { cn } from '../lib/cn';
import { AGENT_SENTENCES, PRESENCE } from '../menus/strings';
import { initialsFontSize, markCells, plateOf } from './mark-svg';
import type { MarkSize } from './mark-svg';

import './presence.css';

/**
 * The identity chip (gslides-parity SPEC-3 4.1, 4.2, 7.8; research 11 6.1; docs/PEOPLE.md 3.4,
 * 3.7, 4.4): one monochrome mark per principal at 24, 16, 14 or 12 px, a 1 px `--pt-edge` ring
 * (`--pt-ink` for the own chip), a 1 px paper gap inside it, then the field: the package raster's
 * cells through `mark-svg.ts`, the initials in ink, or the uploaded picture when the variant is
 * `picture` (32 px at 1x and 64 px at 2x through `srcset`, the initials field under it when the
 * picture fails to load); a dashed ring for an agent, the 2 px live stripe in the participant's
 * hue over the field's bottom two rows while the roster holds a live entry, the presenter's 6 px
 * triangle, and the two ring halo over a picture. Every chip carries its accessible name (the
 * name and the trust word: "Maya, guest", "Ada Lovelace, signed in") so no fact is colour alone
 * (4.9). Names are text: the initials render through a text node. The verified badge beside a
 * name on the text surfaces is `TrustMark`, drawn by the roster row, the comment card and list,
 * the version row, the account head, the Share rows and the Profile head.
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
  /** the picture URL of a `picture` avatar, when the caller resolved one (the 64 px file, or the 128 px file for a head) */
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

/** The name a chip shows: the typed or account name, else the label (7.8); the "(2)" suffix of a colliding label travels in them (docs/PEOPLE.md 3.17). */
export function nameOf(identity: IdentityView): string {
  if (identity.trust === 'agent')
    return identity.runId === undefined
      ? (identity.name ?? identity.label)
      : AGENT_SENTENCES.agentTrust(identity.runId);
  return identity.name ?? identity.label;
}

/** What the trust helpers read: the trust state and, once the shell carries it, the deleted flag (docs/PEOPLE.md 3.7). */
export type TrustFacts = Pick<IdentityView, 'trust'> & { deleted?: boolean };

/**
 * The trust word beside a name (15; docs/PEOPLE.md 2.2 default 3): "guest" for a typed name,
 * "signed in" for a verified account (the accessible word; the text surfaces draw the badge in
 * its place), nothing for a label, an agent or a deleted account.
 */
export function trustWordOf(identity: TrustFacts): string | null {
  if (identity.trust === 'guest') return PRESENCE.guest;
  if (identity.trust === 'verified' && identity.deleted !== true) return PRESENCE.signedIn;
  return null;
}

/** The glyph after a verified account's name (docs/PEOPLE.md 3.7): the 14 px check badge, never for a deleted account, never in a hue. */
export function trustMarkOf(identity: TrustFacts): 'check-badge' | null {
  return identity.trust === 'verified' && identity.deleted !== true ? 'check-badge' : null;
}

/**
 * The verified badge as the text surfaces draw it after a name: 14 px, `--pt-ink-2`, with the
 * accessible word "signed in" (research 11 5.2; docs/PEOPLE.md 3.7). Draws nothing for anyone
 * `trustMarkOf` answers null for, so a surface can render it unconditionally after the name.
 */
export function TrustMark({ identity, className }: { identity: TrustFacts; className?: string }) {
  const mark = trustMarkOf(identity);
  if (mark === null) return null;
  return (
    <span
      className={cn('ts-trust-mark', className)}
      role="img"
      aria-label={PRESENCE.signedIn}
      data-trust-mark={mark}
    >
      <Icon name={mark} size={14} />
    </span>
  );
}

/** The accessible name of a chip: the name and the trust word (4.9): "Maya, guest", "Ada Lovelace, signed in". */
export function chipName(identity: IdentityView): string {
  const trust = trustWordOf(identity);
  const name = nameOf(identity);
  return trust === null ? name : `${name}, ${trust}`;
}

/** The hex of a granted slot, or null. */
export function hueHexOf(slot: number | null | undefined): string | null {
  return isHueSlot(slot) ? hueFor(slot) : null;
}

/**
 * The picture files a chip loads (docs/PEOPLE.md 4.4): the file named at 2x and the file half its
 * size at 1x through `srcset` (32 and 64 for a chip, 64 and 128 for the Profile head), both
 * derived by the store's path grammar through `pictureUrlAt` of `packages/identity`; a URL of
 * another shape loads as given with no `srcset`.
 */
export function pictureSources(url: string): { src: string; srcSet?: string } {
  const match = /-(64|128|256)\.webp$/.exec(url);
  if (match === null) return { src: url };
  const half = pictureUrlAt(url, (Number(match[1]) / 2) as PictureSize);
  return half === undefined ? { src: url } : { src: url, srcSet: `${half} 1x, ${url} 2x` };
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
  const hue = spec.hue?.hex ?? null;
  /* a picture that failed to load draws the initials field in its place, so a 404 never leaves an
     empty box (parity, "the picture's limits and fallbacks"); keyed by the URL so a new picture
     after a rotation loads again */
  const [failed, setFailed] = useState<string | null>(null);
  const style: CSSProperties = {
    width: size,
    height: size,
    ...(hue === null ? {} : ({ '--ts-hue': hue } as CSSProperties)),
  };
  const wanted = spec.variant === 'picture' ? (pictureUrl ?? spec.pictureUrl) : undefined;
  const picture = wanted !== undefined && failed !== wanted ? pictureSources(wanted) : undefined;
  /* the field a picture spec falls back to (build/b5.md R10): the initials mark of the identity
     itself (its letters, the density of its own id, the hue kept), never the picture spec's own
     cells, which are none and drew an empty box */
  const drawn: MarkSpec =
    spec.variant === 'picture' && picture === undefined
      ? markSpec(resolvedOf(identity), {
          hueSlot: spec.hue?.slot ?? null,
          self: spec.self,
          presenter: spec.presenter,
        })
      : spec;
  const cells = markCells(drawn, size);
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
      data-variant={picture === undefined && spec.variant === 'picture' ? 'initials' : spec.variant}
      data-trust={identity.trust}
      data-principal={identity.principalId}
      data-hue={spec.hue?.slot ?? undefined}
      data-picture={picture === undefined ? undefined : 'loaded'}
      role="img"
      aria-label={chipName(identity)}
    >
      {picture !== undefined ? (
        <img
          className="ts-chip-picture"
          src={picture.src}
          srcSet={picture.srcSet}
          decoding="async"
          alt=""
          width={plate}
          height={plate}
          onError={() => setFailed(wanted ?? null)}
        />
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
          {drawn.variant === 'initials' && drawn.initials !== '' ? (
            <text
              className="ts-chip-initials"
              x={plate / 2}
              y={plate / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={initialsFontSize(size)}
            >
              {drawn.initials}
            </text>
          ) : null}
        </svg>
      )}
      {live && hue !== null ? <i className="ts-chip-stripe" aria-hidden="true" /> : null}
      {presenter ? <i className="ts-chip-presenter" aria-hidden="true" /> : null}
    </span>
  );
}
