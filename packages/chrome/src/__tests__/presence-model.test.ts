import { describe, expect, it } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import type { PresenceParticipant } from '../editor-shell';
import { PRESENCE } from '../menus/strings';
import {
  Announcer,
  canFollow,
  chipTipOf,
  displayNameFor,
  flagText,
  participantsOnSlide,
  pointersDrawn,
  rosterRoleWord,
  slideNumberOf,
  slotChips,
  stackFlags,
} from '../presence/presence-model';
import {
  agentCells,
  bayerCells,
  glyphCells,
  glyphGrid,
  litFraction,
  markCells,
} from '../presence/mark-svg';
import { chipName, markOf, nameOf } from '../presence/IdentityChip';

// The presence rules (gslides-parity SPEC-3 4.2 to 4.9; research 11 sections 3, 4, 6): the four
// slots and the +N count, the names a link visitor sees, who can be followed, the chip tooltip,
// the flag's text inside its fixed width, the stacking of overlapping flags, the announcements
// coalesced per person, and the mark's cell grid (the Bayer densities, the mirrored glyph field,
// the agent's half field).

const doc = workedDocument();
const [firstSlide, secondSlide] = doc.deck.sections.flatMap((section) => section.slideIds);

function person(clientId: string, over: Partial<PresenceParticipant> = {}): PresenceParticipant {
  return {
    clientId,
    principalId: `anon_${clientId}`,
    label: `Titanium ${clientId.length + 100}`,
    trust: 'label',
    kind: 'anonymous',
    role: 'editor',
    lastSeenAt: '2026-09-13T12:00:00Z',
    ...over,
  };
}

describe('the slots and the count', () => {
  it('fills four slots in roster order and counts the rest for the +N chip, zero when four or fewer', () => {
    const others = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => person(id));
    const { shown, more } = slotChips(others);
    expect(shown.map((p) => p.clientId)).toEqual(['a', 'b', 'c', 'd']);
    expect(more).toBe(2);
    expect(slotChips(others.slice(0, 3)).more).toBe(0);
    expect(slotChips([]).shown).toEqual([]);
  });

  it('numbers slides from the deck order and finds the people on one', () => {
    expect(slideNumberOf(doc, firstSlide)).toBe(1);
    expect(slideNumberOf(doc, secondSlide)).toBe(2);
    expect(slideNumberOf(doc, 'nope')).toBeNull();
    expect(slideNumberOf(doc, undefined)).toBeNull();
    const others = [person('a', { slideId: firstSlide }), person('b', { slideId: secondSlide })];
    expect(participantsOnSlide(others, firstSlide!).map((p) => p.clientId)).toEqual(['a']);
  });
});

describe('names, trust and follow (4.4, 4.8, 0.12)', () => {
  const verified = person('v', {
    kind: 'account',
    trust: 'verified',
    name: 'Maya Chen',
    email: 'maya@example.test',
  });
  it('shows a verified name to grant holders and the role word to a link visitor without the switch', () => {
    expect(displayNameFor(verified, { viaLink: false, showNames: false })).toBe('Maya Chen');
    expect(displayNameFor(verified, { viaLink: true, showNames: false })).toBe(PRESENCE.anEditor);
    expect(displayNameFor(verified, { viaLink: true, showNames: true })).toBe('Maya Chen');
    expect(
      displayNameFor({ ...verified, role: 'commenter' }, { viaLink: true, showNames: false }),
    ).toBe(PRESENCE.aCommenter);
  });

  it('shows a label or a typed name to everyone and an agent as Agent · runId', () => {
    expect(displayNameFor(person('a'), { viaLink: true, showNames: false })).toMatch(/^Titanium/);
    expect(
      displayNameFor(person('g', { trust: 'guest', name: 'Kai' }), {
        viaLink: true,
        showNames: false,
      }),
    ).toBe('Kai');
    expect(
      displayNameFor(person('x', { trust: 'agent', kind: 'agent', runId: 'ci-42' }), {
        viaLink: false,
        showNames: true,
      }),
    ).toBe('Agent · ci-42');
  });

  it('offers Follow on editors and owners with a slide selected and refuses the rest', () => {
    expect(canFollow({ ...verified, slideId: firstSlide }, undefined)).toBe(true);
    expect(canFollow({ ...verified, role: 'owner', slideId: firstSlide }, ['follow'])).toBe(true);
    expect(canFollow({ ...verified, slideId: firstSlide }, ['read'])).toBe(false);
    expect(canFollow({ ...verified, role: 'commenter', slideId: firstSlide }, undefined)).toBe(
      false,
    );
    expect(canFollow({ ...verified, role: 'viewer', slideId: firstSlide }, undefined)).toBe(false);
    expect(canFollow({ ...verified, slideId: undefined }, undefined)).toBe(false);
    expect(canFollow(person('a', { slideId: firstSlide }), undefined)).toBe(false);
    expect(
      canFollow(person('x', { kind: 'account', trust: 'agent', slideId: firstSlide }), undefined),
    ).toBe(false);
  });

  it('words the roster row and the chip tooltip', () => {
    expect(rosterRoleWord(person('a'))).toBe('editor');
    expect(rosterRoleWord(person('a', { role: 'link' }))).toBe(PRESENCE.byLink);
    expect(
      chipTipOf(
        person('g', { trust: 'guest', name: 'Maya' }),
        { viaLink: false, showNames: false },
        12,
      ),
    ).toBe('Maya · guest · slide 12');
    expect(chipTipOf(person('a'), { viaLink: false, showNames: false }, null)).toMatch(
      /^Titanium \d+$/,
    );
  });

  it('keeps the flag text inside its width: the first name, guest only when it fits', () => {
    expect(flagText('Maya Chen', 'guest')).toBe('Maya · guest');
    expect(flagText('Bartholomew', 'guest')).toBe('Bartholomew');
    expect(flagText('Maya Chen', 'verified')).toBe('Maya');
    expect(flagText('Titanium 471', 'label')).toBe('Titanium');
  });

  it('draws pointers under the cap and never in present mode', () => {
    expect(pointersDrawn({ others: [] }, 3, false)).toBe(true);
    expect(pointersDrawn({ others: [] }, 21, false)).toBe(false);
    expect(pointersDrawn({ others: [], cap: 30 }, 21, false)).toBe(true);
    expect(pointersDrawn({ others: [] }, 3, true)).toBe(false);
    expect(pointersDrawn({ others: [], pointersVisible: false }, 3, false)).toBe(false);
  });
});

