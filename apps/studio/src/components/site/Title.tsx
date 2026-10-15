import { AvatarStack } from './AvatarStack';
import { TITLE } from './copy';

/**
 * The landing's h1, "Presentations for people and agents" (docs/SITE.md B), with the people's
 * stack at the top right of "people" and the agents' stack at the top right of "agents". Each
 * stack sits in a no-wrap run with its word, so it stays on its word's line at every width. The
 * heading's text content is the sentence alone: the initials are CSS and the marks are svg.
 */
export function Title() {
  return (
    <h1 id="site-title" className="t-display">
      {TITLE.before}{' '}
      <span className="site-h1-word">
        {TITLE.people}
        <AvatarStack kind="people" />
      </span>{' '}
      {TITLE.and}{' '}
      <span className="site-h1-word">
        {TITLE.agents}
        <AvatarStack kind="agents" />
      </span>
    </h1>
  );
}
