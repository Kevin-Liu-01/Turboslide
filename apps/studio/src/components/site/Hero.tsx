import { useRef } from 'react';

import type { OnPress } from './AvatarStack';
import { AVATAR_PRESS, HERO } from './copy';
import { Frame } from './Frame';
import { HeroBox } from './HeroBox';
import { SiteIcon } from './SiteIcon';
import { SiteLink } from './SiteLink';
import { Title } from './Title';

/**
 * Screen 01 (docs/SITE.md A.3): the h1 with its two stacks, the lead beside the two buttons, then
 * the editor's figure. The frame's box has a fixed size, 16:10 above 720 px and the phone's column
 * under it, and holds the poster (a capture of the real editor, the first thing painted in the box)
 * until the live editor in its frame says it is ready (HeroBox.tsx), so nothing moves when it
 * arrives. A press on an avatar of the title goes to the live editor through the box (`press`),
 * which loads the editor first when the poster is still up.
 */
export function Hero() {
  const press = useRef<OnPress | null>(null);
  return (
    <section className="site-hero site-wrap" aria-labelledby="site-title">
      <Title onPress={(who) => press.current?.(who)} />
      {/* what pressing an avatar does, read after its name (AvatarStack.tsx) */}
      <span id={AVATAR_PRESS.person.id} hidden>
        {AVATAR_PRESS.person.sentence}
      </span>
      <span id={AVATAR_PRESS.agent.id} hidden>
        {AVATAR_PRESS.agent.sentence}
      </span>
      <div className="site-hero-row">
        <p className="t-lead">{HERO.lead}</p>
        <div className="site-hero-act">
          <div className="site-btns">
            <SiteLink
              href={HERO.primary.href}
              control={HERO.primary.id}
              className="site-btn site-btn-ink"
            >
              <SiteIcon name="plus" />
              {HERO.primary.label}
            </SiteLink>
            <SiteLink
              href={HERO.secondary.href}
              control={HERO.secondary.id}
              className="site-btn site-btn-line"
            >
              <SiteIcon name="presentation-chart-line" />
              {HERO.secondary.label}
            </SiteLink>
          </div>
        </div>
      </div>
      <figure className="site-fig">
        <Frame>
          <HeroBox press={press} />
        </Frame>
      </figure>
    </section>
  );
}
