import { AvatarStack } from './AvatarStack';
import type { OnPress } from './AvatarStack';
import { TITLE, TITLE_TEXT } from './copy';

/**
 * The landing's h1, "Presentations for people and agents" (docs/SITE.md B), set on two lines that
 * each end with their group (Kevin, 2026-10-30: "fix the 4 people/agents thing ... maybe we need a
 * better title header"): the people's faces after "people", the agents' marks after "agents". Each
 * word and its row of avatars break as one, so a row never leaves its word, and the rows sit in
 * the line's flow at the end of their line, so they cover no letter and need no measuring. The
 * heading is named by the sentence alone (its `aria-label`; its text content is the sentence too,
 * since the portraits and the marks are svg), and the avatars inside it are buttons a keyboard
 * reaches. On a phone "Presentations for" takes the first line of three.
 */
export function Title({ onPress }: { onPress?: OnPress }) {
  const press = onPress === undefined ? {} : { onPress };
  return (
    <h1 id="site-title" className="t-display" aria-label={TITLE_TEXT}>
      {TITLE.before}{' '}
      <span className="site-h1-group">
        <span className="site-h1-word">{TITLE.people}</span>
        <AvatarStack kind="people" {...press} />
      </span>
      <br /> {TITLE.and}{' '}
      <span className="site-h1-group">
        <span className="site-h1-word">{TITLE.agents}</span>
        <AvatarStack kind="agents" {...press} />
      </span>
    </h1>
  );
}
