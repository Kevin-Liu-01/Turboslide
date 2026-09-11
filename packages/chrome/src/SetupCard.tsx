import './SetupCard.css';

/**
 * The Google Slides setup card (SPEC 8.3): what the Export menu opens when the server reports no
 * credentials. The exact steps, in order, from the Google Cloud project to the environment
 * variable the studio and the CLI read, with the one scope the exporter asks for (drive.file,
 * non-sensitive: it covers presentations.create, batchUpdate and getThumbnail on files the app
 * created). Click anywhere on the scrim closes it; Escape is the route's.
 */
export type SetupCardProps = {
  /** the environment variable the server reads */
  variable: string;
  onClose: () => void;
  /** a line for the toast after the copy */
  onNotice?: (message: string) => void;
};

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** The steps as data, so a test and the card read one list. */
export const GOOGLE_SETUP_STEPS: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: 'Create or pick a Google Cloud project',
    detail: 'console.cloud.google.com, the project selector, New project.',
  },
  {
    title: 'Enable the Google Slides API and the Google Drive API',
    detail: 'APIs and services, Library: enable both in that project.',
  },
  {
    title: 'Create an OAuth client',
    detail:
      'APIs and services, Credentials, Create credentials, OAuth client ID, application type Desktop app. Add your Google account as a test user on the consent screen while the app is in testing.',
  },
  {
    title: 'Download the client JSON',
    detail:
      'The Download JSON button on the client. Keep it outside the repository, for example ~/.config/turboslide/credentials.json.',
  },
  {
    title: 'Point Turboslide at the file',
    detail:
      'Set the variable below for the studio process and for the CLI. The first run opens the consent page in a browser and stores the refreshed token beside the credentials file.',
  },
  {
    title: 'The one scope',
    detail: `${GOOGLE_SCOPE}: non-sensitive, files the app created only; it covers presentations.create, batchUpdate and pages.getThumbnail (SPEC 8.3).`,
  },
];

export function SetupCard({ variable, onClose, onNotice }: SetupCardProps) {
  const line = `export ${variable}=$HOME/.config/turboslide/credentials.json`;
  const copy = () => {
    navigator.clipboard
      .writeText(line)
      .then(() => onNotice?.('Copied the export line'))
      .catch(() => onNotice?.(line));
  };
  return (
    <div className="ts-setup ts-chrome" role="presentation" onClick={onClose}>
      <div
        className="ts-setup-card"
        role="dialog"
        aria-modal="true"
        aria-label="Set up Google Slides export"
        data-control="export.setup"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Set up Google Slides export</h3>
        <p className="ts-setup-lead">
          {`The server reads ${variable}. It is not set, so export.run with format gslides is not offered until it names a credentials file.`}
        </p>
        <ol className="ts-setup-steps">
          {GOOGLE_SETUP_STEPS.map((step) => (
            <li key={step.title}>
              <b>{step.title}</b>
              <span>{step.detail}</span>
            </li>
          ))}
        </ol>
        <div className="ts-setup-line">
          <code>{line}</code>
          <button
            type="button"
            className="pt-ib is-text"
            title="Copy the export line"
            data-control="export.setup.copy"
            onClick={copy}
          >
            <span className="pt-lb">Copy</span>
          </button>
        </div>
        <div className="ts-setup-actions">
          <button
            type="button"
            className="pt-ib is-text"
            title="Close"
            data-control="export.setup.close"
            onClick={onClose}
          >
            <span className="pt-lb">Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
