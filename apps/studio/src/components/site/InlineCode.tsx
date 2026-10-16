import { Fragment } from 'react';

/**
 * A sentence of the site pages with its inline code (pages-copy.ts): the runs between backticks
 * are drawn as `code`, the rest as text. `plainText` gives the same sentence without the
 * backticks, for the structured data.
 */
export function InlineCode({ text }: { text: string }) {
  return (
    <>
      {text
        .split('`')
        .map((run, i) =>
          i % 2 === 1 ? (
            <code key={`${i}-${run}`}>{run}</code>
          ) : (
            <Fragment key={`${i}-${run}`}>{run}</Fragment>
          ),
        )}
    </>
  );
}

export function plainText(text: string): string {
  return text.replaceAll('`', '');
}
