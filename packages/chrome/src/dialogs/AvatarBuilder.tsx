import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { MarkSpec } from '@turboslide/identity/marks';

import { Dialog, DialogTabs } from '../Dialog';
import { useEditorShell } from '../editor-shell-context';
import type { IdentityView } from '../editor-shell';
import { cn } from '../lib/cn';
import { ACCOUNT, REFUSALS } from '../menus/strings';
import { markOf } from '../presence/IdentityChip';
import { initialsFontSize, markCells, plateOf } from '../presence/mark-svg';
import { tipProps } from '../Tooltip';

import './accounts.css';

/**
 * The avatar builder (gslides-parity SPEC-3 0.22, 7.6; research 03 I3, 11 8 P8): one 560 by 640
 * dialog with four tabs in the order a person wants them, Initials, Glyph, Dither, Picture, each
 * showing the result at 24, 32, 64 and 256 px in light and dark chrome in a fixed 2 by 4 preview
 * strip from first paint; the panel body 320 px for every tab. Initials takes one or two letters
 * of the display name and lets a person retype them; Glyph and Dither offer "Another", which
 * rerolls a salt kept on the principal record; Picture is signed in principals' alone and reads
 * "Sign in to upload a picture" otherwise (the sentence, not a refusal at the quota); the picture
 * path crops in the browser in a 256 by 256 box and hands the file to `account.setAvatar`, which
 * runs sharp on the server. Apply writes the choice as one small document.
 */
type Tab = 'initials' | 'glyph' | 'dither' | 'picture';
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'initials', label: ACCOUNT.avatar.tabs[0] },
  { value: 'glyph', label: ACCOUNT.avatar.tabs[1] },
  { value: 'dither', label: ACCOUNT.avatar.tabs[2] },
  { value: 'picture', label: ACCOUNT.avatar.tabs[3] },
];
const SIZES = [24, 32, 64, 256] as const;

/** A random 31 bit salt for "Another". */
export function rerollSalt(random: () => number = Math.random): number {
  return Math.floor(random() * 0x7fffffff);
}

