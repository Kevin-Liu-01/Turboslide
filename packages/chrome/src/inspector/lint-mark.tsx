import type { Severity } from '@turboslide/schema/findings';

import { Icon } from '../icons';
import { tipProps } from '../Tooltip';

import './lint-mark.css';

/**
 * The lint mark beside a control (Kevin, 2026-09-11: the weight cap and the off-palette color
 * are "a lint mark when exceeded", not a hard block). A 16px chip in titanium (ink at severity
 * 3) with the exclamation glyph, named by the rule id, carrying a tooltip with the rule, the
 * severity word and the proposal. Semantic hues never appear in chrome (SPEC 2.2): the mark
 * reads by weight, not by color. Static, so a control can raise it from its own value before the
 * linter has run, and the Inspector raises it from the slide's findings for the control's path.
 */
export type LintMarkProps = {
  rule: string;
  severity: Severity;
  /** the finding's proposal, or the control's own sentence */
  proposal: string;
  className?: string;
};

const SEVERITY_WORD: Record<Severity, string> = { 3: 'must fix', 2: 'should fix', 1: 'polish' };

export function LintMark({ rule, severity, proposal, className }: LintMarkProps) {
  return (
    <span
      className={['ts-lint-mark', className ?? ''].filter(Boolean).join(' ')}
      data-severity={severity}
      data-rule={rule}
      role="img"
      aria-label={`${rule}, ${SEVERITY_WORD[severity]}: ${proposal}`}
      tabIndex={0}
      {...tipProps({
        name: rule,
        doc: `${proposal} Severity ${severity}, ${SEVERITY_WORD[severity]}.`,
      })}
    >
      <Icon name="exclamation" size={14} />
    </span>
  );
}
