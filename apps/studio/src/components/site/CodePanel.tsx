import { codeRuns } from './code-runs';

/**
 * A code panel of the site pages: commands on the #101010 panel of the landing's recorded run
 * (site.css `.site-term`), each line after a prompt. A narrow panel wraps a line between its runs (code-runs.ts), so a flag stays with its value.
 */
export function CodePanel({ lines }: { lines: readonly string[] }) {
  return (
    <figure className="site-crop site-code">
      <div className="site-term">
        <pre>
          <code>
            {lines.map((line) => (
              <span key={line} className="site-ln is-cmd">
                <span className="site-ps" aria-hidden="true">
                  ${' '}
                </span>
                {codeRuns(line).map((run, at) =>
                  run.keep ? (
                    <span key={at} className="site-nw">
                      {run.text}
                    </span>
                  ) : (
                    run.text
                  ),
                )}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </figure>
  );
}