describe('the flags stack when they overlap (11 6.5)', () => {
  it('moves a later overlapping flag 20 px higher and leaves distant flags alone', () => {
    const placed = stackFlags([
      { x: 100, y: 200 },
      { x: 110, y: 205 },
      { x: 400, y: 200 },
    ]);
    expect(placed[0]).toEqual({ x: 100, y: 200 });
    expect(placed[1]!.y).toBe(180);
    expect(placed[2]).toEqual({ x: 400, y: 200 });
  });
});

describe('the collaborator announcements (4.9)', () => {
  it('says who joined, who moved and who left, one sentence per person per window', () => {
    const announcer = new Announcer(5000);
    const viewer = { viaLink: false, showNames: true };
    const maya = person('m', { trust: 'guest', name: 'Maya', slideId: firstSlide });
    expect(announcer.update([maya], viewer, doc, 0)).toEqual(['Maya joined']);
    /* a move inside the window is coalesced away */
    expect(announcer.update([{ ...maya, slideId: secondSlide }], viewer, doc, 1000)).toEqual([]);
    expect(announcer.update([{ ...maya, slideId: firstSlide }], viewer, doc, 6000)).toEqual([
      'Maya is editing slide 1',
    ]);
    expect(announcer.update([], viewer, doc, 12_000)).toEqual(['Maya left']);
  });
});

describe('the mark grid (11 6.1, 3.3)', () => {
  it('lights d/8 of the Bayer field and never more than half', () => {
    const plate = 22;
    const cells = 11 * 11;
    for (const density of [1, 2, 3, 4] as const) {
      const lit = bayerCells(24, density).length;
      expect(lit).toBeGreaterThan(0);
      expect(lit / cells).toBeCloseTo(density / 8, 1);
    }
    expect(plate).toBe(22);
  });

  it('mirrors the glyph field left to right and keeps a seed deterministic', () => {
    const grid = glyphGrid(0x9e3779b9);
    for (const row of grid) {
      expect(row[0]).toBe(row[4]);
      expect(row[1]).toBe(row[3]);
    }
    expect(glyphCells(24, 7)).toEqual(glyphCells(24, 7));
    expect(glyphCells(16, 7).every((cell) => cell.w === 2 && cell.h === 2)).toBe(true);
  });

  it('lights half of the agent plate with a centred square', () => {
    const cells = agentCells(24);
    const square = cells[cells.length - 1]!;
    expect(square.w).toBe(square.h);
    expect(square.x).toBe(square.y);
    const identity = {
      principalId: 'agent:t1',
      label: 'ci',
      trust: 'agent' as const,
      kind: 'agent' as const,
      runId: 'run-1',
    };
    const spec = markOf(identity);
    expect(spec.variant).toBe('agent');
    expect(litFraction(spec, 24)).toBeGreaterThan(0.45);
    expect(litFraction(spec, 24)).toBeLessThan(0.6);
    expect(nameOf(identity)).toBe('Agent · run-1');
  });

  it('computes initials and a monochrome spec without a hue unless the room granted one', () => {
    const identity = {
      principalId: 'anon_x',
      label: 'Titanium 471',
      name: 'Maya Chen',
      trust: 'guest' as const,
      kind: 'anonymous' as const,
    };
    const spec = markOf(identity);
    expect(spec.variant).toBe('initials');
    expect(spec.initials).toBe('MC');
    expect(spec.hue).toBeNull();
    expect(markOf(identity, { hueSlot: 3 }).hue).toEqual({ slot: 3, hex: '#0f6a6a' });
    expect(markCells(spec, 14).length).toBeGreaterThan(0);
    expect(chipName(identity)).toBe('Maya Chen, guest');
    /* a label's chip carries the label's initial alone */
    expect(markOf({ ...identity, name: undefined, trust: 'label' }).initials).toBe('T');
  });
});
