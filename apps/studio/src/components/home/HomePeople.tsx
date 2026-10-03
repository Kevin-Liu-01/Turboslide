import { PEOPLE } from './copy';
import { BandHead, HomeSection } from './HomeSection';
import { HomeSheet } from './HomeSheet';
import { PEOPLE_LOOP_SECONDS } from './live/people-timing';

/**
 * Two people edit the same slide (docs/LANDING.md 2.10, Kevin's pick "B: Two people edit the same
 * slide, two screens with live carets, name flags and Follow"): the h2 and the lead in the left 7
 * of 12 columns, then the band's reserved box (v4.md, 11:45): the two labels pinned to the
 * column's sides and the two screens, 500 px each and 24 px apart (stacked under 720 px), each
 * with its title row (empty in the document, written by V4's `live/people.ts`) and slides 2 and 3
 * as placeholders the band's chunk fills. The caption's figure is the staged sequence's length
 * (`live/people-timing.ts`, V4's). Its push (V4#20) ships only when production's presence rows
 * read green (2.10 "The gate").
 */
export function HomePeople() {
  return (
    <HomeSection id="people">
      <BandHead id="people" heading={PEOPLE.h2} lead={PEOPLE.lead} span={7} />
      <div className="ts-people" data-reserve="people">
        <p className="ts-people-label" data-label="maya">
          {PEOPLE.screens.maya}
        </p>
        <p className="ts-people-label" data-label="sam">
          {PEOPLE.screens.sam}
        </p>
        {(['maya', 'sam'] as const).map((who) => (
          <div className="ts-people-screen" data-screen={who} key={who}>
            <div className="ts-people-title" aria-hidden="true" />
            <div className="ts-people-slides">
              <HomeSheet instance={`people-${who}-plan`} fill />
              <HomeSheet instance={`people-${who}-gets`} fill hidden />
            </div>
            {who === 'maya' ? <div data-follow hidden /> : null}
          </div>
        ))}
      </div>
      <p className="ts-caption ts-people-caption">{PEOPLE.caption(PEOPLE_LOOP_SECONDS)}</p>
      <p className="ts-sr" aria-live="polite" data-announce />
    </HomeSection>
  );
}
