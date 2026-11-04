import { COLLAB_GEOMETRY } from '@turboslide/render/collab';

/**
 * The glyph fields behind the chapters (Chapters.tsx; Kevin, 2026-11-03: "continue using our glyph
 * background motif"): each section is printed like the hero's field (SiteField.tsx), in Katagami
 * Mono through the deck's Bayer screen with a lens that reads the source under the pointer, but
 * from a picture of its own and set in the source of what its chapter's editor does: the calls
 * the agents make (try/story.ts; story.test.ts holds every action named here to the chapter's
 * script), the frames people's pointers send, the slideshow's keys. The art is painted white on
 * black into the field's sample, one pixel a cell, so white is ink.
 */

/**
 * The share of its ink a chapter's field prints at rest, so the copy and the editor lead and the
 * glyphs stay in the back; the lens under the pointer brings the cells it covers to full.
 */
export const FIELD_QUIET = 0.4;

/** What a chapter's field prints. */
export type FieldArt = 'globe' | 'bars' | 'pointers' | 'play';

export type ChapterField = { art: FieldArt; source: string };

/** One line of the field's source: a call as the editor logs it, its keys in a fixed order. */
const line = (call: Record<string, unknown>): string => JSON.stringify(call);

export const CHAPTER_FIELDS: Readonly<
  Record<'agents' | 'features' | 'together' | 'present', ChapterField>
> = {
  agents: {
    art: 'globe',
    source: [
      line({ agent: 'Claude Code', action: 'slide.insert', slideId: 'story-light' }),
      line({
        agent: 'Claude Code',
        action: 'block.insert',
        type: 'material',
        materialId: 'paper:god-rays',
      }),
      line({
        agent: 'Claude Code',
        action: 'block.set',
        path: '/materialId',
        value: 'paper:smoke-ring',
      }),
      line({
        agent: 'Codex',
        action: 'block.insert',
        type: 'picture',
        asset: 'hatteras',
        mask: 'ellipse',
      }),
      line({
        agent: 'Codex',
        action: 'comment.add',
        text: 'Can the heading say where this was taken?',
      }),
      line({ agent: 'Claude Code', action: 'comment.reply', text: 'Done. It says from the air.' }),
      line({ agent: 'Claude Code', action: 'block.set', path: '/pos', rotate: 354 }),
      line({ agent: 'Codex', action: 'comment.resolve' }),
    ].join(''),
  },
  features: {
    art: 'bars',
    source: [
      line({ agent: 'Codex', action: 'chart.setData', series: 'Orders', values: [28, 21, 13, 4] }),
      line({ agent: 'Codex', action: 'chart.setKind', kind: 'column' }),
      line({ agent: 'Claude Code', action: 'motion.add', preset: 'rise-in' }),
      line({ agent: 'Codex', action: 'chart.setKind', kind: 'pie' }),
      line({ agent: 'Codex', action: 'block.insert', type: 'table', rows: 4 }),
      line({ agent: 'Claude Code', action: 'deck.set', path: '/theme', value: 'night' }),
      line({ agent: 'Claude Code', action: 'block.distribute', axis: 'horizontal' }),
      line({ agent: 'Codex', action: 'block.insert', type: 'shape', shape: 'arrow' }),
    ].join(''),
  },
  together: {
    art: 'pointers',
    source: [
      line({ t: 'presence', who: 'Cobalt 118', slideId: 'title', pointer: { x: 820, y: 600 } }),
      line({ agent: 'Codex', action: 'comment.add', text: 'Can the lead name the quarter?' }),
      line({ t: 'presence', who: 'OpenClaw', doing: 'reading this slide' }),
      line({
        agent: 'Claude Code',
        action: 'comment.reply',
        text: 'Done. It names the third quarter.',
      }),
      line({ t: 'presence', who: 'Argon 905', slideId: 'title', pointer: { x: 1180, y: 340 } }),
      line({ agent: 'Codex', action: 'comment.resolve' }),
      line({ t: 'presence', who: 'Hermes', doing: 'leaving a comment' }),
    ].join(''),
  },
  present: {
    art: 'play',
    source: [
      line({ action: 'slide.transition', transition: { name: 'blur-swipe', durationMs: 700 } }),
      line({ action: 'view.present', on: true }),
      line({ action: 'view.goto', slideId: 'agenda' }),
      line({ key: 'ArrowRight' }),
      line({ action: 'view.goto', slideId: 'numbers' }),
      line({ key: 'S', opens: 'presenter view' }),
      line({ key: 'Escape' }),
    ].join(''),
  },
};

