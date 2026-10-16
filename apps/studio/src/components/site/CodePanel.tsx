/**
 * A code panel of the site pages: commands on the #101010 panel of the landing's recorded run
 * (site.css `.site-term`), each line after a prompt, with the panel's label and a caption.
 */
export function CodePanel({
  label,
  lines,
  caption,
}: {
  label: string;
  lines: readonly string[];
  caption: string;
}) {
  return (
    <figure className="site-crop site-code">
      <div className="site-term">
        <div className="site-term-head">
          <span className="t-label">{label}</span>
        </div>
        <pre>
          <code>
            {lines.map((line) => (
              <span key={line} className="site-ln is-cmd">
                <span className="site-ps" aria-hidden="true">
                  ${' '}
                </span>
                {line}
              </span>
            ))}
          </code>
        </pre>
      </div>
      <figcaption className="t-small">{caption}</figcaption>
    </figure>
  );
}
