import { AvatarStack } from './AvatarStack';
import type { OnPress } from './AvatarStack';
import { TITLE, TITLE_TEXT } from './copy';

/**
 * The landing's h1, "Presentations for people and agents" (docs/SITE.md B), with the people's
 * arc rising from the top right of "people" and the agents' arc from the top right of "agents".
 * Each arc is positioned out of the line's flow from its word, so the sentence keeps its word
 * spacing. The heading is named by the sentence alone (its `aria-label`; its text content is the
 * sentence too, since the portraits and the marks are svg), and the avatars inside it are buttons
 * a keyboard reaches. On a phone the line breaks after "people", so each arc has the space after
 * its word to itself.
 */
export function Title({ onPress }: { onPress?: OnPress }) {
  return (
    <h1 id="site-title" className="t-display" aria-label={TITLE_TEXT}>
      {TITLE.before}{' '}
      <span className="site-h1-word">
        {TITLE.people}
        <AvatarStack kind="people" {...(onPress === undefined ? {} : { onPress })} />
      </span>
      <br className="site-h1-br" /> {TITLE.and}{' '}
      <span className="site-h1-word">
        {TITLE.agents}
        <AvatarStack kind="agents" {...(onPress === undefined ? {} : { onPress })} />
      </span>
    </h1>
  );
}
