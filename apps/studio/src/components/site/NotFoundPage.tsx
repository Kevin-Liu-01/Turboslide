import { Link, useRouterState } from '@tanstack/react-router';
import type { CSSProperties } from 'react';

import { tipProps } from '@turboslide/chrome/Tooltip';
import { TurboslideMark } from '@turboslide/chrome/TurboslideMark';

import siteCss from './site.css?url';

/**
 * The Not found page's words: one Title Case heading and the three buttons (DECK-GRAMMAR 22),
 * the labels the matrix rows decks.notfound.page and decks.notfound.sentence-case read.
 */
const NOT_FOUND = {
  title: 'Page Not Found',
  lockup: 'Turboslide home',
  figure: (path: string): string => `404, drawn in the characters of ${path}`,
  newPresentation: 'New Presentation',
  decks: 'Your Presentations',
  about: 'About Turboslide',
} as const;

/** The field's grid in viewBox units: 1600 wide, one row of 14 unit glyphs every 18 units. */
const FIELD_W = 1600;
const FIELD_H = 560;
const ROW_H = 18;
const GLYPH = 14;
/*
 * The faces and sizes sit on the referenced elements as inline styles: Chrome matches no class
 * rule against the copies a `use` draws, and the copies keep the attributes and inherit the
 * page's custom properties from the `use`.
 */
const ROWS: CSSProperties = { fontFamily: 'var(--site-code)', fontSize: GLYPH };
const DIGITS: CSSProperties = { fontFamily: 'var(--site-text)', fontSize: 600, fontWeight: 800 };
/** Katagami Mono's advance is 0.6 em, so a row holds this many characters. */
const ROW_CHARS = Math.ceil(FIELD_W / (GLYPH * 0.6)) + 1;

/** The rows of the field: the address repeated, each row starting three characters on. */
function fieldRows(path: string): string[] {
  const unit = `${path} `;
  const long = unit.repeat(Math.ceil((ROW_CHARS + unit.length * 3) / unit.length) + 1);
  return Array.from({ length: Math.ceil(FIELD_H / ROW_H) }, (_, row) => {
    const from = (row * 3) % unit.length;
    return long.slice(from, from + ROW_CHARS);
  });
}

/**
 * The page at an address the router does not know (gslides-parity SPEC-4 1.10; Kevin,
 * 2026-11-01: "404 page needs to be updated to[o]"): the site's paper, its lockup, and across the
 * window a field of the missing address in Katagami Mono, faint everywhere and in full ink inside
 * a 404 set in Katagami Text at 800 over a ground of the same figures, so the page draws the
 * address that was asked for. Under it the one
 * heading and the three router links. One inline SVG with no script, so the root route, whose
 * module every page loads, gains no code; the site's stylesheet is a React 19 stylesheet
 * resource, hoisted into the head (its every rule names `.ts-site`, so it styles no other page).
 */
export function NotFoundPage() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const rows = fieldRows(path);
  return (
    <div className="ts-site ts-notfound" data-page="notfound">
      <link rel="stylesheet" href={siteCss} precedence="default" />
      <main className="site-nf" data-control="notfound">
        <div className="site-nf-bar site-wrap">
          <Link
            to="/home"
            className="site-lockup"
            data-control="notfound.lockup"
            aria-label={NOT_FOUND.lockup}
            {...tipProps({ name: 'Turboslide', doc: 'Opens the Turboslide home page.' })}
          >
            <TurboslideMark size={24} aria-hidden="true" />
            <span>Turboslide</span>
          </Link>
        </div>
        <svg
          className="site-nf-fig"
          viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
          role="img"
          aria-label={NOT_FOUND.figure(path)}
        >
          <defs>
            <text
              id="site-nf-digits"
              style={DIGITS}
              x={FIELD_W / 2}
              y={FIELD_H - 70}
              textAnchor="middle"
            >
              404
            </text>
            <mask id="site-nf-mask" maskUnits="userSpaceOnUse">
              <rect width={FIELD_W} height={FIELD_H} fill="black" />
              <use href="#site-nf-digits" fill="white" />
            </mask>
            <g id="site-nf-rows" style={ROWS}>
              {rows.map((row, i) => (
                <text key={i} x={0} y={(i + 1) * ROW_H - 4} xmlSpace="preserve">
                  {row}
                </text>
              ))}
            </g>
          </defs>
          <use href="#site-nf-rows" className="site-nf-faint" />
          <use href="#site-nf-digits" className="site-nf-ground" />
          <use href="#site-nf-rows" mask="url(#site-nf-mask)" />
        </svg>
        <div className="site-nf-copy site-wrap">
          <h1 className="site-nf-title t-title">{NOT_FOUND.title}</h1>
          <div className="site-btns">
            <Link
              to="/new"
              className="site-btn site-btn-ink"
              data-control="notfound.new"
              {...tipProps({
                name: NOT_FOUND.newPresentation,
                doc: 'Starts a blank presentation.',
              })}
            >
              {NOT_FOUND.newPresentation}
            </Link>
            <Link
              to="/decks"
              className="site-btn site-btn-line"
              data-control="notfound.decks"
              {...tipProps({
                name: NOT_FOUND.decks,
                doc: 'Opens your presentations and the ones shared with you.',
              })}
            >
              {NOT_FOUND.decks}
            </Link>
            <Link
              to="/home"
              className="site-btn site-btn-line"
              data-control="notfound.about"
              {...tipProps({ name: NOT_FOUND.about, doc: 'Opens the Turboslide home page.' })}
            >
              {NOT_FOUND.about}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
