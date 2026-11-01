import { AvatarStack } from './AvatarStack';
import type { OnPress } from './AvatarStack';
import { TITLE, TITLE_TEXT } from './copy';

/**
 * The landing's h1, "Presentations for people and agents" (docs/SITE.md B), set on two lines that
 * each end with their group (Kevin, 2026-10-30: "fix the 4 people/agents thing ... maybe we need a
 * better title header"): the people's pointers after "people", the agents' marks after "agents"
 * (AvatarStack.tsx). Each word and its row break as one, so a row never leaves its word, and the
 * rows sit in the line's flow at the end of their line, so they cover no letter and need no
 * measuring. The heading is named by the sentence alone (its `aria-label`; its text content is the
 * sentence too, since the pointers and the marks are svg), and the figures inside it are buttons a
 * keyboard reaches. The two words take two Katagami faces beside the title's Katagami Text (Kevin,
 * 2026-10-31 and 2026-11-01): "people" Katagami Sans and "agents" Katagami Mono, the face of an
 * agent's flag. On a phone "Presentations for" takes the first line of three.
 */
export function Title({ onPress }: { onPress?: OnPress }) {
  const press = onPress === undefined ? {} : { onPress };
  return (
    <h1 id="site-title" className="t-display" aria-label={TITLE_TEXT}>
      {TITLE.before}{' '}
      <span className="site-h1-group">
        <span className="site-h1-word" data-word="people">
          {TITLE.people}
        </span>
        <AvatarStack kind="people" {...press} />
      </span>
      <br /> {TITLE.and}{' '}
      <span className="site-h1-group">
        <span className="site-h1-word" data-word="agents">
          {TITLE.agents}
        </span>
        <AvatarStack kind="agents" {...press} />
      </span>
    </h1>
  );
}
