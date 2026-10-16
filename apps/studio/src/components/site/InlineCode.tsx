import { Fragment } from 'react';

import { KEEP, codeRuns } from './code-runs';

/**
 * A sentence of the site pages with its inline code (pages-copy.ts): the runs between backticks
 * are drawn as `code`, the rest as text. Code of 24 characters or fewer stays on one line
 * (`is-short`); in longer code a flag stays with its value and each other short word stays whole
 * (`site-keep`, code-runs.ts), so a line never ends after a flag's hyphens. `plainText` gives the
 * same sentence without the backticks, for the structured data.
 */
export function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text
        .split('`')
        .map((run, i) =>
          i % 2 === 1 ? (
            <Code key={`${i}-${run}`} code={run} />
          ) : (
            <Fragment key={`${i}-${run}`}>{run}</Fragment>
          ),
        )}
    </>
  );
}

function Code({ code }: { code: string }) {
  if (code.length <= KEEP) return <code className="is-short">{code}</code>;
  return (
    <code>
      {codeRuns(code).map((run, at) =>
        run.keep ? (
          <span key={at} className="site-keep">
            {run.text}
          </span>
        ) : (
          run.text
        ),
      )}
    </code>
  );
}

export function plainText(text: string): string {
  return text.replaceAll('`', '');
}
