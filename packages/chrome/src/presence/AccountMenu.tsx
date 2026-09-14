import type { EditorAccount, IdentityView } from '../editor-shell';
import { cn } from '../lib/cn';
import type { MenuCloseReason } from '../Menu';
import { isPresent, itemById } from '../menus/model';
import type { MenuContext, MenuItem } from '../menus/model';
import { ACCOUNT } from '../menus/strings';
import { tipProps } from '../Tooltip';
import { IdentityChip } from './IdentityChip';
import { PlateMenu } from './PlateMenu';

/**
 * The own chip's menu (gslides-parity SPEC-3 0.21, 7.5, 13.1): the one place accounts appear. A
 * sentence first ("Signed in as kevin@…" or "Not signed in"), then the rows of the model's
 * `title.account` (Change name, Change avatar, Sign in or Sign out, Forget this browser,
 * Sessions), each present only when its predicate says so (no Sign in row without a database,
 * 7.3). The rows run through the shell's `runItem`, so a dialog row opens its dialog and an action
 * row its action.
 */
export type AccountMenuProps = {
  anchor: HTMLElement;
  identity: IdentityView;
  account: EditorAccount | undefined;
  context: MenuContext;
  runItem: (item: MenuItem, anchor?: HTMLElement | null) => void;
  onClose: (reason: MenuCloseReason) => void;
  returnFocusTo?: HTMLElement | null;
};

export function AccountMenu({
  anchor,
  identity,
  account,
  context,
  runItem,
  onClose,
  returnFocusTo,
}: AccountMenuProps) {
  const rows = (itemById('title.account').items ?? []).filter((item) => isPresent(item, context));
  const sentence =
    account?.signedIn === true && identity.email !== undefined
      ? ACCOUNT.signedInAs(identity.email)
      : ACCOUNT.notSignedIn;
  return (
    <PlateMenu
      anchor={anchor}
      label={ACCOUNT.account}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      id="ts-menu-account"
      control="account.menu"
      className="ts-account-menu"
      header={
        <div className="ts-account-head" data-control="account.sentence">
          <IdentityChip identity={identity} size={24} self />
          <span className="ts-account-words">
            <span className="ts-account-name">{identity.name ?? identity.label}</span>
            <span className="ts-account-sentence">{sentence}</span>
          </span>
        </div>
      }
    >
      {rows.map((item, index) => (
        <span key={item.id} className="ts-account-row-wrap">
          {item.dividerBefore === true && index > 0 ? (
            <span className="ts-menu-divider" role="separator" />
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={cn('ts-roster-row', 'is-plain')}
            data-control={`account.${item.id.slice('title.account.'.length)}`}
            data-menu-item={item.id}
            onClick={(event) => {
              onClose('select');
              runItem(item, event.currentTarget);
            }}
            {...tipProps({
              name: item.label,
              ...(item.doc === undefined ? {} : { doc: item.doc }),
            })}
          >
            <span className="ts-roster-name">{item.label}</span>
          </button>
        </span>
      ))}
    </PlateMenu>
  );
}
