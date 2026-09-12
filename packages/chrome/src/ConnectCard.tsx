import { useState } from 'react';

import './ConnectCard.css';

/**
 * The Connect card on /decks (docs/deck-transfer.md; Kevin's directive of 2026-09-11: connect the
 * local slides with the app). It names the two CLI commands that move a deck between a checkout
 * and this studio, `turboslide deck push` and `deck pull`, with the deployment's URL filled in,
 * a Copy button per command, and the token note when the deployment requires a bearer. The card
 * is a ruled block in the deck list's grammar (SPEC 2.2 line law: one --pt-hair frame, rows ruled
 * with --pt-hair-soft); the buttons are the shell's .pt-ib text buttons with tooltips naming what
 * they do. Presentational: the route hands in the facts.
 */
export type ConnectCardProps = {
  /** the origin the studio is reached at, such as https://turboslide.vercel.app */
  url: string;
  /** TURBOSLIDE_TOKEN is set on the deployment, so the first push or pull passes --token */
  tokenRequired: boolean;
  /** the deck id the commands name; `<deck-id>` when absent */
  deckId?: string;
  className?: string;
};

type Copied = 'push' | 'pull' | null;

/** The two commands, with the URL and the token flag filled in. */
export function connectCommands(
  url: string,
  deckId: string,
  tokenRequired: boolean,
): { push: string; pull: string } {
  const token = tokenRequired ? ' --token <TURBOSLIDE_TOKEN>' : '';
  return {
    push: `turboslide deck push ${deckId} --to ${url}${token}`,
    pull: `turboslide deck pull ${deckId} --from ${url}${token}`,
  };
}

export function ConnectCard({ url, tokenRequired, deckId, className }: ConnectCardProps) {
  const [copied, setCopied] = useState<Copied>(null);
  const [failed, setFailed] = useState(false);
  const commands = connectCommands(url, deckId ?? '<deck-id>', tokenRequired);

  const copy = async (which: Exclude<Copied, null>) => {
    try {
      await navigator.clipboard.writeText(commands[which]);
      setFailed(false);
      setCopied(which);
      window.setTimeout(() => setCopied((current) => (current === which ? null : current)), 1600);
    } catch {
      // no clipboard (an insecure context, or permission refused): the command stays selectable
      setFailed(true);
    }
  };

  return (
    <section
      className={['ts-connect', className ?? ''].filter(Boolean).join(' ')}
      aria-labelledby="ts-connect-title"
      data-control="connect.card"
    >
      <h2 id="ts-connect-title" className="ts-connect-title">
        Connect a checkout
      </h2>
      <p className="ts-connect-lead">
        The <code>turboslide</code> CLI moves a deck between a checkout and this studio as one
        bundle (deck.json, slides, assets, versions). Push a local deck here to edit it in the
        browser; pull a deck from here to edit it locally.
      </p>
      <ul className="ts-connect-rows">
        <li className="ts-connect-row" data-command="push">
          <span className="ts-connect-what">Push a local deck to this studio</span>
          <code className="ts-connect-cmd" data-control="connect.push">
            {commands.push}
          </code>
          <button
            type="button"
            className="pt-ib is-text"
            title="Copy the push command to the clipboard"
            aria-label="Copy the push command"
            data-control="connect.copy.push"
            onClick={() => void copy('push')}
          >
            <span className="pt-lb">{copied === 'push' ? 'Copied' : 'Copy'}</span>
          </button>
        </li>
        <li className="ts-connect-row" data-command="pull">
          <span className="ts-connect-what">Pull a deck from this studio into decks/</span>
          <code className="ts-connect-cmd" data-control="connect.pull">
            {commands.pull}
          </code>
          <button
            type="button"
            className="pt-ib is-text"
            title="Copy the pull command to the clipboard"
            aria-label="Copy the pull command"
            data-control="connect.copy.pull"
            onClick={() => void copy('pull')}
          >
            <span className="pt-lb">{copied === 'pull' ? 'Copied' : 'Copy'}</span>
          </button>
        </li>
      </ul>
      <p className="ts-connect-note" data-control="connect.note">
        {tokenRequired
          ? 'This deployment requires its bearer token (TURBOSLIDE_TOKEN). Pass --token once; the CLI keeps it in ~/.config/turboslide/hosts.json and reads it back on the next call.'
          : 'This studio has no bearer token set, so the commands need no --token from localhost; a deployed studio requires one.'}{' '}
        A taken id gets a free sibling unless --replace is passed; --as names another id. The same
        bundles move through the Upload and Download buttons on this page.
        {failed ? ' The clipboard is not available here; select the command and copy it.' : ''}
      </p>
    </section>
  );
}