/** The mark at a preview size: the 24 px grid scaled up by a whole factor so the cells stay crisp. */
function Preview({
  spec,
  size,
  dark,
  pictureUrl,
}: {
  spec: MarkSpec;
  size: number;
  dark: boolean;
  pictureUrl?: string;
}) {
  const base = 24;
  const plate = plateOf(base);
  const scale = size / base;
  const cells = markCells(spec, base);
  const style: CSSProperties = { width: size, height: size };
  return (
    <span
      className={cn('ts-avatar-cell', dark && 'is-dark')}
      style={style}
      data-size={size}
      aria-hidden="true"
    >
      <span className={cn('ts-chip', 'is-self')} style={{ width: size, height: size }}>
        {spec.variant === 'picture' && pictureUrl !== undefined ? (
          <img
            src={pictureUrl}
            alt=""
            width={size - 2}
            height={size - 2}
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <svg
            viewBox={`0 0 ${plate} ${plate}`}
            width={size - 2}
            height={size - 2}
            shapeRendering="crispEdges"
            className="ts-chip-plate"
          >
            {cells.map((cell, i) => (
              <rect key={i} x={cell.x} y={cell.y} width={cell.w} height={cell.h} />
            ))}
            {spec.variant === 'initials' && spec.initials !== '' ? (
              <text
                className="ts-chip-initials"
                x={plate / 2}
                y={plate / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={initialsFontSize(24)}
              >
                {spec.initials}
              </text>
            ) : null}
          </svg>
        )}
      </span>
      <span hidden>{scale}</span>
    </span>
  );
}

export function AvatarBuilderDialog() {
  const shell = useEditorShell();
  const account = shell.input.account;
  const identity: IdentityView | undefined = account?.principal;
  const current = account?.avatar;
  const [tab, setTab] = useState<Tab>(current?.variant ?? 'initials');
  const [initials, setInitials] = useState(current?.initials ?? '');
  const [salt, setSalt] = useState<number>(Number(current?.salt ?? 0));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const objectUrl = useRef<string | null>(null);
  const signedIn = account?.signedIn === true;

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  const spec: MarkSpec | null =
    identity === undefined
      ? null
      : {
          ...markOf({ ...identity, mark: undefined }, { self: true }),
          variant:
            tab === 'picture'
              ? preview !== null || account?.pictureUrl !== undefined
                ? 'picture'
                : 'initials'
              : tab,
          initials:
            tab === 'initials'
              ? initials.trim() !== ''
                ? [...initials.trim()].slice(0, 2).join('').toUpperCase()
                : markOf({ ...identity, mark: undefined }).initials
              : '',
          glyphSeed: (markOf({ ...identity, mark: undefined }).glyphSeed ^ (salt >>> 0)) >>> 0,
        };

  const pick = (chosen: File | null) => {
    setError(null);
    if (!chosen) return;
    if (chosen.size > 5 * 1024 * 1024) {
      setError(ACCOUNT.avatar.tooLarge);
      return;
    }
    if (!/^image\/(png|jpeg|webp|gif)$/.test(chosen.type)) {
      setError('JPEG, PNG, WebP or GIF');
      return;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(chosen);
    setPreview(objectUrl.current);
    setFile(chosen);
  };

  const apply = () => {
    if (busy || !account?.setAvatar) {
      shell.closeDialog();
      return;
    }
    setBusy(true);
    const choice =
      tab === 'initials'
        ? {
            variant: 'initials' as const,
            ...(initials.trim() === '' ? {} : { initials: initials.trim() }),
          }
        : tab === 'picture'
          ? { variant: 'picture' as const, ...(file === null ? {} : { picture: file }) }
          : { variant: tab, salt: String(salt) };
    account
      .setAvatar(choice)
      .then(() => shell.closeDialog())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      title={ACCOUNT.avatar.title}
      onClose={shell.closeDialog}
      width={560}
      control="dialog.avatarBuilder"
      className="ts-avatar-builder"
      cancel
      actions={[
        {
          label: ACCOUNT.avatar.apply,
          primary: true,
          disabled: busy || (tab === 'picture' && !signedIn),
          onClick: apply,
          control: 'dialog.avatarBuilder.apply',
          doc: 'Keeps this mark on every surface that shows you',
        },
      ]}
    >
      <DialogTabs tabs={TABS} value={tab} onChange={setTab} control="dialog.avatarBuilder.tab" />
      <div className="ts-avatar-strip" data-control="dialog.avatarBuilder.strip">
        {[false, true].map((dark) =>
          SIZES.map((size) => (
            <span key={`${dark ? 'dark' : 'light'}:${size}`}>
              {spec ? (
                <Preview
                  spec={spec}
                  size={size}
                  dark={dark}
                  pictureUrl={preview ?? account?.pictureUrl}
                />
              ) : (
                <span className="ts-avatar-cell" style={{ width: size, height: size }} />
              )}
            </span>
          )),
        )}
      </div>
      <div className="ts-avatar-panel" data-control={`dialog.avatarBuilder.panel.${tab}`}>
        {tab === 'initials' ? (
          <label className="ts-dialog-field">
            <span className="ts-dialog-field-label">{ACCOUNT.avatar.initials}</span>
            <input
              type="text"
              value={initials}
              maxLength={2}
              placeholder={spec?.initials ?? ''}
              aria-label={ACCOUNT.avatar.initials}
              data-control="dialog.avatarBuilder.initials"
              autoComplete="off"
              onChange={(event) => setInitials(event.target.value)}
              {...tipProps({
                name: ACCOUNT.avatar.initials,
                doc: 'One or two letters; empty takes them from your name',
              })}
            />
          </label>
        ) : null}
        {tab === 'glyph' || tab === 'dither' ? (
          <button
            type="button"
            className="pt-ib"
            data-control="dialog.avatarBuilder.another"
            onClick={() => setSalt(rerollSalt())}
            {...tipProps({
              name: ACCOUNT.avatar.another,
              doc: 'A new pattern; the one you keep stays the same afterwards',
            })}
          >
            <span className="pt-lb">{ACCOUNT.avatar.another}</span>
          </button>
        ) : null}
        {tab === 'picture' ? (
          signedIn ? (
            <>
              <label
                className="pt-ib ts-avatar-upload"
                {...tipProps({
                  name: ACCOUNT.avatar.upload,
                  doc: `JPEG, PNG, WebP or GIF; ${ACCOUNT.avatar.tooLarge}`,
                })}
              >
                <span className="pt-lb">{ACCOUNT.avatar.upload}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  data-control="dialog.avatarBuilder.file"
                  onChange={(event) => pick(event.target.files?.[0] ?? null)}
                />
              </label>
              <div className="ts-avatar-crop" data-control="dialog.avatarBuilder.crop">
                {preview !== null ? (
                  <img
                    src={preview}
                    alt=""
                    style={{ width: 256, height: 256, objectFit: 'cover' }}
                  />
                ) : null}
              </div>
              <p className="ts-avatar-sentence">
                {preview === null ? ACCOUNT.avatar.tooLarge : ACCOUNT.avatar.crop}
              </p>
            </>
          ) : (
            <p className="ts-avatar-sentence" data-control="dialog.avatarBuilder.signInSentence">
              {REFUSALS.signInToUpload}
            </p>
          )
        ) : null}
      </div>
      <p className="ts-dialog-error-row" role="alert" data-control="dialog.avatarBuilder.error">
        {error ?? ''}
      </p>
    </Dialog>
  );
}
