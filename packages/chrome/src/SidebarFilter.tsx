import type { KeyboardEvent, RefObject } from 'react';

import { Icon } from './icons';
import { cn } from './lib/cn';

import './SidebarFilter.css';

export type SidebarFilterProps = {
  value: string;
  onChange: (value: string) => void;
  /** the caller's keys: Escape clears, Enter opens the first match, Down arrow moves into the list */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** `Filter slides` */
  placeholder: string;
  /** the accessible name; the placeholder when absent */
  label?: string;
  /** `85 slides`: sits at the right end of the row in 12px titanium */
  count?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** extra classes on the row */
  className?: string;
};

/**
 * The filter row (directive 7.3): a search field with the magnifier, a
 * clear button while it holds text, and the route's count at the right end.
 * Controlled: the caller owns the query and its keys. Ported from
 * Prototemplate/src/components/viewer/SidebarFilter.tsx.
 */
export function SidebarFilter({
  value,
  onChange,
  onKeyDown,
  placeholder,
  label,
  count,
  inputRef,
  className,
}: SidebarFilterProps) {
  const clear = () => {
    onChange('');
    inputRef?.current?.focus({ preventScroll: true });
  };
  return (
    <div className={cn('pt-filter-row', className)}>
      <div className={cn('pt-filter', value && 'has-text')}>
        <label className="pt-filter-field">
          <Icon name="search" />
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={label ?? placeholder}
            data-control="sidebar.filter"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
          />
        </label>
        {value ? (
          <button
            type="button"
            className="pt-filter-clear"
            title="Clear the filter (Esc)"
            aria-label="Clear the filter"
            onClick={clear}
          >
            <Icon name="close" />
          </button>
        ) : null}
      </div>
      {count ? <span className="pt-filter-count">{count}</span> : null}
    </div>
  );
}
