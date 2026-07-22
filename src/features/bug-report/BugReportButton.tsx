import React from 'react';
import { Bug } from 'lucide-react';
import { openBugReport } from './openBugReport';
import type { BugReportSurface } from './bugReportContext';

interface BugReportButtonProps {
  /** Where this button lives. Travels with the report — see `bugReportContext`. */
  surface: BugReportSurface;
  /** Drop the text label and show only the icon. For tight headers. */
  iconOnly?: boolean;
  className?: string;
}

/**
 * "Report a bug" — opens Sentry's feedback form with the current game state
 * attached.
 *
 * Deliberately thin: it knows where it is and nothing else. Everything about
 * what a report *is* lives in `openBugReport`, so adding this to a new surface
 * can't produce a report that's missing context.
 */
export const BugReportButton: React.FC<BugReportButtonProps> = ({
  surface,
  iconOnly = false,
  className,
}) => {
  const label = 'Report a bug';

  return (
    <button
      type="button"
      className={className}
      data-testid={`bug-report-${surface}`}
      onClick={() => {
        void openBugReport(surface);
      }}
      aria-label={label}
      title={label}
    >
      <Bug size={16} aria-hidden="true" />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
};
