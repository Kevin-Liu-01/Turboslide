import { useState } from 'react';

import type { Finding } from '@turboslide/schema/findings';
import type { BlockId, SlideId } from '@turboslide/schema/ids';

import type { EditorDispatch } from './dispatch';
import { cn } from './lib/cn';
import { ToolButton } from './ToolButton';
import { tipProps } from './Tooltip';

import './LintPanel.css';

/**
 * This slide's findings from the same linter the CLI runs (SPEC 6.5): one ruled row per finding
 * with its severity, rule id, block and proposal. A click selects the block; Fix, where the
 * finding carries `fix`, applies exactly those mutations through one slide.update with the
 * current baseRevision (SPEC 7.1), the same mutations `turboslide fix` would apply. Severity 3
 * shows in ink, 1 and 2 in titanium; semantic hues never appear in chrome (SPEC 2.2).
 */
export type LintPanelProps = {
  findings: ReadonlyArray<Finding>;
  slideId: SlideId;
  revision: number;
  dispatch: EditorDispatch;
  selectedBlockId?: BlockId;
  onSelectBlock?: (blockId: BlockId | undefined) => void;
  /** inside the inspector: no head of its own */
  embedded?: boolean;
  /**
   * Check slides (gslides-parity SPEC 2.8, 12 "Panels"): one row per finding in prose with Fix
   * where a fix exists and nothing else; the rule ids, severities, block ids and evidence stay off
   * the default view (the count is in the panel header)
   */
  suggestions?: boolean;
  className?: string;
};

const SEVERITY_WORD: Record<1 | 2 | 3, string> = { 3: 'must fix', 2: 'should fix', 1: 'polish' };

export function LintPanel({
  findings,
  slideId,
  revision,
  dispatch,
  selectedBlockId,
  onSelectBlock,
  embedded = false,
  suggestions = false,
  className,
}: LintPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rows = findings.filter((finding) => finding.slideId === slideId);
  const counts = { 3: 0, 2: 0, 1: 0 } as Record<1 | 2 | 3, number>;
  for (const finding of rows) counts[finding.severity] += 1;

  const fix = (finding: Finding) => {
    if (!finding.fix || finding.fix.length === 0 || busy !== null) return;
    setBusy(finding.id);
    setNotice(null);
    dispatch('slide.update', {
      slideId,
      baseRevision: revision,
      mutations: finding.fix,
    })
      .then(() => setNotice(suggestions ? 'Fixed' : `Fixed ${finding.rule}`))
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(null));
  };

  if (suggestions) {
    return (
      <div className={cn('ts-lint is-suggestions', className)} data-count={rows.length}>
        {notice ? (
          <p className="ts-lint-notice" role="status">
            {notice}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="ts-lint-empty">Nothing to suggest for this slide</p>
        ) : (
          <ul className="ts-lint-list">
            {rows.map((finding) => (
              <li
                key={finding.id}
                className={cn(
                  'ts-lint-row',
                  finding.blockId !== undefined &&
                    finding.blockId === selectedBlockId &&
                    'is-selected',
                )}
                data-severity={finding.severity}
                data-rule={finding.rule}
              >
                <button
                  type="button"
                  className="ts-lint-pick"
                  aria-label={finding.proposal}
                  data-control={`suggestion.${finding.id}`}
                  onClick={() => onSelectBlock?.(finding.blockId)}
                  {...tipProps({
                    name: finding.blockId ? 'Show me' : 'This slide',
                    doc: finding.blockId
                      ? 'Selects what the suggestion is about'
                      : 'A suggestion about the whole slide',
                  })}
                >
                  <span className="ts-lint-proposal">{finding.proposal}</span>
                </button>
                {finding.fix && finding.fix.length > 0 ? (
                  <ToolButton
                    label="Fix"
                    title="Fix"
                    doc="Applies the change; Undo brings the slide back"
                    ariaLabel={`Fix: ${finding.proposal}`}
                    className={cn('ts-lint-fix', busy === finding.id && 'is-busy')}
                    control={`suggestion.${finding.id}.fix`}
                    onClick={() => fix(finding)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className={cn('ts-lint', embedded && 'is-embedded', className)} data-count={rows.length}>
      {!embedded ? (
        <div className="ts-lint-head">
          <b>Lint</b>
          <span>
            {counts[3]} must fix, {counts[2]} should fix, {counts[1]} polish
          </span>
        </div>
      ) : null}
      {notice ? (
        <p className="ts-lint-notice" role="status">
          {notice}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="ts-lint-empty">No findings on this slide.</p>
      ) : (
        <ul className="ts-lint-list">
          {rows.map((finding) => (
            <li
              key={finding.id}
              className={cn(
                'ts-lint-row',
                finding.blockId !== undefined &&
                  finding.blockId === selectedBlockId &&
                  'is-selected',
              )}
              data-severity={finding.severity}
              data-rule={finding.rule}
            >
              <button
                type="button"
                className="ts-lint-pick"
                aria-label={`${finding.rule} on ${finding.blockId ?? slideId}: ${finding.proposal}`}
                data-control={`lint.${finding.id}`}
                onClick={() => onSelectBlock?.(finding.blockId)}
                {...tipProps({
                  name: finding.rule,
                  doc: `${finding.proposal} Severity ${finding.severity}, ${SEVERITY_WORD[finding.severity]}; ${finding.blockId ? `click selects block ${finding.blockId}` : 'a slide-level finding'}.`,
                })}
              >
                <span className="ts-lint-sev" aria-label={SEVERITY_WORD[finding.severity]}>
                  {finding.severity}
                </span>
                <span className="ts-lint-rule">{finding.rule}</span>
                {finding.blockId ? <span className="ts-lint-block">{finding.blockId}</span> : null}
                {finding.theme ? <span className="ts-lint-theme">{finding.theme}</span> : null}
                <span className="ts-lint-proposal">{finding.proposal}</span>
                {finding.evidence.text ? (
                  <span className="ts-lint-evidence">{finding.evidence.text}</span>
                ) : null}
              </button>
              {finding.fix && finding.fix.length > 0 ? (
                <ToolButton
                  label="Fix"
                  title="Fix"
                  doc={`Applies the mechanical fix for ${finding.rule} through one slide.update, the same mutations turboslide fix writes.`}
                  ariaLabel={`Fix ${finding.rule} on ${finding.blockId ?? slideId}`}
                  className={cn('ts-lint-fix', busy === finding.id && 'is-busy')}
                  control={`lint.${finding.id}.fix`}
                  onClick={() => fix(finding)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