/** The features field's bars, shares of its height left to right: a skyline at its foot. */
const BARS = [0.18, 0.3, 0.24, 0.4, 0.33, 0.48, 0.38, 0.56, 0.44, 0.62];

/**
 * The people's pointers of the together field: where each tip sits, as shares of the field's box,
 * its height as a share of the field's, and its tone. Four large ones in the corners round the
 * copy and the editor, as people arriving.
 */
const POINTERS: ReadonlyArray<{ x: number; y: number; s: number; tone: number }> = [
  { x: 0.025, y: 0.04, s: 0.34, tone: 0.8 },
  { x: 0.075, y: 0.58, s: 0.24, tone: 0.6 },
  { x: 0.86, y: 0.03, s: 0.28, tone: 0.7 },
  { x: 0.9, y: 0.55, s: 0.36, tone: 0.85 },
];

/**
 * Paints a chapter's art white on black into the field's sample, in CSS px of the field's box
 * (the caller has scaled the context to one pixel a cell). `picture` is the globe's photograph,
 * loaded by the caller; nothing is drawn for the globe without it.
 */
export function paintArt(
  s: CanvasRenderingContext2D,
  box: { width: number; height: number },
  art: FieldArt,
  picture: HTMLImageElement | null,
): void {
  const { width: w, height: h } = box;
  s.save();
  s.fillStyle = '#fff';
  if (art === 'globe' && picture !== null) {
    /* the Blue Marble as a disc, its centre left of the copy, bleeding off the window's left */
    const r = Math.min(h * 0.62, w * 0.36);
    const cx = Math.max(r * 0.55, w * 0.16);
    const cy = h * 0.5;
    s.beginPath();
    s.arc(cx, cy, r, 0, Math.PI * 2);
    s.clip();
    s.drawImage(picture, cx - r, cy - r, r * 2, r * 2);
  }
  if (art === 'bars') {
    /* a column chart across the window, rising from the section's foot, lighter toward its top */
    const gap = w * 0.018;
    const bw = (w - gap * (BARS.length + 1)) / BARS.length;
    BARS.forEach((share, i) => {
      const bh = h * share;
      const x = gap + i * (bw + gap);
      const shade = s.createLinearGradient(0, h - bh, 0, h);
      shade.addColorStop(0, 'rgb(255 255 255 / 0.35)');
      shade.addColorStop(1, 'rgb(255 255 255 / 0.8)');
      s.fillStyle = shade;
      s.fillRect(x, h - bh, bw, bh);
    });
  }
  if (art === 'pointers') {
    /* the editor's pointer (COLLAB_GEOMETRY) at six sizes round the copy, as people arriving */
    const { points, height } = COLLAB_GEOMETRY.pointer;
    const polygon = points.split(' ').map((pair) => pair.split(',').map(Number));
    for (const p of POINTERS) {
      const k = (h * p.s) / height;
      s.globalAlpha = p.tone;
      s.beginPath();
      polygon.forEach(([px = 0, py = 0], i) => {
        const x = w * p.x + px * k;
        const y = h * p.y + py * k;
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      });
      s.closePath();
      s.fill();
    }
  }
  if (art === 'play') {
    /* the slideshow's play glyph, large in the band's lower right beside the copy */
    const th = h * 0.56;
    const tw = th * 0.86;
    const x0 = w * 0.64;
    const y0 = h - th - h * 0.04;
    const steps = 6;
    for (let k = 0; k < steps; k += 1) {
      /* nested triangles, lighter toward the rim, so the glyphs thin out at the edge */
      const inset = (k / steps) * tw * 0.42;
      s.globalAlpha = 0.3 + (0.5 * k) / (steps - 1);
      s.beginPath();
      s.moveTo(x0 + inset, y0 + inset * 1.15);
      s.lineTo(x0 + tw - inset * 0.6, y0 + th / 2);
      s.lineTo(x0 + inset, y0 + th - inset * 1.15);
      s.closePath();
      s.fill();
    }
  }
  s.restore();
}
