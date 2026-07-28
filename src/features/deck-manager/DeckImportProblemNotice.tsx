import React, { useEffect, useRef } from 'react';
import { DeckImportProblem } from './url-import';

/**
 * A deck-link failure, as the player reads it: one sentence about what happened,
 * then the things worth trying.
 *
 * The fixes are the reason this is a component rather than another line in the
 * existing error list. Every one of these failures used to arrive as a single
 * sentence with no way forward, and the only move a player had left was to paste
 * the same link again — which, for a private deck or a deleted one, fails
 * identically forever. In #174 two players did exactly that three times each and
 * gave up on the feature. What they needed was two lines further down: make the
 * deck public, or paste the list as text.
 *
 * Which is why the heading is "What to try" rather than "Errors". The sentence
 * is the smaller half of this box.
 */
export function DeckImportProblemNotice({ problem }: { problem: DeckImportProblem }) {
  const notice = useRef<HTMLDivElement>(null);

  /**
   * Bring the notice into view when it appears.
   *
   * The dialog's body scrolls, and a pasted link sits above a 15-row textarea —
   * so on an ordinary window this box lands below the fold and the player's
   * whole experience is a link that quietly did nothing. An explanation nobody
   * scrolls to is not an explanation.
   *
   * Keyed on the problem itself, so a second failed link scrolls again rather
   * than only the first one being seen.
   */
  useEffect(() => {
    notice.current?.scrollIntoView?.({ block: 'nearest' });
  }, [problem]);

  return (
    <div
      ref={notice}
      className="error-container"
      data-testid="deck-import-problem"
      data-reason={problem.reason}
    >
      <h4>Couldn't import that deck</h4>
      <p className="error-message">{problem.message}</p>

      {problem.fixes.length > 0 && (
        <>
          <p className="error-fixes-heading">What to try:</p>
          <ul className="error-fixes">
            {problem.fixes.map((fix) => (
              <li key={fix}>{fix}</li>
            ))}
          </ul>
        </>
      )}

      {/* Last, and small. Useful to quote in a bug report; useless as the thing
          a player has to read first, which is what a bare status code was. */}
      {problem.detail !== undefined && <p className="error-detail">{problem.detail}</p>}
    </div>
  );
}
